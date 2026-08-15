import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAIProvider, interviewPreparationSchema } from "@/lib/ai/provider";
import { extractResumeText, validateResumeFile } from "@/lib/resumes/parse";
import { getAuthenticatedUserId } from "@/lib/supabase/server";

export const runtime = "nodejs";

const textField = z.string().trim().min(1).max(120);
const formSchema = z.object({
  company: textField,
  role: textField,
  jobDescription: z.string().trim().min(20).max(100_000),
  inboundEmailId: z.string().uuid().optional(),
});

function startOfTodayInShanghai() {
  const now = new Date();
  const shanghai = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  shanghai.setUTCHours(0, 0, 0, 0);
  return new Date(shanghai.getTime() - 8 * 60 * 60 * 1000).toISOString();
}

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
  let applicationId: string | null = null;
  let stage = "request";
  try {
    console.info("[interview-prep] request started");
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "请上传该岗位实际投递的简历" }, { status: 400 });
    validateResumeFile(file);
    const input = formSchema.parse({
      company: form.get("company"), role: form.get("role"), jobDescription: form.get("jobDescription"),
      inboundEmailId: String(form.get("inboundEmailId") || "") || undefined,
    });

    const [{ data: profile }, { count }] = await Promise.all([
      supabase.from("profiles").select("ai_daily_limit").eq("id", userId).single(),
      supabase.from("ai_runs").select("id", { count: "exact", head: true })
        .eq("user_id", userId).eq("status", "completed").gte("created_at", startOfTodayInShanghai()),
    ]);
    if ((count || 0) >= (profile?.ai_daily_limit ?? 20)) return NextResponse.json({ error: "今日 AI 操作次数已用完" }, { status: 429 });

    if (input.inboundEmailId) {
      const { data: invitation } = await supabase.from("inbound_emails").select("id,extracted_data").eq("id", input.inboundEmailId).eq("user_id", userId).eq("category", "interview").maybeSingle();
      if (!invitation) return NextResponse.json({ error: "面试邀请不存在或无权访问" }, { status: 404 });
      const extracted = invitation.extracted_data && typeof invitation.extracted_data === "object" && !Array.isArray(invitation.extracted_data) ? invitation.extracted_data : {};
      applicationId = typeof extracted.matchedApplicationId === "string" ? extracted.matchedApplicationId : null;
    }

    stage = "resume_parse";
    const bytes = new Uint8Array(await file.arrayBuffer());
    const resumeText = await extractResumeText(new File([bytes], file.name, { type: file.type }));
    const extension = file.type === "application/pdf" ? "pdf" : "docx";
    storagePath = `${userId}/interview-prep/${randomUUID()}.${extension}`;
    stage = "resume_upload";
    const { error: uploadError } = await supabase.storage.from("resumes").upload(storagePath, bytes, { contentType: file.type, upsert: false });
    if (uploadError) throw new Error(`文件存储失败: ${uploadError.message}`);

    const fingerprint = createHash("sha256").update(`${resumeText}\n${input.company}\n${input.role}\n${input.jobDescription}`).digest("hex");
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
    await supabase.from("ai_runs").update({ status: "completed", output: { preparationId: preparation.id } }).eq("id", runId).eq("user_id", userId);
    console.info("[interview-prep] request completed", { preparationId: preparation.id, questionCount: safeResult.questions.length });
    return NextResponse.json({ preparation }, { status: 201 });
  } catch (error) {
    if (runId) await supabase.from("ai_runs").update({ status: "failed", error_code: error instanceof Error ? error.message.slice(0, 160) : "unknown" }).eq("id", runId).eq("user_id", userId);
    if (storagePath) await supabase.storage.from("resumes").remove([storagePath]);
    const issueSummary = error instanceof z.ZodError ? error.issues.map((issue) => `${issue.path.join(".")}:${issue.code}`).slice(0, 8) : [];
    console.error("[interview-prep] request failed", { stage, errorType: error instanceof z.ZodError ? "validation" : "runtime", issues: issueSummary, message: error instanceof Error ? error.message.slice(0, 200) : "unknown" });
    const message = error instanceof z.ZodError
      ? stage === "request" ? "请完整填写公司、岗位和不少于 20 字的 JD" : "AI 已返回内容，但题目格式不完整。请重新生成；如果再次失败，管理员可根据错误阶段处理。"
      : error instanceof Error ? error.message : "生成面试准备失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
