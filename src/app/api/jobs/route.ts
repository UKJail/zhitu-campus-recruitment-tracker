import { type NextRequest, NextResponse } from "next/server";
import { isApplicationHidden } from "@/lib/applications/visibility";
import { loadOfferstarCatalog, offerstarCatalogMeta, offerstarRecordToJob, searchOfferstarRecords, type OfferstarInteraction } from "@/lib/jobs/offerstar-catalog";
import { getAuthenticatedUserId } from "@/lib/supabase/server";
import type { ApplicationStatus } from "@/lib/types";
import { DEFAULT_JOB_PREFERENCES, jobPreferencesSchema } from "@/lib/account/preferences";

export const runtime = "nodejs";

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function publishedLabel(value: string | null) {
  if (!value) return "发布时间未知";
  const days = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000));
  return days === 0 ? "今天" : days === 1 ? "1天前" : `${days}天前`;
}

export async function GET(request: NextRequest) {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const [{ data: jobs, error: jobsError }, { data: saved, error: savedError }, { data: applications, error: applicationsError }] = await Promise.all([
    supabase.from("jobs").select("id,company,title,location,salary_text,experience,education,description,published_at,apply_url,fingerprint,raw_data,job_sources(name)").order("published_at", { ascending: false }),
    supabase.from("saved_jobs").select("job_id").eq("user_id", userId),
    supabase.from("applications").select("id,job_id,status,applied_confirmed_at").eq("user_id", userId),
  ]);
  if (jobsError || savedError || applicationsError) {
    return NextResponse.json({ error: jobsError?.message || savedError?.message || applicationsError?.message || "职位加载失败" }, { status: 500 });
  }

  const applicationIds = (applications || []).map((item) => item.id);
  const { data: events, error: eventsError } = applicationIds.length
    ? await supabase.from("application_events").select("id,application_id,from_status,to_status,source,metadata,created_at").in("application_id", applicationIds).order("created_at", { ascending: false })
    : { data: [], error: null };
  if (eventsError) return NextResponse.json({ error: eventsError.message }, { status: 500 });

  const savedSet = new Set((saved || []).map((item) => item.job_id));
  const eventsByApplication = new Map<string, typeof events>();
  for (const event of events || []) {
    const current = eventsByApplication.get(event.application_id) || [];
    current.push(event);
    eventsByApplication.set(event.application_id, current);
  }
  const applicationMap = new Map((applications || [])
    .filter((item) => !isApplicationHidden(eventsByApplication.get(item.id) || []))
    .map((item) => [item.job_id, item]));

  const activityPayload = (jobs || []).filter((job) => objectValue(job.raw_data).seed !== "mvp").map((job) => {
    const raw = objectValue(job.raw_data);
    const application = applicationMap.get(job.id);
    const sourceRelation = job.job_sources as { name?: string } | null;
    return {
      id: job.id,
      company: job.company,
      title: job.title,
      location: job.location,
      salary: job.salary_text || "薪资面议",
      experience: job.experience || "经验不限",
      education: job.education || "学历不限",
      source: sourceRelation?.name || "公开来源",
      publishedAt: publishedLabel(job.published_at),
      publishedAtIso: job.published_at || undefined,
      match: typeof raw.match === "number" ? raw.match : 0,
      tags: Array.isArray(raw.tags) ? raw.tags.filter((tag): tag is string => typeof tag === "string") : [],
      description: job.description,
      applyUrl: job.apply_url,
      saved: savedSet.has(job.id),
      status: application?.status as ApplicationStatus | undefined,
      applicationId: application?.id,
      appliedConfirmedAt: application?.applied_confirmed_at || undefined,
      events: application ? (eventsByApplication.get(application.id) || []).map((event) => ({
        id: event.id,
        fromStatus: event.from_status as ApplicationStatus | null,
        toStatus: event.to_status as ApplicationStatus,
        source: event.source as "user" | "email" | "system" | "admin",
        metadata: objectValue(event.metadata),
        createdAt: event.created_at,
      })) : [],
    };
  }).filter((job) => job.saved || Boolean(job.applicationId));

  if (request.nextUrl.searchParams.get("scope") !== "catalog") {
    return NextResponse.json({ jobs: activityPayload }, { headers: { "Cache-Control": "no-store" } });
  }

  try {
    const catalog = await loadOfferstarCatalog();
    const query = request.nextUrl.searchParams;
    const savedOnly = query.get("savedOnly") === "true";
    const preferredOnly = query.get("preferredOnly") === "true";
    const parsedPreferences = jobPreferencesSchema.safeParse({
      graduationYear: query.get("preferenceGraduationYear") || "",
      roleKeywords: query.getAll("preferenceRole"),
      cities: query.getAll("preferenceCity"),
      recruitmentTypes: query.getAll("preferenceRecruitmentType"),
      focusCompanies: query.getAll("preferenceCompany"),
      excludedKeywords: query.getAll("preferenceExcluded"),
    });
    if (preferredOnly && !parsedPreferences.success) {
      return NextResponse.json({ error: "求职偏好格式无效，请重新保存" }, { status: 400 });
    }
    const savedFingerprints = new Set((jobs || []).filter((job) => savedSet.has(job.id)).map((job) => job.fingerprint));
    const catalogRecords = savedOnly ? catalog.data.records.filter((record) => savedFingerprints.has(record.businessFingerprint)) : catalog.data.records;
    const result = searchOfferstarRecords(catalogRecords, {
      query: query.get("query") || undefined,
      city: query.get("city") || undefined,
      company: query.get("company") || undefined,
      recruitmentType: (query.get("recruitmentType") || "all") as "all" | "graduate" | "internship",
      sort: (query.get("sort") || "published") as "match" | "published" | "company",
      page: Number(query.get("page") || 1),
      pageSize: Number(query.get("pageSize") || 10),
      preferredOnly,
      preferences: parsedPreferences.success ? parsedPreferences.data : DEFAULT_JOB_PREFERENCES,
    });
    const selectedFingerprints = result.records.map((record) => record.businessFingerprint);
    const materialized = selectedFingerprints.length
      ? (jobs || []).filter((job) => selectedFingerprints.includes(job.fingerprint))
      : [];
    const interactionByFingerprint = new Map<string, OfferstarInteraction>();
    for (const job of materialized) {
      const application = applicationMap.get(job.id);
      interactionByFingerprint.set(job.fingerprint, {
        databaseJobId: job.id,
        saved: savedSet.has(job.id),
        status: application?.status as ApplicationStatus | undefined,
        applicationId: application?.id,
        appliedConfirmedAt: application?.applied_confirmed_at || undefined,
        events: application ? (eventsByApplication.get(application.id) || []).map((event) => ({
          id: event.id,
          fromStatus: event.from_status as ApplicationStatus | null,
          toStatus: event.to_status as ApplicationStatus,
          source: event.source as "user" | "email" | "system" | "admin",
          metadata: objectValue(event.metadata),
          createdAt: event.created_at,
        })) : [],
      });
    }
    return NextResponse.json({
      jobs: result.records.map((record) => offerstarRecordToJob(record, interactionByFingerprint.get(record.businessFingerprint))),
      meta: offerstarCatalogMeta(catalog.data.records, result, catalog.data.generatedAt),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "职位加载失败" }, { status: 500 });
  }

}
