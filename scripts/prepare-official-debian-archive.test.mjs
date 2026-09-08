import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, rmdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, vi } from "vitest";
import { gzipSync } from "node:zlib";
import { copyOfflineArtifact, download, optionsFromArgs, PIN, prepareFromFiles, tarHeader, verifyIndex, verifyUncompressedLayer } from "./prepare-official-debian-archive.mjs";

// Public metadata read from the pinned official GitHub index, not a layer download.
const PINNED_INDEX_SNAPSHOT = "{\"schemaVersion\":2,\"mediaType\":\"application/vnd.oci.image.index.v1+json\",\"manifests\":[{\"mediaType\":\"application/vnd.oci.image.manifest.v1+json\",\"digest\":\"sha256:abc9cb88a5587630d7f915f47b23b0668fe250fbfc6457aa4d52b534c1bbf73f\",\"size\":1021,\"platform\":{\"os\":\"linux\",\"architecture\":\"amd64\"},\"annotations\":{\"io.containerd.image.name\":\"amd64/debian:trixie-slim\",\"org.opencontainers.image.ref.name\":\"amd64/debian:trixie-slim\"},\"data\":\"eyJzY2hlbWFWZXJzaW9uIjoyLCJtZWRpYVR5cGUiOiJhcHBsaWNhdGlvbi92bmQub2NpLmltYWdlLm1hbmlmZXN0LnYxK2pzb24iLCJjb25maWciOnsibWVkaWFUeXBlIjoiYXBwbGljYXRpb24vdm5kLm9jaS5pbWFnZS5jb25maWcudjEranNvbiIsImRpZ2VzdCI6InNoYTI1NjplNDI2YTU0ZjUwY2M0Y2Y4MmRkNWNhYjhiYTg0MjZlZDAyYzM5MTg0MGNiNWE2MmRmZDk4NzU0MmRiYWJlYTNiIiwic2l6ZSI6NDUxLCJkYXRhIjoiZXlKamIyNW1hV2NpT25zaVJXNTJJanBiSWxCQlZFZzlMM1Z6Y2k5c2IyTmhiQzl6WW1sdU9pOTFjM0l2Ykc5allXd3ZZbWx1T2k5MWMzSXZjMkpwYmpvdmRYTnlMMkpwYmpvdmMySnBiam92WW1sdUlsMHNJa1Z1ZEhKNWNHOXBiblFpT2x0ZExDSkRiV1FpT2xzaVltRnphQ0pkZlN3aVkzSmxZWFJsWkNJNklqSXdNall0TURndE1qUlVNREE2TURBNk1EQmFJaXdpYUdsemRHOXllU0k2VzNzaVkzSmxZWFJsWkNJNklqSXdNall0TURndE1qUlVNREE2TURBNk1EQmFJaXdpWTNKbFlYUmxaRjlpZVNJNklpTWdaR1ZpYVdGdUxuTm9JQzB0WVhKamFDQW5ZVzFrTmpRbklHOTFkQzhnSjNSeWFYaHBaU2NnSjBBeE56ZzNOVEk1TmpBd0p5SXNJbU52YlcxbGJuUWlPaUprWldKMVpYSnlaVzkwZVhCbElEQXVNVGNpZlYwc0luSnZiM1JtY3lJNmV5SjBlWEJsSWpvaWJHRjVaWEp6SWl3aVpHbG1abDlwWkhNaU9sc2ljMmhoTWpVMk9qUXhNV0U0TmpZM05qRTROV05pTlRSa05qazFZVGd3TldJeU16Z3hPVFJoTmpSbE9XSTNOMlV3WXpjeU0yWXpPREF5Wm1KaU9EZGtNek16WldFd1lqTWlYWDBzSW05eklqb2liR2x1ZFhnaUxDSmhjbU5vYVhSbFkzUjFjbVVpT2lKaGJXUTJOQ0o5Q2c9PSJ9LCJsYXllcnMiOlt7Im1lZGlhVHlwZSI6ImFwcGxpY2F0aW9uL3ZuZC5vY2kuaW1hZ2UubGF5ZXIudjEudGFyK2d6aXAiLCJkaWdlc3QiOiJzaGEyNTY6NjMxMGViMTZiZjQyNTE3MzFmZWFiMDFlOGY2MzNiZjVlMmQ3NWE2NTdjY2FkOTdmNDIwYjFmODNjY2U0NTdiZSIsInNpemUiOjI5NzkyNjU4fV19Cg==\"}]}";

test("official pinned metadata snapshot validates manifest/config hashes and preserves config", () => {
  const checked = verifyIndex(Buffer.from(PINNED_INDEX_SNAPSHOT));
  assert.equal(checked.manifestBytes.length, PIN.manifestBytes);
  assert.equal(checked.configBytes.length, PIN.configBytes);
  assert.equal(createHash("sha256").update(checked.configBytes).digest("hex"), PIN.config);
  assert.match(checked.diffId, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(JSON.parse(checked.configBytes.toString()).config.Cmd, ["bash"]);
});

test("help has no execution and explicit download requires a new absolute destination", () => {
  assert.equal(optionsFromArgs([]), null);
  assert.equal(optionsFromArgs(["--help"]), null);
  assert.deepEqual(optionsFromArgs(["--download", `--out=${join(tmpdir(), "qa-fixed-test")}`]), { out: join(tmpdir(), "qa-fixed-test"), mode: "download" });
  for (const args of [["--download"], ["--out=/tmp/x"], ["--download", "--out=relative"], ["--download", "--out=/tmp/x", "--url=https://evil.invalid"]]) assert.throws(() => optionsFromArgs(args));
});

test("offline CLI accepts only explicit absolute input and output, never mixed modes or sources", () => {
  const sourceDirectory = join(tmpdir(), "qa-source");
  const out = join(tmpdir(), "qa-out");
  assert.deepEqual(optionsFromArgs([`--offline-dir=${sourceDirectory}`, `--out=${out}`]), { mode: "offline", sourceDirectory, out });
  for (const args of [["--offline-dir=relative", `--out=${out}`], [`--offline-dir=${sourceDirectory}`, "--out=relative"], ["--download", `--offline-dir=${sourceDirectory}`, `--out=${out}`], [`--offline-dir=${sourceDirectory}`, `--out=${out}`, "--skip-hash"], [`--offline-dir=${sourceDirectory}\n`, `--out=${out}`]]) assert.throws(() => optionsFromArgs(args), /INVALID_ARGUMENTS/);
});

test("offline files preserve metadata, refuse credential names, corrupt layers and existing outputs without any network", async () => {
  const dir = await mkdtemp(join(tmpdir(), "zhitu-debian-offline-unit-"));
  const sourceDirectory = join(dir, "source");
  const copy = join(dir, "copy");
  await mkdir(sourceDirectory); await mkdir(copy);
  const network = vi.fn(() => { throw new Error("NETWORK_MUST_NOT_RUN"); });
  vi.stubGlobal("fetch", network);
  try {
    await writeFile(join(sourceDirectory, "index.json"), PINNED_INDEX_SNAPSHOT);
    await writeFile(join(sourceDirectory, "rootfs.tar.gz"), "invalid short layer");
    await assert.rejects(copyOfflineArtifact(sourceDirectory, copy, ".env"), /INVALID_OFFLINE_INPUT/);
    const result = await copyOfflineArtifact(sourceDirectory, copy, "index.json");
    assert.equal(result.sha256, createHash("sha256").update(PINNED_INDEX_SNAPSHOT).digest("hex"));
    assert.equal((await readFile(join(copy, "index.json"))).toString(), PINNED_INDEX_SNAPSHOT);
    await assert.rejects(prepareFromFiles({ sourceDirectory, out: copy }), { code: "EEXIST" });
    await assert.rejects(prepareFromFiles({ sourceDirectory, out: join(dir, "bad-size") }), /OFFLINE_SIZE_MISMATCH/);
    await writeFile(join(sourceDirectory, "rootfs.tar.gz"), Buffer.alloc(PIN.layerBytes));
    await assert.rejects(prepareFromFiles({ sourceDirectory, out: join(dir, "bad-hash") }), /OFFLINE_DIGEST_MISMATCH/);
    assert.equal(network.mock.calls.length, 0);
    assert.equal((await readFile(join(sourceDirectory, "index.json"))).toString(), PINNED_INDEX_SNAPSHOT);
    await assert.rejects(readFile(join(dir, "bad-hash", "provenance.json")), { code: "ENOENT" });
    await assert.rejects(readFile(join(dir, "bad-hash", "debian-trixie-slim-amd64.docker.tar")), { code: "ENOENT" });
  } finally {
    vi.unstubAllGlobals();
    for (const name of ["source", "copy", "bad-size", "bad-hash"]) {
      for (const file of ["index.json", "rootfs.tar.gz"]) await rm(join(dir, name, file), { force: true });
      await rmdir(join(dir, name)).catch((error) => { if (error.code !== "ENOENT") throw error; });
    }
    await rmdir(dir);
  }
});

test("metadata rejects alternate architecture, malformed and unpinned manifests", () => {
  assert.throws(() => verifyIndex(Buffer.alloc(16_385)), /INVALID_METADATA/);
  assert.throws(() => verifyIndex(Buffer.from("{}")), /INVALID_METADATA/);
  const index = { schemaVersion: 2, mediaType: "application/vnd.oci.image.index.v1+json", manifests: [{ platform: { os: "linux", architecture: "arm64" } }] };
  assert.throws(() => verifyIndex(Buffer.from(JSON.stringify(index))), /WRONG_PLATFORM/);
  index.manifests[0] = { platform: { os: "linux", architecture: "amd64" }, mediaType: "application/vnd.oci.image.manifest.v1+json", digest: "sha256:" + "0".repeat(64), size: 1021, data: "YQ==" };
  assert.throws(() => verifyIndex(Buffer.from(JSON.stringify(index))), /METADATA_DIGEST_MISMATCH/);
});

test("ustar headers are deterministic, safe, correctly sized and checksummed", () => {
  const header = tarHeader("manifest.json", 123);
  assert.equal(header.length, 512);
  assert.equal(header.subarray(257, 263).toString(), "ustar\0");
  assert.equal(parseInt(header.subarray(124, 135).toString(), 8), 123);
  const checksum = parseInt(header.subarray(148, 154).toString(), 8);
  const copy = Buffer.from(header); copy.fill(32, 148, 156);
  assert.equal(checksum, copy.reduce((sum, byte) => sum + byte, 0));
  assert.deepEqual(tarHeader("manifest.json", 123), header);
  for (const name of ["/tmp/x", "../x", "foo/../x", "x\n", "a".repeat(101)]) assert.throws(() => tarHeader(name, 123));
});

test("bounded download uses fixed HTTPS, refuses redirect and verifies bytes/hash (synthetic only)", async () => {
  const dir = await mkdtemp(join(tmpdir(), "zhitu-official-archive-unit-"));
  try {
    const payload = Buffer.from("synthetic");
    const digest = createHash("sha256").update(payload).digest("hex");
    let calls = 0;
    const fakeFetch = async (_url, options) => {
      calls += 1;
      assert.equal(options.redirect, "error"); assert.equal(options.headers["Accept-Encoding"], "identity");
      return new Response(payload, { status: 200, headers: { "content-length": String(payload.length) } });
    };
    await assert.rejects(download("https://third-party.invalid/layer", join(dir, "never"), 9, digest, fakeFetch), /NON_OFFICIAL_SOURCE/);
    assert.equal(calls, 0);
    await download(PIN.layerUrl, join(dir, "ok"), payload.length, digest, fakeFetch);
    assert.deepEqual(await readFile(join(dir, "ok")), payload);
    await assert.rejects(download(PIN.layerUrl, join(dir, "hash-fail"), payload.length, "0".repeat(64), fakeFetch), /DOWNLOAD_DIGEST_MISMATCH/);
    await assert.rejects(download(PIN.layerUrl, join(dir, "size-fail"), 1, digest, fakeFetch), /DOWNLOAD_SIZE_MISMATCH/);
    await assert.rejects(download(PIN.layerUrl, join(dir, "redirect-fail"), 1, digest, async () => ({ status: 200, redirected: true })), /DOWNLOAD_FAILED/);
  } finally {
    for (const name of ["ok", "hash-fail", "size-fail", "redirect-fail"]) await rm(join(dir, name), { force: true });
    await rmdir(dir);
  }
});

test("gzip layer verification is streaming and rejects altered diffID and oversize (synthetic only)", async () => {
  const dir = await mkdtemp(join(tmpdir(), "zhitu-official-diffid-unit-"));
  try {
    const bytes = Buffer.from("synthetic layer data\n".repeat(128));
    const path = join(dir, "layer.gz"); await writeFile(path, gzipSync(bytes));
    const diffId = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
    assert.deepEqual(await verifyUncompressedLayer(path, diffId), { bytes: bytes.length, diffId });
    await assert.rejects(verifyUncompressedLayer(path, "sha256:" + "0".repeat(64)), /LAYER_DIFFID_MISMATCH/);
    await assert.rejects(verifyUncompressedLayer(path, diffId, 100), /UNCOMPRESSED_SIZE_LIMIT/);
  } finally { await rm(join(dir, "layer.gz"), { force: true }); await rmdir(dir); }
});
