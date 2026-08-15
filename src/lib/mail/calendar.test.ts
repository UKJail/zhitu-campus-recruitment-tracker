import { describe, expect, it } from "vitest";
import { calendarEventFromEmail } from "./calendar";

const now = new Date("2026-08-15T00:00:00.000Z");

describe("recruiting calendar", () => {
  it("uses the deadline for assessments even when an event time is also present", () => {
    const event = calendarEventFromEmail({
      id: "mail-1",
      subject: "线上测评通知",
      category: "assessment",
      received_at: now.toISOString(),
      extracted_data: {
        company: "腾讯",
        role: "产品培训生",
        eventTimeText: "2026年8月16日 09:00",
        deadlineText: "请于 2026年8月18日 18:00 前完成",
      },
    }, now);
    expect(event?.scheduledAt).toBe("2026-08-18T10:00:00.000Z");
    expect(event?.originalTimeText).toContain("8月18日");
  });

  it("uses the interview date for interview invitations", () => {
    const event = calendarEventFromEmail({
      id: "mail-2",
      subject: "业务面试邀请",
      category: "interview",
      received_at: now.toISOString(),
      extracted_data: { eventTimeText: "2026年8月20日 14:30", meetingUrl: "https://meeting.example/1" },
    }, now);
    expect(event?.scheduledAt).toBe("2026-08-20T06:30:00.000Z");
    expect(event?.type).toBe("interview");
  });

  it("keeps an email visible when its date cannot be parsed", () => {
    const event = calendarEventFromEmail({
      id: "mail-3",
      subject: "面试时间待定",
      category: "interview",
      received_at: now.toISOString(),
      extracted_data: {},
    }, now);
    expect(event?.scheduledAt).toBeNull();
    expect(event?.title).toBe("面试时间待定");
  });
});

