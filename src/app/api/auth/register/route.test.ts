import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetRegistrationRateLimitForTests } from "@/lib/auth/registration-rate-limit";
import { POST } from "./route";

const registerMocks = vi.hoisted(() => ({ signUp: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => ({ auth: { signUp: registerMocks.signUp } }),
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
    process.env.APP_URL = "https://zhitutracker.com";
  });

  afterEach(() => {
    delete process.env.APP_URL;
  });

  it("opens registration and requests email confirmation through the public auth client", async () => {
    registerMocks.signUp.mockResolvedValue({ data: { user: { id: "user-1" }, session: null }, error: null });

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
  });

  it("returns an active session when email confirmation is disabled", async () => {
    registerMocks.signUp.mockResolvedValue({ data: { user: { id: "user-1" }, session: { access_token: "token" } }, error: null });

    const response = await POST(request(validRegistration));

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ requiresEmailConfirmation: false });
  });

  it("does not expose provider details when registration is rejected", async () => {
    registerMocks.signUp.mockResolvedValue({
      data: { user: null },
      error: { code: "email_exists", status: 422, message: "provider detail" },
    });

    const response = await POST(request(validRegistration));

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "注册暂时失败，请稍后重试" });
  });
});
