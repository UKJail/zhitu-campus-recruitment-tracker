import JSZip from "jszip";
import * as pdfjs from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import mammoth from "mammoth";
import type { AutofillProfileV1, ResumeAsset } from "../types/profile";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const WORD_NAMESPACE = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const DATE_TOKEN_SOURCE = "(?:19|20)\\d{2}(?:[./年-]\\d{1,2})?";
const DATE_RANGE = new RegExp(`(${DATE_TOKEN_SOURCE})\\s*(?:-|–|—|至|~|～)\\s*(${DATE_TOKEN_SOURCE}|至今|现在|present)`, "i");
const SINGLE_DATE = new RegExp(DATE_TOKEN_SOURCE, "i");

type ResumeSection = "education" | "experience" | "project" | "summary" | "skills";

const SECTION_HEADINGS: Record<ResumeSection, RegExp> = {
  education: /^(教育背景|教育经历|学历背景|education)$/i,
  experience: /^(工作经历|实习经历|工作经验|职业经历|实践经历|experience)$/i,
  project: /^(项目经历|项目经验|研究经历|project)$/i,
  summary: /^(自我评价|个人概述|个人简介|个人总结|职业概述|summary)$/i,
  skills: /^(个人技能|技能专长|专业技能|技能|skills)$/i,
};

export async function extractResumeText(file: File) {
  const buffer = await file.arrayBuffer();
  if (file.type === DOCX_MIME || file.name.toLowerCase().endsWith(".docx")) {
    const [mammothResult, ooxmlText] = await Promise.all([
      mammoth.extractRawText({ arrayBuffer: buffer }).catch(() => ({ value: "" })),
      extractDocxTextFromArrayBuffer(buffer).catch(() => ""),
    ]);
    const rawText = normalizeText(mammothResult.value);
    return ooxmlText.length > rawText.length ? ooxmlText : rawText;
  }
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    const document = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
    }
    return normalizeText(pages.join("\n"));
  }
  throw new Error("只支持带文字层的 PDF 或 DOCX 简历");
}

export async function extractDocxTextFromArrayBuffer(buffer: ArrayBuffer) {
  const archive = await JSZip.loadAsync(buffer);
  const documentXml = await archive.file("word/document.xml")?.async("text");
  if (!documentXml) return "";
  const xml = new DOMParser().parseFromString(documentXml, "application/xml");
  if (xml.querySelector("parsererror")) return "";
  const paragraphs = [...xml.getElementsByTagNameNS(WORD_NAMESPACE, "p")]
    .filter((paragraph) => paragraph.getElementsByTagNameNS(WORD_NAMESPACE, "p").length === 0)
    .map((paragraph) => [...paragraph.getElementsByTagNameNS(WORD_NAMESPACE, "t")].map((node) => node.textContent ?? "").join("").trim())
    .filter(Boolean);
  return normalizeText(paragraphs.join("\n"));
}

function normalizeText(value: string) {
  return value
    .replace(/\u0000/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function findName(lines: string[]) {
  const ignored = /简历|resume|求职|个人信息|联系方式/i;
  for (const line of lines.slice(0, 10)) {
    const candidate = line.trim().replace(/[|｜].*$/, "").trim();
    if (ignored.test(candidate)) continue;
    if (/^[\u3400-\u9fff·]{2,8}$/.test(candidate)) return candidate;
    if (/^[A-Za-z][A-Za-z .'-]{2,40}$/.test(candidate) && candidate.split(/\s+/).length <= 5) return candidate;
  }
  return "";
}

function normalizeMonth(value: string) {
  const match = value.match(/((?:19|20)\d{2})(?:[./年-](\d{1,2}))?/);
  if (!match) return "";
  return match[2] ? `${match[1]}-${match[2].padStart(2, "0")}` : match[1];
}

function dateRange(line: string) {
  const range = line.match(DATE_RANGE);
  if (range) {
    const start = range[1] ?? "";
    const end = range[2] ?? "";
    return {
    startDate: normalizeMonth(start),
    endDate: /至今|现在|present/i.test(end) ? "" : normalizeMonth(end),
    current: /至今|现在|present/i.test(end),
    raw: range[0],
    };
  }
  const single = line.match(SINGLE_DATE);
  return single ? { startDate: normalizeMonth(single[0]), endDate: "", current: false, raw: single[0] } : null;
}

function pipeParts(line: string, dates: ReturnType<typeof dateRange>) {
  const withoutDate = dates ? line.replace(dates.raw, "") : line;
  return withoutDate.split(/[|｜]/).map((part) => part.trim()).filter(Boolean);
}

function sectionLines(lines: string[], section: ResumeSection) {
  const start = lines.findIndex((line) => SECTION_HEADINGS[section].test(line));
  if (start < 0) return [];
  const endOffset = lines.slice(start + 1).findIndex((line) => Object.values(SECTION_HEADINGS).some((pattern) => pattern.test(line)));
  return lines.slice(start + 1, endOffset < 0 ? lines.length : start + 1 + endOffset);
}

function recordBlocks(lines: string[], minimumPipeParts = 2) {
  const headerIndexes = lines.flatMap((line, index) => {
    const dates = dateRange(line);
    return dates && pipeParts(line, dates).length >= minimumPipeParts ? [index] : [];
  });
  return headerIndexes.map((headerIndex, index) => ({
    header: lines[headerIndex] ?? "",
    body: lines.slice(headerIndex + 1, headerIndexes[index + 1] ?? lines.length),
  }));
}

function stripBullet(value: string) {
  return value.replace(/^[·•●▪◦*-]+\s*/, "").trim();
}

function educationDegree(descriptor: string) {
  if (/博士|ph\.?d/i.test(descriptor)) return "博士研究生";
  if (/硕士|master/i.test(descriptor)) return "硕士研究生";
  if (/本科|学士|bachelor/i.test(descriptor)) return "本科";
  if (/大专|专科|associate/i.test(descriptor)) return "大专";
  return "";
}

function academicDegree(descriptor: string) {
  if (/博士|ph\.?d/i.test(descriptor)) return "博士";
  if (/硕士|master/i.test(descriptor)) return "硕士";
  if (/学士|bachelor/i.test(descriptor)) return "学士";
  return "";
}

function extractEducation(lines: string[], stamp: number): AutofillProfileV1["education"] {
  return recordBlocks(sectionLines(lines, "education")).slice(0, 6).map(({ header, body }, index) => {
    const dates = dateRange(header);
    const parts = pipeParts(header, dates);
    const descriptor = parts[1] ?? "";
    const degree = educationDegree(descriptor);
    const academic = academicDegree(descriptor);
    const field = descriptor.replace(/(博士研究生|硕士研究生|本科|博士|硕士|学士|大专|专科|ph\.?d|master|bachelor).*$/i, "").trim();
    const gpaLine = body.find((line) => /gpa/i.test(line)) ?? "";
    return {
      id: `education-import-${index}-${stamp}`,
      school: parts[0] ?? "",
      degree,
      academicDegree: academic,
      educationType: "",
      field,
      startDate: dates?.startDate ?? "",
      endDate: dates?.endDate ?? "",
      gpa: gpaLine.match(/G\s*P\s*A\s*[:：]?\s*([\d.]+(?:\s*\/\s*[\d.]+)?)/i)?.[1]?.replace(/\s/g, "") ?? "",
      ranking: "",
      overseasSchool: "",
      details: body.filter((line) => !/gpa/i.test(line)).map(stripBullet).filter(Boolean),
    };
  });
}

function extractExperiences(lines: string[], stamp: number): AutofillProfileV1["experiences"] {
  return recordBlocks(sectionLines(lines, "experience")).slice(0, 12).map(({ header, body }, index) => {
    const dates = dateRange(header);
    const parts = pipeParts(header, dates);
    const role = parts[1] ?? "";
    return {
      id: `experience-import-${index}-${stamp}`,
      type: /实习|intern/i.test(role) ? "internship" : "employment",
      organization: parts[0] ?? "",
      role,
      location: parts[2] ?? "",
      startDate: dates?.startDate ?? "",
      endDate: dates?.endDate ?? "",
      current: dates?.current ?? false,
      bullets: body.map(stripBullet).filter(Boolean),
    };
  });
}

function projectType(header: string, descriptor: string): AutofillProfileV1["projects"][number]["type"] {
  if (/课程/.test(header)) return "course";
  if (/毕业论文|毕业设计/.test(header)) return "graduation";
  if (/研究|科研/.test(header)) return "research";
  if (/竞赛|比赛/.test(header)) return "competition";
  if (/个人|独立/.test(descriptor)) return "personal";
  return "course";
}

function extractProjects(lines: string[], stamp: number): AutofillProfileV1["projects"] {
  return recordBlocks(sectionLines(lines, "project")).slice(0, 12).map(({ header, body }, index) => {
    const dates = dateRange(header);
    const parts = pipeParts(header, dates);
    const descriptor = parts.slice(1).join("｜");
    return {
      id: `project-import-${index}-${stamp}`,
      type: projectType(header, descriptor),
      name: parts[0] ?? "",
      role: descriptor,
      startDate: dates?.startDate ?? "",
      endDate: dates?.endDate ?? "",
      description: "",
      bullets: body.map(stripBullet).filter(Boolean),
      link: "",
    };
  });
}

function extractSummary(lines: string[]) {
  return sectionLines(lines, "summary").map(stripBullet).filter(Boolean).join("\n");
}

function extractSkills(lines: string[], stamp: number) {
  const skills: AutofillProfileV1["skills"] = [];
  const certificates: AutofillProfileV1["certificates"] = [];
  const languages: AutofillProfileV1["languages"] = [];
  sectionLines(lines, "skills").forEach((line, index) => {
    const match = line.match(/^([^:：]{2,24})[:：](.+)$/);
    if (!match) return;
    const label = (match[1] ?? "").trim();
    const content = (match[2] ?? "").trim();
    if (/资格|证书/.test(label)) {
      content.split(/[；;]/).map((item) => item.trim()).filter(Boolean).forEach((name, certificateIndex) => certificates.push({
        id: `certificate-import-${index}-${certificateIndex}-${stamp}`,
        name,
        issuer: "",
        date: "",
        credentialId: "",
      }));
      return;
    }
    if (/语言/.test(label)) {
      const languagePart = content.split(/[；;]/)[0] ?? "";
      const languagePattern = /(普通话|粤语|英语|英文|法语|德语|西班牙语|日语|韩语|俄语)(?:[（(]([^）)]+)[）)])?/g;
      for (const languageMatch of languagePart.matchAll(languagePattern)) languages.push({
        id: `language-import-${languages.length}-${stamp}`,
        name: languageMatch[1] === "英文" ? "英语" : (languageMatch[1] ?? ""),
        level: languageMatch[2] ?? "",
        certificates: [],
      });
      return;
    }
    skills.push({ id: `skill-import-${index}-${stamp}`, name: label, level: content });
  });
  return { skills, certificates, languages };
}

export function applyLocalResumeDraft(profile: AutofillProfileV1, text: string, resume: ResumeAsset) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? "";
  const phone = text.match(/(?<!\d)(?:\+?86[- ()]?)?1[3-9]\d(?:[- ]?\d){8}(?!\d)/)?.[0]?.replace(/\D/g, "") ?? "";
  const name = findName(lines);
  const stamp = Date.now();
  const education = extractEducation(lines, stamp);
  const experiences = extractExperiences(lines, stamp);
  const projects = extractProjects(lines, stamp);
  const summary = extractSummary(lines);
  const parsedSkills = extractSkills(lines, stamp);
  const uncertainItems = new Set(profile.uncertainItems);
  uncertainItems.add("已按简历章节在本机提取资料；请逐项核对经历类型、日期、专业、技能和项目边界后再保存。");
  if (!name) uncertainItems.add("未能可靠识别姓名。");
  if (!email) uncertainItems.add("未能可靠识别邮箱。");
  if (!phone) uncertainItems.add("未能可靠识别手机号。");
  if (sectionLines(lines, "experience").length > 0 && experiences.length === 0) uncertainItems.add("检测到工作/实习章节，但未能可靠拆分经历。");
  if (sectionLines(lines, "project").length > 0 && projects.length === 0) uncertainItems.add("检测到项目章节，但未能可靠拆分项目。");

  return {
    ...profile,
    profileVersion: profile.profileVersion + 1,
    personal: { ...profile.personal, fullName: profile.personal.fullName || name, summary: profile.personal.summary || summary },
    contact: {
      ...profile.contact,
      email: profile.contact.email || email,
      phone: profile.contact.phone || phone.replace(/^86/, ""),
    },
    education: profile.education.length > 0 ? profile.education : education,
    experiences: profile.experiences.length > 0 ? profile.experiences : experiences,
    projects: profile.projects.length > 0 ? profile.projects : projects,
    skills: profile.skills.length > 0 ? profile.skills : parsedSkills.skills,
    certificates: profile.certificates.length > 0 ? profile.certificates : parsedSkills.certificates,
    languages: profile.languages.length > 0 ? profile.languages : parsedSkills.languages,
    resumes: [...profile.resumes, { ...resume, extractedText: text }],
    uncertainItems: [...uncertainItems],
    updatedAt: new Date().toISOString(),
  } satisfies AutofillProfileV1;
}
