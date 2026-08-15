import { describe, expect, it } from "vitest";
import { hasRecentOtpAuthentication } from "./recent-auth";

describe("hasRecentOtpAuthentication", () => {
  const now = 1_786_800_000;

  it("accepts a recent OTP authentication", () => {
    expect(hasRecentOtpAuthentication({ amr: [{ method: "otp", timestamp: now - 30 }] }, now)).toBe(true);
  });

  it("rejects password-only and expired authentication", () => {
    expect(hasRecentOtpAuthentication({ amr: [{ method: "password", timestamp: now - 30 }] }, now)).toBe(false);
    expect(hasRecentOtpAuthentication({ amr: [{ method: "otp", timestamp: now - 901 }] }, now)).toBe(false);
  });

  it("rejects malformed claims", () => {
    expect(hasRecentOtpAuthentication(null, now)).toBe(false);
    expect(hasRecentOtpAuthentication({ amr: [{ method: "otp", timestamp: "recent" }] }, now)).toBe(false);
  });
});
