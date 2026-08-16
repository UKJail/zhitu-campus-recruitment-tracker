import { describe, expect, it, vi } from "vitest";
import { TencentCareersAdapter } from "./tencent-careers";
import type { CompanyCareerSource } from "../company-sources";

const source: CompanyCareerSource = {
  ordinal: 70, companyZh: "腾讯控股有限公司", companyEn: "Tencent Holdings Limited", market: "中国大陆及香港",
  ownership: "民营/私营", industry: "互联网/科技", hiringRegions: "深圳、北京、上海、广州、香港",
  careerUrl: "https://careers.tencent.com/", entryType: "Career Page", verifiedOn: "2026-08-16", note: "",
};

describe("TencentCareersAdapter", () => {
  it("collects internship posts from the official public API", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ Code: 200, Data: { Count: 2, Posts: [
      { PostId: "100", RecruitPostName: "产品实习生", CountryName: "中国", LocationName: "Shenzhen", Responsibility: "协助产品调研", LastUpdateTime: "2026年08月15日", PostURL: "http://careers.tencent.com/jobdesc.html?postId=100", RequireWorkYearsName: "不限", BGName: "CSIG" },
      { PostId: "101", RecruitPostName: "Research Intern", CountryName: "新加坡", LocationName: "Singapore", Responsibility: "Research" },
    ] } }))) as unknown as typeof fetch;
    const result = await new TencentCareersAdapter(source, fetcher, () => new Date("2026-08-16T00:00:00+08:00")).collect();
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]).toMatchObject({ externalId: "tencent:100", location: "深圳", experience: "不限", publishedAt: "2026-08-15T00:00:00+08:00" });
    expect(result.jobs[0].rawData).toMatchObject({ catalog: "official-company-careers-v1", tags: ["实习"] });
  });

  it("drops official posts older than 180 days", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ Code: 200, Data: { Count: 1, Posts: [
      { PostId: "old", RecruitPostName: "过期实习岗位", CountryName: "中国", LocationName: "Shenzhen", Responsibility: "测试", LastUpdateTime: "2025年08月15日" },
    ] } }))) as unknown as typeof fetch;
    const result = await new TencentCareersAdapter(source, fetcher, () => new Date("2026-08-16T00:00:00+08:00")).collect();
    expect(result.jobs).toEqual([]);
  });
});
