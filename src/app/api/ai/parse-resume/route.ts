import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAIProvider, structuredResumeSchema } from "@/lib/ai/provider";
import { getAuthenticatedUserId } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";

export const runtime = "nodejs";

const requestSchema = z.object({
  resumeId: z.string().uuid(),
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
    const [{ data: resume, error: resumeError }, { data: profile }, { count }] = await Promise.all([
      supabase.from("resumes").select("id,parsed_text,parse_status,structured_data").eq("id", input.resumeId).eq("user_id", userId).single(),
      supabase.from("profiles").select("ai_daily_limit").eq("id", userId).single(),
      supabase.from("ai_runs").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "completed").gte("created_at", startOfTodayInShanghai()),
    ]);

    if (resumeError || !resume) return NextResponse.json({ error: "简历不存在或无权访问" }, { status: 404 });
    if (resume.parse_status !== "ready" || !resume.parsed_text) return NextResponse.json({ error: "简历尚未完成文本解析" }, { status: 409 });

    const fingerprint = createHash("sha256").update(resume.parsed_text).digest("hex");
    if (resume.structured_data) {
      const cached = structuredResumeSchema.safeParse(resume.structured_data);
      if (cached.success) return NextResponse.json({ structured: cached.data, cached: true });
    }
    if ((count || 0) >= (profile?.ai_daily_limit ?? 20)) return NextResponse.json({ error: "今日 AI 操作次数已用完" }, { status: 429 });

    const { data: cachedRun } = await supabase.from("ai_runs")
      .select("id,output")
      .eq("user_id", userId)
      .eq("kind", "resume_parse")
      .eq("status", "completed")
      .eq("input_fingerprint", fingerprint)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const validCachedRun = structuredResumeSchema.safeParse(cachedRun?.output);
    if (validCachedRun.success) {
      await supabase.from("resumes").update({ structured_data: validCachedRun.data as Json }).eq("id", resume.id).eq("user_id", userId);
      return NextResponse.json({ structured: validCachedRun.data, runId: cachedRun?.id, cached: true });
    }

    const { data: run, error: runError } = await supabase.from("ai_runs").insert({
      user_id: userId,
      kind: "resume_parse",
      provider: "deepseek",
      status: "running",
      input_fingerprint: fingerprint,
    }).select("id").single();
    if (runError || !run) throw new Error("无法创建 DeepSeek 解析记录");

    try {
      const structured = await getAIProvider().parseResume(resume.parsed_text);
      const payload = structured as Json;
      const [{ error: resumeUpdateError }, { error: runUpdateError }] = await Promise.all([
        supabase.from("resumes").update({ structured_data: payload }).eq("id", resume.id).eq("user_id", userId),
        supabase.from("ai_runs").update({ status: "completed", output: payload }).eq("id", run.id).eq("user_id", userId),
      ]);
      if (resumeUpdateError || runUpdateError) throw new Error("DeepSeek 已完成解析，但保存结果失败");
      return NextResponse.json({ structured, runId: run.id, cached: false });
    } catch (error) {
      await supabase.from("ai_runs").update({ status: "failed", error_code: error instanceof Error ? error.message.slice(0, 160) : "unknown" }).eq("id", run.id).eq("user_id", userId);
      throw error;
    }
  } catch (error) {
    const message = error instanceof z.ZodError ? "请求参数无效" : error instanceof Error ? error.message : "DeepSeek 解析失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
