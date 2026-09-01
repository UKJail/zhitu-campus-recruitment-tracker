import { NextResponse } from "next/server";
import { getAdminContext } from "@/lib/admin/access";

export const runtime = "nodejs";

export async function GET() {
  const context = await getAdminContext();
  if (context.status !== 200) return NextResponse.json({ error: context.error }, { status: context.status });
  const { admin } = context;
  const [profiles, authUsers, sources, runs, feedback] = await Promise.all([
    admin.from("profiles").select("id,display_name,is_admin,ai_daily_limit,created_at").order("created_at"),
    admin.auth.admin.listUsers({ page: 1, perPage: 200 }),
    admin.from("job_sources").select("id,name,kind,enabled,restricted_reason,last_success_at").order("name"),
    admin.from("source_runs").select("id,source_id,status,jobs_seen,jobs_added,error_code,started_at,finished_at").order("started_at", { ascending: false }).limit(100),
    admin.from("user_feedback").select("id,user_id,content,created_at").order("created_at", { ascending: false }).limit(100),
  ]);
  const failure = [profiles.error, authUsers.error, sources.error, runs.error, feedback.error].find(Boolean);
  if (failure) return NextResponse.json({ error: "管理员数据加载失败" }, { status: 500 });
  const emailById = new Map((authUsers.data?.users || []).map((user) => [user.id, user.email || ""]));
  type LatestRun = NonNullable<typeof runs.data>[number];
  const latestRunBySource = new Map<string, LatestRun>();
  for (const run of runs.data || []) if (!latestRunBySource.has(run.source_id)) latestRunBySource.set(run.source_id, run);
  return NextResponse.json({
    users: (profiles.data || []).map((profile) => ({ ...profile, email: emailById.get(profile.id) || "" })),
    sources: (sources.data || []).map((source) => ({ ...source, latestRun: latestRunBySource.get(source.id) || null })),
    feedback: (feedback.data || []).map((item) => ({ ...item, email: emailById.get(item.user_id) || "" })),
  });
}
