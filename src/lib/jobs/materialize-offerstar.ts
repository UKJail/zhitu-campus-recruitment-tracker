import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { findOfferstarRecord } from "@/lib/jobs/offerstar-catalog";

export async function materializeOfferstarJob(supabase: SupabaseClient<Database>, externalId: string) {
  const record = await findOfferstarRecord(externalId);
  if (!record) return null;

  const existing = await supabase.from("jobs").select("id").eq("fingerprint", record.businessFingerprint).maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (existing.data) return { id: existing.data.id, record };

  const created = await supabase.from("jobs").insert({
    company: record.company,
    title: record.title,
    location: record.location,
    salary_text: null,
    experience: record.experience,
    education: null,
    description: "该岗位由 OfferStar 聚合发现，职途不保存完整 JD，请打开原页面查看并按需复制。",
    apply_url: record.applyUrl,
    normalized_url: record.normalizedUrl,
    fingerprint: record.businessFingerprint,
    raw_data: {
      manual: true,
      catalog: "offerstar",
      discovery: true,
      offerstarExternalId: record.externalId,
      recruitmentType: record.recruitmentType,
      industry: record.industry,
      deadline: record.deadline,
      postDate: record.postDate,
      tags: [record.recruitmentType, record.industry].filter(Boolean),
    },
  }).select("id").single();

  if (created.error?.code === "23505") {
    const raced = await supabase.from("jobs").select("id").eq("fingerprint", record.businessFingerprint).single();
    if (raced.error) throw new Error(raced.error.message);
    return { id: raced.data.id, record };
  }
  if (created.error || !created.data) throw new Error(created.error?.message || "保存 OfferStar 岗位失败");
  return { id: created.data.id, record };
}
