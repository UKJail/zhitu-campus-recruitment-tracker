import { beforeAll, describe, expect, it } from "vitest";

let catalog: typeof import("./offerstar-catalog");

beforeAll(async () => {
  catalog = await import("./offerstar-catalog");
});

const records = [
  { externalId: "offerstar-1", company: "甲公司", title: "产品实习生", location: "上海", experience: "实习", applyUrl: "https://example.com/1", normalizedUrl: "https://example.com/1", businessFingerprint: "甲|产品|上海", recruitmentType: "实习", offerstarType: "日常实习", position: "产品", industry: "互联网", category: "", postDate: "08-16", deadline: "尽快投递", applyUrlIsWechat: false },
  { externalId: "offerstar-2", company: "乙公司", title: "校园招聘", location: "北京", experience: "应届", applyUrl: "https://example.com/2", normalizedUrl: "https://example.com/2", businessFingerprint: "乙|校招|北京", recruitmentType: "应届生", offerstarType: "校招", position: "岗位较多", industry: "金融", category: "2027届", postDate: "08-15", deadline: "08-31", applyUrlIsWechat: false },
  { externalId: "offerstar-3", company: "丙公司", title: "管培生", location: "北京\n上海\n+3", experience: "应届", applyUrl: "https://example.com/3", normalizedUrl: "https://example.com/3", businessFingerprint: "丙|管培|多地", recruitmentType: "其他", offerstarType: "校招", position: "管培生", industry: "消费", category: "", postDate: "08-14", deadline: "", applyUrlIsWechat: false },
  { externalId: "offerstar-4", company: "丁公司", title: "校园招聘", location: "2026-01-21 推文", experience: "应届", applyUrl: "https://example.com/4", normalizedUrl: "https://example.com/4", businessFingerprint: "丁|校招|未知", recruitmentType: "应届生", offerstarType: "校招", position: "岗位较多", industry: "制造", category: "", postDate: "08-13", deadline: "", applyUrlIsWechat: false },
];

describe("OfferStar catalog", () => {
  it("filters by query, city and recruitment type before pagination", () => {
    const result = catalog.searchOfferstarRecords(records, { query: "产品", city: "上海", recruitmentType: "internship", page: 1, pageSize: 10 });
    expect(result.total).toBe(1);
    expect(result.records[0].externalId).toBe("offerstar-1");
  });

  it("keeps the full catalog count separate from the filtered result count", () => {
    const result = catalog.searchOfferstarRecords(records, { company: "甲", page: 1, pageSize: 10 });
    const meta = catalog.offerstarCatalogMeta(records, result, "2026-08-17T00:00:00.000Z");
    expect(meta.catalogTotal).toBe(4);
    expect(meta.total).toBe(1);
  });

  it("keeps discovery provenance and does not pretend a JD exists", () => {
    const job = catalog.offerstarRecordToJob(records[0], { saved: true });
    expect(job.source).toBe("OfferStar");
    expect(job.discovery).toBe(true);
    expect(job.saved).toBe(true);
    expect(job.description).toContain("不保存完整 JD");
  });

  it("consolidates city choices and excludes raw fragments", () => {
    const options = catalog.offerstarFilterOptions(records);
    expect(options.cities).toContain("北京");
    expect(options.cities).toContain("上海");
    expect(options.cities).toContain("地点待确认");
    expect(options.cities).not.toContain("2026-01-21 推文");
  });

  it("treats non-intern OfferStar records as campus recruitment", () => {
    expect(catalog.searchOfferstarRecords(records, { recruitmentType: "graduate" }).total).toBe(3);
  });

  it("filters companies by a partial name without rendering a giant option list", () => {
    expect(catalog.searchOfferstarRecords(records, { company: "甲" }).records.map((item) => item.company)).toEqual(["甲公司"]);
  });

  it("filters by the OfferStar batch and industry fields", () => {
    const result = catalog.searchOfferstarRecords(records, { batch: "校招", industry: "金融", page: 1, pageSize: 10 });
    expect(result.total).toBe(1);
    expect(result.records[0].externalId).toBe("offerstar-2");
  });

  it("filters the whole catalog by preferences before pagination", () => {
    const result = catalog.searchOfferstarRecords(records, {
      preferredOnly: true,
      preferences: {
        graduationYear: "",
        roleKeywords: ["产品"],
        cities: ["上海"],
        recruitmentTypes: ["internship"],
        focusCompanies: [],
        excludedKeywords: [],
      },
      page: 1,
      pageSize: 1,
      sort: "match",
    });
    expect(result.total).toBe(1);
    expect(result.records[0].externalId).toBe("offerstar-1");
  });

  it("preserves OfferStar source order instead of sorting by page date", () => {
    const result = catalog.searchOfferstarRecords(records, { page: 1, pageSize: 10, sort: "published" });
    expect(result.records.map((item) => item.externalId)).toEqual(["offerstar-1", "offerstar-2", "offerstar-3", "offerstar-4"]);
  });

  it("filters preferences without reordering OfferStar source order", () => {
    const result = catalog.searchOfferstarRecords(records, {
      preferredOnly: true,
      preferences: {
        graduationYear: "",
        roleKeywords: [],
        cities: ["北京"],
        recruitmentTypes: [],
        focusCompanies: [],
        excludedKeywords: [],
      },
      page: 1,
      pageSize: 10,
      sort: "match",
    });
    expect(result.records.map((item) => item.externalId)).toEqual(["offerstar-2", "offerstar-3"]);
  });

  it("infers a missing batch from the OfferStar title but does not fabricate a role", () => {
    const job = catalog.offerstarRecordToJob({ ...records[1], title: "2027届校园招聘正式启动", offerstarType: "", position: "" });
    expect(job.batch).toBe("2027届");
    expect(job.role).toBeUndefined();
  });

  it("offers frequently occurring catalog companies as preference suggestions", () => {
    const options = catalog.offerstarFilterOptions([...records, { ...records[0], externalId: "offerstar-5" }]);
    expect(options.companies[0]).toBe("甲公司");
    expect(options.batches).toContain("校招");
    expect(options.industries).toContain("金融");
  });
});
