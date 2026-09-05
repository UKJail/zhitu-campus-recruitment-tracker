import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), reserve: vi.fn(), complete: vi.fn(), release: vi.fn(), analyze: vi.fn(), parse: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getAuthenticatedUserId: mocks.auth }));
vi.mock("@/lib/ai/quota", () => ({ reserveAIUsage: mocks.reserve, completeAIUsage: mocks.complete, releaseAIUsage: mocks.release }));
vi.mock("@/lib/ai/provider", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/ai/provider")>(),
  getAIProvider: () => ({ analyzeResume: mocks.analyze, parseResume: mocks.parse }),
}));
import { POST } from "./route";

const resumeId = "11111111-1111-4111-8111-111111111111";
const runId = "22222222-2222-4222-8222-222222222222";
const taskId = "33333333-3333-4333-8333-333333333333";
const operationId = "44444444-4444-4444-8444-444444444444";
const quota = { limit: 20, used: 1, remaining: 19, resetAt: "2026-09-07T00:00:00+08:00" };
const analysis = { score: 70, matchedKeywords: [], missingKeywords: [], risks: [], suggestions: [] };
const structured = { basics: { name: null, email: null, phones: [], location: null, summary: null }, education: [], experiences: [], projects: [], skills: [], languages: [], uncertainItems: [] };

function request() {
  return new Request("https://example.com/api/ai/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resumeId, operationId, jobDescription: "我们需要能够整理数据、核对样本和编写报告的应届毕业生。" }) });
}

function fixture(cachedOutput: unknown = null, cachedError: unknown = null) {
  const writes: Array<{ table: string; value: Record<string, unknown> }> = [];
  const from = vi.fn((table: string) => {
    const chain = {
      select: vi.fn(() => chain), eq: vi.fn(() => chain),
      insert: vi.fn((value: Record<string, unknown>) => { writes.push({ table, value }); return chain; }),
      update: vi.fn((value: Record<string, unknown>) => { writes.push({ table, value }); return chain; }),
      single: vi.fn(async () => ({ data: table === "resumes" ? { id: resumeId, parsed_text: "参与课程项目，整理样本并提交报告。", parse_status: "ready", structured_data: structured } : { id: runId }, error: null })),
      maybeSingle: vi.fn(async () => ({ data: cachedOutput === null ? null : { id: runId, output: cachedOutput }, error: cachedError })),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({ error: null })),
    };
    return chain;
  });
  mocks.auth.mockResolvedValue({ userId: "owner", supabase: { from } });
  return { writes };
}

describe("analysis cache and settlement recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.reserve.mockResolvedValue({ allowed: true, reserved: true, cached: false, taskId, resultRunId: null, quota });
    mocks.complete.mockResolvedValue(quota);
    mocks.release.mockResolvedValue(quota);
    mocks.analyze.mockResolvedValue(analysis);
  });

  it.each([null, { broken: true }])("does not release or re-reserve a completed task when cached output is unusable (%j)", async (output) => {
    const { writes } = fixture(output);
    mocks.reserve.mockResolvedValue({ allowed: true, reserved: false, cached: true, taskId, resultRunId: runId, quota });
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("AI_RESULT_UNAVAILABLE");
    expect(mocks.reserve).toHaveBeenCalledTimes(1);
    expect(mocks.release).not.toHaveBeenCalled();
    expect(mocks.analyze).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });

  it("treats a deleted result reference as unavailable, not as an in-progress task", async () => {
    fixture();
    mocks.reserve.mockResolvedValue({ allowed: true, reserved: false, cached: true, taskId, resultRunId: null, quota });
    const response = await POST(request());
    expect((await response.json()).code).toBe("AI_RESULT_UNAVAILABLE");
  });

  it("does not spend another task when reading a valid cache fails temporarily", async () => {
    fixture(null, { message: "offline" });
    mocks.reserve.mockResolvedValue({ allowed: true, reserved: false, cached: true, taskId, resultRunId: runId, quota });
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe("AI_RESULT_TEMPORARILY_UNAVAILABLE");
    expect(mocks.reserve).toHaveBeenCalledTimes(1);
  });

  it("returns a valid cache without a new execution or settlement", async () => {
    fixture(analysis);
    mocks.reserve.mockResolvedValue({ allowed: true, reserved: false, cached: true, taskId, resultRunId: runId, quota });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect((await response.json()).cached).toBe(true);
    expect(mocks.analyze).not.toHaveBeenCalled();
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it("retries only the idempotent settlement when its first response was lost", async () => {
    const { writes } = fixture();
    mocks.complete.mockRejectedValueOnce(new Error("response lost")).mockResolvedValueOnce(quota);
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.analyze).toHaveBeenCalledTimes(1);
    expect(mocks.complete).toHaveBeenCalledTimes(2);
    expect(mocks.complete).toHaveBeenNthCalledWith(1, expect.anything(), taskId, runId);
    expect(mocks.complete).toHaveBeenNthCalledWith(2, expect.anything(), taskId, runId);
    expect(writes.some((write) => write.value.status === "failed")).toBe(false);
    expect(mocks.release).not.toHaveBeenCalled();
  });

  it("keeps saved output and the reservation when settlement remains uncertain", async () => {
    const { writes } = fixture();
    mocks.complete.mockRejectedValue(new Error("response lost"));
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "AI_QUOTA_SETTLEMENT_PENDING", runId });
    expect(writes.some((write) => write.value.status === "completed")).toBe(true);
    expect(writes.some((write) => write.value.status === "failed")).toBe(false);
    expect(mocks.release).not.toHaveBeenCalled();
  });

  it("still marks an actual generation failure and returns the unused reservation", async () => {
    const { writes } = fixture();
    mocks.analyze.mockRejectedValue(new Error("provider failure"));
    expect((await POST(request())).status).toBe(400);
    expect(writes.some((write) => write.value.status === "failed")).toBe(true);
    expect(mocks.release).toHaveBeenCalledWith(expect.anything(), taskId);
    expect(mocks.complete).not.toHaveBeenCalled();
  });
});
