import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), quota: vi.fn(), reconcile: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getAuthenticatedUserId: mocks.auth }));
vi.mock("@/lib/ai/quota", () => ({ getAIQuota: mocks.quota }));
vi.mock("@/lib/ai/quota-reconciliation", () => ({ reconcileAIUsageForUser: mocks.reconcile }));
import { GET } from "./route";

const quota = { limit: 20, used: 4, remaining: 16, resetAt: "2026-09-09T00:00:00+08:00" };
const settled = { completed: 1, released: 0, examined: 1, skippedLocked: 0 };

describe("GET /api/ai/quota reconciliation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.auth.mockResolvedValue({ userId: "owner", supabase: {} });
    mocks.quota.mockResolvedValue(quota);
    mocks.reconcile.mockResolvedValue(settled);
  });
  it("authenticates before any maintenance or quota read", async () => {
    mocks.auth.mockResolvedValue({ userId: null, supabase: {} });
    expect((await GET()).status).toBe(401);
    expect(mocks.reconcile).not.toHaveBeenCalled();
    expect(mocks.quota).not.toHaveBeenCalled();
  });
  it("reconciles first, then returns the uncached quota", async () => {
    const response = await GET();
    expect(await response.json()).toEqual({ quota });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.reconcile.mock.invocationCallOrder[0]).toBeLessThan(mocks.quota.mock.invocationCallOrder[0]);
  });
  it("does not misrepresent old quota after a failed reconciliation", async () => {
    mocks.reconcile.mockRejectedValue(new Error("private diagnostic must not escape"));
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "AI_QUOTA_TEMPORARILY_UNAVAILABLE" });
    expect(mocks.quota).not.toHaveBeenCalled();
  });
  it("waits for a busy account instead of presenting a partial settlement", async () => {
    mocks.reconcile.mockResolvedValue({ ...settled, skippedLocked: 1 });
    expect((await GET()).status).toBe(503);
    expect(mocks.quota).not.toHaveBeenCalled();
  });
  it("drains at most three full batches and refuses to report incomplete quota", async () => {
    mocks.reconcile.mockResolvedValue({ ...settled, examined: 100 });
    expect((await GET()).status).toBe(503);
    expect(mocks.reconcile).toHaveBeenCalledTimes(3);
    expect(mocks.quota).not.toHaveBeenCalled();
  });
  it("reads quota once the next catch-up batch is no longer full", async () => {
    mocks.reconcile.mockResolvedValueOnce({ ...settled, examined: 100 }).mockResolvedValueOnce(settled);
    expect((await GET()).status).toBe(200);
    expect(mocks.reconcile).toHaveBeenCalledTimes(2);
    expect(mocks.quota).toHaveBeenCalledTimes(1);
  });
  it("does not expose an internal quota-read error or cache an unavailable response", async () => {
    mocks.quota.mockRejectedValue(new Error("private diagnostic"));
    const response = await GET();
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(JSON.stringify(await response.json())).not.toContain("private diagnostic");
  });
});
