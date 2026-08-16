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

  it("keeps preference score first when the visible sort uses page date", () => {
    const result = catalog.searchOfferstarRecords(records, {
      preferredOnly: true,
      preferences: {
        graduationYear: "",
        roleKeywords: [],
        cities: [],
        recruitmentTypes: [],
        focusCompanies: ["丙公司"],
        excludedKeywords: [],
      },
      page: 1,
      pageSize: 10,
      sort: "published",
    });
    expect(result.records[0].externalId).toBe("offerstar-3");
    expect(result.records[1].externalId).toBe("offerstar-1");
  });

  it("offers frequently occurring catalog companies as preference suggestions", () => {
    const options = catalog.offerstarFilterOptions([...records, { ...records[0], externalId: "offerstar-5" }]);
    expect(options.companies[0]).toBe("甲公司");
  });
});
