#!/usr/bin/env python3
"""把已规范化岗位转换为职途可复核的每日增量同步包。"""
from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

HASH_FIELDS = (
    "externalId", "company", "title", "location", "salaryText", "experience",
    "education", "description", "publishedAt", "expiresAt", "applyUrl", "normalizedUrl", "fingerprint",
)


def load_rows(path: Path) -> list[dict[str, Any]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    rows = payload.get("jobs", []) if isinstance(payload, dict) else payload
    if not isinstance(rows, list):
        raise SystemExit(f"ERROR {path} 必须是岗位数组或包含 jobs 数组的对象")
    return [row for row in rows if isinstance(row, dict)]


def key_for(job: dict[str, Any]) -> str:
    company = str(job.get("company") or "").casefold().strip()
    external_id = str(job.get("externalId") or "").casefold().strip()
    normalized_url = str(job.get("normalizedUrl") or job.get("applyUrl") or "").casefold().rstrip("/")
    fingerprint = str(job.get("fingerprint") or "").casefold().strip()
    if external_id:
        return f"id:{company}:{external_id}"
    if normalized_url:
        return f"url:{normalized_url}"
    return f"fp:{fingerprint}"


def hash_job(job: dict[str, Any]) -> str:
    stable = {field: job.get(field) for field in HASH_FIELDS}
    encoded = json.dumps(stable, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def previous_jobs(path: Path | None) -> dict[str, dict[str, Any]]:
    if path is None or not path.exists():
        return {}
    payload = json.loads(path.read_text(encoding="utf-8"))
    jobs = payload.get("jobs", {}) if isinstance(payload, dict) else {}
    return jobs if isinstance(jobs, dict) else {}


def write_json(path: Path, value: Any) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="生成职途每日岗位增量同步包")
    parser.add_argument("--input", action="append", required=True, help="可重复传入多个规范化岗位 JSON")
    parser.add_argument("--previous", help="上一次 catalog-snapshot.json；不存在时视为首次运行")
    parser.add_argument("--source-status", help="本批 source-status.json")
    parser.add_argument("--output-dir", required=True)
    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    previous = previous_jobs(Path(args.previous) if args.previous else None)
    merged: dict[str, dict[str, Any]] = {}
    duplicate_count = 0
    for input_name in args.input:
        for job in load_rows(Path(input_name)):
            key = key_for(job)
            if key in merged:
                duplicate_count += 1
            merged[key] = job

    current_snapshot: dict[str, dict[str, Any]] = {}
    upserts: list[dict[str, Any]] = []
    new_count = updated_count = unchanged_count = 0
    for key, job in sorted(merged.items()):
        digest = hash_job(job)
        current_snapshot[key] = {"hash": digest, "job": job}
        old = previous.get(key)
        if not isinstance(old, dict):
            new_count += 1
            upserts.append(job)
        elif old.get("hash") != digest:
            updated_count += 1
            upserts.append(job)
        else:
            unchanged_count += 1

    generated_at = datetime.now(timezone.utc).isoformat()
    missing_this_batch = len(set(previous) - set(current_snapshot))
    source_status: Any = []
    if args.source_status and Path(args.source_status).exists():
        source_status = json.loads(Path(args.source_status).read_text(encoding="utf-8"))

    snapshot = {"schemaVersion": "zhitu-catalog-snapshot/v1", "generatedAt": generated_at, "jobs": current_snapshot}
    manifest = {
        "schemaVersion": "zhitu-sync-manifest/v1",
        "generatedAt": generated_at,
        "inputs": [str(Path(name).resolve()) for name in args.input],
        "summary": {
            "currentBatch": len(merged),
            "new": new_count,
            "updated": updated_count,
            "unchanged": unchanged_count,
            "upserts": len(upserts),
            "duplicatesMerged": duplicate_count,
            "previousJobsNotSeenInThisBatch": missing_this_batch,
        },
        "deletePolicy": "none",
        "note": "本批未再次看到的岗位不会自动删除；需由官网下架复核流程另行确认。",
        "preferencesApplied": False,
        "sourceStatus": source_status,
    }
    write_json(output_dir / "zhitu-jobs.json", list(merged.values()))
    write_json(output_dir / "zhitu-upserts.json", upserts)
    write_json(output_dir / "catalog-snapshot.json", snapshot)
    write_json(output_dir / "sync-manifest.json", manifest)
    report = "\n".join([
        "# 职途每日岗位同步报告",
        "",
        f"生成时间：{generated_at}",
        "",
        f"- 本批有效岗位：{len(merged)}",
        f"- 新增：{new_count}",
        f"- 更新：{updated_count}",
        f"- 未变化：{unchanged_count}",
        f"- 合并重复：{duplicate_count}",
        f"- 本批未再次看到的历史岗位：{missing_this_batch}（不自动删除）",
        "- 个人偏好排序：未使用",
        "",
        "## 下一步",
        "",
        "先检查 source-status.json、随机打开官网岗位，再由职途维护者审核 zhitu-upserts.json。未经确认不得写数据库。",
        "",
    ])
    (output_dir / "collection-report.md").write_text(report, encoding="utf-8")
    print(json.dumps({"jobs": len(merged), "upserts": len(upserts), "outputDir": str(output_dir.resolve())}, ensure_ascii=False))


if __name__ == "__main__":
    main()
