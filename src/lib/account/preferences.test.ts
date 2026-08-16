import { describe, expect, it } from "vitest";
import {
  DEFAULT_DAILY_APPLICATION_TARGET,
  dailyApplicationTargetFromMetadata,
  dailyApplicationTargetSchema,
  DEFAULT_JOB_PREFERENCES,
  hasJobPreferences,
  jobPreferencesFromMetadata,
  jobPreferencesSchema,
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

describe("job preferences", () => {
  const valid = {
    graduationYear: "2027",
    roleKeywords: ["产品", "数据分析", "产品"],
    cities: ["深圳", "香港"],
    recruitmentTypes: ["graduate" as const, "internship" as const],
    focusCompanies: ["腾讯"],
    excludedKeywords: ["销售"],
  };

  it("normalizes and reads account metadata", () => {
    const parsed = jobPreferencesSchema.parse(valid);
    expect(parsed.roleKeywords).toEqual(["产品", "数据分析"]);
    expect(jobPreferencesFromMetadata({ job_preferences: valid })).toEqual(parsed);
    expect(hasJobPreferences(parsed)).toBe(true);
  });

  it("falls back safely for invalid metadata", () => {
    expect(jobPreferencesFromMetadata(null)).toEqual(DEFAULT_JOB_PREFERENCES);
    expect(jobPreferencesFromMetadata({ job_preferences: { graduationYear: "27" } })).toEqual(DEFAULT_JOB_PREFERENCES);
    expect(hasJobPreferences(DEFAULT_JOB_PREFERENCES)).toBe(false);
  });
});
