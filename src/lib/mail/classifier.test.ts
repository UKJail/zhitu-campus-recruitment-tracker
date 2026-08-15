import { describe, expect, it } from "vitest";
import { classifyMail, extractRecruitingDetails, plainTextFromHtml, recruitingEventTime, reminderSchedule, suggestedStatus } from "./classifier";

describe("mail classifier", () => {
  it("maps common recruiting messages", () => {
    expect(classifyMail("线上测评通知", "请于今晚完成")).toBe("assessment");
    expect(classifyMail("面试邀请", "腾讯会议")).toBe("interview");
    expect(classifyMail("感谢申请", "很遗憾未能通过")).toBe("rejection");
  });

  it("extracts scheduling details without inventing missing facts", () => {
    expect(
      extractRecruitingDetails("面试邀请", "面试时间 2026年8月16日 14:30，会议 https://meeting.example/abc。"),
    ).toEqual({
      meetingUrl: "https://meeting.example/abc",
      deadlineText: null,
      eventTimeText: "2026年8月16日 14:30",
    });
  });

  it("maps categories to pending status suggestions", () => {
    expect(suggestedStatus("offer")).toBe("offer");
    expect(suggestedStatus("other")).toBeNull();
  });

  it("parses China time and schedules a one-day reminder", () => {
    const now = new Date("2026-08-14T00:00:00.000Z");
    expect(recruitingEventTime("2026年8月16日 14:30", now)).toBe("2026-08-16T06:30:00.000Z");
    expect(reminderSchedule("2026年8月16日 14:30", now)).toBe("2026-08-15T06:30:00.000Z");
    expect(recruitingEventTime("2026年2月31日 14:30", now)).toBeNull();
  });

  it("converts received HTML to safe text", () => {
    expect(plainTextFromHtml("<p>Hello &amp; welcome</p><script>bad()</script>")).toBe("Hello & welcome");
  });
});
