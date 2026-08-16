import { OfficialCareerPageAdapter } from "./adapters/official-career-page.js";
import { TencentCareersAdapter } from "./adapters/tencent-careers.js";
import { BaiduCareersAdapter } from "./adapters/baidu-careers.js";
import { loadCompanyCareerSources } from "./company-sources.js";
import { JobRepository } from "./repository.js";
import { runAdapters } from "./runner.js";

const TWO_HOURS = 2 * 60 * 60 * 1000;

function intervalMs() {
  const configured = Number(process.env.WORKER_INTERVAL_MS || TWO_HOURS);
  return Number.isFinite(configured) && configured >= 5 * 60 * 1000 ? configured : TWO_HOURS;
}

async function adapters() {
  const sources = await loadCompanyCareerSources();
  const ordinals = new Set((process.env.COMPANY_SOURCE_ORDINALS || "").split(",").map(Number).filter(Number.isFinite));
  const selected = ordinals.size ? sources.filter((source) => ordinals.has(source.ordinal)) : sources;
  const limit = Number(process.env.COMPANY_SOURCE_LIMIT || selected.length);
  return selected.slice(0, Number.isFinite(limit) && limit > 0 ? limit : selected.length)
    .map((source) => source.ordinal === 70
      ? new TencentCareersAdapter(source)
      : source.ordinal === 76
        ? new BaiduCareersAdapter(source)
        : new OfficialCareerPageAdapter(source));
}

async function collect() {
  const summary = await runAdapters(await adapters(), JobRepository.fromEnvironment());
  console.log(JSON.stringify({ event: "collection_finished", at: new Date().toISOString(), summary }));
}

async function main() {
  await collect();
  if (!process.argv.includes("--once")) {
    setInterval(() => { void collect(); }, intervalMs());
  }
}

void main();
