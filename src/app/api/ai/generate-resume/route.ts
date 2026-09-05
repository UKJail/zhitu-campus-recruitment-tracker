import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { matchesResumeAnalysis } from "@/lib/ai/analysis-fingerprint";
import { analysisSchema } from "@/lib/ai/provider";
import { patchResumeTemplateDocx } from "@/lib/resumes/template-docx";
import { getAuthenticatedUserId } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";

export const runtime = "nodejs";

const requestSchema = z.object({
  resumeId: z.string().uuid(),
  analysisRunId: z.string().uuid(),
  acceptedSuggestionIndexes: z.array(z.number().int().min(0).max(100)).min(1).max(50).refine((values) => new Set(values).size === values.length),
  jobDescription: z.string().min(20).max(100_000),
  targetCompany: z.string().trim().min(1).max(120).regex(/[A-Za-z\u4e00-\u9fff]/, "目标公司不能只填写数字"),
  targetRole: z.string().trim().min(1).max(120).regex(/[A-Za-z\u4e00-\u9fff]/, "岗位名称不能只填写数字"),
  truthConfirmed: z.literal(true),
});

export async function POST(request: Request) {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  try {
    const input = requestSchema.parse(await request.json());
    const [{ data: resume, error: resumeError }, { data: analysisRun, error: analysisError }] = await Promise.all([
      supabase.from("resumes").select("id,parsed_text,parse_status,mime_type,storage_path").eq("id", input.resumeId).eq("user_id", userId).single(),
      supabase.from("ai_runs").select("id,kind,status,input_fingerprint,output").eq("id", input.analysisRunId).eq("user_id", userId).single(),
    ]);

    if (resumeError || !resume) return NextResponse.json({ error: "简历不存在或无权访问" }, { status: 404 });
    if (resume.mime_type === "application/pdf") return NextResponse.json({ error: "保持原排版需要使用原始 DOCX 模板，请上传并选择对应的 Word 简历后重新分析" }, { status: 409 });
    if (analysisError || !analysisRun || analysisRun.kind !== "job_match" || analysisRun.status !== "completed") return NextResponse.json({ error: "找不到已完成的岗位匹配分析" }, { status: 404 });
    if (resume.parse_status !== "ready" || !resume.parsed_text) return NextResponse.json({ error: "简历尚未完成文本解析" }, { status: 409 });

    if (!matchesResumeAnalysis({
      resumeId: resume.id,
      resumeText: resume.parsed_text,
      jobDescription: input.jobDescription,
      targetCompany: input.targetCompany,
      targetRole: input.targetRole,
    }, analysisRun)) {
      return NextResponse.json({ error: "简历、JD 或目标岗位与这次分析不一致，或分析版本过旧，请重新分析" }, { status: 409 });
    }

    const analysis = analysisSchema.parse(analysisRun.output);
    const acceptedSuggestions = input.acceptedSuggestionIndexes.map((index) => analysis.suggestions[index]).filter(Boolean);
    if (acceptedSuggestions.length !== input.acceptedSuggestionIndexes.length) return NextResponse.json({ error: "已接受建议列表无效，请重新分析" }, { status: 400 });
    const replacements = acceptedSuggestions.map((suggestion) => ({ original: suggestion.original, revised: suggestion.revised }));

    const { data: template, error: templateError } = await supabase.storage.from("resumes").download(resume.storage_path);
    if (templateError || !template) return NextResponse.json({ error: "读取原始 DOCX 模板失败，无法进行生成前检查" }, { status: 500 });
    await patchResumeTemplateDocx(new Uint8Array(await template.arrayBuffer()), replacements);

    const qualityChecks = [
      { key: "source_traceability", label: "修改来源可追溯", status: "passed", detail: "所有改写或删除均来自本次分析且已经用户确认" },
      { key: "docx_patch", label: "原模板替换预检", status: "passed", detail: "已在原始 DOCX 副本中成功应用全部修改" },
      { key: "visual_layout", label: "页数与视觉排版", status: "manual_required", detail: "下载后请用 Word 打开，检查页数、分页、留白和项目符号" },
      { key: "ats_text_layer", label: "ATS 文字层", status: "manual_required", detail: "如导出 PDF，请再检查联系方式、日期范围、文字顺序和乱码" },
    ];

    const fingerprint = createHash("sha256").update(JSON.stringify({
      analysisRunId: analysisRun.id,
      accepted: input.acceptedSuggestionIndexes,
      targetCompany: input.targetCompany,
      targetRole: input.targetRole,
    })).digest("hex");
    const { data: run, error: runError } = await supabase.from("ai_runs").insert({
      user_id: userId,
      kind: "resume_rewrite",
      provider: "system",
      status: "running",
      input_fingerprint: fingerprint,
    }).select("id").single();
    if (runError || !run) throw new Error("无法创建定制简历任务");

    try {
      const versionContent = {
        meta: {
          targetCompany: input.targetCompany,
          targetRole: input.targetRole,
          jobDescription: input.jobDescription,
          analysisRunId: analysisRun.id,
          acceptedSuggestionIndexes: input.acceptedSuggestionIndexes,
          replacements,
          templatePolicy: "preserve_original_docx",
          qualityChecks,
          generatedAt: new Date().toISOString(),
        },
      } as Json;
      const { data: version, error: versionError } = await supabase.from("resume_versions").insert({
        resume_id: resume.id,
        user_id: userId,
        content: versionContent,
        source: "ai_suggestion",
      }).select("id,created_at").single();
      if (versionError || !version) throw new Error("无法保存定制简历版本");
      const { error: runUpdateError } = await supabase.from("ai_runs").update({ status: "completed", output: { versionId: version.id, targetCompany: input.targetCompany, targetRole: input.targetRole } }).eq("id", run.id).eq("user_id", userId);
      if (runUpdateError) throw new Error("无法完成定制简历任务");
      return NextResponse.json({
        versionId: version.id,
        createdAt: version.created_at,
        targetCompany: input.targetCompany,
        targetRole: input.targetRole,
        acceptedCount: acceptedSuggestions.length,
        qualityChecks,
        downloadUrl: `/api/resumes/versions/${version.id}/download`,
      });
    } catch (error) {
      await supabase.from("ai_runs").update({ status: "failed", error_code: error instanceof Error ? error.message.slice(0, 160) : "unknown" }).eq("id", run.id).eq("user_id", userId);
      throw error;
    }
  } catch (error) {
    const message = error instanceof z.ZodError ? "请确认目标岗位、已接受建议和真实性授权" : error instanceof Error ? error.message : "生成定制简历失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
