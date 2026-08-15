import { describe, expect, it } from "vitest";
import { createRecoveryGrant, verifyRecoveryGrant } from "./recovery-grant";

describe("password recovery grants", () => {
  const secret = "test-only-service-secret";
  const now = Date.UTC(2026, 7, 15, 12);

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
});
