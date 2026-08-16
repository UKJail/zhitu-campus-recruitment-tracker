import { describe, expect, it } from "vitest";
import { careerPortalIndustries, filterCareerPortals, type CareerPortal } from "./career-portals";

const portals: CareerPortal[] = [
  { key: "tencent", name: "腾讯", industry: "互联网/科技", url: "https://careers.tencent.com/" },
  { key: "csg", name: "中国南方电网", industry: "能源/电力", url: "https://zhaopin.csg.cn/" },
];

describe("企业校招入口筛选", () => {
  it("支持按企业名称和行业关键词搜索", () => {
    expect(filterCareerPortals(portals, "腾讯", "全部行业").map((item) => item.key)).toEqual(["tencent"]);
    expect(filterCareerPortals(portals, "电力", "全部行业").map((item) => item.key)).toEqual(["csg"]);
  });

  it("支持行业精确筛选并生成去重行业列表", () => {
    expect(filterCareerPortals(portals, "", "能源/电力").map((item) => item.key)).toEqual(["csg"]);
    expect(careerPortalIndustries([...portals, portals[0]])).toEqual(["互联网/科技", "能源/电力"]);
  });
});
