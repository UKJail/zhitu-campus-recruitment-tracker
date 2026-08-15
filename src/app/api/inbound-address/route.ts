import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/supabase/server";

export async function GET() {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const { data, error } = await supabase.from("profiles").select("inbound_alias").eq("id", userId).single();
  if (error || !data) {
    return NextResponse.json({ error: error?.message || "专属收件地址加载失败" }, { status: 500 });
  }
  const domain = process.env.RESEND_INBOUND_DOMAIN?.trim().toLowerCase() || "";
  return NextResponse.json({
    configured: Boolean(domain),
    address: domain ? `${data.inbound_alias}@${domain}` : null,
    alias: data.inbound_alias,
  });
}
