import { NextResponse } from "next/server";
import { validateNewPassword } from "@/lib/auth/password";
import { hasRecentOtpAuthentication } from "@/lib/auth/recent-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data, error: claimsError } = await supabase.auth.getClaims();

  if (claimsError || typeof data?.claims?.sub !== "string") {
    return NextResponse.json({ error: "登录状态已失效，请重新登录。" }, { status: 401 });
  }
  if (!hasRecentOtpAuthentication(data.claims)) {
    return NextResponse.json({ error: "为保护账号安全，请退出后重新使用邮箱验证码登录，再设置首个密码。" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求内容无效。" }, { status: 400 });
  }

  const password = typeof body === "object" && body !== null && "password" in body ? String(body.password) : "";
  const confirmation = typeof body === "object" && body !== null && "confirmation" in body ? String(body.confirmation) : "";
  const validationError = validateNewPassword(password, confirmation);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return NextResponse.json({ error: error.message.includes("weak") ? "密码强度不足，请换一个更复杂的密码。" : "密码设置失败，请稍后重试。" }, { status: 400 });
  }

  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
