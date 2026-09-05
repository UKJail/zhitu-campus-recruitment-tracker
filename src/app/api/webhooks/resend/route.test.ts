import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({ verify: vi.fn(), receive: vi.fn(), from: vi.fn(), rpc: vi.fn() }));
vi.mock("resend", () => ({ Resend: class {
  webhooks = { verify: mocks.verify };
  emails = { receiving: { get: mocks.receive } };
} }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({ from: mocks.from, rpc: mocks.rpc }) }));

const event = { type: "email.received", created_at: "2026-09-06T00:00:00Z", data: {
  email_id: "provider-mail-1", created_at: "2026-09-06T00:00:00Z", from: "hr@example.com",
  to: ["owner-alias@in.example.com"], subject: "面试邀请",
} };
function request() {
  return new Request("https://zhitutracker.com/api/webhooks/resend", {
    method: "POST", body: JSON.stringify(event),
    headers: { "svix-id": "event-1", "svix-timestamp": "1", "svix-signature": "mock-signature" },
  });
}
function query(data: unknown, error: unknown = null) {
  const result = { data, error };
  const chain = { select: vi.fn(), eq: vi.fn(), in: vi.fn(), not: vi.fn(), limit: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
    then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
  };
  for (const method of [chain.select, chain.eq, chain.in, chain.not, chain.limit]) method.mockReturnValue(chain);
  return chain;
}

describe("Resend transactional webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-06T00:00:00Z"));
    vi.stubEnv("RESEND_API_KEY", "mock-key");
    vi.stubEnv("RESEND_WEBHOOK_SECRET", "mock-secret");
    mocks.verify.mockResolvedValue(event);
    mocks.receive.mockResolvedValue({ data: { text: "面试时间 2026年9月10日 14:30", html: null }, error: null });
    mocks.from.mockImplementation((table) => {
      if (table === "inbound_emails") return query(null);
      if (table === "profiles") return query([{ id: "owner-a", inbound_alias: "owner-alias" }]);
      if (table === "applications") return query([]);
      throw new Error(`Unexpected separate write to ${table}`);
    });
    mocks.rpc.mockResolvedValue({ data: { id: "mail-a", duplicate: false }, error: null });
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

  it("sends the email and both notifications to one transaction", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    const [name, args] = mocks.rpc.mock.calls[0];
    expect(name).toBe("store_inbound_email_with_notifications");
    expect(args.p_email).toMatchObject({ user_id: "owner-a", provider_id: "provider-mail-1" });
    expect(args.p_notifications).toHaveLength(2);
    expect(args.p_notifications.every((item: { user_id: string }) => item.user_id === "owner-a")).toBe(true);
    expect(args.p_notifications[1].scheduled_for).toBe("2026-09-09T06:30:00.000Z");
    expect(mocks.from).not.toHaveBeenCalledWith("notifications");
  });

  it("returns a retryable failure when the atomic save fails, then retries the entire save", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "notification insert failed" } });
    expect((await POST(request())).status).toBe(503);
    expect((await POST(request())).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });

  it("handles concurrent duplicate delivery reported by the transaction", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { id: "mail-a", duplicate: true }, error: null });
    expect(await (await POST(request())).json()).toEqual({ accepted: true, duplicate: true });
  });

  it("does not redeliver notifications for an already stored email", async () => {
    mocks.from.mockReturnValueOnce(query({ id: "mail-a" }));
    expect(await (await POST(request())).json()).toEqual({ accepted: true, duplicate: true });
    expect(mocks.receive).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("retries lookup failures instead of permanently storing unmatched mail", async () => {
    mocks.from.mockImplementation((table) => {
      if (table === "inbound_emails") return query(null);
      if (table === "profiles") return query([{ id: "owner-a", inbound_alias: "owner-alias" }]);
      return query(null, { message: "database unavailable" });
    });
    expect((await POST(request())).status).toBe(503);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rejects unsigned requests without database access", async () => {
    mocks.verify.mockRejectedValueOnce(new Error("invalid signature"));
    expect((await POST(request())).status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
