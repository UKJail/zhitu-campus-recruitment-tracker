import type { OfferstarRecord } from "./offerstar-catalog";

export type OfferstarDatabaseJob = {
  id: string;
  fingerprint: string;
  apply_url: string;
  raw_data: unknown;
};

/** New rows use source identity, never mutable display text, for uniqueness. */
export function offerstarStorageFingerprint(record: OfferstarRecord) {
  return `offerstar:${record.sourceId || record.externalId}`;
}

export function offerstarLookupFingerprints(record: OfferstarRecord) {
  return [...new Set([
    offerstarStorageFingerprint(record),
    `offerstar:${record.externalId}`,
    record.businessFingerprint,
    ...(record.legacyFingerprints || []),
  ])];
}

function metadata(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function comparableUrl(value: string) {
  try {
    const url = new URL(value);
    url.searchParams.sort();
    // Keep the fragment: some recruitment sites put the job ID in the hash.
    return url.toString();
  } catch {
    return value.trim();
  }
}

export class OfferstarIdentityError extends Error {
  constructor() {
    super("该职位存在多条历史关联，请从求职记录查看原记录，稍后再试");
  }
}

/** A reusable index keeps saved-only filtering bounded by the user's own rows. */
export function indexOfferstarJobs<T extends OfferstarDatabaseJob>(jobs: T[]) {
  const byFingerprint = new Map<string, T[]>();
  const bySource = new Map<string, T[]>();
  const byExternal = new Map<string, T[]>();
  function add(map: Map<string, T[]>, key: unknown, row: T) {
    if (typeof key === "string" && key) map.set(key, [...(map.get(key) || []), row]);
  }
  for (const job of jobs) {
    const raw = metadata(job.raw_data);
    add(byFingerprint, job.fingerprint, job);
    add(bySource, raw.offerstarSourceId, job);
    add(byExternal, raw.offerstarExternalId, job);
  }

  return (record: OfferstarRecord): T | null => {
    const candidates = new Map<string, T>();
    for (const key of offerstarLookupFingerprints(record)) {
      for (const row of byFingerprint.get(key) || []) candidates.set(row.id, row);
    }
    for (const row of bySource.get(record.sourceId || "") || []) candidates.set(row.id, row);
    for (const row of byExternal.get(record.externalId) || []) candidates.set(row.id, row);
    const matches = [...candidates.values()].filter((row) => {
      const raw = metadata(row.raw_data);
      if (typeof raw.offerstarSourceId === "string" && raw.offerstarSourceId && record.sourceId) {
        return raw.offerstarSourceId === record.sourceId;
      }
      if (typeof raw.offerstarExternalId === "string" && raw.offerstarExternalId) {
        return raw.offerstarExternalId === record.externalId;
      }
      if (row.fingerprint.startsWith("offerstar:")) {
        return row.fingerprint === offerstarStorageFingerprint(record) || row.fingerprint === `offerstar:${record.externalId}`;
      }
      // A legacy content fingerprint can cover different announcements. The
      // original link must identify this announcement before sharing user state.
      return Boolean(row.apply_url) && comparableUrl(row.apply_url) === comparableUrl(record.applyUrl);
    });
    // Never arbitrarily select a database row and silently lose another history.
    if (matches.length > 1) throw new OfferstarIdentityError();
    return matches[0] || null;
  };
}
