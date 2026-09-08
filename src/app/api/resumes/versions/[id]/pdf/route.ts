import { NextResponse } from "next/server";
import { inspectResumeDocxForPdf, renderVerifiedResumePdfFromSource, ResumePdfError } from "@/lib/resumes/render-pdf";
import { loadConfirmedResumeDocx, PRIVATE_DOWNLOAD_HEADERS, resumeDownloadDisposition, ResumeVersionExportError } from "@/lib/resumes/version-export";
import { getAuthenticatedUserId } from "@/lib/supabase/server";

export const runtime = "nodejs";

// POST only: links, crawlers and framework prefetches must never start conversion.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const fetchSite = request.headers.get("sec-fetch-site");
  // This non-simple header plus no CORS support prevents cross-site form requests.
  if (request.headers.get("x-resume-export") !== "pdf" || (fetchSite && !["same-origin", "none"].includes(fetchSite))) {
    return NextResponse.json({ error: "请从职途简历页面点击导出 PDF", code: "EXPORT_REQUEST_REQUIRED" }, { status: 403, headers: PRIVATE_DOWNLOAD_HEADERS });
  }
  try {
    const { supabase, userId } = await getAuthenticatedUserId();
    if (!userId) return NextResponse.json({ error: "请先登录", code: "AUTH_REQUIRED" }, { status: 401, headers: PRIVATE_DOWNLOAD_HEADERS });
    const { id } = await context.params;
    let filename = "定制简历";
    const { pdfBytes, verification } = await renderVerifiedResumePdfFromSource(async (signal) => {
      // Admission happens before downloading, inflating or patching any template.
      const document = await loadConfirmedResumeDocx(supabase, userId, id, inspectResumeDocxForPdf, signal);
      filename = document.filename;
      return document.docxBytes;
    });
    if (verification.pageCount !== 1) throw new ResumePdfError("PAGE_COUNT");
    if (verification.paper !== "A4") throw new ResumePdfError("PAGE_SIZE");
    if (!verification.textLayerVerified) throw new ResumePdfError("TEXT_MISMATCH");
    return new Response(new Uint8Array(pdfBytes), {
      headers: {
        ...PRIVATE_DOWNLOAD_HEADERS,
        "Content-Type": "application/pdf",
        "Content-Disposition": resumeDownloadDisposition(filename, "pdf"),
        "X-Resume-Pdf-Pages": "1",
        "X-Resume-Pdf-Paper": "A4",
        "X-Resume-Text-Verified": "true",
        "X-Resume-Layout-Review": "required",
        "X-Resume-Template-Policy": "preserve-original-docx",
      },
    });
  } catch (error) {
    if (error instanceof ResumeVersionExportError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers: PRIVATE_DOWNLOAD_HEADERS });
    if (error instanceof ResumePdfError) {
      const busy = error.code === "RENDER_BUSY";
      const retryable = busy || ["RENDERER_UNAVAILABLE", "RENDER_FAILED", "RENDER_TIMEOUT"].includes(error.code);
      return NextResponse.json({ error: error.message, code: error.code, retryable }, { status: busy ? 429 : retryable ? 503 : 422, headers: { ...PRIVATE_DOWNLOAD_HEADERS, ...(retryable ? { "Retry-After": busy ? "15" : "30" } : {}) } });
    }
    return NextResponse.json({ error: "PDF 导出暂时失败，已确认文字和 DOCX 版本均已保留，请稍后重试", code: "PDF_EXPORT_FAILED", retryable: true }, { status: 503, headers: { ...PRIVATE_DOWNLOAD_HEADERS, "Retry-After": "30" } });
  }
}
