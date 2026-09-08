// @vitest-environment node
import JSZip from "jszip";
import { describe, expect, it, vi } from "vitest";
import { inspectResumeDocxForPdf, decodeResumePdfRendererOutput, renderVerifiedResumePdf, renderVerifiedResumePdfFromSource, ResumePdfError, resumePdfDockerArguments, resumePdfDockerExitError, resumePdfRuntimeFromEnvironment, runResumePdfDockerJob, verifyResumePdfInspection, type ResumePdfInspection, type ResumePdfRuntime, type ResumePdfDockerRunner } from "./render-pdf";

const sampleText = "Example Candidate Confirmed Resume Text";
const documentXml = (text = sampleText) => `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p><w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:cols w:num="2"/></w:sectPr></w:body></w:document>`;
async function docx(parts: Record<string, string> = {}) {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file("word/document.xml", documentXml());
  for (const [name, value] of Object.entries(parts)) zip.file(name, value);
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

const validInspection = (text = sampleText): ResumePdfInspection => ({ pageCount: 1, pages: [{ width: 595.276, height: 841.89 }], text });

// A synthetic binary payload for protocol tests. These tests do NOT prove the
// real LibreOffice/Poppler container or visual fidelity; deployment must test it.
function syntheticPdf(text = sampleText, width = 595.276, height = 841.89, pages = 1) {
  const content = `BT /F1 12 Tf 40 800 Td (${text.replace(/[\\()]/g, "\\$&")}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${Array.from({ length: pages }, (_, i) => `${5 + i} 0 R`).join(" ")}] /Count ${pages} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    ...Array.from({ length: pages }, () => `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 3 0 R >> >> /Contents 4 0 R >>`),
  ];
  let output = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) { offsets.push(output.length); output += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`; }
  const xref = output.length;
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) output += `${String(offset).padStart(10, "0")} 00000 n \n`;
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Uint8Array(Buffer.from(output, "ascii"));
}

describe("resume PDF source preflight", () => {
  it("reads confirmed body, table, text-box, header and footer runs without altering the archive", async () => {
    const source = await docx({
      "word/document.xml": documentXml().replace("</w:body>", '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Table text</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:txbxContent><w:p><w:r><w:t>Box text</w:t></w:r></w:p></w:txbxContent></w:body>'),
      "word/header1.xml": '<w:hdr><w:p><w:r><w:t>Header</w:t></w:r></w:p></w:hdr>',
      "word/footer1.xml": '<w:ftr><w:p><w:r><w:t>Footer</w:t></w:r></w:p></w:ftr>',
    });
    const before = Uint8Array.from(source);
    expect(await inspectResumeDocxForPdf(source)).toEqual([sampleText, "Table text", "Box text", "Header", "Footer"]);
    expect(source).toEqual(before);
  });

  it("decodes escaped and numeric character references exactly once", async () => {
    expect(await inspectResumeDocxForPdf(await docx({ "word/document.xml": documentXml("Confirmed A &amp; B &lt; C &#x4E2D; &#25991; &amp;lt;") })))
      .toEqual(["Confirmed A & B < C 中 文 &lt;"]);
  });

  it.each([
    ["macros", "word/vbaProject.bin", "macro"],
    ["embedded files", "word/embeddings/file.docx", "file"],
    ["DOCTYPE", "word/document.xml", '<!DOCTYPE d [<!ENTITY x SYSTEM "file:///etc/passwd">]>' + documentXml()],
    ["dynamic fields", "word/document.xml", documentXml().replace("</w:body>", '<w:instrText>INCLUDETEXT file:///etc/passwd</w:instrText></w:body>')],
    ["hidden text", "word/document.xml", documentXml().replace("<w:r>", "<w:r><w:rPr><w:vanish/></w:rPr>")],
    ["external images", "word/_rels/document.xml.rels", '<Relationships><Relationship Id="a" Type="x/image" TargetMode="External" Target="https://example.invalid/pixel"/></Relationships>'],
    ["file hyperlinks", "word/_rels/document.xml.rels", '<Relationships><Relationship Id="a" Type="x/hyperlink" TargetMode="External" Target="file:///etc/passwd"/></Relationships>'],
    ["disguised local file", "word/_rels/document.xml.rels", '<Relationships><Relationship Id="a" Type="x/image" Target="file:///etc/passwd"/></Relationships>'],
    ["escaping internal resource", "word/_rels/document.xml.rels", '<Relationships><Relationship Id="a" Type="x/image" Target="../../etc/passwd"/></Relationships>'],
    ["missing internal resource", "word/_rels/document.xml.rels", '<Relationships><Relationship Id="a" Type="x/image" Target="media/missing.png"/></Relationships>'],
  ])("rejects %s before conversion", async (_name, file, contents) => {
    await expect(inspectResumeDocxForPdf(await docx({ [file]: contents }))).rejects.toMatchObject({ code: "UNSAFE_DOCUMENT" });
  });

  it("allows passive safe hyperlinks and package-local images", async () => {
    const source = await docx({
      "word/_rels/document.xml.rels": '<Relationships><Relationship Id="a" Type="x/hyperlink" TargetMode="External" Target="https://example.invalid/cv"/><Relationship Id="b" Type="x/image" Target="media/photo.png"/></Relationships>',
      "word/media/photo.png": "synthetic-image-placeholder",
    });
    expect(await inspectResumeDocxForPdf(source)).toEqual([sampleText]);
  });

  it("rejects invalid, oversized and path-traversing archives", async () => {
    await expect(inspectResumeDocxForPdf(new Uint8Array(32))).rejects.toMatchObject({ code: "UNSAFE_DOCUMENT" });
    await expect(inspectResumeDocxForPdf(new Uint8Array(10 * 1024 * 1024 + 1))).rejects.toMatchObject({ code: "UNSAFE_DOCUMENT" });
    await expect(inspectResumeDocxForPdf(await docx({ "../escape.txt": "x" }))).rejects.toMatchObject({ code: "UNSAFE_DOCUMENT" });
  });

  it("checks decompression limits before inflating compressed payloads", async () => {
    const source = await docx({ "word/padding.xml": " ".repeat(3_000_000) });
    await expect(inspectResumeDocxForPdf(source)).rejects.toMatchObject({ code: "UNSAFE_DOCUMENT" });
  });

  it("rejects disagreeing local and central archive filenames", async () => {
    const source = Buffer.from(await docx());
    expect(source.readUInt32LE(0)).toBe(0x04034b50);
    source[30] = source[30] === 65 ? 66 : 65;
    await expect(inspectResumeDocxForPdf(source)).rejects.toMatchObject({ code: "UNSAFE_DOCUMENT" });
  });
});

describe("actual PDF acceptance rules", () => {
  it("allows whitespace differences and additional automatic bullet characters", () => {
    expect(verifyResumePdfInspection(validInspection("• Example\nCandidate Confirmed\tResume Text"), [sampleText]))
      .toEqual({ pageCount: 1, paper: "A4", textLayerVerified: true, atsTextVerified: true, atsCompatibilityVerified: false, layoutReviewRequired: true });
  });

  it("does not equate a verified text layer with visual or ATS compatibility proof", () => {
    expect(verifyResumePdfInspection(validInspection(), [sampleText]).layoutReviewRequired).toBe(true);
  });

  it("keeps the exact-run gate when physical rows interleave two columns", () => {
    const left = "Excel SQL Python";
    const right = "参与团队讨论，解释清洗步骤与检查范围，不将团队成果归为个人独立成果。";
    const physicalRows = right.replace("个人独立", `个人\n${left}\n独立`);
    expect(() => verifyResumePdfInspection(validInspection(physicalRows), [left, right]))
      .toThrow(expect.objectContaining({ code: "TEXT_MISMATCH" }));
    const readingOrder = `${left}\n${right.replace("个人独立", "个人\n独立")}`;
    expect(verifyResumePdfInspection(validInspection(readingOrder), [left, right]).textLayerVerified).toBe(true);
    for (const changed of [readingOrder.replace("个人", "团队"), readingOrder + "成果", readingOrder.replace(left, "")]) {
      expect(() => verifyResumePdfInspection(validInspection(changed), [left, right]))
        .toThrow(expect.objectContaining({ code: "TEXT_MISMATCH" }));
    }
  });

  it("rejects two pages instead of truncating the PDF", () => {
    expect(() => verifyResumePdfInspection({ ...validInspection(), pageCount: 2 }, [sampleText])).toThrow(expect.objectContaining({ code: "PAGE_COUNT" }));
  });

  it.each([[612, 792], [841.89, 595.276], [NaN, 841.89]])("rejects non-A4 portrait size %s x %s", (width, height) => {
    expect(() => verifyResumePdfInspection({ ...validInspection(), pages: [{ width, height }] }, [sampleText])).toThrow(expect.objectContaining({ code: "PAGE_SIZE" }));
  });

  it.each(["", "Example Candidate Confirmed Resume", "Example Candidate Confirmed Resume Text �", "Changed Candidate Confirmed Resume Text"])("rejects missing or corrupt confirmed text", (text) => {
    expect(() => verifyResumePdfInspection(validInspection(text), [sampleText])).toThrow(expect.objectContaining({ code: "TEXT_MISMATCH" }));
  });

  it("detects a missing repeated run", () => {
    expect(() => verifyResumePdfInspection(validInspection(), [sampleText, "Candidate"])).toThrow(expect.objectContaining({ code: "TEXT_MISMATCH" }));
  });

  it.each([`${sampleText} Led 20 projects`, `${sampleText} 2027`, `${sampleText} ${sampleText}`])("rejects additional facts and repeated text: %s", (text) => {
    expect(() => verifyResumePdfInspection(validInspection(text), [sampleText])).toThrow(expect.objectContaining({ code: "TEXT_MISMATCH" }));
  });

  it("validates bounded container inspection metadata without parsing PDF in the website process", () => {
    const pdf = syntheticPdf();
    const output = Buffer.concat([Buffer.from(JSON.stringify(validInspection()) + "\n"), pdf]);
    const result = decodeResumePdfRendererOutput(output);
    expect(result.pdfBytes).toEqual(pdf);
    expect(result.inspection).toEqual(validInspection());
    expect(verifyResumePdfInspection(result.inspection, [sampleText]).paper).toBe("A4");
  });

  it.each(["not json\n%PDF-", "{}\n%PDF-", "{\"pageCount\":1,\"pages\":[],\"text\":\"x\"}\n%PDF-", JSON.stringify(validInspection()) + "\nnot PDF"])("rejects malformed container output", (output) => {
    expect(() => decodeResumePdfRendererOutput(Buffer.from(output))).toThrow(expect.objectContaining({ code: "RENDER_FAILED" }));
  });

  it("rejects an overlong inspection header before JSON parsing", () => {
    expect(() => decodeResumePdfRendererOutput(Buffer.from(" ".repeat(1024 * 1024 + 1) + "\n%PDF-"))).toThrow(expect.objectContaining({ code: "RENDER_FAILED" }));
  });
});

describe("render pipeline", () => {
  it("acquires admission before source preparation and never invokes a busy request's prepare callback", async () => {
    const source = await docx();
    const secondPrepare = vi.fn(async () => source);
    const dependencies = { convert: async () => syntheticPdf(), inspect: async () => validInspection() };
    await renderVerifiedResumePdfFromSource(async () => {
      await expect(renderVerifiedResumePdfFromSource(secondPrepare, dependencies)).rejects.toMatchObject({ code: "RENDER_BUSY" });
      expect(secondPrepare).not.toHaveBeenCalled();
      return source;
    }, dependencies);
  });

  it("preserves source preparation business errors and releases its admission slot", async () => {
    const businessError = Object.assign(new Error("SOURCE_NOT_FOUND"), { status: 404 });
    const dependencies = { convert: async () => syntheticPdf(), inspect: async () => validInspection() };
    await expect(renderVerifiedResumePdfFromSource(async () => { throw businessError; }, dependencies)).rejects.toBe(businessError);
    await expect(renderVerifiedResumePdfFromSource(() => docx(), dependencies)).resolves.toMatchObject({ verification: { pageCount: 1 } });
  });

  it("returns a bounded source timeout but retains admission until a non-cooperative source settles", async () => {
    const source = await docx();
    const dependencies = { convert: async () => syntheticPdf(), inspect: async () => validInspection() };
    let finish!: (value: Uint8Array) => void;
    let started!: () => void;
    let sourceSignal: AbortSignal | undefined;
    const startedPromise = new Promise<void>((resolve) => { started = resolve; });
    vi.useFakeTimers();
    try {
      const pending = renderVerifiedResumePdfFromSource((signal) => {
        sourceSignal = signal;
        started();
        return new Promise((resolve) => { finish = resolve; });
      }, dependencies);
      const timeoutCheck = expect(pending).rejects.toMatchObject({ code: "RENDER_TIMEOUT" });
      await startedPromise;
      await vi.advanceTimersByTimeAsync(15_000);
      await timeoutCheck;
      expect(sourceSignal?.aborted).toBe(true);
      const secondPrepare = vi.fn(async () => source);
      await expect(renderVerifiedResumePdfFromSource(secondPrepare, dependencies)).rejects.toMatchObject({ code: "RENDER_BUSY" });
      expect(secondPrepare).not.toHaveBeenCalled();
      finish(source);
    } finally { vi.useRealTimers(); }
    // Wait for the exact source promise's deferred asynchronous file release.
    await expect.poll(async () => {
      try { await renderVerifiedResumePdf(source, dependencies); return "ready"; }
      catch (error) { return (error as ResumePdfError).code; }
    }).toBe("ready");
  });
  it("passes byte-identical DOCX to the converter and checks the actual resulting PDF", async () => {
    const source = await docx();
    const convert = vi.fn(async (bytes: Uint8Array) => { expect(bytes).toEqual(source); return syntheticPdf(); });
    const result = await renderVerifiedResumePdf(source, { convert, inspect: async () => validInspection() });
    expect(result.verification.pageCount).toBe(1);
    expect(result.pdfBytes).toEqual(syntheticPdf());
    expect(convert).toHaveBeenCalledOnce();
  });

  it("never sends unsafe documents to the subprocess", async () => {
    const convert = vi.fn();
    await expect(renderVerifiedResumePdf(await docx({ "word/vbaProject.bin": "x" }), { convert, inspect: vi.fn() })).rejects.toMatchObject({ code: "UNSAFE_DOCUMENT" });
    expect(convert).not.toHaveBeenCalled();
  });

  it("rejects converter errors without leaking paths or document contents", async () => {
    await expect(renderVerifiedResumePdf(await docx(), { convert: async () => { throw new Error("secret@example.invalid /private/temp-path"); }, inspect: vi.fn() }))
      .rejects.toEqual(new ResumePdfError("RENDER_FAILED"));
  });

  it("propagates an actionable timeout code", async () => {
    await expect(renderVerifiedResumePdf(await docx(), { convert: async () => { throw new ResumePdfError("RENDER_TIMEOUT"); }, inspect: vi.fn() }))
      .rejects.toMatchObject({ code: "RENDER_TIMEOUT" });
  });

  it("rejects non-PDF output without trying the parser", async () => {
    const inspect = vi.fn();
    await expect(renderVerifiedResumePdf(await docx(), { convert: async () => new Uint8Array([1, 2, 3]), inspect })).rejects.toMatchObject({ code: "RENDER_FAILED" });
    expect(inspect).not.toHaveBeenCalled();
  });

  it("fails closed when the isolated renderer is not configured", async () => {
    vi.stubEnv("RESUME_PDF_BACKEND", "");
    vi.stubEnv("RESUME_PDF_SOFFICE_PATH", "");
    vi.stubEnv("RESUME_PDF_UNSHARE_PATH", "");
    try {
      expect(resumePdfRuntimeFromEnvironment()).toBeNull();
      await expect(renderVerifiedResumePdf(await docx())).rejects.toMatchObject({ code: "RENDERER_UNAVAILABLE" });
    } finally { vi.unstubAllEnvs(); }
  });
});

describe("restricted Docker renderer contract", () => {
  const image = `sha256:${"a".repeat(64)}`;
  const runtime: ResumePdfRuntime = { backend: "docker", dockerPath: "/usr/bin/docker", image, uid: 10001, gid: 10001 };
  const name = "zhitu-pdf-12345678-1234-1234-1234-123456789abc";
  const input = "/tmp/zhitu-pdf-synthetic";
  const env = { RESUME_PDF_BACKEND: "docker", RESUME_PDF_DOCKER_PATH: "/usr/bin/docker", RESUME_PDF_DOCKER_IMAGE: image };

  it("defaults off and never uses the former host-root unshare backend", () => {
    const context = { platform: "linux", uid: 0, gid: 0 };
    expect(resumePdfRuntimeFromEnvironment({ ...context, env: {} })).toBeNull();
    expect(resumePdfRuntimeFromEnvironment({ ...context, env: { RESUME_PDF_SOFFICE_PATH: "/usr/bin/libreoffice", RESUME_PDF_UNSHARE_PATH: "/usr/bin/unshare" } })).toBeNull();
    expect(resumePdfRuntimeFromEnvironment({ ...context, env: { ...env, RESUME_PDF_BACKEND: "unshare" } })).toBeNull();
  });

  it("runs container as non-root even when PM2 is root", () => {
    expect(resumePdfRuntimeFromEnvironment({ env, platform: "linux", uid: 0, gid: 0 })).toEqual(runtime);
    expect(resumePdfRuntimeFromEnvironment({ env, platform: "linux", uid: 1000, gid: 1000 })).toEqual({ ...runtime, uid: 1000, gid: 1000 });
  });

  it.each(["latest", "zhitu-pdf:latest", "registry.example/pdf:0.1", "sha256:short", `sha256:${"g".repeat(64)}`, `registry.example/pdf@sha256:${"a".repeat(63)}`])("rejects mutable or invalid image %s", (badImage) => {
    expect(resumePdfRuntimeFromEnvironment({ env: { ...env, RESUME_PDF_DOCKER_IMAGE: badImage }, platform: "linux", uid: 0, gid: 0 })).toBeNull();
  });

  it("accepts only local Linux executable configuration and a pinned image", () => {
    expect(resumePdfRuntimeFromEnvironment({ env: { ...env, RESUME_PDF_DOCKER_IMAGE: `registry.example:5000/team/renderer@${image}` }, platform: "linux", uid: 0, gid: 0 })?.image).toBe(`registry.example:5000/team/renderer@${image}`);
    expect(resumePdfRuntimeFromEnvironment({ env, platform: "win32", uid: 0, gid: 0 })).toBeNull();
    expect(resumePdfRuntimeFromEnvironment({ env: { ...env, RESUME_PDF_DOCKER_PATH: "docker" }, platform: "linux", uid: 0, gid: 0 })).toBeNull();
  });

  it("enforces no network, no root, no capabilities, read-only root and resource limits", () => {
    const args = resumePdfDockerArguments(runtime, input, name);
    expect(args).toEqual(expect.arrayContaining([
      "--host", "unix:///var/run/docker.sock", "--rm", "--pull=never", "--network=none", "--read-only", "--user", "10001:10001",
      "--cap-drop=ALL", "--security-opt=no-new-privileges:true", "--memory=512m", "--memory-swap=512m", "--pids-limit=64", "--cpus=1", "--log-driver=none",
    ]));
    expect(args).not.toEqual(expect.arrayContaining(["--privileged", "--network=host", "--pid=host", "--userns=host"]));
    expect(args.at(-1)).toBe(image);
  });

  it("mounts only the single input directory read-only and returns PDF through stdout", () => {
    const args = resumePdfDockerArguments(runtime, input, name);
    expect(args.filter((arg) => arg === "--mount")).toHaveLength(1);
    expect(args).toContain(`type=bind,src=${input},dst=/input,readonly,bind-propagation=rprivate`);
    expect(args).toContain("/work:rw,nosuid,nodev,noexec,size=67108864,uid=10001,gid=10001,mode=0700");
    expect(args).toContain("/tmp:rw,nosuid,nodev,noexec,size=67108864,mode=1777");
    expect(args.join(" ")).not.toContain("docker.sock,dst=");
    expect(args.join(" ")).not.toContain("--env-file");
    expect(args.join(" ")).not.toContain("--volume");
  });

  it.each(["/tmp/job,readonly=false", "/tmp/job\nmore", "relative-dir"])("rejects ambiguous mount path %s", (path) => {
    expect(() => resumePdfDockerArguments(runtime, path, name)).toThrow(expect.objectContaining({ code: "RENDERER_UNAVAILABLE" }));
  });

  it("rejects a privileged identity or non-job container name", () => {
    expect(() => resumePdfDockerArguments({ ...runtime, uid: 0 }, input, name)).toThrow();
    expect(() => resumePdfDockerArguments({ ...runtime, gid: 0 }, input, name)).toThrow();
    expect(() => resumePdfDockerArguments(runtime, input, "user-database")).toThrow();
  });

  it("force-cleans the exact container name after success", async () => {
    const calls: Parameters<ResumePdfDockerRunner>[0][] = [];
    const run: ResumePdfDockerRunner = async (call) => { calls.push(call); return call.capturePdf ? syntheticPdf() : new Uint8Array(); };
    expect(await runResumePdfDockerJob(runtime, input, name, run)).toEqual(syntheticPdf());
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({ capturePdf: true, timeoutMs: 45000 });
    expect(calls[1]).toEqual({ args: ["--host", "unix:///var/run/docker.sock", "rm", "--force", "--volumes", name], cwd: input, timeoutMs: 5000, capturePdf: false, ignoreNonzero: true });
  });

  it("force-cleans the container after timeout, not only the Docker client", async () => {
    const calls: Parameters<ResumePdfDockerRunner>[0][] = [];
    const run: ResumePdfDockerRunner = async (call) => { calls.push(call); if (call.capturePdf) throw new ResumePdfError("RENDER_TIMEOUT"); return new Uint8Array(); };
    await expect(runResumePdfDockerJob(runtime, input, name, run)).rejects.toMatchObject({ code: "RENDER_TIMEOUT" });
    expect(calls[1].args).toContain("--force");
    expect(calls[1].args.at(-1)).toBe(name);
  });

  it("does not mask the original failure if the daemon also fails during cleanup", async () => {
    const run: ResumePdfDockerRunner = async (call) => { throw new ResumePdfError(call.capturePdf ? "RENDER_TIMEOUT" : "RENDER_FAILED"); };
    await expect(runResumePdfDockerJob(runtime, input, name, run)).rejects.toMatchObject({ code: "RENDER_TIMEOUT" });
  });

  it.each([124, 137])("classifies the in-container watchdog exit %s as a timeout", (code) => {
    expect(resumePdfDockerExitError(code)).toMatchObject({ code: "RENDER_TIMEOUT" });
  });

  it("does not classify generic exits or success as a watchdog timeout", () => {
    expect(resumePdfDockerExitError(0)).toBeNull();
    expect(resumePdfDockerExitError(1)).toMatchObject({ code: "RENDER_FAILED" });
    expect(resumePdfDockerExitError(null)).toMatchObject({ code: "RENDER_FAILED" });
  });
});
