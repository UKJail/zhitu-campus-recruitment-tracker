import { describe, expect, it } from "vitest";
import { safeAuthNextPath } from "./redirect";

describe("safeAuthNextPath", () => {
  it("allows local application paths", () => {
    expect(safeAuthNextPath("/reset-password")).toBe("/reset-password");
  });

  it("rejects absolute and protocol-relative destinations", () => {
    expect(safeAuthNextPath("https://example.com")).toBe("/app");
    expect(safeAuthNextPath("//example.com")).toBe("/app");
  });
});
