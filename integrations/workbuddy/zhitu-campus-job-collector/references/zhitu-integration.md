# 职途接入说明

职途当前具体岗位目录由 OfferStar 全量 JSON 驱动；企业校招入口目录独立展示。WorkBuddy 不直接写数据库，只把固定格式文件交给 Codex 同步。

## 推荐方式

1. WorkBuddy 只读采集并输出 `C:\Users\k'k\WorkBuddy\zhitu-career-jobs\latest\offerstar-to-zhitu.json`。
2. 同步输出 `offerstar-to-zhitu-report.json` 和 `offerstar-run-summary.json`。
3. 同步核验企业入口并输出 `career-portals.json`、`career-portals-report.md` 和 `career-portals-run-summary.json`。
4. 由 Codex 在 `D:\求职追踪网页` 中执行 `npm.cmd run sync:offerstar` 和 `npm.cmd run sync:career-portals`。
5. Codex 运行测试、代码检查和构建，通过后交给用户在本地页面验收。

## 当前可复用能力

- `worker/location.ts`：英文和拼音城市转中文。
- `worker/adapters/official-career-page.ts`：通用 JSON-LD 岗位。
- `worker/adapters/baidu-careers.ts`：百度官方岗位。
- `worker/adapters/tencent-careers.ts`：腾讯官方岗位。
- `scripts/sync-workbuddy-offerstar.mjs`：读取 WorkBuddy OfferStar 全量快照并同步到职途职位库。
- `scripts/sync-career-portals.mjs`：读取企业校招入口目录并同步到职途。

禁止在 Skill、输出文件或聊天里保存 Supabase 管理密钥。实际写库或发布必须由 Codex 在职途项目中执行，并在写入或发布前取得用户确认。
