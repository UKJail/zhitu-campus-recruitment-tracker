import { describe, expect, it } from "vitest";
import {
  autofillProfileV1Schema,
  createEmptyProfile,
  createEmptyVault,
  vaultStateSchema,
} from "../src/types/profile";

describe("AutofillProfileV1", () => {
  it("creates a valid, versioned local data contract", () => {
    const profile = createEmptyProfile("校招中文模板");
    expect(autofillProfileV1Schema.parse(profile)).toEqual(profile);
    expect(profile.schemaVersion).toBe(1);
    expect(profile.profileVersion).toBe(1);
  });

  it("keeps student experience and project types explicit", () => {
    const profile = createEmptyProfile();
    profile.experiences.push({
      id: "experience-1",
      type: "campus",
      organization: "学生组织",
      role: "成员",
      location: "",
      startDate: "2025-09",
      endDate: "2026-06",
      current: false,
      bullets: ["参与活动执行"],
    });
    profile.projects.push({
      id: "project-1",
      type: "course",
      name: "课程作业",
      role: "组员",
      startDate: "2025-10",
      endDate: "2025-12",
      description: "课程范围内完成",
      bullets: [],
      link: "",
    });

    const parsed = autofillProfileV1Schema.parse(profile);
    expect(parsed.experiences[0]?.type).toBe("campus");
    expect(parsed.projects[0]?.type).toBe("course");
  });

  it("upgrades older education records with the overseas-school answer left unset", () => {
    const profile = createEmptyProfile();
    const parsed = autofillProfileV1Schema.parse({
      ...profile,
      education: [{ id: "education-old", school: "示例大学", degree: "本科", field: "", startDate: "", endDate: "", gpa: "", ranking: "", details: [] }],
    });
    expect(parsed.education[0]?.overseasSchool).toBe("");
    expect(parsed.education[0]?.academicDegree).toBe("");
    expect(parsed.education[0]?.educationType).toBe("");
  });

  it("rejects unknown schema versions and invalid experience promotion", () => {
    const vault = createEmptyVault();
    expect(() => vaultStateSchema.parse({ ...vault, schemaVersion: 2 })).toThrow();
    expect(() => autofillProfileV1Schema.parse({
      ...vault.profiles[0],
      experiences: [{ id: "x", type: "business-project" }],
    })).toThrow();
  });
});
