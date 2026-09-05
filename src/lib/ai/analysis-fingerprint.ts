import { createHash } from "node:crypto";
import { z } from "zod";

type AnalysisInput = {
  resumeId: string;
  resumeText: string;
  jobDescription: string;
  targetCompany: string;
  targetRole: string;
};

function fingerprint(input: AnalysisInput, version: "resume-optimization-v2" | "resume-optimization-v3") {
  return createHash("sha256").update(JSON.stringify({
    version,
    ...(version === "resume-optimization-v3" ? { resumeId: input.resumeId } : {}),
    resumeText: input.resumeText,
    jobDescription: input.jobDescription.trim(),
    targetCompany: input.targetCompany.trim(),
    targetRole: input.targetRole.trim(),
  })).digest("hex");
}

export function analysisFingerprint(input: AnalysisInput) {
  return fingerprint(input, "resume-optimization-v3");
}

const contextSchema = z.object({
  context: z.object({
    resumeId: z.string(),
    jobDescription: z.string(),
    targetCompany: z.string(),
    targetRole: z.string(),
  }),
});

export function matchesResumeAnalysis(input: AnalysisInput, run: { input_fingerprint: string | null; output: unknown }) {
  if (run.input_fingerprint === analysisFingerprint(input)) return true;

  // V2 did not bind the uploaded document ID. Only reuse it when its saved
  // context proves that it was produced for this exact document and target.
  if (run.input_fingerprint !== fingerprint(input, "resume-optimization-v2")) return false;
  const parsed = contextSchema.safeParse(run.output);
  if (!parsed.success) return false;
  const context = parsed.data.context;
  return context.resumeId === input.resumeId
    && context.jobDescription.trim() === input.jobDescription.trim()
    && context.targetCompany.trim() === input.targetCompany.trim()
    && context.targetRole.trim() === input.targetRole.trim();
}
