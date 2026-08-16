import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { join } from "node:path";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function fail(message) {
  console.error(`\n[职途启动检查] ${message}\n`);
  process.exit(1);
}

if (!url || !key) fail("缺少 Supabase 公共配置，请检查项目根目录的 .env.local。");

try {
  const response = await fetch(`${url}/auth/v1/health`, {
    headers: { apikey: key },
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) fail(`Supabase Auth 返回 HTTP ${response.status}，本地服务未启动。`);
} catch {
  fail("无法连接 Supabase Auth。请在可联网的 Windows PowerShell 中运行 npm.cmd run dev；如果由 Codex 启动，请允许网络访问。");
}

const childEnvironment = { ...process.env };
if (!childEnvironment.AUTH_RECOVERY_GRANT_SECRET) {
  childEnvironment.AUTH_RECOVERY_GRANT_SECRET = randomBytes(32).toString("hex");
  console.log("[职途启动检查] 已为本次本地运行生成临时密码重置签名密钥。");
}

console.log("[职途启动检查] Supabase Auth 连接正常，正在启动 http://localhost:3000");
const nextBin = join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
const child = spawn(process.execPath, [nextBin, "dev"], {
  env: childEnvironment,
  stdio: "inherit",
});

child.on("error", (error) => fail(`Next.js 启动失败：${error.message}`));
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
