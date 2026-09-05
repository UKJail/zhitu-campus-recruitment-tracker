import { beforeEach, describe, expect, it, vi } from "vitest";
import { analysisFingerprint } from "@/lib/ai/analysis-fingerprint";

const { getAuthenticatedUserId, patchResumeTemplateDocx } = vi.hoisted(() => ({
  getAuthenticatedUserId: vi.fn(),
  patchResumeTemplateDocx: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ getAuthenticatedUserId }));
vi.mock("@/lib/resumes/template-docx", () => ({ patchResumeTemplateDocx }));

import { POST } from "./route";

const resumeId = "11111111-1111-4111-8111-111111111111";
const analysisRunId = "22222222-2222-4222-8222-222222222222";
const userId = "33333333-3333-4333-8333-333333333333";
const input = {
  resumeId,
  analysisRunId,
  acceptedSuggestionIndexes: [0],
  jobDescription: "寻找能够整理样本、核对数据并撰写研究报告的应届毕业生。",
  targetCompany: "示例公司",
  targetRole: "分析实习生",
  truthConfirmed: true,
};
const resumeText = "参与课程项目，使用 Excel 整理样本并提交分析报告。";
const revisedText = "在课程项目中使用 Excel 整理样本，参与撰写并提交分析报告。";

function request(body: unknown = input) {
  return new Request("http://localhost/api/ai/generate-resume", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

function fixture() {
  const resume = { id: resumeId, parsed_text: resumeText, parse_status: "ready", mime_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", storage_path: `${userId}/resume.docx` };
  const run = {
    id: analysisRunId, kind: "job_match", status: "completed",
    input_fingerprint: analysisFingerprint({ ...input, resumeText }),
    output: {
      score: 70, matchedKeywords: [], missingKeywords: [], risks: [],
      suggestions: [{ section: "项目经历", original: resumeText, revised: revisedText, reason: "表达更清晰", impact: "中", requiresConfirmation: true }],
    },
  };
  const writes: Array<{ table: string; value: unknown }> = [];
  const filters: Array<[string, string, unknown]> = [];
  const download = vi.fn().mockResolvedValue({ data: new Blob(["template"]), error: null });
  const from = vi.fn((table: string) => {
    let operation = "select";
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn((field: string, value: unknown) => { filters.push([table, field, value]); return chain; }),
      insert: vi.fn((value: unknown) => { operation = "insert"; writes.push({ table, value }); return chain; }),
      update: vi.fn(() => chain),
      single: vi.fn(async () => ({
        data: table === "resumes" ? resume : table === "ai_runs" && operation === "select" ? run : { id: "44444444-4444-4444-8444-444444444444", created_at: "2026-09-06T00:00:00Z" },
        error: null,
      })),
    };
    return chain;
  });
  getAuthenticatedUserId.mockResolvedValue({ userId, supabase: { from, storage: { from: () => ({ download }) } } });
  return { resume, run, writes, filters, download };
}

describe("POST /api/ai/generate-resume", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    patchResumeTemplateDocx.mockResolvedValue(new Uint8Array([1]));
  });

  it("generates from a current analysis without asking the user to analyze again", async () => {
    const { writes, filters } = fixture();
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(patchResumeTemplateDocx).toHaveBeenCalledWith(expect.any(Uint8Array), [{ original: resumeText, revised: revisedText }]);
    expect(writes.find((write) => write.table === "resume_versions")?.value).toMatchObject({
      resume_id: resumeId, user_id: userId,
      content: { meta: { replacements: [{ original: resumeText, revised: revisedText }] } },
    });
    expect(filters).toContainEqual(["resumes", "user_id", userId]);
    expect(filters).toContainEqual(["ai_runs", "user_id", userId]);
  });

  it.each(["jobDescription", "targetCompany", "targetRole"] as const)("rejects changes to %s before reading or writing a document", async (field) => {
    const { writes, download } = fixture();
    const response = await POST(request({ ...input, [field]: `${input[field]}不同` }));
    expect(response.status).toBe(409);
    expect(writes).toEqual([]);
    expect(download).not.toHaveBeenCalled();
  });

  it("rejects outdated analysis fingerprints with a clear reanalysis message", async () => {
    const { run, writes } = fixture();
    run.input_fingerprint = "outdated-fingerprint";
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain("请重新分析");
    expect(writes).toEqual([]);
  });

  it("does not silently change confirmed text when patching is impossible", async () => {
    const { writes } = fixture();
    patchResumeTemplateDocx.mockRejectedValue(new Error("原模板中找不到要替换的文字"));
    const response = await POST(request());
    expect(response.status).toBe(400);
    expect(writes).toEqual([]);
  });

  it("requires authentication", async () => {
    getAuthenticatedUserId.mockResolvedValue({ userId: null, supabase: {} });
    expect((await POST(request())).status).toBe(401);
  });
});
