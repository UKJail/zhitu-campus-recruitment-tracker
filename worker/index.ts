import { GreenhouseAdapter } from "./adapters/greenhouse.js";
import { RestrictedSourceAdapter } from "./adapters/restricted.js";
import { JobRepository } from "./repository.js";
import { runAdapters } from "./runner.js";

const TWO_HOURS = 2 * 60 * 60 * 1000;

function intervalMs() {
  const configured = Number(process.env.WORKER_INTERVAL_MS || TWO_HOURS);
  return Number.isFinite(configured) && configured >= 5 * 60 * 1000 ? configured : TWO_HOURS;
}

function adapters() {
  const greaterChina = /China|Shanghai|Shenzhen|Beijing|Hong Kong/i;
  return [
    new GreenhouseAdapter("ideo", "IDEO", greaterChina),
    new GreenhouseAdapter("adyen", "Adyen", greaterChina),
    new GreenhouseAdapter("applovin", "AppLovin", greaterChina),
    new GreenhouseAdapter("xendit", "Xendit", greaterChina),
    new GreenhouseAdapter("eclipsetrading", "Eclipse Trading", greaterChina),
    new GreenhouseAdapter("alphagrepsecurities", "AlphaGrep Securities", greaterChina),
    new GreenhouseAdapter("rockbund", "Rock Bund Capital", greaterChina),
    new RestrictedSourceAdapter("猎聘", "公开页面存在访问限制；MVP 不登录、不处理验证码"),
    new RestrictedSourceAdapter("智联招聘", "公开页面存在访问限制；MVP 不登录、不处理验证码"),
    new RestrictedSourceAdapter("前程无忧", "公开页面存在访问限制；MVP 不登录、不处理验证码"),
  ];
}

async function collect() {
  const summary = await runAdapters(adapters(), JobRepository.fromEnvironment());
  console.log(JSON.stringify({ event: "collection_finished", at: new Date().toISOString(), summary }));
}

async function main() {
  await collect();
  if (!process.argv.includes("--once")) {
    setInterval(() => { void collect(); }, intervalMs());
  }
}

void main();
