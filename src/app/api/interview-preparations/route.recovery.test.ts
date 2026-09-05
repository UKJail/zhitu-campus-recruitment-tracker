import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), reserve: vi.fn(), complete: vi.fn(), release: vi.fn(), prepare: vi.fn(), extract: vi.fn(), validate: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getAuthenticatedUserId: mocks.auth }));
vi.mock("@/lib/ai/quota", () => ({ reserveAIUsage: mocks.reserve, completeAIUsage: mocks.complete, releaseAIUsage: mocks.release }));
vi.mock("@/lib/resumes/parse", () => ({ extractResumeText: mocks.extract, validateResumeFile: mocks.validate }));
vi.mock("@/lib/ai/provider", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/ai/provider")>(),
  getAIProvider: () => ({ prepareInterview: mocks.prepare }),
}));
import { POST } from "./route";

const taskId = "11111111-1111-4111-8111-111111111111";
const runId = "22222222-2222-4222-8222-222222222222";
const preparationId = "33333333-3333-4333-8333-333333333333";
const quota = { limit: 20, used: 1, remaining: 19, resetAt: "" };
const result = { summary: "面试准备", roleSignals: ["数据", "分析", "沟通"], questions: Array.from({ length: 6 }, () => ({ category: "经历深挖", probability: "高", question: "介绍课程项目", why: "核对事实", evidence: [], answerFramework: ["背景", "行动"], sampleAnswer: "参与课程项目", followUps: [] })), riskWarnings: [], preparationChecklist: [] };

function request() {
  const file = new File(["resume"], "test.pdf", { type: "application/pdf" });
  Object.defineProperty(file, "arrayBuffer", { value: async () => new Uint8Array([1, 2]).buffer });
  const entries: Record<string, unknown> = { file, operationId: taskId, company: "示例公司", role: "分析实习生", jobDescription: "寻找能够整理样本、核对数据并撰写研究报告的应届毕业生。" };
  return { formData: async () => ({ get: (key: string) => entries[key] }) } as unknown as Request;
}

function fixture() {
  const writes: Array<{ table: string; action: string; value?: Record<string, unknown> }> = [];
  const upload = vi.fn().mockResolvedValue({ error: null });
  const remove = vi.fn().mockResolvedValue({ error: null });
  const from = vi.fn((table: string) => {
    const chain = {
      select: vi.fn(() => chain), eq: vi.fn(() => chain),
      insert: vi.fn((value: Record<string, unknown>) => { writes.push({ table, action: "insert", value }); return chain; }),
      update: vi.fn((value: Record<string, unknown>) => { writes.push({ table, action: "update", value }); return chain; }),
      delete: vi.fn(() => { writes.push({ table, action: "delete" }); return chain; }),
      single: vi.fn(async () => ({ data: table === "ai_runs" ? { id: runId } : { id: preparationId, result }, error: null })),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({ error: null })),
    };
    return chain;
  });
  mocks.auth.mockResolvedValue({ userId: "owner", supabase: { from, storage: { from: () => ({ upload, remove }) } } });
  return { writes, upload, remove };
}

describe("interview preparation settlement recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.extract.mockResolvedValue("课程项目整理样本并提交报告");
    mocks.prepare.mockResolvedValue(result);
    mocks.reserve.mockResolvedValue({ allowed: true, reserved: true, cached: false, taskId, resultRunId: null, quota });
    mocks.complete.mockResolvedValue(quota);
    mocks.release.mockResolvedValue(quota);
  });

  it("retries settlement without generating twice or deleting finished artifacts", async () => {
    const { writes, remove } = fixture();
    mocks.complete.mockRejectedValueOnce(new Error("lost response")).mockResolvedValueOnce(quota);
    expect((await POST(request())).status).toBe(201);
    expect(mocks.prepare).toHaveBeenCalledTimes(1);
    expect(mocks.complete).toHaveBeenCalledTimes(2);
    expect(writes.some((write) => write.action === "delete" || write.value?.status === "failed")).toBe(false);
    expect(remove).not.toHaveBeenCalled();
    expect(mocks.release).not.toHaveBeenCalled();
  });

  it("retains saved preparations, files and reservations if both settlement responses fail", async () => {
    const { writes, remove } = fixture();
    mocks.complete.mockRejectedValue(new Error("lost response"));
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "AI_QUOTA_SETTLEMENT_PENDING", preparationId });
    expect(writes.some((write) => write.action === "delete" || write.value?.status === "failed")).toBe(false);
    expect(remove).not.toHaveBeenCalled();
    expect(mocks.release).not.toHaveBeenCalled();
  });

  it("still removes an unfinished upload and releases quota after a real generation failure", async () => {
    const { writes, remove } = fixture();
    mocks.prepare.mockRejectedValue(new Error("provider failed"));
    expect((await POST(request())).status).toBe(400);
    expect(writes.some((write) => write.value?.status === "failed")).toBe(true);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(mocks.release).toHaveBeenCalledTimes(1);
  });
});
