import { z } from "zod";
import { contentHash, jobFingerprint, normalizeUrl } from "../normalize.js";
import { isMainlandOrHongKongLocation, normalizeLocationToChinese } from "../location.js";
import type { CompanyCareerSource } from "../company-sources.js";
import type { CollectionResult, JobSourceAdapter } from "../types.js";

const baiduJobSchema = z.object({
  education: z.string().optional().default(""),
  name: z.string().min(1),
  postId: z.string().optional().default(""),
  jobId: z.string().optional().default(""),
  postType: z.string().optional().default(""),
  publishDate: z.string().optional().default(""),
  updateDate: z.string().optional().default(""),
  serviceCondition: z.string().optional().default(""),
  workContent: z.string().optional().default(""),
  workPlace: z.string().optional().default(""),
  workYears: z.string().optional().default(""),
  projectType: z.string().optional().default(""),
  projectTypeCode: z.string().optional().default(""),
});

const responseSchema = z.object({
  status: z.literal("ok"),
  data: z.object({
    list: z.array(baiduJobSchema).nullable(),
    total: z.union([z.number(), z.string()]).transform(Number),
    pageNum: z.union([z.number(), z.string()]).transform(Number),
    pageSize: z.union([z.number(), z.string()]).transform(Number),
  }),
});

function isoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00+08:00` : null;
}

function isCurrent(value: string, now: Date, maxAgeDays = 180) {
  const timestamp = Date.parse(`${value}T00:00:00+08:00`);
  return Number.isFinite(timestamp) && timestamp >= now.getTime() - maxAgeDays * 24 * 60 * 60 * 1000;
}

export class BaiduCareersAdapter implements JobSourceAdapter {
  readonly sourceName: string;
  readonly sourceKind = "official_public_api";
  readonly adapterName = "official-api:baidu:campus";

  constructor(
    private readonly source: CompanyCareerSource,
    private readonly fetcher: typeof fetch = fetch,
    private readonly now = () => new Date(),
  ) {
    this.sourceName = `${source.companyZh}｜官方招聘`;
  }

  async collect(): Promise<CollectionResult> {
    const sourceUrl = "https://talent.baidu.com/jobs/campus";
    const endpoint = "https://talent.baidu.com/httservice/getPostListNew";
    const collected: z.infer<typeof baiduJobSchema>[] = [];
    for (const recruitType of ["GRADUATE", "INTERN"] as const) {
      let total = Number.POSITIVE_INFINITY;
      for (let page = 1; page <= Math.min(30, Math.ceil(total / 10)); page += 1) {
        const form = new URLSearchParams({ recruitType, pageSize: "10", keyWord: "", curPage: String(page), projectType: "" });
        const response = await this.fetcher(endpoint, {
          method: "POST",
          headers: {
            Accept: "application/json,text/plain,*/*",
            "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
            Referer: sourceUrl,
            "User-Agent": "ZhiTuTracker/0.2 (+official-career-index; public-api)",
          },
          body: form.toString(),
          signal: AbortSignal.timeout(20_000),
        });
        if ([401, 403, 412, 429].includes(response.status)) {
          return { jobs: [], restricted: true, reason: `百度招聘公开接口返回 HTTP ${response.status}` };
        }
        if (!response.ok) throw new Error(`百度招聘公开接口返回 HTTP ${response.status}`);
        const parsed = responseSchema.safeParse(await response.json());
        if (!parsed.success) return { jobs: [], restricted: true, reason: "百度招聘公开接口数据结构发生变化" };
        total = parsed.data.data.total;
        const pageJobs = parsed.data.data.list || [];
        collected.push(...pageJobs);
        if (!pageJobs.length || page * 10 >= total) break;
      }
    }

    const now = this.now();
    const seen = new Set<string>();
    const jobs = collected
      .filter((job) => {
        const identifier = job.jobId || job.postId;
        if (!identifier || seen.has(identifier)) return false;
        seen.add(identifier);
        return true;
      })
      .filter((job) => /校招|实习|管培|AIDU/i.test(job.projectType))
      .filter((job) => isMainlandOrHongKongLocation(job.workPlace))
      .filter((job) => isCurrent(job.updateDate || job.publishDate, now))
      .map((job) => {
        const location = normalizeLocationToChinese(job.workPlace);
        const description = [job.workContent.trim(), job.serviceCondition.trim()].filter(Boolean).join("\n\n职位要求：\n");
        const identifier = job.jobId || job.postId;
        const recruitType = /实习/i.test(job.projectType) ? "INTERN" : "GRADUATE";
        const applyUrl = `https://talent.baidu.com/jobs/mobile/main.html#/detail/${recruitType}/${encodeURIComponent(job.postId || identifier)}`;
        const tags = /实习/i.test(job.projectType) ? ["实习"] : ["校招", "应届生"];
        return {
          externalId: `baidu:${identifier}`,
          company: this.source.companyZh,
          title: job.name.trim(),
          location,
          salaryText: null,
          experience: /实习/i.test(job.projectType) ? "实习" : "应届生",
          education: job.education || null,
          description: description || `${job.name} · ${location}`,
          publishedAt: isoDate(job.updateDate || job.publishDate),
          expiresAt: null,
          applyUrl,
          normalizedUrl: normalizeUrl(applyUrl),
          fingerprint: jobFingerprint(this.source.companyZh, job.name, location),
          rawData: {
            adapter: this.adapterName,
            catalog: "official-company-careers-v1",
            catalogOrdinal: this.source.ordinal,
            sourceUrl,
            companyZh: this.source.companyZh,
            companyEn: this.source.companyEn,
            market: this.source.market,
            ownership: this.source.ownership,
            industry: this.source.industry,
            entryType: this.source.entryType,
            tags,
            postType: job.postType || null,
            projectType: job.projectType || null,
            projectTypeCode: job.projectTypeCode || null,
            contentHash: contentHash(description),
          },
        };
      });
    return { jobs };
  }
}
