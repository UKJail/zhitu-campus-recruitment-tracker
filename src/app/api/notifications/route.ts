import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/supabase/server";

export async function GET() {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const { data, error } = await supabase
    .from("notifications")
    .select("id,kind,title,body,read_at,scheduled_for,created_at,metadata,action_status")
    .eq("user_id", userId)
    .or(`scheduled_for.is.null,scheduled_for.lte.${new Date().toISOString()}`)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ notifications: data || [] });
}
