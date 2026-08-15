import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUserId } from "@/lib/supabase/server";

export async function getAdminContext() {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return { status: 401 as const, error: "请先登录" };
  const { data: profile, error } = await supabase.from("profiles").select("is_admin").eq("id", userId).single();
  if (error || !profile?.is_admin) return { status: 403 as const, error: "仅管理员可访问" };
  try {
    return { status: 200 as const, userId, admin: createSupabaseAdminClient() };
  } catch {
    return { status: 503 as const, error: "管理员服务端密钥尚未配置" };
  }
}
