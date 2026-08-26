import { describe, expect, it } from "vitest";
import { createDiagnosticReport } from "../src/lib/diagnostics";
import type { FieldMatch } from "../src/lib/field-matcher";
import type { ScanResult } from "../src/lib/page-client";

describe("desensitized diagnostics", () => {
  it("exports structure and reasons without form values, profile values or URL queries", () => {
    const scan: ScanResult = {
      url: "https://company.hotjob.cn/apply?resumeId=private-123&token=secret",
      title: "应聘登记",
      fields: [{
        token: "field-1",
        kind: "input",
        label: "姓名",
        signals: ["姓名", "candidate_name"],
        section: "基本信息",
        options: [],
        currentValue: "网页里的真实姓名",
        required: true,
      }],
    };
    const matches: FieldMatch[] = [{
      token: "field-1",
      label: "姓名",
      profilePath: "personal.fullName",
      value: "资料库里的真实姓名",
      confidence: "high",
      reviewRequired: false,
      reason: "字段名称明确匹配",
    }];

    const report = createDiagnosticReport(scan, matches);
    const exported = JSON.stringify(report);
    expect(report.page).toEqual({ hostname: "company.hotjob.cn", route: "/apply", title: "应聘登记" });
    expect(exported).not.toContain("private-123");
    expect(exported).not.toContain("secret");
    expect(exported).not.toContain("真实姓名");
    expect(exported).not.toContain("candidate_name");
    expect(report.fields[0]).toMatchObject({ marker: 1, kind: "input", status: "high" });
  });

  it("reports already-filled webpage fields separately from real skips", () => {
    const scan: ScanResult = {
      url: "https://company.hotjob.cn/apply",
      title: "应聘登记",
      fields: [{ token: "existing", kind: "combobox", label: "政治面貌", signals: ["政治面貌"], section: "", options: [], currentValue: "网页现有值", required: false, inputType: "text", readOnly: true, componentHint: "atsx-select" }],
    };
    const matches: FieldMatch[] = [{ token: "existing", label: "政治面貌", profilePath: null, value: "", confidence: "skipped", reviewRequired: false, reason: "网页中已有内容，未覆盖" }];
    const report = createDiagnosticReport(scan, matches);
    expect(report.summary).toMatchObject({ existing: 1, skipped: 0 });
    expect(report.fields[0]).toMatchObject({ status: "existing", readOnly: true, componentHint: "atsx-select" });
    expect(JSON.stringify(report)).not.toContain("网页现有值");
  });
});
