import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetRegistrationRateLimitForTests } from "@/lib/auth/registration-rate-limit";
import { POST } from "./route";

const registerMocks = vi.hoisted(() => ({ signUp: vi.fn(), signInWithOtp: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => ({ auth: { signUp: registerMocks.signUp } }),
  createSupabaseAuthClient: () => ({ auth: { signInWithOtp: registerMocks.signInWithOtp } }),
}));

function request(body: unknown) {
  return new Request("http://localhost/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.8" },
    body: JSON.stringify(body),
  });
}

const validRegistration = {
  email: " Candidate@Example.com ",
  displayName: "秋招小李",
  password: "career2026",
};

describe("POST /api/auth/register", () => {
  beforeEach(() => {
    resetRegistrationRateLimitForTests();
    registerMocks.signUp.mockReset();
    registerMocks.signInWithOtp.mockReset();
    registerMocks.signInWithOtp.mockResolvedValue({ error: null });
    process.env.APP_URL = "https://zhitutracker.com";
  });

  afterEach(() => {
    delete process.env.APP_URL;
  });

  it("opens registration and requests email confirmation through the public auth client", async () => {
    registerMocks.signUp.mockResolvedValue({ data: { user: { id: "user-1", identities: [{ id: "identity-1" }] }, session: null }, error: null });

    const response = await POST(request(validRegistration));

    expect(response.status).toBe(201);
    expect(registerMocks.signUp).toHaveBeenCalledWith({
      email: "candidate@example.com",
      password: "career2026",
      options: {
        data: { display_name: "秋招小李" },
        emailRedirectTo: "https://zhitutracker.com/auth/callback?next=/app",
      },
    });
    expect(await response.json()).toEqual({ registered: true, email: "candidate@example.com", requiresEmailConfirmation: true });
    expect(registerMocks.signInWithOtp).not.toHaveBeenCalled();
  });

  it("returns an active session when email confirmation is disabled", async () => {
    registerMocks.signUp.mockResolvedValue({ data: { user: { id: "user-1" }, session: { access_token: "token", refresh_token: "refresh" } }, error: null });

    const response = await POST(request(validRegistration));

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ requiresEmailConfirmation: false });
  });

  it("does not expose provider details when registration is rejected", async () => {
    registerMocks.signUp.mockResolvedValue({
      data: { user: null },
      error: { code: "smtp_failed", status: 500, message: "provider detail" },
    });

    const response = await POST(request(validRegistration));

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "注册暂时失败，请稍后重试" });
  });

  it("sends one login code for an obfuscated duplicate without replacing account data", async () => {
    registerMocks.signUp.mockResolvedValue({ data: { user: { id: "obfuscated", role: "", identities: [] }, session: null }, error: null });
    const response = await POST(request(validRegistration));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ registered: true, email: "candidate@example.com", requiresEmailConfirmation: true });
    expect(registerMocks.signInWithOtp).toHaveBeenCalledExactlyOnceWith({ email: "candidate@example.com", options: { shouldCreateUser: false } });
  });

  it("does not replace an invited unconfirmed account's password via OTP", async () => {
    registerMocks.signUp.mockResolvedValue({ data: { user: { id: "invited", role: "authenticated", identities: [] }, session: null }, error: null });
    expect((await POST(request(validRegistration))).status).toBe(201);
    expect(registerMocks.signInWithOtp).not.toHaveBeenCalled();
  });

  it.each([undefined, {}, { user: { id: "incomplete" }, session: null }, { user: { id: "incomplete" }, session: {} }])("rejects incomplete provider responses (%j)", async (data) => {
    registerMocks.signUp.mockResolvedValue({ data, error: null });
    expect((await POST(request(validRegistration))).status).toBe(502);
    expect(registerMocks.signInWithOtp).not.toHaveBeenCalled();
  });

  it.each(["email_exists", "user_already_exists"])("handles explicit duplicate error %s with the same public response", async (code) => {
    registerMocks.signUp.mockResolvedValue({ data: { user: null }, error: { code, status: 422 } });
    expect((await POST(request(validRegistration))).status).toBe(201);
    expect(registerMocks.signInWithOtp).toHaveBeenCalledTimes(1);
  });

  it("does not claim success when duplicate-account code delivery fails", async () => {
    registerMocks.signUp.mockResolvedValue({ data: { user: { id: "obfuscated", role: "", identities: [] }, session: null }, error: null });
    registerMocks.signInWithOtp.mockResolvedValue({ error: { code: "smtp_failed", status: 500 } });
    const response = await POST(request(validRegistration));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "验证码发送暂时失败，请稍后重试" });
  });

  it("limits the same registration email across multiple addresses", async () => {
    registerMocks.signUp.mockResolvedValue({ data: { user: { id: "user-1", identities: [{ id: "identity-1" }] }, session: null }, error: null });
    let response: Response | undefined;
    for (let index = 0; index < 11; index += 1) {
      const input = request(validRegistration);
      input.headers.set("x-forwarded-for", `192.0.2.${index}`);
      response = await POST(input);
    }
    expect(response?.status).toBe(429);
    expect(registerMocks.signUp).toHaveBeenCalledTimes(10);
  });
});
