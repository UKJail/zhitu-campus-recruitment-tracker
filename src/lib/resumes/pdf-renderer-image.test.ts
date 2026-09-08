// @vitest-environment node
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const imagePath = "integrations/resume-pdf-renderer/";

describe("portable restricted PDF image build contract", () => {
  it("uses legacy-compatible COPY and fixed non-writable executable modes", async () => {
    const dockerfile = await readFile(imagePath + "Dockerfile", "utf8");
    const copyLines = dockerfile.split(/\r?\n/).filter((line) => line.startsWith("COPY "));
    expect(copyLines).toEqual([
      "COPY render.sh /usr/local/bin/zhitu-render",
      "COPY render-job.sh /usr/local/bin/zhitu-render-job",
      "COPY inspect-pdf.py /usr/local/bin/zhitu-inspect-pdf",
    ]);
    expect(dockerfile).toContain("chmod 0555 /usr/local/bin/zhitu-render /usr/local/bin/zhitu-render-job /usr/local/bin/zhitu-inspect-pdf");
    expect(dockerfile).not.toContain("--mount=");
  });

  it("fails the build if runtime executables or Python standard-library modules are absent", async () => {
    const dockerfile = await readFile(imagePath + "Dockerfile", "utf8");
    for (const command of ["libreoffice", "timeout", "pdfinfo", "pdftotext"]) expect(dockerfile).toContain(`test -x /usr/bin/${command}`);
    expect(dockerfile).toContain('python3 -I -c "import json, os, re, subprocess, sys"');
    expect(dockerfile).toContain('install --no-install-recommends -y python3 ');
    expect(dockerfile).toContain('python3 -I -c "import math, xml.etree.ElementTree"');
    expect(dockerfile).toContain("/bin/sh -n /usr/local/bin/zhitu-render");
    expect(dockerfile).toContain("/bin/sh -n /usr/local/bin/zhitu-render-job");
    expect(dockerfile).toContain("compile(open('/usr/local/bin/zhitu-inspect-pdf'");
  });

  it("keeps the image unprivileged and relies on the runtime private tmpfs, not world-write permissions", async () => {
    const dockerfile = await readFile(imagePath + "Dockerfile", "utf8");
    expect(dockerfile).toContain("USER 10001:10001\nWORKDIR /work");
    expect(dockerfile).toContain("chmod 0755 /work");
    expect(dockerfile).not.toMatch(/chmod\s+0?777/);
    expect(dockerfile).not.toMatch(/^VOLUME|^EXPOSE/m);
  });

  it("allows only the three fixed runtime sources into the build context", async () => {
    const ignore = (await readFile(imagePath + ".dockerignore", "utf8")).trim().split(/\r?\n/);
    expect(ignore).toEqual(["*", "!Dockerfile", "!render.sh", "!render-job.sh", "!inspect-pdf.py"]);
  });

  it("extracts spatial line boxes without physical-row or raw-stream fallback", async () => {
    const inspector = await readFile(imagePath + "inspect-pdf.py", "utf8");
    expect(inspector).toContain('["/usr/bin/pdftotext", "-enc", "UTF-8", "-bbox-layout", PDF_PATH, "-"]');
    expect(inspector).not.toContain('"-layout"');
    expect(inspector).not.toContain('"-raw"');
  });
});
