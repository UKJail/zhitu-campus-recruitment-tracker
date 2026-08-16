#!/usr/bin/env python3
"""将采集结果规范化为职途 CollectedJob JSON。"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from datetime import datetime, timezone
from html import unescape
from pathlib import Path
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

CITY_ALIASES = [
    ("香港", r"hong\s*kong(?:\s*sar)?|hongkong|香港"), ("北京", r"beijing|peking|北京"),
    ("上海", r"shanghai|上海"), ("深圳", r"shenzhen|深圳"), ("广州", r"guangzhou|canton|广州"),
    ("杭州", r"hangzhou|杭州"), ("南京", r"nanjing|南京"), ("苏州", r"suzhou|苏州"),
    ("成都", r"chengdu|成都"), ("重庆", r"chongqing|重庆"), ("武汉", r"wuhan|武汉"),
    ("西安", r"xi['’\s-]?an|xian|西安"), ("天津", r"tianjin|天津"), ("青岛", r"qingdao|tsingtao|青岛"),
    ("大连", r"dalian|大连"), ("厦门", r"xiamen|厦门"), ("长沙", r"changsha|长沙"),
    ("宁波", r"ningbo|宁波"), ("无锡", r"wuxi|无锡"), ("佛山", r"foshan|佛山"),
    ("东莞", r"dongguan|东莞"), ("珠海", r"zhuhai|珠海"), ("澳门", r"macao|macau|澳门"),
]


def text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    return re.sub(r"\s+", " ", unescape(re.sub(r"<[^>]+>", " ", str(value)))).strip()


def normalize_location(value: Any) -> str:
    source = text(value)
    hits: list[tuple[int, str]] = []
    for name, pattern in CITY_ALIASES:
        match = re.search(pattern, source, re.I)
        if match:
            hits.append((match.start(), name))
    if re.search(r"\b(?:remote|work\s*from\s*home)\b|远程", source, re.I):
        hits.append((len(source), "远程"))
    ordered = []
    for _, name in sorted(hits):
        if name not in ordered:
            ordered.append(name)
    if ordered:
        return "、".join(ordered)
    if re.search(r"mainland\s*china|china|中国大陆|中国", source, re.I):
        return "中国"
    if re.search(r"nationwide|全国", source, re.I):
        return "全国"
    return source


def normalize_url(value: str) -> str:
    parts = urlsplit(value.strip())
    query = [(key, val) for key, val in parse_qsl(parts.query, keep_blank_values=True) if not key.lower().startswith("utm_")]
    return urlunsplit((parts.scheme.lower(), parts.netloc.lower(), parts.path.rstrip("/") or "/", urlencode(query), ""))


def classify(item: dict[str, Any]) -> str:
    source = " ".join(text(item.get(key)) for key in ("title", "description", "experience", "employmentType", "recruitmentType"))
    if re.search(r"实习|intern(?:ship)?", source, re.I):
        return "实习"
    if re.search(r"校招|校园招聘|应届|毕业生|graduate|campus|new\s*grad", source, re.I):
        return "应届生"
    return "其他"


def iso_or_none(value: Any) -> str | None:
    raw = text(value)
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00")).isoformat()
    except ValueError:
        return raw


def main() -> None:
    parser = argparse.ArgumentParser(description="规范化职途岗位")
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--include-other", action="store_true", help="保留无法确认是校招或实习的岗位")
    args = parser.parse_args()
    payload = json.loads(Path(args.input).read_text(encoding="utf-8"))
    rows = payload.get("jobs", []) if isinstance(payload, dict) else payload
    if not isinstance(rows, list):
        raise SystemExit("ERROR 输入必须是岗位数组或包含 jobs 数组的对象")

    output_rows: list[dict[str, Any]] = []
    seen: set[str] = set()
    excluded = 0
    for item in rows:
        if not isinstance(item, dict):
            continue
        job_type = classify(item)
        if job_type == "其他" and not args.include_other:
            excluded += 1
            continue
        company = text(item.get("company"))
        title = text(item.get("title"))
        location = normalize_location(item.get("location"))
        apply_url = text(item.get("applyUrl") or item.get("url"))
        normalized_url = normalize_url(apply_url) if apply_url.startswith(("http://", "https://")) else apply_url
        external_id = text(item.get("externalId")) or hashlib.sha256(f"{company}|{title}|{location}|{normalized_url}".encode()).hexdigest()[:24]
        fingerprint = hashlib.sha256(f"{company.casefold()}|{title.casefold()}|{location.casefold()}".encode()).hexdigest()
        key = normalized_url or f"{external_id}|{fingerprint}"
        if key in seen:
            continue
        seen.add(key)
        raw = item.get("rawData") if isinstance(item.get("rawData"), dict) else dict(item)
        raw["zhituRecruitmentType"] = job_type
        output_rows.append({
            "externalId": external_id,
            "company": company,
            "title": title,
            "location": location,
            "salaryText": text(item.get("salaryText")) or None,
            "experience": text(item.get("experience")) or job_type,
            "education": text(item.get("education")) or None,
            "description": text(item.get("description")),
            "publishedAt": iso_or_none(item.get("publishedAt")),
            "expiresAt": iso_or_none(item.get("expiresAt")),
            "applyUrl": apply_url,
            "normalizedUrl": normalized_url,
            "fingerprint": fingerprint,
            "rawData": raw,
        })

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(output_rows, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"input": len(rows), "kept": len(output_rows), "excludedNonCampus": excluded, "output": str(output.resolve()), "generatedAt": datetime.now(timezone.utc).isoformat()}, ensure_ascii=False))


if __name__ == "__main__":
    main()
