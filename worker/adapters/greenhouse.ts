import { z } from "zod";
import { contentHash, jobFingerprint, normalizeUrl, stripHtml } from "../normalize.js";
import type { CollectionResult, JobSourceAdapter } from "../types.js";

const responseSchema = z.object({
  jobs: z.array(z.object({
    id: z.number(),
    title: z.string().min(1),
    updated_at: z.string().datetime({ offset: true }),
    absolute_url: z.string().url(),
    location: z.object({ name: z.string().min(1) }),
    content: z.string().optional().default(""),
    departments: z.array(z.object({ name: z.string() })).optional().default([]),
  })),
});

export class GreenhouseAdapter implements JobSourceAdapter {
  readonly sourceName: string;
  readonly sourceKind = "public_api";
  readonly adapterName: string;

  constructor(
    private readonly boardToken: string,
    private readonly company: string,
    private readonly locations: RegExp,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    this.adapterName = `greenhouse:${boardToken}`;
    this.sourceName = `企业官网 · ${company}`;
  }

  async collect(): Promise<CollectionResult> {
    const endpoint = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(this.boardToken)}/jobs?content=true`;
    const response = await this.fetcher(endpoint, { headers: { Accept: "application/json", "User-Agent": "ZhiTuTracker/0.1 (+job-board; public-api)" }, signal: AbortSignal.timeout(30_000) });
    if (response.status === 401 || response.status === 403 || response.status === 429) {
      return { jobs: [], restricted: true, reason: `公开 API 返回 ${response.status}，已暂停以避免重复访问` };
    }
    if (!response.ok) throw new Error(`Greenhouse ${this.boardToken} 返回 HTTP ${response.status}`);
    const parsed = responseSchema.safeParse(await response.json());
    if (!parsed.success) return { jobs: [], restricted: true, reason: "公开 API 数据结构发生变化，已暂停等待检查" };

    const jobs = parsed.data.jobs.filter((job) => this.locations.test(job.location.name)).map((job) => {
      const description = stripHtml(job.content) || `${job.title} · ${job.location.name}`;
      const normalizedUrl = normalizeUrl(job.absolute_url);
      return {
        externalId: `${this.boardToken}:${job.id}`,
        company: this.company,
        title: job.title.trim(),
        location: job.location.name.trim(),
        salaryText: null,
        experience: null,
        education: null,
        description,
        publishedAt: job.updated_at,
        expiresAt: null,
        applyUrl: job.absolute_url,
        normalizedUrl,
        fingerprint: jobFingerprint(this.company, job.title, job.location.name),
        rawData: { adapter: this.adapterName, departments: job.departments.map((item) => item.name), contentHash: contentHash(description) },
      };
    });
    return { jobs };
  }
}
