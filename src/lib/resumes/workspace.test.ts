import { describe, expect, it } from "vitest";
import { buildResumeWorkspace } from "./workspace";

const analysis = {
  score: 72,
  matchedKeywords: ["市场"],
  missingKeywords: ["游戏"],
  risks: [],
  suggestions: [{ section: "项目", original: "原文", revised: "建议", reason: "匹配", impact: "中", requiresConfirmation: false }],
};

describe("resume workspace restoration", () => {
  it("restores a generated version and its analysis without requiring the JD again", () => {
    const resumeId = "11111111-1111-4111-8111-111111111111";
    const runId = "22222222-2222-4222-8222-222222222222";
    const versionId = "33333333-3333-4333-8333-333333333333";
    const result = buildResumeWorkspace(resumeId, {
      id: versionId,
      created_at: "2026-08-14T00:00:00Z",
      content: { meta: { targetCompany: "腾讯", targetRole: "市场营销", analysisRunId: runId, acceptedSuggestionIndexes: [0] } },
    }, [{ id: runId, output: analysis }]);

    expect(result.analysis?.score).toBe(72);
    expect(result.targetCompany).toBe("腾讯");
    expect(result.generatedVersion?.downloadUrl).toContain(versionId);
  });

  it("restores an analysis-only workspace from its persisted context", () => {
    const resumeId = "11111111-1111-4111-8111-111111111111";
    const runId = "22222222-2222-4222-8222-222222222222";
    const result = buildResumeWorkspace(resumeId, null, [{
      id: runId,
      output: { ...analysis, context: { resumeId, jobDescription: "完整岗位 JD 内容至少二十个字符", targetCompany: "腾讯", targetRole: "市场营销" } },
    }]);

    expect(result.analysisRunId).toBe(runId);
    expect(result.jobDescription).toContain("岗位 JD");
    expect(result.generatedVersion).toBeNull();
  });
});
