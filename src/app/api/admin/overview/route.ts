import { NextResponse } from "next/server";
import { getAdminContext } from "@/lib/admin/access";

export const runtime = "nodejs";

export async function GET() {
  const context = await getAdminContext();
  if (context.status !== 200) return NextResponse.json({ error: context.error }, { status: context.status });
  const { admin } = context;
  const [profiles, authUsers, feedback] = await Promise.all([
    admin.from("profiles").select("id,display_name,is_admin,ai_daily_limit,created_at").order("created_at"),
    admin.auth.admin.listUsers({ page: 1, perPage: 200 }),
    admin.from("user_feedback").select("id,user_id,content,created_at").order("created_at", { ascending: false }).limit(100),
  ]);
  const failure = [profiles.error, authUsers.error, feedback.error].find(Boolean);
  if (failure) return NextResponse.json({ error: "管理员数据加载失败" }, { status: 500 });
  const emailById = new Map((authUsers.data?.users || []).map((user) => [user.id, user.email || ""]));
  return NextResponse.json({
    users: (profiles.data || []).map((profile) => ({ ...profile, email: emailById.get(profile.id) || "" })),
    feedback: (feedback.data || []).map((item) => ({ ...item, email: emailById.get(item.user_id) || "" })),
  });
}
