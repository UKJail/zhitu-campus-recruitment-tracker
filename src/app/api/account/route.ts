import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUserId } from "@/lib/supabase/server";

export const runtime = "nodejs";

const requestSchema = z.object({ confirmation: z.literal("注销") });
const profileSchema = z.object({ displayName: z.string().trim().min(2).max(24) });

export async function GET() {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const [{ data: profile, error: profileError }, { data: authData, error: authError }] = await Promise.all([
    supabase.from("profiles").select("display_name,is_admin").eq("id", userId).single(),
    supabase.auth.getUser(),
  ]);
  if (profileError || authError || !authData.user) return NextResponse.json({ error: "账号资料加载失败" }, { status: 500 });
  return NextResponse.json({
    profile: {
      displayName: profile.display_name,
      email: authData.user.email || "",
      isAdmin: profile.is_admin,
    },
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PATCH(request: Request) {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  try {
    const { displayName } = profileSchema.parse(await request.json());
    const { data, error } = await supabase.from("profiles").update({ display_name: displayName }).eq("id", userId).select("display_name").single();
    if (error) throw new Error("用户 ID 保存失败");
    return NextResponse.json({ displayName: data.display_name });
  } catch (error) {
    return NextResponse.json({ error: error instanceof z.ZodError ? "用户 ID 需要为 2—24 个字符" : error instanceof Error ? error.message : "用户 ID 保存失败" }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const { userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  try {
    requestSchema.parse(await request.json());
    const admin = createSupabaseAdminClient();
    const [{ data: resumeFiles, error: resumeFilesError }, { data: preparationFiles, error: preparationFilesError }] = await Promise.all([
      admin.from("resumes").select("storage_path").eq("user_id", userId),
      admin.from("interview_preparations").select("resume_storage_path").eq("user_id", userId),
    ]);
    if (resumeFilesError || preparationFilesError) throw new Error("无法读取账号文件");
    const paths = [...new Set([
      ...(resumeFiles || []).map((item) => item.storage_path),
      ...(preparationFiles || []).map((item) => item.resume_storage_path),
    ].filter(Boolean))];
    if (paths.length > 0) {
      const { error: removeError } = await admin.storage.from("resumes").remove(paths);
      if (removeError) throw new Error("无法删除账号文件");
    }
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) throw new Error("无法注销账号");
    return NextResponse.json({ deleted: true });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "请输入“注销”确认操作" }, { status: 400 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "注销失败" }, { status: 500 });
  }
}
