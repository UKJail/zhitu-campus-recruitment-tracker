import { NextResponse } from "next/server";
import { z } from "zod";
import { consumeAuthAttempt } from "@/lib/auth/attempt-limit";
import { classifyAuthFailure } from "@/lib/auth/provider-error";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const requestSchema = z.object({
  email: z.string().trim().toLowerCase().email("请输入有效的邮箱地址"),
});
const responseHeaders = { "Cache-Control": "private, no-store" };
const genericMessage = "如果账号尚未确认，新的验证邮件会发送到该邮箱；如果已经注册或确认，请直接登录或找回密码。";
const maskedAccountStateCodes = new Set(["email_confirmed", "user_not_found", "user_already_exists", "email_exists"]);
const sendRateLimitCodes = new Set(["over_email_send_rate_limit", "over_request_rate_limit"]);

export async function POST(request: Request) {
  try {
    const input = requestSchema.parse(await request.json());
    const rateLimit = consumeAuthAttempt(request, input.email, "send");
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: "发送次数过多，请稍后再试" }, {
        status: 429,
        headers: { ...responseHeaders, "Retry-After": String(rateLimit.retryAfterSeconds) },
      });
    }
    const supabase = await createSupabaseServerClient();
    const configuredUrl = process.env.APP_URL?.trim();
    const origin = configuredUrl ? new URL(configuredUrl).origin : new URL(request.url).origin;
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: input.email,
      options: { emailRedirectTo: `${origin}/auth/callback?next=/app` },
    });

    if (error) {
      const code = typeof error.code === "string" ? error.code : "";
      const status = typeof error.status === "number" ? error.status : 0;
      console.warn("Signup confirmation resend was not accepted", {
        code: /^[a-z_]{1,80}$/.test(code) ? code : "resend_not_accepted",
        status: error.status,
      });
      if (status === 429 || sendRateLimitCodes.has(code)) {
        return NextResponse.json({ error: "发送次数过多，请稍后再试" }, { status: 429, headers: { ...responseHeaders, "Retry-After": "60" } });
      }
      if (status >= 500) {
        return NextResponse.json({ error: "验证邮件服务暂时不可用" }, { status: 502, headers: responseHeaders });
      }
      if (classifyAuthFailure(error) === "auth_service_unreachable") {
        return NextResponse.json({ error: "验证邮件服务暂时不可用" }, { status: 503, headers: responseHeaders });
      }
      // Hide only known account-state outcomes, never transport/configuration
      // failures. A status-0 SDK fetch error is returned here, not thrown.
      const maskedAccountState = maskedAccountStateCodes.has(code) && status >= 400 && status < 500;
      if (!maskedAccountState) {
        return NextResponse.json({ error: "验证邮件服务暂时不可用" }, { status: 502, headers: responseHeaders });
      }
    }

    return NextResponse.json({ accepted: true, message: genericMessage }, { status: 200, headers: responseHeaders });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return NextResponse.json({ error: error instanceof z.ZodError ? error.issues[0]?.message || "邮箱格式不正确" : "请求信息格式不正确" }, { status: 400, headers: responseHeaders });
    }
    console.warn("Signup confirmation resend failed", {
      reason: error instanceof Error ? error.name : "unknown_error",
    });
    return NextResponse.json({ error: "验证邮件服务暂时不可用" }, {
      status: classifyAuthFailure(error) === "auth_service_unreachable" ? 503 : 500,
      headers: responseHeaders,
    });
  }
}
