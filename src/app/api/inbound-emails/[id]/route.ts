import { NextResponse } from "next/server";
import { Resend } from "resend";
import { allowedConfirmationLinks, forwardingConfirmationProvider } from "@/lib/mail/forwarding";
import { getAuthenticatedUserId } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(_request: Request, context: RouteContext<"/api/inbound-emails/[id]">) {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const { id } = await context.params;
  const { data, error } = await supabase.from("inbound_emails")
    .select("id,provider_id,sender,subject,body_text,category,received_at,extracted_data")
    .eq("id", id).eq("user_id", userId).is("deleted_at", null).maybeSingle();
  if (error || !data) return NextResponse.json({ error: "邮件不存在或已删除" }, { status: 404 });

  const confirmationProvider = forwardingConfirmationProvider(data);
  const extractedData = data.extracted_data && typeof data.extracted_data === "object" && !Array.isArray(data.extracted_data)
    ? data.extracted_data as Record<string, unknown>
    : {};
  const storedLinks = Array.isArray(extractedData.confirmationLinks)
    ? extractedData.confirmationLinks.filter((value): value is string => typeof value === "string")
    : [];
  let confirmationLinks = confirmationProvider
    ? allowedConfirmationLinks(storedLinks.join("\n"), null, confirmationProvider)
    : [];

  if (confirmationProvider && confirmationLinks.length === 0 && process.env.RESEND_API_KEY) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const { data: received } = await resend.emails.receiving.get(data.provider_id);
      if (received) confirmationLinks = allowedConfirmationLinks(received.text, received.html, confirmationProvider);
    } catch {
      confirmationLinks = [];
    }
  }

  const { provider_id: _providerId, extracted_data: _extractedData, ...email } = data;
  return NextResponse.json(
    { email: { ...email, confirmation_links: confirmationLinks } },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function DELETE(_: Request, context: RouteContext<"/api/inbound-emails/[id]">) {
  const { supabase, userId } = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const { id } = await context.params;
  const { data, error } = await supabase.from("inbound_emails").update({ deleted_at: new Date().toISOString(), body_text: null, sender: null, subject: null, extracted_data: null }).eq("id", id).eq("user_id", userId).select("id").maybeSingle();
  if (error) return NextResponse.json({ error: "邮件删除失败" }, { status: 500 });
  if (!data) return NextResponse.json({ error: "邮件不存在或无权访问" }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
