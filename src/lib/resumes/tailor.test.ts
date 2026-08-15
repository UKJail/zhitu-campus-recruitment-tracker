import { describe, expect, it } from "vitest";
import type { ResumeSuggestion, StructuredResume } from "@/lib/ai/provider";
import { buildTailoredResumeFromAccepted } from "./tailor";

const structured: StructuredResume = {
  basics: { name: "李同学", email: null, phones: [], location: "上海", summary: "具备产品与数据分析经验。" },
  education: [],
  experiences: [],
  projects: [{ name: "AI 求职平台", role: "个人项目", startDate: "2026.08", endDate: null, bullets: ["使用 Codex 完成页面搭建与代码调试。"], requiresConfirmation: false }],
  skills: [{ category: "AI 工具", items: ["熟练使用 Codex"] }],
  languages: [],
  uncertainItems: [],
};

describe("deterministic tailored resume", () => {
  it("只用已接受建议替换对应原文并保留来源", () => {
    const accepted: ResumeSuggestion[] = [{
      section: "项目经历",
      original: "使用 Codex 完成页面搭建与代码调试。",
      revised: "独立使用 Codex 完成页面搭建、功能实现与代码调试。",
      reason: "突出独立交付",
      impact: "高",
      requiresConfirmation: false,
    }];
    const output = buildTailoredResumeFromAccepted({ structured, acceptedSuggestions: accepted, targetCompany: "示例公司", targetRole: "AI 产品经理" });
    expect(output.projects[0].bullets[0]).toEqual({ text: accepted[0].revised, sourceIds: ["accepted.0"] });
    expect(output.skills[0].items[0].text).toBe("熟练使用 Codex");
  });

  it("未匹配到原字段的已接受建议仍进入对应章节", () => {
    const accepted: ResumeSuggestion[] = [{
      section: "项目经历",
      original: "完整项目描述",
      revised: "用户已确认的完整项目描述",
      reason: "补充项目信息",
      impact: "中",
      requiresConfirmation: true,
    }];
    const output = buildTailoredResumeFromAccepted({ structured, acceptedSuggestions: accepted, targetCompany: "示例公司", targetRole: "产品经理" });
    expect(output.projects[0].bullets.at(-1)).toEqual({ text: accepted[0].revised, sourceIds: ["accepted.0"] });
  });
});
