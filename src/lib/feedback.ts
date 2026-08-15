import { z } from "zod";

export const feedbackSchema = z.object({
  content: z.string().trim().min(2, "请至少写 2 个字").max(2000, "反馈最多 2000 个字"),
});

