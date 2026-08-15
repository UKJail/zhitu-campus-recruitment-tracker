export type CollectedJob = {
  externalId: string;
  company: string;
  title: string;
  location: string;
  salaryText: string | null;
  experience: string | null;
  education: string | null;
  description: string;
  publishedAt: string | null;
  expiresAt: string | null;
  applyUrl: string;
  normalizedUrl: string;
  fingerprint: string;
  rawData: Record<string, unknown>;
};

export type CollectionResult = {
  jobs: CollectedJob[];
  restricted?: boolean;
  reason?: string;
};

export interface JobSourceAdapter {
  readonly sourceName: string;
  readonly sourceKind?: string;
  readonly adapterName: string;
  collect(): Promise<CollectionResult>;
}
