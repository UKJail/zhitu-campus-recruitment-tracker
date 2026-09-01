import { z } from "zod";

const passwordSchema = z.string()
  .min(8, "密码至少需要 8 位")
  .max(72, "密码不能超过 72 位")
  .regex(/[A-Za-z]/, "密码需要包含英文字母")
  .regex(/\d/, "密码需要包含数字");

export const registrationSchema = z.object({
  email: z.string().trim().toLowerCase().email("请输入有效的邮箱地址"),
  displayName: z.string().trim().min(2, "用户 ID 至少需要 2 个字符").max(24, "用户 ID 不能超过 24 个字符"),
  password: passwordSchema,
});
