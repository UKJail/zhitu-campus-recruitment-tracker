import { NextResponse } from "next/server";
import { z } from "zod";
import { APPLICATION_DELETED_ACTION } from "@/lib/applications/visibility";
import { getAuthenticatedUserId } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function DELETE(_request: Request, context: RouteContext<"/api/applications/[id]">) {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "投递记录编号无效" }, { status: 400 });
  }

  const { data: application, error: applicationError } = await supabase
    .from("applications")
    .select("id,status")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (applicationError) return NextResponse.json({ error: applicationError.message }, { status: 500 });
  if (!application) return NextResponse.json({ error: "找不到这条投递记录" }, { status: 404 });

  const { error: eventError } = await supabase.from("application_events").insert({
    application_id: application.id,
    user_id: userId,
    from_status: application.status,
    to_status: application.status,
    source: "user",
    metadata: { action: APPLICATION_DELETED_ACTION },
  });

  if (eventError) return NextResponse.json({ error: "删除失败：无法写入进度时间线" }, { status: 500 });
  return NextResponse.json({ deleted: true });
}
