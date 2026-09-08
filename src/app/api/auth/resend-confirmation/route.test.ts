import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetRegistrationRateLimitForTests } from "@/lib/auth/registration-rate-limit";
import { POST } from "./route";

const resendMocks = vi.hoisted(() => ({ resend: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => ({ auth: { resend: resendMocks.resend } }),
}));

function request(body: unknown) {
  return new Request("http://localhost/api/auth/resend-confirmation", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.9" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/resend-confirmation", () => {
  beforeEach(() => {
    resetRegistrationRateLimitForTests();
    resendMocks.resend.mockReset();
    process.env.APP_URL = "https://zhitutracker.com";
  });

  afterEach(() => {
    delete process.env.APP_URL;
  });

  it("requests a new signup confirmation with the public redirect", async () => {
    resendMocks.resend.mockResolvedValue({ error: null });

    const response = await POST(request({ email: " Candidate@Example.com " }));

    expect(response.status).toBe(200);
    expect(resendMocks.resend).toHaveBeenCalledWith({
      type: "signup",
      email: "candidate@example.com",
      options: { emailRedirectTo: "https://zhitutracker.com/auth/callback?next=/app" },
    });
    expect(await response.json()).toMatchObject({ accepted: true });
  });

  it.each(["email_confirmed", "user_not_found", "user_already_exists", "email_exists"])("does not reveal account state %s", async (code) => {
    resendMocks.resend.mockResolvedValue({ error: { code, status: 422 } });

    const response = await POST(request({ email: "existing@example.com" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      accepted: true,
      message: "如果账号尚未确认，新的验证邮件会发送到该邮箱；如果已经注册或确认，请直接登录或找回密码。",
    });
  });

  it("rejects malformed email addresses before contacting auth", async () => {
    const response = await POST(request({ email: "not-an-email" }));

    expect(response.status).toBe(400);
    expect(resendMocks.resend).not.toHaveBeenCalled();
  });

  it("reports a provider outage without exposing provider details", async () => {
    resendMocks.resend.mockResolvedValue({ error: { code: "smtp_failed", status: 500 } });

    const response = await POST(request({ email: "candidate@example.com" }));

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "验证邮件服务暂时不可用" });
  });

  it.each([
    { name: "AuthRetryableFetchError", message: "fetch failed: private-provider-detail", status: 0 },
    { name: "AuthFetchError", message: "network unavailable: private-provider-detail" },
    { message: "request timed out: private-provider-detail", status: 408 },
  ])("does not disguise an SDK transport failure as accepted: %j", async (error) => {
    resendMocks.resend.mockResolvedValue({ error });
    const response = await POST(request({ email: "candidate@example.com" }));
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ error: "验证邮件服务暂时不可用" });
    expect(resendMocks.resend).toHaveBeenCalledTimes(1);
  });

  it.each([
    { code: "email_address_not_authorized", status: 422 },
    { code: "bad_jwt", status: 401 },
    { code: "email_provider_disabled", status: 422 },
    { code: "captcha_failed", status: 403 },
    { code: "unrecognized_failure", status: 422 },
    { code: "user_not_found", status: 0 },
    { code: "email_confirmed", status: 500 },
    { code: "unknown_failure" },
  ])("fails clearly on configuration/unknown failure instead of returning success: %j", async (error) => {
    resendMocks.resend.mockResolvedValue({ error: { ...error, message: "private-provider-detail" } });
    const response = await POST(request({ email: "candidate@example.com" }));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "验证邮件服务暂时不可用" });
    expect(resendMocks.resend).toHaveBeenCalledTimes(1);
  });

  it.each([{ status: 429 }, { code: "over_email_send_rate_limit", status: 422 }, { code: "over_request_rate_limit", status: 400 }])("preserves provider rate limits and retry headers: %j", async (error) => {
    resendMocks.resend.mockResolvedValue({ error });
    const response = await POST(request({ email: "candidate@example.com" }));
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(await response.json()).toEqual({ error: "发送次数过多，请稍后再试" });
  });

  it("reports a thrown network error without automatically sending a second code", async () => {
    resendMocks.resend.mockRejectedValue(new Error("fetch failed: private-provider-detail"));
    const response = await POST(request({ email: "candidate@example.com" }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "验证邮件服务暂时不可用" });
    expect(resendMocks.resend).toHaveBeenCalledTimes(1);
  });

  it("still blocks the eleventh send before contacting the provider", async () => {
    resendMocks.resend.mockResolvedValue({ error: null });
    for (let i = 0; i < 10; i += 1) await POST(request({ email: "candidate@example.com" }));
    const response = await POST(request({ email: "candidate@example.com" }));
    expect(response.status).toBe(429);
    expect(Number(response.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(resendMocks.resend).toHaveBeenCalledTimes(10);
  });
});
