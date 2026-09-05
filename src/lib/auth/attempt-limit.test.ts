import { beforeEach, describe, expect, it } from "vitest";
import { consumeAuthAttempt } from "./attempt-limit";
import { resetRegistrationRateLimitForTests } from "./registration-rate-limit";

describe("shared authentication attempt budgets", () => {
  beforeEach(() => resetRegistrationRateLimitForTests());
  it("shares sends across registration, resend and login paths even when the IP changes", () => {
    const paths = ["register", "resend-confirmation", "sign-in"];
    for (let index = 0; index < 10; index += 1) {
      const request = new Request(`https://example.com/api/auth/${paths[index % paths.length]}`, { headers: { "x-forwarded-for": `192.0.2.${index}` } });
      expect(consumeAuthAttempt(request, " USER@example.com ", "send").allowed).toBe(true);
    }
    expect(consumeAuthAttempt(new Request("https://example.com"), "user@example.com", "send").allowed).toBe(false);
  });
  it("does not spend verification or password budgets when sending", () => {
    const request = new Request("https://example.com");
    for (let index = 0; index < 10; index += 1) consumeAuthAttempt(request, "user@example.com", "send");
    expect(consumeAuthAttempt(request, "user@example.com", "verify").allowed).toBe(true);
    expect(consumeAuthAttempt(request, "user@example.com", "password").allowed).toBe(true);
  });
});
