import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetRegistrationRateLimitForTests } from "@/lib/auth/registration-rate-limit";
import { POST } from "./route";

const registerMocks = vi.hoisted(() => ({ createUser: vi.fn() }));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ auth: { admin: { createUser: registerMocks.createUser } } }),
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
  inviteCode: "beta-2026",
  password: "career2026",
};

describe("POST /api/auth/register", () => {
  beforeEach(() => {
    resetRegistrationRateLimitForTests();
    registerMocks.createUser.mockReset();
    process.env.AUTH_BETA_INVITE_CODE = "BETA-2026";
  });

  afterEach(() => {
    delete process.env.AUTH_BETA_INVITE_CODE;
  });

  it("creates a confirmed user after server-side invitation-code validation", async () => {
    registerMocks.createUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });

    const response = await POST(request(validRegistration));

    expect(response.status).toBe(201);
    expect(registerMocks.createUser).toHaveBeenCalledWith({
      email: "candidate@example.com",
      password: "career2026",
      email_confirm: true,
      user_metadata: { display_name: "秋招小李" },
    });
    expect(await response.json()).toEqual({ registered: true, email: "candidate@example.com" });
  });

  it("rejects an invalid invitation code before contacting Supabase", async () => {
    const response = await POST(request({ ...validRegistration, inviteCode: "WRONG-2026" }));

    expect(response.status).toBe(400);
    expect(registerMocks.createUser).not.toHaveBeenCalled();
  });

  it("fails closed when invitation-code registration is not configured", async () => {
    delete process.env.AUTH_BETA_INVITE_CODE;

    const response = await POST(request(validRegistration));

    expect(response.status).toBe(503);
    expect(registerMocks.createUser).not.toHaveBeenCalled();
  });

  it("guides an existing user back to login without exposing provider details", async () => {
    registerMocks.createUser.mockResolvedValue({
      data: { user: null },
      error: { code: "email_exists", status: 422, message: "provider detail" },
    });

    const response = await POST(request(validRegistration));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "该邮箱已注册，请直接登录或找回密码" });
  });
});
