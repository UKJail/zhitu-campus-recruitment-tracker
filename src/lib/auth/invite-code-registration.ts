import { timingSafeEqual } from "node:crypto";
import { z } from "zod";

const passwordSchema = z.string()
  .min(8, "密码至少需要 8 位")
  .max(72, "密码不能超过 72 位")
  .regex(/[A-Za-z]/, "密码需要包含英文字母")
  .regex(/\d/, "密码需要包含数字");

export const inviteCodeRegistrationSchema = z.object({
  email: z.string().trim().toLowerCase().email("请输入有效的邮箱地址"),
  displayName: z.string().trim().min(2, "用户 ID 至少需要 2 个字符").max(24, "用户 ID 不能超过 24 个字符"),
  inviteCode: z.string().trim().min(8, "邀请码格式不正确").max(64, "邀请码格式不正确"),
  password: passwordSchema,
});

function normalizeInviteCode(value: string) {
  return value.trim().toUpperCase();
}

export function isInviteCodeConfigured(value: string | undefined) {
  return Boolean(value && normalizeInviteCode(value).length >= 8 && normalizeInviteCode(value).length <= 64);
}

export function inviteCodesMatch(input: string, configured: string) {
  const candidate = Buffer.from(normalizeInviteCode(input), "utf8");
  const expected = Buffer.from(normalizeInviteCode(configured), "utf8");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}
