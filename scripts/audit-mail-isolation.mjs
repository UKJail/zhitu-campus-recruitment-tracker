import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

function token(value) {
  return createHash("sha256").update(String(value || "missing")).digest("hex").slice(0, 10);
}

function redactedId(value) {
  const text = String(value || "missing");
  return text.length > 10 ? `${text.slice(0, 4)}…${text.slice(-4)}` : `id:${token(text)}`;
}

function aliasFromRecipient(value) {
  if (typeof value !== "string") return null;
  const bare = value.match(/<([^<>]+)>/)?.[1] ?? value;
  const mailbox = bare.trim().toLowerCase();
  if (!/^[^@\s<>]+@[^@\s<>]+$/.test(mailbox)) return null;
  return mailbox.slice(0, mailbox.indexOf("@"));
}

function issue(type, recordId, detail) {
  return { type, record: redactedId(recordId), detail };
}

export function auditMailIsolation(snapshot) {
  const profiles = Array.isArray(snapshot?.profiles) ? snapshot.profiles : [];
  const inboundEmails = Array.isArray(snapshot?.inboundEmails) ? snapshot.inboundEmails : [];
  const notifications = Array.isArray(snapshot?.notifications) ? snapshot.notifications : [];
  const issues = [];
  const profilesById = new Map();
  const ownersByAlias = new Map();

  for (const profile of profiles) {
    profilesById.set(profile.id, profile);
    const alias = typeof profile.inbound_alias === "string" ? profile.inbound_alias.trim().toLowerCase() : "";
    if (!alias) {
      issues.push(issue("profile_alias_missing", profile.id, "profile has no inbound alias"));
      continue;
    }
    const owners = ownersByAlias.get(alias) || [];
    owners.push(profile.id);
    ownersByAlias.set(alias, owners);
  }

  for (const [alias, owners] of ownersByAlias) {
    if (owners.length > 1) issues.push(issue("profile_alias_ambiguous", alias, `${owners.length} profiles share alias hash ${token(alias)}`));
  }

  const emailsById = new Map();
  for (const email of inboundEmails) {
    emailsById.set(email.id, email);
    const profile = profilesById.get(email.user_id);
    if (!profile) {
      issues.push(issue("email_owner_unknown", email.id, "email user is absent from profile snapshot"));
      continue;
    }
    const expectedAlias = typeof profile.inbound_alias === "string" ? profile.inbound_alias.trim().toLowerCase() : "";
    const extracted = email.extracted_data && typeof email.extracted_data === "object" ? email.extracted_data : {};
    const actualAlias = typeof extracted.recipientAlias === "string"
      ? extracted.recipientAlias.trim().toLowerCase()
      : aliasFromRecipient(extracted.recipient);
    if (!actualAlias) {
      issues.push(issue("email_owner_unverifiable", email.id, "recipient alias was not recorded"));
    } else if (actualAlias !== expectedAlias) {
      issues.push(issue("email_recipient_mismatch", email.id, `recipient hash ${token(actualAlias)} does not match owner alias hash ${token(expectedAlias)}`));
    }
  }

  for (const notification of notifications) {
    const inboundEmailId = notification?.metadata?.inboundEmailId;
    if (!inboundEmailId) continue;
    const email = emailsById.get(inboundEmailId);
    if (!email) {
      issues.push(issue("notification_email_unknown", notification.id, `linked email ${redactedId(inboundEmailId)} is absent from snapshot`));
    } else if (email.user_id !== notification.user_id) {
      issues.push(issue("notification_owner_mismatch", notification.id, `notification owner differs from linked email ${redactedId(inboundEmailId)}`));
    }
  }

  return {
    readOnly: true,
    summary: {
      profiles: profiles.length,
      inboundEmails: inboundEmails.length,
      notifications: notifications.length,
      issues: issues.length,
    },
    issues,
  };
}

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) throw new Error("Usage: npm run audit:mail-isolation -- <snapshot.json>");
  const snapshot = JSON.parse(await readFile(inputPath, "utf8"));
  process.stdout.write(`${JSON.stringify(auditMailIsolation(snapshot), null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Audit failed"}\n`);
    process.exitCode = 1;
  });
}
