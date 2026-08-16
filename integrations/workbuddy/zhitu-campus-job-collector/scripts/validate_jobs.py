#!/usr/bin/env python3
"""检查职途岗位 JSON 并输出只读质量报告。"""
from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path
from urllib.parse import urlsplit

REQUIRED = ("externalId", "company", "title", "location", "description", "applyUrl", "normalizedUrl", "fingerprint")


def main() -> None:
    parser = argparse.ArgumentParser(description="校验职途岗位 JSON")
    parser.add_argument("--input", required=True)
    args = parser.parse_args()
    rows = json.loads(Path(args.input).read_text(encoding="utf-8"))
    if not isinstance(rows, list):
        raise SystemExit("ERROR 输入必须是 JSON 数组")

    missing: Counter[str] = Counter()
    invalid_urls = 0
    fingerprints: Counter[str] = Counter()
    cities: Counter[str] = Counter()
    types: Counter[str] = Counter()
    for row in rows:
        for field in REQUIRED:
            if not row.get(field):
                missing[field] += 1
        url = urlsplit(str(row.get("applyUrl", "")))
        if url.scheme not in {"http", "https"} or not url.netloc:
            invalid_urls += 1
        fingerprints[str(row.get("fingerprint", ""))] += 1
        cities[str(row.get("location") or "未识别")] += 1
        raw = row.get("rawData") if isinstance(row.get("rawData"), dict) else {}
        types[str(raw.get("zhituRecruitmentType") or "未识别")] += 1

    duplicates = sum(count - 1 for key, count in fingerprints.items() if key and count > 1)
    report = {
        "jobs": len(rows),
        "missingRequired": dict(missing),
        "invalidApplyUrls": invalid_urls,
        "duplicateFingerprints": duplicates,
        "recruitmentTypes": dict(types),
        "topLocations": dict(cities.most_common(20)),
        "ready": not missing and invalid_urls == 0 and duplicates == 0,
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    raise SystemExit(0 if report["ready"] else 2)


if __name__ == "__main__":
    main()
