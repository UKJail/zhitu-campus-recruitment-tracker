import { describe, expect, it, vi } from "vitest";
import { BaiduCareersAdapter } from "./baidu-careers";
import type { CompanyCareerSource } from "../company-sources";

const source: CompanyCareerSource = {
  ordinal: 76,
  companyZh: "百度集团",
  companyEn: "Baidu",
  market: "中国大陆/香港",
  ownership: "民营/私营",
  industry: "互联网/人工智能",
  hiringRegions: "北京、深圳、上海等",
  careerUrl: "https://talent.baidu.com/",
  entryType: "独立招聘官网",
  verifiedOn: "2026-08-16",
  note: "",
};

function apiPage(jobs: unknown[]) {
  return { status: "ok", data: { list: jobs, total: jobs.length, pageNum: 1, pageSize: 10 } };
}

describe("BaiduCareersAdapter", () => {
  it("collects current campus jobs and normalizes Chinese cities", async () => {
    const payload = apiPage([{
      name: "深圳-全栈开发工程师(J103964)", jobId: "job-1", postId: "post-1", postType: "技术",
      publishDate: "2026-08-03", updateDate: "2026-08-05", workPlace: "深圳市", projectType: "校招",
      workContent: "负责全栈开发", serviceCondition: "本科及以上学历",
    }]);
    const fetcher = vi.fn(async () => Response.json(payload)) as unknown as typeof fetch;
    const result = await new BaiduCareersAdapter(source, fetcher, () => new Date("2026-08-16T00:00:00+08:00")).collect();
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]).toMatchObject({
      company: "百度集团", location: "深圳", experience: "应届生", externalId: "baidu:job-1",
      applyUrl: "https://talent.baidu.com/jobs/mobile/main.html#/detail/GRADUATE/post-1",
    });
    expect(result.jobs[0].rawData).toMatchObject({ tags: ["校招", "应届生"] });
  });

  it("drops stale and social jobs", async () => {
    const payload = apiPage([
      { name: "旧校招", jobId: "old", updateDate: "2025-01-01", workPlace: "北京市", projectType: "校招" },
      { name: "当前社招", jobId: "social", updateDate: "2026-08-05", workPlace: "北京市", projectType: "社招" },
    ]);
    const fetcher = vi.fn(async () => Response.json(payload)) as unknown as typeof fetch;
    const result = await new BaiduCareersAdapter(source, fetcher, () => new Date("2026-08-16T00:00:00+08:00")).collect();
    expect(result.jobs).toEqual([]);
  });

  it("pauses when the embedded data shape changes", async () => {
    const fetcher = vi.fn(async () => Response.json({ status: "ok", data: { unexpected: [] } })) as unknown as typeof fetch;
    const result = await new BaiduCareersAdapter(source, fetcher).collect();
    expect(result).toMatchObject({ jobs: [], restricted: true });
  });

});
