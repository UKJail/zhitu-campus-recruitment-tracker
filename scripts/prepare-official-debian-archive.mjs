/** Prepare only: fixed official Debian artifact -> digest-verified Docker archive.
 * Never invokes Docker, changes daemon configuration, extracts a root filesystem,
 * downloads from mirrors, uses credentials, or disables TLS verification.
 * Node >=22. No dependencies. See docs/official-debian-archive.md for provenance.
 */
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { link, mkdir, open, readFile, unlink, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { pathToFileURL } from "node:url";
import { createGunzip } from "node:zlib";

const COMMIT = "bae6d64d90b4068b09ff9d8b564c2773ef5d8d83";
const BASE = `https://raw.githubusercontent.com/debuerreotype/docker-debian-artifacts/${COMMIT}/trixie/slim/oci`;
export const PIN = Object.freeze({
  commit: COMMIT,
  indexUrl: `${BASE}/index.json`,
  // The hash-named Git entry is a symlink containing ../rootfs.tar.gz.
  // GitHub Raw returns symlink text, so use its observed fixed target directly.
  layerUrl: `${BASE}/blobs/rootfs.tar.gz`,
  manifest: "abc9cb88a5587630d7f915f47b23b0668fe250fbfc6457aa4d52b534c1bbf73f",
  manifestBytes: 1021,
  config: "e426a54f50cc4cf82dd5cab8ba8426ed02c391840cb5a62dfd987542dbabea3b",
  configBytes: 451,
  layer: "6310eb16bf4251731feab01e8f633bf5e2d75a657ccad97f420b1f83cce457be",
  layerBytes: 29_792_658,
});
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const fail = (code) => { throw new Error(code); };

export function optionsFromArgs(args) {
  if (!args.length || (args.length === 1 && args[0] === "--help")) return null;
  if (args.length !== 2 || args[0] !== "--download" || !args[1].startsWith("--out=")) fail("INVALID_ARGUMENTS");
  const out = args[1].slice(6);
  if (!isAbsolute(out) || /[\r\n\0]/.test(out)) fail("INVALID_ARGUMENTS");
  return { out };
}

function inlineBlob(descriptor, expectedHash, expectedSize) {
  if (descriptor?.digest !== `sha256:${expectedHash}` || descriptor.size !== expectedSize || typeof descriptor.data !== "string"
      || !/^[A-Za-z0-9+/]+={0,2}$/.test(descriptor.data)) fail("METADATA_DIGEST_MISMATCH");
  const bytes = Buffer.from(descriptor.data, "base64");
  if (bytes.length !== expectedSize || hash(bytes) !== expectedHash) fail("METADATA_DIGEST_MISMATCH");
  return bytes;
}

export function verifyIndex(indexBytes) {
  if (indexBytes.length > 16_384) fail("INVALID_METADATA");
  const index = JSON.parse(Buffer.from(indexBytes).toString("utf8"));
  if (index.schemaVersion !== 2 || index.mediaType !== "application/vnd.oci.image.index.v1+json" || index.manifests?.length !== 1) fail("INVALID_METADATA");
  const descriptor = index.manifests[0];
  if (descriptor.platform?.architecture !== "amd64" || descriptor.platform?.os !== "linux" || descriptor.mediaType !== "application/vnd.oci.image.manifest.v1+json") fail("WRONG_PLATFORM");
  const manifestBytes = inlineBlob(descriptor, PIN.manifest, PIN.manifestBytes);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  if (manifest.schemaVersion !== 2 || manifest.mediaType !== "application/vnd.oci.image.manifest.v1+json"
      || manifest.config?.mediaType !== "application/vnd.oci.image.config.v1+json" || manifest.layers?.length !== 1) fail("INVALID_METADATA");
  const layer = manifest.layers[0];
  if (layer.digest !== `sha256:${PIN.layer}` || layer.size !== PIN.layerBytes || layer.mediaType !== "application/vnd.oci.image.layer.v1.tar+gzip") fail("LAYER_DESCRIPTOR_MISMATCH");
  const configBytes = inlineBlob(manifest.config, PIN.config, PIN.configBytes);
  const config = JSON.parse(configBytes.toString("utf8"));
  if (config.architecture !== "amd64" || config.os !== "linux" || config.rootfs?.type !== "layers"
      || config.rootfs.diff_ids?.length !== 1 || !/^sha256:[a-f0-9]{64}$/.test(config.rootfs.diff_ids[0])) fail("INVALID_CONFIG");
  return { manifestBytes, configBytes, diffId: config.rootfs.diff_ids[0] };
}

export async function download(url, destination, expectedBytes, expectedHash, fetcher = fetch) {
  if (![PIN.indexUrl, PIN.layerUrl].includes(url)) fail("NON_OFFICIAL_SOURCE");
  const maxBytes = expectedBytes ?? 16_384;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), url === PIN.indexUrl ? 20_000 : 180_000);
  let handle;
  try {
    const response = await fetcher(url, { redirect: "error", signal: controller.signal, headers: { "Accept-Encoding": "identity" } });
    if (response.status !== 200 || response.redirected || (response.url && response.url !== url) || !response.body) fail("DOWNLOAD_FAILED");
    const length = response.headers.get("content-length");
    if (length && (!/^\d+$/.test(length) || Number(length) > maxBytes || (expectedBytes !== undefined && Number(length) !== expectedBytes))) fail("DOWNLOAD_SIZE_MISMATCH");
    const encoding = response.headers.get("content-encoding");
    if (encoding && encoding !== "identity") fail("UNEXPECTED_HTTP_ENCODING");
    handle = await open(destination, "wx", 0o600);
    let count = 0;
    const digest = createHash("sha256");
    for await (const chunk of response.body) {
      count += chunk.length;
      if (count > maxBytes) { controller.abort(); fail("DOWNLOAD_SIZE_MISMATCH"); }
      digest.update(chunk);
      await handle.writeFile(chunk);
    }
    const actualHash = digest.digest("hex");
    if ((expectedBytes !== undefined && count !== expectedBytes) || (expectedHash && actualHash !== expectedHash)) fail("DOWNLOAD_DIGEST_MISMATCH");
    await handle.sync();
    return { bytes: count, sha256: actualHash };
  } finally {
    clearTimeout(timer);
    controller.abort();
    await handle?.close();
  }
}

export async function verifyUncompressedLayer(path, expectedDiffId, maxBytes = 512 * 1024 * 1024) {
  const input = createReadStream(path);
  const inflated = input.pipe(createGunzip());
  input.on("error", (error) => inflated.destroy(error));
  const timer = setTimeout(() => inflated.destroy(new Error("LAYER_VERIFICATION_TIMEOUT")), 45_000);
  let count = 0;
  const digest = createHash("sha256");
  try {
    for await (const chunk of inflated) {
      count += chunk.length;
      if (count > maxBytes) fail("UNCOMPRESSED_SIZE_LIMIT");
      digest.update(chunk);
    }
    const diffId = `sha256:${digest.digest("hex")}`;
    if (diffId !== expectedDiffId) fail("LAYER_DIFFID_MISMATCH");
    return { bytes: count, diffId };
  } finally { clearTimeout(timer); inflated.destroy(); input.destroy(); }
}

export function tarHeader(name, size) {
  if (!/^[a-z0-9./-]+$/.test(name) || name.includes("..") || name.startsWith("/") || Buffer.byteLength(name) > 100 || !Number.isSafeInteger(size) || size < 0 || size > 512 * 1024 * 1024) fail("INVALID_TAR_ENTRY");
  const result = Buffer.alloc(512);
  result.write(name, 0, 100, "ascii");
  const octal = (value, offset, width) => result.write(value.toString(8).padStart(width - 1, "0") + "\0", offset, width, "ascii");
  octal(0o644, 100, 8); octal(0, 108, 8); octal(0, 116, 8); octal(size, 124, 12); octal(0, 136, 12);
  result.fill(32, 148, 156); result[156] = 48;
  result.write("ustar\0", 257, 6, "ascii"); result.write("00", 263, 2, "ascii");
  const checksum = result.reduce((sum, byte) => sum + byte, 0);
  result.write(checksum.toString(8).padStart(6, "0") + "\0 ", 148, 8, "ascii");
  return result;
}

export async function createDockerArchive(path, configBytes, layerPath, layerBytes) {
  const configName = `${hash(configBytes)}.json`;
  const layerName = `${PIN.layer}/layer.tar.gz`;
  // No RepoTags: loading cannot replace an existing tag. Expected image ID is
  // SHA256(original config bytes), unlike docker import's regenerated config.
  const manifest = Buffer.from(JSON.stringify([{ Config: configName, RepoTags: [], Layers: [layerName] }]));
  const handle = await open(path, "wx", 0o600);
  const digest = createHash("sha256");
  let archiveBytes = 0;
  const write = async (bytes) => { await handle.writeFile(bytes); digest.update(bytes); archiveBytes += bytes.length; };
  const pad = async (size) => { if (size % 512) await write(Buffer.alloc(512 - size % 512)); };
  try {
    for (const [name, bytes] of [["manifest.json", manifest], [configName, configBytes]]) {
      await write(tarHeader(name, bytes.length)); await write(bytes); await pad(bytes.length);
    }
    await write(tarHeader(layerName, layerBytes));
    let copied = 0;
    const copiedDigest = createHash("sha256");
    for await (const chunk of createReadStream(layerPath)) {
      copied += chunk.length;
      if (copied > layerBytes) fail("LAYER_CHANGED_AFTER_VERIFICATION");
      copiedDigest.update(chunk); await write(chunk);
    }
    if (copied !== layerBytes || copiedDigest.digest("hex") !== PIN.layer) fail("LAYER_CHANGED_AFTER_VERIFICATION");
    await pad(layerBytes); await write(Buffer.alloc(1024)); await handle.sync();
    return { bytes: archiveBytes, sha256: digest.digest("hex") };
  } finally { await handle.close(); }
}

async function main() {
  const options = optionsFromArgs(process.argv.slice(2));
  if (!options) {
    console.log("Prepare only, no Docker calls: node scripts/prepare-official-debian-archive.mjs --download --out=/absolute/new-private-directory\nDownloads only pinned official GitHub index and 29,792,658-byte layer; refuses redirects, hash mismatches, and existing output directories. Does not load/import or change any container.");
    return;
  }
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") fail("INSECURE_TLS_CONFIGURATION");
  const { out } = options;
  await mkdir(out, { mode: 0o700 }); // No recursive mkdir or replacement of existing files.
  const indexPath = join(out, "index.json");
  await download(PIN.indexUrl, indexPath);
  const metadata = verifyIndex(await readFile(indexPath));
  const layerPath = join(out, "rootfs.tar.gz");
  await download(PIN.layerUrl, layerPath, PIN.layerBytes, PIN.layer);
  const uncompressed = await verifyUncompressedLayer(layerPath, metadata.diffId);
  const partialArchive = join(out, "debian-trixie-slim-amd64.docker.tar.partial");
  const archive = await createDockerArchive(partialArchive, metadata.configBytes, layerPath, PIN.layerBytes);
  // Publish a complete archive without replacing anything. A failed run never
  // publishes a partial file under the final loadable name.
  await link(partialArchive, join(out, "debian-trixie-slim-amd64.docker.tar"));
  await unlink(partialArchive);
  const report = { verified: true, dockerLoaded: false, sources: PIN, expectedImageId: `sha256:${PIN.config}`, uncompressed, archive };
  await writeFile(join(out, "provenance.json"), JSON.stringify(report, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify(report));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    const safeCodes = new Set(["INVALID_ARGUMENTS", "METADATA_DIGEST_MISMATCH", "INVALID_METADATA", "WRONG_PLATFORM", "LAYER_DESCRIPTOR_MISMATCH", "INVALID_CONFIG", "NON_OFFICIAL_SOURCE", "DOWNLOAD_FAILED", "DOWNLOAD_SIZE_MISMATCH", "UNEXPECTED_HTTP_ENCODING", "DOWNLOAD_DIGEST_MISMATCH", "LAYER_VERIFICATION_TIMEOUT", "UNCOMPRESSED_SIZE_LIMIT", "LAYER_DIFFID_MISMATCH", "INVALID_TAR_ENTRY", "LAYER_CHANGED_AFTER_VERIFICATION", "INSECURE_TLS_CONFIGURATION"]);
    console.error(JSON.stringify({ event: "official_debian_archive_failed", code: safeCodes.has(error?.message) ? error.message : "PREPARATION_FAILED", verified: false, dockerLoaded: false, message: "Preparation failed closed; do not load any partial archive. Existing private output is retained for inspection." }));
    process.exitCode = 1;
  });
}
