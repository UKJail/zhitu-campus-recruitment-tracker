import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/supabase/server";
import { buildResumeWorkspace } from "@/lib/resumes/workspace";

export const runtime = "nodejs";

export async function GET(_request: Request, context: RouteContext<"/api/resumes/[id]/workspace">) {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const { id } = await context.params;

  const [{ data: resume }, { data: version, error: versionError }, { data: runs, error: runsError }] = await Promise.all([
    supabase.from("resumes").select("id").eq("id", id).eq("user_id", userId).single(),
    supabase.from("resume_versions").select("id,created_at,content").eq("resume_id", id).eq("user_id", userId).eq("source", "ai_suggestion").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("ai_runs").select("id,output").eq("user_id", userId).eq("kind", "job_match").eq("status", "completed").order("created_at", { ascending: false }).limit(20),
  ]);

  if (!resume) return NextResponse.json({ error: "简历不存在或无权访问" }, { status: 404 });
  if (versionError || runsError) return NextResponse.json({ error: "读取上次岗位分析失败" }, { status: 500 });
  return NextResponse.json(buildResumeWorkspace(id, version ?? null, runs ?? []));
}
