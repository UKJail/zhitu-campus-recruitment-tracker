import { describe, expect, it } from "vitest";
import { validateNewPassword } from "./password";

describe("validateNewPassword", () => {
  it("accepts a matching password with letters and numbers", () => {
    expect(validateNewPassword("Career2026", "Career2026")).toBe("");
  });

  it("rejects short or weak passwords", () => {
    expect(validateNewPassword("abc123", "abc123")).toContain("8 位");
    expect(validateNewPassword("abcdefgh", "abcdefgh")).toContain("字母和数字");
  });

  it("rejects a mismatched confirmation", () => {
    expect(validateNewPassword("Career2026", "Career2027")).toContain("不一致");
  });
});
