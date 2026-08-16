import { createClient } from "@supabase/supabase-js";

if (!process.argv.includes("--confirm-remove-stale-test-jobs")) {
  throw new Error("需要 --confirm-remove-stale-test-jobs 才能执行过期测试职位清理");
}
const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("缺少 Supabase 管理连接变量");
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const cutoff = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();

const jobsResult = await db.from("jobs").select("id,company,title,published_at,raw_data").eq("raw_data->>catalog", "official-company-careers-v1").lt("published_at", cutoff);
if (jobsResult.error) throw jobsResult.error;
const staleJobs = jobsResult.data || [];
const ids = staleJobs.map((job) => job.id);
const applicationsResult = ids.length ? await db.from("applications").select("id,job_id").in("job_id", ids) : { data: [], error: null };
if (applicationsResult.error) throw applicationsResult.error;
const linkedIds = new Set((applicationsResult.data || []).map((application) => application.job_id));
const deletable = staleJobs.filter((job) => !linkedIds.has(job.id));
const retained = staleJobs.filter((job) => linkedIds.has(job.id));

for (const job of retained) {
  const update = await db.from("jobs").update({ raw_data: { ...(job.raw_data || {}), seed: "mvp", stale: true } }).eq("id", job.id);
  if (update.error) throw update.error;
}
if (deletable.length) {
  const deletion = await db.from("jobs").delete().in("id", deletable.map((job) => job.id));
  if (deletion.error) throw deletion.error;
}
console.log(JSON.stringify({ cutoff, staleFound: staleJobs.length, deleted: deletable.length, hiddenBecauseLinked: retained.length }, null, 2));
