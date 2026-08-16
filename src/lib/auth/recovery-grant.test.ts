import { afterEach, describe, expect, it, vi } from "vitest";
import { createRecoveryGrant, getRecoveryGrantSecret, verifyRecoveryGrant } from "./recovery-grant";

describe("password recovery grants", () => {
  const secret = "test-only-service-secret";
  const now = Date.UTC(2026, 7, 15, 12);

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("accepts a fresh grant for the intended user", () => {
    const grant = createRecoveryGrant("user-1", secret, now);
    expect(verifyRecoveryGrant(grant, "user-1", secret, now + 60_000)).toBe(true);
  });

  it("rejects another user and a modified grant", () => {
    const grant = createRecoveryGrant("user-1", secret, now);
    expect(verifyRecoveryGrant(grant, "user-2", secret, now)).toBe(false);
    expect(verifyRecoveryGrant(`${grant}x`, "user-1", secret, now)).toBe(false);
  });

  it("rejects an expired grant", () => {
    const grant = createRecoveryGrant("user-1", secret, now);
    expect(verifyRecoveryGrant(grant, "user-1", secret, now + 16 * 60_000)).toBe(false);
  });

  it("uses a dedicated recovery secret instead of the Supabase service role", () => {
    vi.stubEnv("AUTH_RECOVERY_GRANT_SECRET", "dedicated-recovery-secret");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-must-not-be-used");
    expect(getRecoveryGrantSecret()).toBe("dedicated-recovery-secret");
  });
});
