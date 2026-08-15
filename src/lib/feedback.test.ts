import { describe, expect, it } from "vitest";
import { feedbackSchema } from "./feedback";

describe("user feedback", () => {
  it("accepts and trims plain text", () => {
    expect(feedbackSchema.parse({ content: "  日历在手机上很好用  " }).content).toBe("日历在手机上很好用");
  });

  it("rejects empty and oversized content", () => {
    expect(feedbackSchema.safeParse({ content: " " }).success).toBe(false);
    expect(feedbackSchema.safeParse({ content: "建".repeat(2001) }).success).toBe(false);
  });
});

