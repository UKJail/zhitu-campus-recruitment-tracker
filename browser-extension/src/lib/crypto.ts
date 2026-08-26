import type { VaultState } from "../types/profile";

export const KDF_ITERATIONS = 310_000;

export type CipherEnvelope = {
  version: 1;
  algorithm: "AES-GCM";
  kdf: "PBKDF2-SHA256";
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
};

export type BinaryEnvelope = {
  version: 1;
  algorithm: "AES-GCM";
  iv: string;
  ciphertext: string;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

export function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export async function deriveVaultKey(passphrase: string, salt: Uint8Array, iterations = KDF_ITERATIONS) {
  if (passphrase.length < 10) throw new Error("解锁密码至少需要 10 个字符");
  const material = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encrypt(key: CryptoKey, bytes: Uint8Array) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, bytes as BufferSource);
  return { iv, ciphertext: new Uint8Array(ciphertext) };
}

export async function createVaultEnvelope(passphrase: string, state: VaultState) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveVaultKey(passphrase, salt);
  const envelope = await sealVaultState(key, state, salt, KDF_ITERATIONS);
  return { key, envelope };
}

export async function sealVaultState(
  key: CryptoKey,
  state: VaultState,
  salt: Uint8Array,
  iterations = KDF_ITERATIONS,
): Promise<CipherEnvelope> {
  const encrypted = await encrypt(key, encoder.encode(JSON.stringify(state)));
  return {
    version: 1,
    algorithm: "AES-GCM",
    kdf: "PBKDF2-SHA256",
    iterations,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(encrypted.iv),
    ciphertext: bytesToBase64(encrypted.ciphertext),
  };
}

export async function openVaultEnvelope(passphrase: string, envelope: CipherEnvelope) {
  try {
    const salt = base64ToBytes(envelope.salt);
    const key = await deriveVaultKey(passphrase, salt, envelope.iterations);
    return { key, state: await openVaultWithKey(key, envelope) };
  } catch {
    throw new Error("无法解锁资料库，请检查密码或备份文件");
  }
}

export async function openVaultWithKey(key: CryptoKey, envelope: CipherEnvelope) {
  const clear = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(envelope.iv) },
    key,
    base64ToBytes(envelope.ciphertext),
  );
  return JSON.parse(decoder.decode(clear)) as unknown;
}

export async function encryptBinary(key: CryptoKey, bytes: Uint8Array): Promise<BinaryEnvelope> {
  const encrypted = await encrypt(key, bytes);
  return {
    version: 1,
    algorithm: "AES-GCM",
    iv: bytesToBase64(encrypted.iv),
    ciphertext: bytesToBase64(encrypted.ciphertext),
  };
}

export async function decryptBinary(key: CryptoKey, envelope: BinaryEnvelope) {
  const clear = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(envelope.iv) },
    key,
    base64ToBytes(envelope.ciphertext),
  );
  return new Uint8Array(clear);
}
