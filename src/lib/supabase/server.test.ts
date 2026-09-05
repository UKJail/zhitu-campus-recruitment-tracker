import { afterEach, describe, expect, it, vi } from "vitest";
import { getAuthenticatedUserId } from "./server";

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), getClaims: vi.fn() }));
vi.mock("@supabase/ssr", () => ({ createServerClient: () => ({ auth: mocks }) }));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: vi.fn() }) }));
describe("getAuthenticatedUserId", () => {
  afterEach(() => vi.unstubAllEnvs());
  it.each([true, false])("verifies account still exists with Auth (exists=%s)", async (exists) => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-key");
    mocks.getUser.mockResolvedValue({ data: { user: exists ? { id: "target" } : null }, error: exists ? null : new Error("User not found") });
    const result = await getAuthenticatedUserId();
    expect(result.userId).toBe(exists ? "target" : null);
    expect(mocks.getClaims).not.toHaveBeenCalled();
  });
});
