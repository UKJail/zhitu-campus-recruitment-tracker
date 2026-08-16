import { NextResponse } from "next/server";
import { z } from "zod";
import { APPLICATION_DELETED_ACTION, APPLICATION_RESTORED_ACTION, isApplicationHidden } from "@/lib/applications/visibility";
import { jobFingerprint } from "@/lib/business";
import { getAuthenticatedUserId } from "@/lib/supabase/server";
import type { ApplicationStatus } from "@/lib/types";

export const runtime = "nodejs";

const bodySchema = z.object({
  company: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(160),
  location: z.string().trim().min(1).max(120).default("中国"),
  applyUrl: z.string().url().refine((value) => /^https?:\/\//i.test(value)),
  description: z.string().trim().min(1).max(100_000),
  match: z.number().int().min(0).max(100).optional(),
});

const progressedStatuses: ApplicationStatus[] = ["assessment", "interview", "offer"];

export async function POST(request: Request) {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  try {
    const input = bodySchema.parse(await request.json());
    const fingerprint = jobFingerprint({ company: input.company, title: input.title, location: input.location });
    const now = new Date().toISOString();
    const existingJobResult = await supabase.from("jobs").select("id").eq("fingerprint", fingerprint).maybeSingle();
    if (existingJobResult.error) throw new Error(existingJobResult.error.message);

    let job = existingJobResult.data;
    if (!job) {
      const createdJobResult = await supabase.from("jobs").insert({
        company: input.company,
        title: input.title,
        location: input.location,
        description: input.description,
        apply_url: input.applyUrl,
        normalized_url: input.applyUrl,
        fingerprint,
        raw_data: { manual: true, match: input.match ?? 0, tags: ["校招", "用户确认投递"] },
      }).select("id").single();

      if (createdJobResult.error?.code === "23505") {
        const racedJobResult = await supabase.from("jobs").select("id").eq("fingerprint", fingerprint).single();
        if (racedJobResult.error) throw new Error(racedJobResult.error.message);
        job = racedJobResult.data;
      } else if (createdJobResult.error || !createdJobResult.data) {
        throw new Error(createdJobResult.error?.message || "保存外部岗位失败");
      } else {
        job = createdJobResult.data;
      }
    }

    if (!job) throw new Error("保存外部岗位失败");

    const [{ data: existing, error: existingError }, { data: latestVersion }] = await Promise.all([
      supabase.from("applications").select("id,status,applied_confirmed_at,resume_version_id").eq("user_id", userId).eq("job_id", job.id).maybeSingle(),
      supabase.from("resume_versions").select("id").eq("user_id", userId).eq("source", "ai_suggestion").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (existingError) throw new Error(existingError.message);
    const { data: lifecycleEvents, error: lifecycleError } = existing
      ? await supabase.from("application_events").select("metadata").eq("application_id", existing.id).in("metadata->>action", [APPLICATION_DELETED_ACTION, APPLICATION_RESTORED_ACTION]).order("created_at", { ascending: false })
      : { data: [], error: null };
    if (lifecycleError) throw new Error(lifecycleError.message);
    const restoring = Boolean(existing && isApplicationHidden(lifecycleEvents || []));
    if (existing && !restoring && (progressedStatuses.includes(existing.status) || (existing.status === "applied" && existing.applied_confirmed_at))) {
      return NextResponse.json({ application: existing, jobId: job.id, duplicate: true });
    }

    const previousStatus = existing?.status ?? null;
    const applicationResult = existing
      ? await supabase.from("applications").update({
          status: "applied",
          applied_confirmed_at: now,
          resume_version_id: existing.resume_version_id ?? latestVersion?.id ?? null,
        }).eq("id", existing.id).eq("user_id", userId).select("id,status,applied_confirmed_at,resume_version_id").single()
      : await supabase.from("applications").insert({
          user_id: userId,
          job_id: job.id,
          status: "applied",
          applied_confirmed_at: now,
          resume_version_id: latestVersion?.id ?? null,
        }).select("id,status,applied_confirmed_at,resume_version_id").single();
    if (applicationResult.error || !applicationResult.data) throw new Error(applicationResult.error?.message || "保存投递记录失败");

    const { error: eventError } = await supabase.from("application_events").insert({
      application_id: applicationResult.data.id,
      user_id: userId,
      from_status: previousStatus,
      to_status: "applied",
      source: "user",
      metadata: { outcome: "applied", action: restoring ? APPLICATION_RESTORED_ACTION : "manual_external_confirmation", applyUrl: input.applyUrl },
    });
    if (eventError) {
      if (existing) {
        await supabase.from("applications").update({
          status: existing.status,
          applied_confirmed_at: existing.applied_confirmed_at,
          resume_version_id: existing.resume_version_id,
        }).eq("id", existing.id).eq("user_id", userId);
      } else {
        await supabase.from("applications").delete().eq("id", applicationResult.data.id).eq("user_id", userId);
      }
      throw new Error("投递记录已回滚：无法写入进度时间线");
    }

    return NextResponse.json({ application: applicationResult.data, jobId: job.id, duplicate: false }, { status: 201 });
  } catch (error) {
    const message = error instanceof z.ZodError ? "请填写有效的公司、岗位和投递链接" : error instanceof Error ? error.message : "记录投递失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
