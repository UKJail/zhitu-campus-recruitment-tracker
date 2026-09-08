import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/lib/supabase/database.types";
import { patchResumeTemplateDocx } from "./template-docx";

export const DOCX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const PRIVATE_DOWNLOAD_HEADERS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

const contentSchema = z.object({
  meta: z.object({
    targetCompany: z.string().max(120),
    targetRole: z.string().max(120),
    replacements: z.array(z.object({ original: z.string().min(1).max(100_000), revised: z.string().max(100_000) })).min(1).max(50),
    templatePolicy: z.literal("preserve_original_docx"),
  }),
});

export class ResumeVersionExportError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
    this.name = "ResumeVersionExportError";
  }
}

/** Both export formats rebuild precisely the same locked replacements; neither calls AI. */
export async function loadConfirmedResumeDocx(
  supabase: SupabaseClient<Database>,
  userId: string,
  versionId: string,
  inspectTemplate?: (bytes: Uint8Array) => Promise<unknown>,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  if (!z.string().uuid().safeParse(versionId).success) throw new ResumeVersionExportError(404, "VERSION_NOT_FOUND", "定制简历版本不存在或无权访问");
  const versionQuery = supabase.from("resume_versions").select("id,resume_id,content,source").eq("id", versionId).eq("user_id", userId);
  if (signal) versionQuery.abortSignal(signal);
  const { data: version, error } = await versionQuery.single();
  signal?.throwIfAborted();
  if (error || !version || version.source !== "ai_suggestion") throw new ResumeVersionExportError(404, "VERSION_NOT_FOUND", "定制简历版本不存在或无权访问");
  const content = contentSchema.safeParse(version.content);
  if (!content.success) throw new ResumeVersionExportError(409, "VERSION_INCOMPATIBLE", "这个版本不是原格式保真版本，请重新生成");

  const resumeQuery = supabase.from("resumes").select("name,mime_type,storage_path").eq("id", version.resume_id).eq("user_id", userId);
  if (signal) resumeQuery.abortSignal(signal);
  const { data: resume, error: resumeError } = await resumeQuery.single();
  signal?.throwIfAborted();
  if (resumeError || !resume) throw new ResumeVersionExportError(404, "TEMPLATE_NOT_FOUND", "找不到原始简历模板");
  if (resume.mime_type !== DOCX_CONTENT_TYPE) throw new ResumeVersionExportError(409, "DOCX_REQUIRED", "保持原排版需要原始 DOCX 模板，请上传对应的 Word 简历后重新生成");
  const segments = resume.storage_path.split("/");
  if (segments[0] !== userId || segments.length !== 2 || !segments[1] || /[\\\u0000-\u001f]/.test(resume.storage_path) || segments.some((part) => part === "." || part === "..")) {
    throw new ResumeVersionExportError(404, "TEMPLATE_NOT_FOUND", "找不到原始简历模板");
  }
  const storage = supabase.storage.from("resumes");
  // storage-js 2.112.3 supports fetch parameters in download's third argument.
  const { data: template, error: downloadError } = signal
    ? await storage.download(resume.storage_path, {}, { signal, cache: "no-store" })
    : await storage.download(resume.storage_path);
  signal?.throwIfAborted();
  if (downloadError || !template) throw new ResumeVersionExportError(503, "TEMPLATE_UNAVAILABLE", "暂时无法读取原始 DOCX 模板，请稍后重试");
  if (template.size > 10 * 1024 * 1024) throw new ResumeVersionExportError(413, "TEMPLATE_TOO_LARGE", "原始简历超过 10MB，无法导出");
  const source = new Uint8Array(await template.arrayBuffer());
  signal?.throwIfAborted();
  // PDF callers preflight the original archive before the existing patcher inflates it.
  if (inspectTemplate) await inspectTemplate(source);
  signal?.throwIfAborted();
  let docxBytes: Uint8Array;
  try {
    docxBytes = await patchResumeTemplateDocx(source, content.data.meta.replacements);
  } catch {
    signal?.throwIfAborted();
    throw new ResumeVersionExportError(409, "TEMPLATE_PATCH_FAILED", "无法在原模板中完整应用已确认文字，请检查原始 DOCX；系统没有改写或删减已确认内容");
  }
  signal?.throwIfAborted();
  return { docxBytes, filename: resumeExportFilename(content.data.meta.targetCompany, content.data.meta.targetRole, resume.name) };
}

export function resumeExportFilename(company: string, role: string, name: string) {
  const sanitized = `${company}_${role}_${name.replace(/\.docx$/i, "")}`
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, "_")
    .replace(/[\uD800-\uDFFF]/gu, "_");
  return Array.from(sanitized).slice(0, 120).join("").trim() || "定制简历";
}

export function resumeDownloadDisposition(filename: string, extension: "docx" | "pdf") {
  const encoded = encodeURIComponent(filename).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="resume.${extension}"; filename*=UTF-8''${encoded}.${extension}`;
}
