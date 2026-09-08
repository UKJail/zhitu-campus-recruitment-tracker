// @vitest-environment node
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { acquireResumePdfLock, ResumePdfBusyError } from "./pdf-render-lock";

let directory: string;
let lockPath: string;
beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), "zhitu-lock-test-")); lockPath = join(directory, "slot.lock"); });
afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

describe("host-wide PDF admission lock", () => {
  it("refuses a second owner immediately and permits another job after exact-owner release", async () => {
    const release = await acquireResumePdfLock(lockPath);
    await expect(acquireResumePdfLock(lockPath)).rejects.toBeInstanceOf(ResumePdfBusyError);
    await release();
    const nextRelease = await acquireResumePdfLock(lockPath);
    await release(); // Idempotent old release must not remove the new owner's lock.
    await expect(acquireResumePdfLock(lockPath)).rejects.toBeInstanceOf(ResumePdfBusyError);
    await nextRelease();
  });

  it("does not steal old or malformed locks, including apparently dead owners", async () => {
    await writeFile(lockPath, JSON.stringify({ pid: 2147483647, startedAt: "2000-01-01T00:00:00Z" }));
    await expect(acquireResumePdfLock(lockPath)).rejects.toBeInstanceOf(ResumePdfBusyError);
    expect(await readFile(lockPath, "utf8")).toContain("2000-01-01");
  });

  it("does not remove a lock whose ownership metadata changed", async () => {
    const release = await acquireResumePdfLock(lockPath);
    await writeFile(lockPath, "another owner");
    await release();
    expect(await readFile(lockPath, "utf8")).toBe("another owner");
  });

  it("serializes independent operating-system processes", async () => {
    const moduleUrl = pathToFileURL(resolve("src/lib/resumes/pdf-render-lock.ts")).href;
    const script = `import {acquireResumePdfLock} from ${JSON.stringify(moduleUrl)}; const release=await acquireResumePdfLock(${JSON.stringify(lockPath)}); process.stdout.write('locked\\n'); for await (const chunk of process.stdin) {} await release();`;
    const child = spawn(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", script], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true, env: { NODE_ENV: "test" } });
    try {
      await new Promise<void>((done, fail) => {
        let stderr = "";
        child.stderr.on("data", (value) => { stderr += value; });
        child.once("error", fail);
        child.once("exit", (code) => fail(new Error(`Lock helper exited ${code}: ${stderr}`)));
        child.stdout.once("data", () => done());
      });
      await expect(acquireResumePdfLock(lockPath)).rejects.toBeInstanceOf(ResumePdfBusyError);
      const exited = new Promise<void>((done) => child.once("exit", () => done()));
      child.stdin.end();
      await exited;
      const release = await acquireResumePdfLock(lockPath);
      await release();
    } finally { child.kill(); }
  });
});
