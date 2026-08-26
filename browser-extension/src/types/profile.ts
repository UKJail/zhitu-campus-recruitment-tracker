import { z } from "zod";

const text = z.string().default("");
const textList = z.array(z.string()).default([]);
const idText = z.string().min(1);

export const resumeAssetSchema = z.object({
  id: idText,
  name: z.string().min(1),
  mimeType: z.enum([
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ]),
  size: z.number().int().nonnegative(),
  language: z.enum(["zh-CN", "zh-HK", "en"]),
  tags: textList,
  addedAt: z.string(),
  extractedText: text,
});

export const educationSchema = z.object({
  id: idText,
  school: text,
  degree: text,
  academicDegree: text,
  educationType: text,
  field: text,
  startDate: text,
  endDate: text,
  gpa: text,
  ranking: text,
  overseasSchool: z.enum(["", "yes", "no"]).default(""),
  details: textList,
});

export const experienceSchema = z.object({
  id: idText,
  type: z.enum(["internship", "employment", "campus", "research", "volunteer"]),
  organization: text,
  role: text,
  location: text,
  startDate: text,
  endDate: text,
  current: z.boolean().default(false),
  bullets: textList,
});

export const projectSchema = z.object({
  id: idText,
  type: z.enum(["course", "graduation", "research", "competition", "personal"]),
  name: text,
  role: text,
  startDate: text,
  endDate: text,
  description: text,
  bullets: textList,
  link: text,
});

export const autofillProfileV1Schema = z.object({
  schemaVersion: z.literal(1),
  profileVersion: z.number().int().positive(),
  id: idText,
  name: z.string().min(1),
  language: z.enum(["zh-CN", "zh-HK", "en"]),
  personal: z.object({
    fullName: text,
    givenName: text,
    familyName: text,
    gender: z.enum(["", "male", "female", "other", "prefer-not-to-say"]),
    birthDate: text,
    politicalStatus: text,
    nationality: text,
    nativePlace: text,
    summary: text,
  }),
  contact: z.object({
    email: text,
    phone: text,
    countryCode: text,
    country: text,
    province: text,
    city: text,
    address: text,
    postalCode: text,
    wechat: text,
  }),
  education: z.array(educationSchema),
  experiences: z.array(experienceSchema),
  projects: z.array(projectSchema),
  awards: z.array(z.object({
    id: idText,
    name: text,
    level: text,
    issuer: text,
    date: text,
    description: text,
  })),
  certificates: z.array(z.object({
    id: idText,
    name: text,
    issuer: text,
    date: text,
    credentialId: text,
  })),
  skills: z.array(z.object({ id: idText, name: text, level: text })),
  languages: z.array(z.object({
    id: idText,
    name: text,
    level: text,
    certificates: textList,
  })),
  links: z.object({
    linkedin: text,
    github: text,
    portfolio: text,
    other: z.array(z.object({ id: idText, label: text, url: text })),
  }),
  jobPreferences: z.object({
    targetRoles: textList,
    locations: textList,
    expectedSalary: text,
    availableDate: text,
    workAuthorization: text,
    sponsorship: text,
    internshipDuration: text,
  }),
  answerBank: z.array(z.object({
    id: idText,
    question: text,
    answer: text,
    reviewRequired: z.boolean().default(true),
  })),
  resumes: z.array(resumeAssetSchema),
  confirmedFields: textList,
  uncertainItems: textList,
  updatedAt: z.string(),
});

export const siteRuleSchema = z.object({
  id: idText,
  origin: z.string().min(1),
  labelPattern: z.string().min(1),
  profilePath: z.string().min(1),
  createdAt: z.string(),
});

export const vaultStateSchema = z.object({
  schemaVersion: z.literal(1),
  activeProfileId: idText,
  profiles: z.array(autofillProfileV1Schema).min(1),
  siteRules: z.array(siteRuleSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ResumeAsset = z.infer<typeof resumeAssetSchema>;
export type Education = z.infer<typeof educationSchema>;
export type Experience = z.infer<typeof experienceSchema>;
export type Project = z.infer<typeof projectSchema>;
export type AutofillProfileV1 = z.infer<typeof autofillProfileV1Schema>;
export type SiteRule = z.infer<typeof siteRuleSchema>;
export type VaultState = z.infer<typeof vaultStateSchema>;

export function createId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function createEmptyProfile(name = "中文通用简历"): AutofillProfileV1 {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    profileVersion: 1,
    id: createId("profile"),
    name,
    language: "zh-CN",
    personal: {
      fullName: "",
      givenName: "",
      familyName: "",
      gender: "",
      birthDate: "",
      politicalStatus: "",
      nationality: "",
      nativePlace: "",
      summary: "",
    },
    contact: {
      email: "",
      phone: "",
      countryCode: "+86",
      country: "中国",
      province: "",
      city: "",
      address: "",
      postalCode: "",
      wechat: "",
    },
    education: [],
    experiences: [],
    projects: [],
    awards: [],
    certificates: [],
    skills: [],
    languages: [],
    links: { linkedin: "", github: "", portfolio: "", other: [] },
    jobPreferences: {
      targetRoles: [],
      locations: [],
      expectedSalary: "",
      availableDate: "",
      workAuthorization: "",
      sponsorship: "",
      internshipDuration: "",
    },
    answerBank: [],
    resumes: [],
    confirmedFields: [],
    uncertainItems: [],
    updatedAt: now,
  };
}

export function createEmptyVault(): VaultState {
  const now = new Date().toISOString();
  const profile = createEmptyProfile();
  return {
    schemaVersion: 1,
    activeProfileId: profile.id,
    profiles: [profile],
    siteRules: [],
    createdAt: now,
    updatedAt: now,
  };
}
