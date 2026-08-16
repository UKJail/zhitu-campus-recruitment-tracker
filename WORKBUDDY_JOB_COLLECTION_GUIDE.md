# WorkBuddy × 职途官方校招岗位日更交接

更新时间：2026-08-16
适用 Skill：`zhitu-campus-job-collector` 2.2.0

## 给 WorkBuddy 的固定任务

> 使用“职途校招岗位采集器”建立今天的官方岗位更新批次。只使用 Skill 中的企业官方招聘入口，收集无需登录即可公开查看的校招、应届生、管培生和实习岗位。不要读取我的简历或个人偏好，不做 S/A/B、推荐分、匹配分或个性化排序。
>
> 先生成 `daily-plan.json`，每批处理 3—5 家企业。逐一核验官方页面；登录、验证码、访问限制或页面结构变化时暂停该来源并写明原因。完成规范化、中文城市、去重、质量检查和每家公司至少 2 条人工抽样后，生成职途增量同步包。不要直接写数据库，只交付报告和文件绝对路径。

## 每日执行

在 Skill 目录执行：

```powershell
python scripts/build_daily_plan.py --portals assets/apply-portals.json --state out/daily-state.json --output out/daily-plan.json --batch-size 5
```

同一天重跑会复用同一批企业。确需当天继续下一批时：

```powershell
python scripts/build_daily_plan.py --portals assets/apply-portals.json --state out/daily-state.json --output out/daily-plan-02.json --batch-size 5 --force-next
```

对 `daily-plan.json` 中每家企业：

1. 打开 `officialUrl`，确认它仍是官方招聘入口。
2. 优先读取公开 Schema.org `JobPosting`；否则检查官网实际使用的公开岗位接口。
3. 不得登录、绕过验证码、猜测接口或抓取非公开数据。
4. 只保存校招、应届生、管培生和实习；普通社招排除。
5. 把英文、拼音和中英混合城市转为中文。
6. 将成功、空结果、受限和失败写入 `source-status.json`。

页面有 JSON-LD 时可执行：

```powershell
python scripts/collect_jsonld.py --company 企业中文名 --url 官方岗位页 --output out/当天批次/raw-jobs.json
python scripts/normalize_jobs.py --input out/当天批次/raw-jobs.json --output out/当天批次/zhitu-jobs.json
python scripts/validate_jobs.py --input out/当天批次/zhitu-jobs.json
```

## 生成职途同步包

首次运行：

```powershell
python scripts/build_sync_bundle.py --input out/当天批次/zhitu-jobs.json --source-status out/当天批次/source-status.json --output-dir out/当天批次/sync
```

后续运行，把上一次快照复制为 `previous-catalog-snapshot.json` 后执行：

```powershell
python scripts/build_sync_bundle.py --input out/当天批次/zhitu-jobs.json --previous out/previous-catalog-snapshot.json --source-status out/当天批次/source-status.json --output-dir out/当天批次/sync
```

## 交付物

```text
out/YYYY-MM-DD-批次名称/
├── daily-plan.json
├── raw-jobs.json
├── zhitu-jobs.json
├── source-status.json
└── sync/
    ├── zhitu-jobs.json
    ├── zhitu-upserts.json
    ├── catalog-snapshot.json
    ├── sync-manifest.json
    └── collection-report.md
```

- `zhitu-upserts.json`：相对上次快照新增或内容变化的岗位，是职途主要审核输入。
- `catalog-snapshot.json`：下次比较基线。
- `sync-manifest.json`：数量、来源状态及零删除策略。
- 本批没看到历史岗位不代表下架；不得据此自动删除。

## 可导入检查

- [ ] 所有岗位都能回到企业官方页面核验。
- [ ] 只包含公开校招、应届、管培或实习岗位。
- [ ] 城市为中文，多个城市使用“、”。
- [ ] 没有猜测日期、学历、经验、薪资或招聘类型。
- [ ] 官方链接可打开，且已移除跟踪参数。
- [ ] 已按来源岗位 ID、规范链接和指纹去重。
- [ ] 已运行 `validate_jobs.py`。
- [ ] 每家公司至少抽查 2 条岗位。
- [ ] 没有个人偏好、推荐等级或简历数据。
- [ ] 没有 Cookie、账号、令牌、验证码或 API 密钥。

## 同步边界

WorkBuddy 不直接写职途数据库。它只交付文件。由职途维护者二次校验 `zhitu-upserts.json`，用户确认后再通过服务端受控导入。本地整改期间不推送 GitHub、不部署 Vercel。

## 当前真实限制

官方入口库是网址目录，不代表 541 个网站都已有自动适配器。JSON-LD 页面可通用采集；动态招聘系统仍需逐站验证公开接口或增加专用适配器。受限来源必须暂停，不能用旧岗位或第三方聚合结果凑数。
