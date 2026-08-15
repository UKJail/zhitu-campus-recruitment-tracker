import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const [profile, resumes, resumeVersions, savedJobs, applications, applicationEvents, inboundEmails, notifications, interviews, interviewPreparations, interviewReviews, aiRuns] = await Promise.all([
    supabase.from("profiles").select("id,display_name,ai_daily_limit,inbound_alias,created_at,updated_at").eq("id", userId).single(),
    supabase.from("resumes").select("*").eq("user_id", userId).order("created_at"),
    supabase.from("resume_versions").select("*").eq("user_id", userId).order("created_at"),
    supabase.from("saved_jobs").select("*").eq("user_id", userId).order("created_at"),
    supabase.from("applications").select("*").eq("user_id", userId).order("created_at"),
    supabase.from("application_events").select("*").eq("user_id", userId).order("created_at"),
    supabase.from("inbound_emails").select("*").eq("user_id", userId).order("received_at"),
    supabase.from("notifications").select("*").eq("user_id", userId).order("created_at"),
    supabase.from("interviews").select("*").eq("user_id", userId).order("created_at"),
    supabase.from("interview_preparations").select("*").eq("user_id", userId).order("created_at"),
    supabase.from("interview_reviews").select("*").eq("user_id", userId).order("created_at"),
    supabase.from("ai_runs").select("*").eq("user_id", userId).order("created_at"),
  ]);

  const results = { profile, resumes, resumeVersions, savedJobs, applications, applicationEvents, inboundEmails, notifications, interviews, interviewPreparations, interviewReviews, aiRuns };
  const failed = Object.entries(results).find(([, result]) => result.error);
  if (failed) return NextResponse.json({ error: `导出失败：${failed[0]}` }, { status: 500 });

  const jobIds = Array.from(new Set([
    ...(savedJobs.data || []).map((item) => item.job_id),
    ...(applications.data || []).map((item) => item.job_id),
  ]));
  const jobs = jobIds.length > 0 ? await supabase.from("jobs").select("id,company,title,location,salary_text,experience,education,description,published_at,expires_at,apply_url,created_at,updated_at").in("id", jobIds) : { data: [], error: null };
  if (jobs.error) return NextResponse.json({ error: "导出职位信息失败" }, { status: 500 });

  const payload = {
    exportVersion: 1,
    exportedAt: new Date().toISOString(),
    profile: profile.data,
    resumes: resumes.data,
    resumeVersions: resumeVersions.data,
    savedJobs: savedJobs.data,
    applications: applications.data,
    applicationEvents: applicationEvents.data,
    inboundEmails: inboundEmails.data,
    notifications: notifications.data,
    interviews: interviews.data,
    interviewPreparations: interviewPreparations.data,
    interviewReviews: interviewReviews.data,
    aiRuns: aiRuns.data,
    relatedJobs: jobs.data,
  };
  const filename = `zhitu-data-${new Date().toISOString().slice(0, 10)}.json`;
  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "private, no-store",
    },
  });
}
