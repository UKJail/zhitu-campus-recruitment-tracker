import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAuthClient, createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const signInSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal("request-otp"),
    email: z.string().trim().email(),
  }),
  z.object({
    method: z.literal("password"),
    email: z.string().trim().email(),
    password: z.string().min(1),
  }),
  z.object({
    method: z.literal("otp"),
    email: z.string().trim().email(),
    token: z.string().regex(/^\d{6}$/),
  }),
]);

const responseHeaders = { "Cache-Control": "private, no-store" };

function getAuthErrorMessage(code?: string) {
  switch (code) {
    case "invalid_credentials":
      return "邮箱或密码不正确，或该账号尚未设置密码";
    case "otp_expired":
      return "验证码错误或已过期，请重新获取";
    case "email_not_confirmed":
      return "该邮箱尚未完成确认";
    case "user_banned":
      return "该账号当前已被停用";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "尝试次数过多，请稍后再试";
    default:
      return "登录信息无效或已过期";
  }
}

export async function POST(request: Request) {
  try {
    const input = signInSchema.parse(await request.json());
    const authClient = createSupabaseAuthClient();
    const email = input.email.toLowerCase();

    if (input.method === "request-otp") {
      const result = await authClient.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false },
      });
      if (result.error) {
        const code = typeof result.error.code === "string" ? result.error.code : undefined;
        return NextResponse.json({ error: getAuthErrorMessage(code), code }, {
          status: result.error.status || 400,
          headers: responseHeaders,
        });
      }
      return NextResponse.json({ sent: true }, { headers: responseHeaders });
    }

    const result = input.method === "password"
      ? await authClient.auth.signInWithPassword({ email, password: input.password })
      : await authClient.auth.verifyOtp({ email, token: input.token, type: "email" });

    if (result.error || !result.data.session) {
      const code = result.error && "code" in result.error && typeof result.error.code === "string"
        ? result.error.code
        : undefined;
      console.warn("Supabase sign-in rejected", {
        method: input.method,
        code: code ?? "missing_session",
        status: result.error?.status ?? 401,
      });
      return NextResponse.json({ error: getAuthErrorMessage(code), code: code ?? "missing_session" }, {
        status: 401,
        headers: responseHeaders,
      });
    }

    const supabase = await createSupabaseServerClient();
    const { error: sessionError } = await supabase.auth.setSession({
      access_token: result.data.session.access_token,
      refresh_token: result.data.session.refresh_token,
    });
    if (sessionError) {
      console.warn("Supabase session cookie write failed", {
        code: sessionError.code ?? "session_write_failed",
        status: sessionError.status,
      });
      return NextResponse.json({ error: "登录状态创建失败，请重试" }, {
        status: 500,
        headers: responseHeaders,
      });
    }

    return NextResponse.json({ authenticated: true }, { headers: responseHeaders });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "登录信息格式不正确" }, {
        status: 400,
        headers: responseHeaders,
      });
    }
    return NextResponse.json({ error: "登录服务暂时不可用" }, {
      status: 500,
      headers: responseHeaders,
    });
  }
}
