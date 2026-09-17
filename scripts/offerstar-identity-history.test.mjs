import { describe, expect, it } from "vitest";
import { attachOfferstarIdentityHistory } from "./offerstar-identity-history.mjs";

describe("catalog identity history across snapshots", () => {
  const old = { externalId: "offerstar-old", businessFingerprint: "北京", applyUrl: "https://example.test/1" };
  const fresh = { ...old, sourceId: "real-source", businessFingerprint: "北京上海" };
  it("retains old fingerprints transitively and on repeated imports", () => {
    const first = attachOfferstarIdentityHistory([fresh], { records: [old] });
    expect(first.records[0].legacyFingerprints).toEqual(["北京"]);
    const second = attachOfferstarIdentityHistory([{ ...fresh, businessFingerprint: "北京上海广州" }], first);
    expect(second.records[0].legacyFingerprints).toEqual(["北京上海", "北京"]);
    expect(attachOfferstarIdentityHistory([{ ...fresh, businessFingerprint: "北京上海广州" }], second).records).toEqual(second.records);
  });
  it("keeps the identity when absent and restores it on a later snapshot", () => {
    const first = attachOfferstarIdentityHistory([fresh], { records: [old] });
    const absent = attachOfferstarIdentityHistory([], first);
    expect(absent.retiredRecords).toHaveLength(1);
    const restored = attachOfferstarIdentityHistory([{ ...fresh, businessFingerprint: "全国" }], absent);
    expect(restored.records[0].legacyFingerprints).toEqual(["北京上海", "北京"]);
    expect(restored.retiredRecords).toHaveLength(0);
  });
  it("rejects source identity reuse, duplicate sources and unexpected renumbering", () => {
    expect(() => attachOfferstarIdentityHistory([{ ...fresh, sourceId: "another-source" }], { records: [fresh] })).toThrow("稳定岗位身份变化");
    expect(() => attachOfferstarIdentityHistory([{ ...fresh, externalId: "renumbered" }], { records: [fresh] })).toThrow("稳定岗位身份变化");
    expect(() => attachOfferstarIdentityHistory([fresh, { ...fresh, externalId: "duplicate" }])).toThrow("来源 ID 重复");
  });
});
