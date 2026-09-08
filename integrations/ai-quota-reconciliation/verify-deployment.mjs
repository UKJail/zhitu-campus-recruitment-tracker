import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const SERVICE = "zhitu-ai-quota-reconciliation.service";
export const TIMER = "zhitu-ai-quota-reconciliation.timer";
const ROOT = "/opt/zhitu-tracker";
const PRIVATE = "/etc/zhitu-ai-quota-reconciliation";
const HELP = "Read-only Linux verification: node integrations/ai-quota-reconciliation/verify-deployment.mjs --since <UTC ISO timestamp>\nInspects unit metadata, credential file permissions (not contents), and sanitized journal counters. Never starts or installs a service.";

export function readOptions(args, now = Date.now()) {
  if (args.length === 0 || (args.length === 1 && args[0] === "--help")) return null;
  if (args.length !== 2 || args[0] !== "--since") throw new Error("INVALID_OPTIONS");
  const since = args[1];
  const time = Date.parse(since);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(since)
    || !Number.isFinite(time) || time > now || now - time > 86_400_000
    || new Date(time).toISOString() !== since.replace(/(?<!\.\d{3})Z$/, ".000Z")) {
    throw new Error("RECENT_UTC_TIMESTAMP_REQUIRED");
  }
  return { since, time };
}

export function parseProperties(text) {
  return Object.fromEntries(text.trim().split(/\r?\n/).filter(Boolean).map(line => {
    const split = line.indexOf("=");
    if (split < 1) throw new Error("INVALID_SYSTEMD_RESPONSE");
    return [line.slice(0, split), line.slice(split + 1)];
  }));
}

export function verifyPrivateMetadata(directory, file) {
  if (!directory.isDirectory() || directory.isSymbolicLink() || directory.uid !== 0 || directory.gid !== 0
    || (directory.mode & 0o7777) !== 0o700 || !file.isFile() || file.isSymbolicLink()
    || file.uid !== 0 || file.gid !== 0 || (file.mode & 0o7777) !== 0o600 || file.nlink !== 1) {
    throw new Error("PRIVATE_FILE_PERMISSIONS_UNSAFE");
  }
}

export function verifyProperties(service, timer) {
  const expected = {
    Type: "oneshot", User: "zhitu-quota", Group: "zhitu-quota", WorkingDirectory: ROOT,
    FragmentPath: `/etc/systemd/system/${SERVICE}`, DropInPaths: "", NeedDaemonReload: "no",
    Result: "success", ExecMainStatus: "0", ActiveState: "inactive", SubState: "dead",
    NoNewPrivileges: "yes", PrivateTmp: "yes", ProtectSystem: "strict", ProtectHome: "yes",
    MemoryMax: "201326592", TasksMax: "32", CPUQuotaPerSecUSec: "250ms",
  };
  for (const [key, value] of Object.entries(expected)) {
    if (service[key] !== value) throw new Error("SERVICE_STATE_OR_LIMITS_MISMATCH");
  }
  for (const [key, value] of Object.entries({
    FragmentPath: `/etc/systemd/system/${TIMER}`, DropInPaths: "", NeedDaemonReload: "no",
    ActiveState: "active", SubState: "waiting", UnitFileState: "enabled", Unit: SERVICE,
  })) {
    if (timer[key] !== value) throw new Error("TIMER_NOT_READY");
  }
}

export function summarizeJournal(text, since, now = Date.now()) {
  const runs = new Map();
  let failedRuns = 0;
  let unexpectedApplicationLogs = 0;
  for (const line of text.split(/\r?\n/).filter(Boolean)) {
    let entry;
    try { entry = JSON.parse(line); } catch { throw new Error("INVALID_JOURNAL_RESPONSE"); }
    if (entry._SYSTEMD_UNIT !== SERVICE || typeof entry.MESSAGE !== "string") continue;
    const recordedTime = Number(entry.__REALTIME_TIMESTAMP) / 1000;
    if (!Number.isFinite(recordedTime) || recordedTime < since || recordedTime > now) continue;
    let message;
    try { message = JSON.parse(entry.MESSAGE); } catch { unexpectedApplicationLogs++; continue; }
    const eventTime = Date.parse(message?.at);
    if (!message || !Number.isFinite(eventTime) || eventTime < since || eventTime > now) {
      unexpectedApplicationLogs++; continue;
    }
    if (message.event === "ai_quota_reconciliation_failed") { failedRuns++; continue; }
    if (message.event !== "ai_quota_reconciliation") { unexpectedApplicationLogs++; continue; }
    const names = ["completed", "released", "examined", "skippedLocked"];
    if (!names.every(key => Number.isInteger(message[key]) && message[key] >= 0 && message[key] <= 50)
      || message.completed + message.released + message.skippedLocked > message.examined
      || !/^[a-f0-9]{32}$/.test(entry._SYSTEMD_INVOCATION_ID ?? "")
      || !/^[a-f0-9]{32}$/.test(entry._BOOT_ID ?? "")) {
      throw new Error("INVALID_RECONCILIATION_LOG");
    }
    // Never return raw journal entries, IDs, or unexpected application properties.
    runs.set(entry._SYSTEMD_INVOCATION_ID, {
      time: eventTime, boot: entry._BOOT_ID,
      counts: Object.fromEntries(names.map(key => [key, message[key]])),
    });
  }
  const ordered = [...runs.values()].sort((a, b) => a.time - b.time);
  const spacedRuns = ordered.some((run, index) => index > 0 && run.time - ordered[index - 1].time >= 55_000);
  return {
    successfulRuns: ordered.length, failedRuns, unexpectedApplicationLogs, spacedRuns,
    hostBootRecoveryObserved: new Set(ordered.map(run => run.boot)).size >= 2,
    firstCompletedAt: ordered.length ? new Date(ordered[0].time).toISOString() : null,
    lastCompletedAt: ordered.length ? new Date(ordered.at(-1).time).toISOString() : null,
    lastCounts: ordered.at(-1)?.counts ?? null,
    passed: ordered.length >= 2 && failedRuns === 0 && unexpectedApplicationLogs === 0 && spacedRuns,
  };
}

function command(file, args) {
  // Fixed executables and argument arrays only; stderr is never echoed.
  try { return execFileSync(file, args, { encoding: "utf8", timeout: 10_000, maxBuffer: 1_048_576, stdio: ["ignore", "pipe", "pipe"] }); }
  catch { throw new Error("HOST_INSPECTION_FAILED"); }
}

export function inspectHost(options) {
  if (process.platform !== "linux" || process.getuid?.() !== 0) throw new Error("ROOT_READONLY_INSPECTION_REQUIRED");
  const version = command("/usr/bin/systemctl", ["--version"]);
  if (Number(version.match(/^systemd (\d+)/)?.[1]) < 239 || !/^systemd \d+/.test(version)) throw new Error("SYSTEMD_239_REQUIRED");
  const uid = command("/usr/bin/id", ["-u", "zhitu-quota"]).trim();
  const gid = command("/usr/bin/id", ["-g", "zhitu-quota"]).trim();
  const groups = command("/usr/bin/id", ["-G", "zhitu-quota"]).trim().split(/\s+/);
  if (!/^\d+$/.test(uid) || Number(uid) === 0 || !/^\d+$/.test(gid) || Number(gid) === 0
    || groups.length !== 1 || groups[0] !== gid) throw new Error("SERVICE_USER_NOT_ISOLATED");
  if (realpathSync(ROOT) !== ROOT) throw new Error("DEPLOY_DIRECTORY_MISMATCH");
  for (const path of [ROOT, `${ROOT}/scripts`, `${ROOT}/scripts/reconcile-ai-quota.mjs`]) {
    const info = lstatSync(path);
    if (info.isSymbolicLink() || info.uid !== 0 || (info.mode & 0o022) !== 0) throw new Error("DEPLOY_CODE_PERMISSIONS_UNSAFE");
  }
  verifyPrivateMetadata(lstatSync(PRIVATE), lstatSync(`${PRIVATE}/service.env`));
  for (const unit of [SERVICE, TIMER]) {
    const installed = `/etc/systemd/system/${unit}`;
    const info = lstatSync(installed);
    if (!info.isFile() || info.isSymbolicLink() || info.uid !== 0 || (info.mode & 0o022) !== 0) throw new Error("UNIT_PERMISSIONS_UNSAFE");
    const expected = readFileSync(new URL(unit, import.meta.url), "utf8").replaceAll("\r\n", "\n");
    if (readFileSync(installed, "utf8").replaceAll("\r\n", "\n") !== expected) throw new Error("INSTALLED_UNIT_DIFFERS");
  }
  const propertyNames = ["Type", "User", "Group", "WorkingDirectory", "FragmentPath", "DropInPaths", "NeedDaemonReload",
    "Result", "ExecMainStatus", "ActiveState", "SubState", "NoNewPrivileges", "PrivateTmp", "ProtectSystem", "ProtectHome",
    "MemoryMax", "TasksMax", "CPUQuotaPerSecUSec"];
  const service = parseProperties(command("/usr/bin/systemctl", ["show", SERVICE, ...propertyNames.map(name => `--property=${name}`)]));
  const timer = parseProperties(command("/usr/bin/systemctl", ["show", TIMER, ...["FragmentPath", "DropInPaths", "NeedDaemonReload", "ActiveState", "SubState", "UnitFileState", "Unit"].map(name => `--property=${name}`)]));
  verifyProperties(service, timer);
  const journal = command("/usr/bin/journalctl", ["--unit", SERVICE, "--since", options.since, "--lines", "200", "--output=json", "--no-pager", "--quiet"]);
  return summarizeJournal(journal, options.time);
}

export function main(args = process.argv.slice(2)) {
  const options = readOptions(args);
  if (!options) { console.log(HELP); return; }
  const evidence = inspectHost(options);
  console.log(JSON.stringify({ event: "ai_quota_timer_verification", ...evidence }));
  if (!evidence.passed) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); } catch (error) {
    // Even filesystem and command errors stay fixed and do not expose raw paths or logs.
    const safeCodes = new Set(["INVALID_OPTIONS", "RECENT_UTC_TIMESTAMP_REQUIRED", "INVALID_SYSTEMD_RESPONSE",
      "PRIVATE_FILE_PERMISSIONS_UNSAFE", "SERVICE_STATE_OR_LIMITS_MISMATCH", "TIMER_NOT_READY",
      "INVALID_JOURNAL_RESPONSE", "INVALID_RECONCILIATION_LOG", "HOST_INSPECTION_FAILED",
      "ROOT_READONLY_INSPECTION_REQUIRED", "SYSTEMD_239_REQUIRED", "SERVICE_USER_NOT_ISOLATED",
      "DEPLOY_DIRECTORY_MISMATCH", "DEPLOY_CODE_PERMISSIONS_UNSAFE", "UNIT_PERMISSIONS_UNSAFE", "INSTALLED_UNIT_DIFFERS"]);
    const code = error instanceof Error && safeCodes.has(error.message) ? error.message : "VERIFY_CHECKS_FAILED";
    console.error(JSON.stringify({ event: "ai_quota_timer_verification_failed", code }));
    process.exitCode = 1;
  }
}
