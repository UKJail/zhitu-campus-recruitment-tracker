// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { bindAIUsageRun, reconcileAIUsageBatch, reconcileAIUsageForUser } from "./quota-reconciliation";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), getUser: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({ rpc: mocks.rpc }) }));
const userId = "44444444-4444-4444-8444-444444444444";
const taskId = "11111111-1111-4111-8111-111111111111";
const runId = "33333333-3333-4333-8333-333333333333";
const client = { auth: { getUser: mocks.getUser } } as never;
const stats = { completed: 1, released: 0, examined: 1, skippedLocked: 0 };

describe("server-only AI quota reconciliation", () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.getUser.mockReset().mockResolvedValue({ data: { user: { id: userId } }, error: null });
  });
  it("binds a verified owner to an exact run before generation", async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    await bindAIUsageRun(client, taskId, runId);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("bind_ai_usage_run_server", {
      p_user_id: userId, p_task_id: taskId, p_run_id: runId,
    });
  });
  it.each([{ data: false, error: null }, { data: null, error: { message: "unavailable" } }])(
    "fails closed on an uncertain bind", async (response) => {
      mocks.rpc.mockResolvedValue(response);
      await expect(bindAIUsageRun(client, taskId, runId)).rejects.toThrow("尚未开始生成");
    },
  );
  it("never accepts a missing or revoked identity", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(bindAIUsageRun(client, taskId, runId)).rejects.toThrow("请先登录");
    await expect(reconcileAIUsageForUser(client)).rejects.toThrow("请先登录");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("rejects malformed IDs before accessing credentials", async () => {
    await expect(bindAIUsageRun(client, "bad-id", runId)).rejects.toThrow();
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("bounds background batches and returns counts only", async () => {
    mocks.rpc.mockResolvedValue({ data: { ...stats, privateOutput: "discard" }, error: null });
    await expect(reconcileAIUsageBatch()).resolves.toEqual(stats);
    expect(mocks.rpc).toHaveBeenCalledWith("reconcile_ai_usage_server", { p_limit: 50 });
    for (const limit of [0, 101, 1.5, Number.NaN]) await expect(reconcileAIUsageBatch(limit)).rejects.toThrow();
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it("scopes user reconciliation to a verified session", async () => {
    mocks.rpc.mockResolvedValue({ data: stats, error: null });
    await expect(reconcileAIUsageForUser(client)).resolves.toEqual(stats);
    expect(mocks.rpc).toHaveBeenCalledWith("reconcile_ai_usage_server", { p_user_id: userId, p_limit: 100 });
  });
  it("does not hide failed or malformed reconciliation responses", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "db" } })
      .mockResolvedValueOnce({ data: { completed: -1 }, error: null });
    await expect(reconcileAIUsageBatch()).rejects.toThrow("对账暂时失败");
    await expect(reconcileAIUsageBatch()).rejects.toThrow();
  });
});
