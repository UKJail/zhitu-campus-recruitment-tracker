import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/supabase/server";
import { extractResumeText, validateResumeFile } from "@/lib/resumes/parse";

export const runtime = "nodejs";

export async function GET() {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const { data, error } = await supabase
    .from("resumes")
    .select("id,name,mime_type,size_bytes,parse_status,structured_data,created_at,updated_at")
    .eq("user_id", userId)
    .eq("active", true)
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ error: "读取简历失败" }, { status: 500 });
  return NextResponse.json({ resumes: data });
}

export async function POST(request: Request) {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "请先登录后上传简历" }, { status: 401 });

  let storagePath = "";
  let createdResumeId = "";
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "缺少简历文件" }, { status: 400 });
    }
    validateResumeFile(file);

    const { count, error: countError } = await supabase
      .from("resumes")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("active", true);
    if (countError) return NextResponse.json({ error: "读取简历数量失败，请稍后重试" }, { status: 500 });
    if ((count || 0) >= 3) {
      return NextResponse.json({ error: "最多保留 3 份活跃简历" }, { status: 409 });
    }

    const extension = file.type === "application/pdf" ? "pdf" : "docx";
    storagePath = `${userId}/${randomUUID()}.${extension}`;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { error: uploadError } = await supabase.storage
      .from("resumes")
      .upload(storagePath, bytes, { contentType: file.type, upsert: false });
    if (uploadError) throw new Error(`文件存储失败: ${uploadError.message}`);

    const parsedText = await extractResumeText(new File([bytes], file.name, { type: file.type }));
    const { data: resume, error: insertError } = await supabase
      .from("resumes")
      .insert({
        user_id: userId,
        name: file.name,
        storage_path: storagePath,
        mime_type: file.type,
        size_bytes: file.size,
        parsed_text: parsedText,
        parse_status: "ready",
      })
      .select("id,name,mime_type,size_bytes,parse_status,structured_data,created_at,updated_at")
      .single();
    if (insertError || !resume) throw new Error("保存简历记录失败");
    createdResumeId = resume.id;

    const { error: versionError } = await supabase.from("resume_versions").insert({
      resume_id: resume.id,
      user_id: userId,
      content: { text: parsedText },
      source: "upload",
    });
    if (versionError) throw new Error(`创建简历版本失败: ${versionError.message}`);

    return NextResponse.json({ resume }, { status: 201 });
  } catch (error) {
    let canRemoveFile = true;
    if (createdResumeId) {
      const { error: rollbackError } = await supabase.from("resumes")
        .delete().eq("id", createdResumeId).eq("user_id", userId);
      // If the metadata rollback fails, retain its file so the remaining
      // record does not become an unusable "ready" resume with a missing blob.
      if (rollbackError) {
        canRemoveFile = false;
        console.error("[resume-upload] metadata rollback failed");
      }
    }
    if (storagePath && canRemoveFile) await supabase.storage.from("resumes").remove([storagePath]);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "简历上传失败" },
      { status: 400 },
    );
  }
}
