import { describe, expect, it } from "vitest";
import { matchJobPreferences } from "./preferences";
import type { JobPreferences } from "@/lib/account/preferences";
import type { Job } from "@/lib/types";

const preferences: JobPreferences = {
  graduationYear: "2027",
  roleKeywords: ["产品", "数据分析"],
  cities: ["深圳", "香港"],
  recruitmentTypes: ["graduate"],
  focusCompanies: ["腾讯"],
  excludedKeywords: ["销售"],
};

const job: Job = {
  id: "1", company: "腾讯", title: "产品经理（2027届校招）", location: "深圳", salary: "面议",
  experience: "应届生", education: "本科", source: "腾讯招聘", publishedAt: "今天", match: 0,
  tags: ["校招", "产品"], description: "面向 2027 年毕业生，参与数据分析。", applyUrl: "https://example.com", saved: false,
};

describe("job preference matching", () => {
  it("keeps preference score separate and ranks matching jobs", () => {
    expect(matchJobPreferences(job, preferences)).toMatchObject({ eligible: true, score: 100, level: "S" });
  });

  it("blocks exclusion keywords and hard preference mismatches", () => {
    const result = matchJobPreferences({ ...job, title: "销售培训生", description: "2026届，工作地点北京" }, preferences);
    expect(result.eligible).toBe(false);
    expect(result.blockedBy).toContain("命中排除关键词");
    expect(result.blockedBy).toContain("届别不匹配");
  });

  it("expands a catalog direction into common title synonyms", () => {
    const result = matchJobPreferences({ ...job, company: "某集团", title: "经营分析培训生", description: "面向校招生", tags: ["校招"] }, {
      ...preferences,
      graduationYear: "",
      roleKeywords: ["数据分析"],
      cities: ["深圳"],
      focusCompanies: [],
      excludedKeywords: [],
    });
    expect(result.eligible).toBe(true);
    expect(result.reasons).toContain("岗位方向匹配");
  });
});
