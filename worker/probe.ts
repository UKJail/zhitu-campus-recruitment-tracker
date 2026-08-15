import { GreenhouseAdapter } from "./adapters/greenhouse.js";

async function main() {
  const greaterChina = /China|Shanghai|Shenzhen|Beijing|Hong Kong/i;
  const boards = [["ideo", "IDEO"], ["adyen", "Adyen"], ["applovin", "AppLovin"], ["xendit", "Xendit"], ["eclipsetrading", "Eclipse Trading"], ["alphagrepsecurities", "AlphaGrep Securities"], ["rockbund", "Rock Bund Capital"]] as const;
  const results = await Promise.all(boards.map(async ([token, company]) => {
    const result = await new GreenhouseAdapter(token, company, greaterChina).collect();
    return { token, company, restricted: Boolean(result.restricted), reason: result.reason, count: result.jobs.length, jobs: result.jobs.map((job) => ({ title: job.title, location: job.location, applyUrl: job.applyUrl })) };
  }));
  console.log(JSON.stringify(results, null, 2));
}

void main();
