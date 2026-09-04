import { NextResponse } from "next/server";
import { z } from "zod";
import { consumeRegistrationAttempt, registrationClientKey } from "@/lib/auth/registration-rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const requestSchema = z.object({
  email: z.string().trim().toLowerCase().email("请输入有效的邮箱地址"),
});
const responseHeaders = { "Cache-Control": "private, no-store" };
const genericMessage = "如果账号尚未确认，新的验证邮件会发送到该邮箱；如果已经注册或确认，请直接登录或找回密码。";

export async function POST(request: Request) {
  const rateLimit = consumeRegistrationAttempt(`confirmation:${registrationClientKey(request)}`);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "发送次数过多，请稍后再试" }, {
      status: 429,
      headers: { ...responseHeaders, "Retry-After": String(rateLimit.retryAfterSeconds) },
    });
  }

  try {
    const input = requestSchema.parse(await request.json());
    const supabase = await createSupabaseServerClient();
    const configuredUrl = process.env.APP_URL?.trim();
    const origin = configuredUrl ? new URL(configuredUrl).origin : new URL(request.url).origin;
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: input.email,
      options: { emailRedirectTo: `${origin}/auth/callback?next=/app` },
    });

    if (error) {
      console.warn("Signup confirmation resend was not accepted", {
        code: "code" in error ? String(error.code) : "resend_not_accepted",
        status: error.status,
      });
      if (error.status === 429) {
        return NextResponse.json({ error: "发送次数过多，请稍后再试" }, { status: 429, headers: responseHeaders });
      }
      if ((error.status || 0) >= 500) {
        return NextResponse.json({ error: "验证邮件服务暂时不可用" }, { status: 502, headers: responseHeaders });
      }
    }

    return NextResponse.json({ accepted: true, message: genericMessage }, { status: 200, headers: responseHeaders });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || "邮箱格式不正确" }, { status: 400, headers: responseHeaders });
    }
    console.warn("Signup confirmation resend failed", {
      reason: error instanceof Error ? error.name : "unknown_error",
    });
    return NextResponse.json({ error: "验证邮件服务暂时不可用" }, { status: 500, headers: responseHeaders });
  }
}
