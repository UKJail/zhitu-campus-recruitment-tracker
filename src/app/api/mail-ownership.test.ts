import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as getInboundEmails } from "./inbound-emails/route";
import { GET as getNotifications } from "./notifications/route";
import { DELETE as deleteNotification } from "./notifications/[id]/route";

const authMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/server", () => ({
  getAuthenticatedUserId: authMock,
}));

function queryResult(data: unknown[] = []) {
  const eq = vi.fn();
  const query = {
    data,
    error: null,
    select: vi.fn(),
    eq,
    is: vi.fn(),
    or: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    delete: vi.fn(),
    maybeSingle: vi.fn(),
  };
  for (const method of [query.select, query.eq, query.is, query.or, query.order, query.limit, query.delete]) method.mockReturnValue(query);
  query.maybeSingle.mockResolvedValue({ data: data[0] ?? null, error: null });
  return query;
}

describe("authenticated mail API ownership", () => {
  beforeEach(() => authMock.mockReset());

  it("filters inbound email records by the current user before returning them", async () => {
    const query = queryResult();
    authMock.mockResolvedValue({ supabase: { from: vi.fn(() => query) }, userId: "testing-user" });

    expect((await getInboundEmails()).status).toBe(200);
    expect(query.eq).toHaveBeenCalledWith("user_id", "testing-user");
  });

  it("filters notifications by the same current user", async () => {
    const query = queryResult();
    authMock.mockResolvedValue({ supabase: { from: vi.fn(() => query) }, userId: "admin-user" });

    expect((await getNotifications()).status).toBe(200);
    expect(query.eq).toHaveBeenCalledWith("user_id", "admin-user");
  });

  it("returns no account data when there is no authenticated user", async () => {
    authMock.mockResolvedValue({ supabase: null, userId: null });

    expect((await getInboundEmails()).status).toBe(401);
    expect((await getNotifications()).status).toBe(401);
  });

  it("deletes notifications only for the current user", async () => {
    const query = queryResult([{ id: "notice-1" }]);
    authMock.mockResolvedValue({ supabase: { from: vi.fn(() => query) }, userId: "testing-user" });

    const response = await deleteNotification(new Request("http://localhost/api/notifications/notice-1"), {
      params: Promise.resolve({ id: "notice-1" }),
    });

    expect(response.status).toBe(200);
    expect(query.delete).toHaveBeenCalled();
    expect(query.eq).toHaveBeenCalledWith("id", "notice-1");
    expect(query.eq).toHaveBeenCalledWith("user_id", "testing-user");
  });
});
