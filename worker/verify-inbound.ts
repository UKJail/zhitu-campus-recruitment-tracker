import { createClient } from "@supabase/supabase-js";

async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const email = process.argv[2]?.trim().toLowerCase();
  const domain = process.argv[3]?.trim() || process.env.RESEND_INBOUND_DOMAIN?.trim();
  if (!url || !serviceKey) throw new Error("验证脚本缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY");
  if (!email) throw new Error("请提供需要验证的登录邮箱");

  const db = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const users = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (users.error) throw new Error(`无法读取用户：${users.error.message}`);
  const user = users.data.users.find((item) => item.email?.toLowerCase() === email);
  if (!user) throw new Error("未找到对应用户");

  const [profile, emails, notifications, applications, latestEmails, latestNotifications, latestEvents] = await Promise.all([
    db.from("profiles").select("inbound_alias").eq("id", user.id).single(),
    db.from("inbound_emails").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("deleted_at", null),
    db.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    db.from("applications")
      .select("id,status,jobs(company,title)")
      .eq("user_id", user.id)
      .not("status", "in", "(closed,rejected)"),
    db.from("inbound_emails")
      .select("id,subject,category,extracted_data,received_at")
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .order("received_at", { ascending: false })
      .limit(3),
    db.from("notifications")
      .select("kind,title,scheduled_for,action_status,metadata,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5),
    db.from("application_events")
      .select("application_id,from_status,to_status,source,metadata,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);
  const errors = [profile.error, emails.error, notifications.error, applications.error, latestEmails.error, latestNotifications.error, latestEvents.error].filter(Boolean);
  if (errors.length) throw new Error(errors.map((error) => error?.message).join(" | "));

  const alias = profile.data?.inbound_alias || null;
  console.log(JSON.stringify({
    userId: user.id,
    alias,
    address: alias && domain ? `${alias}@${domain}` : null,
    inboundEmails: emails.count,
    notifications: notifications.count,
    applications: applications.data,
    latestEmails: latestEmails.data,
    latestNotifications: latestNotifications.data,
    latestEvents: latestEvents.data,
  }, null, 2));
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
