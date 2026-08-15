import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

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
    expect(body).toEqual({ error: "登录信息无效或已过期", code: "missing_session" });
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
});
