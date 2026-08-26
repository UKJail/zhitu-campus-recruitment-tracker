import type { AutofillProfileV1, SiteRule } from "../types/profile";

export type FieldKind =
  | "input"
  | "textarea"
  | "select"
  | "radio"
  | "checkbox"
  | "combobox"
  | "contenteditable";

export type FieldDescriptor = {
  token: string;
  kind: FieldKind;
  label: string;
  signals: string[];
  section: string;
  options: string[];
  currentValue: string;
  required: boolean;
  inputType?: string;
  readOnly?: boolean;
  componentHint?: string;
};

export type MatchConfidence = "high" | "medium" | "skipped";

export type FieldMatch = {
  token: string;
  label: string;
  profilePath: string | null;
  value: string;
  confidence: MatchConfidence;
  reviewRequired: boolean;
  reason: string;
};

export type ProfileCandidate = {
  path: string;
  semantic: string;
  value: string;
  aliases: string[];
  category: string;
  reviewRequired?: boolean;
  repeatIndex?: number;
};

const BLOCKED_PATTERN = /(身份证|证件号|护照|银行卡|银行账户|账号密码|登录密码|密码|验证码|captcha|家庭成员|亲属|家属|父亲|母亲|配偶|紧急联系人|健康|残障|disability|签名|signature|同意|协议|隐私政策|terms)/i;
const REVIEW_PATTERN = /(性别|出生|生日|政治面貌|gpa|绩点|排名|薪资|工资|到岗|入职时间|工作许可|sponsor|国籍|民族)/i;

const ALIASES = {
  fullName: ["姓名", "名字", "中文姓名", "英文姓名", "name", "full name", "candidate name"],
  givenName: ["名", "名字", "given name", "first name"],
  familyName: ["姓", "姓氏", "family name", "last name", "surname"],
  gender: ["性别", "gender", "sex"],
  birthDate: ["出生日期", "出生年月", "生日", "date of birth", "birth date"],
  politicalStatus: ["政治面貌", "政治身份"],
  nationality: ["国籍", "nationality"],
  nativePlace: ["籍贯", "户籍地", "生源地", "native place", "hometown"],
  email: ["邮箱", "电子邮箱", "电子邮件", "email", "e-mail"],
  phone: ["手机号", "手机号码", "联系电话", "电话", "移动电话", "phone", "mobile", "telephone"],
  countryCode: ["区号", "国家代码", "country code", "dial code"],
  country: ["国家", "所在国家", "country"],
  province: ["省份", "所在省", "省", "province", "state"],
  city: ["城市", "所在城市", "市", "city"],
  address: ["联系地址", "现居地址", "通讯地址", "地址", "address"],
  postalCode: ["邮编", "邮政编码", "postal code", "zip code"],
  wechat: ["微信", "微信号", "wechat"],
  school: ["学校", "院校", "毕业院校", "学校名称", "school", "university", "college"],
  educationLevel: ["学历", "学历层次", "最高学历", "education level", "qualification"],
  academicDegree: ["学位", "学位名称", "academic degree", "degree awarded"],
  educationType: ["学历类型", "学习形式", "培养方式", "全日制", "education type", "study mode"],
  field: ["专业", "所学专业", "专业名称", "major", "field of study"],
  graduationYear: ["毕业年份", "毕业年度", "毕业年", "graduation year"],
  startDate: ["开始时间", "起始时间", "入学时间", "入职时间", "start date", "from"],
  endDate: ["结束时间", "毕业时间", "离职时间", "end date", "graduation date", "to"],
  gpa: ["gpa", "绩点", "平均绩点"],
  ranking: ["排名", "专业排名", "班级排名", "rank", "ranking"],
  overseasEducation: ["是否海外院校毕业", "是否海外院校", "是否境外院校毕业", "是否境外院校", "海外院校毕业", "海外学历", "境外学历", "overseas school", "overseas education"],
  majorCourses: ["主修课程", "主要课程", "核心课程", "major courses", "relevant coursework"],
  organization: ["公司", "单位", "组织", "实习单位", "公司名称", "企业", "企业名称", "organization", "company", "employer"],
  role: ["职位", "岗位", "职务", "角色", "position", "job title", "role"],
  location: ["地点", "工作地点", "项目地点", "location"],
  description: ["描述", "工作内容", "工作描述", "项目描述", "职责", "description", "responsibilities"],
  projectName: ["项目名称", "课题名称", "project name"],
  awardName: ["奖项名称", "获奖名称", "荣誉名称", "award"],
  certificateName: ["证书名称", "资格证书", "certificate"],
  language: ["语言", "外语", "language"],
  languageLevel: ["语言水平", "熟练程度", "language level", "proficiency"],
  skill: ["技能", "技能名称", "专业技能", "skill"],
  linkedin: ["linkedin", "领英"],
  github: ["github", "代码仓库"],
  portfolio: ["个人网站", "作品集", "portfolio", "website"],
  targetRole: ["期望职位", "求职岗位", "目标岗位", "target role", "desired position"],
  targetLocation: ["期望地点", "意向城市", "工作城市", "工作意向地", "意向工作地", "desired location"],
  expectedSalary: ["期望薪资", "期望薪酬", "期望月薪", "薪资要求", "expected salary"],
  availableDate: ["到岗时间", "可入职日期", "available date", "start availability"],
  workAuthorization: ["工作许可", "合法工作", "work authorization", "authorized to work"],
  sponsorship: ["签证担保", "需要担保", "sponsorship", "visa sponsorship"],
} as const;

export function normalizeLabel(value: string) {
  return value
    .toLowerCase()
    .replace(/[\s\u00a0:：*＊()（）\[\]【】._-]+/g, "")
    .replace(/(必填|required)/gi, "")
    .trim();
}

export function isUnnamedFieldLabel(value: string) {
  return /^(未命名字段|未识别字段|unnamedfield|unknownfield)$/.test(normalizeLabel(value));
}

function addCandidate(
  list: ProfileCandidate[],
  path: string,
  semantic: keyof typeof ALIASES,
  value: string | string[],
  category: string,
  options: { reviewRequired?: boolean; repeatIndex?: number } = {},
) {
  const joined = Array.isArray(value) ? value.filter(Boolean).join("\n") : value;
  if (!joined.trim()) return;
  const aliases = [...ALIASES[semantic]] as string[];
  if (["skill", "language"].includes(category)) aliases.push(joined);
  list.push({ path, semantic, value: joined, aliases, category, ...options });
}

function educationRank(item: AutofillProfileV1["education"][number]) {
  const value = normalizeLabel(`${item.degree} ${item.academicDegree}`);
  if (/(博士|phd|doctor)/i.test(value)) return 5;
  if (/(硕士|研究生|master)/i.test(value)) return 4;
  if (/(本科|学士|bachelor)/i.test(value)) return 3;
  if (/(大专|专科|associate)/i.test(value)) return 2;
  return 1;
}

export function createProfileCandidates(profile: AutofillProfileV1) {
  const list: ProfileCandidate[] = [];
  addCandidate(list, "personal.fullName", "fullName", profile.personal.fullName, "personal");
  addCandidate(list, "personal.givenName", "givenName", profile.personal.givenName, "personal");
  addCandidate(list, "personal.familyName", "familyName", profile.personal.familyName, "personal");
  addCandidate(list, "personal.gender", "gender", profile.personal.gender, "personal", { reviewRequired: true });
  addCandidate(list, "personal.birthDate", "birthDate", profile.personal.birthDate, "personal", { reviewRequired: true });
  addCandidate(list, "personal.politicalStatus", "politicalStatus", profile.personal.politicalStatus, "personal", { reviewRequired: true });
  addCandidate(list, "personal.nationality", "nationality", profile.personal.nationality, "personal", { reviewRequired: true });
  addCandidate(list, "personal.nativePlace", "nativePlace", profile.personal.nativePlace, "personal", { reviewRequired: true });
  addCandidate(list, "contact.email", "email", profile.contact.email, "contact");
  addCandidate(list, "contact.phone", "phone", profile.contact.phone, "contact");
  addCandidate(list, "contact.countryCode", "countryCode", profile.contact.countryCode, "contact");
  addCandidate(list, "contact.country", "country", profile.contact.country, "contact");
  addCandidate(list, "contact.province", "province", profile.contact.province, "contact");
  addCandidate(list, "contact.city", "city", profile.contact.city, "contact");
  addCandidate(list, "contact.address", "address", profile.contact.address, "contact");
  addCandidate(list, "contact.postalCode", "postalCode", profile.contact.postalCode, "contact");
  addCandidate(list, "contact.wechat", "wechat", profile.contact.wechat, "contact");

  profile.education
    .map((item, sourceIndex) => ({ item, sourceIndex }))
    .sort((left, right) => educationRank(right.item) - educationRank(left.item) || right.item.endDate.localeCompare(left.item.endDate))
    .forEach(({ item, sourceIndex }, repeatIndex) => {
    addCandidate(list, `education.${sourceIndex}.school`, "school", item.school, "education", { repeatIndex });
    addCandidate(list, `education.${sourceIndex}.degree`, "educationLevel", item.degree, "education", { repeatIndex });
    addCandidate(list, `education.${sourceIndex}.academicDegree`, "academicDegree", item.academicDegree, "education", { repeatIndex });
    addCandidate(list, `education.${sourceIndex}.educationType`, "educationType", item.educationType, "education", { repeatIndex });
    addCandidate(list, `education.${sourceIndex}.field`, "field", item.field, "education", { repeatIndex });
    addCandidate(list, `education.${sourceIndex}.graduationYear`, "graduationYear", item.endDate.match(/(?:19|20)\d{2}/)?.[0] ?? "", "education", { repeatIndex });
    addCandidate(list, `education.${sourceIndex}.startDate`, "startDate", item.startDate, "education", { repeatIndex });
    addCandidate(list, `education.${sourceIndex}.endDate`, "endDate", item.endDate, "education", { repeatIndex });
    addCandidate(list, `education.${sourceIndex}.gpa`, "gpa", item.gpa, "education", { reviewRequired: true, repeatIndex });
    addCandidate(list, `education.${sourceIndex}.ranking`, "ranking", item.ranking, "education", { reviewRequired: true, repeatIndex });
    addCandidate(list, `education.${sourceIndex}.overseasSchool`, "overseasEducation", item.overseasSchool, "education", { repeatIndex });
    addCandidate(list, `education.${sourceIndex}.details`, "majorCourses", item.details, "education", { repeatIndex });
  });
  profile.experiences.forEach((item, index) => {
    addCandidate(list, `experiences.${index}.organization`, "organization", item.organization, "experience", { repeatIndex: index });
    addCandidate(list, `experiences.${index}.role`, "role", item.role, "experience", { repeatIndex: index });
    addCandidate(list, `experiences.${index}.location`, "location", item.location, "experience", { repeatIndex: index });
    addCandidate(list, `experiences.${index}.startDate`, "startDate", item.startDate, "experience", { repeatIndex: index });
    addCandidate(list, `experiences.${index}.endDate`, "endDate", item.endDate, "experience", { repeatIndex: index });
    addCandidate(list, `experiences.${index}.bullets`, "description", item.bullets, "experience", { repeatIndex: index });
  });
  profile.projects.forEach((item, index) => {
    addCandidate(list, `projects.${index}.name`, "projectName", item.name, "project", { repeatIndex: index });
    addCandidate(list, `projects.${index}.role`, "role", item.role, "project", { repeatIndex: index });
    addCandidate(list, `projects.${index}.startDate`, "startDate", item.startDate, "project", { repeatIndex: index });
    addCandidate(list, `projects.${index}.endDate`, "endDate", item.endDate, "project", { repeatIndex: index });
    addCandidate(list, `projects.${index}.description`, "description", item.description || item.bullets, "project", { repeatIndex: index });
  });
  profile.awards.forEach((item, index) => addCandidate(list, `awards.${index}.name`, "awardName", item.name, "award", { repeatIndex: index }));
  profile.certificates.forEach((item, index) => addCandidate(list, `certificates.${index}.name`, "certificateName", item.name, "certificate", { repeatIndex: index }));
  profile.skills.forEach((item, index) => addCandidate(list, `skills.${index}.name`, "skill", [item.name, item.level].filter(Boolean).join("："), "skill", { repeatIndex: index }));
  profile.languages.forEach((item, index) => {
    addCandidate(list, `languages.${index}.name`, "language", item.name, "language", { repeatIndex: index });
    addCandidate(list, `languages.${index}.level`, "languageLevel", item.level, "language", { repeatIndex: index });
  });
  addCandidate(list, "links.linkedin", "linkedin", profile.links.linkedin, "links");
  addCandidate(list, "links.github", "github", profile.links.github, "links");
  addCandidate(list, "links.portfolio", "portfolio", profile.links.portfolio, "links");
  profile.jobPreferences.targetRoles.forEach((value, index) => addCandidate(list, `jobPreferences.targetRoles.${index}`, "targetRole", value, "preferences", { repeatIndex: index }));
  profile.jobPreferences.locations.forEach((value, index) => addCandidate(list, `jobPreferences.locations.${index}`, "targetLocation", value, "preferences", { repeatIndex: index }));
  addCandidate(list, "jobPreferences.expectedSalary", "expectedSalary", profile.jobPreferences.expectedSalary, "preferences", { reviewRequired: true });
  addCandidate(list, "jobPreferences.availableDate", "availableDate", profile.jobPreferences.availableDate, "preferences", { reviewRequired: true });
  addCandidate(list, "jobPreferences.workAuthorization", "workAuthorization", profile.jobPreferences.workAuthorization, "preferences", { reviewRequired: true });
  addCandidate(list, "jobPreferences.sponsorship", "sponsorship", profile.jobPreferences.sponsorship, "preferences", { reviewRequired: true });

  profile.answerBank.forEach((item, index) => {
    if (!item.answer.trim()) return;
    list.push({
      path: `answerBank.${index}.answer`,
      semantic: `answer-${index}`,
      value: item.answer,
      aliases: [item.question],
      category: "answer",
      reviewRequired: item.reviewRequired,
    });
  });
  return list;
}

function bigrams(value: string) {
  const normalized = normalizeLabel(value);
  if (normalized.length < 2) return new Set([normalized]);
  return new Set(Array.from({ length: normalized.length - 1 }, (_, index) => normalized.slice(index, index + 2)));
}

function similarity(left: string, right: string) {
  const a = bigrams(left);
  const b = bigrams(right);
  let intersection = 0;
  a.forEach((item) => { if (b.has(item)) intersection += 1; });
  return (2 * intersection) / Math.max(1, a.size + b.size);
}

function categoryBoost(section: string, category: string) {
  const normalized = normalizeLabel(section);
  const patterns: Record<string, RegExp> = {
    education: /(教育|学历|学校|education)/,
    experience: /(工作|实习|经历|experience|employment)/,
    project: /(项目|课题|project)/,
    award: /(获奖|荣誉|award)/,
    certificate: /(证书|资质|certificate)/,
    language: /(语言|外语|language)/,
  };
  return patterns[category]?.test(normalized) ? 6 : 0;
}

function candidateScore(field: FieldDescriptor, candidate: ProfileCandidate) {
  const signals = [field.label, ...field.signals].map(normalizeLabel).filter(Boolean);
  let best = 0;
  candidate.aliases.forEach((alias) => {
    const normalizedAlias = normalizeLabel(alias);
    signals.forEach((signal) => {
      if (signal === normalizedAlias) best = Math.max(best, 100);
      else if (normalizedAlias.length >= 2 && signal.includes(normalizedAlias)) best = Math.max(best, 90);
      else if (signal.length >= 2 && normalizedAlias.includes(signal)) best = Math.max(best, 78);
      else {
        const fuzzy = similarity(signal, normalizedAlias);
        if (fuzzy >= 0.72) best = Math.max(best, 68 + fuzzy * 10);
      }
    });
  });
  return best + categoryBoost(field.section, candidate.category);
}

function displayValue(value: string, field: FieldDescriptor) {
  const genderMap: Record<string, string[]> = {
    male: ["男", "male", "m"],
    female: ["女", "female", "f"],
    other: ["其他", "other"],
    "prefer-not-to-say": ["不愿透露", "prefer not to say"],
  };
  const booleanMap: Record<string, string[]> = {
    yes: ["是", "yes", "true", "1"],
    no: ["否", "no", "false", "0"],
  };
  const variants = genderMap[value] ?? booleanMap[value] ?? [value];
  if (field.options.length > 0) {
    const option = field.options.find((item) => variants.some((variant) => {
      const a = normalizeLabel(item);
      const b = normalizeLabel(variant);
      return a === b || a.includes(b) || b.includes(a);
    }));
    if (option) return option;
  }
  return variants[0] ?? value;
}

function siteRuleMatch(field: FieldDescriptor, origin: string, rules: SiteRule[]) {
  if (isUnnamedFieldLabel(field.label)) return undefined;
  const label = normalizeLabel(field.label);
  return rules.find((rule) => {
    if (rule.origin !== origin) return false;
    const pattern = normalizeLabel(rule.labelPattern);
    return label === pattern || label.includes(pattern);
  });
}

export function matchFields(
  fields: FieldDescriptor[],
  profile: AutofillProfileV1,
  rules: SiteRule[],
  origin: string,
) {
  const candidates = createProfileCandidates(profile);
  const semanticUse = new Map<string, number>();

  return fields.map<FieldMatch>((field) => {
    const combinedLabel = `${field.label} ${field.section}`;
    if (BLOCKED_PATTERN.test(combinedLabel)) {
      return { token: field.token, label: field.label, profilePath: null, value: "", confidence: "skipped", reviewRequired: true, reason: "敏感或需本人操作的字段" };
    }
    if (field.currentValue.trim()) {
      const rankedExisting = candidates
        .map((candidate) => ({ candidate, score: candidateScore(field, candidate) }))
        .filter((item) => item.score >= 65)
        .sort((left, right) => right.score - left.score);
      const semantic = rankedExisting[0]?.candidate.semantic;
      if (semantic) {
        const desiredIndex = semanticUse.get(semantic) ?? 0;
        const sameSemantic = rankedExisting.filter((item) => item.candidate.semantic === semantic);
        const selected = sameSemantic.find((item) => item.candidate.repeatIndex === desiredIndex) ?? rankedExisting[0];
        if (selected?.candidate.repeatIndex !== undefined) semanticUse.set(semantic, desiredIndex + 1);
      }
      return { token: field.token, label: field.label, profilePath: null, value: "", confidence: "skipped", reviewRequired: false, reason: "网页中已有内容，未覆盖" };
    }
    if (isUnnamedFieldLabel(field.label)) {
      return { token: field.token, label: field.label, profilePath: null, value: "", confidence: "skipped", reviewRequired: false, reason: "网页没有提供可识别的字段名称，已跳过" };
    }
    if (field.kind === "radio" && /^(是|否|yes|no)$/i.test(normalizeLabel(field.label))) {
      return { token: field.token, label: field.label, profilePath: null, value: "", confidence: "skipped", reviewRequired: false, reason: "未识别到这组是/否题的题目，为避免误填已跳过" };
    }

    const rule = siteRuleMatch(field, origin, rules);
    if (rule) {
      const candidate = candidates.find((item) => item.path === rule.profilePath);
      if (candidate) {
        return {
          token: field.token,
          label: field.label,
          profilePath: candidate.path,
          value: displayValue(candidate.value, field),
          confidence: "high",
          reviewRequired: Boolean(candidate.reviewRequired || REVIEW_PATTERN.test(combinedLabel)),
          reason: "使用了你为此网站保存的规则",
        };
      }
    }

    const ranked = candidates
      .map((candidate) => ({ candidate, score: candidateScore(field, candidate) }))
      .filter((item) => item.score >= 65)
      .sort((left, right) => right.score - left.score);
    if (ranked.length === 0) {
      return { token: field.token, label: field.label, profilePath: null, value: "", confidence: "skipped", reviewRequired: false, reason: "资料库中没有可靠匹配" };
    }

    const topSemantic = ranked[0]!.candidate.semantic;
    const desiredIndex = semanticUse.get(topSemantic) ?? 0;
    const sameSemantic = ranked.filter((item) => item.candidate.semantic === topSemantic);
    const selected = sameSemantic.find((item) => item.candidate.repeatIndex === desiredIndex) ?? ranked[0]!;
    if (selected.candidate.repeatIndex !== undefined) semanticUse.set(topSemantic, desiredIndex + 1);
    const high = selected.score >= 85;
    const convertedMonthToDate = /^\d{4}-\d{2}$/.test(selected.candidate.value)
      && /(calendar|date|picker)/i.test(field.componentHint ?? "");
    return {
      token: field.token,
      label: field.label,
      profilePath: selected.candidate.path,
      value: displayValue(selected.candidate.value, field),
      confidence: high ? "high" : "medium",
      reviewRequired: Boolean(selected.candidate.reviewRequired || REVIEW_PATTERN.test(combinedLabel) || !high || convertedMonthToDate),
      reason: convertedMonthToDate ? "资料只有年月，将按月初或月末填写，请复核具体日期" : high ? "字段名称明确匹配" : "相似字段，将一键填写并标黄复核",
    };
  });
}
