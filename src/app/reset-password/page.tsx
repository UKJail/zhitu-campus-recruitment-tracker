import { ResetPassword } from "@/components/reset-password";
import { cookies } from "next/headers";
import { RECOVERY_GRANT_COOKIE, verifyRecoveryGrant } from "@/lib/auth/recovery-grant";
import { getAuthenticatedUserId } from "@/lib/supabase/server";

export default async function ResetPasswordPage() {
  const { userId } = await getAuthenticatedUserId();
  const cookieStore = await cookies();
  const grant = cookieStore.get(RECOVERY_GRANT_COOKIE)?.value;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const recoveryAuthorized = Boolean(userId && verifyRecoveryGrant(grant, userId, secret));
  return <ResetPassword recoveryAuthorized={recoveryAuthorized} />;
}
