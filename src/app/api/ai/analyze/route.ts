import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { analysisSchema, getAIProvider, structuredResumeSchema } from "@/lib/ai/provider";
import { completeAIUsage, releaseAIUsage, reserveAIUsage } from "@/lib/ai/quota";
import { getAuthenticatedUserId } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";

export const runtime = "nodejs";

const requestSchema = z.object({
  resumeId: z.string().uuid(),
  operationId: z.string().uuid(),
  jobDescription: z.string().min(20).max(100_000),
  targetCompany: z.string().trim().max(120).optional().default(""),
  targetRole: z.string().trim().max(120).optional().default(""),
  forceRefresh: z.boolean().optional().default(false),
});

function analysisFingerprint(input: {
  resumeText: string;
  jobDescription: string;
  targetCompany: string;
  targetRole: string;
}) {
  return createHash("sha256").update(JSON.stringify({
    version: "resume-optimization-v2",
    resumeText: input.resumeText,
    jobDescription: input.jobDescription.trim(),
    targetCompany: input.targetCompany.trim(),
    targetRole: input.targetRole.trim(),
  })).digest("hex");
}

export async function POST(request: Request) {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsedInput = requestSchema.safeParse(body);
  if (!parsedInput.success) {
    const invalidFields = [...new Set(parsedInput.error.issues.map((issue) => String(issue.path[0] || "request")))];
    const fieldLabels: Record<string, string> = {
      resumeId: "简历",
      operationId: "分析任务",
      jobDescription: "岗位 JD",
      targetCompany: "目标公司",
      targetRole: "岗位名称",
      request: "请求内容",
    };
    return NextResponse.json({
      error: `${invalidFields.map((field) => fieldLabels[field] || field).join("、")}信息不完整或格式不正确`,
      code: "INVALID_ANALYSIS_INPUT",
    }, { status: 400 });
  }

  let taskId = "";
  let runId = "";
  try {
    const input = parsedInput.data;
    const { data: resume, error: resumeError } = await supabase
      .from("resumes")
      .select("id,parsed_text,parse_status,structured_data")
      .eq("id", input.resumeId)
      .eq("user_id", userId)
      .single();
    if (resumeError || !resume) return NextResponse.json({ error: "简历不存在或无权访问" }, { status: 404 });
    if (resume.parse_status !== "ready" || !resume.parsed_text) return NextResponse.json({ error: "简历尚未解析完成" }, { status: 409 });

    const fingerprint = analysisFingerprint({
      resumeText: resume.parsed_text,
      jobDescription: input.jobDescription,
      targetCompany: input.targetCompany,
      targetRole: input.targetRole,
    });

    let reservation = await reserveAIUsage(supabase, {
      kind: "resume_optimization",
      operationKey: input.operationId,
      inputFingerprint: fingerprint,
      forceNew: input.forceRefresh,
    });

    if (reservation.cached && reservation.resultRunId) {
      const { data: cachedRun } = await supabase.from("ai_runs")
        .select("id,output")
        .eq("id", reservation.resultRunId)
        .eq("user_id", userId)
        .eq("kind", "job_match")
        .eq("status", "completed")
        .maybeSingle();
      const cachedAnalysis = analysisSchema.safeParse(cachedRun?.output);
      const cachedStructured = structuredResumeSchema.safeParse(resume.structured_data);
      if (cachedRun && cachedAnalysis.success) {
        return NextResponse.json({
          ...cachedAnalysis.data,
          runId: cachedRun.id,
          structured: cachedStructured.success ? cachedStructured.data : null,
          cached: true,
          quota: reservation.quota,
        });
      }
      reservation = await reserveAIUsage(supabase, {
        kind: "resume_optimization",
        operationKey: input.operationId,
        inputFingerprint: fingerprint,
        forceNew: true,
      });
    }

    if (!reservation.allowed) {
      return NextResponse.json({ error: "今日 AI 使用次数已用完", quota: reservation.quota }, { status: 429 });
    }
    if (!reservation.reserved || !reservation.taskId) {
      return NextResponse.json({ error: "这项分析正在处理中，请稍后查看结果", quota: reservation.quota }, { status: 409 });
    }
    taskId = reservation.taskId;

    const { data: run, error: runError } = await supabase.from("ai_runs").insert({
      user_id: userId,
      kind: "job_match",
      provider: "deepseek",
      status: "running",
      input_fingerprint: fingerprint,
    }).select("id").single();
    if (runError || !run) throw new Error("无法创建 AI 分析记录");
    runId = run.id;

    let structured = structuredResumeSchema.safeParse(resume.structured_data);
    if (!structured.success) {
      const parsedResume = await getAIProvider().parseResume(resume.parsed_text);
      const { error: structuredError } = await supabase.from("resumes")
        .update({ structured_data: parsedResume as Json })
        .eq("id", resume.id)
        .eq("user_id", userId);
      if (structuredError) throw new Error("简历解析完成，但保存结构化结果失败");
      structured = structuredResumeSchema.safeParse(parsedResume);
      if (!structured.success) throw new Error("简历结构化结果不完整");
    }

    const rawOutput = await getAIProvider().analyzeResume(resume.parsed_text, input.jobDescription, {
      targetCompany: input.targetCompany,
      targetRole: input.targetRole,
    });
    const output = {
      ...rawOutput,
      context: {
        resumeId: resume.id,
        jobDescription: input.jobDescription,
        targetCompany: input.targetCompany,
        targetRole: input.targetRole,
      },
      suggestions: rawOutput.suggestions
        .filter((item) => item.original.trim() !== item.revised.trim())
        .slice(0, 12),
    };
    const { error: updateError } = await supabase.from("ai_runs")
      .update({ status: "completed", output })
      .eq("id", run.id)
      .eq("user_id", userId);
    if (updateError) throw new Error("无法保存 AI 分析结果");
    const quota = await completeAIUsage(supabase, taskId, run.id);

    return NextResponse.json({ ...output, runId: run.id, structured: structured.data, cached: false, quota });
  } catch (error) {
    if (runId) {
      await supabase.from("ai_runs").update({
        status: "failed",
        error_code: error instanceof Error ? error.message.slice(0, 160) : "unknown",
      }).eq("id", runId).eq("user_id", userId);
    }
    if (taskId) await releaseAIUsage(supabase, taskId).catch(() => undefined);
    const message = error instanceof Error ? error.message : "分析失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
