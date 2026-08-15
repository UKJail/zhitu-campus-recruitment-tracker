import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("read-only mail isolation audit", () => {
  it("reports mismatched recipients and notifications without exposing raw aliases", () => {
    const directory = mkdtempSync(join(tmpdir(), "zhitu-mail-audit-"));
    const input = join(directory, "snapshot.json");
    writeFileSync(input, JSON.stringify({
      profiles: [
        { id: "admin-user-id", inbound_alias: "admin123" },
        { id: "testing-user-id", inbound_alias: "testing456" },
      ],
      inboundEmails: [{
        id: "testing-email-id",
        user_id: "testing-user-id",
        extracted_data: { recipientAlias: "admin123" },
      }],
      notifications: [{
        id: "admin-notification-id",
        user_id: "admin-user-id",
        metadata: { inboundEmailId: "testing-email-id" },
      }],
    }), "utf8");

    const output = execFileSync(process.execPath, [resolve("scripts/audit-mail-isolation.mjs"), input], { encoding: "utf8" });
    const report = JSON.parse(output);
    expect(report.readOnly).toBe(true);
    expect(report.summary.issues).toBe(2);
    expect(report.issues.map((item: { type: string }) => item.type)).toEqual([
      "email_recipient_mismatch",
      "notification_owner_mismatch",
    ]);
    expect(output).not.toContain("admin123");
    expect(output).not.toContain("testing456");
  });
});
