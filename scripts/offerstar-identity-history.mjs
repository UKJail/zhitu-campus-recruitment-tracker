/** Derive aliases only from the previous local catalog, never the delivery. */
export function attachOfferstarIdentityHistory(records, previous = {}) {
  const history = [...(previous.records || []), ...(previous.retiredRecords || [])];
  const byExternal = new Map(history.map((record) => [record.externalId, record]));
  const bySource = new Map(history.filter((record) => record.sourceId).map((record) => [record.sourceId, record]));
  const seenSources = new Set();
  let changedFingerprints = 0;
  const current = records.map((record) => {
    if (record.sourceId) {
      if (seenSources.has(record.sourceId)) throw new Error(`来源 ID 重复：${record.sourceId}`);
      seenSources.add(record.sourceId);
    }
    const old = (record.sourceId && bySource.get(record.sourceId)) || byExternal.get(record.externalId);
    if (old && ((record.sourceId && old.sourceId && record.sourceId !== old.sourceId) || old.externalId !== record.externalId)) {
      throw new Error(`稳定岗位身份变化，需先核对：${record.externalId}`);
    }
    if (old && old.businessFingerprint !== record.businessFingerprint) changedFingerprints += 1;
    const legacyFingerprints = old
      ? [...new Set([old.businessFingerprint, ...(old.legacyFingerprints || [])])].filter((value) => value && value !== record.businessFingerprint)
      : [];
    return { ...record, ...(record.sourceId || old?.sourceId ? { sourceId: record.sourceId || old.sourceId } : {}), legacyFingerprints };
  });
  const activeIds = new Set(current.map((record) => record.externalId));
  // Keep identity history when an announcement is absent from one snapshot.
  // These records are not included in discovery or interpreted as closed jobs.
  const retiredRecords = [...byExternal.values()].filter((record) => !activeIds.has(record.externalId));
  return { records: current, retiredRecords, changedFingerprints };
}
