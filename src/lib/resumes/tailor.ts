import type { ResumeSuggestion, StructuredResume, TailoredResume } from "@/lib/ai/provider";

type Evidence = { text: string; sourceIds: string[] };

function compact(values: Array<string | null | undefined>) {
  return values.filter((value): value is string => Boolean(value?.trim())).join("｜");
}

function normalize(value: string) {
  return value.toLocaleLowerCase("zh-CN").replace(/[\s｜|·:：,，。；;（）()【】\[\]—–-]/g, "");
}

export function buildTailoredResumeFromAccepted(input: {
  structured: StructuredResume;
  acceptedSuggestions: ResumeSuggestion[];
  targetCompany: string;
  targetRole: string;
}): TailoredResume {
  const used = new Set<number>();
  const acceptedEvidence = input.acceptedSuggestions.map((suggestion, index) => ({
    index,
    original: normalize(suggestion.original),
    evidence: { text: suggestion.revised, sourceIds: [`accepted.${index}`] } satisfies Evidence,
    section: suggestion.section,
  }));
  const evidence = (text: string, sourceId: string): Evidence => {
    const normalizedText = normalize(text);
    const replacement = acceptedEvidence.find((item) => !used.has(item.index) && (item.original.includes(normalizedText) || normalizedText.includes(item.original)));
    if (replacement) {
      used.add(replacement.index);
      return replacement.evidence;
    }
    return { text, sourceIds: [sourceId] };
  };

  const education = input.structured.education.map((item, index) => ({
    heading: evidence(compact([item.school, item.degree, item.field]), `education.${index}.heading`),
    subheading: null,
    meta: compact([item.startDate, item.endDate, item.gpa]) ? evidence(compact([item.startDate, item.endDate, item.gpa]), `education.${index}.meta`) : null,
    bullets: item.details.map((text, detailIndex) => evidence(text, `education.${index}.details.${detailIndex}`)),
  }));
  const experiences = input.structured.experiences.map((item, index) => ({
    heading: evidence(compact([item.organization, item.role]), `experiences.${index}.heading`),
    subheading: null,
    meta: compact([item.location, item.startDate, item.endDate]) ? evidence(compact([item.location, item.startDate, item.endDate]), `experiences.${index}.meta`) : null,
    bullets: item.bullets.map((text, bulletIndex) => evidence(text, `experiences.${index}.bullets.${bulletIndex}`)),
  }));
  const projects = input.structured.projects.map((item, index) => ({
    heading: evidence(compact([item.name, item.role]), `projects.${index}.heading`),
    subheading: null,
    meta: compact([item.startDate, item.endDate]) ? evidence(compact([item.startDate, item.endDate]), `projects.${index}.meta`) : null,
    bullets: item.bullets.map((text, bulletIndex) => evidence(text, `projects.${index}.bullets.${bulletIndex}`)),
  }));
  const skills = input.structured.skills.map((group, index) => ({
    category: group.category,
    items: group.items.map((text, itemIndex) => evidence(text, `skills.${index}.${itemIndex}`)),
  }));
  const languages = input.structured.languages.map((item, index) => evidence(compact([item.language, item.level]), `languages.${index}`));

  for (const item of acceptedEvidence.filter((candidate) => !used.has(candidate.index))) {
    if (item.section.includes("教育") && education[0]) education[0].bullets.push(item.evidence);
    else if (item.section.includes("工作") && experiences[0]) experiences[0].bullets.push(item.evidence);
    else if (item.section.includes("项目") && projects[0]) projects[0].bullets.push(item.evidence);
    else if (skills[0]) skills[0].items.push(item.evidence);
    else if (projects[0]) projects[0].bullets.push(item.evidence);
    used.add(item.index);
  }

  return {
    target: { company: input.targetCompany, role: input.targetRole },
    basics: {
      name: input.structured.basics.name,
      email: input.structured.basics.email,
      phones: input.structured.basics.phones,
      location: input.structured.basics.location,
    },
    summary: input.structured.basics.summary ? evidence(input.structured.basics.summary, "basics.summary") : null,
    education,
    experiences,
    projects,
    skills,
    languages,
  };
}
