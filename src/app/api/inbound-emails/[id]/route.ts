import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(_request: Request, context: RouteContext<"/api/inbound-emails/[id]">) {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const { id } = await context.params;
  const { data, error } = await supabase.from("inbound_emails")
    .select("id,sender,subject,body_text,category,received_at")
    .eq("id", id).eq("user_id", userId).is("deleted_at", null).maybeSingle();
  if (error || !data) return NextResponse.json({ error: "邮件不存在或已删除" }, { status: 404 });
  return NextResponse.json({ email: data }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function DELETE(_: Request, context: RouteContext<"/api/inbound-emails/[id]">) {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const { id } = await context.params;
  const { data, error } = await supabase.from("inbound_emails").update({ deleted_at: new Date().toISOString(), body_text: null, sender: null, subject: null, extracted_data: null }).eq("id", id).eq("user_id", userId).select("id").maybeSingle();
  if (error) return NextResponse.json({ error: "邮件删除失败" }, { status: 500 });
  if (!data) return NextResponse.json({ error: "邮件不存在或无权访问" }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
