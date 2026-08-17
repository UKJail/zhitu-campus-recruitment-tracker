---
name: zhitu-campus-job-collector
description: 为职途 Tracker 按周采集 OfferStar 公开岗位快照，并核验中国大陆及香港企业校招入口，生成可复核、可同步到职途的固定格式文件。用户说“每周更新岗位”“采集 OfferStar”“同步职途职位库”“导出职途岗位 JSON”“检查企业校招入口”时使用。具体岗位以 OfferStar 为主；企业官网入口只做入口目录。只访问无需登录、无需验证码的公开页面或公开接口；不读取个人求职偏好，不做 S/A/B 排序，不自动投递。
---

# 职途校招岗位采集器

把 OfferStar 公开岗位维护成可每周更新、可校验、可去重、可交给职途的职位库主数据源；把企业官方招聘入口维护成独立入口目录。

## 每周流程

1. 抓取 OfferStar 当前公开岗位列表，生成全量快照。
2. 严格保留 OfferStar 页面默认顺序；不要按更新时间、公司、标题、偏好或本地解析日期重新排序。
3. 每条岗位尽量采齐职途展示需要的 10 列：公司名称、标题、批次、更新时间、招聘岗位、工作地点、行业、招聘类型、截止时间、操作链接。
4. 对同一来源 ID、规范化链接和公司+标题+地点指纹去重；不要因为缺少 JD 而丢弃岗位，也不要虚构 JD、薪资、学历、经验或岗位详情。
5. 同步核验企业校招入口目录，只输出企业名称、行业、官方招聘网址和状态；入口目录不替代具体岗位。
6. 输出固定 `latest` 文件和本次报告；校验通过后再覆盖 `latest`，失败时保留旧结果。
7. 只把报告和文件路径交给职途维护者。未经用户确认不得写数据库、修改职途项目、推送 GitHub 或部署。

## 固定边界

- 具体岗位现阶段以 OfferStar 公开页面为主来源。
- 企业官网只用于“企业校招入口”目录，除非它本身有稳定、无需登录、无需验证码的公开岗位接口。
- 遇到登录、验证码、401、403、412、429、反爬或频率限制时暂停来源并记录原因。
- 默认保留 OfferStar 中的校招、实习、应届、管培等面向学生和应届毕业生的岗位；明显社招岗位可标记为“其他”或剔除并写入报告。
- 不读取简历、用户偏好或账户资料，不生成推荐分、匹配分或录取概率。
- 不自动注册、不自动投递、不保存 Cookie、令牌、验证码或个人信息。
- “本周未再次看到”不等于下架；如需删除旧岗位，由 Codex 和用户另行确认。当前职途以最新 OfferStar 全量快照替换展示目录。

## 输出

所有周任务写入固定目录：

```text
C:\Users\k'k\WorkBuddy\zhitu-career-jobs\
├─ latest\
│  ├─ offerstar-to-zhitu.json
│  ├─ offerstar-to-zhitu-report.json
│  ├─ offerstar-run-summary.json
│  ├─ career-portals.json
│  ├─ career-portals-report.md
│  └─ career-portals-run-summary.json
├─ history\YYYY-MM-DD\
└─ failed-runs\YYYY-MM-DD-HHmmss\
```

详细规则：

- `references/source-policy.md`：来源与访问限制。
- `references/job-schema.md`：职途字段与质量要求。
- `references/daily-update.md`：每周更新、固定 latest 和失败恢复。
- `references/zhitu-integration.md`：职途 Worker 接收方式。
- `references/workbuddy-handoff.md`：完整交付清单。

## 常用命令

WorkBuddy 可使用自己的采集脚本，但最终必须满足 `WORKBUDDY_WEEKLY_SYNC_HANDOFF.md` 和 `references/job-schema.md`。

只报告真实采集结果。没有岗位时说明原因，不生成示例岗位凑数。
