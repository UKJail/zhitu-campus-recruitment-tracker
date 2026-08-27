import { describe, expect, it } from "vitest";
import { inviteCodeRegistrationSchema, inviteCodesMatch, isInviteCodeConfigured } from "./invite-code-registration";

describe("invite-code registration", () => {
  it("normalizes registration fields and validates the password", () => {
    const parsed = inviteCodeRegistrationSchema.parse({
      email: " Candidate@Example.COM ",
      displayName: " 秋招小李 ",
      inviteCode: " Beta-2026 ",
      password: "career2026",
    });
    expect(parsed.email).toBe("candidate@example.com");
    expect(parsed.displayName).toBe("秋招小李");
    expect(parsed.inviteCode).toBe("Beta-2026");
    expect(() => inviteCodeRegistrationSchema.parse({ ...parsed, password: "12345678" })).toThrow();
  });

  it("compares invitation codes without leaking case or surrounding-space differences", () => {
    expect(inviteCodesMatch(" beta-2026 ", "BETA-2026")).toBe(true);
    expect(inviteCodesMatch("beta-2025", "BETA-2026")).toBe(false);
    expect(inviteCodesMatch("short", "BETA-2026")).toBe(false);
  });

  it("fails closed when the configured code is missing or too short", () => {
    expect(isInviteCodeConfigured(undefined)).toBe(false);
    expect(isInviteCodeConfigured("short")).toBe(false);
    expect(isInviteCodeConfigured("BETA-2026")).toBe(true);
  });
});
