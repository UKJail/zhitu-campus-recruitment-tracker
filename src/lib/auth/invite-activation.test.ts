import { describe, expect, it } from "vitest";
import { activationExpiry, activationRequestSchema, createActivationToken, hashActivationToken } from "./invite-activation";

describe("invite activation", () => {
  it("creates an unpredictable token and stores only a stable digest", () => {
    const token = createActivationToken();
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(hashActivationToken(token)).toHaveLength(64);
    expect(hashActivationToken(token)).not.toBe(token);
    expect(hashActivationToken(token)).toBe(hashActivationToken(token));
  });

  it("normalizes the invited email and enforces a reasonable password", () => {
    const parsed = activationRequestSchema.parse({
      token: "a".repeat(64),
      email: " Candidate@Example.COM ",
      displayName: "秋招小李",
      password: "career2026",
    });
    expect(parsed.email).toBe("candidate@example.com");
    expect(parsed.displayName).toBe("秋招小李");
    expect(() => activationRequestSchema.parse({ ...parsed, password: "12345678" })).toThrow();
  });

  it("expires activation links after 24 hours", () => {
    expect(activationExpiry(0)).toBe("1970-01-02T00:00:00.000Z");
  });
});
