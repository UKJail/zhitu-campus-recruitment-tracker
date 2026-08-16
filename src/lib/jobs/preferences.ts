import { classifyRecruitmentType } from "@/lib/business";
import type { JobPreferences } from "@/lib/account/preferences";
import type { Job } from "@/lib/types";

export type PreferenceMatch = {
  eligible: boolean;
  score: number;
  level: "S" | "A" | "B";
  reasons: string[];
  blockedBy: string[];
};

function includesAny(text: string, values: string[]) {
  const normalized = text.toLocaleLowerCase("zh-CN");
  return values.some((value) => normalized.includes(value.toLocaleLowerCase("zh-CN")));
}

function explicitGraduationYears(text: string) {
  const matches = text.match(/20\d{2}(?=\s*(?:届|年毕业|毕业))/g) || [];
  return [...new Set(matches)];
}

export function matchJobPreferences(job: Job, preferences: JobPreferences): PreferenceMatch {
  const fullText = [job.company, job.title, job.location, job.description, job.experience, job.education, ...job.tags].join(" ");
  const reasons: string[] = [];
  const blockedBy: string[] = [];
  let points = 0;
  let total = 0;

  if (preferences.excludedKeywords.length && includesAny(fullText, preferences.excludedKeywords)) {
    blockedBy.push("命中排除关键词");
  }

  if (preferences.roleKeywords.length) {
    total += 40;
    if (includesAny([job.title, job.description, ...job.tags].join(" "), preferences.roleKeywords)) {
      points += 40;
      reasons.push("岗位方向匹配");
    } else {
      blockedBy.push("岗位方向不匹配");
    }
  }

  if (preferences.cities.length) {
    total += 20;
    if (includesAny(job.location, preferences.cities)) {
      points += 20;
      reasons.push("城市匹配");
    } else {
      blockedBy.push("城市不匹配");
    }
  }

  if (preferences.recruitmentTypes.length) {
    total += 20;
    if (preferences.recruitmentTypes.includes(classifyRecruitmentType(job) as "graduate" | "internship")) {
      points += 20;
      reasons.push("招聘类型匹配");
    } else {
      blockedBy.push("招聘类型不匹配");
    }
  }

  if (preferences.graduationYear) {
    total += 10;
    const years = explicitGraduationYears(fullText);
    if (!years.length || years.includes(preferences.graduationYear)) {
      points += years.length ? 10 : 5;
      if (years.length) reasons.push(`${preferences.graduationYear} 届匹配`);
    } else {
      blockedBy.push("届别不匹配");
    }
  }

  if (preferences.focusCompanies.length) {
    total += 10;
    if (includesAny(job.company, preferences.focusCompanies)) {
      points += 10;
      reasons.push("关注公司");
    }
  }

  const score = total ? Math.round(points / total * 100) : 0;
  return {
    eligible: blockedBy.length === 0,
    score,
    level: score >= 80 ? "S" : score >= 55 ? "A" : "B",
    reasons,
    blockedBy,
  };
}
