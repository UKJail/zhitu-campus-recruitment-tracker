export type InboundOwnerProfile = {
  id: string;
  inbound_alias: string | null;
};

export type InboundOwnerResolution =
  | {
      ok: true;
      owner: {
        userId: string;
        inboundAlias: string;
        recipient: string;
      };
    }
  | {
      ok: false;
      reason: "unmatched" | "ambiguous";
    };

function bareAddress(address: string) {
  return address.match(/<([^<>]+)>/)?.[1] ?? address;
}

export function inboundAliasFromRecipient(address: string) {
  const mailbox = bareAddress(address).trim().toLowerCase();
  if (!/^[^@\s<>]+@[^@\s<>]+$/.test(mailbox)) return null;
  return mailbox.slice(0, mailbox.indexOf("@"));
}

export function uniqueInboundAliases(recipients: string[]) {
  return [...new Set(recipients.map(inboundAliasFromRecipient).filter((alias): alias is string => Boolean(alias)))];
}

export function resolveInboundOwner(profiles: InboundOwnerProfile[], recipients: string[]): InboundOwnerResolution {
  const recipientAliases = uniqueInboundAliases(recipients);
  if (recipientAliases.length === 0) return { ok: false, reason: "unmatched" };

  const matches = profiles.filter((profile) => {
    const alias = profile.inbound_alias?.trim().toLowerCase();
    return Boolean(alias && recipientAliases.includes(alias));
  });
  const userIds = [...new Set(matches.map((profile) => profile.id))];
  if (userIds.length === 0) return { ok: false, reason: "unmatched" };
  if (userIds.length !== 1 || matches.length !== 1) return { ok: false, reason: "ambiguous" };

  const profile = matches[0];
  const inboundAlias = profile.inbound_alias!.trim().toLowerCase();
  const recipient = recipients.find((value) => inboundAliasFromRecipient(value) === inboundAlias);
  if (!recipient) return { ok: false, reason: "unmatched" };
  return { ok: true, owner: { userId: profile.id, inboundAlias, recipient } };
}

export function assertSameMailOwner(emailUserId: string, notificationUserId: string) {
  if (emailUserId !== notificationUserId) {
    throw new Error("Inbound email owner does not match notification owner");
  }
}
