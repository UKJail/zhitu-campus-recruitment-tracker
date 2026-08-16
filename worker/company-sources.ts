import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const sourceSchema = z.object({
  ordinal: z.number().int().positive(),
  companyZh: z.string().min(1),
  companyEn: z.string(),
  market: z.string().min(1),
  ownership: z.string().min(1),
  industry: z.string().min(1),
  hiringRegions: z.string().min(1),
  careerUrl: z.string().url(),
  entryType: z.string().min(1),
  verifiedOn: z.string().min(1),
  note: z.string(),
});

const catalogSchema = z.object({
  catalog: z.literal("official-company-careers-v1"),
  count: z.number().int().positive(),
  sources: z.array(sourceSchema),
});

export type CompanyCareerSource = z.infer<typeof sourceSchema>;

export async function loadCompanyCareerSources() {
  const catalogPath = path.resolve(process.cwd(), "worker/data/company-career-sources.json");
  const parsed = catalogSchema.parse(JSON.parse(await readFile(catalogPath, "utf8")));
  if (parsed.count !== parsed.sources.length) {
    throw new Error(`官网来源目录数量不一致：声明 ${parsed.count}，实际 ${parsed.sources.length}`);
  }
  return parsed.sources;
}
