import { NextResponse } from "next/server";
import { DOCX_CONTENT_TYPE, loadConfirmedResumeDocx, PRIVATE_DOWNLOAD_HEADERS, resumeDownloadDisposition, ResumeVersionExportError } from "@/lib/resumes/version-export";
import { getAuthenticatedUserId } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { supabase, userId } = await getAuthenticatedUserId();
    if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401, headers: PRIVATE_DOWNLOAD_HEADERS });
    const { id } = await context.params;
    const { docxBytes, filename } = await loadConfirmedResumeDocx(supabase, userId, id);
    return new Response(new Uint8Array(docxBytes), {
      headers: {
        ...PRIVATE_DOWNLOAD_HEADERS,
        "Content-Type": DOCX_CONTENT_TYPE,
        "Content-Disposition": resumeDownloadDisposition(filename, "docx"),
        "X-Resume-Template-Policy": "preserve-original-docx",
      },
    });
  } catch (error) {
    if (error instanceof ResumeVersionExportError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers: PRIVATE_DOWNLOAD_HEADERS });
    return NextResponse.json({ error: "导出暂时失败，请稍后重试" }, { status: 503, headers: PRIVATE_DOWNLOAD_HEADERS });
  }
}
