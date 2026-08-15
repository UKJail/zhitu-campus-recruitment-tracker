import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUserId } from "@/lib/supabase/server";
import { dailyApplicationTargetFromMetadata, dailyApplicationTargetSchema } from "@/lib/account/preferences";

export const runtime = "nodejs";

const requestSchema = z.object({ confirmation: z.literal("注销") });
const profileSchema = z.object({
  displayName: z.string().trim().min(2).max(24).optional(),
  dailyApplicationTarget: dailyApplicationTargetSchema.optional(),
}).refine((value) => value.displayName !== undefined || value.dailyApplicationTarget !== undefined);

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
      dailyApplicationTarget: dailyApplicationTargetFromMetadata(authData.user.user_metadata),
    },
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PATCH(request: Request) {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  try {
    const input = profileSchema.parse(await request.json());
    let displayName: string | undefined;
    if (input.displayName !== undefined) {
      const { data, error } = await supabase.from("profiles").update({ display_name: input.displayName }).eq("id", userId).select("display_name").single();
      if (error) throw new Error("用户 ID 保存失败");
      displayName = data.display_name ?? input.displayName;
    }
    if (input.dailyApplicationTarget !== undefined) {
      const { error } = await supabase.auth.updateUser({ data: { daily_application_target: input.dailyApplicationTarget } });
      if (error) throw new Error("投递目标保存失败");
    }
    return NextResponse.json({
      ...(displayName !== undefined ? { displayName } : {}),
      ...(input.dailyApplicationTarget !== undefined ? { dailyApplicationTarget: input.dailyApplicationTarget } : {}),
    });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "用户 ID 需为 2—24 个字符；投递目标需为 1—200 的整数" }, { status: 400 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "账号设置保存失败" }, { status: 500 });
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
