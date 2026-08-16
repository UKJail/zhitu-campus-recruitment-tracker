# 职途接入说明

职途 Worker 的接口位于 `D:/求职追踪网页/worker/types.ts`，采集结果必须兼容 `CollectedJob`。

## 推荐方式

1. WorkBuddy 只读采集并输出 `out/zhitu-jobs.json`，再生成 `zhitu-upserts.json` 增量文件。
2. 运行 `scripts/validate_jobs.py`。
3. 人工检查随机样本的官网链接、日期、城市和招聘类型。
4. 由职途 Worker 的 `JobSourceAdapter.collect()` 或受控导入器读取 `zhitu-upserts.json`。
5. 使用现有 Repository 做来源岗位 ID、规范链接和指纹去重。

## 当前可复用能力

- `worker/location.ts`：英文和拼音城市转中文。
- `worker/adapters/official-career-page.ts`：通用 JSON-LD 岗位。
- `worker/adapters/baidu-careers.ts`：百度官方岗位。
- `worker/adapters/tencent-careers.ts`：腾讯官方岗位。
- `worker/adapters/greenhouse.ts`：Greenhouse 公开职位系统。

同步器不生成删除操作；某岗位未出现在单个每日批次中不代表已下架。禁止在 Skill、输出文件或聊天里保存 Supabase 管理密钥。实际写库必须使用职途服务端环境，并在写入前取得用户确认。
