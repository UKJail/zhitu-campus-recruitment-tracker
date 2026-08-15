import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");

  if (!tokenHash || type !== "invite") {
    return NextResponse.redirect(new URL("/?auth_error=invalid_invite", url.origin));
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: "invite",
  });

  if (error || !data.user) {
    return NextResponse.redirect(new URL("/?auth_error=expired_invite", url.origin));
  }

  if (data.user.email) {
    const admin = createSupabaseAdminClient();
    await admin
      .from("invites")
      .update({ used_at: new Date().toISOString() })
      .eq("email", data.user.email.toLowerCase());
  }

  return NextResponse.redirect(new URL("/app", url.origin));
}
