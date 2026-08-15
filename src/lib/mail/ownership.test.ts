import { describe, expect, it } from "vitest";
import { assertSameMailOwner, inboundAliasFromRecipient, resolveInboundOwner } from "./ownership";

const profiles = [
  { id: "admin-user", inbound_alias: "admin123" },
  { id: "testing-user", inbound_alias: "testing456" },
];

describe("webhook recipient ownership", () => {
  it("maps the administrator address only to the administrator", () => {
    expect(resolveInboundOwner(profiles, ["Admin <ADMIN123@in.example.com>"])).toEqual({
      ok: true,
      owner: { userId: "admin-user", inboundAlias: "admin123", recipient: "Admin <ADMIN123@in.example.com>" },
    });
  });

  it("maps the Testing address only to Testing", () => {
    expect(resolveInboundOwner(profiles, ["testing456@in.example.com"])).toEqual({
      ok: true,
      owner: { userId: "testing-user", inboundAlias: "testing456", recipient: "testing456@in.example.com" },
    });
  });

  it("rejects unknown recipients", () => {
    expect(resolveInboundOwner(profiles, ["unknown@in.example.com"])).toEqual({ ok: false, reason: "unmatched" });
  });

  it("isolates a message addressed to more than one known account", () => {
    expect(resolveInboundOwner(profiles, ["admin123@in.example.com", "testing456@in.example.com"])).toEqual({ ok: false, reason: "ambiguous" });
  });

  it("does not collapse plus-addresses into a user's alias", () => {
    expect(inboundAliasFromRecipient("testing456+private@in.example.com")).toBe("testing456+private");
    expect(resolveInboundOwner(profiles, ["testing456+private@in.example.com"])).toEqual({ ok: false, reason: "unmatched" });
  });

  it("rejects duplicate profile ownership even if the database invariant is broken", () => {
    expect(resolveInboundOwner([
      { id: "one", inbound_alias: "duplicate" },
      { id: "two", inbound_alias: "duplicate" },
    ], ["duplicate@in.example.com"])).toEqual({ ok: false, reason: "ambiguous" });
  });

  it("blocks notifications created for a different user", () => {
    expect(() => assertSameMailOwner("testing-user", "admin-user")).toThrow("does not match");
    expect(() => assertSameMailOwner("testing-user", "testing-user")).not.toThrow();
  });
});
