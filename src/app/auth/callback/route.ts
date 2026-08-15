import { NextResponse } from "next/server";
import { safeAuthNextPath } from "@/lib/auth/redirect";
import { createRecoveryGrant, RECOVERY_GRANT_COOKIE, RECOVERY_GRANT_MAX_AGE_SECONDS } from "@/lib/auth/recovery-grant";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeAuthNextPath(url.searchParams.get("next"));
  const errorPath = next === "/reset-password" ? "/reset-password?auth_error=invalid_link" : "/?auth_error=invalid_link";
  if (!code) return NextResponse.redirect(new URL(errorPath, url.origin));

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL(errorPath, url.origin));
  const response = NextResponse.redirect(new URL(next, url.origin));

  if (next === "/reset-password" && data.user) {
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!secret) return NextResponse.redirect(new URL(errorPath, url.origin));
    response.cookies.set(RECOVERY_GRANT_COOKIE, createRecoveryGrant(data.user.id, secret), {
      httpOnly: true,
      secure: url.protocol === "https:",
      sameSite: "lax",
      maxAge: RECOVERY_GRANT_MAX_AGE_SECONDS,
      path: "/",
    });
  }

  return response;
}
