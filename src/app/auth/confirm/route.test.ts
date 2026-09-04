import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const authMocks = vi.hoisted(() => ({ verifyOtp: vi.fn() }));
const adminMocks = vi.hoisted(() => ({
  from: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => ({ auth: { verifyOtp: authMocks.verifyOtp } }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ from: adminMocks.from }),
}));

describe("GET /auth/confirm", () => {
  beforeEach(() => {
    authMocks.verifyOtp.mockReset();
    adminMocks.from.mockReset();
    adminMocks.update.mockReset();
    adminMocks.eq.mockReset();
    adminMocks.from.mockReturnValue({ update: adminMocks.update });
    adminMocks.update.mockReturnValue({ eq: adminMocks.eq });
    adminMocks.eq.mockReturnValue({ eq: adminMocks.eq });
  });

  it("confirms a public signup from a token hash and creates a session", async () => {
    authMocks.verifyOtp.mockResolvedValue({ data: { user: { id: "user-1", email: "candidate@example.com" } }, error: null });

    const response = await GET(new Request("https://zhitutracker.com/auth/confirm?token_hash=signup-token&type=email"));

    expect(authMocks.verifyOtp).toHaveBeenCalledWith({ token_hash: "signup-token", type: "email" });
    expect(adminMocks.from).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe("https://zhitutracker.com/app");
  });

  it("keeps the legacy invite flow and marks the invitation as used", async () => {
    authMocks.verifyOtp.mockResolvedValue({ data: { user: { id: "user-2", email: "Invited@Example.com" } }, error: null });

    const response = await GET(new Request("https://zhitutracker.com/auth/confirm?token_hash=invite-token&type=invite"));

    expect(authMocks.verifyOtp).toHaveBeenCalledWith({ token_hash: "invite-token", type: "invite" });
    expect(adminMocks.from).toHaveBeenCalledWith("invites");
    expect(adminMocks.update).toHaveBeenCalledWith({ used_at: expect.any(String) });
    expect(adminMocks.eq).toHaveBeenCalledWith("email", "invited@example.com");
    expect(response.headers.get("location")).toBe("https://zhitutracker.com/app");
  });

  it("rejects unsupported confirmation types before calling Supabase", async () => {
    const response = await GET(new Request("https://zhitutracker.com/auth/confirm?token_hash=token&type=recovery"));

    expect(authMocks.verifyOtp).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe("https://zhitutracker.com/?auth_error=invalid_link");
  });

  it("returns a clear expired-link state when signup verification fails", async () => {
    authMocks.verifyOtp.mockResolvedValue({ data: { user: null }, error: { message: "expired" } });

    const response = await GET(new Request("https://zhitutracker.com/auth/confirm?token_hash=expired&type=email"));

    expect(response.headers.get("location")).toBe("https://zhitutracker.com/?auth_error=expired_link");
  });
});
