import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserId } from "@/lib/supabase/server";

export const runtime = "nodejs";

const schema = z.object({
  status: z.enum(["saved", "preparing", "applied", "assessment", "interview", "offer", "rejected", "closed"]),
});

export async function PATCH(request: Request, context: RouteContext<"/api/applications/[id]/status">) {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  try {
    const [{ id }, input] = await Promise.all([context.params, request.json().then((value) => schema.parse(value))]);
    const { data, error } = await supabase.rpc("transition_application_status", {
      p_application_id: id,
      p_target: input.status,
    });
    if (error || !data) throw new Error(error?.message || "无法更新求职进度");
    return NextResponse.json({ application: data });
  } catch (error) {
    const message = error instanceof z.ZodError ? "目标状态无效" : error instanceof Error ? error.message : "状态更新失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
