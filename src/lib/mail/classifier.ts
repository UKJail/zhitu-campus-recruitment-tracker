export type MailCategory =
  | "application"
  | "assessment"
  | "interview"
  | "offer"
  | "rejection"
  | "other";

const patterns: Array<[MailCategory, RegExp]> = [
  ["offer", /offer|录用|聘用/i],
  ["interview", /面试|面谈|腾讯会议|zoom/i],
  ["assessment", /测评|笔试|在线测试/i],
  ["rejection", /遗憾|不匹配|未能通过/i],
  ["application", /投递成功|申请已收到|简历已接收/i],
];

export function classifyMail(subject: string, text: string): MailCategory {
  return patterns.find(([, pattern]) => pattern.test(`${subject}\n${text}`))?.[0] ?? "other";
}

export type RecruitingDetails = {
  meetingUrl: string | null;
  deadlineText: string | null;
  eventTimeText: string | null;
};

export function extractRecruitingDetails(subject: string, text: string): RecruitingDetails {
  const content = `${subject}\n${text}`.replace(/\s+/g, " ");
  const meetingUrl = content.match(/https?:\/\/[^\s<>"']+/i)?.[0]?.replace(/[),，。]+$/, "") ?? null;
  const deadlineText =
    content.match(/(?:截止|请于|最晚)[^，。；;\n]{0,36}(?:完成|提交|前)/i)?.[0] ?? null;
  const eventTimeText =
    content.match(
      /(?:20\d{2}[年\-/]\d{1,2}[月\-/]\d{1,2}日?|\d{1,2}月\d{1,2}日?)(?:[^，。；;\n]{0,18}(?:\d{1,2}[:：]\d{2}))?/i,
    )?.[0] ?? null;
  return { meetingUrl, deadlineText, eventTimeText };
}

export function recruitingEventTime(value: string | null, now = new Date()) {
  if (!value) return null;
  const normalized = value.replace(/[年月]/g, "-").replace(/日/g, "").replace(/：/g, ":").replace(/\//g, "-");
  const match = normalized.match(/(?:(20\d{2})-)?(\d{1,2})-(\d{1,2})(?:[^\d]{0,8}(\d{1,2}):(\d{2}))?/);
  if (!match) return null;
  const shanghaiNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  let year = Number(match[1] || shanghaiNow.getUTCFullYear());
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4] || 9);
  const minute = Number(match[5] || 0);
  let event = new Date(Date.UTC(year, month - 1, day, hour - 8, minute));
  if (!match[1] && event.getTime() < now.getTime() - 7 * 86_400_000) {
    year += 1;
    event = new Date(Date.UTC(year, month - 1, day, hour - 8, minute));
  }
  const local = new Date(event.getTime() + 8 * 60 * 60 * 1000);
  if (local.getUTCFullYear() !== year || local.getUTCMonth() + 1 !== month || local.getUTCDate() !== day || hour > 23 || minute > 59) return null;
  return event.toISOString();
}

export function reminderSchedule(value: string | null, now = new Date()) {
  const eventIso = recruitingEventTime(value, now);
  if (!eventIso) return null;
  const reminder = new Date(eventIso).getTime() - 24 * 60 * 60 * 1000;
  return reminder > now.getTime() + 5 * 60 * 1000 ? new Date(reminder).toISOString() : null;
}

const statusByCategory: Partial<Record<MailCategory, "applied" | "assessment" | "interview" | "offer" | "rejected">> = {
  application: "applied",
  assessment: "assessment",
  interview: "interview",
  offer: "offer",
  rejection: "rejected",
};

export function suggestedStatus(category: MailCategory) {
  return statusByCategory[category] ?? null;
}

export function plainTextFromHtml(value: string) {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?\s*>|<\/p>|<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
