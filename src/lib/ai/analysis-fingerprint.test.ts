import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { analysisFingerprint, matchesResumeAnalysis } from "./analysis-fingerprint";

const input = {
  resumeId: "11111111-1111-4111-8111-111111111111",
  resumeText: "参与课程项目，使用 Excel 整理样本并提交分析报告。",
  jobDescription: "寻找能够整理样本、核对数据并撰写研究报告的应届毕业生。",
  targetCompany: "示例公司",
  targetRole: "分析实习生",
};

function v2Run() {
  return {
    input_fingerprint: createHash("sha256").update(JSON.stringify({
      version: "resume-optimization-v2",
      resumeText: input.resumeText,
      jobDescription: input.jobDescription,
      targetCompany: input.targetCompany,
      targetRole: input.targetRole,
    })).digest("hex"),
    output: { context: { ...input } },
  };
}

describe("resume analysis fingerprint", () => {
  it("shares the exact fingerprint between analysis and document generation", () => {
    expect(matchesResumeAnalysis(input, { input_fingerprint: analysisFingerprint(input), output: {} })).toBe(true);
  });

  it.each(["resumeId", "resumeText", "jobDescription", "targetCompany", "targetRole"] as const)("rejects a changed %s", (field) => {
    const changed = { ...input, [field]: `${input[field]}-changed` };
    expect(matchesResumeAnalysis(changed, { input_fingerprint: analysisFingerprint(input), output: {} })).toBe(false);
  });

  it("normalizes outer whitespace in JD and target fields only", () => {
    expect(analysisFingerprint({ ...input, jobDescription: ` ${input.jobDescription}\n`, targetCompany: ` ${input.targetCompany} ` })).toBe(analysisFingerprint(input));
  });

  it("allows v2 only when saved context proves the exact document and target", () => {
    expect(matchesResumeAnalysis(input, v2Run())).toBe(true);
    expect(matchesResumeAnalysis(input, { ...v2Run(), output: {} })).toBe(false);
    expect(matchesResumeAnalysis(input, { ...v2Run(), output: { context: { ...input, resumeId: "another-document" } } })).toBe(false);
  });

  it("does not accept legacy hashes which cannot prove the source text and target", () => {
    const legacy = createHash("sha256").update(`${input.resumeId}\n${input.jobDescription}`).digest("hex");
    expect(matchesResumeAnalysis(input, { input_fingerprint: legacy, output: {} })).toBe(false);
  });
});
