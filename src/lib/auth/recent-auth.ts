type AuthMethodReference = {
  method?: unknown;
  timestamp?: unknown;
};

export const RECENT_OTP_WINDOW_SECONDS = 15 * 60;

export function hasRecentOtpAuthentication(
  claims: unknown,
  nowSeconds = Math.floor(Date.now() / 1000),
  maxAgeSeconds = RECENT_OTP_WINDOW_SECONDS,
) {
  if (!claims || typeof claims !== "object") return false;
  const amr = (claims as { amr?: unknown }).amr;
  if (!Array.isArray(amr)) return false;

  return amr.some((entry: AuthMethodReference) => {
    if (!entry || typeof entry !== "object") return false;
    if (entry.method !== "otp" || typeof entry.timestamp !== "number") return false;
    return entry.timestamp <= nowSeconds + 60 && entry.timestamp >= nowSeconds - maxAgeSeconds;
  });
}
