import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../test-fixtures/", import.meta.url));
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8" };

createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://127.0.0.1").pathname);
  const relative = pathname === "/" ? "generic.html" : pathname.replace(/^\/+/, "");
  const file = normalize(join(root, relative));
  if (!file.startsWith(root)) { response.writeHead(403).end("Forbidden"); return; }
  try {
    const info = await stat(file);
    if (!info.isFile()) throw new Error("Not a file");
    response.writeHead(200, { "Content-Type": types[extname(file)] ?? "application/octet-stream", "Cache-Control": "no-store" });
    createReadStream(file).pipe(response);
  } catch {
    response.writeHead(404).end("Not found");
  }
}).listen(4173, "127.0.0.1", () => {
  console.log("脱敏验收页：http://127.0.0.1:4173/");
  console.log("北森风格：http://127.0.0.1:4173/beisen-like.html");
  console.log("Moka 风格：http://127.0.0.1:4173/moka-like.html");
});
