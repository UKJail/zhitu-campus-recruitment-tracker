import { z } from "zod";
import { contentHash, jobFingerprint, normalizeUrl } from "../normalize.js";
import { isMainlandOrHongKongLocation, normalizeLocationToChinese } from "../location.js";
import type { CompanyCareerSource } from "../company-sources.js";
import type { CollectionResult, JobSourceAdapter } from "../types.js";

const postSchema = z.object({
  PostId: z.union([z.string(), z.number()]).transform(String),
  RecruitPostName: z.string().min(1),
  CountryName: z.string().optional().default(""),
  LocationName: z.string().optional().default(""),
  BGName: z.string().optional().default(""),
  ProductName: z.string().optional().default(""),
  CategoryName: z.string().optional().default(""),
  Responsibility: z.string().optional().default(""),
  LastUpdateTime: z.string().optional().default(""),
  PostURL: z.string().optional().default(""),
  RequireWorkYearsName: z.string().optional().default(""),
});

const responseSchema = z.object({
  Code: z.number(),
  Data: z.object({ Count: z.number(), Posts: z.array(postSchema).nullable() }),
});

function isoDate(value: string) {
  const match = value.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  return match ? `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}T00:00:00+08:00` : null;
}

export class TencentCareersAdapter implements JobSourceAdapter {
  readonly sourceName: string;
  readonly sourceKind = "official_public_api";
  readonly adapterName = "official-api:tencent:internship";

  constructor(
    private readonly source: CompanyCareerSource,
    private readonly fetcher: typeof fetch = fetch,
    private readonly now = () => new Date(),
  ) {
    this.sourceName = `${source.companyZh}｜官方招聘`;
  }

  private endpoint(pageIndex: number) {
    const params = new URLSearchParams({
      timestamp: String(Date.now()), countryId: "", cityId: "", bgIds: "", productId: "", categoryId: "",
      parentCategoryId: "", attrId: "3", keyword: "", pageIndex: String(pageIndex), pageSize: "100", language: "zh-cn", area: "cn",
    });
    return `https://careers.tencent.com/tencentcareer/api/post/Query?${params}`;
  }

  async collect(): Promise<CollectionResult> {
    const collected: z.infer<typeof postSchema>[] = [];
    let expected = Number.POSITIVE_INFINITY;
    for (let page = 1; page <= Math.min(10, Math.ceil(expected / 100)); page += 1) {
      const response = await this.fetcher(this.endpoint(page), {
        headers: { Accept: "application/json", "User-Agent": "ZhiTuTracker/0.2 (+official-career-index; public-api)" },
        signal: AbortSignal.timeout(20_000),
      });
      if ([401, 403, 412, 429].includes(response.status)) return { jobs: [], restricted: true, reason: `腾讯招聘公开接口返回 HTTP ${response.status}` };
      if (!response.ok) throw new Error(`腾讯招聘公开接口返回 HTTP ${response.status}`);
      const parsed = responseSchema.safeParse(await response.json());
      if (!parsed.success || parsed.data.Code !== 200) return { jobs: [], restricted: true, reason: "腾讯招聘公开接口数据结构发生变化" };
      expected = parsed.data.Data.Count;
      collected.push(...(parsed.data.Data.Posts || []));
      if (collected.length >= expected || !(parsed.data.Data.Posts || []).length) break;
    }

    const recentThreshold = this.now().getTime() - 180 * 24 * 60 * 60 * 1000;
    const jobs = collected
      .filter((post) => isMainlandOrHongKongLocation(`${post.LocationName} ${post.CountryName}`))
      .filter((post) => {
        const publishedAt = isoDate(post.LastUpdateTime);
        return publishedAt != null && Date.parse(publishedAt) >= recentThreshold;
      })
      .map((post) => {
      const location = normalizeLocationToChinese(`${post.LocationName} ${post.CountryName}`);
      const applyUrl = normalizeUrl((post.PostURL || `https://careers.tencent.com/jobdesc.html?postId=${post.PostId}`).replace(/^http:/, "https:"));
      const description = post.Responsibility.trim() || `${post.RecruitPostName} · ${location}`;
      return {
        externalId: `tencent:${post.PostId}`,
        company: this.source.companyZh,
        title: post.RecruitPostName.trim(),
        location,
        salaryText: null,
        experience: post.RequireWorkYearsName || "实习",
        education: null,
        description,
        publishedAt: isoDate(post.LastUpdateTime),
        expiresAt: null,
        applyUrl,
        normalizedUrl: applyUrl,
        fingerprint: jobFingerprint(this.source.companyZh, post.RecruitPostName, location),
        rawData: {
          adapter: this.adapterName,
          catalog: "official-company-careers-v1",
          catalogOrdinal: this.source.ordinal,
          sourceUrl: this.source.careerUrl,
          companyZh: this.source.companyZh,
          companyEn: this.source.companyEn,
          market: this.source.market,
          ownership: this.source.ownership,
          industry: this.source.industry,
          entryType: this.source.entryType,
          tags: ["实习"],
          bg: post.BGName || null,
          product: post.ProductName || null,
          category: post.CategoryName || null,
          contentHash: contentHash(description),
        },
      };
      });
    return { jobs };
  }
}
