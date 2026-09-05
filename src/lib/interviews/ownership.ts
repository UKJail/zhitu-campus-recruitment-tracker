import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { InterviewReviewInput } from "./review";

export class InterviewReferenceError extends Error {
  constructor(message: string, public readonly status: 400 | 503) {
    super(message);
    this.name = "InterviewReferenceError";
  }
}

// A foreign key proves existence, not ownership. Validate before either write.
export async function assertInterviewReferenceOwnership(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: Pick<InterviewReviewInput, "applicationId" | "resumeVersionId">,
) {
  for (const [table, id, label] of [
    ["applications", input.applicationId, "投递记录"],
    ["resume_versions", input.resumeVersionId, "简历版本"],
  ] as const) {
    if (!id) continue;
    const { data, error } = await supabase.from(table).select("id").eq("id", id).eq("user_id", userId).maybeSingle();
    if (error) throw new InterviewReferenceError("关联记录暂时无法检查，请稍后再试", 503);
    if (!data) throw new InterviewReferenceError(`关联的${label}不存在或无权访问`, 400);
  }
}
