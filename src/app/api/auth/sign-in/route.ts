import { NextResponse } from "next/server";
import { z } from "zod";
import { createHash } from "node:crypto";
import { consumeRegistrationAttempt, registrationClientKey } from "@/lib/auth/registration-rate-limit";
import { createSupabaseAuthClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { classifyAuthFailure, getAuthFailureMessage, getAuthFailureStatus } from "@/lib/auth/provider-error";

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

export async function POST(request: Request) {
  try {
    const input = signInSchema.parse(await request.json());
    const email = input.email.toLowerCase();
    if (input.method !== "password") {
      // Shared by signup confirmation and passwordless login. Never log codes or emails.
      const operation = input.method === "otp" ? "verify" : "send";
      const emailKey = createHash("sha256").update(email).digest("hex");
      const limits = [
        consumeRegistrationAttempt(`otp:${operation}:ip:${registrationClientKey(request)}`),
        consumeRegistrationAttempt(`otp:${operation}:email:${emailKey}`),
      ];
      if (limits.some((limit) => !limit.allowed)) {
        return NextResponse.json({ error: "验证码操作过于频繁，请稍后再试", code: "rate_limited" }, {
          status: 429,
          headers: { ...responseHeaders, "Retry-After": String(Math.max(...limits.map((limit) => limit.retryAfterSeconds))) },
        });
      }
    }
    const authClient = createSupabaseAuthClient();

    if (input.method === "request-otp") {
      const result = await authClient.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false },
      });
      if (result.error) {
        const code = classifyAuthFailure(result.error) ?? "missing_session";
        console.warn("Supabase OTP request rejected", {
          code,
          provider: result.error.name,
          status: result.error.status,
        });
        return NextResponse.json({ error: getAuthFailureMessage(code), code }, {
          status: getAuthFailureStatus(code),
          headers: responseHeaders,
        });
      }
      return NextResponse.json({ sent: true }, { headers: responseHeaders });
    }

    const result = input.method === "password"
      ? await authClient.auth.signInWithPassword({ email, password: input.password })
      : await authClient.auth.verifyOtp({ email, token: input.token, type: "email" });

    if (result.error || !result.data.session) {
      const code = classifyAuthFailure(result.error, Boolean(result.data.session)) ?? "missing_session";
      console.warn("Supabase sign-in rejected", {
        method: input.method,
        code,
        provider: result.error?.name,
        status: result.error?.status,
      });
      return NextResponse.json({ error: getAuthFailureMessage(code), code }, {
        status: getAuthFailureStatus(code),
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
      return NextResponse.json({ error: getAuthFailureMessage("session_write_failed"), code: "session_write_failed" }, {
        status: getAuthFailureStatus("session_write_failed"),
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
