import { z } from "zod";

export const DEFAULT_DAILY_APPLICATION_TARGET = 20;

export const dailyApplicationTargetSchema = z.number().int().min(1).max(200);

export function dailyApplicationTargetFromMetadata(metadata: unknown) {
  if (!metadata || typeof metadata !== "object") return DEFAULT_DAILY_APPLICATION_TARGET;
  const value = (metadata as Record<string, unknown>).daily_application_target;
  const parsed = dailyApplicationTargetSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_DAILY_APPLICATION_TARGET;
}
