// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  createVaultEnvelope,
  decryptBinary,
  encryptBinary,
  openVaultEnvelope,
  openVaultWithKey,
} from "../src/lib/crypto";
import { createEmptyVault } from "../src/types/profile";

describe("local encrypted storage", () => {
  it("round-trips the profile vault and rejects the wrong password", async () => {
    const state = createEmptyVault();
    state.profiles[0]!.personal.fullName = "脱敏候选人";
    const { envelope } = await createVaultEnvelope("local-only-passphrase", state);

    const unlocked = await openVaultEnvelope("local-only-passphrase", envelope);
    expect(unlocked.state).toEqual(state);
    expect(await openVaultWithKey(unlocked.key, envelope)).toEqual(state);
    await expect(openVaultEnvelope("wrong-password-123", envelope)).rejects.toThrow("无法解锁");
  });

  it("encrypts resume bytes instead of storing clear file content", async () => {
    const state = createEmptyVault();
    const { key } = await createVaultEnvelope("another-local-pass", state);
    const original = new TextEncoder().encode("desensitized resume file");
    const envelope = await encryptBinary(key, original);

    expect(envelope.ciphertext).not.toContain("desensitized");
    expect(await decryptBinary(key, envelope)).toEqual(original);
  });
});
