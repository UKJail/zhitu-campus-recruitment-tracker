import { describe, expect, it } from "vitest";
import { matchFields, type FieldDescriptor } from "../src/lib/field-matcher";
import { createEmptyProfile, type AutofillProfileV1, type SiteRule } from "../src/types/profile";

function field(label: string, section = "基本信息", patch: Partial<FieldDescriptor> = {}): FieldDescriptor {
  return {
    token: `field-${label}`,
    kind: "input",
    label,
    signals: [label],
    section,
    options: [],
    currentValue: "",
    required: false,
    ...patch,
  };
}

function fixtureProfile(): AutofillProfileV1 {
  const profile = createEmptyProfile("脱敏验收模板");
  profile.personal = { ...profile.personal, fullName: "测试同学", gender: "female", birthDate: "2003-05-02", politicalStatus: "共青团员", nationality: "中国", nativePlace: "山东省青岛市" };
  profile.contact = { ...profile.contact, email: "candidate@example.test", phone: "13800000000", province: "广东省", city: "深圳市", address: "测试路 1 号", postalCode: "518000", wechat: "test_wechat" };
  profile.education.push({ id: "education-1", school: "示例大学", degree: "本科", academicDegree: "学士", educationType: "全日制", field: "金融学", startDate: "2022-09", endDate: "2026-06", gpa: "3.6/4.0", ranking: "", overseasSchool: "no", details: ["公司金融", "财务分析"] });
  profile.experiences.push({ id: "experience-1", type: "internship", organization: "示例公司", role: "分析实习生", location: "深圳", startDate: "2025-06", endDate: "2025-09", current: false, bullets: ["整理公开数据并制作报告"] });
  profile.projects.push({ id: "project-1", type: "course", name: "估值课程项目", role: "组员", startDate: "2025-02", endDate: "2025-05", description: "完成课程范围内的估值分析", bullets: [], link: "" });
  profile.skills.push({ id: "skill-1", name: "Excel", level: "" });
  profile.languages.push({ id: "language-1", name: "英语", level: "CET-6", certificates: ["CET-6"] });
  profile.jobPreferences.expectedSalary = "面议";
  profile.jobPreferences.locations = ["深圳市", "香港", "上海市"];
  return profile;
}

describe("safe field matching", () => {
  it("matches at least 85% of unambiguous basic fields at high confidence", () => {
    const fields = [
      field("姓名"), field("电子邮箱"), field("手机号码"), field("所在国家"),
      field("省份"), field("城市"), field("联系地址"), field("邮政编码"), field("微信号"),
      field("学校名称", "教育经历"), field("学历", "教育经历"), field("专业名称", "教育经历"),
      field("入学时间", "教育经历"), field("毕业时间", "教育经历"),
      field("公司名称", "实习经历"), field("职位", "实习经历"), field("工作地点", "实习经历"),
      field("项目名称", "项目经历"), field("技能名称", "技能"), field("语言", "语言能力"),
    ];
    const matches = matchFields(fields, fixtureProfile(), [], "https://jobs.example.test");
    const high = matches.filter((match) => match.confidence === "high");

    expect(high.length / fields.length).toBeGreaterThanOrEqual(0.85);
    expect(matches.find((match) => match.label === "学校名称")?.profilePath).toBe("education.0.school");
    expect(matches.find((match) => match.label === "公司名称")?.profilePath).toBe("experiences.0.organization");
  });

  it("never overwrites content and blocks identity, password, captcha and agreement fields", () => {
    const fields = [
      field("姓名", "基本信息", { currentValue: "用户手动输入" }),
      field("身份证号码"),
      field("护照号码"),
      field("登录密码"),
      field("短信验证码"),
      field("我同意隐私协议", "协议", { kind: "checkbox" }),
    ];
    const matches = matchFields(fields, fixtureProfile(), [], "https://jobs.example.test");

    expect(matches.every((match) => match.confidence === "skipped")).toBe(true);
    expect(matches[0]?.reason).toContain("未覆盖");
    expect(matches.slice(1).every((match) => match.reason.includes("敏感"))).toBe(true);
  });

  it("marks gender, birth date, GPA and salary for review", () => {
    const fields = [field("性别", "基本信息", { kind: "select", options: ["男", "女"] }), field("出生日期"), field("GPA", "教育经历"), field("期望薪资")];
    const matches = matchFields(fields, fixtureProfile(), [], "https://jobs.example.test");
    expect(matches.every((match) => match.reviewRequired)).toBe(true);
    expect(matches.find((match) => match.label === "性别")?.value).toBe("女");
  });

  it("directly maps political status and overseas-school answers already stored in the profile", () => {
    const fields = [
      field("政治面貌", "基本信息", { kind: "combobox", options: ["中共党员", "共青团员", "群众"] }),
      field("是否海外院校毕业", "教育经历", { kind: "radio", options: ["是", "否"] }),
    ];
    const matches = matchFields(fields, fixtureProfile(), [], "https://jobs.example.test");
    expect(matches[0]).toMatchObject({ confidence: "high", profilePath: "personal.politicalStatus", value: "共青团员" });
    expect(matches[1]).toMatchObject({ confidence: "high", profilePath: "education.0.overseasSchool", value: "否" });
  });

  it("keeps native place separate from current province and city", () => {
    const matched = matchFields([field("籍贯", "基本信息", { kind: "combobox" })], fixtureProfile(), [], "https://jobs.example.test")[0]!;
    expect(matched).toMatchObject({ profilePath: "personal.nativePlace", value: "山东省青岛市", reviewRequired: true });
  });

  it("keeps education level, academic degree and graduation year separate", () => {
    const matches = matchFields([
      field("毕业年份", "教育经历", { kind: "combobox" }),
      field("学历", "教育经历", { kind: "combobox" }),
      field("学位", "教育经历", { kind: "combobox" }),
      field("学历类型", "教育经历", { kind: "combobox" }),
    ], fixtureProfile(), [], "https://jobs.example.test");
    expect(matches.map((item) => [item.profilePath, item.value])).toEqual([
      ["education.0.graduationYear", "2026"],
      ["education.0.degree", "本科"],
      ["education.0.academicDegree", "学士"],
      ["education.0.educationType", "全日制"],
    ]);
  });

  it("marks month-only values for review when a site requires a calendar date", () => {
    const matched = matchFields([
      field("开始时间", "教育经历", { readOnly: true, componentHint: "ant-calendar-picker-input" }),
    ], fixtureProfile(), [], "https://jobs.example.test")[0]!;
    expect(matched).toMatchObject({ profilePath: "education.0.startDate", reviewRequired: true });
    expect(matched.reason).toContain("月初或月末");
  });

  it("recognizes enterprise-name wording as an experience organization", () => {
    const matched = matchFields([field("企业名称", "实习工作经历")], fixtureProfile(), [], "https://jobs.example.test")[0]!;
    expect(matched).toMatchObject({ profilePath: "experiences.0.organization", value: "示例公司" });
  });

  it("fills the highest education first even when the profile was entered undergraduate-first", () => {
    const profile = fixtureProfile();
    profile.education.push({ id: "education-2", school: "示例研究生院", degree: "硕士研究生", academicDegree: "硕士", educationType: "全日制", field: "金融", startDate: "2026-09", endDate: "2028-06", gpa: "", ranking: "", overseasSchool: "no", details: [] });
    const matches = matchFields([
      field("毕业学校", "教育经历 1", { kind: "combobox" }),
      field("毕业学校", "教育经历 2", { kind: "combobox" }),
    ], profile, [], "https://jobs.example.test");
    expect(matches.map((item) => [item.profilePath, item.value])).toEqual([
      ["education.1.school", "示例研究生院"],
      ["education.0.school", "示例大学"],
    ]);
  });

  it("uses the undergraduate record next when the first school field already contains the highest education", () => {
    const profile = fixtureProfile();
    profile.education.push({ id: "education-2", school: "示例研究生院", degree: "硕士研究生", academicDegree: "硕士", educationType: "全日制", field: "金融", startDate: "2026-09", endDate: "2028-06", gpa: "", ranking: "", overseasSchool: "no", details: [] });
    const matches = matchFields([
      field("毕业学校", "教育经历 1", { kind: "combobox", currentValue: "示例研究生院" }),
      field("毕业学校", "教育经历 2", { kind: "combobox" }),
    ], profile, [], "https://jobs.example.test");
    expect(matches[0]?.reason).toContain("网页中已有内容");
    expect(matches[1]).toMatchObject({ profilePath: "education.0.school", value: "示例大学" });
  });

  it("maps first, second and third preferred work locations independently", () => {
    const matches = matchFields([
      field("第一工作意向地", "求职意向", { kind: "combobox" }),
      field("第二工作意向地", "求职意向", { kind: "combobox" }),
      field("第三工作意向地", "求职意向", { kind: "combobox" }),
    ], fixtureProfile(), [], "https://jobs.example.test");
    expect(matches.map((item) => item.value)).toEqual(["深圳市", "香港", "上海市"]);
  });

  it("never guesses when an isolated yes/no radio option has no question label", () => {
    const matches = matchFields([field("是", "", { kind: "radio" }), field("否", "", { kind: "radio" })], fixtureProfile(), [], "https://jobs.example.test");
    expect(matches.every((item) => item.confidence === "skipped")).toBe(true);
    expect(matches.every((item) => item.reason.includes("题目"))).toBe(true);
  });

  it("uses an explicit per-site mapping rule without affecting other origins", () => {
    const rule: SiteRule = { id: "rule-1", origin: "https://ats.example.test", labelPattern: "候选人常用称呼", profilePath: "personal.fullName", createdAt: new Date().toISOString() };
    const target = field("候选人常用称呼");

    const matched = matchFields([target], fixtureProfile(), [rule], rule.origin)[0]!;
    const elsewhere = matchFields([target], fixtureProfile(), [rule], "https://other.example.test")[0]!;
    expect(matched.confidence).toBe("high");
    expect(matched.profilePath).toBe("personal.fullName");
    expect(elsewhere.confidence).toBe("skipped");
  });

  it("never applies a saved mapping rule to an unnamed field", () => {
    const rule: SiteRule = { id: "legacy-rule", origin: "https://ats.example.test", labelPattern: "未命名字段", profilePath: "personal.fullName", createdAt: new Date().toISOString() };
    const matched = matchFields([field("未命名字段", "")], fixtureProfile(), [rule], rule.origin)[0]!;

    expect(matched).toMatchObject({
      confidence: "skipped",
      profilePath: null,
      value: "",
      reason: "网页没有提供可识别的字段名称，已跳过",
    });
  });
});
