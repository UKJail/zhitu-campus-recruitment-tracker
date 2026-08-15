import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserId } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(_request: Request, context: RouteContext<"/api/jobs/[id]/prepare">) {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "职位编号无效" }, { status: 400 });
  const { data, error } = await supabase.rpc("prepare_job_application", { p_job_id: id });
  if (error || !data) return NextResponse.json({ error: error?.message || "无法创建准备投递记录" }, { status: 400 });
  return NextResponse.json({ application: data });
}
