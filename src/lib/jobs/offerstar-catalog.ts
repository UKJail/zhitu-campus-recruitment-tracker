import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { ApplicationEvent, ApplicationStatus, Job } from "@/lib/types";
import { normalizeOfferstarCities } from "@/lib/jobs/offerstar-location";
import type { JobPreferences } from "@/lib/account/preferences";
import { hasJobPreferences } from "@/lib/account/preferences";
import { matchJobPreferences } from "@/lib/jobs/preferences";

export type OfferstarRecord = {
  externalId: string;
  company: string;
  title: string;
  location: string;
  experience: string;
  applyUrl: string;
  normalizedUrl: string;
  businessFingerprint: string;
  recruitmentType: string;
  offerstarType: string;
  position: string;
  industry: string;
  category: string;
  postDate: string;
  deadline: string;
  applyUrlIsWechat: boolean;
};

type CatalogFile = { generatedAt: string; records: OfferstarRecord[] };
type CatalogCache = { modifiedAt: number; data: CatalogFile; byId: Map<string, OfferstarRecord> };
let cache: CatalogCache | null = null;

export type OfferstarInteraction = {
  databaseJobId?: string;
  saved?: boolean;
  status?: ApplicationStatus;
  applicationId?: string;
  appliedConfirmedAt?: string;
  events?: ApplicationEvent[];
};

export type OfferstarCatalogQuery = {
  query?: string;
  city?: string;
  company?: string;
  recruitmentType?: "all" | "graduate" | "internship";
  savedOnly?: boolean;
  sort?: "offerstar" | "match" | "published" | "company";
  page?: number;
  pageSize?: number;
  preferredOnly?: boolean;
  preferences?: JobPreferences;
};

function catalogPath() {
  return path.join(process.cwd(), "imports", "workbuddy", "offerstar", "offerstar-jobs.json");
}

export async function loadOfferstarCatalog() {
  const filePath = catalogPath();
  const fileStat = await stat(filePath);
  if (cache?.modifiedAt === fileStat.mtimeMs) return cache;
  const parsed = JSON.parse(await readFile(filePath, "utf8")) as CatalogFile;
  if (!Array.isArray(parsed.records)) throw new Error("OfferStar 岗位文件格式无效");
  cache = { modifiedAt: fileStat.mtimeMs, data: parsed, byId: new Map(parsed.records.map((item) => [item.externalId, item])) };
  return cache;
}

export async function findOfferstarRecord(externalId: string) {
  return (await loadOfferstarCatalog()).byId.get(externalId) || null;
}

function recruitmentType(record: OfferstarRecord) {
  return record.recruitmentType === "实习" ? "internship" : "graduate";
}

function inferBatchFromTitle(title: string) {
  return title.match(/20\d{2}\s*届/)?.[0].replace(/\s+/g, "") || "";
}

export function offerstarRecordToJob(record: OfferstarRecord, interaction: OfferstarInteraction = {}): Job {
  const tags = [record.recruitmentType === "实习" ? "实习" : "校招", record.industry, record.category].filter(Boolean);
  return {
    id: record.externalId,
    company: record.company,
    title: record.title,
    location: record.location,
    salary: "薪资请查看原文",
    experience: record.experience,
    education: "学历请查看原文",
    source: "OfferStar",
    publishedAt: record.postDate ? `${record.postDate} 更新` : "更新时间未知",
    match: 0,
    tags,
    description: "该岗位由 OfferStar 聚合发现，职途不保存完整 JD，请打开原页面查看并按需复制。",
    applyUrl: record.applyUrl,
    saved: Boolean(interaction.saved),
    status: interaction.status,
    applicationId: interaction.applicationId,
    appliedConfirmedAt: interaction.appliedConfirmedAt,
    events: interaction.events || [],
    databaseJobId: interaction.databaseJobId,
    discovery: true,
    deadline: record.deadline || undefined,
    industry: record.industry || undefined,
    batch: record.offerstarType || inferBatchFromTitle(record.title) || record.category || (record.recruitmentType === "实习" ? "实习" : "校招"),
    role: record.position || undefined,
    category: record.category || undefined,
    postDate: record.postDate || undefined,
    recruitmentTypeLabel: record.recruitmentType || undefined,
  };
}

export function searchOfferstarRecords(records: OfferstarRecord[], input: OfferstarCatalogQuery) {
  const normalizedQuery = input.query?.trim().toLocaleLowerCase("zh-CN") || "";
  const preferenceMatches = new Map<string, ReturnType<typeof matchJobPreferences>>();
  const preferenceMatchFor = (record: OfferstarRecord) => {
    const cached = preferenceMatches.get(record.externalId);
    if (cached) return cached;
    const result = matchJobPreferences(offerstarRecordToJob(record), input.preferences!);
    preferenceMatches.set(record.externalId, result);
    return result;
  };
  const filtered = records.filter((record) => {
    if (normalizedQuery && ![record.title, record.company, record.position, record.industry, record.location]
      .join(" ").toLocaleLowerCase("zh-CN").includes(normalizedQuery)) return false;
    if (input.city && input.city !== "全部城市" && !normalizeOfferstarCities(record.location).includes(input.city)) return false;
    const normalizedCompany = input.company?.trim().toLocaleLowerCase("zh-CN") || "";
    if (normalizedCompany && !record.company.toLocaleLowerCase("zh-CN").includes(normalizedCompany)) return false;
    if (input.recruitmentType && input.recruitmentType !== "all" && recruitmentType(record) !== input.recruitmentType) return false;
    if (input.preferredOnly && input.preferences && hasJobPreferences(input.preferences) && !preferenceMatchFor(record).eligible) return false;
    return true;
  });
  // records 的数组顺序就是 WorkBuddy 按 OfferStar 页面采集到的默认顺序。
  // 不按 postDate/公司/偏好分二次排序，避免把跨年的 12-31 等页面日期误判为最新岗位。
  const pageSize = Math.min(50, Math.max(1, input.pageSize || 10));
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(pageCount, Math.max(1, input.page || 1));
  return { total: filtered.length, page, pageSize, pageCount, records: filtered.slice((page - 1) * pageSize, page * pageSize) };
}

export function offerstarFilterOptions(records: OfferstarRecord[]) {
  const cityOrder = ["全国", "北京", "上海", "深圳", "广州", "杭州", "南京", "苏州", "成都", "武汉", "香港", "海外", "远程", "地点待确认"];
  const cities = [...new Set(records.flatMap((record) => normalizeOfferstarCities(record.location)))];
  const companyCounts = new Map<string, number>();
  for (const record of records) companyCounts.set(record.company, (companyCounts.get(record.company) || 0) + 1);
  return {
    cities: cities.sort((a, b) => {
      const aIndex = cityOrder.indexOf(a);
      const bIndex = cityOrder.indexOf(b);
      if (aIndex >= 0 || bIndex >= 0) return (aIndex < 0 ? cityOrder.length : aIndex) - (bIndex < 0 ? cityOrder.length : bIndex);
      return a.localeCompare(b, "zh-CN");
    }),
    companies: [...companyCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-CN")).slice(0, 40).map(([company]) => company),
  };
}

export function offerstarCatalogMeta(
  records: OfferstarRecord[],
  result: Pick<ReturnType<typeof searchOfferstarRecords>, "total" | "page" | "pageSize" | "pageCount">,
  generatedAt: string,
) {
  return {
    catalogTotal: records.length,
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
    pageCount: result.pageCount,
    generatedAt,
    ...offerstarFilterOptions(records),
  };
}
