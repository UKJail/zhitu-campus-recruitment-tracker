export type AuthFailureCode =
  | "auth_service_unreachable"
  | "email_not_confirmed"
  | "invalid_credentials"
  | "missing_session"
  | "otp_expired"
  | "over_email_send_rate_limit"
  | "over_request_rate_limit"
  | "session_write_failed"
  | "user_banned";

type ProviderErrorLike = {
  code?: unknown;
  message?: unknown;
  name?: unknown;
  status?: unknown;
};

const knownCodes = new Set<AuthFailureCode>([
  "email_not_confirmed",
  "invalid_credentials",
  "otp_expired",
  "over_email_send_rate_limit",
  "over_request_rate_limit",
  "user_banned",
]);

export function classifyAuthFailure(error: unknown, hasSession = false): AuthFailureCode | null {
  if (!error) return hasSession ? null : "missing_session";

  const providerError = error as ProviderErrorLike;
  const code = typeof providerError.code === "string" ? providerError.code : "";
  if (knownCodes.has(code as AuthFailureCode)) return code as AuthFailureCode;

  const name = typeof providerError.name === "string" ? providerError.name.toLowerCase() : "";
  const message = typeof providerError.message === "string" ? providerError.message.toLowerCase() : "";
  const status = typeof providerError.status === "number" ? providerError.status : 0;

  if (status === 429) return "over_request_rate_limit";
  if (status >= 500 ||
    name.includes("retryablefetch")
    || name.includes("fetcherror")
    || message.includes("fetch failed")
    || message.includes("failed to fetch")
    || message.includes("network")
    || message.includes("timed out")
    || message.includes("timeout")
  ) return "auth_service_unreachable";
  if (message.includes("invalid login credentials")) return "invalid_credentials";
  if (message.includes("otp") && (message.includes("expired") || message.includes("invalid"))) return "otp_expired";
  if (message.includes("token") && (message.includes("expired") || message.includes("invalid"))) return "otp_expired";
  if (message.includes("email not confirmed")) return "email_not_confirmed";
  if (message.includes("banned")) return "user_banned";

  return "missing_session";
}

export function getAuthFailureMessage(code: AuthFailureCode) {
  switch (code) {
    case "auth_service_unreachable":
      return "认证服务暂时无法连接，请稍后重试；持续失败请联系管理员";
    case "invalid_credentials":
      return "邮箱或密码不正确，或该账号尚未设置密码";
    case "otp_expired":
      return "验证码错误或已过期，请重新获取最新验证码";
    case "email_not_confirmed":
      return "该邮箱尚未完成确认";
    case "user_banned":
      return "该账号当前已被停用";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "尝试次数过多，请稍后再试";
    case "session_write_failed":
      return "登录状态创建失败，请重试";
    default:
      return "认证服务未返回登录会话，请重新尝试";
  }
}

export function getAuthFailureStatus(code: AuthFailureCode) {
  if (code === "auth_service_unreachable") return 503;
  if (code === "over_request_rate_limit" || code === "over_email_send_rate_limit") return 429;
  if (code === "session_write_failed") return 500;
  return 401;
}
