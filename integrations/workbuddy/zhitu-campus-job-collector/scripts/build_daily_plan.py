#!/usr/bin/env python3
"""从官方招聘入口库生成可重复执行的每日轮转采集计划。"""
from __future__ import annotations

import argparse
import json
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any


def read_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def valid_portals(payload: Any) -> list[dict[str, Any]]:
    rows = payload.get("portals", []) if isinstance(payload, dict) else payload
    if not isinstance(rows, list):
        raise SystemExit("ERROR 入口库必须是数组或包含 portals 数组的对象")
    result: list[dict[str, Any]] = []
    seen: set[str] = set()
    for row in rows:
        if not isinstance(row, dict):
            continue
        url = str(row.get("url") or "").strip()
        if row.get("status") == "未找到" or not url.startswith(("http://", "https://")):
            continue
        key = url.casefold().rstrip("/")
        if key in seen:
            continue
        seen.add(key)
        result.append(row)
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="生成职途每日官方招聘入口采集计划")
    parser.add_argument("--portals", required=True)
    parser.add_argument("--state", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--batch-size", type=int, default=5)
    parser.add_argument("--date", default=date.today().isoformat())
    parser.add_argument("--force-next", action="store_true", help="同一天也推进到下一批")
    args = parser.parse_args()
    if not 1 <= args.batch_size <= 50:
        raise SystemExit("ERROR batch-size 必须在 1 到 50 之间")

    portals_path = Path(args.portals)
    state_path = Path(args.state)
    output_path = Path(args.output)
    portals = valid_portals(read_json(portals_path, {}))
    if not portals:
        raise SystemExit("ERROR 没有可用的官方招聘入口")

    state = read_json(state_path, {})
    if not isinstance(state, dict):
        state = {}
    if state.get("lastRunDate") == args.date and not args.force_next and isinstance(state.get("lastPlan"), list):
        selected = state["lastPlan"]
        reused = True
    else:
        cursor = int(state.get("cursor", 0)) % len(portals)
        count = min(args.batch_size, len(portals))
        selected = [portals[(cursor + offset) % len(portals)] for offset in range(count)]
        state = {
            "schemaVersion": "zhitu-daily-state/v1",
            "cursor": (cursor + count) % len(portals),
            "lastRunDate": args.date,
            "lastPlan": selected,
            "updatedAt": datetime.now(timezone.utc).isoformat(),
        }
        state_path.parent.mkdir(parents=True, exist_ok=True)
        state_path.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
        reused = False

    plan = {
        "schemaVersion": "zhitu-daily-plan/v1",
        "runDate": args.date,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "reusedSameDayPlan": reused,
        "sourceCatalog": str(portals_path.resolve()),
        "batchSize": len(selected),
        "scope": ["graduate", "internship"],
        "preferencesApplied": False,
        "sources": [
            {
                "company": row.get("name"),
                "officialUrl": row.get("url"),
                "status": row.get("status"),
                "industry": row.get("industry"),
                "note": row.get("note"),
            }
            for row in selected
        ],
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(plan, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"sources": len(selected), "reused": reused, "output": str(output_path.resolve()), "state": str(state_path.resolve())}, ensure_ascii=False))


if __name__ == "__main__":
    main()
