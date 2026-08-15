import { NextResponse } from "next/server";
import { z } from "zod";
import { activationRequestSchema, hashActivationToken } from "@/lib/auth/invite-activation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const admin = createSupabaseAdminClient();
  try {
    const { token, email, displayName, password } = activationRequestSchema.parse(await request.json());
    const claimedAt = new Date().toISOString();
    const { data: invite, error: claimError } = await admin
      .from("invites")
      .update({ used_at: claimedAt })
      .eq("token_hash", hashActivationToken(token))
      .eq("email", email)
      .is("used_at", null)
      .gt("expires_at", claimedAt)
      .select("id,email")
      .maybeSingle();

    if (claimError) throw new Error("激活服务暂时不可用");
    if (!invite) {
      return NextResponse.json({ error: "激活链接无效、已使用，或邮箱与邀请不一致" }, { status: 400 });
    }

    try {
      const { data: listed, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (listError) throw listError;
      const existing = listed.users.find((user) => user.email?.toLowerCase() === email);
      const result = existing
        ? await admin.auth.admin.updateUserById(existing.id, { password, email_confirm: true, user_metadata: { ...existing.user_metadata, display_name: displayName } })
        : await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: displayName } });
      if (result.error) throw result.error;
      const { error: profileError } = await admin.from("profiles").update({ display_name: displayName }).eq("id", result.data.user.id);
      if (profileError) throw profileError;
    } catch {
      await admin.from("invites").update({ used_at: null }).eq("id", invite.id).eq("used_at", claimedAt);
      throw new Error("账号激活失败，请稍后重试或联系管理员重新生成链接");
    }

    return NextResponse.json({ activated: true, email }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof z.ZodError
      ? error.issues[0]?.message || "请检查邮箱和密码格式"
      : error instanceof Error ? error.message : "账号激活失败";
    return NextResponse.json({ error: message }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
