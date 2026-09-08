// @vitest-environment node
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { readBoundedDocxArchive, UnsafeDocxArchiveError } from "./safe-docx-archive";

async function zipOf(text: string, compression: "STORE" | "DEFLATE" = "DEFLATE") {
  return Buffer.from(await new JSZip().file("word/document.xml", text).generateAsync({ type: "uint8array", compression }));
}

function forgeLengths(bytes: Buffer, length: number) {
  const central = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  let at = central;
  while (bytes.readUInt32LE(at) === 0x02014b50) {
    const nameLength = bytes.readUInt16LE(at + 28);
    const name = bytes.toString("utf8", at + 46, at + 46 + nameLength);
    if (name === "word/document.xml") {
      const local = bytes.readUInt32LE(at + 42);
      bytes.writeUInt32LE(length, at + 24);
      bytes.writeUInt32LE(length, local + 22);
      return bytes;
    }
    at += 46 + nameLength + bytes.readUInt16LE(at + 30) + bytes.readUInt16LE(at + 32);
  }
  throw new Error("fixture entry missing");
}

describe("bounded DOCX ZIP inflation", () => {
  it.each(["STORE", "DEFLATE"] as const)("reads actual verified bytes for %s entries", async (compression) => {
    const bytes = await zipOf("合成测试 Confirmed text", compression);
    expect(readBoundedDocxArchive(bytes).get("word/document.xml")?.toString("utf8")).toBe("合成测试 Confirmed text");
  });

  it("aborts inside native inflation at the forged small limit, before producing the actual 2 MiB payload", async () => {
    const bytes = forgeLengths(await zipOf("A".repeat(2 * 1024 * 1024)), 1024);
    expect(bytes.length).toBeLessThan(4096);
    // expanded_limit is thrown ONLY when native maxOutputLength stops inflation;
    // a post-inflation CRC/length rejection is a different invalid_archive code.
    expect(() => readBoundedDocxArchive(bytes)).toThrow(expect.objectContaining({ reason: "expanded_limit" }));
  });

  it("enforces a zero declared size during inflation as well", async () => {
    const bytes = forgeLengths(await zipOf("A".repeat(65536)), 0);
    expect(() => readBoundedDocxArchive(bytes)).toThrow(expect.objectContaining({ reason: "expanded_limit" }));
  });

  it("refuses stored entries whose real bytes disagree with declared lengths", async () => {
    const bytes = forgeLengths(await zipOf("A".repeat(2048), "STORE"), 1024);
    expect(() => readBoundedDocxArchive(bytes)).toThrow(UnsafeDocxArchiveError);
  });

  it("does not trust a valid declared length with corrupted payload CRC", async () => {
    const bytes = await zipOf("Synthetic content", "STORE");
    const local = bytes.indexOf(Buffer.from("Synthetic content"));
    bytes[local] ^= 1;
    expect(() => readBoundedDocxArchive(bytes)).toThrow(expect.objectContaining({ reason: "invalid_archive" }));
  });

  it("rejects excessive aggregate declarations before inflation", async () => {
    const archive = new JSZip().file("one.xml", "one").file("two.xml", "two");
    const bytes = Buffer.from(await archive.generateAsync({ type: "uint8array", compression: "DEFLATE" }));
    let at = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    while (bytes.readUInt32LE(at) === 0x02014b50) {
      const local = bytes.readUInt32LE(at + 42);
      bytes.writeUInt32LE(20 * 1024 * 1024, at + 24);
      bytes.writeUInt32LE(20 * 1024 * 1024, local + 22);
      at += 46 + bytes.readUInt16LE(at + 28) + bytes.readUInt16LE(at + 30) + bytes.readUInt16LE(at + 32);
    }
    expect(() => readBoundedDocxArchive(bytes)).toThrow(UnsafeDocxArchiveError);
  });
});
