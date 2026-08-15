import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";

export const activationRequestSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/i),
  email: z.string().trim().toLowerCase().email(),
  displayName: z.string().trim().min(2, "用户 ID 至少需要 2 个字符").max(24, "用户 ID 不能超过 24 个字符"),
  password: z.string()
    .min(8, "密码至少需要 8 位")
    .max(72, "密码不能超过 72 位")
    .regex(/[A-Za-z]/, "密码需要包含英文字母")
    .regex(/\d/, "密码需要包含数字"),
});

export function createActivationToken() {
  return randomBytes(32).toString("hex");
}

export function hashActivationToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function activationExpiry(now = Date.now()) {
  return new Date(now + 24 * 60 * 60_000).toISOString();
}
