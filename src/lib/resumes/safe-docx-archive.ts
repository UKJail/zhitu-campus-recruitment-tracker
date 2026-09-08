import { inflateRawSync } from "node:zlib";

export class UnsafeDocxArchiveError extends Error {
  constructor(public readonly reason: "invalid_archive" | "expanded_limit" = "invalid_archive") {
    super("DOCX archive is invalid or exceeds safe processing limits");
    this.name = "UnsafeDocxArchiveError";
  }
}

const MAX_INPUT_BYTES = 10 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 32 * 1024 * 1024;
const reject = () => new UnsafeDocxArchiveError();
const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Bounded native inflation, not a declaration-only ZIP preflight. A forged
 * uncompressed length cannot make JSZip/Pako allocate the true expanded data.
 * Returned entries have verified actual lengths and CRCs; callers may construct
 * JSZip from these bytes without calling loadAsync on the uploaded archive. */
export function readBoundedDocxArchive(source: Uint8Array): Map<string, Buffer> {
  try {
    if (source.length < 22 || source.length > MAX_INPUT_BYTES) throw reject();
    const bytes = Buffer.from(source);
    let end = -1;
    for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 65_557); at--) {
      if (bytes.readUInt32LE(at) === 0x06054b50 && at + 22 + bytes.readUInt16LE(at + 20) === bytes.length) { end = at; break; }
    }
    if (end < 0) throw reject();
    const count = bytes.readUInt16LE(end + 10);
    const size = bytes.readUInt32LE(end + 12);
    const start = bytes.readUInt32LE(end + 16);
    if (bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6) || bytes.readUInt16LE(end + 8) !== count || count < 1 || count > 2_048 || start + size !== end) throw reject();
    let at = start;
    let declaredTotal = 0;
    const names = new Set<string>();
    const descriptors: { name: string; dataStart: number; localAt: number; compressed: number; length: number; compression: number; crc: number }[] = [];
    for (let i = 0; i < count; i++) {
      if (at + 46 > end || bytes.readUInt32LE(at) !== 0x02014b50) throw reject();
      const flags = bytes.readUInt16LE(at + 8);
      const compression = bytes.readUInt16LE(at + 10);
      const crc = bytes.readUInt32LE(at + 16);
      const compressed = bytes.readUInt32LE(at + 20);
      const length = bytes.readUInt32LE(at + 24);
      const nameLength = bytes.readUInt16LE(at + 28);
      const extraLength = bytes.readUInt16LE(at + 30);
      const commentLength = bytes.readUInt16LE(at + 32);
      const localAt = bytes.readUInt32LE(at + 42);
      const next = at + 46 + nameLength + extraLength + commentLength;
      if (next > end || flags & 1 || ![0, 8].includes(compression) || bytes.readUInt16LE(at + 34) || length > MAX_EXPANDED_BYTES || compressed > bytes.length || length > Math.max(compressed, 1) * 1_000) throw reject();
      const name = bytes.toString("utf8", at + 46, at + 46 + nameLength);
      if (!name || /[\\\0:\uFFFD]/.test(name) || name.startsWith("/") || name.split("/").some((part) => part === ".." || part === ".") || names.has(name.toLowerCase())) throw reject();
      if (localAt + 30 > start || bytes.readUInt32LE(localAt) !== 0x04034b50 || bytes.readUInt16LE(localAt + 6) !== flags || bytes.readUInt16LE(localAt + 8) !== compression) throw reject();
      const localNameLength = bytes.readUInt16LE(localAt + 26);
      const localExtraLength = bytes.readUInt16LE(localAt + 28);
      const dataStart = localAt + 30 + localNameLength + localExtraLength;
      if (dataStart + compressed > start || bytes.toString("utf8", localAt + 30, localAt + 30 + localNameLength) !== name) throw reject();
      if (!(flags & 8) && (bytes.readUInt32LE(localAt + 14) !== crc || bytes.readUInt32LE(localAt + 18) !== compressed || bytes.readUInt32LE(localAt + 22) !== length)) throw reject();
      names.add(name.toLowerCase());
      declaredTotal += length;
      if (declaredTotal > MAX_EXPANDED_BYTES) throw reject();
      descriptors.push({ name, dataStart, localAt, compressed, length, compression, crc });
      at = next;
    }
    if (at !== end) throw reject();
    const ordered = [...descriptors].sort((left, right) => left.localAt - right.localAt);
    for (let i = 1; i < ordered.length; i++) if (ordered[i].localAt < ordered[i - 1].dataStart + ordered[i - 1].compressed) throw reject();
    const result = new Map<string, Buffer>();
    let actualTotal = 0;
    for (const entry of descriptors) {
      const compressed = bytes.subarray(entry.dataStart, entry.dataStart + entry.compressed);
      let content: Buffer;
      if (entry.compression === 0) {
        if (entry.compressed !== entry.length) throw reject();
        content = Buffer.from(compressed);
      } else {
        // Enforcement occurs DURING inflation. maxOutputLength must be at least
        // one for zlib; a declared-empty entry is subsequently required empty.
        const maxOutputLength = Math.max(1, Math.min(entry.length, MAX_EXPANDED_BYTES - actualTotal));
        try { content = inflateRawSync(compressed, { maxOutputLength }); }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ERR_BUFFER_TOO_LARGE") throw new UnsafeDocxArchiveError("expanded_limit");
          throw reject();
        }
      }
      actualTotal += content.length;
      if (actualTotal > MAX_EXPANDED_BYTES) throw new UnsafeDocxArchiveError("expanded_limit");
      if (content.length !== entry.length || crc32(content) !== entry.crc) throw reject();
      result.set(entry.name, content);
    }
    return result;
  } catch (error) {
    if (error instanceof UnsafeDocxArchiveError) throw error;
    throw reject();
  }
}
