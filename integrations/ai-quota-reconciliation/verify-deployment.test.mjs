// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { journalArguments, parseProperties, readOptions, SERVICE, summarizeJournal, TIMER, verifyPrivateMetadata, verifyProperties } from "./verify-deployment.mjs";

const time = Date.parse("2026-09-08T12:00:00.000Z");
const now = time + 300_000;
const metadata = (mode, type = "file", extras = {}) => ({
  uid: 0, gid: 0, mode, nlink: 1, isDirectory: () => type === "dir", isFile: () => type === "file", isSymbolicLink: () => false, ...extras,
});
function entry(offset = 1_000, id = "1".repeat(32), extras = {}) {
  return JSON.stringify({
    _SYSTEMD_UNIT: SERVICE, _SYSTEMD_INVOCATION_ID: id, _BOOT_ID: "a".repeat(32),
    __REALTIME_TIMESTAMP: String((time + offset) * 1000),
    MESSAGE: JSON.stringify({ event: "ai_quota_reconciliation", at: new Date(time + offset).toISOString(), completed: 0, released: 0, examined: 0, skippedLocked: 0 }),
    ...extras,
  });
}
const service = {
  Type: "oneshot", User: "zhitu-quota", Group: "zhitu-quota", WorkingDirectory: "/opt/zhitu-tracker",
  FragmentPath: `/etc/systemd/system/${SERVICE}`, DropInPaths: "", NeedDaemonReload: "no", Result: "success",
  ExecMainStatus: "0", ActiveState: "inactive", SubState: "dead", NoNewPrivileges: "yes", PrivateTmp: "yes",
  ProtectSystem: "strict", ProtectHome: "yes", MemoryMax: "201326592", TasksMax: "32", CPUQuotaPerSecUSec: "250ms",
};
const timer = { FragmentPath: `/etc/systemd/system/${TIMER}`, DropInPaths: "", NeedDaemonReload: "no", ActiveState: "active", SubState: "waiting", UnitFileState: "enabled", Unit: SERVICE };

describe("quota maintenance installation evidence", () => {
  it("requires a recent, explicit UTC verification window", () => {
    expect(readOptions([])).toBeNull();
    expect(readOptions(["--help"])).toBeNull();
    expect(readOptions(["--since", "2026-09-08T12:00:00.000Z"], now)).toEqual({ since: "2026-09-08T12:00:00.000Z", time });
    for (const since of ["yesterday", "2026-09-08", "2026-09-09T12:00:00Z", "2026-09-06T12:00:00Z", "2026-02-31T12:00:00Z"]) {
      expect(() => readOptions(["--since", since], now)).toThrow("RECENT_UTC_TIMESTAMP_REQUIRED");
    }
    expect(() => readOptions(["--since", "now", "--start"])).toThrow("INVALID_OPTIONS");
  });
  it("uses systemd 239-compatible epoch seconds instead of ISO T/Z without losing milliseconds", () => {
    const original = "2026-09-08T13:01:33.000Z";
    const options = readOptions(["--since", original], Date.parse(original) + 60_000);
    expect(journalArguments(options)).toEqual(["--unit", SERVICE, "--since", "@1788872493.000", "--lines", "200", "--output=json", "--no-pager", "--quiet"]);
    expect(journalArguments({ ...options, time: options.time + 123 })[3]).toBe("@1788872493.123");
    expect(journalArguments({ ...options, time: options.time + 1 })[3]).toBe("@1788872493.001");
    expect(journalArguments({ ...options, time: options.time + 999 })[3]).toBe("@1788872493.999");
    for (const time of [NaN, Infinity, -1, 1.5]) expect(() => journalArguments({ time })).toThrow("RECENT_UTC_TIMESTAMP_REQUIRED");
    const source = readFileSync(new URL("verify-deployment.mjs", import.meta.url), "utf8");
    expect(source).toContain('command("/usr/bin/journalctl", journalArguments(options))');
  });
  it("checks credential metadata without needing content", () => {
    expect(() => verifyPrivateMetadata(metadata(0o700, "dir"), metadata(0o600))).not.toThrow();
    for (const file of [metadata(0o644), metadata(0o600, "file", { uid: 10 }), metadata(0o600, "file", { nlink: 2 }), metadata(0o600, "file", { isSymbolicLink: () => true })]) {
      expect(() => verifyPrivateMetadata(metadata(0o700, "dir"), file)).toThrow("PRIVATE_FILE_PERMISSIONS_UNSAFE");
    }
    expect(() => verifyPrivateMetadata(metadata(0o755, "dir"), metadata(0o600))).toThrow();
  });
  it("checks running configuration, resources, no drop-ins, and enabled timer", () => {
    expect(() => verifyProperties(service, timer)).not.toThrow();
    for (const patch of [{ User: "root" }, { MemoryMax: "infinity" }, { NeedDaemonReload: "yes" }, { DropInPaths: "/tmp/override.conf" }, { ActiveState: "failed" }, { ExecMainStatus: "1" }]) {
      expect(() => verifyProperties({ ...service, ...patch }, timer)).toThrow("SERVICE_STATE_OR_LIMITS_MISMATCH");
    }
    expect(() => verifyProperties(service, { ...timer, UnitFileState: "disabled" })).toThrow("TIMER_NOT_READY");
  });
  it("parses only requested systemd key-value properties", () => {
    expect(parseProperties("User=zhitu-quota\nDropInPaths=\n")).toEqual({ User: "zhitu-quota", DropInPaths: "" });
    expect(() => parseProperties("unexpected")).toThrow();
  });
  it("requires at least two distinct, spaced real process invocations", () => {
    const logs = [entry(), entry(62_000, "2".repeat(32))].join("\n");
    expect(summarizeJournal(logs, time, now)).toMatchObject({ successfulRuns: 2, failedRuns: 0, spacedRuns: true, passed: true, hostBootRecoveryObserved: false });
    expect(summarizeJournal([entry(), entry(62_000)].join("\n"), time, now)).toMatchObject({ successfulRuns: 1, passed: false });
    expect(summarizeJournal([entry(), entry(2_000, "2".repeat(32))].join("\n"), time, now).passed).toBe(false);
  });
  it("never counts old/future/other-unit logs or infers a host reboot from ordinary ticks", () => {
    const logs = [entry(-1), entry(400_000), entry(2_000, "3".repeat(32), { _SYSTEMD_UNIT: "another.service" })].join("\n");
    expect(summarizeJournal(logs, time, now)).toMatchObject({ successfulRuns: 0, passed: false, hostBootRecoveryObserved: false });
    const rebootLogs = [entry(), entry(70_000, "2".repeat(32), { _BOOT_ID: "b".repeat(32) })].join("\n");
    expect(summarizeJournal(rebootLogs, time, now).hostBootRecoveryObserved).toBe(true);
  });
  it("fails acceptance when a current-window run failed and never echoes raw messages", () => {
    const bad = entry(10_000, "3".repeat(32), { MESSAGE: JSON.stringify({ event: "ai_quota_reconciliation_failed", at: new Date(time + 10_000).toISOString(), code: "private detail not returned" }) });
    const summary = summarizeJournal([entry(), bad, entry(70_000, "2".repeat(32))].join("\n"), time, now);
    expect(summary).toMatchObject({ successfulRuns: 2, failedRuns: 1, passed: false });
    expect(JSON.stringify(summary)).not.toContain("private");
  });
  it("rejects malformed counts and missing invocation IDs", () => {
    expect(() => summarizeJournal(entry(1_000, "not-an-id"), time, now)).toThrow("INVALID_RECONCILIATION_LOG");
    const bad = entry(1_000, "1".repeat(32), { MESSAGE: JSON.stringify({ event: "ai_quota_reconciliation", at: new Date(time + 1_000).toISOString(), completed: 51, released: 0, examined: 1, skippedLocked: 0 }) });
    expect(() => summarizeJournal(bad, time, now)).toThrow("INVALID_RECONCILIATION_LOG");
  });
  it("does not silently accept runtime warnings or crash text and never reproduces it", () => {
    const raw = entry(12_000, "3".repeat(32), { MESSAGE: "fatal crash: private unexpected detail" });
    const summary = summarizeJournal([entry(), raw, entry(70_000, "2".repeat(32))].join("\n"), time, now);
    expect(summary).toMatchObject({ unexpectedApplicationLogs: 1, passed: false });
    expect(JSON.stringify(summary)).not.toContain("private");
  });
  it("ships a bounded hardened oneshot, no shell, no root process, and no credential literal", () => {
    const unit = readFileSync(new URL(SERVICE, import.meta.url), "utf8");
    expect(unit).toContain("Type=oneshot\nUser=zhitu-quota\nGroup=zhitu-quota");
    expect(unit).toContain("MemoryMax=192M");
    expect(unit).toContain("CPUQuota=25%");
    expect(unit).toContain("TimeoutStartSec=30s");
    expect(unit).toContain("EnvironmentFile=/etc/zhitu-ai-quota-reconciliation/service.env");
    expect(unit).toContain("--expected-project-ref ijnhswcolasqlfjtjbkf --limit 50");
    expect(unit).toContain("ProtectSystem=strict");
    expect(unit).not.toMatch(/(?:User=root|RemainAfterExit=yes|\/bin\/(?:ba)?sh|sb_secret_|SUPABASE_SERVICE_ROLE_KEY=)/);
    const text = readFileSync(new URL(TIMER, import.meta.url), "utf8");
    expect(text).toContain("OnBootSec=60s\nOnUnitInactiveSec=60s");
    expect(text).toContain("WantedBy=timers.target");
    expect(text).not.toContain("Persistent=true"); // Only applies to OnCalendar timers, not this monotonic timer.
  });
  it("uses only read-only host commands and never reads the credential file", () => {
    const code = readFileSync(new URL("verify-deployment.mjs", import.meta.url), "utf8");
    expect(code).not.toMatch(/\b(?:writeFile|appendFile|unlink|chmod|chown)Sync\b|\["(?:start|stop|restart|enable|disable|daemon-reload)"/);
    expect(code).toContain("lstatSync(`${PRIVATE}/service.env`)");
    expect(code).not.toMatch(/readFileSync\([^\n]*(?:service\.env|PRIVATE)/);
    expect(code).not.toContain('"--property=Environment"');
  });
});
