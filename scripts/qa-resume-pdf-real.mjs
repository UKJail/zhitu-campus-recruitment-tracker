/** Real-container acceptance, synthetic fixtures ONLY. No .env loading, network
 * credentials, user files, application database, emails, or AI calls. */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire, stripTypeScriptTypes } from "node:module";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const HELP = "Synthetic-only PDF QA: node scripts/qa-resume-pdf-real.mjs --image=sha256:<verified image ID> --docker=/usr/bin/docker --out=/tmp/zhitu-pdf-qa-<new directory>\nRead-only fixture/compilation check: node scripts/qa-resume-pdf-real.mjs --check-fixtures\nPreserves RESUME_PDF_LOCK_PATH when set; otherwise uses the same host-wide default as production. Never loads .env or changes the website's configuration.";

export function readOptions(values) {
  if (values.length === 0 || (values.length === 1 && values[0] === "--help")) return null;
  if (values.length === 1 && values[0] === "--check-fixtures") return { check: true };
  const options = {};
  for (const value of values) {
    const match = /^(--image|--docker|--out)=(.+)$/.exec(value);
    if (!match || Object.hasOwn(options, match[1])) throw new Error("INVALID_QA_ARGUMENTS");
    options[match[1]] = match[2];
  }
  const image = options["--image"];
  const docker = options["--docker"] || "/usr/bin/docker";
  const out = options["--out"];
  if (!image || !/^(?:sha256:[a-f0-9]{64}|[a-z0-9][a-z0-9._:/-]*@sha256:[a-f0-9]{64})$/.test(image)
    || !isAbsolute(docker) || /[\r\n\0]/.test(docker) || !out || !isAbsolute(out) || /[\r\n\0]/.test(out)) throw new Error("INVALID_QA_ARGUMENTS");
  return { image, docker, out, check: false };
}

export async function readFixtures() {
  const file = await readFile(join(root, "scripts/qa-resume-pdf-fixtures.json"), "utf8");
  if (Buffer.byteLength(file) > 1024 * 1024) throw new Error("INVALID_SYNTHETIC_BUNDLE");
  const bundle = JSON.parse(file);
  if (bundle.schemaVersion !== 1 || bundle.syntheticOnly !== true || bundle.fixtureCount !== 5 || !Array.isArray(bundle.fixtures) || bundle.fixtures.length !== 5) throw new Error("INVALID_SYNTHETIC_BUNDLE");
  const expected = new Map([["a4-single-column", null], ["a4-double-column-table", null], ["a4-header-footer", null], ["a4-overflow-two-pages", "PAGE_COUNT"], ["letter-page-size", "PAGE_SIZE"]]);
  for (const fixture of bundle.fixtures) {
    if (!expected.has(fixture.id) || fixture.expectedError !== expected.get(fixture.id) || typeof fixture.docxBase64 !== "string"
      || !/^[a-f0-9]{64}$/.test(fixture.sha256)) throw new Error("INVALID_FIXTURE");
    expected.delete(fixture.id);
    const source = Buffer.from(fixture.docxBase64, "base64");
    if (!source.length || source.length > 128 * 1024 || hash(source) !== fixture.sha256) throw new Error("FIXTURE_CHECKSUM_MISMATCH");
  }
  return bundle;
}

export async function compiledRuntimeSources() {
  const jszipUrl = pathToFileURL(require.resolve("jszip")).href;
  const sources = [];
  for (const name of ["render-pdf", "pdf-render-lock", "safe-docx-archive"]) {
    const source = await readFile(join(root, `src/lib/resumes/${name}.ts`), "utf8");
    const compiled = stripTypeScriptTypes(source, { mode: "transform" })
      .replace(/from ["']\.\/(pdf-render-lock|safe-docx-archive)["']/g, 'from "./$1.mjs"')
      .replace(/from ["']jszip["']/g, `from ${JSON.stringify(jszipUrl)}`);
    if (/from ["'](?:@\/|\.\/(?!pdf-render-lock\.mjs|safe-docx-archive\.mjs))/.test(compiled)) throw new Error("UNSUPPORTED_QA_RUNTIME_IMPORT");
    sources.push({ name, source, compiled: compiled + (name === "render-pdf" ? "\nexport {convertOffline as convertOfflineForQa};\n" : "") });
  }
  return sources;
}

async function main() {
  const options = readOptions(process.argv.slice(2));
  if (!options) { console.log(HELP); return; }
  const bundle = await readFixtures();
  const compiled = await compiledRuntimeSources();
  if (options.check) {
    const dataUrl = (source) => "data:text/javascript;base64," + Buffer.from(source).toString("base64");
    let source = compiled[0].compiled;
    for (const helper of compiled.slice(1)) source = source.replaceAll(`./${helper.name}.mjs`, dataUrl(helper.compiled));
    const renderer = await import(dataUrl(source));
    const archiveChecks = [];
    for (const fixture of bundle.fixtures) {
      const expected = await renderer.inspectResumeDocxForPdf(Buffer.from(fixture.docxBase64, "base64"));
      archiveChecks.push({ id: fixture.id, safeArchivePreflight: true, expectedTextRuns: expected.length });
    }
    console.log(JSON.stringify({ syntheticOnly: true, fixtureCount: bundle.fixtureCount, totalDocxBytes: bundle.fixtures.reduce((sum, item) => sum + Buffer.from(item.docxBase64, "base64").length, 0), compiledModules: compiled.map(item => ({ name: item.name, sourceSha256: hash(item.source) })), archiveChecks, realRenderPerformed: false }));
    return;
  }
  if (process.platform !== "linux") throw new Error("LINUX_RENDERER_REQUIRED");
  const { image, docker, out } = options;
  // Refuse to overwrite any previous QA output or user directory.
  await mkdir(out, { mode: 0o700 });
  // Test-only export exposes the production conversion implementation so the
  // unchanged full entrypoint can capture rejected PDF artifacts for visual QA.
  for (const item of compiled) await writeFile(join(out, `${item.name}.mjs`), item.compiled, { mode: 0o600, flag: "wx" });
  process.env.RESUME_PDF_BACKEND = "docker";
  process.env.RESUME_PDF_DOCKER_PATH = docker;
  process.env.RESUME_PDF_DOCKER_IMAGE = image;
  // Honor the configured production slot. Never clear it or choose a separate
  // QA path that could evade a currently active production render.
  const admissionLockPath = process.env.RESUME_PDF_LOCK_PATH || join(tmpdir(), "zhitutracker-resume-pdf.lock");
  const renderer = await import(pathToFileURL(join(out, "render-pdf.mjs")).href);
  const results = [];
  for (const fixture of bundle.fixtures) {
    if (!/^[a-z0-9-]+$/.test(fixture.id) || ![null, "PAGE_COUNT", "PAGE_SIZE"].includes(fixture.expectedError)) throw new Error("INVALID_FIXTURE");
    const source = Buffer.from(fixture.docxBase64, "base64");
    if (source.length > 128 * 1024 || hash(source) !== fixture.sha256) throw new Error("FIXTURE_CHECKSUM_MISMATCH");
    await writeFile(join(out, fixture.id + ".docx"), source, { mode: 0o400 });
    let observed = null;
    let actual;
    let verified;
    let busyRejected = false;
    let busyPrepareSkipped = false;
    let prepared = 0;
    const started = Date.now();
    try {
      verified = await renderer.renderVerifiedResumePdfFromSource(async () => { prepared += 1; return source; }, {
        convert: async (bytes) => {
          // This nested request must fail immediately while the full entrypoint
          // holds the admission lock, before even reading/preparing its DOCX.
          let busyPrepared = false;
          try { await renderer.renderVerifiedResumePdfFromSource(async () => { busyPrepared = true; return bytes; }); }
          catch (error) { busyRejected = error?.code === "RENDER_BUSY"; }
          busyPrepareSkipped = !busyPrepared;
          if (!busyRejected || !busyPrepareSkipped) throw new Error("ADMISSION_NOT_EXCLUSIVE");
          actual = await renderer.convertOfflineForQa(bytes);
          await writeFile(join(out, fixture.id + ".pdf"), actual.pdfBytes, { mode: 0o600 });
          await writeFile(join(out, fixture.id + ".inspection.json"), JSON.stringify(actual.inspection, null, 2), { mode: 0o600 });
          return actual.pdfBytes;
        },
        inspect: async () => actual.inspection,
      });
    } catch (error) { observed = error?.code || "QA_FAILED"; }
    const record = { id: fixture.id, expectedError: fixture.expectedError, observedError: observed,
      matchedExpectation: observed === fixture.expectedError, busyRejected, busyPrepareSkipped, preparedOnce: prepared === 1, elapsedMs: Date.now() - started,
      sourceUnchanged: hash(source) === fixture.sha256, sourceSha256: fixture.sha256,
      pdfSha256: actual ? hash(actual.pdfBytes) : null, pageCount: actual?.inspection.pageCount ?? null,
      pages: actual?.inspection.pages ?? null, verification: verified?.verification ?? null };
    results.push(record);
    console.log(JSON.stringify(record)); // Synthetic IDs/counts/hashes only, no document text or secrets.
  }
  const report = { syntheticOnly: true, image, admissionLockPath, rendererSourceSha256: hash(compiled[0].source),
    runtimeSources: compiled.map(item => ({ name: item.name, sourceSha256: hash(item.source) })),
    completedAt: new Date().toISOString(), passed: results.every((item) => item.matchedExpectation && item.busyRejected && item.busyPrepareSkipped && item.preparedOnce && item.sourceUnchanged),
    visualReviewRequired: true, results };
  await writeFile(join(out, "report.json"), JSON.stringify(report, null, 2), { mode: 0o600 });
  process.exitCode = report.passed ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    const safeCodes = new Set(["INVALID_QA_ARGUMENTS", "INVALID_SYNTHETIC_BUNDLE", "INVALID_FIXTURE", "FIXTURE_CHECKSUM_MISMATCH", "UNSUPPORTED_QA_RUNTIME_IMPORT", "LINUX_RENDERER_REQUIRED"]);
    console.error(JSON.stringify({ event: "pdf_qa_failed", code: safeCodes.has(error?.message) ? error.message : "QA_FAILED" }));
    process.exitCode = 1;
  });
}
