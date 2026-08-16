import { OfficialCareerPageAdapter } from "./adapters/official-career-page.js";
import { TencentCareersAdapter } from "./adapters/tencent-careers.js";
import { loadCompanyCareerSources } from "./company-sources.js";

async function main() {
  const sources = await loadCompanyCareerSources();
  const requested = new Set((process.argv[2] || process.env.COMPANY_SOURCE_ORDINALS || "8,9,22,23,70,71,72,73,74,75,76,77,79,80,100,101")
    .split(",").map(Number).filter(Number.isFinite));
  const selected = sources.filter((source) => requested.has(source.ordinal));
  const results = [];
  for (const source of selected) {
    try {
      const adapter = source.ordinal === 70 ? new TencentCareersAdapter(source) : new OfficialCareerPageAdapter(source);
      const result = await adapter.collect();
      let diagnostics: Record<string, unknown> | undefined;
      if (result.jobs.length === 0 && !result.restricted) {
        const page = await fetch(source.careerUrl, { redirect: "follow", headers: { "User-Agent": "ZhiTuTracker/0.2 (+official-career-index; public-pages-only)" }, signal: AbortSignal.timeout(20_000) });
        const html = await page.text();
        diagnostics = {
          finalUrl: page.url,
          contentType: page.headers.get("content-type"),
          htmlBytes: html.length,
          iframes: [...html.matchAll(/<iframe\b[^>]*src=["']([^"']+)/gi)].map((match) => match[1]).slice(0, 5),
          scripts: [...html.matchAll(/<script\b[^>]*src=["']([^"']+)/gi)].map((match) => match[1]).slice(-8),
          apiHints: [...new Set([...html.matchAll(/["']([^"']*(?:api|position|job|recruit)[^"']*)["']/gi)].map((match) => match[1]).filter((value) => value.length < 240))].slice(0, 12),
          jobLinks: [...html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']*(?:job|position)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)]
            .map((match) => ({ href: match[1], text: match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() })).filter((item) => item.text).slice(0, 12),
          tokenCounts: Object.fromEntries(["PositionId", "RecruitPostName", "jobId", "postId", "/jobs/"].map((token) => [token, html.split(token).length - 1])),
          jobIdContext: (() => { const at = html.indexOf("jobId"); return at >= 0 ? html.slice(Math.max(0, at - 500), at + 1500) : null; })(),
          stateScriptStart: (() => { const at = html.indexOf("listDetailData"); const start = at >= 0 ? html.lastIndexOf("<script", at) : -1; return start >= 0 ? html.slice(start, Math.min(html.length, start + 600)) : null; })(),
        };
      }
      results.push({
        ordinal: source.ordinal,
        company: source.companyZh,
        url: source.careerUrl,
        restricted: Boolean(result.restricted),
        reason: result.reason || null,
        count: result.jobs.length,
        jobs: result.jobs.slice(0, 5).map((job) => ({ title: job.title, location: job.location, applyUrl: job.applyUrl })),
        diagnostics,
      });
    } catch (error) {
      results.push({ ordinal: source.ordinal, company: source.companyZh, url: source.careerUrl, count: 0, error: error instanceof Error ? error.message : "unknown error" });
    }
  }
  console.log(JSON.stringify({ checked: results.length, totalCatalogSources: sources.length, results }, null, 2));
}

void main();
