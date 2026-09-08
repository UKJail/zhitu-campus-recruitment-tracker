import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { access, chown, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, posix, resolve } from "node:path";
import { acquireResumePdfLock, ResumePdfBusyError } from "./pdf-render-lock";
import { readBoundedDocxArchive } from "./safe-docx-archive";

export type ResumePdfErrorCode = "RENDERER_UNAVAILABLE" | "RENDER_BUSY" | "UNSAFE_DOCUMENT" | "RENDER_FAILED" | "RENDER_TIMEOUT" | "PAGE_COUNT" | "PAGE_SIZE" | "TEXT_MISMATCH";

const messages: Record<ResumePdfErrorCode, string> = {
  RENDERER_UNAVAILABLE: "PDF 转换服务尚未就绪，请先下载 DOCX；不会把未检查的文件标记为一页 PDF。",
  RENDER_BUSY: "PDF 转换服务正在处理其他任务，请稍后重试；不会重复扣除 AI 次数。",
  UNSAFE_DOCUMENT: "该 DOCX 含不支持的动态内容、外部资源或异常结构，请使用不含宏和外链附件的静态 DOCX。",
  RENDER_FAILED: "PDF 转换失败，原简历及已确认文字没有被修改，请先下载 DOCX。",
  RENDER_TIMEOUT: "PDF 转换超时，原简历及已确认文字没有被修改，请稍后重试。",
  PAGE_COUNT: "保留原排版后，PDF 不止一页；请缩短已确认内容或调整原模板后重试，系统没有缩小字号或删改文字。",
  PAGE_SIZE: "原模板导出的 PDF 不是竖版 A4，请先将原模板纸张设为 A4 后重试。",
  TEXT_MISMATCH: "PDF 文字层与已确认的 DOCX 不一致，可能存在缺字或不支持的字体；请先下载 DOCX 检查。",
};

export class ResumePdfError extends Error {
  constructor(public readonly code: ResumePdfErrorCode) {
    super(messages[code]);
    this.name = "ResumePdfError";
  }
}

const MAX_DOCX_BYTES = 10 * 1024 * 1024;
const MAX_PDF_BYTES = 20 * 1024 * 1024;
const MAX_INSPECTION_BYTES = 1024 * 1024;
const MAX_RENDER_OUTPUT_BYTES = MAX_PDF_BYTES + MAX_INSPECTION_BYTES + 1;
const TIMEOUT_MS = 45_000;
const SOURCE_TIMEOUT_MS = 15_000;
const unsafe = () => new ResumePdfError("UNSAFE_DOCUMENT");

function decodeXml(text: string) {
  return text.replace(/&(?:#(x[0-9a-f]+|[0-9]+)|amp|lt|gt|quot|apos);/gi, (entity, numeric: string | undefined) => {
    if (numeric) {
      const value = numeric.toLowerCase().startsWith("x") ? parseInt(numeric.slice(1), 16) : Number(numeric);
      if (value < 1 || value > 0x10ffff || (value >= 0xd800 && value <= 0xdfff)) throw unsafe();
      return String.fromCodePoint(value);
    }
    return ({ "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" } as Record<string, string>)[entity.toLowerCase()];
  });
}

const normalizedText = (text: string) => text.normalize("NFC").replace(/[\s\u00ad\u200b\ufeff]/gu, "");

/** Read-only preflight: the bytes handed to LibreOffice remain byte-for-byte unchanged. */
export async function inspectResumeDocxForPdf(source: Uint8Array): Promise<string[]> {
  try {
    const zip = readBoundedDocxArchive(source);
    if (!zip.has("word/document.xml") || !zip.has("[Content_Types].xml")) throw unsafe();
    const textRuns: string[] = [];
    for (const [name, entry] of zip) {
      if (name.endsWith("/")) continue;
      if (/(?:vbaProject|activeX|embeddings\/|\.exe$|\.dll$|\.bin$)/i.test(name)) throw unsafe();
      if (!/\.(xml|rels)$/i.test(name)) continue;
      const xml = new TextDecoder("utf-8", { fatal: true }).decode(entry);
      if (/<!DOCTYPE|<!ENTITY|\u0000|encoding\s*=\s*["'](?!UTF-8["']|utf-8["'])/i.test(xml)) throw unsafe();
      if (/macroEnabled|vbaProject|<\s*(?:\w+:)?(?:altChunk|object|OLEObject|subDoc|instrText|fldSimple|fldChar|delText|vanish|webHidden)\b/i.test(xml)) throw unsafe();
      if (/\.rels$/i.test(name)) {
        for (const match of xml.matchAll(/<(?:\w+:)?Relationship\b[^>]*>/g)) {
          const tag = match[0];
          const attr = (key: string) => decodeXml(tag.match(new RegExp(`\\b${key}\\s*=\\s*(["'])(.*?)\\1`, "i"))?.[2] ?? "");
          if (attr("TargetMode").toLowerCase() === "external") {
            // Passive contact/portfolio hyperlinks may remain clickable. No linked
            // pictures, templates, files, OLE or network-fetched content is allowed.
            if (!attr("Type").endsWith("/hyperlink") || !/^(https?:\/\/|mailto:|tel:)/i.test(attr("Target"))) throw unsafe();
          } else {
            const target = decodeURIComponent(attr("Target"));
            if (!target || /^(?:[a-z]+:|\/)/i.test(target) || /[\\\0]/.test(target)) throw unsafe();
            const ownerFolder = name === "_rels/.rels" ? "" : name.slice(0, name.lastIndexOf("/_rels/"));
            const part = posix.normalize(posix.join(ownerFolder, target.split("#")[0]));
            if (part.startsWith("../") || !zip.has(part)) throw unsafe();
          }
        }
      }
      if (/^word\/(?:document|header\d*|footer\d*|footnotes|endnotes)\.xml$/i.test(name)) {
        // Tables and text boxes share Word text nodes; include every visible run,
        // not only top-level paragraphs. Header/footer text must also survive.
        for (const match of xml.matchAll(/<(?:\w+:)?t\b[^>]*>([^<]*)<\/(?:\w+:)?t>/g)) {
          const text = decodeXml(match[1]);
          if (normalizedText(text)) textRuns.push(text);
        }
      }
    }
    if (normalizedText(textRuns.join("")).length < 20) throw unsafe();
    return textRuns;
  } catch (error) {
    if (error instanceof ResumePdfError) throw error;
    throw unsafe();
  }
}

export type ResumePdfInspection = { pageCount: number; pages: { width: number; height: number }[]; text: string };
export type ResumePdfVerification = { pageCount: 1; paper: "A4"; textLayerVerified: true; atsTextVerified: true; atsCompatibilityVerified: false; layoutReviewRequired: true };

/** Text-layer coverage is not proof of visual fidelity or recruitment-system compatibility. */
export function verifyResumePdfInspection(inspection: ResumePdfInspection, expectedRuns: string[]): ResumePdfVerification {
  if (inspection.pageCount !== 1 || inspection.pages.length !== 1) throw new ResumePdfError("PAGE_COUNT");
  const page = inspection.pages[0];
  if (!Number.isFinite(page.width) || !Number.isFinite(page.height) || Math.abs(page.width - 595.276) > 2 || Math.abs(page.height - 841.89) > 2) throw new ResumePdfError("PAGE_SIZE");
  const actual = normalizedText(inspection.text);
  const expected = expectedRuns.map(normalizedText).filter(Boolean);
  if (!actual || !expected.length || /[\uFFFD\u0000]/.test(actual) || expected.some((run) => !actual.includes(run))) throw new ResumePdfError("TEXT_MISMATCH");
  // Exact character counts catch missing repeated content AND added words,
  // numbers or claims. Only automatic bullet glyphs may be added by a renderer;
  // unknown numbering is rejected instead of being mistaken for verified facts.
  const counts = new Map<string, number>();
  for (const char of actual) counts.set(char, (counts.get(char) ?? 0) + 1);
  for (const char of expected.join("")) {
    const count = counts.get(char) ?? 0;
    if (!count) throw new ResumePdfError("TEXT_MISMATCH");
    counts.set(char, count - 1);
  }
  if ([...counts].some(([char, count]) => count > 0 && !/[•◦▪▫●○‣⁃]/u.test(char))) throw new ResumePdfError("TEXT_MISMATCH");
  return { pageCount: 1, paper: "A4", textLayerVerified: true, atsTextVerified: true, atsCompatibilityVerified: false, layoutReviewRequired: true };
}

/** The untrusted PDF is parsed only INSIDE the same restricted container as
 * LibreOffice. The website receives bounded JSON metadata then unchanged PDF
 * bytes; it never invokes a PDF parser in its own process. */
export function decodeResumePdfRendererOutput(bytes: Uint8Array): { pdfBytes: Uint8Array; inspection: ResumePdfInspection } {
  if (bytes.length > MAX_RENDER_OUTPUT_BYTES) throw new ResumePdfError("RENDER_FAILED");
  const output = Buffer.from(bytes);
  const delimiter = output.indexOf(10);
  if (delimiter < 1 || delimiter > MAX_INSPECTION_BYTES) throw new ResumePdfError("RENDER_FAILED");
  let inspection: ResumePdfInspection;
  try {
    inspection = JSON.parse(output.subarray(0, delimiter).toString("utf8")) as ResumePdfInspection;
    if (!inspection || !Number.isSafeInteger(inspection.pageCount) || inspection.pageCount < 1 || inspection.pageCount > 100_000 || !Array.isArray(inspection.pages) || inspection.pages.length !== 1 || typeof inspection.text !== "string" || inspection.pages.some((page) => !page || !Number.isFinite(page.width) || !Number.isFinite(page.height))) throw new Error();
  } catch { throw new ResumePdfError("RENDER_FAILED"); }
  const pdfBytes = Uint8Array.from(output.subarray(delimiter + 1));
  if (pdfBytes.length > MAX_PDF_BYTES || Buffer.from(pdfBytes.subarray(0, 5)).toString("ascii") !== "%PDF-") throw new ResumePdfError("RENDER_FAILED");
  return { pdfBytes, inspection };
}

export type ResumePdfRuntime = { backend: "docker"; dockerPath: string; image: string; uid: number; gid: number };
const immutableImage = /^(?:sha256:[a-f0-9]{64}|[a-z0-9][a-z0-9._:/-]*@sha256:[a-f0-9]{64})$/;
const validIdentity = (value: number) => Number.isSafeInteger(value) && value > 0 && value < 2_147_483_647;

export function resumePdfRuntimeFromEnvironment(context: { env: Record<string, string | undefined>; platform: string; uid: number; gid: number } = { env: process.env, platform: process.platform, uid: process.getuid?.() ?? -1, gid: process.getgid?.() ?? -1 }): ResumePdfRuntime | null {
  const dockerPath = context.env.RESUME_PDF_DOCKER_PATH;
  const image = context.env.RESUME_PDF_DOCKER_IMAGE;
  if (context.env.RESUME_PDF_BACKEND !== "docker" || context.platform !== "linux" || !dockerPath || !isAbsolute(dockerPath) || /[\r\n\0]/.test(dockerPath) || !image || !immutableImage.test(image)) return null;
  // A root-owned website can invoke Docker, but the document process must never
  // be root. For non-root websites preserve their UID for the read-only input.
  const uid = context.uid === 0 ? 10_001 : context.uid;
  const gid = context.gid > 0 ? context.gid : uid;
  return validIdentity(uid) && validIdentity(gid) ? { backend: "docker", dockerPath, image, uid, gid } : null;
}

/** Pure argument builder, also contract-tested. No uploaded string is an option. */
export function resumePdfDockerArguments(runtime: ResumePdfRuntime, inputDirectory: string, containerName: string) {
  if (!immutableImage.test(runtime.image) || !validIdentity(runtime.uid) || !validIdentity(runtime.gid) || !isAbsolute(inputDirectory) || /[,\r\n\0]/.test(inputDirectory) || !/^zhitu-pdf-[a-f0-9-]{36}$/.test(containerName)) throw new ResumePdfError("RENDERER_UNAVAILABLE");
  return [
    "--host", "unix:///var/run/docker.sock", "run", "--rm", "--pull=never", "--name", containerName,
    "--label", "com.zhitutracker.purpose=resume-pdf", "--network=none", "--read-only", "--user", `${runtime.uid}:${runtime.gid}`,
    "--cap-drop=ALL", "--security-opt=no-new-privileges:true", "--memory=512m", "--memory-swap=512m", "--cpus=1", "--pids-limit=64",
    "--ulimit", `fsize=${MAX_PDF_BYTES}:${MAX_PDF_BYTES}`, "--ulimit", "nofile=256:256", "--ipc=private", "--shm-size=16m", "--cgroupns=private",
    "--init", "--no-healthcheck", "--restart=no", "--stop-timeout=2", "--log-driver=none",
    "--mount", `type=bind,src=${inputDirectory},dst=/input,readonly,bind-propagation=rprivate`,
    "--tmpfs", `/work:rw,nosuid,nodev,noexec,size=67108864,uid=${runtime.uid},gid=${runtime.gid},mode=0700`,
    "--tmpfs", "/tmp:rw,nosuid,nodev,noexec,size=67108864,mode=1777",
    "--workdir=/work", "--env", "HOME=/work/profile", "--env", "TMPDIR=/tmp", "--env", "LANG=C.UTF-8", "--env", "SAL_USE_VCLPLUGIN=svp",
    "--entrypoint=/usr/local/bin/zhitu-render", runtime.image,
  ];
}

type DockerCall = { args: string[]; cwd: string; timeoutMs: number; capturePdf: boolean; ignoreNonzero?: boolean };
export type ResumePdfDockerRunner = (call: DockerCall) => Promise<Uint8Array>;

export function resumePdfDockerExitError(code: number | null): ResumePdfError | null {
  return code === 0 ? null : new ResumePdfError(code === 124 || code === 137 ? "RENDER_TIMEOUT" : "RENDER_FAILED");
}

function dockerRunner(runtime: ResumePdfRuntime): ResumePdfDockerRunner {
  return ({ args, cwd, timeoutMs, capturePdf, ignoreNonzero }) => new Promise<Uint8Array>((done, fail) => {
    const child = spawn(runtime.dockerPath, args, {
      cwd, shell: false, detached: true, windowsHide: true, stdio: ["ignore", capturePdf ? "pipe" : "ignore", "ignore"],
      // Never inherit DOCKER_HOST, contexts, auth configuration, website secrets
      // or home credentials. The daemon is pinned to the local Unix socket.
      env: { NODE_ENV: "production", PATH: "/usr/bin:/bin", HOME: cwd, DOCKER_CONFIG: join(cwd, "docker-config"), LANG: "C.UTF-8" },
    });
    let rejection: ResumePdfError | null = null;
    let size = 0;
    const chunks: Buffer[] = [];
    const kill = () => { if (child.pid) { try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); } } };
    const timer = setTimeout(() => { rejection = new ResumePdfError("RENDER_TIMEOUT"); kill(); }, timeoutMs);
    child.stdout?.on("data", (data: Buffer) => {
      size += data.length;
      if (size > MAX_RENDER_OUTPUT_BYTES) { rejection = new ResumePdfError("RENDER_FAILED"); kill(); } else chunks.push(data);
    });
    child.once("error", () => { clearTimeout(timer); fail(new ResumePdfError("RENDER_FAILED")); });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (rejection) fail(rejection);
      else if (code !== 0 && !ignoreNonzero) fail(resumePdfDockerExitError(code)!);
      else done(Buffer.concat(chunks));
    });
  });
}

/** Always target the exact random job name; timeout must stop the container too,
 * not merely the Docker CLI. The image has an independent 40-second watchdog. */
export async function runResumePdfDockerJob(runtime: ResumePdfRuntime, inputDirectory: string, containerName: string, run: ResumePdfDockerRunner = dockerRunner(runtime)) {
  const args = resumePdfDockerArguments(runtime, inputDirectory, containerName);
  try {
    return await run({ args, cwd: inputDirectory, timeoutMs: TIMEOUT_MS, capturePdf: true });
  } finally {
    // --rm normally removes it first. A nonzero "already removed" is expected.
    // Cleanup cannot turn an unsuccessful render into a successful result.
    await run({ args: ["--host", "unix:///var/run/docker.sock", "rm", "--force", "--volumes", containerName], cwd: inputDirectory, timeoutMs: 5_000, capturePdf: false, ignoreNonzero: true }).catch(() => undefined);
  }
}

async function convertOffline(source: Uint8Array): Promise<{ pdfBytes: Uint8Array; inspection: ResumePdfInspection }> {
  const runtime = resumePdfRuntimeFromEnvironment();
  if (!runtime) throw new ResumePdfError("RENDERER_UNAVAILABLE");
  try { await access(runtime.dockerPath, constants.X_OK); }
  catch { throw new ResumePdfError("RENDERER_UNAVAILABLE"); }
  const root = await realpath(tmpdir());
  const work = await mkdtemp(join(root, "zhitu-pdf-"));
  try {
    const input = join(work, "resume.docx");
    await writeFile(input, source, { mode: 0o400 });
    if (process.getuid?.() === 0) {
      await chown(work, runtime.uid, runtime.gid);
      await chown(input, runtime.uid, runtime.gid);
    }
    // The sole host mount is read-only. Output is bounded stdout; the container
    // has no writable host path, website tree, credentials or Docker socket.
    return decodeResumePdfRendererOutput(await runResumePdfDockerJob(runtime, work, `zhitu-pdf-${randomUUID()}`));
  } catch (error) {
    if (error instanceof ResumePdfError) throw error;
    throw new ResumePdfError("RENDER_FAILED");
  } finally {
    if (dirname(resolve(work)) === root && work.startsWith(join(root, "zhitu-pdf-"))) await rm(work, { recursive: true, force: true });
  }
}

export type ResumePdfDependencies = {
  convert: (docxBytes: Uint8Array) => Promise<Uint8Array>;
  inspect: (pdfBytes: Uint8Array) => Promise<ResumePdfInspection>;
};

/** Server-only. Call only after applying the user's confirmed text replacements. */
export async function renderVerifiedResumePdf(source: Uint8Array, dependencies?: ResumePdfDependencies): Promise<{ pdfBytes: Uint8Array; verification: ResumePdfVerification }> {
  // Snapshot before the first await, including admission control.
  if (source.length > MAX_DOCX_BYTES) throw unsafe();
  const input = Uint8Array.from(source);
  return renderVerifiedResumePdfFromSource(async () => input, dependencies);
}

/** Admission covers the entire source download/preflight/patch/convert pipeline.
 * Prepare errors are application errors (e.g. ownership or storage failure) and
 * intentionally propagate unchanged to the authenticated route's error mapper. */
export async function renderVerifiedResumePdfFromSource(prepare: (signal: AbortSignal) => Promise<Uint8Array>, dependencies?: ResumePdfDependencies): Promise<{ pdfBytes: Uint8Array; verification: ResumePdfVerification }> {
  if (!dependencies && !resumePdfRuntimeFromEnvironment()) throw new ResumePdfError("RENDERER_UNAVAILABLE");
  let release: (() => Promise<void>) | undefined;
  try {
    release = await acquireResumePdfLock(process.env.RESUME_PDF_LOCK_PATH || join(tmpdir(), "zhitutracker-resume-pdf.lock"));
  } catch (error) {
    throw new ResumePdfError(error instanceof ResumePdfBusyError ? "RENDER_BUSY" : "RENDERER_UNAVAILABLE");
  }
  const controller = new AbortController();
  let preparedSettled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const prepared = Promise.resolve().then(() => prepare(controller.signal)).finally(() => { preparedSettled = true; });
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new ResumePdfError("RENDER_TIMEOUT"));
      controller.abort();
    }, SOURCE_TIMEOUT_MS);
  });
  try {
    const source = await Promise.race([prepared, deadline]);
    clearTimeout(timer);
    if (source.length > MAX_DOCX_BYTES) throw unsafe();
    const input = Uint8Array.from(source);
    try {
      const expected = await inspectResumeDocxForPdf(input);
      const rendered = dependencies ? { pdfBytes: await dependencies.convert(input), inspection: null } : await convertOffline(input);
      const { pdfBytes } = rendered;
      if (pdfBytes.length > MAX_PDF_BYTES || Buffer.from(pdfBytes.subarray(0, 5)).toString("ascii") !== "%PDF-") throw new ResumePdfError("RENDER_FAILED");
      const inspection = rendered.inspection ?? await dependencies!.inspect(pdfBytes);
      return { pdfBytes, verification: verifyResumePdfInspection(inspection, expected) };
    } catch (error) {
      if (error instanceof ResumePdfError) throw error;
      throw new ResumePdfError("RENDER_FAILED");
    }
  } finally {
    clearTimeout(timer);
    if (preparedSettled) await release().catch(() => undefined);
    else {
      // The caller gets a bounded timeout, but an uncooperative download may
      // still be executing. Keep admission until that exact operation settles;
      // never release merely because Promise.race returned first. If the task
      // never settles the service intentionally stays busy for operator review.
      void prepared.then(() => release!(), () => release!()).catch(() => undefined);
    }
  }
}
