import { randomUUID } from "node:crypto";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

// The temporary file shares the destination filesystem. Never unlink the live
// file first: a failed rename must leave the previously published catalog intact.
export async function atomicWriteJson(destination, value, space) {
  const output = path.resolve(destination);
  await mkdir(path.dirname(output), { recursive: true });
  const temporary = `${output}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, space)}\n`, { encoding: "utf8", flag: "wx" });
    await rename(temporary, output);
  } finally {
    await unlink(temporary).catch(error => { if (error.code !== "ENOENT") throw error; });
  }
}
