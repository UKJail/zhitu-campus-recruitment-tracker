import { describe, expect, it } from "vitest";
import { applySuggestion, canTransition, classifyRecruitmentType, confirmedApplicationCount, confirmedApplicationCountOnDate, jobFingerprint } from "./business";
import { jobs, initialSuggestions } from "./demo-data";
describe("business rules", () => {
  it("does not count saved or preparing applications", () => expect(confirmedApplicationCount([...jobs, { ...jobs[0], id: "x", status: "preparing" }])).toBe(3));
  it("does not count a failed real application that moved to closed", () => expect(confirmedApplicationCount([{ ...jobs[0], applicationId: "app-1", appliedConfirmedAt: undefined, status: "closed" }])).toBe(0));
  it("counts a real application only after successful confirmation", () => expect(confirmedApplicationCount([{ ...jobs[0], applicationId: "app-1", appliedConfirmedAt: "2026-08-13T12:00:00Z", status: "applied" }])).toBe(1));
  it("counts only confirmations from the selected Shanghai calendar day", () => {
    const items = [
      { ...jobs[0], id: "before", appliedConfirmedAt: "2026-08-15T15:59:59Z" },
      { ...jobs[0], id: "today", appliedConfirmedAt: "2026-08-15T16:00:01Z" },
      { ...jobs[0], id: "invalid", appliedConfirmedAt: "not-a-date" },
    ];
    expect(confirmedApplicationCountOnDate(items, new Date("2026-08-16T08:00:00+08:00"))).toBe(1);
  });
  it("allows valid status flow and blocks skipped or backwards flow", () => {
    expect(canTransition("applied", "interview")).toBe(true);
    expect(canTransition("interview", "applied")).toBe(false);
    expect(canTransition("saved", "applied")).toBe(false);
    expect(canTransition("offer", "rejected")).toBe(false);
    expect(canTransition("closed", "saved")).toBe(true);
  });
  it("keeps suggestion source and records decision", () => { const output=applySuggestion(initialSuggestions,"s1",true); expect(output[0].original).toBe(initialSuggestions[0].original); expect(output[0].state).toBe("accepted"); });
  it("normalizes fingerprint", () => expect(jobFingerprint({company:" 字节跳动 ",title:"AI 产品经理",location:"上海"})).toBe("字节跳动|ai产品经理|上海"));
  it("classifies campus graduate and internship jobs", () => {
    expect(classifyRecruitmentType({ title: "市场营销（腾讯校招）", description: "", experience: "经验不限", tags: [] })).toBe("graduate");
    expect(classifyRecruitmentType({ title: "Product Intern", description: "支持产品调研", experience: "在校生", tags: [] })).toBe("internship");
    expect(classifyRecruitmentType({ title: "客户成功经理", description: "社会招聘", experience: "3-5年", tags: [] })).toBe("other");
  });
});
