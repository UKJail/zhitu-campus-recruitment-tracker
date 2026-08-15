import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUserId } from "@/lib/supabase/server";

const bodySchema = z.object({ accept: z.boolean() });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "操作参数无效" }, { status: 400 });
  const { id } = await context.params;
  const { data, error } = await supabase.rpc("confirm_email_status_suggestion", {
    p_notification_id: id,
    p_accept: body.data.accept,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ notification: data });
}
