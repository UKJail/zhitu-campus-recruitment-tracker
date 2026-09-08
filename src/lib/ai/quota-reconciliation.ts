import "server-only";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { createSupabaseServerClient } from "@/lib/supabase/server";

const reconciliationSchema = z.object({
  completed: z.number().int().min(0),
  released: z.number().int().min(0),
  examined: z.number().int().min(0),
  skippedLocked: z.number().int().min(0),
});

export type AIQuotaReconciliation = z.infer<typeof reconciliationSchema>;

/** Bind before any provider call. A failed/uncertain bind must never start AI. */
export async function bindAIUsageRun(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  taskId: string,
  runId: string,
) {
  z.string().uuid().parse(taskId);
  z.string().uuid().parse(runId);
  const { data: identity, error: identityError } = await supabase.auth.getUser();
  if (identityError || !identity.user) throw new Error("请先登录");
  const { data, error } = await createSupabaseAdminClient().rpc("bind_ai_usage_run_server", {
    p_user_id: identity.user.id, p_task_id: taskId, p_run_id: runId,
  });
  if (error || data !== true) throw new Error("无法绑定 AI 任务，尚未开始生成");
}

/** Service-only maintenance entry point. No result bodies, users or tokens returned. */
export async function reconcileAIUsageBatch(limit = 50): Promise<AIQuotaReconciliation> {
  z.number().int().min(1).max(100).parse(limit);
  const { data, error } = await createSupabaseAdminClient().rpc("reconcile_ai_usage_server", {
    p_limit: limit,
  });
  if (error) throw new Error("AI 次数对账暂时失败");
  return reconciliationSchema.parse(data);
}

/** Refresh only a provider-verified account; never accept a body-supplied user ID. */
export async function reconcileAIUsageForUser(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
): Promise<AIQuotaReconciliation> {
  const { data: identity, error: identityError } = await supabase.auth.getUser();
  if (identityError || !identity.user) throw new Error("请先登录");
  const { data, error } = await createSupabaseAdminClient().rpc("reconcile_ai_usage_server", {
    p_user_id: identity.user.id, p_limit: 100,
  });
  if (error) throw new Error("AI 次数对账暂时失败");
  return reconciliationSchema.parse(data);
}
