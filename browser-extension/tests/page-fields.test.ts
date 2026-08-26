import { describe, expect, it } from "vitest";
import { choiceMatchScore, fieldContainerFor, isEmptyPlaceholder, normalizeDateValue, parseDateParts, radioGroupFor, radioOptionLabel, radioQuestionLabel } from "../src/lib/page-fields";

describe("page field helpers", () => {
  it("treats descriptive select prompts as empty values", () => {
    expect(isEmptyPlaceholder("请选择政治面貌")).toBe(true);
    expect(isEmptyPlaceholder(" 请选择 入学日期 ")).toBe(true);
    expect(isEmptyPlaceholder("共青团员")).toBe(false);
  });

  it("normalizes dates without inventing a missing day", () => {
    expect(normalizeDateValue("2025年06月", "month")).toBe("2025-06");
    expect(normalizeDateValue("2025-06-18", "month")).toBe("2025-06");
    expect(normalizeDateValue("2025-06", "date")).toBeNull();
    expect(parseDateParts("2025年06月18日")).toEqual({ year: 2025, month: 6, day: 18 });
  });

  it("matches location options with or without administrative suffixes", () => {
    expect(choiceMatchScore("深圳", "深圳市")).toBeGreaterThanOrEqual(90);
    expect(choiceMatchScore("广东省", "广东")).toBeGreaterThanOrEqual(90);
    expect(choiceMatchScore("香港中文大学（深圳）", "香港中文大学")).toBeGreaterThan(0);
    expect(choiceMatchScore("北京", "上海市")).toBe(0);
  });

  it("groups name-less Beisen-style radio options by question without mixing adjacent groups", () => {
    document.body.innerHTML = `
      <div class="ant-form-item"><div class="ant-form-item-label">是否海外院校毕业</div><div class="choices"><label><input id="overseas-yes" type="radio" value="yes">是</label><label><input id="overseas-no" type="radio" value="no">否</label></div></div>
      <div class="ant-form-item"><div class="ant-form-item-label">是否接受调剂</div><div class="choices"><label><input id="adjust-yes" type="radio" value="yes">是</label><label><input id="adjust-no" type="radio" value="no">否</label></div></div>`;
    const overseasYes = document.querySelector<HTMLInputElement>("#overseas-yes")!;
    const overseasNo = document.querySelector<HTMLInputElement>("#overseas-no")!;
    const adjustYes = document.querySelector<HTMLInputElement>("#adjust-yes")!;
    expect(radioGroupFor(overseasYes)).toBe(radioGroupFor(overseasNo));
    expect(radioGroupFor(overseasYes)).not.toBe(radioGroupFor(adjustYes));
    expect(radioQuestionLabel(overseasYes)).toBe("是否海外院校毕业");
    expect(radioOptionLabel(overseasNo)).toBe("否");
  });

  it("climbs past Ant Design inner wrappers to the form item that owns the label", () => {
    document.body.innerHTML = `<div class="ant-form-item"><div class="ant-form-item-label">学历类型</div><div class="ant-form-item-control"><div class="ant-form-item-children"><div id="combo" class="ant-select-selection" role="combobox"></div></div></div></div>`;
    const combo = document.querySelector<HTMLElement>("#combo")!;
    const container = fieldContainerFor(combo);
    expect(container?.classList.contains("ant-form-item")).toBe(true);
    expect(container?.querySelector(".ant-form-item-label")?.textContent).toBe("学历类型");
  });
});
