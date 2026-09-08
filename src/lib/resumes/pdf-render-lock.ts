import { randomUUID } from "node:crypto";
import { lstat, open, readFile, unlink } from "node:fs/promises";
import { isAbsolute } from "node:path";

export class ResumePdfBusyError extends Error {}

/** One host-wide admission slot, shared by all website processes. No queue and
 * no time-based stale-lock stealing: a crashed owner requires operator review. */
export async function acquireResumePdfLock(path: string): Promise<() => Promise<void>> {
  if (!isAbsolute(path) || /[\r\n\0]/.test(path)) throw new Error("Invalid PDF lock configuration");
  const token = randomUUID();
  let handle;
  try { handle = await open(path, "wx", 0o600); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new ResumePdfBusyError();
    throw error;
  }
  const identity = await handle.stat();
  const metadata = JSON.stringify({ version: 1, pid: process.pid, startedAt: new Date().toISOString(), token });
  try { await handle.writeFile(metadata); }
  catch (error) { await handle.close(); throw error; } // Fail closed; never delete an ambiguous lock.
  await handle.close();
  let released = false;
  return async () => {
    if (released) return;
    released = true;
    try {
      const current = await lstat(path);
      if (!current.isFile() || current.dev !== identity.dev || current.ino !== identity.ino) return;
      // Only the exact lock we created may be released. There is intentionally
      // no cleanup of other owners, old timestamps, directories, or symlinks.
      if (await readFile(path, "utf8") !== metadata) return;
      await unlink(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  };
}
