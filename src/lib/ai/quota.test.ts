import { beforeEach, describe, expect, it, vi } from "vitest";
import { completeAIUsage, getAIQuota, releaseAIUsage, reserveAIUsage } from "./quota";

const quota = {
  limit: 20,
  used: 3,
  remaining: 17,
  resetAt: "2026-09-02T00:00:00+08:00",
};

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), getUser: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({ rpc: mocks.rpc }) }));
function sessionClient(rpc = vi.fn()) { return { rpc, auth: { getUser: mocks.getUser } } as never; }

describe("AI task quota client", () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.getUser.mockReset().mockResolvedValue({ data: { user: { id: "44444444-4444-4444-8444-444444444444" } }, error: null });
  });
  it("reserves one shared task with the expected idempotency arguments", async () => {
    const taskId = "11111111-1111-4111-8111-111111111111";
    const rpc = vi.fn().mockResolvedValue({
      data: {
        allowed: true,
        cached: false,
        reserved: true,
        taskId,
        taskStatus: "reserved",
        resultRunId: null,
        quota,
      },
      error: null,
    });

    mocks.rpc.mockImplementation(rpc);
    const result = await reserveAIUsage(sessionClient(), {
      kind: "resume_optimization",
      operationKey: "22222222-2222-4222-8222-222222222222",
      inputFingerprint: "resume-jd-fingerprint",
    });

    expect(result.taskId).toBe(taskId);
    expect(rpc).toHaveBeenCalledWith("reserve_ai_usage_server", {
      p_user_id: "44444444-4444-4444-8444-444444444444",
      p_kind: "resume_optimization",
      p_operation_key: "22222222-2222-4222-8222-222222222222",
      p_input_fingerprint: "resume-jd-fingerprint",
      p_force_new: false,
    });
  });

  it("reads, completes and releases against the same shared quota", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: quota, error: null });
    mocks.rpc.mockImplementation(rpc);
    const client = sessionClient(rpc);

    await expect(getAIQuota(client)).resolves.toEqual(quota);
    await expect(completeAIUsage(client, "11111111-1111-4111-8111-111111111111", "33333333-3333-4333-8333-333333333333")).resolves.toEqual(quota);
    await expect(releaseAIUsage(client, "11111111-1111-4111-8111-111111111111")).resolves.toEqual(quota);
    expect(rpc).toHaveBeenCalledWith("release_ai_usage_server", { p_user_id: "44444444-4444-4444-8444-444444444444", p_task_id: "11111111-1111-4111-8111-111111111111" });
  });

  it("does not silently accept a failed reservation", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "rpc failed" } });
    mocks.rpc.mockImplementation(rpc);
    await expect(reserveAIUsage(sessionClient(), {
      kind: "interview_prep",
      operationKey: "22222222-2222-4222-8222-222222222222",
      inputFingerprint: "interview-fingerprint",
      forceNew: true,
    })).rejects.toThrow("AI 任务额度预留失败");
  });

  it("refuses mutations when the session user no longer exists", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { message: "deleted" } });
    await expect(releaseAIUsage(sessionClient(), "11111111-1111-4111-8111-111111111111")).rejects.toThrow("请先登录");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("does not treat an existing reserved task as another execution lease", async () => {
    mocks.rpc.mockResolvedValue({ data: { allowed: true, cached: false, reserved: false,
      taskId: "11111111-1111-4111-8111-111111111111", taskStatus: "reserved", resultRunId: null, quota }, error: null });
    const result = await reserveAIUsage(sessionClient(), { kind: "interview_prep", operationKey: "22222222-2222-4222-8222-222222222222", inputFingerprint: "fingerprint" });
    expect(result.reserved).toBe(false);
  });
});
