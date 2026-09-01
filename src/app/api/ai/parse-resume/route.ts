import { NextResponse } from "next/server";
import { z } from "zod";
import { structuredResumeSchema } from "@/lib/ai/provider";
import { getAuthenticatedUserId } from "@/lib/supabase/server";

export const runtime = "nodejs";

const requestSchema = z.object({ resumeId: z.string().uuid() });

export async function POST(request: Request) {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  try {
    const input = requestSchema.parse(await request.json());
    const { data: resume, error } = await supabase.from("resumes")
      .select("structured_data")
      .eq("id", input.resumeId)
      .eq("user_id", userId)
      .single();
    if (error || !resume) return NextResponse.json({ error: "简历不存在或无权访问" }, { status: 404 });

    const cached = structuredResumeSchema.safeParse(resume.structured_data);
    if (cached.success) return NextResponse.json({ structured: cached.data, cached: true });
    return NextResponse.json({
      error: "简历解析已合并到 JD 匹配任务，请填写岗位 JD 后开始分析",
      code: "PARSE_MERGED_WITH_ANALYSIS",
    }, { status: 409 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof z.ZodError ? "请求参数无效" : "读取简历解析结果失败" }, { status: 400 });
  }
}
