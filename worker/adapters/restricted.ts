import type { CollectionResult, JobSourceAdapter } from "../types.js";

export class RestrictedSourceAdapter implements JobSourceAdapter {
  readonly adapterName: string;

  constructor(readonly sourceName: string, private readonly reason: string) {
    this.adapterName = `restricted:${sourceName}`;
  }

  async collect(): Promise<CollectionResult> {
    return { jobs: [], restricted: true, reason: this.reason };
  }
}
