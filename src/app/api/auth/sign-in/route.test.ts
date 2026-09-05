import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { resetRegistrationRateLimitForTests } from "@/lib/auth/registration-rate-limit";

const authMocks = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signInWithOtp: vi.fn(),
  verifyOtp: vi.fn(),
  setSession: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAuthClient: () => ({ auth: authMocks }),
  createSupabaseServerClient: async () => ({ auth: { setSession: authMocks.setSession } }),
}));

function request(body: unknown) {
  return new Request("http://localhost/api/auth/sign-in", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/sign-in", () => {
  beforeEach(() => {
    resetRegistrationRateLimitForTests();
    authMocks.signInWithPassword.mockReset();
    authMocks.signInWithOtp.mockReset();
    authMocks.verifyOtp.mockReset();
    authMocks.setSession.mockReset();
    authMocks.setSession.mockResolvedValue({ error: null });
  });

  it("requests an OTP without creating a PKCE challenge", async () => {
    authMocks.signInWithOtp.mockResolvedValue({ data: { user: null, session: null }, error: null });

    const response = await POST(request({ method: "request-otp", email: " User@Example.com " }));

    expect(response.status).toBe(200);
    expect(authMocks.signInWithOtp).toHaveBeenCalledWith({
      email: "user@example.com",
      options: { shouldCreateUser: false },
    });
  });

  it("creates a server session after password authentication", async () => {
    authMocks.signInWithPassword.mockResolvedValue({ data: { session: { access_token: "token" } }, error: null });

    const response = await POST(request({ method: "password", email: " User@Example.com ", password: "secret" }));

    expect(response.status).toBe(200);
    expect(authMocks.signInWithPassword).toHaveBeenCalledWith({ email: "user@example.com", password: "secret" });
    expect(authMocks.setSession).toHaveBeenCalledWith({ access_token: "token", refresh_token: undefined });
  });

  it("creates a server session after OTP verification", async () => {
    authMocks.verifyOtp.mockResolvedValue({ data: { session: { access_token: "token" } }, error: null });

    const response = await POST(request({ method: "otp", email: "user@example.com", token: "123456" }));

    expect(response.status).toBe(200);
    expect(authMocks.verifyOtp).toHaveBeenCalledWith({ email: "user@example.com", token: "123456", type: "email" });
    expect(authMocks.setSession).toHaveBeenCalledWith({ access_token: "token", refresh_token: undefined });
  });

  it("rejects invalid credentials without exposing provider details", async () => {
    authMocks.signInWithPassword.mockResolvedValue({ data: { session: null }, error: new Error("provider detail") });

    const response = await POST(request({ method: "password", email: "user@example.com", password: "wrong" }));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: "认证服务未返回登录会话，请重新尝试", code: "missing_session" });
  });

  it("reports an unreachable auth provider instead of blaming credentials", async () => {
    authMocks.signInWithPassword.mockResolvedValue({
      data: { session: null },
      error: { name: "AuthRetryableFetchError", message: "fetch failed", status: 0 },
    });

    const response = await POST(request({ method: "password", email: "user@example.com", password: "secret" }));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({
      error: "无法连接认证服务，请检查本地开发服务器网络后重试",
      code: "auth_service_unreachable",
    });
  });

  it("returns a safe, actionable message for invalid credentials", async () => {
    authMocks.signInWithPassword.mockResolvedValue({
      data: { session: null },
      error: { code: "invalid_credentials", status: 400 },
    });

    const response = await POST(request({ method: "password", email: "user@example.com", password: "wrong" }));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({
      error: "邮箱或密码不正确，或该账号尚未设置密码",
      code: "invalid_credentials",
    });
  });

  it("rejects malformed input before calling Supabase", async () => {
    const response = await POST(request({ method: "otp", email: "not-an-email", token: "12" }));

    expect(response.status).toBe(400);
    expect(authMocks.verifyOtp).not.toHaveBeenCalled();
  });

  it.each(["12345", "1234567", "abcdef"])("rejects malformed code %s", async (token) => {
    expect((await POST(request({ method: "otp", email: "user@example.com", token }))).status).toBe(400);
    expect(authMocks.verifyOtp).not.toHaveBeenCalled();
  });

  it("does not set cookies for an expired, incorrect or already used code", async () => {
    authMocks.verifyOtp.mockResolvedValue({ data: { session: null }, error: { code: "otp_expired", status: 403 } });
    const response = await POST(request({ method: "otp", email: "user@example.com", token: "000001" }));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "验证码错误或已过期，请重新获取最新验证码", code: "otp_expired" });
    expect(authMocks.setSession).not.toHaveBeenCalled();
  });

  it("does not report success if the verified session cannot be persisted", async () => {
    authMocks.verifyOtp.mockResolvedValue({ data: { session: { access_token: "token", refresh_token: "refresh" } }, error: null });
    authMocks.setSession.mockResolvedValue({ error: { code: "session_write_failed" } });
    const response = await POST(request({ method: "otp", email: "user@example.com", token: "000001" }));
    expect(response.status).toBe(500);
  });

  it("limits repeated code guesses before contacting Supabase", async () => {
    authMocks.verifyOtp.mockResolvedValue({ data: { session: null }, error: { code: "otp_expired" } });
    for (let i = 0; i < 10; i += 1) await POST(request({ method: "otp", email: "user@example.com", token: "123456" }));
    const response = await POST(request({ method: "otp", email: "user@example.com", token: "123456" }));
    expect(response.status).toBe(429);
    expect(Number(response.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(authMocks.verifyOtp).toHaveBeenCalledTimes(10);
  });

  it("also limits guesses for the same email from different IPs", async () => {
    authMocks.verifyOtp.mockResolvedValue({ data: { session: null }, error: { code: "otp_expired" } });
    let response: Response | undefined;
    for (let i = 0; i < 11; i += 1) {
      const input = request({ method: "otp", email: "USER@example.com", token: "123456" });
      input.headers.set("x-forwarded-for", `192.0.2.${i}`);
      response = await POST(input);
    }
    expect(response?.status).toBe(429);
    expect(authMocks.verifyOtp).toHaveBeenCalledTimes(10);
  });
});
