import { NextResponse } from "next/server";
import { z } from "zod";
import { inviteCodeRegistrationSchema, inviteCodesMatch, isInviteCodeConfigured } from "@/lib/auth/invite-code-registration";
import { consumeRegistrationAttempt, registrationClientKey } from "@/lib/auth/registration-rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const responseHeaders = { "Cache-Control": "private, no-store" };

export async function POST(request: Request) {
  const rateLimit = consumeRegistrationAttempt(registrationClientKey(request));
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "尝试次数过多，请稍后再试" }, {
      status: 429,
      headers: { ...responseHeaders, "Retry-After": String(rateLimit.retryAfterSeconds) },
    });
  }

  try {
    const input = inviteCodeRegistrationSchema.parse(await request.json());
    const configuredCode = process.env.AUTH_BETA_INVITE_CODE;
    if (!isInviteCodeConfigured(configuredCode)) {
      return NextResponse.json({ error: "邀请码注册暂未开放，请联系管理员" }, { status: 503, headers: responseHeaders });
    }
    if (!inviteCodesMatch(input.inviteCode, configuredCode!)) {
      return NextResponse.json({ error: "邀请码无效，请检查后重试" }, { status: 400, headers: responseHeaders });
    }

    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: { display_name: input.displayName },
    });

    if (error || !data.user) {
      const code = "code" in (error || {}) ? String(error?.code) : "";
      if (code === "email_exists" || code === "user_already_exists") {
        return NextResponse.json({ error: "该邮箱已注册，请直接登录或找回密码" }, { status: 409, headers: responseHeaders });
      }
      console.warn("Invite-code registration rejected by auth provider", {
        code: code || "registration_failed",
        status: error?.status,
      });
      return NextResponse.json({ error: "注册暂时失败，请稍后重试" }, { status: 502, headers: responseHeaders });
    }

    return NextResponse.json({ registered: true, email: input.email }, { status: 201, headers: responseHeaders });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || "注册信息格式不正确" }, { status: 400, headers: responseHeaders });
    }
    console.warn("Invite-code registration failed", {
      reason: error instanceof Error ? error.name : "unknown_error",
    });
    return NextResponse.json({ error: "注册服务暂时不可用" }, { status: 500, headers: responseHeaders });
  }
}
