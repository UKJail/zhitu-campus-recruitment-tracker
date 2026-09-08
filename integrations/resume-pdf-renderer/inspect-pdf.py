"""Fixed-path PDF inspection. Runs only inside the restricted renderer image."""
import json
import math
import os
import re
import subprocess
import sys
import xml.etree.ElementTree as ET

PDF_PATH = "/work/resume.pdf"
MAX_TEXT_BYTES = 1024 * 1024
MAX_BBOX_BYTES = 4 * 1024 * 1024


def ordered_lines(lines, depth=0):
    """Recursive whitespace cuts, independent of the expected DOCX text.

    Separate actual vertical gutters first; full-width headings can instead
    create horizontal cuts. Never split a line, drop words or try alternate
    orders until one matches the source. Ambiguous regions retain row order.
    """
    if depth > 64:
        raise ValueError("layout complexity limit")
    if len(lines) < 2:
        return lines
    for start, end, minimum in [("x0", "x1", 12.0), ("y0", "y1", 8.0)]:
        intervals = sorted((line[start], line[end]) for line in lines)
        edge = intervals[0][1]
        gaps = []
        for low, high in intervals[1:]:
            if low - edge >= minimum:
                gaps.append((low - edge, (edge + low) / 2))
            edge = max(edge, high)
        if gaps:
            _, cut = max(gaps)
            before = [line for line in lines if line[end] < cut]
            after = [line for line in lines if line[start] > cut]
            if not before or not after or len(before) + len(after) != len(lines):
                raise ValueError("invalid layout cut")
            return ordered_lines(before, depth + 1) + ordered_lines(after, depth + 1)
    return sorted(lines, key=lambda line: (line["y0"], line["x0"], line["index"]))


def bbox_text(xml, width, height):
    # Only parse bounded Poppler output, never user-provided XML. Poppler emits
    # an XHTML public doctype; discard it, with no DTD/entity resolution.
    if "<!ENTITY" in xml or re.search(r"<!DOCTYPE[^>]*\[", xml, re.IGNORECASE):
        raise ValueError("unexpected XML declaration")
    xml = re.sub(r"<!DOCTYPE[^>]*>", "", xml, flags=re.IGNORECASE)
    root = ET.fromstring(xml)
    name = lambda element: element.tag.rsplit("}", 1)[-1]
    pages = [element for element in root.iter() if name(element) == "page"]
    if len(pages) != 1:
        raise ValueError("bounding page count")
    lines = []
    words_seen = 0
    for element in pages[0].iter():
        if name(element) != "line":
            continue
        words = [child for child in element if name(child) == "word"]
        words_seen += len(words)
        if words_seen > 20000 or len(lines) >= 2000:
            raise ValueError("bounding complexity limit")
        if not words:
            continue
        values = [float(element.attrib[key]) for key in ("xMin", "yMin", "xMax", "yMax")]
        x0, y0, x1, y1 = values
        if not all(math.isfinite(value) for value in values) or not (-2 <= x0 < x1 <= width + 2 and -2 <= y0 < y1 <= height + 2):
            raise ValueError("invalid bounding coordinates")
        text = " ".join("".join(word.itertext()) for word in words)
        lines.append(dict(x0=x0, y0=y0, x1=x1, y1=y1, text=text, index=len(lines)))
    if words_seen != sum(1 for element in pages[0].iter() if name(element) == "word"):
        raise ValueError("unassigned PDF words")
    text = "\n".join(line["text"] for line in ordered_lines(lines))
    if len(text.encode("utf-8")) > MAX_TEXT_BYTES:
        raise ValueError("text size limit")
    return text


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
    # Both -layout and default extraction can interleave independent columns.
    # Use line coordinates to separate whitespace-delimited regions once. The
    # exact-run and character-count checks in the website remain unchanged.
    text = ""
    if pages == 1 and width > 0 and height > 0:
        xml = bounded_output(["/usr/bin/pdftotext", "-enc", "UTF-8", "-bbox-layout", PDF_PATH, "-"], MAX_BBOX_BYTES)
        text = bbox_text(xml, width, height)
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
