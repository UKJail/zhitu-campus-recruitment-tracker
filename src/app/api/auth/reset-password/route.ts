import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { validateNewPassword } from "@/lib/auth/password";
import { getRecoveryGrantSecret, RECOVERY_GRANT_COOKIE, verifyRecoveryGrant } from "@/lib/auth/recovery-grant";
import { getAuthenticatedUserId } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const { supabase, userId } = await getAuthenticatedUserId();
  const cookieStore = await cookies();
  const grant = cookieStore.get(RECOVERY_GRANT_COOKIE)?.value;
  const secret = getRecoveryGrantSecret();

  if (!userId || !verifyRecoveryGrant(grant, userId, secret)) {
    return NextResponse.json({ error: "重置链接无效或已过期，请重新申请。" }, { status: 401 });
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
  if (error) return NextResponse.json({ error: "新密码保存失败，请重新申请重置邮件。" }, { status: 400 });

  cookieStore.delete(RECOVERY_GRANT_COOKIE);
  return NextResponse.json({ ok: true });
}
