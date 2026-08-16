import { describe, expect, it } from "vitest";
import { isMainlandOrHongKongLocation, normalizeLocationToChinese } from "./location";

describe("job city normalization", () => {
  it.each([
    ["Beijing, China", "北京"],
    ["Hong Kong SAR", "香港"],
    ["Shenzhen / Shanghai", "深圳、上海"],
    ["Xi'an, Shaanxi, China", "西安"],
    ["Hangzhou or Remote", "杭州、远程"],
  ])("renders %s in Chinese", (input, expected) => {
    expect(normalizeLocationToChinese(input)).toBe(expected);
  });

  it("does not treat an overseas-only location as a target location", () => {
    expect(isMainlandOrHongKongLocation("Singapore")).toBe(false);
  });
});
