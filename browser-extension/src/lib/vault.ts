import { browser } from "wxt/browser";
import {
  base64ToBytes,
  createVaultEnvelope,
  openVaultEnvelope,
  openVaultWithKey,
  sealVaultState,
  type CipherEnvelope,
} from "./crypto";
import { forgetRememberedVaultKey, readRememberedVaultKey, rememberVaultKey } from "./device-key-store";
import { listResumeRecords, replaceResumeRecords, type StoredResumeRecord } from "./resume-store";
import { createEmptyVault, vaultStateSchema, type VaultState } from "../types/profile";

const VAULT_KEY = "vault-envelope-v1";

export type UnlockedVault = {
  key: CryptoKey;
  state: VaultState;
  envelope: CipherEnvelope;
};

export type EncryptedBackupV1 = {
  format: "zhitu-autofill-backup";
  version: 1;
  exportedAt: string;
  vault: CipherEnvelope;
  resumes: StoredResumeRecord[];
};

export async function readVaultEnvelope() {
  const stored = await browser.storage.local.get(VAULT_KEY);
  return (stored[VAULT_KEY] as CipherEnvelope | undefined) ?? null;
}

export async function hasVault() {
  return Boolean(await readVaultEnvelope());
}

export async function createVault(passphrase: string): Promise<UnlockedVault> {
  const state = createEmptyVault();
  const { key, envelope } = await createVaultEnvelope(passphrase, state);
  await browser.storage.local.set({ [VAULT_KEY]: envelope });
  await rememberVaultKey(key);
  return { key, state, envelope };
}

export async function unlockVault(passphrase: string): Promise<UnlockedVault> {
  const envelope = await readVaultEnvelope();
  if (!envelope) throw new Error("本机还没有资料库");
  const unlocked = await openVaultEnvelope(passphrase, envelope);
  const state = vaultStateSchema.parse(unlocked.state);
  await rememberVaultKey(unlocked.key);
  return { key: unlocked.key, state, envelope };
}

export async function unlockRememberedVault(): Promise<UnlockedVault | null> {
  const [envelope, key] = await Promise.all([readVaultEnvelope(), readRememberedVaultKey()]);
  if (!envelope || !key) return null;
  try {
    const state = vaultStateSchema.parse(await openVaultWithKey(key, envelope));
    return { key, state, envelope };
  } catch {
    await forgetRememberedVaultKey();
    return null;
  }
}

export { forgetRememberedVaultKey };

export async function saveVault(vault: UnlockedVault, nextState: VaultState): Promise<UnlockedVault> {
  const state = vaultStateSchema.parse({ ...nextState, updatedAt: new Date().toISOString() });
  const envelope = await sealVaultState(
    vault.key,
    state,
    base64ToBytes(vault.envelope.salt),
    vault.envelope.iterations,
  );
  await browser.storage.local.set({ [VAULT_KEY]: envelope });
  return { ...vault, state, envelope };
}

export async function exportEncryptedBackup(vault: UnlockedVault): Promise<EncryptedBackupV1> {
  return {
    format: "zhitu-autofill-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    vault: vault.envelope,
    resumes: await listResumeRecords(),
  };
}

export async function importEncryptedBackup(value: unknown) {
  const backup = value as Partial<EncryptedBackupV1>;
  if (
    backup.format !== "zhitu-autofill-backup"
    || backup.version !== 1
    || !backup.vault
    || !Array.isArray(backup.resumes)
  ) {
    throw new Error("这不是有效的职途填表助手加密备份");
  }
  await browser.storage.local.set({ [VAULT_KEY]: backup.vault });
  await replaceResumeRecords(backup.resumes as StoredResumeRecord[]);
  await forgetRememberedVaultKey();
}
