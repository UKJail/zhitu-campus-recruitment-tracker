import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const { data, error } = await supabase.from("inbound_emails").select("id,sender,subject,category,received_at,created_at,extracted_data").eq("user_id", userId).is("deleted_at", null).order("received_at", { ascending: false }).limit(50);
  if (error) return NextResponse.json({ error: "邮件记录加载失败" }, { status: 500 });
  return NextResponse.json({ emails: data || [] });
}
