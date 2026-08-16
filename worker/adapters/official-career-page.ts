import { contentHash, jobFingerprint, normalizeUrl, stripHtml } from "../normalize.js";
import { isMainlandOrHongKongLocation, normalizeLocationToChinese } from "../location.js";
import type { CompanyCareerSource } from "../company-sources.js";
import type { CollectionResult, JobSourceAdapter } from "../types.js";

type JsonObject = Record<string, unknown>;

function objectValue(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function textValue(value: unknown): string {
  if (value == null || typeof value === "boolean") return "";
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  if (Array.isArray(value)) return value.map(textValue).filter(Boolean).join("、");
  const object = objectValue(value);
  const nested = object.name ?? object.value ?? object.valueReference;
  return nested === value ? "" : textValue(nested);
}

function jobPostingNodes(value: unknown): JsonObject[] {
  if (Array.isArray(value)) return value.flatMap(jobPostingNodes);
  const object = objectValue(value);
  const nested = Array.isArray(object["@graph"]) ? jobPostingNodes(object["@graph"]) : [];
  const types = Array.isArray(object["@type"]) ? object["@type"] : [object["@type"]];
  return types.some((type) => type === "JobPosting") ? [object, ...nested] : nested;
}

function jsonLdBlocks(html: string) {
  const blocks: unknown[] = [];
  const scripts = html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const match of scripts) {
    try { blocks.push(JSON.parse(match[1].trim())); } catch { /* 页面中的无效 JSON-LD 不影响其他岗位 */ }
  }
  return blocks.flatMap(jobPostingNodes);
}

function addressText(value: unknown): string {
  if (Array.isArray(value)) return value.map(addressText).filter(Boolean).join("、");
  const location = objectValue(value);
  const address = objectValue(location.address || location.jobLocation);
  return [address.addressLocality, address.addressRegion, address.addressCountry, location.name]
    .map(textValue).filter(Boolean).join(", ");
}

function salaryText(value: unknown) {
  const salary = objectValue(value);
  const amount = objectValue(salary.value);
  const min = textValue(amount.minValue);
  const max = textValue(amount.maxValue);
  const unit = textValue(amount.unitText);
  const currency = textValue(salary.currency);
  return [min && max ? `${min}-${max}` : min || max, currency, unit].filter(Boolean).join(" ") || null;
}

function tagsFor(title: string, employmentType: string) {
  const tags: string[] = [];
  if (/(?:校招|校园招聘|应届|毕业生|graduate|campus)/i.test(title)) tags.push("校招", "应届生");
  if (/(?:实习|intern(?:ship)?)/i.test(`${title} ${employmentType}`)) tags.push("实习");
  return [...new Set(tags)];
}

export class OfficialCareerPageAdapter implements JobSourceAdapter {
  readonly sourceName: string;
  readonly sourceKind = "official_career_page";
  readonly adapterName: string;

  constructor(private readonly source: CompanyCareerSource, private readonly fetcher: typeof fetch = fetch) {
    this.sourceName = `${source.companyZh}｜官方招聘`;
    this.adapterName = `official:${source.ordinal}:${new URL(source.careerUrl).hostname}`;
  }

  async collect(): Promise<CollectionResult> {
    const response = await this.fetcher(this.source.careerUrl, {
      headers: { Accept: "text/html,application/xhtml+xml", "User-Agent": "ZhiTuTracker/0.2 (+official-career-index; public-pages-only)" },
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
    });
    if ([401, 403, 412, 429].includes(response.status)) {
      return { jobs: [], restricted: true, reason: `官网返回 HTTP ${response.status}；未绕过访问限制` };
    }
    if (!response.ok) throw new Error(`官网返回 HTTP ${response.status}`);
    const html = await response.text();
    const nodes = jsonLdBlocks(html);
    const jobs = nodes.flatMap((node, index) => {
      const title = textValue(node.title || node.name);
      const rawLocation = [addressText(node.jobLocation), textValue(node.applicantLocationRequirements), textValue(node.jobLocationType)].filter(Boolean).join("、");
      if (!title || !isMainlandOrHongKongLocation(rawLocation)) return [];
      const location = normalizeLocationToChinese(rawLocation);
      const description = stripHtml(textValue(node.description)) || `${title} · ${location}`;
      const organization = objectValue(node.hiringOrganization);
      const company = textValue(organization.name) || this.source.companyZh;
      const applyUrl = textValue(node.url) || response.url || this.source.careerUrl;
      let normalizedUrl: string;
      try { normalizedUrl = normalizeUrl(new URL(applyUrl, response.url || this.source.careerUrl).toString()); } catch { normalizedUrl = normalizeUrl(this.source.careerUrl); }
      const identifier = textValue(objectValue(node.identifier).value || node.identifier);
      const employmentType = textValue(node.employmentType);
      const tags = tagsFor(title, employmentType);
      return [{
        externalId: identifier || `${this.source.ordinal}:${contentHash(`${normalizedUrl}|${title}|${location}`).slice(0, 24)}`,
        company,
        title,
        location,
        salaryText: salaryText(node.baseSalary),
        experience: textValue(node.experienceRequirements) || (tags.includes("应届生") ? "应届生" : null),
        education: textValue(node.educationRequirements) || null,
        description,
        publishedAt: textValue(node.datePosted) || null,
        expiresAt: textValue(node.validThrough) || null,
        applyUrl: normalizedUrl,
        normalizedUrl,
        fingerprint: jobFingerprint(company, title, location),
        rawData: {
          adapter: this.adapterName,
          catalog: "official-company-careers-v1",
          catalogOrdinal: this.source.ordinal,
          sourceUrl: this.source.careerUrl,
          companyZh: this.source.companyZh,
          companyEn: this.source.companyEn,
          market: this.source.market,
          ownership: this.source.ownership,
          industry: this.source.industry,
          entryType: this.source.entryType,
          employmentType: employmentType || null,
          tags,
          contentHash: contentHash(description),
          jsonLdIndex: index,
        },
      }];
    });
    return { jobs };
  }
}

export const officialCareerParsing = { jsonLdBlocks, addressText };
