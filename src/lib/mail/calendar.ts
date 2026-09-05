import { recruitingEventTime } from "@/lib/mail/classifier";

export type RecruitingCalendarEvent = {
  id: string;
  type: "assessment" | "interview";
  title: string;
  company: string | null;
  role: string | null;
  scheduledAt: string | null;
  originalTimeText: string | null;
  meetingUrl: string | null;
  receivedAt: string;
};

type InboundCalendarEmail = {
  id: string;
  subject: string | null;
  category: string;
  received_at: string;
  extracted_data: unknown;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function calendarEventFromEmail(email: InboundCalendarEmail, now = new Date()): RecruitingCalendarEvent | null {
  if (email.category !== "assessment" && email.category !== "interview") return null;
  const extracted = record(email.extracted_data);
  const eventTimeText = text(extracted.eventTimeText);
  const deadlineText = text(extracted.deadlineText);
  const originalTimeText = email.category === "assessment"
    ? deadlineText || eventTimeText
    : eventTimeText || deadlineText;
  const receivedAt = new Date(email.received_at);
  // Yearless dates refer to when the message arrived, not when it is reopened.
  const referenceDate = Number.isNaN(receivedAt.getTime()) ? now : receivedAt;

  return {
    id: email.id,
    type: email.category,
    title: text(email.subject) || (email.category === "assessment" ? "测评通知" : "面试通知"),
    company: text(extracted.company),
    role: text(extracted.role),
    scheduledAt: recruitingEventTime(originalTimeText, referenceDate),
    originalTimeText,
    meetingUrl: text(extracted.meetingUrl),
    receivedAt: email.received_at,
  };
}
