import { createClient } from "@supabase/supabase-js";

if (!process.argv.includes("--confirm-delete-old-test-jobs")) {
  throw new Error("需要 --confirm-delete-old-test-jobs 才能执行测试职位清理");
}
const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("缺少 Supabase 管理连接变量");
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const jobsResult = await db.from("jobs").select("id,company,title,raw_data");
if (jobsResult.error) throw jobsResult.error;
const oldJobs = (jobsResult.data || []).filter((job) => job.raw_data?.catalog !== "official-company-careers-v1");
const oldIds = oldJobs.map((job) => job.id);
const applicationsResult = oldIds.length ? await db.from("applications").select("id,job_id").in("job_id", oldIds) : { data: [], error: null };
if (applicationsResult.error) throw applicationsResult.error;
const linkedJobIds = new Set((applicationsResult.data || []).map((item) => item.job_id));
const deletable = oldJobs.filter((job) => !linkedJobIds.has(job.id));
const retained = oldJobs.filter((job) => linkedJobIds.has(job.id));

for (const job of retained) {
  const update = await db.from("jobs").update({ raw_data: { ...(job.raw_data || {}), seed: "mvp", cleanupPending: true, cleanupReason: "append_only_application_events" } }).eq("id", job.id);
  if (update.error) throw new Error(`无法隐藏关联测试职位 ${job.company} / ${job.title}：${update.error.message}`);
}
for (let index = 0; index < deletable.length; index += 100) {
  const ids = deletable.slice(index, index + 100).map((job) => job.id);
  const deletion = await db.from("jobs").delete().in("id", ids);
  if (deletion.error) throw new Error(`旧职位删除失败：${deletion.error.message}`);
}

const verify = await db.from("jobs").select("id,raw_data");
if (verify.error) throw verify.error;
const visible = (verify.data || []).filter((job) => job.raw_data?.seed !== "mvp");
console.log(JSON.stringify({
  completedAt: new Date().toISOString(),
  deletedOldJobs: deletable.length,
  hiddenLinkedTestJobs: retained.length,
  linkedApplicationsPreserved: applicationsResult.data?.length || 0,
  remainingDatabaseJobs: verify.data?.length || 0,
  visibleJobLibraryJobs: visible.length,
  visibleOfficialJobs: visible.filter((job) => job.raw_data?.catalog === "official-company-careers-v1").length,
}, null, 2));
