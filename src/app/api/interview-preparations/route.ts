import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAIProvider, interviewPreparationSchema } from "@/lib/ai/provider";
import { completeAIUsage, releaseAIUsage, reserveAIUsage } from "@/lib/ai/quota";
import { extractResumeText, validateResumeFile } from "@/lib/resumes/parse";
import { getAuthenticatedUserId } from "@/lib/supabase/server";

export const runtime = "nodejs";

const textField = z.string().trim().min(1).max(120);
const formSchema = z.object({
  operationId: z.string().uuid(),
  company: textField,
  role: textField,
  jobDescription: z.string().trim().min(20).max(100_000),
  inboundEmailId: z.string().uuid().optional(),
});

export async function GET() {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const [{ data: preparations, error }, { data: invitationRows }, { data: applications }] = await Promise.all([
    supabase.from("interview_preparations")
      .select("id,company,role,job_description,resume_file_name,result,inbound_email_id,created_at,updated_at")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(30),
    supabase.from("inbound_emails")
      .select("id,sender,subject,received_at,extracted_data")
      .eq("user_id", userId).eq("category", "interview").is("deleted_at", null)
      .order("received_at", { ascending: false }).limit(30),
    supabase.from("applications").select("id,jobs(company,title,description)").eq("user_id", userId),
  ]);
  if (error) return NextResponse.json({ error: "面试准备记录加载失败" }, { status: 500 });
  const applicationMap = new Map((applications || []).map((item) => [item.id, item.jobs as { company?: string; title?: string; description?: string } | null]));
  const invitations = (invitationRows || []).map((item) => {
    const extracted = item.extracted_data && typeof item.extracted_data === "object" && !Array.isArray(item.extracted_data) ? item.extracted_data : {};
    const applicationId = typeof extracted.matchedApplicationId === "string" ? extracted.matchedApplicationId : "";
    const job = applicationMap.get(applicationId);
    return {
      id: item.id,
      sender: item.sender,
      subject: item.subject,
      received_at: item.received_at,
      company: typeof extracted.company === "string" ? extracted.company : job?.company || "",
      role: typeof extracted.role === "string" ? extracted.role : job?.title || "",
      jobDescription: job?.description || "",
    };
  });
  return NextResponse.json({ preparations: preparations || [], invitations: invitations || [] });
}

export async function POST(request: Request) {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  let storagePath = "";
  let runId = "";
  let taskId = "";
  let preparationId = "";
  let resultSaved = false;
  let applicationId: string | null = null;
  let stage = "request";
  try {
    console.info("[interview-prep] request started");
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "请上传该岗位实际投递的简历" }, { status: 400 });
    validateResumeFile(file);
    const input = formSchema.parse({
      operationId: form.get("operationId"),
      company: form.get("company"), role: form.get("role"), jobDescription: form.get("jobDescription"),
      inboundEmailId: String(form.get("inboundEmailId") || "") || undefined,
    });

    if (input.inboundEmailId) {
      const { data: invitation } = await supabase.from("inbound_emails").select("id,extracted_data").eq("id", input.inboundEmailId).eq("user_id", userId).eq("category", "interview").maybeSingle();
      if (!invitation) return NextResponse.json({ error: "面试邀请不存在或无权访问" }, { status: 404 });
      const extracted = invitation.extracted_data && typeof invitation.extracted_data === "object" && !Array.isArray(invitation.extracted_data) ? invitation.extracted_data : {};
      applicationId = typeof extracted.matchedApplicationId === "string" ? extracted.matchedApplicationId : null;
    }

    stage = "resume_parse";
    const bytes = new Uint8Array(await file.arrayBuffer());
    const resumeText = await extractResumeText(new File([bytes], file.name, { type: file.type }));
    const fingerprint = createHash("sha256").update(JSON.stringify({
      version: "interview-prep-v2",
      resumeText,
      company: input.company,
      role: input.role,
      jobDescription: input.jobDescription,
    })).digest("hex");
    const reservation = await reserveAIUsage(supabase, {
      kind: "interview_prep",
      operationKey: input.operationId,
      inputFingerprint: fingerprint,
      forceNew: true,
    });
    if (!reservation.allowed) return NextResponse.json({ error: "今日 AI 使用次数已用完", quota: reservation.quota }, { status: 429 });
    if (reservation.cached) {
      const { data: cachedRun, error: cachedError } = reservation.resultRunId
        ? await supabase.from("ai_runs").select("output").eq("id", reservation.resultRunId).eq("user_id", userId).eq("kind", "interview_prep").eq("status", "completed").maybeSingle()
        : { data: null, error: null };
      if (cachedError) return NextResponse.json({ error: "面试准备结果暂时无法读取，请稍后重试", code: "AI_RESULT_TEMPORARILY_UNAVAILABLE" }, { status: 503 });
      const preparationId = cachedRun?.output && typeof cachedRun.output === "object" && !Array.isArray(cachedRun.output)
        ? cachedRun.output.preparationId
        : null;
      if (typeof preparationId === "string") {
        const { data: preparation, error: preparationError } = await supabase.from("interview_preparations")
          .select("id,company,role,job_description,resume_file_name,result,inbound_email_id,created_at,updated_at")
          .eq("id", preparationId)
          .eq("user_id", userId)
          .maybeSingle();
        if (preparationError) return NextResponse.json({ error: "面试准备结果暂时无法读取，请稍后重试", code: "AI_RESULT_TEMPORARILY_UNAVAILABLE" }, { status: 503 });
        if (preparation && interviewPreparationSchema.safeParse(preparation.result).success) return NextResponse.json({ preparation, cached: true, quota: reservation.quota }, { status: 200 });
      }
      return NextResponse.json({ error: "旧面试准备结果已不可用，请重新生成；重新生成会使用一次 AI 额度", code: "AI_RESULT_UNAVAILABLE", quota: reservation.quota }, { status: 409 });
    }
    if (!reservation.reserved || !reservation.taskId) {
      return NextResponse.json({ error: "这项面试准备正在处理中，请稍后查看结果", quota: reservation.quota }, { status: 409 });
    }
    taskId = reservation.taskId;

    const extension = file.type === "application/pdf" ? "pdf" : "docx";
    storagePath = `${userId}/interview-prep/${randomUUID()}.${extension}`;
    stage = "resume_upload";
    const { error: uploadError } = await supabase.storage.from("resumes").upload(storagePath, bytes, { contentType: file.type, upsert: false });
    if (uploadError) throw new Error(`文件存储失败: ${uploadError.message}`);

    const { data: run, error: runError } = await supabase.from("ai_runs").insert({
      user_id: userId, kind: "interview_prep", provider: "deepseek", status: "running", input_fingerprint: fingerprint,
    }).select("id").single();
    if (runError || !run) throw new Error("无法创建 AI 面试准备记录");
    runId = run.id;

    stage = "ai_generation";
    const result = await getAIProvider().prepareInterview({ resumeText, jobDescription: input.jobDescription, company: input.company, role: input.role });
    stage = "ai_validation";
    const safeResult = interviewPreparationSchema.parse(result);
    stage = "result_save";
    const { data: preparation, error: insertError } = await supabase.from("interview_preparations").insert({
      user_id: userId,
      inbound_email_id: input.inboundEmailId || null,
      application_id: applicationId,
      company: input.company,
      role: input.role,
      job_description: input.jobDescription,
      resume_file_name: file.name,
      resume_storage_path: storagePath,
      resume_text: resumeText,
      result: safeResult,
    }).select("id,company,role,job_description,resume_file_name,result,inbound_email_id,created_at,updated_at").single();
    if (insertError || !preparation) throw new Error("无法保存面试准备结果");
    preparationId = preparation.id;
    const { error: runUpdateError } = await supabase.from("ai_runs").update({ status: "completed", output: { preparationId: preparation.id } }).eq("id", runId).eq("user_id", userId);
    if (runUpdateError) throw new Error("面试准备已生成，但保存任务状态失败");
    resultSaved = true;
    const quota = await completeAIUsage(supabase, taskId, runId)
      .catch(() => completeAIUsage(supabase, taskId, runId));
    console.info("[interview-prep] request completed", { preparationId: preparation.id, questionCount: safeResult.questions.length });
    return NextResponse.json({ preparation, cached: false, quota }, { status: 201 });
  } catch (error) {
    if (resultSaved) {
      return NextResponse.json({
        error: "面试准备已保存，但额度结算暂时无法确认。请稍后刷新查看，不要立即重复生成",
        code: "AI_QUOTA_SETTLEMENT_PENDING",
        preparationId,
      }, { status: 503 });
    }
    if (runId) await supabase.from("ai_runs").update({ status: "failed", error_code: error instanceof Error ? error.message.slice(0, 160) : "unknown" }).eq("id", runId).eq("user_id", userId);
    if (preparationId) await supabase.from("interview_preparations").delete().eq("id", preparationId).eq("user_id", userId);
    if (storagePath) await supabase.storage.from("resumes").remove([storagePath]);
    if (taskId) await releaseAIUsage(supabase, taskId).catch(() => undefined);
    const issueSummary = error instanceof z.ZodError ? error.issues.map((issue) => `${issue.path.join(".")}:${issue.code}`).slice(0, 8) : [];
    console.error("[interview-prep] request failed", { stage, errorType: error instanceof z.ZodError ? "validation" : "runtime", issues: issueSummary, message: error instanceof Error ? error.message.slice(0, 200) : "unknown" });
    const message = error instanceof z.ZodError
      ? stage === "request" ? "请完整填写公司、岗位和不少于 20 字的 JD" : "AI 已返回内容，但题目格式不完整。请重新生成；如果再次失败，管理员可根据错误阶段处理。"
      : error instanceof Error ? error.message : "生成面试准备失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
