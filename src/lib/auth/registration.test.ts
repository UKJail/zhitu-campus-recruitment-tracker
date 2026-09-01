import { describe, expect, it } from "vitest";
import { registrationSchema } from "./registration";

describe("public registration", () => {
  it("normalizes registration fields and validates the password", () => {
    const parsed = registrationSchema.parse({
      email: " Candidate@Example.COM ",
      displayName: " 秋招小李 ",
      password: "career2026",
    });
    expect(parsed.email).toBe("candidate@example.com");
    expect(parsed.displayName).toBe("秋招小李");
    expect(() => registrationSchema.parse({ ...parsed, password: "12345678" })).toThrow();
  });
});
