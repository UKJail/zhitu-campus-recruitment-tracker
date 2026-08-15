import { describe, expect, it } from "vitest";
import {
  DEFAULT_DAILY_APPLICATION_TARGET,
  dailyApplicationTargetFromMetadata,
  dailyApplicationTargetSchema,
} from "./preferences";

describe("daily application target preference", () => {
  it("uses the default when metadata is missing or invalid", () => {
    expect(dailyApplicationTargetFromMetadata(null)).toBe(DEFAULT_DAILY_APPLICATION_TARGET);
    expect(dailyApplicationTargetFromMetadata({})).toBe(DEFAULT_DAILY_APPLICATION_TARGET);
    expect(dailyApplicationTargetFromMetadata({ daily_application_target: 0 })).toBe(DEFAULT_DAILY_APPLICATION_TARGET);
    expect(dailyApplicationTargetFromMetadata({ daily_application_target: "30" })).toBe(DEFAULT_DAILY_APPLICATION_TARGET);
  });

  it("reads a valid account-scoped target", () => {
    expect(dailyApplicationTargetFromMetadata({ daily_application_target: 35 })).toBe(35);
    expect(dailyApplicationTargetSchema.parse(1)).toBe(1);
    expect(dailyApplicationTargetSchema.parse(200)).toBe(200);
  });

  it("rejects non-integer and out-of-range targets", () => {
    expect(dailyApplicationTargetSchema.safeParse(0).success).toBe(false);
    expect(dailyApplicationTargetSchema.safeParse(201).success).toBe(false);
    expect(dailyApplicationTargetSchema.safeParse(12.5).success).toBe(false);
  });
});
