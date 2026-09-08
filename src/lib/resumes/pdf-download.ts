export type PreparedResumePdf = { blob: Blob; filename: string };

/** Fetch once for both preview and download. Never calls or pays for AI. */
export async function prepareResumePdf(versionId: string, signal: AbortSignal): Promise<PreparedResumePdf | undefined> {
  const response = await fetch(`/api/resumes/versions/${encodeURIComponent(versionId)}/pdf`, {
    method: "POST",
    headers: { "X-Resume-Export": "pdf" },
    cache: "no-store",
    signal,
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(typeof payload.error === "string" ? payload.error : "PDF 导出暂时失败，请稍后重试；已确认文字和 DOCX 版本已保留");
  }
  if (response.headers.get("content-type")?.split(";")[0] !== "application/pdf"
    || response.headers.get("x-resume-pdf-pages") !== "1"
    || response.headers.get("x-resume-pdf-paper") !== "A4"
    || response.headers.get("x-resume-text-verified") !== "true") {
    throw new Error("PDF 尚未通过一页 A4 和文字层检查，未开始下载；请保留 DOCX 并稍后重试");
  }
  const blob = await response.blob();
  if (signal.aborted) return;
  if (!blob.size) throw new Error("PDF 文件为空，未开始下载，请稍后重试");
  const encoded = response.headers.get("content-disposition")?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  let filename = "定制简历.pdf";
  if (encoded) {
    try { filename = decodeURIComponent(encoded).replace(/[\\/\u0000-\u001f\u007f]/g, "_"); } catch { /* Use a safe fallback filename. */ }
  }
  return { blob, filename };
}

export function downloadPreparedResumePdf({ blob, filename }: PreparedResumePdf) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  try { anchor.click(); } finally {
    anchor.remove();
    // Let the browser consume the Blob before releasing its local URL.
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }
}

/** Kept as a convenience for callers which only need a download. */
export async function downloadResumePdf(versionId: string, signal: AbortSignal) {
  const document = await prepareResumePdf(versionId, signal);
  if (document && !signal.aborted) downloadPreparedResumePdf(document);
  return document;
}
