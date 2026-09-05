import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminContext } from "@/lib/admin/access";
import { deleteUserFiles } from "@/lib/admin/delete-user";

export const runtime = "nodejs";
const schema = z.object({ confirmationEmail: z.string().trim().toLowerCase().email() });
const headers = { "Cache-Control": "private, no-store" };

export async function DELETE(request: Request, context: RouteContext<"/api/admin/users/[id]">) {
  const access = await getAdminContext();
  if (access.status !== 200) return NextResponse.json({ error: access.error }, { status: access.status, headers });
  try {
    const id = z.uuid().parse((await context.params).id);
    const input = schema.parse(await request.json());
    if (id === access.userId) return NextResponse.json({ error: "不能删除当前登录的管理员账号" }, { status: 403, headers });
    const { admin } = access;
    const { data: profile, error: profileError } = await admin.from("profiles").select("is_admin").eq("id", id).maybeSingle();
    if (profileError) throw new Error("无法核对用户权限，已停止删除");
    if (profile?.is_admin) return NextResponse.json({ error: "管理员账号不可在此删除" }, { status: 403, headers });
    const { data, error } = await admin.auth.admin.getUserById(id);
    if (error?.status === 404 || (!error && !data.user)) return NextResponse.json({ error: "该用户已不存在，请刷新列表" }, { status: 404, headers });
    if (error) throw new Error("无法核对用户账号，已停止删除");
    if (!data.user.email || data.user.email.toLowerCase() !== input.confirmationEmail) {
      return NextResponse.json({ error: "输入的邮箱与待删除账号不一致" }, { status: 400, headers });
    }
    await deleteUserFiles(admin, id);
    const { error: deleteError } = await admin.auth.admin.deleteUser(id);
    if (deleteError) throw new Error("文件已清理，但账号删除失败，请重试");
    console.info("Admin deleted user", { actorId: access.userId, targetId: id });
    return NextResponse.json({ deleted: true, id }, { headers });
  } catch (error) {
    const invalid = error instanceof z.ZodError || error instanceof SyntaxError;
    return NextResponse.json({ error: invalid ? "请输入目标账号的完整邮箱确认删除" : error instanceof Error ? error.message : "删除用户失败" }, { status: invalid ? 400 : 500, headers });
  }
}
