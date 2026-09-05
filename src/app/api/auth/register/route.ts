import { NextResponse } from "next/server";
import { z } from "zod";
import { registrationSchema } from "@/lib/auth/registration";
import { consumeAuthAttempt } from "@/lib/auth/attempt-limit";
import { createSupabaseAuthClient, createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const responseHeaders = { "Cache-Control": "private, no-store" };

export async function POST(request: Request) {
  try {
    const input = registrationSchema.parse(await request.json());
    const rateLimit = consumeAuthAttempt(request, input.email, "send");
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: "尝试次数过多，请稍后再试" }, {
        status: 429,
        headers: { ...responseHeaders, "Retry-After": String(rateLimit.retryAfterSeconds) },
      });
    }
    const supabase = await createSupabaseServerClient();
    const configuredUrl = process.env.APP_URL?.trim();
    const origin = configuredUrl ? new URL(configuredUrl).origin : new URL(request.url).origin;
    const { data, error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        data: { display_name: input.displayName },
        emailRedirectTo: `${origin}/auth/callback?next=/app`,
      },
    });

    // Supabase deliberately returns an obfuscated user with no identities for a
    // confirmed address. Send a login code without disclosing account existence
    // or changing its password/metadata. A genuine new signup is never sent twice.
    const duplicate = error?.code === "user_already_exists" || error?.code === "email_exists"
      || (!error && !data?.session && data?.user?.role === ""
        && Array.isArray(data.user.identities) && data.user.identities.length === 0);
    if (duplicate) {
      const { error: codeError } = await createSupabaseAuthClient().auth.signInWithOtp({
        email: input.email, options: { shouldCreateUser: false },
      });
      if (codeError) {
        const rateLimited = codeError.status === 429;
        return NextResponse.json({ error: rateLimited ? "发送次数过多，请稍后再试" : "验证码发送暂时失败，请稍后重试" }, {
          status: rateLimited ? 429 : 502,
          headers: { ...responseHeaders, ...(rateLimited ? { "Retry-After": "60" } : {}) },
        });
      }
      return NextResponse.json({ registered: true, email: input.email, requiresEmailConfirmation: true }, { status: 201, headers: responseHeaders });
    }

    const hasUsableSession = data?.session && typeof data.session.access_token === "string" && data.session.access_token.length > 0
      && typeof data.session.refresh_token === "string" && data.session.refresh_token.length > 0;
    if (error || !data?.user?.id || (data.session ? !hasUsableSession : !Array.isArray(data.user.identities))) {
      const code = "code" in (error || {}) ? String(error?.code) : "";
      console.warn("Public registration rejected by auth provider", {
        code: code || "registration_failed",
        status: error?.status,
      });
      const rateLimited = error?.status === 429;
      return NextResponse.json({ error: rateLimited ? "发送次数过多，请稍后再试" : "注册暂时失败，请稍后重试" }, {
        status: rateLimited ? 429 : 502,
        headers: { ...responseHeaders, ...(rateLimited ? { "Retry-After": "60" } : {}) },
      });
    }

    return NextResponse.json({
      registered: true,
      email: input.email,
      requiresEmailConfirmation: !data.session,
    }, { status: 201, headers: responseHeaders });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return NextResponse.json({ error: error instanceof z.ZodError ? error.issues[0]?.message || "注册信息格式不正确" : "注册信息格式不正确" }, { status: 400, headers: responseHeaders });
    }
    console.warn("Public registration failed", {
      reason: error instanceof Error ? error.name : "unknown_error",
    });
    return NextResponse.json({ error: "注册服务暂时不可用" }, { status: 500, headers: responseHeaders });
  }
}
