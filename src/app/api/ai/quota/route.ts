import { NextResponse } from "next/server";
import { getAIQuota } from "@/lib/ai/quota";
import { getAuthenticatedUserId } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  try {
    return NextResponse.json({ quota: await getAIQuota(supabase) }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "AI 配额读取失败" }, { status: 500 });
  }
}
