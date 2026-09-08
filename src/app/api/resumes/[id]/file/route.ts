import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserId } from "@/lib/supabase/server";
import { DOCX_CONTENT_TYPE, PRIVATE_DOWNLOAD_HEADERS, resumeDownloadDisposition } from "@/lib/resumes/version-export";

export const runtime = "nodejs";

/** Original bytes only; never a public storage URL or a generated version. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const fail = (error: string, status: number) => NextResponse.json({ error }, { status, headers: PRIVATE_DOWNLOAD_HEADERS });
  try {
    const { supabase, userId } = await getAuthenticatedUserId();
    if (!userId) return fail("请先登录", 401);
    const { id } = await context.params;
    if (!z.string().uuid().safeParse(id).success) return fail("简历不存在或无权访问", 404);
    const { data: resume, error } = await supabase.from("resumes")
      .select("name,mime_type,storage_path").eq("id", id).eq("user_id", userId).single();
    if (error || !resume) return fail("简历不存在或无权访问", 404);
    const segments = resume.storage_path.split("/");
    if (segments.length !== 2 || segments[0] !== userId || !segments[1]
      || [".", ".."].includes(segments[1]) || /[\\\u0000-\u001f]/.test(resume.storage_path)) return fail("简历不存在或无权访问", 404);
    const extension = resume.mime_type === "application/pdf" ? "pdf" : resume.mime_type === DOCX_CONTENT_TYPE ? "docx" : null;
    if (!extension) return fail("不支持的简历格式", 409);
    const { data: file, error: downloadError } = await supabase.storage.from("resumes")
      .download(resume.storage_path, {}, { signal: AbortSignal.timeout(15_000), cache: "no-store" });
    if (downloadError || !file) return fail("原文件下载失败，请重试", 503);
    if (!file.size || file.size > 10 * 1024 * 1024) return fail("原文件为空或超过 10MB", 413);
    const filename = Array.from(resume.name.replace(/\.(pdf|docx)$/i, "")
      .replace(/[\\/:*?"<>|\u0000-\u001f\u007f\uD800-\uDFFF]/gu, "_")).slice(0, 120).join("") || "原始简历";
    return new Response(new Uint8Array(await file.arrayBuffer()), { headers: {
      ...PRIVATE_DOWNLOAD_HEADERS,
      "Content-Type": resume.mime_type,
      "Content-Disposition": resumeDownloadDisposition(filename, extension),
      "Content-Security-Policy": "sandbox",
    } });
  } catch { return fail("原文件下载失败，请重试", 503); }
}
