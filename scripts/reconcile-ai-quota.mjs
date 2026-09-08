import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

const HELP = "Usage: node scripts/reconcile-ai-quota.mjs --run --expected-project-ref <20-letter-ref> [--limit 50]\nLoad server credentials through a protected environment file, never CLI arguments.";

export function readOptions(args) {
  if (args.length === 0 || args.includes("--help")) return null;
  let run = false;
  let projectRef = "";
  let limit = 50;
  const seen = new Set();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (seen.has(arg)) throw new Error("INVALID_OPTIONS");
    seen.add(arg);
    if (arg === "--run") run = true;
    else if (arg === "--expected-project-ref") projectRef = args[++i] ?? "";
    else if (arg === "--limit") {
      const value = args[++i] ?? "";
      if (!/^\d+$/.test(value)) throw new Error("INVALID_BATCH_LIMIT");
      limit = Number(value);
    } else throw new Error("UNKNOWN_OPTION");
  }
  if (!run || !/^[a-z]{20}$/.test(projectRef)) throw new Error("EXPLICIT_TARGET_REQUIRED");
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("INVALID_BATCH_LIMIT");
  return { projectRef, limit };
}

export function verifiedConfiguration(env, projectRef) {
  if (!/^[a-z]{20}$/.test(projectRef)) throw new Error("EXPLICIT_TARGET_REQUIRED");
  const expected = `https://${projectRef}.supabase.co`;
  const configuredUrls = [env.SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_URL].filter(Boolean);
  if (configuredUrls.length === 0) throw new Error("SERVER_CONFIGURATION_MISSING");
  for (const value of configuredUrls) {
    let url;
    try { url = new URL(value); } catch { throw new Error("PROJECT_TARGET_MISMATCH"); }
    if (url.origin !== expected || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
      throw new Error("PROJECT_TARGET_MISMATCH");
    }
  }
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SERVER_CONFIGURATION_MISSING");
  if (!key.startsWith("sb_secret_")) {
    let payload;
    try { payload = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString("utf8")); }
    catch { throw new Error("SERVER_CREDENTIAL_REQUIRED"); }
    if (payload.role !== "service_role" || (payload.ref && payload.ref !== projectRef)) {
      throw new Error("SERVER_CREDENTIAL_REQUIRED");
    }
  }
  return { url: expected, key };
}

function validatedCounts(value, limit) {
  const names = ["completed", "released", "examined", "skippedLocked"];
  if (!value || !names.every(name => Number.isInteger(value[name]) && value[name] >= 0 && value[name] <= limit)
    || value.completed + value.released + value.skippedLocked > value.examined) {
    throw new Error("INVALID_RECONCILIATION_RESPONSE");
  }
  return Object.fromEntries(names.map(name => [name, value[name]]));
}

/** Exactly one bounded call; the operating-system timer handles subsequent work. */
export async function runReconciliation(options, env, factory = createClient) {
  const config = verifiedConfiguration(env, options.projectRef);
  const admin = factory(config.url, config.key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await admin.rpc("reconcile_ai_usage_server", { p_limit: options.limit })
    .abortSignal(AbortSignal.timeout(20_000));
  if (error) throw new Error("RECONCILIATION_RPC_FAILED");
  return validatedCounts(data, options.limit);
}

export async function main(args = process.argv.slice(2), env = process.env) {
  const options = readOptions(args);
  if (!options) { console.log(HELP); return; }
  const counts = await runReconciliation(options, env);
  console.log(JSON.stringify({ event: "ai_quota_reconciliation", at: new Date().toISOString(), ...counts }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    // Never print raw provider errors: they may contain request URLs or headers.
    const safeCodes = new Set(["INVALID_OPTIONS", "INVALID_BATCH_LIMIT", "UNKNOWN_OPTION", "EXPLICIT_TARGET_REQUIRED",
      "SERVER_CONFIGURATION_MISSING", "PROJECT_TARGET_MISMATCH", "SERVER_CREDENTIAL_REQUIRED",
      "RECONCILIATION_RPC_FAILED", "INVALID_RECONCILIATION_RESPONSE"]);
    const code = error instanceof Error && safeCodes.has(error.message) ? error.message : "RECONCILIATION_FAILED";
    console.error(JSON.stringify({ event: "ai_quota_reconciliation_failed", code, at: new Date().toISOString() }));
    process.exitCode = 1;
  });
}
