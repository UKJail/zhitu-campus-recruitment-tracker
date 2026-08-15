import { NextResponse } from "next/server";
import { z } from "zod";
import { feedbackSchema } from "@/lib/feedback";
import { getAuthenticatedUserId } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { supabase, userId } = await getAuthenticatedUserId();
    if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const input = feedbackSchema.parse(await request.json());
    const { error } = await supabase.from("user_feedback").insert({ user_id: userId, content: input.content });
    if (error) throw new Error(error.message);
    return NextResponse.json({ accepted: true }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0]?.message || "反馈内容不符合要求" }, { status: 400 });
    console.error("[feedback] submit failed", { errorType: error instanceof Error ? error.name : "unknown" });
    return NextResponse.json({ error: "反馈提交失败，请稍后再试" }, { status: 500 });
  }
}
