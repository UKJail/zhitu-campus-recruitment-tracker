import { type NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isApplicationHidden } from "@/lib/applications/visibility";
import { loadOfferstarCatalog, offerstarCatalogMeta, offerstarRecordToJob, searchOfferstarRecords, type OfferstarInteraction } from "@/lib/jobs/offerstar-catalog";
import { JOB_QUERY_PAGE_SIZE, JobsReadError, readJobQueryChunks, readJobQueryPages } from "@/lib/jobs/query-pages";
import { getAuthenticatedUserId } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import type { ApplicationStatus } from "@/lib/types";
import { DEFAULT_JOB_PREFERENCES, jobPreferencesSchema } from "@/lib/account/preferences";

export const runtime = "nodejs";

type Client = SupabaseClient<Database>;
type Application = Pick<Database["public"]["Tables"]["applications"]["Row"], "id" | "job_id" | "status" | "applied_confirmed_at">;
type Event = Pick<Database["public"]["Tables"]["application_events"]["Row"], "id" | "application_id" | "from_status" | "to_status" | "source" | "metadata" | "created_at">;
const JOB_FIELDS = "id,company,title,location,salary_text,experience,education,description,published_at,apply_url,fingerprint,raw_data,job_sources(name)";

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function publishedLabel(value: string | null) {
  if (!value) return "发布时间未知";
  const days = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000));
  return days === 0 ? "今天" : days === 1 ? "1天前" : `${days}天前`;
}

function positiveInteger(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

async function loadUserLinks(supabase: Client, userId: string) {
  const [saved, applications] = await Promise.all([
    readJobQueryPages((after) => {
      let query = supabase.from("saved_jobs").select("job_id").eq("user_id", userId).order("job_id", { ascending: true }).limit(JOB_QUERY_PAGE_SIZE);
      if (after) query = query.gt("job_id", after);
      return query;
    }, (row) => row.job_id),
    readJobQueryPages((after) => {
      let query = supabase.from("applications").select("id,job_id,status,applied_confirmed_at").eq("user_id", userId).order("id", { ascending: true }).limit(JOB_QUERY_PAGE_SIZE);
      if (after) query = query.gt("id", after);
      return query;
    }, (row) => row.id),
  ]);
  return { savedSet: new Set(saved.map((row) => row.job_id)), applications };
}

async function loadJobs(supabase: Client, column: "id" | "fingerprint", values: string[]) {
  return readJobQueryChunks(values, (chunk) => readJobQueryPages((after) => {
    let query = supabase.from("jobs").select(JOB_FIELDS);
    query = chunk.length === 1 && /["\\]/.test(chunk[0]) ? query.eq(column, chunk[0]) : query.in(column, chunk);
    query = query.order("id", { ascending: true }).limit(JOB_QUERY_PAGE_SIZE);
    if (after) query = query.gt("id", after);
    return query;
  }, (row) => row.id));
}

async function loadSavedFingerprints(supabase: Client, ids: string[]) {
  const rows = await readJobQueryChunks(ids, (chunk) => readJobQueryPages((after) => {
    let query = supabase.from("jobs").select("id,fingerprint").in("id", chunk).order("id", { ascending: true }).limit(JOB_QUERY_PAGE_SIZE);
    if (after) query = query.gt("id", after);
    return query;
  }, (row) => row.id));
  return new Set(rows.map((row) => row.fingerprint));
}

async function loadApplicationState(supabase: Client, userId: string, applications: Application[]) {
  const events = await readJobQueryChunks(applications.map((item) => item.id), (chunk) => readJobQueryPages((after) => {
    let query = supabase.from("application_events").select("id,application_id,from_status,to_status,source,metadata,created_at")
      .eq("user_id", userId).in("application_id", chunk).order("id", { ascending: true }).limit(JOB_QUERY_PAGE_SIZE);
    if (after) query = query.gt("id", after);
    return query;
  }, (row) => row.id));
  // Read the full visibility history, not just the first server-limited page.
  events.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id.localeCompare(a.id));
  const eventsByApplication = new Map<string, Event[]>();
  for (const event of events) {
    const current = eventsByApplication.get(event.application_id) || [];
    current.push(event);
    eventsByApplication.set(event.application_id, current);
  }
  const applicationMap = new Map(applications.filter((item) => !isApplicationHidden(eventsByApplication.get(item.id) || []))
    .map((item) => [item.job_id, item]));
  return { applicationMap, eventsByApplication };
}

function interactionFor(jobId: string, savedSet: Set<string>, state: Awaited<ReturnType<typeof loadApplicationState>>): OfferstarInteraction {
  const application = state.applicationMap.get(jobId);
  return {
    databaseJobId: jobId,
    saved: savedSet.has(jobId),
    status: application?.status as ApplicationStatus | undefined,
    applicationId: application?.id,
    appliedConfirmedAt: application?.applied_confirmed_at || undefined,
    events: application ? (state.eventsByApplication.get(application.id) || []).map((event) => ({
      id: event.id,
      fromStatus: event.from_status as ApplicationStatus | null,
      toStatus: event.to_status as ApplicationStatus,
      source: event.source as "user" | "email" | "system" | "admin",
      metadata: objectValue(event.metadata),
      createdAt: event.created_at,
    })) : [],
  };
}

function publishedDescending(a: { id: string; published_at: string | null }, b: { id: string; published_at: string | null }) {
  // Preserve the previous published_at descending order (nulls first).
  if (a.published_at === null && b.published_at !== null) return -1;
  if (b.published_at === null && a.published_at !== null) return 1;
  const dateOrder = a.published_at && b.published_at ? Date.parse(b.published_at) - Date.parse(a.published_at) : 0;
  return dateOrder || a.id.localeCompare(b.id);
}

export async function GET(request: NextRequest) {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  try {
    const query = request.nextUrl.searchParams;
    const preferredOnly = query.get("preferredOnly") === "true";
    const parsedPreferences = jobPreferencesSchema.safeParse({
      graduationYear: query.get("preferenceGraduationYear") || "",
      roleKeywords: query.getAll("preferenceRole"),
      cities: query.getAll("preferenceCity"),
      recruitmentTypes: query.getAll("preferenceRecruitmentType"),
      focusCompanies: query.getAll("preferenceCompany"),
      excludedKeywords: query.getAll("preferenceExcluded"),
    });
    if (query.get("scope") === "catalog" && preferredOnly && !parsedPreferences.success) {
      return NextResponse.json({ error: "求职偏好格式无效，请重新保存" }, { status: 400 });
    }
    const { savedSet, applications } = await loadUserLinks(supabase, userId);

    if (query.get("scope") !== "catalog") {
      const state = await loadApplicationState(supabase, userId, applications);
      const jobs = await loadJobs(supabase, "id", [...savedSet, ...state.applicationMap.keys()]);
      jobs.sort(publishedDescending);
      const payload = jobs.filter((job) => objectValue(job.raw_data).seed !== "mvp").map((job) => {
        const raw = objectValue(job.raw_data);
        const interaction = interactionFor(job.id, savedSet, state);
        return {
          id: job.id,
          company: job.company,
          title: job.title,
          location: job.location,
          salary: job.salary_text || "薪资面议",
          experience: job.experience || "经验不限",
          education: job.education || "学历不限",
          source: job.job_sources?.name || "公开来源",
          publishedAt: publishedLabel(job.published_at),
          publishedAtIso: job.published_at || undefined,
          match: typeof raw.match === "number" ? raw.match : 0,
          tags: Array.isArray(raw.tags) ? raw.tags.filter((tag): tag is string => typeof tag === "string") : [],
          description: job.description,
          applyUrl: job.apply_url,
          saved: interaction.saved,
          status: interaction.status,
          applicationId: interaction.applicationId,
          appliedConfirmedAt: interaction.appliedConfirmedAt,
          events: interaction.events,
        };
      }).filter((job) => job.saved || Boolean(job.applicationId));
      return NextResponse.json({ jobs: payload }, { headers: { "Cache-Control": "no-store" } });
    }

    const catalog = await loadOfferstarCatalog();
    const savedFingerprints = query.get("savedOnly") === "true" ? await loadSavedFingerprints(supabase, [...savedSet]) : null;
    const catalogRecords = savedFingerprints ? catalog.data.records.filter((record) => savedFingerprints.has(record.businessFingerprint)) : catalog.data.records;
    const recruitmentType = query.get("recruitmentType");
    const result = searchOfferstarRecords(catalogRecords, {
      query: query.get("query") || undefined,
      city: query.get("city") || undefined,
      company: query.get("company") || undefined,
      batch: query.get("batch") || undefined,
      industry: query.get("industry") || undefined,
      recruitmentType: recruitmentType === "graduate" || recruitmentType === "internship" ? recruitmentType : "all",
      sort: "offerstar",
      page: positiveInteger(query.get("page"), 1),
      pageSize: Math.min(50, positiveInteger(query.get("pageSize"), 10)),
      preferredOnly,
      preferences: parsedPreferences.success ? parsedPreferences.data : DEFAULT_JOB_PREFERENCES,
    });
    const materialized = await loadJobs(supabase, "fingerprint", result.records.map((record) => record.businessFingerprint));
    const selectedIds = new Set(materialized.map((job) => job.id));
    const state = await loadApplicationState(supabase, userId, applications.filter((item) => selectedIds.has(item.job_id)));
    const interactionByFingerprint = new Map(materialized.map((job) => [job.fingerprint, interactionFor(job.id, savedSet, state)]));
    return NextResponse.json({
      jobs: result.records.map((record) => offerstarRecordToJob(record, interactionByFingerprint.get(record.businessFingerprint))),
      meta: offerstarCatalogMeta(catalog.data.records, result, catalog.data.generatedAt),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof JobsReadError ? error.message : "职位加载失败，请稍后重试" }, {
      status: error instanceof JobsReadError ? 503 : 500,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
