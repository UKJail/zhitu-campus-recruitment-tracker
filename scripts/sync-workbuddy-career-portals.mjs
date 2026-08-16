import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const defaultSourcePath = "C:\\Users\\k'k\\WorkBuddy\\zhitu-career-jobs\\latest\\career-portals.json";
const sourcePath = path.resolve(process.argv[2] || defaultSourcePath);
const outputPath = path.join(projectRoot, "src", "data", "career-portals.json");

const source = JSON.parse(await readFile(sourcePath, "utf8"));
if (!Array.isArray(source.portals)) {
  throw new Error("WorkBuddy 企业入口文件缺少 portals 数组");
}

const portals = source.portals.map((item) => {
  const key = String(item.companyKey || "").trim();
  const name = String(item.companyName || "").trim();
  const industry = String(item.industry || "").trim();
  const url = String(item.officialCareerUrl || "").trim();
  if (!key || !name || !industry || !/^https?:\/\//i.test(url)) {
    throw new Error(`企业入口字段无效：${name || key || "未知记录"}`);
  }
  return { key, name, industry, url };
});

const duplicateKeys = portals.filter((item, index) => portals.findIndex((candidate) => candidate.key === item.key) !== index);
if (duplicateKeys.length > 0) {
  throw new Error(`企业入口 key 重复：${duplicateKeys.slice(0, 5).map((item) => item.key).join(", ")}`);
}

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify({ generatedAt: source.generatedAt, count: portals.length, portals }, null, 2)}\n`, "utf8");
console.log(`已生成 ${portals.length} 条企业校招入口：${outputPath}`);
