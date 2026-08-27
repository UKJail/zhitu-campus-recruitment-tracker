import { beforeEach, describe, expect, it } from "vitest";
import { consumeRegistrationAttempt, registrationClientKey, resetRegistrationRateLimitForTests } from "./registration-rate-limit";

describe("registration rate limit", () => {
  beforeEach(() => resetRegistrationRateLimitForTests());

  it("uses the first proxy-forwarded client address", () => {
    const request = new Request("https://example.com", { headers: { "x-forwarded-for": "203.0.113.1, 127.0.0.1" } });
    expect(registrationClientKey(request)).toBe("203.0.113.1");
  });

  it("blocks repeated attempts until the window expires", () => {
    for (let index = 0; index < 10; index += 1) expect(consumeRegistrationAttempt("client", 0).allowed).toBe(true);
    expect(consumeRegistrationAttempt("client", 0)).toEqual({ allowed: false, retryAfterSeconds: 600 });
    expect(consumeRegistrationAttempt("client", 600_001).allowed).toBe(true);
  });
});
