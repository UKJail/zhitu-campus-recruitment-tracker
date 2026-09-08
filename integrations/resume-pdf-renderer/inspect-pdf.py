"""Fixed-path PDF inspection. Runs only inside the restricted renderer image."""
import json
import os
import re
import subprocess
import sys

PDF_PATH = "/work/resume.pdf"
MAX_TEXT_BYTES = 1024 * 1024


def bounded_output(command, limit):
    child = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                             stderr=subprocess.DEVNULL, env={"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8"})
    try:
        output = child.stdout.read(limit + 1)
        if len(output) > limit:
            raise ValueError("inspection output limit")
        if child.wait() != 0:
            raise ValueError("inspection failed")
        return output.decode("utf-8", errors="strict")
    finally:
        if child.poll() is None:
            child.kill()
        child.wait()


def inspect():
    if os.path.getsize(PDF_PATH) > 20 * 1024 * 1024:
        raise ValueError("PDF size limit")
    info = bounded_output(["/usr/bin/pdfinfo", "-f", "1", "-l", "1", "-box", PDF_PATH], 65536)
    count = re.search(r"^Pages:\s+(\d+)\s*$", info, re.MULTILINE)
    size = re.search(r"^Page(?:\s+\d+)? size:\s+([\d.]+)\s+x\s+([\d.]+)\s+pts", info, re.MULTILINE)
    rotation = re.search(r"^Page(?:\s+\d+)? rot:\s+(-?\d+)\s*$", info, re.MULTILINE)
    if not count or not size:
        raise ValueError("PDF metadata missing")
    pages = int(count[1])
    width, height = float(size[1]), float(size[2])
    if rotation and int(rotation[1]) % 360 != 0:
        width, height = 0, 0  # Rejected as PAGE_SIZE, not silently accepted as upright A4.
    # Use Poppler's reading-order extraction. Physical-layout output inserts
    # left-column words into wrapped right-column sentences, causing an intact
    # DOCX run to fail the downstream exact-text check. Do not weaken that check
    # or use raw content-stream order as a fallback when extraction disagrees.
    text = bounded_output(["/usr/bin/pdftotext", "-enc", "UTF-8", "-nopgbrk", PDF_PATH, "-"], MAX_TEXT_BYTES) if pages == 1 else ""
    payload = json.dumps({"pageCount": pages, "pages": [{"width": width, "height": height}], "text": text},
                         ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    if len(payload) > MAX_TEXT_BYTES:
        raise ValueError("inspection JSON limit")
    sys.stdout.buffer.write(payload + b"\n")


if __name__ == "__main__":
    try:
        inspect()
    except Exception:
        # No PDF text, customer data, temporary paths or parser logs are emitted.
        sys.exit(1)
