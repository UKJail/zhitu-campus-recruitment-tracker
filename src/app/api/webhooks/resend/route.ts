import { NextResponse } from "next/server";
import { Resend } from "resend";
import { z } from "zod";
import { classifyMail, extractRecruitingDetails, plainTextFromHtml, reminderSchedule, suggestedStatus } from "@/lib/mail/classifier";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const receivedEventSchema = z.object({
  type: z.literal("email.received"),
  created_at: z.string(),
  data: z.object({
    email_id: z.string().min(1),
    created_at: z.string(),
    from: z.string().default(""),
    to: z.array(z.string()).min(1),
    subject: z.string().default(""),
    message_id: z.string().optional(),
  }),
});

function localPart(address: string) {
  const bare = address.match(/<([^>]+)>/)?.[1] ?? address;
  return bare.trim().toLowerCase().split("@")[0]?.split("+")[0] ?? "";
}

function notificationCopy(category: ReturnType<typeof classifyMail>, subject: string) {
  const labels = {
    application: "收到投递确认",
    assessment: "收到测评通知",
    interview: "收到面试通知",
    offer: "收到 Offer 通知",
    rejection: "收到申请结果",
    other: "收到新的招聘邮件",
  };
  return { title: labels[category], body: subject || "请查看邮件识别结果" };
}

async function verifyEvent(request: Request, raw: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  const id = request.headers.get("svix-id");
  const timestamp = request.headers.get("svix-timestamp");
  const signature = request.headers.get("svix-signature");
  if (!apiKey || !webhookSecret) throw new Error("Resend webhook configuration is missing");
  if (!id || !timestamp || !signature) throw new Error("Missing webhook signature headers");
  const resend = new Resend(apiKey);
  const event = await resend.webhooks.verify({ payload: raw, headers: { id, timestamp, signature }, webhookSecret });
  return { resend, event };
}

export async function POST(request: Request) {
  const raw = await request.text();
  let verified: Awaited<ReturnType<typeof verifyEvent>>;
  try {
    verified = await verifyEvent(request, raw);
  } catch {
    return NextResponse.json({ error: "签名无效" }, { status: 401 });
  }

  const parsed = receivedEventSchema.safeParse(verified.event);
  if (!parsed.success) return NextResponse.json({ accepted: true, ignored: true });

  const admin = createSupabaseAdminClient();
  const providerId = parsed.data.data.email_id;
  const { data: duplicate } = await admin.from("inbound_emails").select("id").eq("provider_id", providerId).maybeSingle();
  if (duplicate) return NextResponse.json({ accepted: true, duplicate: true });

  const aliases = [...new Set(parsed.data.data.to.map(localPart).filter(Boolean))];
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id,inbound_alias")
    .in("inbound_alias", aliases)
    .maybeSingle();
  if (profileError || !profile) return NextResponse.json({ accepted: true, unmatchedRecipient: true });

  const { data: received, error: receiveError } = await verified.resend.emails.receiving.get(providerId);
  if (receiveError || !received) return NextResponse.json({ error: "邮件正文暂时无法读取" }, { status: 503 });

  const subject = parsed.data.data.subject;
  const bodyText = received.text || plainTextFromHtml(received.html || "");
  const category = classifyMail(subject, bodyText);
  const details = extractRecruitingDetails(subject, bodyText);
  const targetStatus = suggestedStatus(category);

  const { data: applicationRows } = await admin
    .from("applications")
    .select("id,status,jobs(company,title)")
    .eq("user_id", profile.id)
    .not("status", "in", "(closed,rejected)");
  const haystack = `${subject}\n${bodyText}`.toLowerCase();
  const candidates = (applicationRows || [])
    .map((item) => {
      const job = item.jobs as { company?: string; title?: string } | null;
      const company = job?.company || "";
      const title = job?.title || "";
      const score =
        (company && haystack.includes(company.toLowerCase()) ? 3 : 0) +
        (title && haystack.includes(title.toLowerCase()) ? 3 : 0);
      return { id: item.id, company, title, score };
    })
    .sort((a, b) => b.score - a.score);
  const matched =
    candidates[0]?.score >= 3 && candidates[0]?.score > (candidates[1]?.score ?? 0) ? candidates[0] : null;

  const extractedData = {
    ...details,
    messageId: parsed.data.data.message_id ?? null,
    recipient:
      parsed.data.data.to.find((item) => localPart(item) === profile.inbound_alias) ?? parsed.data.data.to[0],
    matchedApplicationId: matched?.id ?? null,
    company: matched?.company || null,
    role: matched?.title || null,
    suggestedStatus: matched ? targetStatus : null,
    confidence: matched ? Math.min(0.98, 0.72 + matched.score * 0.04) : 0.45,
    requiresStatusConfirmation: Boolean(matched && targetStatus),
  };

  const { data: stored, error: storeError } = await admin
    .from("inbound_emails")
    .insert({
      user_id: profile.id,
      provider_id: providerId,
      sender: parsed.data.data.from,
      subject,
      body_text: bodyText,
      category,
      extracted_data: extractedData,
      received_at: parsed.data.data.created_at || parsed.data.created_at,
    })
    .select("id")
    .single();
  if (storeError) {
    if (storeError.code === "23505") return NextResponse.json({ accepted: true, duplicate: true });
    return NextResponse.json({ error: "邮件记录失败" }, { status: 500 });
  }

  const copy = notificationCopy(category, subject);
  const scheduledReminder = category === "assessment" || category === "interview" ? reminderSchedule(details.eventTimeText) : null;
  const { error: notificationError } = await admin.from("notifications").insert({
    user_id: profile.id,
    kind: `email_${category}`,
    title: copy.title,
    body: copy.body,
    scheduled_for: null,
    metadata: {
      inboundEmailId: stored.id,
      applicationId: matched?.id ?? null,
      suggestedStatus: matched ? targetStatus : null,
      company: matched?.company || null,
      role: matched?.title || null,
      meetingUrl: details.meetingUrl,
      eventTimeText: details.eventTimeText,
      deadlineText: details.deadlineText,
    },
    action_status: matched && targetStatus ? "pending" : null,
  });
  if (notificationError) return NextResponse.json({ error: "通知创建失败" }, { status: 500 });

  if (scheduledReminder) {
    const reminderTitle = category === "interview" ? "面试将在 24 小时后开始" : "测评将在 24 小时后截止";
    const { error: reminderError } = await admin.from("notifications").insert({
      user_id: profile.id,
      kind: `email_${category}_reminder`,
      title: reminderTitle,
      body: [matched?.company, matched?.title, details.eventTimeText].filter(Boolean).join(" · "),
      scheduled_for: scheduledReminder,
      metadata: { inboundEmailId: stored.id, applicationId: matched?.id ?? null, meetingUrl: details.meetingUrl, eventTimeText: details.eventTimeText },
      action_status: null,
    });
    if (reminderError) return NextResponse.json({ error: "提醒创建失败" }, { status: 500 });
  }

  return NextResponse.json({
    accepted: true,
    category,
    reminderScheduled: Boolean(scheduledReminder),
    requiresStatusConfirmation: Boolean(matched && targetStatus),
  });
}
