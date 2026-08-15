const confirmationHosts = new Set([
  "mail.google.com",
  "mail-settings.google.com",
  "accounts.google.com",
  "outlook.live.com",
  "outlook.office.com",
]);

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

export function allowedConfirmationLinks(bodyText: string | null | undefined) {
  const matches = bodyText?.match(/https:\/\/[^\s<>"'，。；]+/gi) || [];
  return [...new Set(matches.map((value) => value.replace(/&amp;/gi, "&").replace(/[),，。；;]+$/, "")).filter((value) => {
    try {
      return confirmationHosts.has(new URL(value).hostname.toLowerCase());
    } catch {
      return false;
    }
  }))].slice(0, 5);
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
