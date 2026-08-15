import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/supabase/server";

export async function DELETE(_: Request, context: { params: Promise<{ id: string }> }) {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const { id } = await context.params;
  const { data: resume, error } = await supabase.from("resumes").select("id,storage_path").eq("id", id).eq("user_id", userId).single();
  if (error || !resume) return NextResponse.json({ error: "简历不存在或无权访问" }, { status: 404 });
  if (!resume.storage_path.startsWith(`${userId}/`)) return NextResponse.json({ error: "简历文件路径无效" }, { status: 403 });
  const { error: storageError } = await supabase.storage.from("resumes").remove([resume.storage_path]);
  if (storageError) return NextResponse.json({ error: "删除文件失败" }, { status: 500 });
  const { error: deleteError } = await supabase.from("resumes").delete().eq("id", id).eq("user_id", userId);
  if (deleteError) return NextResponse.json({ error: "删除简历记录失败" }, { status: 500 });
  return NextResponse.json({ deleted: true });
}
