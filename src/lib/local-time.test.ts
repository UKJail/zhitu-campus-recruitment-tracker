import { describe, expect, it } from "vitest";
import { formatLocalChineseDate, greetingForHour, greetingWithId } from "./local-time";

describe("local time copy", () => {
  it("uses morning, noon, and evening greetings at the intended boundaries", () => {
    expect(greetingForHour(5)).toBe("早上好");
    expect(greetingForHour(10)).toBe("早上好");
    expect(greetingForHour(11)).toBe("中午好");
    expect(greetingForHour(13)).toBe("中午好");
    expect(greetingForHour(14)).toBe("晚上好");
    expect(greetingForHour(23)).toBe("晚上好");
    expect(greetingForHour(2)).toBe("晚上好");
  });

  it("formats the visitor's local calendar date", () => {
    expect(formatLocalChineseDate(new Date(2026, 7, 14, 9))).toBe("8月14日 · 星期五");
  });

  it("adds only the current user's custom ID to the greeting", () => {
    expect(greetingWithId(20, "  lijinbeili  ")).toBe("晚上好，lijinbeili");
    expect(greetingWithId(8, null)).toBe("早上好");
  });
});
