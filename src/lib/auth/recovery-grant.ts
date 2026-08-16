import { createHmac, timingSafeEqual } from "node:crypto";

export const RECOVERY_GRANT_COOKIE = "zhitu_recovery_grant";
export const RECOVERY_GRANT_MAX_AGE_SECONDS = 15 * 60;

export function getRecoveryGrantSecret() {
  return process.env.AUTH_RECOVERY_GRANT_SECRET || "";
}

function signingKey(secret: string) {
  return createHmac("sha256", secret).update("zhitu-password-recovery:v1").digest();
}

function signature(payload: string, secret: string) {
  return createHmac("sha256", signingKey(secret)).update(payload).digest("base64url");
}

export function createRecoveryGrant(userId: string, secret: string, now = Date.now()) {
  const expiresAt = Math.floor(now / 1000) + RECOVERY_GRANT_MAX_AGE_SECONDS;
  const payload = `${userId}.${expiresAt}`;
  return `${payload}.${signature(payload, secret)}`;
}

export function verifyRecoveryGrant(token: string | undefined, userId: string, secret: string, now = Date.now()) {
  if (!token || !secret) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [tokenUserId, expiresAtText, suppliedSignature] = parts;
  if (tokenUserId !== userId || !/^\d+$/.test(expiresAtText)) return false;
  const expiresAt = Number(expiresAtText);
  const nowSeconds = Math.floor(now / 1000);
  if (expiresAt < nowSeconds || expiresAt > nowSeconds + RECOVERY_GRANT_MAX_AGE_SECONDS) return false;

  const payload = `${tokenUserId}.${expiresAtText}`;
  const expectedSignature = signature(payload, secret);
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
