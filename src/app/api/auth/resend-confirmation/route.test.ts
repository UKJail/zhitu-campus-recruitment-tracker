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

  it("does not reveal whether the email is already registered", async () => {
    resendMocks.resend.mockResolvedValue({ error: { code: "email_confirmed", status: 422 } });

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
});
