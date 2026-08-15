export type ForwardingConfirmationProvider = "gmail" | "qq";

const confirmationHosts: Record<ForwardingConfirmationProvider, Set<string>> = {
  gmail: new Set(["mail.google.com", "mail-settings.google.com", "accounts.google.com"]),
  qq: new Set(["mail.qq.com", "wx.mail.qq.com", "exmail.qq.com", "service.exmail.qq.com"]),
};

type EmailIdentity = {
  sender?: string | null;
  subject?: string | null;
};

export const recruitmentFilterKeywords = [
  "面试",
  "笔试",
  "测评",
  "offer",
  "录用",
  "招聘",
  "校招",
  "校园招聘",
  "interview",
  "assessment",
  "application",
];

export function gmailRecruitmentFilterQuery() {
  return `{${recruitmentFilterKeywords.join(" ")}}`;
}

export function isGmailForwardingConfirmation(email: EmailIdentity) {
  const sender = email.sender?.toLowerCase() || "";
  const subject = email.subject?.toLowerCase() || "";
  const isGoogleForwardingSender = /(?:^|<)(?:forwarding-|mail-)?noreply@google\.com>?$/.test(sender.trim())
    || sender.includes("forwarding-noreply@google.com")
    || sender.includes("mail-noreply@google.com");
  const hasForwardingSubject = subject.includes("gmail forwarding confirmation")
    || (subject.includes("gmail") && /(转发|轉寄)/.test(subject) && /(确认|確認|验证|驗證)/.test(subject));
  return isGoogleForwardingSender && hasForwardingSubject;
}

export function isQqForwardingConfirmation(email: EmailIdentity) {
  const sender = email.sender?.toLowerCase().trim() || "";
  const subject = email.subject?.toLowerCase() || "";
  const isQqSender = /@qq\.com(?:>|$)/.test(sender);
  const hasForwardingSubject = subject.includes("qq邮箱自动转发验证邮件")
    || (subject.includes("qq") && /(自动转发|auto.?forward)/i.test(subject) && /(验证|驗證|verif)/i.test(subject));
  return isQqSender && hasForwardingSubject;
}

export function forwardingConfirmationProvider(email: EmailIdentity): ForwardingConfirmationProvider | null {
  if (isGmailForwardingConfirmation(email)) return "gmail";
  if (isQqForwardingConfirmation(email)) return "qq";
  return null;
}

function decodeHtmlUrl(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&#38;/g, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

function normalizedConfirmationUrl(value: string, provider?: ForwardingConfirmationProvider) {
  try {
    const url = new URL(value);
    const providers = provider ? [provider] : (Object.keys(confirmationHosts) as ForwardingConfirmationProvider[]);
    if (!providers.some((key) => confirmationHosts[key].has(url.hostname.toLowerCase()))) return null;
    if (provider === "qq" && !url.pathname.startsWith("/cgi-bin/")) return null;
    if (url.protocol === "http:" && provider === "qq") url.protocol = "https:";
    if (url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function allowedConfirmationLinks(
  bodyText: string | null | undefined,
  html?: string | null,
  provider?: ForwardingConfirmationProvider,
) {
  const textMatches = bodyText?.match(/https:\/\/[^\s<>"'，。；]+/gi) || [];
  const hrefMatches = [...(html || "").matchAll(/<a\b[^>]*\bhref\s*=\s*(["'])(.*?)\1/gi)].map((match) => match[2]);
  const matches = [...textMatches, ...hrefMatches];
  const normalized = matches
    .map((value) => decodeHtmlUrl(value).replace(/[),，。；;]+$/, ""))
    .map((value) => normalizedConfirmationUrl(value, provider))
    .filter((value): value is string => Boolean(value));
  return [...new Set(normalized)].slice(0, 5);
}

export function gmailForwardingConfirmationCode(bodyText: string | null | undefined) {
  if (!bodyText) return null;
  const labelled = bodyText.match(/(?:confirmation code|verification code|确认码|验证码|確認碼|驗證碼)\s*(?:is|[:：])?\s*#?(\d{8})/i);
  if (labelled) return labelled[1];
  const subjectStyle = bodyText.match(/(?:^|\s)#?(\d{8})(?=\s|$)/m);
  return subjectStyle?.[1] || null;
}

export function hasRecentInboundEmail(emails: Array<{ received_at: string }>, now = new Date(), minutes = 10) {
  return emails.some((email) => {
    const receivedAt = new Date(email.received_at).getTime();
    return Number.isFinite(receivedAt) && now.getTime() - receivedAt >= 0 && now.getTime() - receivedAt <= minutes * 60_000;
  });
}
