import { z } from "zod";

const optionalText = (max: number) => z.string().trim().max(max).optional().default("");

export const interviewReviewInputSchema = z.object({
  company: z.string().trim().min(1).max(160),
  role: z.string().trim().min(1).max(160),
  round: z.string().trim().min(1).max(80),
  date: z.iso.date(),
  interviewer: optionalText(160),
  questions: optionalText(20_000),
  answerSummary: optionalText(20_000),
  highlights: optionalText(20_000),
  improvements: optionalText(20_000),
  nextStep: optionalText(20_000),
  nextRoundPrep: optionalText(20_000),
  score: z.number().int().min(1).max(5),
  applicationId: z.string().uuid().nullable().optional().default(null),
  resumeVersionId: z.string().uuid().nullable().optional().default(null),
});

export type InterviewReviewInput = z.infer<typeof interviewReviewInputSchema>;

export function reviewDateToTimestamp(date: string) {
  return `${date}T12:00:00+08:00`;
}

export function timestampToReviewDate(timestamp: string | null) {
  if (!timestamp) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date(timestamp));
}
