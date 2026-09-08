// @vitest-environment node
import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, readdir, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { atomicWriteJson } from "./atomic-json-file.mjs";

describe("atomic public catalog snapshots", () => {
  it("replaces a snapshot without stale temporary files", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "zhitu-catalog-test-"));
    try {
      const destination = path.join(directory, "catalog.json");
      await atomicWriteJson(destination, { records: ["old"] });
      await atomicWriteJson(destination, { records: ["new"] });
      expect(JSON.parse(await readFile(destination, "utf8"))).toEqual({ records: ["new"] });
      expect(await readdir(directory)).toEqual(["catalog.json"]);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  it("keeps the old destination and cleans its own temporary file when replacement fails", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "zhitu-catalog-test-"));
    try {
      const destination = path.join(directory, "catalog.json");
      await mkdir(destination);
      await expect(atomicWriteJson(destination, { records: ["new"] })).rejects.toThrow();
      expect(await readdir(directory)).toEqual(["catalog.json"]);
      expect(await readdir(destination)).toEqual([]);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
