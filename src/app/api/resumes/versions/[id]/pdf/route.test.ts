// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAuthenticatedUserId, patchResumeTemplateDocx, renderVerifiedResumePdf, renderVerifiedResumePdfFromSource, inspectResumeDocxForPdf } = vi.hoisted(() => ({
  getAuthenticatedUserId: vi.fn(), patchResumeTemplateDocx: vi.fn(), renderVerifiedResumePdf: vi.fn(), renderVerifiedResumePdfFromSource: vi.fn(), inspectResumeDocxForPdf: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ getAuthenticatedUserId }));
vi.mock("@/lib/resumes/template-docx", () => ({ patchResumeTemplateDocx }));
vi.mock("@/lib/resumes/render-pdf", async (original) => ({
  ...await original<typeof import("@/lib/resumes/render-pdf")>(), renderVerifiedResumePdf, renderVerifiedResumePdfFromSource, inspectResumeDocxForPdf,
}));

import * as pdfRoute from "./route";
import { GET as downloadDocx } from "../download/route";
import { ResumePdfError, type ResumePdfErrorCode } from "@/lib/resumes/render-pdf";
import { DOCX_CONTENT_TYPE, loadConfirmedResumeDocx, resumeDownloadDisposition, resumeExportFilename } from "@/lib/resumes/version-export";

const userId = "11111111-1111-4111-8111-111111111111";
const versionId = "22222222-2222-4222-8222-222222222222";
const resumeId = "33333333-3333-4333-8333-333333333333";
const context = { params: Promise.resolve({ id: versionId }) };
const source = new TextEncoder().encode("source docx");
const patched = new TextEncoder().encode("locked confirmed docx");
const pdf = new TextEncoder().encode("%PDF-1.7 verified");
const replacements = [{ original: "参与课程项目", revised: "参与课程数据整理" }];
const request = (headers: Record<string, string> = { "X-Resume-Export": "pdf", "Sec-Fetch-Site": "same-origin" }) => new Request(`https://zhitutracker.com/api/resumes/versions/${versionId}/pdf`, { method: "POST", headers });

function fixture() {
  const version = { id: versionId, resume_id: resumeId, source: "ai_suggestion", content: { meta: { targetCompany: "示例公司", targetRole: "分析实习生", templatePolicy: "preserve_original_docx", replacements } } };
  const resume = { name: "candidate.docx", mime_type: DOCX_CONTENT_TYPE, storage_path: `${userId}/candidate.docx` };
  const filters: Array<[string, string, unknown]> = [];
  const signals: Array<[string, AbortSignal]> = [];
  const hooks: { afterQuery?: (table: string) => void } = {};
  const download = vi.fn().mockResolvedValue({ data: new Blob([source]), error: null });
  const from = vi.fn((table: string) => {
    let owner: unknown;
    const chain = {
      select: vi.fn(() => chain),
      abortSignal: vi.fn((signal: AbortSignal) => { signals.push([table, signal]); return chain; }),
      eq: vi.fn((field: string, value: unknown) => { filters.push([table, field, value]); if (field === "user_id") owner = value; return chain; }),
      single: vi.fn(async () => {
        hooks.afterQuery?.(table);
        return { data: owner === userId ? table === "resume_versions" ? version : resume : null, error: null };
      }),
    };
    return chain;
  });
  const supabase = { from, storage: { from: vi.fn(() => ({ download })) } };
  getAuthenticatedUserId.mockResolvedValue({ userId, supabase });
  return { version, resume, download, from, filters, supabase, signals, hooks };
}

function prepareWithSignal(state: ReturnType<typeof fixture>, signal: AbortSignal) {
  return loadConfirmedResumeDocx(state.supabase as unknown as Parameters<typeof loadConfirmedResumeDocx>[0], userId, versionId, inspectResumeDocxForPdf, signal);
}

describe("explicit private one-page PDF export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    patchResumeTemplateDocx.mockResolvedValue(patched);
    inspectResumeDocxForPdf.mockResolvedValue(["source"]);
    renderVerifiedResumePdf.mockResolvedValue({ pdfBytes: pdf, verification: { pageCount: 1, paper: "A4", textLayerVerified: true, layoutReviewRequired: true, atsCompatibilityVerified: false } });
    renderVerifiedResumePdfFromSource.mockImplementation(async (prepare: (signal: AbortSignal) => Promise<Uint8Array>) => renderVerifiedResumePdf(await prepare(new AbortController().signal)));
  });

  it("exports the same locked DOCX bytes as the Word endpoint, with private verification headers", async () => {
    const { filters, from, download, signals } = fixture();
    const response = await pdfRoute.POST(request(), context);
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(pdf);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-resume-pdf-pages")).toBe("1");
    expect(response.headers.get("x-resume-layout-review")).toBe("required");
    expect(response.headers.get("x-resume-text-verified")).toBe("true");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(inspectResumeDocxForPdf).toHaveBeenCalledWith(source);
    expect(patchResumeTemplateDocx).toHaveBeenCalledWith(source, replacements);
    expect(renderVerifiedResumePdf).toHaveBeenCalledWith(patched);
    expect(inspectResumeDocxForPdf.mock.invocationCallOrder[0]).toBeLessThan(patchResumeTemplateDocx.mock.invocationCallOrder[0]);
    expect(filters).toContainEqual(["resume_versions", "user_id", userId]);
    expect(filters).toContainEqual(["resumes", "user_id", userId]);
    expect(from.mock.calls.map(([table]) => table)).toEqual(["resume_versions", "resumes"]);
    expect(signals.map(([table]) => table)).toEqual(["resume_versions", "resumes"]);
    expect(signals[0][1]).toBe(signals[1][1]);
    expect(download).toHaveBeenCalledWith(`${userId}/candidate.docx`, {}, { signal: signals[0][1], cache: "no-store" });
    const docx = await downloadDocx(request(), context);
    expect(docx.status).toBe(200);
    expect(new Uint8Array(await docx.arrayBuffer())).toEqual(patched);
    expect(renderVerifiedResumePdf).toHaveBeenCalledTimes(1);
    // The existing DOCX endpoint does not acquire or depend on a PDF timeout.
    expect(signals).toHaveLength(2);
    expect(download.mock.calls.at(-1)).toEqual([`${userId}/candidate.docx`]);
  });

  it("does not start source preparation with an already-aborted signal", async () => {
    const state = fixture(); const controller = new AbortController(); const reason = new Error("source deadline");
    controller.abort(reason);
    await expect(prepareWithSignal(state, controller.signal)).rejects.toBe(reason);
    expect(state.from).not.toHaveBeenCalled();
    expect(state.download).not.toHaveBeenCalled();
  });

  it.each(["resume_versions", "resumes"])("does not advance beyond cancelled %s metadata", async (table) => {
    const state = fixture(); const controller = new AbortController(); const reason = new Error("source deadline");
    state.hooks.afterQuery = (current) => { if (current === table) controller.abort(reason); };
    await expect(prepareWithSignal(state, controller.signal)).rejects.toBe(reason);
    expect(state.from.mock.calls.map(([name]) => name)).toEqual(table === "resumes" ? ["resume_versions", "resumes"] : ["resume_versions"]);
    expect(state.download).not.toHaveBeenCalled();
    expect(inspectResumeDocxForPdf).not.toHaveBeenCalled();
  });

  it("does not read a completed Blob after storage cancellation", async () => {
    const state = fixture(); const controller = new AbortController(); const reason = new Error("source deadline");
    const arrayBuffer = vi.fn();
    state.download.mockImplementation(async () => { controller.abort(reason); return { data: { size: 12, arrayBuffer }, error: null }; });
    await expect(prepareWithSignal(state, controller.signal)).rejects.toBe(reason);
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(inspectResumeDocxForPdf).not.toHaveBeenCalled();
  });

  it("does not inspect content when cancellation happens during Blob reading", async () => {
    const state = fixture(); const controller = new AbortController(); const reason = new Error("source deadline");
    state.download.mockResolvedValue({ data: { size: 12, arrayBuffer: async () => { controller.abort(reason); return source.buffer; } }, error: null });
    await expect(prepareWithSignal(state, controller.signal)).rejects.toBe(reason);
    expect(inspectResumeDocxForPdf).not.toHaveBeenCalled();
    expect(patchResumeTemplateDocx).not.toHaveBeenCalled();
  });

  it("does not patch after an interrupted preflight", async () => {
    const state = fixture(); const controller = new AbortController(); const reason = new Error("source deadline");
    inspectResumeDocxForPdf.mockImplementation(async () => { controller.abort(reason); return ["text"]; });
    await expect(prepareWithSignal(state, controller.signal)).rejects.toBe(reason);
    expect(patchResumeTemplateDocx).not.toHaveBeenCalled();
  });

  it.each([false, true])("preserves cancellation rather than returning or misclassifying a late patch (reject=%s)", async (reject) => {
    const state = fixture(); const controller = new AbortController(); const reason = new Error("source deadline");
    patchResumeTemplateDocx.mockImplementation(async () => { controller.abort(reason); if (reject) throw new Error("late patch"); return patched; });
    await expect(prepareWithSignal(state, controller.signal)).rejects.toBe(reason);
  });

  it("has no GET handler and rejects cross-site/simple form conversion", async () => {
    expect(pdfRoute).not.toHaveProperty("GET");
    fixture();
    expect((await pdfRoute.POST(request({}), context)).status).toBe(403);
    expect((await pdfRoute.POST(request({ "X-Resume-Export": "pdf", "Sec-Fetch-Site": "cross-site" }), context)).status).toBe(403);
    expect(getAuthenticatedUserId).not.toHaveBeenCalled();
    expect(renderVerifiedResumePdf).not.toHaveBeenCalled();
  });

  it("requires a current authenticated user", async () => {
    fixture(); getAuthenticatedUserId.mockResolvedValue({ userId: null, supabase: {} });
    const response = await pdfRoute.POST(request(), context);
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(renderVerifiedResumePdf).not.toHaveBeenCalled();
    expect(renderVerifiedResumePdfFromSource).not.toHaveBeenCalled();
  });

  it("checks host admission before downloading, inflating or patching the source", async () => {
    const { download, from } = fixture();
    renderVerifiedResumePdfFromSource.mockRejectedValue(new ResumePdfError("RENDER_BUSY"));
    const response = await pdfRoute.POST(request(), context);
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("15");
    expect(download).not.toHaveBeenCalled();
    expect(inspectResumeDocxForPdf).not.toHaveBeenCalled();
    expect(patchResumeTemplateDocx).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it("denies another user's version before downloading private storage", async () => {
    const { download, supabase } = fixture();
    getAuthenticatedUserId.mockResolvedValue({ userId: "44444444-4444-4444-8444-444444444444", supabase });
    expect((await pdfRoute.POST(request(), context)).status).toBe(404);
    expect(download).not.toHaveBeenCalled();
  });

  it("rejects malformed version identifiers before querying", async () => {
    const { from } = fixture();
    expect((await pdfRoute.POST(request(), { params: Promise.resolve({ id: "../private" }) })).status).toBe(404);
    expect(from).not.toHaveBeenCalled();
  });

  it.each(["other/candidate.docx", `${userId}/../candidate.docx`, `${userId}/file\\candidate.docx`])("rejects unsafe storage ownership/path %s", async (path) => {
    const { resume, download } = fixture(); resume.storage_path = path;
    expect((await pdfRoute.POST(request(), context)).status).toBe(404);
    expect(download).not.toHaveBeenCalled();
  });

  it("rejects incompatible historical versions without rewriting anything", async () => {
    const { version, download } = fixture(); version.content.meta.templatePolicy = "generic";
    expect((await pdfRoute.POST(request(), context)).status).toBe(409);
    expect(download).not.toHaveBeenCalled();
  });

  it("requires the original Word template", async () => {
    const { resume, download } = fixture(); resume.mime_type = "application/pdf";
    expect((await pdfRoute.POST(request(), context)).status).toBe(409);
    expect(download).not.toHaveBeenCalled();
  });

  it("preflights unsafe original archives before patching", async () => {
    fixture(); inspectResumeDocxForPdf.mockRejectedValue(new ResumePdfError("UNSAFE_DOCUMENT"));
    expect((await pdfRoute.POST(request(), context)).status).toBe(422);
    expect(patchResumeTemplateDocx).not.toHaveBeenCalled();
  });

  it("does not retry AI or render when a confirmed replacement cannot be applied", async () => {
    fixture(); patchResumeTemplateDocx.mockRejectedValue(new Error("private document text"));
    const response = await pdfRoute.POST(request(), context);
    expect(response.status).toBe(409);
    expect(await response.text()).not.toContain("private document text");
    expect(renderVerifiedResumePdf).not.toHaveBeenCalled();
  });

  it.each<[ResumePdfErrorCode, number, boolean]>([
    ["RENDER_BUSY", 429, true], ["RENDERER_UNAVAILABLE", 503, true], ["RENDER_TIMEOUT", 503, true], ["RENDER_FAILED", 503, true],
    ["UNSAFE_DOCUMENT", 422, false], ["PAGE_COUNT", 422, false], ["PAGE_SIZE", 422, false], ["TEXT_MISMATCH", 422, false],
  ])("returns actionable %s without downloading unchecked output", async (code, status, retryable) => {
    fixture(); renderVerifiedResumePdf.mockRejectedValue(new ResumePdfError(code));
    const response = await pdfRoute.POST(request(), context);
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ code, retryable });
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.has("retry-after")).toBe(retryable);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("handles temporary storage failures without reading or modifying content", async () => {
    const { download } = fixture(); download.mockResolvedValue({ data: null, error: { message: "temporary" } });
    expect((await pdfRoute.POST(request(), context)).status).toBe(503);
    expect(patchResumeTemplateDocx).not.toHaveBeenCalled();
  });

  it.each([
    [{ pageCount: 2, paper: "A4", textLayerVerified: true }, "PAGE_COUNT"],
    [{ pageCount: 1, paper: "Letter", textLayerVerified: true }, "PAGE_SIZE"],
    [{ pageCount: 1, paper: "A4", textLayerVerified: false }, "TEXT_MISMATCH"],
  ])("does not advertise a passed check if renderer verification disagrees", async (verification, code) => {
    fixture(); renderVerifiedResumePdf.mockResolvedValue({ pdfBytes: pdf, verification });
    const response = await pdfRoute.POST(request(), context);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ code });
    expect(response.headers.has("x-resume-text-verified")).toBe(false);
  });

  it("limits source size before reading the Blob", async () => {
    const { download } = fixture(); const arrayBuffer = vi.fn();
    download.mockResolvedValue({ data: { size: 10 * 1024 * 1024 + 1, arrayBuffer }, error: null });
    expect((await pdfRoute.POST(request(), context)).status).toBe(413);
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it("sanitizes Unicode filenames and encodes disposition punctuation", () => {
    const filename = resumeExportFilename("公司\r\n", "O'Brien()", `${"😀".repeat(130)}.docx`);
    const disposition = resumeDownloadDisposition(filename, "pdf");
    expect(disposition).not.toContain("\r"); expect(disposition).not.toContain("\n");
    expect(disposition).toContain("%27"); expect(disposition).toContain("%28");
    expect(() => encodeURIComponent(filename)).not.toThrow();
  });
});
