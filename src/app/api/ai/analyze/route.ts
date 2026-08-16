import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAIProvider } from "@/lib/ai/provider";
import { getAuthenticatedUserId } from "@/lib/supabase/server";

export const runtime = "nodejs";

const requestSchema = z.object({
  resumeId: z.string().uuid(),
  jobDescription: z.string().min(20).max(100_000),
  targetCompany: z.string().trim().max(120).optional().default(""),
  targetRole: z.string().trim().max(120).optional().default(""),
});

function startOfTodayInShanghai() {
  const now = new Date();
  const shanghai = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  shanghai.setUTCHours(0, 0, 0, 0);
  return new Date(shanghai.getTime() - 8 * 60 * 60 * 1000).toISOString();
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

  try {
    const input = parsedInput.data;
    const [{ data: resume, error: resumeError }, { data: profile }, { count }] = await Promise.all([
      supabase.from("resumes").select("id,parsed_text,parse_status").eq("id", input.resumeId).eq("user_id", userId).single(),
      supabase.from("profiles").select("ai_daily_limit").eq("id", userId).single(),
      supabase.from("ai_runs").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "completed").gte("created_at", startOfTodayInShanghai()),
    ]);
    if (resumeError || !resume) return NextResponse.json({ error: "简历不存在或无权访问" }, { status: 404 });
    if (resume.parse_status !== "ready" || !resume.parsed_text) return NextResponse.json({ error: "简历尚未解析完成" }, { status: 409 });
    if ((count || 0) >= (profile?.ai_daily_limit ?? 20)) return NextResponse.json({ error: "今日 AI 操作次数已用完" }, { status: 429 });

    const fingerprint = createHash("sha256").update(`${resume.id}\n${input.jobDescription}`).digest("hex");
    const { data: run, error: runError } = await supabase.from("ai_runs").insert({
      user_id: userId,
      kind: "job_match",
      provider: "deepseek",
      status: "running",
      input_fingerprint: fingerprint,
    }).select("id").single();
    if (runError || !run) throw new Error("无法创建 AI 分析记录");

    try {
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
      const { error: updateError } = await supabase.from("ai_runs").update({ status: "completed", output }).eq("id", run.id).eq("user_id", userId);
      if (updateError) throw new Error("无法保存 AI 分析结果");
      return NextResponse.json({ ...output, runId: run.id });
    } catch (error) {
      await supabase.from("ai_runs").update({ status: "failed", error_code: error instanceof Error ? error.message.slice(0, 160) : "unknown" }).eq("id", run.id).eq("user_id", userId);
      throw error;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "分析失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
