import { NextResponse } from "next/server";
import { calendarEventFromEmail } from "@/lib/mail/calendar";
import { getAuthenticatedUserId } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const { data, error } = await supabase
    .from("inbound_emails")
    .select("id,subject,category,received_at,extracted_data")
    .eq("user_id", userId)
    .in("category", ["assessment", "interview"])
    .is("deleted_at", null)
    .order("received_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: "求职日历加载失败" }, { status: 500 });
  const now = new Date();
  const events = (data || []).map((email) => calendarEventFromEmail(email, now)).filter(Boolean);
  return NextResponse.json({ events });
}
