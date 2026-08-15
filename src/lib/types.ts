export type ApplicationStatus =
  | "saved"
  | "preparing"
  | "applied"
  | "assessment"
  | "interview"
  | "offer"
  | "rejected"
  | "closed";

export type Job = {
  id: string;
  company: string;
  title: string;
  location: string;
  salary: string;
  experience: string;
  education: string;
  source: string;
  publishedAt: string;
  publishedAtIso?: string;
  match: number;
  tags: string[];
  description: string;
  applyUrl: string;
  saved: boolean;
  status?: ApplicationStatus;
  applicationId?: string;
  appliedConfirmedAt?: string;
  events?: ApplicationEvent[];
};

export type ApplicationEvent = {
  id: string;
  fromStatus: ApplicationStatus | null;
  toStatus: ApplicationStatus;
  source: "user" | "email" | "system" | "admin";
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export type Resume = {
  id: string;
  name: string;
  fileType: "PDF" | "DOCX";
  updatedAt: string;
  completeness: number;
  skills: string[];
};

export type Suggestion = {
  id: string;
  section: string;
  original: string;
  revised: string;
  reason: string;
  impact: "高" | "中" | "低";
  requiresConfirmation?: boolean;
  sourceIndex?: number;
  state: "pending" | "accepted" | "rejected";
};

export type InterviewReview = {
  id: string;
  interviewId?: string | null;
  applicationId?: string | null;
  resumeVersionId?: string | null;
  company: string;
  role: string;
  round: string;
  date: string;
  interviewer?: string;
  score: number;
  questions: string;
  answerSummary?: string;
  highlights: string;
  improvements: string;
  nextStep: string;
  nextRoundPrep?: string;
  updatedAt?: string;
};
