import { NextResponse } from "next/server";
import { z } from "zod";
import { registrationSchema } from "@/lib/auth/registration";
import { consumeRegistrationAttempt, registrationClientKey } from "@/lib/auth/registration-rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
    const input = registrationSchema.parse(await request.json());
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

    if (error || !data.user) {
      const code = "code" in (error || {}) ? String(error?.code) : "";
      console.warn("Public registration rejected by auth provider", {
        code: code || "registration_failed",
        status: error?.status,
      });
      return NextResponse.json({ error: "注册暂时失败，请稍后重试" }, { status: 502, headers: responseHeaders });
    }

    return NextResponse.json({
      registered: true,
      email: input.email,
      requiresEmailConfirmation: !data.session,
    }, { status: 201, headers: responseHeaders });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || "注册信息格式不正确" }, { status: 400, headers: responseHeaders });
    }
    console.warn("Public registration failed", {
      reason: error instanceof Error ? error.name : "unknown_error",
    });
    return NextResponse.json({ error: "注册服务暂时不可用" }, { status: 500, headers: responseHeaders });
  }
}
