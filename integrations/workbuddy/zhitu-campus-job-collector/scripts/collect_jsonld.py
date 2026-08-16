#!/usr/bin/env python3
"""从公开网页提取 Schema.org JobPosting；不处理登录或验证码。"""
from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from html.parser import HTMLParser
from pathlib import Path
from typing import Any
from urllib.parse import urljoin


class JsonLdParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.inside = False
        self.buffer: list[str] = []
        self.blocks: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = {key.lower(): (value or "") for key, value in attrs}
        if tag.lower() == "script" and "ld+json" in values.get("type", "").lower():
            self.inside = True
            self.buffer = []

    def handle_data(self, data: str) -> None:
        if self.inside:
            self.buffer.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() == "script" and self.inside:
            self.blocks.append("".join(self.buffer))
            self.inside = False


def iter_nodes(value: Any):
    if isinstance(value, list):
        for item in value:
            yield from iter_nodes(item)
    elif isinstance(value, dict):
        yield value
        if "@graph" in value:
            yield from iter_nodes(value["@graph"])


def is_job(node: dict[str, Any]) -> bool:
    kind = node.get("@type")
    return kind == "JobPosting" or isinstance(kind, list) and "JobPosting" in kind


def address_text(value: Any) -> str:
    if isinstance(value, list):
        return "; ".join(filter(None, (address_text(item) for item in value)))
    if not isinstance(value, dict):
        return str(value or "").strip()
    address = value.get("address", value)
    if not isinstance(address, dict):
        return str(address or "").strip()
    return ", ".join(str(address.get(key, "")).strip() for key in ("addressLocality", "addressRegion", "addressCountry") if address.get(key))


def main() -> None:
    parser = argparse.ArgumentParser(description="提取公开页面中的 JSON-LD JobPosting")
    parser.add_argument("--company", required=True)
    parser.add_argument("--url", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    request = urllib.request.Request(args.url, headers={"User-Agent": "ZhituCampusCollector/2.0 (+read-only public job metadata)"})
    try:
        with urllib.request.urlopen(request, timeout=25) as response:
            final_url = response.geturl()
            html = response.read(8_000_000).decode(response.headers.get_content_charset() or "utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        reason = "restricted" if exc.code in {401, 403, 429} else "http_error"
        print(json.dumps({"jobs": [], "restricted": reason == "restricted", "reason": f"HTTP {exc.code}"}, ensure_ascii=False))
        raise SystemExit(3)
    except (urllib.error.URLError, TimeoutError) as exc:
        print(json.dumps({"jobs": [], "restricted": False, "reason": str(exc)}, ensure_ascii=False))
        raise SystemExit(4)

    html_parser = JsonLdParser()
    html_parser.feed(html)
    jobs: list[dict[str, Any]] = []
    for block in html_parser.blocks:
        try:
            value = json.loads(block)
        except json.JSONDecodeError:
            continue
        for node in iter_nodes(value):
            if not is_job(node):
                continue
            identifier = node.get("identifier")
            if isinstance(identifier, dict):
                identifier = identifier.get("value") or identifier.get("name")
            jobs.append({
                "externalId": str(identifier or node.get("url") or ""),
                "company": args.company,
                "title": str(node.get("title") or "").strip(),
                "location": address_text(node.get("jobLocation") or node.get("applicantLocationRequirements")),
                "salaryText": node.get("baseSalary"),
                "experience": node.get("experienceRequirements"),
                "education": node.get("educationRequirements"),
                "description": str(node.get("description") or "").strip(),
                "publishedAt": node.get("datePosted"),
                "expiresAt": node.get("validThrough"),
                "applyUrl": urljoin(final_url, str(node.get("url") or final_url)),
                "rawData": node,
            })

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(jobs, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"source": final_url, "jsonLdBlocks": len(html_parser.blocks), "jobs": len(jobs), "output": str(output.resolve())}, ensure_ascii=False))


if __name__ == "__main__":
    main()
