import { describe, expect, it } from "vitest";
import { allowedConfirmationLinks, gmailForwardingConfirmationCode, gmailRecruitmentFilterQuery, hasRecentInboundEmail, isGmailForwardingConfirmation } from "./forwarding";

describe("mail forwarding helpers", () => {
  it("only exposes confirmation links from trusted mailbox providers", () => {
    const links = allowedConfirmationLinks("确认：https://mail-settings.google.com/mail/vf-abc?x=1&amp;y=2。忽略：https://evil.example/phish");
    expect(links).toEqual(["https://mail-settings.google.com/mail/vf-abc?x=1&y=2"]);
  });

  it("recognizes a genuine Gmail forwarding confirmation without trusting the subject alone", () => {
    expect(isGmailForwardingConfirmation({ sender: "Gmail Team <forwarding-noreply@google.com>", subject: "(#12345678) Gmail Forwarding Confirmation - Receive Mail" })).toBe(true);
    expect(isGmailForwardingConfirmation({ sender: "attacker@example.com", subject: "Gmail Forwarding Confirmation" })).toBe(false);
  });

  it("extracts an eight digit Gmail confirmation code", () => {
    expect(gmailForwardingConfirmationCode("Confirmation code: 12345678")).toBe("12345678");
    expect(gmailForwardingConfirmationCode("无验证信息")).toBeNull();
  });

  it("detects a test email received within ten minutes", () => {
    const now = new Date("2026-08-15T12:10:00Z");
    expect(hasRecentInboundEmail([{ received_at: "2026-08-15T12:03:00Z" }], now)).toBe(true);
    expect(hasRecentInboundEmail([{ received_at: "2026-08-15T11:30:00Z" }], now)).toBe(false);
  });

  it("builds a Gmail OR query that can be pasted into the contains-words field", () => {
    const query = gmailRecruitmentFilterQuery();
    expect(query).toBe("{面试 笔试 测评 offer 录用 招聘 校招 校园招聘 interview assessment application}");
    expect(query.startsWith("{")).toBe(true);
    expect(query.endsWith("}")).toBe(true);
  });
});
