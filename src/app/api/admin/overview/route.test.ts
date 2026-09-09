import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({ access: vi.fn(), from: vi.fn(), listUsers: vi.fn() }));
vi.mock("@/lib/admin/access", () => ({ getAdminContext: mocks.access }));
const profile = { id: "test-admin", display_name: "管理员", is_admin: true, ai_daily_limit: 50, created_at: "2026-09-09" };
const feedback = { id: "feedback", user_id: "test-admin", content: "测试反馈", created_at: "2026-09-09" };

describe("GET /api/admin/overview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.access.mockResolvedValue({ status: 200, admin: { from: mocks.from, auth: { admin: { listUsers: mocks.listUsers } } } });
    mocks.listUsers.mockResolvedValue({ data: { users: [{ id: profile.id, email: "admin@example.invalid" }] }, error: null });
    mocks.from.mockImplementation((table: string) => {
      if (table === "profiles") return { select: () => ({ order: () => Promise.resolve({ data: [profile], error: null }) }) };
      if (table === "user_feedback") return { select: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [feedback], error: null }) }) }) };
      throw new Error("Unexpected table read: " + table);
    });
  });

  it.each([401, 403])("rejects unauthorized access before reading data (%s)", async (status) => {
    mocks.access.mockResolvedValue({ status, error: "禁止访问" });
    expect((await GET()).status).toBe(status);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.listUsers).not.toHaveBeenCalled();
  });

  it("only reads account and feedback data, with no dependency on collection tables", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      users: [{ ...profile, email: "admin@example.invalid" }],
      feedback: [{ ...feedback, email: "admin@example.invalid" }],
    });
    expect(mocks.from.mock.calls.map(([table]) => table)).toEqual(["profiles", "user_feedback"]);
  });

  it("still reports failures in the retained account data", async () => {
    mocks.listUsers.mockResolvedValue({ data: null, error: { message: "offline" } });
    const response = await GET();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "管理员数据加载失败" });
  });
});
