import { NextResponse } from "next/server";
import { getAIQuota } from "@/lib/ai/quota";
import { reconcileAIUsageForUser } from "@/lib/ai/quota-reconciliation";
import { getAuthenticatedUserId } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  const { supabase, userId } = await getAuthenticatedUserId();
  const headers = { "Cache-Control": "private, no-store" };
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401, headers });

  try {
    // Do not label a stale quota as current when reconciliation failed, a live
    // request owns the account lock, or the bounded catch-up is still full.
    for (let batch = 0; batch < 3; batch++) {
      const result = await reconcileAIUsageForUser(supabase);
      if (result.skippedLocked > 0) throw new Error("reconciliation busy");
      if (result.examined < 100) {
        return NextResponse.json({ quota: await getAIQuota(supabase) }, { headers });
      }
    }
    throw new Error("reconciliation backlog");
  } catch {
    return NextResponse.json({
      error: "AI 次数正在核对，暂时无法确认剩余额度，请稍后刷新",
      code: "AI_QUOTA_TEMPORARILY_UNAVAILABLE",
    }, { status: 503, headers });
  }
}
