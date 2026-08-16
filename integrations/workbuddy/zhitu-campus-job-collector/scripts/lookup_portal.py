#!/usr/bin/env python3
"""按公司或行业检索企业官方招聘入口。"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "assets" / "apply-portals.json"


def load() -> dict:
    if not DATA.is_file():
        raise SystemExit(f"ERROR FILE_NOT_FOUND {DATA}")
    return json.loads(DATA.read_text(encoding="utf-8"))


def main() -> None:
    parser = argparse.ArgumentParser(description="查询企业官方招聘入口")
    parser.add_argument("-q", "--query", help="公司名关键字")
    parser.add_argument("-i", "--industry", help="行业关键字")
    parser.add_argument("-n", "--limit", type=int, default=5)
    parser.add_argument("--json", action="store_true", help="输出 JSON")
    parser.add_argument("--list-industries", action="store_true")
    args = parser.parse_args()
    data = load()

    if args.list_industries:
        print(json.dumps(data.get("industries", []), ensure_ascii=False, indent=2) if args.json else "\n".join(data.get("industries", [])))
        return
    if not args.query and not args.industry:
        parser.error("请提供公司名或行业")

    hits = list(data.get("portals") or [])
    if args.query:
        key = args.query.strip().casefold()
        hits = [item for item in hits if key in str(item.get("name", "")).casefold()]
    if args.industry:
        key = args.industry.strip().casefold()
        hits = [item for item in hits if key in str(item.get("industry", "")).casefold()]
    order = {"有效": 0, "已修正": 1, "未找到": 2}
    hits.sort(key=lambda item: (order.get(item.get("status"), 9), item.get("name", "")))
    hits = hits[: max(1, min(args.limit, 20))]

    if args.json:
        print(json.dumps(hits, ensure_ascii=False, indent=2))
    elif not hits:
        print("未匹配到企业")
    else:
        for item in hits:
            print(f"{item['name']} ｜ {item['url']} ｜ [{item.get('status', '')}] ｜ {item.get('industry', '')}")


if __name__ == "__main__":
    main()
