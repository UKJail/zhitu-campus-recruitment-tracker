import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { GreenhouseAdapter } from "./greenhouse";

async function fixture() {
  const fixturePath = path.resolve(process.cwd(), "worker/fixtures/greenhouse-ideo.json");
  return JSON.parse(await readFile(fixturePath, "utf8"));
}

describe("GreenhouseAdapter", () => {
  it("uses the public API, filters locations, and normalizes jobs", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(await fixture()), { status: 200 })) as unknown as typeof fetch;
    const result = await new GreenhouseAdapter("ideo", "IDEO", /Shanghai|China/i, fetcher).collect();

    expect(result.restricted).toBeUndefined();
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]).toMatchObject({
      externalId: "ideo:7417974",
      company: "IDEO",
      title: "Director",
      location: "Shanghai, China",
      description: "Lead a multidisciplinary team & shape meaningful impact.",
      normalizedUrl: "https://boards.greenhouse.io/ideo/jobs/7417974",
    });
    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining("boards-api.greenhouse.io/v1/boards/ideo/jobs?content=true"), expect.any(Object));
  });

  it("pauses a source after an access-control response", async () => {
    const fetcher = vi.fn(async () => new Response("", { status: 403 })) as unknown as typeof fetch;
    const result = await new GreenhouseAdapter("ideo", "IDEO", /China/i, fetcher).collect();
    expect(result).toMatchObject({ restricted: true, jobs: [] });
  });

  it("pauses when the public response shape changes", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ vacancies: [] }), { status: 200 })) as unknown as typeof fetch;
    const result = await new GreenhouseAdapter("ideo", "IDEO", /China/i, fetcher).collect();
    expect(result).toMatchObject({ restricted: true, jobs: [] });
  });
});
