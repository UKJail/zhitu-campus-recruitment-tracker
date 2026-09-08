# Pinned official Debian base archive (operator preparation only)

This is an optional, explicit operator path when the official container registry
is unavailable but the official Debian artifact repository is reachable. It is
not a third-party mirror, proxy, registry reconfiguration, or TLS bypass. If the
official GitHub source is also blocked, stop; do not substitute an unverified source.

## Verified provenance

- [Docker's official Debian image page](https://hub.docker.com/_/debian) links
  `trixie-slim` to the Debian-maintained artifact repository below.
- Fixed commit: `bae6d64d90b4068b09ff9d8b564c2773ef5d8d83`.
- [OCI index](https://github.com/debuerreotype/docker-debian-artifacts/blob/bae6d64d90b4068b09ff9d8b564c2773ef5d8d83/trixie/slim/oci/index.json)
  embeds the amd64 manifest and its original config, each with a SHA256 and byte count.
- The [hash-named layer entry](https://github.com/debuerreotype/docker-debian-artifacts/blob/bae6d64d90b4068b09ff9d8b564c2773ef5d8d83/trixie/slim/oci/blobs/sha256/6310eb16bf4251731feab01e8f633bf5e2d75a657ccad97f420b1f83cce457be)
  is a **symlink**, not the compressed layer: its content is `../rootfs.tar.gz`.
- The [actual 28.4 MB layer](https://github.com/debuerreotype/docker-debian-artifacts/blob/bae6d64d90b4068b09ff9d8b564c2773ef5d8d83/trixie/slim/oci/blobs/rootfs.tar.gz)
  can be addressed directly on `raw.githubusercontent.com` at that same commit.

| Artifact | SHA256 | Bytes |
| --- | --- | --- |
| amd64 manifest | `abc9cb88a5587630d7f915f47b23b0668fe250fbfc6457aa4d52b534c1bbf73f` | 1,021 |
| original config / expected image ID | `e426a54f50cc4cf82dd5cab8ba8426ed02c391840cb5a62dfd987542dbabea3b` | 451 |
| compressed layer | `6310eb16bf4251731feab01e8f633bf5e2d75a657ccad97f420b1f83cce457be` | 29,792,658 |

The script additionally streams gzip decompression and verifies the uncompressed
layer against the **diffID from the original, hash-verified config**. It never
extracts files from the root filesystem archive. Decompression is bounded to
512 MiB / 45 seconds and does not retain the uncompressed layer in memory or on disk.

## Prepare, without loading

Use Node 22 or newer and a **not-yet-existing absolute directory**. Do not pre-create
that directory. This command downloads public official artifacts but does not call Docker:

```sh
/usr/bin/node scripts/prepare-official-debian-archive.mjs --download --out=/tmp/zhitu-official-debian-UNIQUE
```

No arguments or `--help` prints usage without network access or file writes.
The download mode accepts only its two fixed HTTPS URLs, refuses redirects and unexpected
HTTP content encoding, limits byte counts and download time, preserves the original
config bytes, and creates a private directory with exclusive-create files.
It neither reads `.env` nor requests credentials. A failed run retains private
intermediates for operator review and never writes a successful provenance report.
Never load a partial archive from a failed run. Nothing automatically retries.

## Offline preparation from an official Git fetch

If `github.com` is reachable while Docker Hub and `raw.githubusercontent.com` are
not, an operator may obtain exactly these same pinned files using the official
repository's Git transport. This is still the same upstream, not a mirror. The
Node helper's offline mode does **not** run Git or access the network itself:

```sh
/usr/bin/node scripts/prepare-official-debian-archive.mjs --offline-dir=/absolute/pinned-files --out=/tmp/zhitu-official-debian-NEW-UNIQUE
```

The input directory must contain regular, non-symlink `index.json` and
`rootfs.tar.gz`. Only these two names are opened. Their private output copies are
bounded and checked against the same pinned manifest/config/layer hashes and
uncompressed diffID as HTTPS mode. Wrong size, modified bytes, special files,
existing output directories and missing files stop preparation. Input files are
not modified. No credentials, `.env`, Git settings, or other directory files are read.
`prepareFromFiles({ sourceDirectory, out })` is also exported for operator code.
Its successful report has `sourceMode: "offline-pinned-files"`.

### Minimal partial Git acquisition (operator only)

First check the server's Git version supports partial fetch. Run the following in
a separate shell. It creates its own private temporary repository, never changes
the website repository, avoids global/system Git configuration and credentials,
keeps TLS verification enabled, and refuses HTTP redirects. It fetches one pinned
commit at depth 1 with blobs omitted, then requests only the two needed contents.
No checkout is done, so no other working-tree files or hooks are loaded.
[Git fetch filtering](https://git-scm.com/docs/git-fetch),
[partial-clone lazy fetching](https://git-scm.com/docs/partial-clone),
[git show](https://git-scm.com/docs/git-show).

```sh
(
set -eu
umask 077
export GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null GIT_TERMINAL_PROMPT=0
task_debian_git=$(mktemp -d /tmp/zhitu-debian-git.XXXXXX)
git -C "$task_debian_git" init -q
git -C "$task_debian_git" remote add origin https://github.com/debuerreotype/docker-debian-artifacts.git
git -C "$task_debian_git" config credential.helper ''
git -C "$task_debian_git" config http.sslVerify true
git -C "$task_debian_git" config http.followRedirects false
git -C "$task_debian_git" config remote.origin.promisor true
git -C "$task_debian_git" config remote.origin.partialclonefilter blob:none
git -C "$task_debian_git" -c protocol.version=2 fetch --depth=1 --filter=blob:none --no-tags --no-recurse-submodules origin bae6d64d90b4068b09ff9d8b564c2773ef5d8d83
test "$(git -C "$task_debian_git" rev-parse FETCH_HEAD)" = bae6d64d90b4068b09ff9d8b564c2773ef5d8d83
mkdir "$task_debian_git/artifacts"
git -C "$task_debian_git" show 'bae6d64d90b4068b09ff9d8b564c2773ef5d8d83:trixie/slim/oci/index.json' > "$task_debian_git/artifacts/index.json"
git -C "$task_debian_git" show 'bae6d64d90b4068b09ff9d8b564c2773ef5d8d83:trixie/slim/oci/blobs/rootfs.tar.gz' > "$task_debian_git/artifacts/rootfs.tar.gz"
printf 'offline_dir=%s/artifacts\n' "$task_debian_git"
)
```

Inspect progress during the fetch. If filtering is unsupported/ignored or an
unexpectedly large pack is transferred, stop. Do not remove the filter, perform
a full clone, follow a third-party URL, disable TLS, or substitute another commit.
Sparse checkout is unnecessary for this two-file task; it would add a working
tree without reducing transfer further than the two explicit blob requests.
These instructions are an acquisition recipe, **not a claim that this server's
Git transport or the resulting Docker archive has already been verified live**.

On success, the directory contains:

- `index.json` and `rootfs.tar.gz`: verified upstream materials;
- `debian-trixie-slim-amd64.docker.tar`: Docker archive containing `manifest.json`,
  the original config and original compressed layer;
- `provenance.json`: pins, diffID verification, archive byte count and SHA256,
  expected image ID, and `dockerLoaded: false`.

The Docker archive declares **no tags**, so a later operator load does not replace
`debian:trixie-slim` or any user tag. The expected loaded image ID is
`sha256:e426a54f50cc4cf82dd5cab8ba8426ed02c391840cb5a62dfd987542dbabea3b`.
Keep registry manifest digest, compressed-layer digest, diffID, and image ID distinct.

## Why `load`, not `import`

[Docker 26.1.3's loader](https://github.com/moby/moby/blob/v26.1.3/image/tarexport/load.go)
reads the config named by `manifest.json`, decompresses each layer, validates its
diffID, and creates the image from the original config bytes. Its source supports
gzip-compressed layer files. In contrast, importing only a rootfs tar regenerates
image configuration and does not preserve that image ID, command, environment or history.
See also [Docker image load](https://docs.docker.com/reference/cli/docker/image/load/).

Actual daemon loading, ID verification, any local tagging, renderer builds, base
updates, and deployment require a separate authorized operator step. This helper
does none of them. The archive format is checked against Docker 26.1.3 source;
**successful live loading is not claimed until tested on the target daemon**.
Also, preparing a base image does not supply LibreOffice/fonts: the renderer build
still needs its explicitly configured official Debian package repositories.
