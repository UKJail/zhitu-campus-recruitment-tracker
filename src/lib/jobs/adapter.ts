import { jobFingerprint } from "../business";
import type { Job } from "../types";

export type SourceResult = { jobs: Job[]; restricted?: boolean; reason?: string };
export interface JobSourceAdapter { readonly name: string; collect(): Promise<SourceResult>; }

export abstract class PublicPageAdapter implements JobSourceAdapter {
  abstract readonly name: string;
  abstract collect(): Promise<SourceResult>;
  protected restricted(reason: string): SourceResult { return { jobs: [], restricted: true, reason }; }
}

export const sourceNames = ["企业官网", "公开聚合源", "猎聘", "智联招聘", "前程无忧"] as const;

export function deduplicateJobs(items: Job[]) {
  return [...new Map(items.map((job) => [jobFingerprint(job), job])).values()];
}
