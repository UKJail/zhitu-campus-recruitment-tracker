import { describe, expect, it, vi } from "vitest";
import { completeAIUsage, getAIQuota, releaseAIUsage, reserveAIUsage } from "./quota";

const quota = {
  limit: 20,
  used: 3,
  remaining: 17,
  resetAt: "2026-09-02T00:00:00+08:00",
};

describe("AI task quota client", () => {
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

    const result = await reserveAIUsage({ rpc } as never, {
      kind: "resume_optimization",
      operationKey: "22222222-2222-4222-8222-222222222222",
      inputFingerprint: "resume-jd-fingerprint",
    });

    expect(result.taskId).toBe(taskId);
    expect(rpc).toHaveBeenCalledWith("reserve_ai_usage", {
      p_kind: "resume_optimization",
      p_operation_key: "22222222-2222-4222-8222-222222222222",
      p_input_fingerprint: "resume-jd-fingerprint",
      p_force_new: false,
    });
  });

  it("reads, completes and releases against the same shared quota", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: quota, error: null });
    const client = { rpc } as never;

    await expect(getAIQuota(client)).resolves.toEqual(quota);
    await expect(completeAIUsage(client, "11111111-1111-4111-8111-111111111111", "33333333-3333-4333-8333-333333333333")).resolves.toEqual(quota);
    await expect(releaseAIUsage(client, "11111111-1111-4111-8111-111111111111")).resolves.toEqual(quota);
  });

  it("does not silently accept a failed reservation", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "rpc failed" } });
    await expect(reserveAIUsage({ rpc } as never, {
      kind: "interview_prep",
      operationKey: "22222222-2222-4222-8222-222222222222",
      inputFingerprint: "interview-fingerprint",
      forceNew: true,
    })).rejects.toThrow("AI 任务额度预留失败");
  });
});
