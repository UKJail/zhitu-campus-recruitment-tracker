import { z } from "zod";
import type { createSupabaseServerClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export const aiQuotaSchema = z.object({
  limit: z.number().int().min(0),
  used: z.number().int().min(0),
  remaining: z.number().int().min(0),
  resetAt: z.string(),
});

const reservationSchema = z.object({
  allowed: z.boolean(),
  cached: z.boolean(),
  reserved: z.boolean(),
  taskId: z.string().uuid().nullable(),
  taskStatus: z.string(),
  resultRunId: z.string().uuid().nullable(),
  quota: aiQuotaSchema,
});

export type AIQuota = z.infer<typeof aiQuotaSchema>;
export type AIUsageReservation = z.infer<typeof reservationSchema>;

export async function getAIQuota(supabase: SupabaseServerClient) {
  const { data, error } = await supabase.rpc("get_ai_quota");
  if (error) throw new Error("AI 配额读取失败");
  return aiQuotaSchema.parse(data);
}

export async function reserveAIUsage(supabase: SupabaseServerClient, input: {
  kind: "resume_optimization" | "interview_prep";
  operationKey: string;
  inputFingerprint: string;
  forceNew?: boolean;
}) {
  const { data, error } = await supabase.rpc("reserve_ai_usage", {
    p_kind: input.kind,
    p_operation_key: input.operationKey,
    p_input_fingerprint: input.inputFingerprint,
    p_force_new: input.forceNew ?? false,
  });
  if (error) throw new Error("AI 任务额度预留失败");
  return reservationSchema.parse(data);
}

export async function completeAIUsage(supabase: SupabaseServerClient, taskId: string, runId: string) {
  const { data, error } = await supabase.rpc("complete_ai_usage", {
    p_task_id: taskId,
    p_result_run_id: runId,
  });
  if (error) throw new Error("AI 任务已生成，但次数结算失败");
  return aiQuotaSchema.parse(data);
}

export async function releaseAIUsage(supabase: SupabaseServerClient, taskId: string) {
  const { data, error } = await supabase.rpc("release_ai_usage", { p_task_id: taskId });
  if (error) throw new Error("AI 任务失败后的次数返还失败");
  return aiQuotaSchema.parse(data);
}
