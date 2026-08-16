import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("缺少 Supabase 管理连接变量");
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const jobsResult = await db.from("jobs").select("id,company,title,raw_data,created_at").order("created_at", { ascending: true });
if (jobsResult.error) throw jobsResult.error;
const jobs = jobsResult.data || [];
const oldJobs = jobs.filter((job) => job.raw_data?.catalog !== "official-company-careers-v1");
const newJobs = jobs.filter((job) => job.raw_data?.catalog === "official-company-careers-v1");
const oldIds = oldJobs.map((job) => job.id);

const applicationsResult = oldIds.length ? await db.from("applications").select("id,job_id,status").in("job_id", oldIds) : { data: [], error: null };
if (applicationsResult.error) throw applicationsResult.error;
const applicationIds = (applicationsResult.data || []).map((item) => item.id);
const eventsResult = applicationIds.length ? await db.from("application_events").select("id,application_id").in("application_id", applicationIds) : { data: [], error: null };
if (eventsResult.error) throw eventsResult.error;
const savedResult = oldIds.length ? await db.from("saved_jobs").select("job_id,user_id").in("job_id", oldIds) : { data: [], error: null };
if (savedResult.error) throw savedResult.error;

const companies = Object.entries(oldJobs.reduce((counts, job) => ({ ...counts, [job.company]: (counts[job.company] || 0) + 1 }), {}))
  .sort((a, b) => b[1] - a[1]).slice(0, 12);
console.log(JSON.stringify({
  auditAt: new Date().toISOString(),
  totalJobs: jobs.length,
  oldJobs: oldJobs.length,
  newOfficialJobs: newJobs.length,
  linkedApplications: applicationsResult.data?.length || 0,
  linkedApplicationEvents: eventsResult.data?.length || 0,
  linkedSavedJobs: savedResult.data?.length || 0,
  oldJobCompanySummary: companies,
  newOfficialSample: newJobs.slice(0, 5).map((job) => ({ company: job.company, title: job.title })),
}, null, 2));
