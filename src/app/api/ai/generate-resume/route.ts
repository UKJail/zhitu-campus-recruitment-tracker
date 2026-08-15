import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { analysisSchema } from "@/lib/ai/provider";
import { getAuthenticatedUserId } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";

export const runtime = "nodejs";

const requestSchema = z.object({
  resumeId: z.string().uuid(),
  analysisRunId: z.string().uuid(),
  acceptedSuggestionIndexes: z.array(z.number().int().min(0).max(100)).min(1).max(50).refine((values) => new Set(values).size === values.length),
  jobDescription: z.string().min(20).max(100_000),
  targetCompany: z.string().trim().min(1).max(120).regex(/[A-Za-z\u4e00-\u9fff]/, "目标公司不能只填写数字"),
  targetRole: z.string().trim().min(1).max(120).regex(/[A-Za-z\u4e00-\u9fff]/, "岗位名称不能只填写数字"),
  truthConfirmed: z.literal(true),
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

  try {
    const input = requestSchema.parse(await request.json());
    const [{ data: resume, error: resumeError }, { data: analysisRun, error: analysisError }, { data: profile }, { count }] = await Promise.all([
      supabase.from("resumes").select("id,parsed_text,parse_status,mime_type").eq("id", input.resumeId).eq("user_id", userId).single(),
      supabase.from("ai_runs").select("id,kind,status,input_fingerprint,output").eq("id", input.analysisRunId).eq("user_id", userId).single(),
      supabase.from("profiles").select("ai_daily_limit").eq("id", userId).single(),
      supabase.from("ai_runs").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "completed").gte("created_at", startOfTodayInShanghai()),
    ]);

    if (resumeError || !resume) return NextResponse.json({ error: "简历不存在或无权访问" }, { status: 404 });
    if (resume.mime_type === "application/pdf") return NextResponse.json({ error: "保持原排版需要使用原始 DOCX 模板，请上传并选择对应的 Word 简历后重新分析" }, { status: 409 });
    if (analysisError || !analysisRun || analysisRun.kind !== "job_match" || analysisRun.status !== "completed") return NextResponse.json({ error: "找不到已完成的岗位匹配分析" }, { status: 404 });
    if (resume.parse_status !== "ready" || !resume.parsed_text) return NextResponse.json({ error: "简历尚未完成文本解析" }, { status: 409 });
    if ((count || 0) >= (profile?.ai_daily_limit ?? 20)) return NextResponse.json({ error: "今日 AI 操作次数已用完" }, { status: 429 });

    const expectedFingerprint = createHash("sha256").update(`${resume.id}\n${input.jobDescription}`).digest("hex");
    if (analysisRun.input_fingerprint !== expectedFingerprint) return NextResponse.json({ error: "当前 JD 与这次匹配分析不一致，请重新分析" }, { status: 409 });

    const analysis = analysisSchema.parse(analysisRun.output);
    const acceptedSuggestions = input.acceptedSuggestionIndexes.map((index) => analysis.suggestions[index]).filter(Boolean);
    if (acceptedSuggestions.length !== input.acceptedSuggestionIndexes.length) return NextResponse.json({ error: "已接受建议列表无效，请重新分析" }, { status: 400 });

    const fingerprint = createHash("sha256").update(JSON.stringify({
      analysisRunId: analysisRun.id,
      accepted: input.acceptedSuggestionIndexes,
      targetCompany: input.targetCompany,
      targetRole: input.targetRole,
    })).digest("hex");
    const { data: run, error: runError } = await supabase.from("ai_runs").insert({
      user_id: userId,
      kind: "resume_rewrite",
      provider: "system",
      status: "running",
      input_fingerprint: fingerprint,
    }).select("id").single();
    if (runError || !run) throw new Error("无法创建定制简历任务");

    try {
      const versionContent = {
        meta: {
          targetCompany: input.targetCompany,
          targetRole: input.targetRole,
          jobDescription: input.jobDescription,
          analysisRunId: analysisRun.id,
          acceptedSuggestionIndexes: input.acceptedSuggestionIndexes,
          replacements: acceptedSuggestions.map((suggestion) => ({ original: suggestion.original, revised: suggestion.revised })),
          templatePolicy: "preserve_original_docx",
          generatedAt: new Date().toISOString(),
        },
      } as Json;
      const { data: version, error: versionError } = await supabase.from("resume_versions").insert({
        resume_id: resume.id,
        user_id: userId,
        content: versionContent,
        source: "ai_suggestion",
      }).select("id,created_at").single();
      if (versionError || !version) throw new Error("无法保存定制简历版本");
      const { error: runUpdateError } = await supabase.from("ai_runs").update({ status: "completed", output: { versionId: version.id, targetCompany: input.targetCompany, targetRole: input.targetRole } }).eq("id", run.id).eq("user_id", userId);
      if (runUpdateError) throw new Error("无法完成定制简历任务");
      return NextResponse.json({
        versionId: version.id,
        createdAt: version.created_at,
        targetCompany: input.targetCompany,
        targetRole: input.targetRole,
        acceptedCount: acceptedSuggestions.length,
        downloadUrl: `/api/resumes/versions/${version.id}/download`,
      });
    } catch (error) {
      await supabase.from("ai_runs").update({ status: "failed", error_code: error instanceof Error ? error.message.slice(0, 160) : "unknown" }).eq("id", run.id).eq("user_id", userId);
      throw error;
    }
  } catch (error) {
    const message = error instanceof z.ZodError ? "请确认目标岗位、已接受建议和真实性授权" : error instanceof Error ? error.message : "生成定制简历失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
