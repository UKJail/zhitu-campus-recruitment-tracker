import { describe, expect, it, vi } from "vitest";
import { runAdapters } from "./runner";
import type { JobSourceAdapter } from "./types";
import type { JobRepository } from "./repository";

describe("worker runner", () => {
  it("does not collect a source after it has been paused", async () => {
    const collect = vi.fn();
    const adapter: JobSourceAdapter = { adapterName: "restricted:test", sourceName: "受限来源", sourceKind: "public_page", collect };
    const repository = {
      startRun: vi.fn().mockResolvedValue({ paused: true, source: { id: "source", name: "受限来源", enabled: false, restricted_reason: "访问受限" }, reason: "访问受限" }),
      finishRun: vi.fn(),
      failRun: vi.fn(),
    } as unknown as Pick<JobRepository, "startRun" | "finishRun" | "failRun">;
    const result = await runAdapters([adapter], repository);
    expect(collect).not.toHaveBeenCalled();
    expect(result).toEqual([{ adapter: "restricted:test", seen: 0, added: 0, status: "paused", error: "访问受限" }]);
  });

  it("marks a run failed when persisting its completion fails, then continues", async () => {
    const adapter: JobSourceAdapter = {
      adapterName: "public:test",
      sourceName: "测试来源",
      sourceKind: "public_page",
      collect: vi.fn().mockResolvedValue({ jobs: [] }),
    };
    const repository = {
      startRun: vi.fn().mockResolvedValue({
        paused: false,
        runId: "run-1",
        source: { id: "source", name: "测试来源", enabled: true, restricted_reason: null },
      }),
      finishRun: vi.fn().mockRejectedValue(new Error("数据库更新失败")),
      failRun: vi.fn().mockResolvedValue(undefined),
    } as unknown as Pick<JobRepository, "startRun" | "finishRun" | "failRun">;

    const result = await runAdapters([adapter], repository);

    expect(repository.failRun).toHaveBeenCalledWith("run-1", "数据库更新失败");
    expect(result).toEqual([{ adapter: "public:test", seen: 0, added: 0, status: "failed", error: "数据库更新失败" }]);
  });
});
