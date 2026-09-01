import { z } from "zod";
import { analysisSchema } from "@/lib/ai/provider";
import type { Json } from "@/lib/supabase/database.types";

const contextSchema = z.object({
  resumeId: z.string().uuid().optional(),
  jobDescription: z.string().optional(),
  targetCompany: z.string().optional(),
  targetRole: z.string().optional(),
}).partial();

const versionMetaSchema = z.object({
  targetCompany: z.string(),
  targetRole: z.string(),
  analysisRunId: z.string().uuid(),
  acceptedSuggestionIndexes: z.array(z.number().int().nonnegative()),
  jobDescription: z.string().optional(),
  qualityChecks: z.array(z.object({
    key: z.string(),
    label: z.string(),
    status: z.enum(["passed", "manual_required"]),
    detail: z.string(),
  })).optional().default([]),
});

export type WorkspaceVersion = { id: string; created_at: string; content: Json };
export type WorkspaceRun = { id: string; output: Json | null };

export function buildResumeWorkspace(resumeId: string, version: WorkspaceVersion | null, runs: WorkspaceRun[]) {
  const content = version?.content && typeof version.content === "object" && !Array.isArray(version.content) ? version.content : null;
  const versionMeta = versionMetaSchema.safeParse(content && "meta" in content ? content.meta : null);
  const preferredRunId = versionMeta.success ? versionMeta.data.analysisRunId : null;
  const orderedRuns = preferredRunId
    ? [...runs].sort((a, b) => Number(b.id === preferredRunId) - Number(a.id === preferredRunId))
    : runs;

  let selectedRun: WorkspaceRun | null = null;
  let analysis = null;
  let context: z.infer<typeof contextSchema> = {};
  for (const run of orderedRuns) {
    const output = run.output && typeof run.output === "object" && !Array.isArray(run.output) ? run.output : null;
    const parsedAnalysis = analysisSchema.safeParse(output);
    const parsedContext = contextSchema.safeParse(output && "context" in output ? output.context : null);
    const belongsToResume = run.id === preferredRunId || (parsedContext.success && parsedContext.data.resumeId === resumeId);
    if (parsedAnalysis.success && belongsToResume) {
      selectedRun = run;
      analysis = parsedAnalysis.data;
      context = parsedContext.success ? parsedContext.data : {};
      break;
    }
  }

  const meta = versionMeta.success ? versionMeta.data : null;
  return {
    analysisRunId: selectedRun?.id ?? preferredRunId,
    analysis,
    jobDescription: context.jobDescription ?? meta?.jobDescription ?? "",
    targetCompany: context.targetCompany ?? meta?.targetCompany ?? "",
    targetRole: context.targetRole ?? meta?.targetRole ?? "",
    acceptedSuggestionIndexes: meta?.acceptedSuggestionIndexes ?? [],
    generatedVersion: version && meta ? {
      versionId: version.id,
      createdAt: version.created_at,
      targetCompany: meta.targetCompany,
      targetRole: meta.targetRole,
      acceptedCount: meta.acceptedSuggestionIndexes.length,
      qualityChecks: meta.qualityChecks,
      downloadUrl: `/api/resumes/versions/${version.id}/download`,
    } : null,
  };
}
