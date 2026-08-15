import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserId } from "@/lib/supabase/server";

export const runtime = "nodejs";
const bodySchema = z.object({ saved: z.boolean() });

export async function POST(request: Request, context: RouteContext<"/api/jobs/[id]/save">) {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  try {
    const [{ id }, input] = await Promise.all([context.params, request.json().then((value) => bodySchema.parse(value))]);
    if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "职位编号无效" }, { status: 400 });
    if (input.saved) {
      const { error } = await supabase.from("saved_jobs").upsert({ user_id: userId, job_id: id }, { onConflict: "user_id,job_id" });
      if (error) throw error;
    } else {
      const { error } = await supabase.from("saved_jobs").delete().eq("user_id", userId).eq("job_id", id);
      if (error) throw error;
    }
    return NextResponse.json({ saved: input.saved });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "收藏操作失败" }, { status: 400 });
  }
}
