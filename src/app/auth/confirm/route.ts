import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function publicOrigin(requestUrl: URL) {
  const configuredUrl = process.env.APP_URL?.trim();
  return configuredUrl ? new URL(configuredUrl).origin : requestUrl.origin;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = publicOrigin(url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const isInvite = type === "invite";
  const otpType = type === "email" || isInvite ? type as EmailOtpType : null;

  if (!tokenHash || !otpType) {
    const error = isInvite ? "invalid_invite" : "invalid_link";
    return NextResponse.redirect(new URL(`/?auth_error=${error}`, origin));
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: otpType,
  });

  if (error || !data.user) {
    const reason = isInvite ? "expired_invite" : "expired_link";
    return NextResponse.redirect(new URL(`/?auth_error=${reason}`, origin));
  }

  if (isInvite && data.user.email) {
    const admin = createSupabaseAdminClient();
    await admin
      .from("invites")
      .update({ used_at: new Date().toISOString() })
      .eq("email", data.user.email.toLowerCase());
  }

  return NextResponse.redirect(new URL("/app", origin));
}
