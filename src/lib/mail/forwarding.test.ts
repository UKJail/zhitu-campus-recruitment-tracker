import { describe, expect, it } from "vitest";
import { allowedConfirmationLinks, forwardingConfirmationProvider, forwardingVerificationState, gmailForwardingConfirmationCode, gmailRecruitmentFilterQuery, hasRecentInboundEmail, isGmailForwardingConfirmation, isQqForwardingConfirmation } from "./forwarding";

describe("mail forwarding helpers", () => {
  it("only exposes confirmation links from trusted mailbox providers", () => {
    const links = allowedConfirmationLinks("确认：https://mail-settings.google.com/mail/vf-abc?x=1&amp;y=2。忽略：https://evil.example/phish");
    expect(links).toEqual(["https://mail-settings.google.com/mail/vf-abc?x=1&y=2"]);
  });

  it("extracts the QQ accept-forwarding button from HTML and rejects lookalike links", () => {
    const html = '<a href="http://mail.qq.com/cgi-bin/attrset?t=verify&amp;token=abc">接受转发</a><a href="https://mail.qq.com.evil.example/cgi-bin/phish">伪造按钮</a>';
    expect(allowedConfirmationLinks(null, html, "qq")).toEqual(["https://mail.qq.com/cgi-bin/attrset?t=verify&token=abc"]);
  });

  it("recognizes a genuine Gmail forwarding confirmation without trusting the subject alone", () => {
    expect(isGmailForwardingConfirmation({ sender: "Gmail Team <forwarding-noreply@google.com>", subject: "(#12345678) Gmail Forwarding Confirmation - Receive Mail" })).toBe(true);
    expect(isGmailForwardingConfirmation({ sender: "attacker@example.com", subject: "Gmail Forwarding Confirmation" })).toBe(false);
  });

  it("recognizes QQ forwarding confirmation mail and reports its provider", () => {
    const email = { sender: "QQ邮箱 <lijinbeili@qq.com>", subject: "QQ邮箱自动转发验证邮件" };
    expect(isQqForwardingConfirmation(email)).toBe(true);
    expect(forwardingConfirmationProvider(email)).toBe("qq");
    expect(isQqForwardingConfirmation({ sender: "attacker@example.com", subject: "QQ邮箱自动转发验证邮件" })).toBe(false);
  });

  it("uses the same waiting, received and opened state model for Gmail and QQ", () => {
    const gmail = { sender: "forwarding-noreply@google.com", subject: "Gmail Forwarding Confirmation" };
    const qq = { sender: "service@qq.com", subject: "QQ邮箱自动转发验证邮件" };
    expect(forwardingVerificationState("gmail", [])).toMatchObject({ phase: "waiting", title: "正在等待 Gmail 验证邮件" });
    expect(forwardingVerificationState("qq", [])).toMatchObject({ phase: "waiting", title: "正在等待 QQ 邮箱验证邮件" });
    expect(forwardingVerificationState("gmail", [gmail])).toMatchObject({ phase: "received", title: "已收到 Gmail 验证邮件" });
    expect(forwardingVerificationState("qq", [qq], true)).toMatchObject({ phase: "opened", title: "已打开 QQ 邮箱验证邮件" });
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
