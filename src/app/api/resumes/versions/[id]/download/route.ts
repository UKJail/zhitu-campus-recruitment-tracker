import { NextResponse } from "next/server";
import { z } from "zod";
import { patchResumeTemplateDocx } from "@/lib/resumes/template-docx";
import { getAuthenticatedUserId } from "@/lib/supabase/server";

export const runtime = "nodejs";

const contentSchema = z.object({
  meta: z.object({
    targetCompany: z.string(),
    targetRole: z.string(),
    replacements: z.array(z.object({ original: z.string().min(1), revised: z.string() })).min(1),
    templatePolicy: z.literal("preserve_original_docx"),
  }),
});

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const { id } = await context.params;
  const { data: version, error } = await supabase.from("resume_versions").select("id,resume_id,content,source").eq("id", id).eq("user_id", userId).single();
  if (error || !version || version.source !== "ai_suggestion") return NextResponse.json({ error: "定制简历版本不存在或无权访问" }, { status: 404 });
  const content = contentSchema.safeParse(version.content);
  if (!content.success) return NextResponse.json({ error: "这个版本不是原格式保真版本，请重新生成" }, { status: 409 });

  const { data: resume, error: resumeError } = await supabase.from("resumes").select("name,mime_type,storage_path").eq("id", version.resume_id).eq("user_id", userId).single();
  if (resumeError || !resume) return NextResponse.json({ error: "找不到原始简历模板" }, { status: 404 });
  if (resume.mime_type !== "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    return NextResponse.json({ error: "原文件是 PDF，无法保证字体与格式完全不变；请上传原始 DOCX 后重新生成" }, { status: 409 });
  }
  const { data: template, error: downloadError } = await supabase.storage.from("resumes").download(resume.storage_path);
  if (downloadError || !template) return NextResponse.json({ error: "读取原始 DOCX 模板失败" }, { status: 500 });

  try {
    const output = await patchResumeTemplateDocx(new Uint8Array(await template.arrayBuffer()), content.data.meta.replacements);
    const rawName = `${content.data.meta.targetCompany}_${content.data.meta.targetRole}_${resume.name.replace(/\.docx$/i, "")}`;
    const safeName = rawName.replace(/[\\/:*?"<>|]/g, "_").slice(0, 120);
    const body = new Uint8Array(output.byteLength);
    body.set(output);
    return new Response(body, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(safeName)}.docx`,
        "Cache-Control": "private, no-store",
        "X-Resume-Template-Policy": "preserve-original-docx",
      },
    });
  } catch (patchError) {
    return NextResponse.json({ error: patchError instanceof Error ? patchError.message : "无法在保持原格式的前提下生成简历" }, { status: 409 });
  }
}
