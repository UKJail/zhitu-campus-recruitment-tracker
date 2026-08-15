import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserId } from "@/lib/supabase/server";

export const runtime = "nodejs";
const bodySchema = z.object({ outcome: z.enum(["applied", "failed", "later"]) });

export async function POST(request: Request, context: RouteContext<"/api/applications/[id]/result">) {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  try {
    const [{ id }, input] = await Promise.all([context.params, request.json().then((value) => bodySchema.parse(value))]);
    if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "投递记录编号无效" }, { status: 400 });
    const { data, error } = await supabase.rpc("record_application_result", { p_application_id: id, p_outcome: input.outcome });
    if (error || !data) throw new Error(error?.message || "无法更新投递结果");
    return NextResponse.json({ application: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "无法更新投递结果" }, { status: 400 });
  }
}
