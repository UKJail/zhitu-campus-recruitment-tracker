import { describe, expect, it, vi } from "vitest";
import { OfficialCareerPageAdapter } from "./official-career-page";
import type { CompanyCareerSource } from "../company-sources";

const source: CompanyCareerSource = {
  ordinal: 1,
  companyZh: "示例科技有限公司",
  companyEn: "Example Tech",
  market: "中国大陆及香港",
  ownership: "民营/私营",
  industry: "互联网/科技",
  hiringRegions: "北京、香港",
  careerUrl: "https://careers.example.com/",
  entryType: "Career Page",
  verifiedOn: "2026-08-16",
  note: "",
};

describe("OfficialCareerPageAdapter", () => {
  it("extracts public JobPosting JSON-LD and normalizes cities", async () => {
    const html = `<html><script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org",
      "@type": "JobPosting",
      identifier: { value: "graduate-2027" },
      title: "2027 Graduate Product Trainee",
      description: "<p>Work with product and data teams.</p>",
      datePosted: "2026-08-15",
      validThrough: "2026-09-30",
      hiringOrganization: { name: "Example Tech" },
      jobLocation: [{ address: { addressLocality: "Beijing", addressCountry: "CN" } }, { address: { addressLocality: "Hong Kong", addressCountry: "HK" } }],
      url: "https://careers.example.com/jobs/graduate-2027?utm_source=test",
    })}</script></html>`;
    const fetcher = vi.fn(async () => new Response(html, { status: 200, headers: { "content-type": "text/html" } })) as unknown as typeof fetch;
    const result = await new OfficialCareerPageAdapter(source, fetcher).collect();

    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]).toMatchObject({
      externalId: "graduate-2027",
      company: "Example Tech",
      location: "北京、香港",
      normalizedUrl: "https://careers.example.com/jobs/graduate-2027",
      experience: "应届生",
    });
    expect(result.jobs[0].rawData).toMatchObject({ catalog: "official-company-careers-v1", tags: ["校招", "应届生"] });
  });

  it("ignores overseas-only postings without pausing the source", async () => {
    const html = `<script type="application/ld+json">${JSON.stringify({ "@type": "JobPosting", title: "Analyst", jobLocation: { address: { addressLocality: "London", addressCountry: "GB" } } })}</script>`;
    const fetcher = vi.fn(async () => new Response(html, { status: 200 })) as unknown as typeof fetch;
    const result = await new OfficialCareerPageAdapter(source, fetcher).collect();
    expect(result).toEqual({ jobs: [] });
  });

  it("records access control without bypassing it", async () => {
    const fetcher = vi.fn(async () => new Response("", { status: 412 })) as unknown as typeof fetch;
    const result = await new OfficialCareerPageAdapter(source, fetcher).collect();
    expect(result).toMatchObject({ jobs: [], restricted: true });
  });
});
