import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const defaultSource = "C:\\Users\\k'k\\WorkBuddy\\zhitu-career-jobs\\latest\\offerstar-to-zhitu.json";
const argumentsList = process.argv.slice(2);
const dryRun = argumentsList.includes("--dry-run");
const sourceArgument = argumentsList.find((argument) => !argument.startsWith("--"));
const sourcePath = path.resolve(sourceArgument || defaultSource);
const outputDirectory = path.resolve("imports", "workbuddy", "offerstar");
const outputPath = path.join(outputDirectory, "offerstar-jobs.json");
const reportPath = path.join(outputDirectory, "sync-report.json");
const temporaryPath = `${outputPath}.tmp`;

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function firstText(...values) {
  for (const value of values) {
    const normalized = text(value);
    if (normalized) return normalized;
  }
  return "";
}

function validHttpUrl(value) {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function businessFingerprint(company, title, location) {
  return [company, title, location]
    .map((part) => part.trim().toLocaleLowerCase("zh-CN").replace(/\s+/g, ""))
    .join("|");
}

function isWechatUrl(value) {
  try {
    const hostname = new URL(value).hostname.toLocaleLowerCase("en-US");
    return hostname === "mp.weixin.qq.com";
  } catch {
    return false;
  }
}

function inferBatchFromTitle(title) {
  return title.match(/20\d{2}\s*届/)?.[0]?.replace(/\s+/g, "") || "";
}

function fieldCoverage(records) {
  const displayFields = [
    ["公司名称", "company"],
    ["标题", "title"],
    ["批次", "offerstarType"],
    ["更新时间", "postDate"],
    ["招聘岗位", "position"],
    ["工作地点", "location"],
    ["行业", "industry"],
    ["招聘类型", "recruitmentType"],
    ["截止时间", "deadline"],
    ["操作链接", "applyUrl"],
  ];
  return displayFields.map(([label, key]) => {
    const filled = records.filter((record) => text(record[key])).length;
    return {
      label,
      key,
      filled,
      total: records.length,
      coverage: records.length ? Number((filled / records.length).toFixed(4)) : 0,
    };
  });
}

const raw = JSON.parse(await readFile(sourcePath, "utf8"));
if (!Array.isArray(raw)) throw new Error("OfferStar 交付文件必须是 JSON 数组");

const records = [];
const seenExternalIds = new Set();
const rejected = [];
let duplicates = 0;

for (const [index, item] of raw.entries()) {
  const externalId = text(item?.externalId);
  const company = text(item?.company);
  const title = text(item?.title);
  const location = text(item?.location) || "地点请查看原文";
  const applyUrl = text(item?.applyUrl);
  if (!externalId || !company || !title || !validHttpUrl(applyUrl)) {
    rejected.push({ index, externalId, company, title, reason: "缺少必要字段或投递链接无效" });
    continue;
  }
  if (seenExternalIds.has(externalId)) {
    duplicates += 1;
    continue;
  }
  seenExternalIds.add(externalId);
  const rawData = item?.rawData && typeof item.rawData === "object" ? item.rawData : {};
  const recruitmentType = firstText(item?.recruitmentType, rawData.zhituRecruitmentType) || "其他";
  const industry = firstText(item?.industry, rawData.industry) || "其他";
  const offerstarType = firstText(item?.offerstarType, rawData.offerstarType, inferBatchFromTitle(title));
  records.push({
    externalId,
    company,
    title,
    location,
    experience: text(item?.experience) || "要求请查看原文",
    applyUrl,
    normalizedUrl: text(item?.normalizedUrl) || applyUrl,
    businessFingerprint: businessFingerprint(company, title, location),
    recruitmentType,
    offerstarType,
    position: firstText(item?.position, rawData.position),
    industry,
    category: firstText(item?.category, rawData.category),
    postDate: firstText(item?.postDate, rawData.postDate),
    deadline: firstText(item?.deadline, rawData.deadline),
    applyUrlIsWechat: typeof item?.applyUrlIsWechat === "boolean"
      ? item.applyUrlIsWechat
      : typeof rawData.applyUrlIsWechat === "boolean"
        ? rawData.applyUrlIsWechat
        : isWechatUrl(applyUrl),
  });
}

if (records.length < 1) throw new Error("OfferStar 没有可导入岗位");
if (records.length < raw.length * 0.9) throw new Error(`有效岗位比例异常：${records.length}/${raw.length}`);

const report = {
  source: "offerstar",
  sourcePath,
  syncedAt: new Date().toISOString(),
  dryRun,
  received: raw.length,
  accepted: records.length,
  duplicates,
  rejected: rejected.length,
  wechatApplyUrls: records.filter((item) => item.applyUrlIsWechat).length,
  byRecruitmentType: Object.fromEntries(Object.entries(records.reduce((counts, item) => {
    counts[item.recruitmentType] = (counts[item.recruitmentType] || 0) + 1;
    return counts;
  }, {})).sort(([a], [b]) => a.localeCompare(b, "zh-CN"))),
  fieldCoverage: fieldCoverage(records),
  displayContractWarnings: fieldCoverage(records)
    .filter((item) => item.filled < item.total)
    .map((item) => `${item.label}(${item.key}) 覆盖 ${item.filled}/${item.total}`),
  rejectedSamples: rejected.slice(0, 20),
};

if (!dryRun) {
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(temporaryPath, JSON.stringify({ generatedAt: report.syncedAt, records }), "utf8");
  await rm(outputPath, { force: true });
  await rename(temporaryPath, outputPath);
  await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
}
console.log(JSON.stringify(report, null, 2));
