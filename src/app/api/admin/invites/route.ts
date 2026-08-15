import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminContext } from "@/lib/admin/access";
import { activationExpiry, createActivationToken, hashActivationToken } from "@/lib/auth/invite-activation";

export const runtime = "nodejs";
const schema = z.object({ email: z.string().trim().toLowerCase().email() });

function appUrl() {
  return (process.env.APP_URL || "https://zhitu-tracker.vercel.app").replace(/\/+$/, "");
}

export async function POST(request: Request) {
  const context = await getAdminContext();
  if (context.status !== 200) return NextResponse.json({ error: context.error }, { status: context.status });
  try {
    const { email } = schema.parse(await request.json());
    const token = createActivationToken();
    const expiresAt = activationExpiry();
    const activationUrl = `${appUrl()}/activate?token=${encodeURIComponent(token)}`;

    const { error } = await context.admin.from("invites").upsert({
      email,
      token_hash: hashActivationToken(token),
      expires_at: expiresAt,
      used_at: null,
      created_by: context.userId,
    }, { onConflict: "email" });
    if (error) throw new Error("邀请记录保存失败");
    return NextResponse.json({ invited: true, activationUrl, email, expiresAt });
  } catch (error) {
    return NextResponse.json({ error: error instanceof z.ZodError ? "请输入有效邮箱" : error instanceof Error ? error.message : "邀请失败" }, { status: 400 });
  }
}
