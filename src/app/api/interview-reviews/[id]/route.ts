import { NextResponse } from "next/server";
import { z } from "zod";
import { interviewReviewInputSchema, reviewDateToTimestamp } from "@/lib/interviews/review";
import { getAuthenticatedUserId } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: RouteContext<"/api/interview-reviews/[id]">) {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  try {
    const [{ id }, input] = await Promise.all([context.params, request.json().then((value) => interviewReviewInputSchema.parse(value))]);
    const { data: existing, error: existingError } = await supabase
      .from("interview_reviews")
      .select("id,interview_id")
      .eq("id", id)
      .eq("user_id", userId)
      .single();
    if (existingError || !existing?.interview_id) return NextResponse.json({ error: "复盘不存在或无权编辑" }, { status: 404 });

    const { error: interviewError } = await supabase.from("interviews").update({
      application_id: input.applicationId,
      company: input.company,
      role: input.role,
      round: input.round,
      scheduled_at: reviewDateToTimestamp(input.date),
      interviewer: input.interviewer || null,
      updated_at: new Date().toISOString(),
    }).eq("id", existing.interview_id).eq("user_id", userId);
    if (interviewError) throw new Error(interviewError.message);

    const { data: review, error: reviewError } = await supabase.from("interview_reviews").update({
      resume_version_id: input.resumeVersionId,
      questions: input.questions || null,
      answer_summary: input.answerSummary || null,
      highlights: input.highlights || null,
      improvements: input.improvements || null,
      next_tasks: input.nextStep || null,
      next_round_prep: input.nextRoundPrep || null,
      score: input.score,
      updated_at: new Date().toISOString(),
    }).eq("id", id).eq("user_id", userId).select("id,updated_at").single();
    if (reviewError || !review) throw new Error(reviewError?.message || "无法更新面试复盘");

    return NextResponse.json({ review: { ...input, id: review.id, interviewId: existing.interview_id, updatedAt: review.updated_at } });
  } catch (error) {
    const message = error instanceof z.ZodError ? "面试复盘字段不完整" : error instanceof Error ? error.message : "更新失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
