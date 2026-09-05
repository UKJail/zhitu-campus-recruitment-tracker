import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE } from "./route";

const mocks = vi.hoisted(() => ({ access: vi.fn(), profile: vi.fn(), getUser: vi.fn(), removeUser: vi.fn(), files: vi.fn() }));
vi.mock("@/lib/admin/access", () => ({ getAdminContext: mocks.access }));
vi.mock("@/lib/admin/delete-user", () => ({ deleteUserFiles: mocks.files }));
const targetId = "10000000-0000-4000-8000-000000000001";
const actorId = "10000000-0000-4000-8000-000000000002";
const admin = {
  from: vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.profile }) }) })),
  auth: { admin: { getUserById: mocks.getUser, deleteUser: mocks.removeUser } },
};
const context = (id = targetId) => ({ params: Promise.resolve({ id }) });
const request = (confirmationEmail = "test@example.com") => new Request("https://zhitutracker.com/api/admin/users/" + targetId, {
  method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmationEmail }),
});

describe("admin user deletion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.access.mockResolvedValue({ status: 200, userId: actorId, admin });
    mocks.profile.mockResolvedValue({ data: { is_admin: false }, error: null });
    mocks.getUser.mockResolvedValue({ data: { user: { id: targetId, email: "test@example.com" } }, error: null });
    mocks.files.mockResolvedValue(undefined);
    mocks.removeUser.mockResolvedValue({ error: null });
  });
  it.each([401, 403])("blocks unauthorized callers (%s) before looking up users", async (status) => {
    mocks.access.mockResolvedValue({ status, error: "禁止访问" });
    expect((await DELETE(request(), context())).status).toBe(status);
    expect(admin.from).not.toHaveBeenCalled();
    expect(mocks.files).not.toHaveBeenCalled();
    expect(mocks.removeUser).not.toHaveBeenCalled();
  });
  it("blocks deleting oneself", async () => {
    expect((await DELETE(request(), context(actorId))).status).toBe(403);
    expect(admin.from).not.toHaveBeenCalled();
    expect(mocks.removeUser).not.toHaveBeenCalled();
  });
  it("protects other administrators", async () => {
    mocks.profile.mockResolvedValue({ data: { is_admin: true }, error: null });
    expect((await DELETE(request(), context())).status).toBe(403);
    expect(mocks.files).not.toHaveBeenCalled();
  });
  it("fails closed when permission lookup fails", async () => {
    mocks.profile.mockResolvedValue({ data: null, error: { message: "offline" } });
    expect((await DELETE(request(), context())).status).toBe(500);
    expect(mocks.files).not.toHaveBeenCalled();
  });
  it.each(["wrong@example.com", ""])('rejects mismatched or missing confirmation "%s"', async (email) => {
    expect((await DELETE(request(email), context())).status).toBe(400);
    expect(mocks.files).not.toHaveBeenCalled();
    expect(mocks.removeUser).not.toHaveBeenCalled();
  });
  it("rejects malformed IDs", async () => {
    expect((await DELETE(request(), context("../other"))).status).toBe(400);
    expect(admin.from).not.toHaveBeenCalled();
  });
  it("handles an already deleted account", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { status: 404 } });
    expect((await DELETE(request(), context())).status).toBe(404);
    expect(mocks.files).not.toHaveBeenCalled();
  });
  it("cleans files before deleting the exact confirmed account", async () => {
    const response = await DELETE(request(" Test@Example.com "), context());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.files).toHaveBeenCalledWith(admin, targetId);
    expect(mocks.removeUser).toHaveBeenCalledExactlyOnceWith(targetId);
    expect(mocks.files.mock.invocationCallOrder[0]).toBeLessThan(mocks.removeUser.mock.invocationCallOrder[0]);
    expect(await response.json()).toEqual({ deleted: true, id: targetId });
  });
  it("does not delete the account if file cleanup fails", async () => {
    mocks.files.mockRejectedValue(new Error("文件清理未完成"));
    expect((await DELETE(request(), context())).status).toBe(500);
    expect(mocks.removeUser).not.toHaveBeenCalled();
  });
  it("does not report success when auth deletion fails", async () => {
    mocks.removeUser.mockResolvedValue({ error: { message: "database unavailable" } });
    const response = await DELETE(request(), context());
    expect(response.status).toBe(500);
    expect((await response.json()).error).toContain("账号删除失败");
  });
});
