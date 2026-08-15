import { describe, expect, it } from "vitest";
import { interviewReviewInputSchema, reviewDateToTimestamp, timestampToReviewDate } from "./review";

describe("interview review", () => {
  it("validates a complete review and keeps optional fields empty", () => {
    const value = interviewReviewInputSchema.parse({
      company: "腾讯",
      role: "市场营销",
      round: "业务一面",
      date: "2026-08-14",
      score: 4,
    });
    expect(value.interviewer).toBe("");
    expect(value.applicationId).toBeNull();
    expect(value.score).toBe(4);
  });

  it("rejects invalid scores and dates", () => {
    expect(interviewReviewInputSchema.safeParse({ company: "腾讯", role: "市场营销", round: "一面", date: "2026-02-30", score: 6 }).success).toBe(false);
  });

  it("round-trips dates using the Shanghai time zone", () => {
    const timestamp = reviewDateToTimestamp("2026-08-14");
    expect(timestampToReviewDate(timestamp)).toBe("2026-08-14");
  });
});
