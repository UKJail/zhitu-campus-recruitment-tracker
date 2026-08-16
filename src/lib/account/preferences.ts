import { z } from "zod";

export const DEFAULT_DAILY_APPLICATION_TARGET = 20;

export const dailyApplicationTargetSchema = z.number().int().min(1).max(200);

const preferenceListSchema = z.array(z.string().trim().min(1).max(32)).max(12)
  .transform((items) => [...new Set(items)]);

export const recruitmentPreferenceSchema = z.enum(["graduate", "internship"]);

export const jobPreferencesSchema = z.object({
  graduationYear: z.string().trim().regex(/^$|^20\d{2}$/),
  roleKeywords: preferenceListSchema,
  cities: preferenceListSchema,
  recruitmentTypes: z.array(recruitmentPreferenceSchema).max(2).transform((items) => [...new Set(items)]),
  focusCompanies: preferenceListSchema,
  excludedKeywords: preferenceListSchema,
});

export type JobPreferences = z.infer<typeof jobPreferencesSchema>;

export const DEFAULT_JOB_PREFERENCES: JobPreferences = {
  graduationYear: "",
  roleKeywords: [],
  cities: [],
  recruitmentTypes: [],
  focusCompanies: [],
  excludedKeywords: [],
};

export function dailyApplicationTargetFromMetadata(metadata: unknown) {
  if (!metadata || typeof metadata !== "object") return DEFAULT_DAILY_APPLICATION_TARGET;
  const value = (metadata as Record<string, unknown>).daily_application_target;
  const parsed = dailyApplicationTargetSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_DAILY_APPLICATION_TARGET;
}

export function jobPreferencesFromMetadata(metadata: unknown): JobPreferences {
  if (!metadata || typeof metadata !== "object") return DEFAULT_JOB_PREFERENCES;
  const value = (metadata as Record<string, unknown>).job_preferences;
  const parsed = jobPreferencesSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_JOB_PREFERENCES;
}

export function hasJobPreferences(preferences: JobPreferences) {
  return Boolean(preferences.graduationYear
    || preferences.roleKeywords.length
    || preferences.cities.length
    || preferences.recruitmentTypes.length
    || preferences.focusCompanies.length
    || preferences.excludedKeywords.length);
}
