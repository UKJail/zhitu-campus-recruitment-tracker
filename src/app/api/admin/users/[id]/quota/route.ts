import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminContext } from "@/lib/admin/access";

export const runtime = "nodejs";
const schema = z.object({ dailyLimit: z.number().int().min(0).max(500) });

export async function PATCH(request: Request, context: RouteContext<"/api/admin/users/[id]/quota">) {
  const adminContext = await getAdminContext();
  if (adminContext.status !== 200) return NextResponse.json({ error: adminContext.error }, { status: adminContext.status });
  try {
    const { id } = await context.params;
    const input = schema.parse(await request.json());
    const { error } = await adminContext.admin.from("profiles").update({ ai_daily_limit: input.dailyLimit }).eq("id", id);
    if (error) throw new Error("配额更新失败");
    return NextResponse.json({ updated: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof z.ZodError ? "配额必须是 0–500 的整数" : error instanceof Error ? error.message : "更新失败" }, { status: 400 });
  }
}
