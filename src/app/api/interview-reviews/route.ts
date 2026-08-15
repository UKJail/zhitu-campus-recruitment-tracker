import { NextResponse } from "next/server";
import { z } from "zod";
import { interviewReviewInputSchema, reviewDateToTimestamp, timestampToReviewDate } from "@/lib/interviews/review";
import { getAuthenticatedUserId } from "@/lib/supabase/server";

export const runtime = "nodejs";

type JoinedReview = {
  id: string;
  interview_id: string | null;
  resume_version_id: string | null;
  questions: string | null;
  answer_summary: string | null;
  highlights: string | null;
  improvements: string | null;
  next_tasks: string | null;
  next_round_prep: string | null;
  score: number | null;
  updated_at: string;
  interviews: {
    id: string;
    application_id: string | null;
    company: string | null;
    role: string | null;
    round: string;
    scheduled_at: string | null;
    interviewer: string | null;
  } | null;
};

function toClientReview(row: JoinedReview) {
  const interview = row.interviews;
  return {
    id: row.id,
    interviewId: row.interview_id,
    applicationId: interview?.application_id ?? null,
    resumeVersionId: row.resume_version_id,
    company: interview?.company ?? "",
    role: interview?.role ?? "",
    round: interview?.round ?? "",
    date: timestampToReviewDate(interview?.scheduled_at ?? null),
    interviewer: interview?.interviewer ?? "",
    score: row.score ?? 3,
    questions: row.questions ?? "",
    answerSummary: row.answer_summary ?? "",
    highlights: row.highlights ?? "",
    improvements: row.improvements ?? "",
    nextStep: row.next_tasks ?? "",
    nextRoundPrep: row.next_round_prep ?? "",
    updatedAt: row.updated_at,
  };
}

export async function GET() {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const { data, error } = await supabase
    .from("interview_reviews")
    .select("id,interview_id,resume_version_id,questions,answer_summary,highlights,improvements,next_tasks,next_round_prep,score,updated_at,interviews!inner(id,application_id,company,role,round,scheduled_at,interviewer)")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ reviews: ((data ?? []) as unknown as JoinedReview[]).map(toClientReview) });
}

export async function POST(request: Request) {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  try {
    const input = interviewReviewInputSchema.parse(await request.json());
    const { data: interview, error: interviewError } = await supabase.from("interviews").insert({
      user_id: userId,
      application_id: input.applicationId,
      company: input.company,
      role: input.role,
      round: input.round,
      scheduled_at: reviewDateToTimestamp(input.date),
      interviewer: input.interviewer || null,
    }).select("id").single();
    if (interviewError || !interview) throw new Error(interviewError?.message || "无法创建面试记录");

    const { data: review, error: reviewError } = await supabase.from("interview_reviews").insert({
      user_id: userId,
      interview_id: interview.id,
      resume_version_id: input.resumeVersionId,
      questions: input.questions || null,
      answer_summary: input.answerSummary || null,
      highlights: input.highlights || null,
      improvements: input.improvements || null,
      next_tasks: input.nextStep || null,
      next_round_prep: input.nextRoundPrep || null,
      score: input.score,
    }).select("id,updated_at").single();
    if (reviewError || !review) {
      await supabase.from("interviews").delete().eq("id", interview.id).eq("user_id", userId);
      throw new Error(reviewError?.message || "无法保存面试复盘");
    }

    return NextResponse.json({ review: { ...input, id: review.id, interviewId: interview.id, updatedAt: review.updated_at } }, { status: 201 });
  } catch (error) {
    const message = error instanceof z.ZodError ? "面试复盘字段不完整" : error instanceof Error ? error.message : "保存失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
