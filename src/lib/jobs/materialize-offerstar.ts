import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { findOfferstarRecord } from "@/lib/jobs/offerstar-catalog";
import { indexOfferstarJobs, offerstarLookupFingerprints, offerstarStorageFingerprint } from "@/lib/jobs/offerstar-identity";
import { JOB_QUERY_PAGE_SIZE, readJobQueryChunks, readJobQueryPages } from "@/lib/jobs/query-pages";

export async function materializeOfferstarJob(supabase: SupabaseClient<Database>, externalId: string) {
  const record = await findOfferstarRecord(externalId);
  if (!record) return null;

  const lookups: ["fingerprint" | "raw_data->>offerstarExternalId" | "raw_data->>offerstarSourceId", string[]][] = [
    ["fingerprint", offerstarLookupFingerprints(record)],
    ["raw_data->>offerstarExternalId", [record.externalId]],
    ["raw_data->>offerstarSourceId", record.sourceId ? [record.sourceId] : []],
  ];
  const candidates = (await Promise.all(lookups.map(([column, values]) => readJobQueryChunks(values, (chunk) => readJobQueryPages((after) => {
    let query = supabase.from("jobs").select("id,fingerprint,apply_url,raw_data");
    query = chunk.length === 1 && /["\\]/.test(chunk[0]) ? query.eq(column, chunk[0]) : query.in(column, chunk);
    query = query.order("id", { ascending: true }).limit(JOB_QUERY_PAGE_SIZE);
    if (after) query = query.gt("id", after);
    return query;
  }, (row) => row.id))))).flat();
  const existing = indexOfferstarJobs(candidates)(record);
  if (existing) return { id: existing.id, record };

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
    fingerprint: offerstarStorageFingerprint(record),
    raw_data: {
      manual: true,
      catalog: "offerstar",
      discovery: true,
      offerstarExternalId: record.externalId,
      offerstarSourceId: record.sourceId || null,
      recruitmentType: record.recruitmentType,
      industry: record.industry,
      deadline: record.deadline,
      postDate: record.postDate,
      tags: [record.recruitmentType, record.industry].filter(Boolean),
    },
  }).select("id").single();

  if (created.error?.code === "23505") {
    const raced = await supabase.from("jobs").select("id").eq("fingerprint", offerstarStorageFingerprint(record)).single();
    if (raced.error) throw new Error(raced.error.message);
    return { id: raced.data.id, record };
  }
  if (created.error || !created.data) throw new Error(created.error?.message || "保存 OfferStar 岗位失败");
  return { id: created.data.id, record };
}
