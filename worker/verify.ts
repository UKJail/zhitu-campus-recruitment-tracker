import { createClient } from "@supabase/supabase-js";

async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("验证脚本缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY");

  const db = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const [jobs, sources, runs] = await Promise.all([
    db.from("jobs").select("id", { count: "exact", head: true }),
    db.from("job_sources")
      .select("name,enabled,restricted_reason,last_success_at")
      .order("name"),
    db.from("source_runs")
      .select("status,jobs_seen,jobs_added,started_at,finished_at,job_sources(name)")
      .order("started_at", { ascending: false })
      .limit(10),
  ]);

  const errors = [jobs.error, sources.error, runs.error].filter(Boolean);
  if (errors.length) throw new Error(errors.map((error) => error?.message).join(" | "));

  console.log(JSON.stringify({ jobs: jobs.count, sources: sources.data, runs: runs.data }, null, 2));
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
