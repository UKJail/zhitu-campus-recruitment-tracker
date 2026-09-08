# Isolated resume PDF renderer

This directory defines an optional self-hosted DOCX-to-PDF worker. It is not installed or enabled by adding these files. The application fails closed with `RENDERER_UNAVAILABLE` until deployment explicitly enables a verified image.

## Deployment contract

- Linux Docker Engine, local Unix socket `/var/run/docker.sock` only. Remote Docker contexts and inherited Docker credentials are not used.
- Build with a reviewed Debian base pinned by digest. `RENDERER_BASE_IMAGE` has no default. The final runtime configuration accepts only a local `sha256:<64 hex>` image ID or a repository image pinned with `@sha256:<64 hex>`; tags are rejected and runtime pulls are forbidden.
- The Dockerfile installs LibreOffice Writer, Poppler, isolated-mode Python and open CJK/Latin fonts inside the container, not on the host desktop. Review security updates and rebuild/retest the image periodically. Font substitution can still differ from Microsoft Word; visual review remains required.
- Build context must be exactly this directory. Do not copy website environment files, customer documents, SSH material, Docker credentials, or production data into the image.

Example build command, replacing the explicit placeholder with a reviewed digest:

```sh
docker build --build-arg RENDERER_BASE_IMAGE=debian:bookworm-slim@sha256:REVIEWED_BASE_DIGEST -t zhitu-resume-pdf:reviewed integrations/resume-pdf-renderer
docker image inspect zhitu-resume-pdf:reviewed --format '{{.Id}}'
```

Configure the application only after the image passes the acceptance checks below:

```text
RESUME_PDF_BACKEND=docker
RESUME_PDF_DOCKER_PATH=/usr/bin/docker
RESUME_PDF_DOCKER_IMAGE=sha256:ACTUAL_VERIFIED_LOCAL_IMAGE_ID
RESUME_PDF_LOCK_PATH=/tmp/zhitutracker-resume-pdf.lock
```

Do not copy the placeholders literally. Old `RESUME_PDF_SOFFICE_PATH` and `RESUME_PDF_UNSHARE_PATH` values no longer enable conversion. There is no direct LibreOffice or unshare fallback, including when the website runs as root.

## Enforced runtime restrictions

The application starts one randomly named container per render with network `none`, read-only root filesystem, a non-root UID/GID, all Linux capabilities dropped, no-new-privileges, Docker's default seccomp policy, 512 MB memory including swap, one CPU, 64 PIDs, and bounded file descriptors/file sizes. No host PID/IPC namespace, privileged mode, devices, ports, Docker socket, website directory, credentials or extra volumes are mounted into it.

The **only host bind mount** is the single job's private input directory, mounted read-only at `/input`. The PDF and LibreOffice profile are generated in a 64 MB `/work` tmpfs; `/tmp` is a separate 64 MB tmpfs. Both disallow device nodes, setuid bits and direct execution. Poppler inspects page count, page size and text **inside the same restricted container**, never in the website process. Output is a JSON inspection line (at most 1 MB) followed by unchanged PDF bytes (at most 20 MB), both bounded by the host receiver. Docker logging is disabled so document text and PDF bytes are not retained in daemon logs. The original source bytes, confirmed words, columns, fonts and paragraph settings are not rewritten by this worker.

An internal 40-second watchdog covers **both conversion and PDF parsing**, even if the caller disconnects. The host imposes a 45-second limit, kills the Docker CLI process group, then attempts forced removal of the exact randomly named container with a separate 5-second limit. Watchdog exits 124/137 map to `RENDER_TIMEOUT` (137 may also mean a resource-limit kill). `--rm` also removes containers normally. Temporary host input is removed in `finally`. Host/daemon crashes can still require operator cleanup of stopped labelled containers; no process helper can promise cleanup during a host outage. Inspect exact container IDs before any manual cleanup; never remove arbitrary user containers.

## Host-wide admission and stale locks

Every request atomically creates the same private `RESUME_PDF_LOCK_PATH` file before source download, DOCX inspection or replacement. Authenticated routes use `renderVerifiedResumePdfFromSource(prepare)`; the original bytes entrypoint delegates to the same admission mechanism. All website processes on this host must use the **same absolute path**, with the same protected parent directory and website identity. The default is the OS temporary directory plus `zhitutracker-resume-pdf.lock`. Existing files (including symlinks, malformed files and old timestamps) return `RENDER_BUSY` immediately; there is no unbounded request queue. This limits the whole download/preflight/patch/conversion/inspection pipeline to one concurrent job per host and protects a small website server from simultaneous 512 MB containers.

Source preparation receives an AbortSignal and has a 15-second caller deadline. Prepare callbacks should pass the signal into their network operations. A callback that ignores abort does **not** release admission at the deadline: the exact pending operation must settle first, otherwise the service stays busy for operator review. Ownership/storage business errors propagate unchanged to route error mapping. DOCX archives are natively inflated with per-entry `maxOutputLength`, a 10 MB compressed input limit, a 32 MB actual aggregate output limit and CRC checks; forged central-directory size declarations cannot bypass the inflation cap. The renderer does not call JSZip on unverified uploads.

Normal release checks the file identity and exact random ownership metadata before removing only its own lock. Never automatically delete locks based on PID or age: PIDs can be reused and a slow old owner must not delete a new owner's lock. A website crash can deliberately leave the service busy. Recovery is an operator action: stop admission/website workers, verify the recorded process is gone and inspect all `com.zhitutracker.purpose=resume-pdf` containers, stop only any confirmed orphan jobs, verify the exact lock path is a regular private file, then remove that exact stale lock and restart workers. Do not install a blind cleanup cron or use wildcard container/file deletion. A multi-host deployment needs one admission policy per host (or a separately designed central queue).

Docker socket access is an administrative capability of the website process; it is **not** exposed to the document container. Prefer a dedicated renderer service/account for stronger separation from the website. Rootless Docker or daemon user-namespace remapping needs a separately tested UID/mount mapping; do not loosen permissions or add `--privileged` to make a failing deployment work.

## Acceptance before enabling production

1. Verify the final image digest, packages, security updates and readable CJK/Latin fonts. Confirm no secrets or private files in image layers.
2. Run the application's existing renderer contract tests. They verify arguments and cleanup behavior but do not prove Docker works on the host.
3. Run real, desensitized single-column and double-column A4 DOCX files through the actual container. Inspect every output PDF page visually at normal size for font changes, clipping, overlap and column/order changes.
4. Test overfull and non-A4 documents. They must return typed errors, without truncation, forced font shrinking or edited text. Test repeated dates, table text, headers, footers and missing glyphs.
5. Inspect an active synthetic job container: non-root identity, network none, read-only root, capabilities dropped, limits applied, exactly one read-only host mount, no website files or credentials. Docker must reject missing/unapproved images instead of pulling them.
6. Exercise a controlled timeout fixture and inspect that the container and temporary job input are removed. Verify no document/PDF data appears in process or daemon logs.
7. Start concurrent requests from independent website processes; exactly one may enter the renderer, all others must return `RENDER_BUSY`. Simulate an abandoned lock and verify it is not automatically stolen or removed by a later request.

`renderVerifiedResumePdf()` accepts only an actual one-page portrait A4 PDF whose text layer contains all supported confirmed DOCX runs and exactly the same normalized character counts. Added words, numbers and duplicated facts fail `TEXT_MISMATCH`; only whitespace and automatic bullet glyphs may be added. This deliberately rejects uncertain automatic numbering rather than accepting added facts. It returns `textLayerVerified: true`, `atsCompatibilityVerified: false` and `layoutReviewRequired: true`; the retained `atsTextVerified` field means **only this text-layer check**, not full ATS compatibility. Text counts do not prove ordering, column geometry, font size, clipping or visual fidelity, so the UI must not label these unverified properties as passed. Input PDF-to-editable-DOCX reconstruction and automatic paragraph compression remain outside this worker.

Official option references: [Docker container run](https://docs.docker.com/reference/cli/docker/container/run/) and [Docker container rm](https://docs.docker.com/reference/cli/docker/container/rm/).
