import type { ApplicationStatus, Job, Suggestion } from "./types";

export const applicationStatuses: ApplicationStatus[] = ["saved", "preparing", "applied", "assessment", "interview", "offer", "rejected", "closed"];

export function canTransition(from: ApplicationStatus, to: ApplicationStatus) {
  if (from === to) return true;
  const transitions: Record<ApplicationStatus, ApplicationStatus[]> = {
    saved: ["preparing", "rejected", "closed"],
    preparing: ["applied", "rejected", "closed"],
    applied: ["assessment", "interview", "offer", "rejected", "closed"],
    assessment: ["interview", "offer", "rejected", "closed"],
    interview: ["offer", "rejected", "closed"],
    offer: ["closed"],
    rejected: ["saved"],
    closed: ["saved"],
  };
  return transitions[from].includes(to);
}

export function confirmedApplicationCount(items: Job[]) {
  return items.filter((job) => Boolean(job.appliedConfirmedAt)
    || (!job.applicationId && job.status && !["saved", "preparing", "closed"].includes(job.status))).length;
}

function dateKeyInTimeZone(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function confirmedApplicationCountOnDate(items: Job[], date: Date, timeZone = "Asia/Shanghai") {
  const targetDate = dateKeyInTimeZone(date, timeZone);
  return items.filter((job) => {
    if (!job.appliedConfirmedAt) return false;
    const confirmedAt = new Date(job.appliedConfirmedAt);
    return !Number.isNaN(confirmedAt.getTime()) && dateKeyInTimeZone(confirmedAt, timeZone) === targetDate;
  }).length;
}

export function applySuggestion(items: Suggestion[], id: string, accept: boolean) {
  return items.map((item) => item.id === id ? { ...item, state: accept ? "accepted" as const : "rejected" as const } : item);
}

export function jobFingerprint(job: Pick<Job, "company" | "title" | "location">) {
  return [job.company, job.title, job.location].map((part) => part.trim().toLocaleLowerCase("zh-CN").replace(/\s+/g, "")).join("|");
}

export type RecruitmentType = "graduate" | "internship" | "other";

export function classifyRecruitmentType(job: Pick<Job, "title" | "description" | "tags" | "experience">): RecruitmentType {
  const text = [job.title, job.description, job.experience, ...job.tags].join(" ").toLocaleLowerCase("zh-CN");
  if (/实习|\bintern(?:ship)?\b/.test(text)) return "internship";
  if (/校招|校园招聘|应届|毕业生|管培生|\bgraduate\b|\bcampus\b|\bnew grad\b|\bmanagement trainee\b/.test(text)) return "graduate";
  return "other";
}
