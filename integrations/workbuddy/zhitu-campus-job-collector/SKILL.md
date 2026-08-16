---
name: zhitu-campus-job-collector
description: 为职途 Tracker 按日收集中国大陆及香港企业官方招聘网站上的公开校招、应届生、管培生和实习岗位，并生成可复核的增量同步包。用户说“每日更新校招岗位”“采集企业官网岗位”“同步职途职位库”“导出职途岗位 JSON”或“检查官方招聘入口”时使用。只访问无需登录、无需验证码的官方公开页面或公开接口；不读取个人求职偏好，不做 S/A/B 排序，不自动投递。
---

# 职途校招岗位采集器

把企业官方招聘入口维护成可每日轮转、可校验、可去重、可交给职途的公开校招岗位数据源。

## 每日流程

1. 运行 `scripts/build_daily_plan.py`，从 `assets/apply-portals.json` 生成当日 3—5 家企业的采集计划。同一天重复运行复用原计划，不重复推进游标。
2. 对计划内官网做只读探测：优先 Schema.org `JobPosting`，其次是官网页面实际调用的无需登录公开接口。不得猜测接口参数。
3. 页面有 JSON-LD 时运行 `scripts/collect_jsonld.py`。动态站点按官网实际公开请求建立或复用专用适配器。
4. 运行 `scripts/normalize_jobs.py`，只保留校招、应届生、管培生和实习岗位，统一中文城市、规范链接和指纹。
5. 运行 `scripts/validate_jobs.py`。必填字段、官方链接、中文城市、日期或重复不合格时不得进入同步包。
6. 每家公司至少人工打开 2 条岗位核对官网详情。受限、失败、无有效岗位必须写入 `source-status.json`。
7. 运行 `scripts/build_sync_bundle.py`，生成职途全批文件、增量 upsert 文件、快照、清单和报告。
8. 只把报告和文件路径交给职途维护者。未经用户确认不得写数据库。

## 固定边界

- 只采集企业官方招聘域名、企业明确授权的招聘系统或无需登录的公开接口。
- 聚合页和搜索结果只能发现线索；必须回官网核验，未核验记录不得导入。
- 遇到登录、验证码、401、403、412、429、反爬或频率限制时暂停来源并记录原因。
- 默认排除普通社招；官网明确接受应届生时方可保留。
- 默认排除发布超过 180 天且官网未证明仍开放的岗位。
- 不读取简历、用户偏好或账户资料，不生成推荐分、匹配分或录取概率。
- 不自动注册、不自动投递、不保存 Cookie、令牌、验证码或个人信息。
- “本批未再次看到”不等于下架；同步包只生成新增/更新，不自动删除职途岗位。

## 输出

每批目录至少包含：

- `daily-plan.json`
- `raw-jobs.json`
- `zhitu-jobs.json`
- `zhitu-upserts.json`
- `source-status.json`
- `catalog-snapshot.json`
- `sync-manifest.json`
- `collection-report.md`

详细规则：

- `references/source-policy.md`：来源与访问限制。
- `references/job-schema.md`：职途字段与质量要求。
- `references/daily-update.md`：每日轮转、增量包和失败恢复。
- `references/zhitu-integration.md`：职途 Worker 接收方式。
- `references/workbuddy-handoff.md`：完整交付清单。

## 常用命令

```powershell
python scripts/build_daily_plan.py --portals assets/apply-portals.json --state out/daily-state.json --output out/daily-plan.json --batch-size 5
python scripts/collect_jsonld.py --company 腾讯 --url https://careers.tencent.com/ --output out/raw-jobs.json
python scripts/normalize_jobs.py --input out/raw-jobs.json --output out/zhitu-jobs.json
python scripts/validate_jobs.py --input out/zhitu-jobs.json
python scripts/build_sync_bundle.py --input out/zhitu-jobs.json --previous out/previous-catalog-snapshot.json --output-dir out/sync
```

只报告真实采集结果。没有岗位时说明原因，不生成示例岗位凑数。
