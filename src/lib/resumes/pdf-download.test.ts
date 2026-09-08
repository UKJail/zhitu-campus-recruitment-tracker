import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadResumePdf, prepareResumePdf, downloadPreparedResumePdf } from "./pdf-download";

const fetchMock = vi.fn();
const createObjectURL = vi.fn(() => "blob:local-resume");
const revokeObjectURL = vi.fn();
const headers = {
  "Content-Type": "application/pdf",
  "X-Resume-Pdf-Pages": "1",
  "X-Resume-Pdf-Paper": "A4",
  "X-Resume-Text-Verified": "true",
  "Content-Disposition": "attachment; filename*=UTF-8''%E7%A4%BA%E4%BE%8B.pdf",
};

describe("browser PDF export download", () => {
  beforeEach(() => {
    vi.clearAllMocks(); vi.useFakeTimers();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
  });
  afterEach(() => { vi.runOnlyPendingTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it("prepares preview bytes without a download, then downloads those same bytes without another request", async () => {
    fetchMock.mockResolvedValue(new Response("%PDF-1.7", { headers }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const document = await prepareResumePdf("version-1", new AbortController().signal);
    expect(document?.filename).toBe("示例.pdf");
    expect(click).not.toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();
    downloadPreparedResumePdf(document!);
    expect(click).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uses an explicit private POST and starts a local download only for verified output", async () => {
    fetchMock.mockResolvedValue(new Response("%PDF", { headers }));
    let filename = "";
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { filename = this.download; });
    const signal = new AbortController().signal;
    await downloadResumePdf("version-1", signal);
    expect(fetchMock).toHaveBeenCalledWith("/api/resumes/versions/version-1/pdf", { method: "POST", cache: "no-store", signal, headers: { "X-Resume-Export": "pdf" } });
    expect(click).toHaveBeenCalledTimes(1); expect(filename).toBe("示例.pdf");
    expect(document.querySelector("a[download]")).toBeNull();
    vi.runOnlyPendingTimers(); expect(revokeObjectURL).toHaveBeenCalledWith("blob:local-resume");
  });

  it.each(["Content-Type", "X-Resume-Pdf-Pages", "X-Resume-Pdf-Paper", "X-Resume-Text-Verified"])("does not download without valid %s", async (field) => {
    fetchMock.mockResolvedValue(new Response("unchecked", { headers: { ...headers, [field]: "invalid" } }));
    await expect(downloadResumePdf("version-1", new AbortController().signal)).rejects.toThrow("尚未通过");
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("keeps the server's actionable error and never auto-retries", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: "PDF 不止一页，请检查原模板", code: "PAGE_COUNT" }), { status: 422 }));
    await expect(downloadResumePdf("version-1", new AbortController().signal)).rejects.toThrow("PDF 不止一页");
    expect(fetchMock).toHaveBeenCalledTimes(1); expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("does not download a stale result after the user switches resume", async () => {
    fetchMock.mockResolvedValue(new Response("%PDF", { headers }));
    const controller = new AbortController(); controller.abort();
    await downloadResumePdf("version-1", controller.signal);
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("does not download an empty PDF", async () => {
    fetchMock.mockResolvedValue(new Response("", { headers }));
    await expect(downloadResumePdf("version-1", new AbortController().signal)).rejects.toThrow("文件为空");
    expect(createObjectURL).not.toHaveBeenCalled();
  });
});
