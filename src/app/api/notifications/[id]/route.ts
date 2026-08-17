import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/supabase/server";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const { id } = await context.params;
  const { data, error } = await supabase
    .from("notifications")
    .delete()
    .eq("id", id)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "通知不存在或已删除" }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
