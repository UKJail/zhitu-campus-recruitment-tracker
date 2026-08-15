import { JobRepository } from "./repository.js";
import type { JobSourceAdapter } from "./types.js";

type RunRepository = Pick<JobRepository, "startRun" | "finishRun" | "failRun">;

export async function runAdapters(adapters: JobSourceAdapter[], repository: RunRepository) {
  const summary: Array<{ adapter: string; seen: number; added: number; status: string; error?: string }> = [];
  for (const adapter of adapters) {
    let runId = "";
    try {
      const started = await repository.startRun(adapter);
      if (started.paused) {
        summary.push({ adapter: adapter.adapterName, seen: 0, added: 0, status: "paused", error: started.reason });
        continue;
      }
      runId = started.runId;
      const result = await adapter.collect();
      const stored = await repository.finishRun(runId, started.source, result);
      summary.push({ adapter: adapter.adapterName, seen: stored.seen, added: stored.added, status: stored.restricted ? "restricted" : "completed" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown worker error";
      if (runId) await repository.failRun(runId, message);
      summary.push({ adapter: adapter.adapterName, seen: 0, added: 0, status: "failed", error: message });
    }
  }
  return summary;
}
