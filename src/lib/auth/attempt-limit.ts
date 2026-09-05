import { createHash } from "node:crypto";
import { consumeRegistrationAttempt, registrationClientKey } from "./registration-rate-limit";

// All entry points that send an email share one budget. An address is never stored in clear text.
export function consumeAuthAttempt(request: Request, email: string, operation: "send" | "verify" | "password") {
  const emailKey = createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
  const limits = [
    consumeRegistrationAttempt(`auth:${operation}:ip:${registrationClientKey(request)}`),
    consumeRegistrationAttempt(`auth:${operation}:email:${emailKey}`),
  ];
  return {
    allowed: limits.every((limit) => limit.allowed),
    retryAfterSeconds: Math.max(...limits.map((limit) => limit.retryAfterSeconds)),
  };
}
