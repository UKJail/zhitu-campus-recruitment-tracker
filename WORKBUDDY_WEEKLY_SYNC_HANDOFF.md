# WorkBuddy → 职途每周岗位更新交接规范

## 目标

WorkBuddy 每周只负责采集和核验公开信息，并生成固定格式文件；Codex 负责校验、同步到职途、本地验收，以及在用户明确批准后发布。WorkBuddy 不直接写职途数据库、不修改 `D:\求职追踪网页`、不推送 GitHub、不部署 Vercel。

具体岗位以 OfferStar 全量快照为职途职位库的唯一目录来源。企业校招入口作为独立目录，展示企业名称、行业和“进入官方招聘网站”按钮。

## 固定目录

不要再使用带日期的临时会话目录。所有周任务写入：

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

`latest` 只能保存最后一次完整通过校验的结果。先写临时文件，校验成功后再原子替换；失败时保留旧 `latest`，把失败文件和原因放入 `failed-runs`。

## 每周一任务

建议每周一 03:00 执行：

1. 重新抓取 OfferStar 当前公开岗位，输出全量快照 `offerstar-to-zhitu.json`。
2. 对同一来源 ID 去重；不要因为缺少 JD 而丢弃岗位，也不要虚构 JD、薪资、学历或经验。
3. 保留原始投递或详情链接；链接必须为 `http://` 或 `https://`。
4. 核验企业校招入口：企业名称、行业、官方招聘网址。不可访问、受限、季节性关闭的入口保留状态，不猜测替代网址。
5. 将本次完整结果复制到 `history\YYYY-MM-DD`，再更新 `latest`。

若岗位总数相较上周下降超过 5%，或必填字段缺失、来源 ID 重复、URL 非法，则本次任务标记失败，不覆盖 `latest`。

## OfferStar 文件契约

`offerstar-to-zhitu.json` 必须为 JSON 数组，每项至少包含：

```json
{
  "externalId": "offerstar-稳定来源ID",
  "company": "企业名称",
  "title": "岗位名称",
  "location": "中文城市或地点请查看原文",
  "experience": "应届或实习",
  "applyUrl": "https://原始详情或投递链接",
  "normalizedUrl": "https://规范化链接",
  "recruitmentType": "应届生或实习",
  "industry": "行业，无法确认可为空",
  "postDate": "来源显示的发布日期，无法确认可为空",
  "deadline": "来源显示的截止日期，无法确认可为空"
}
```

没有 JD 属于允许状态。不要用标题或通用文案伪造 description。

`offerstar-run-summary.json` 至少记录：运行时间、源记录数、有效数、重复数、拒绝数、与上周相比新增/消失/变化数量、失败来源和错误摘要。

## 企业入口文件契约

`career-portals.json` 的根对象必须含 `generatedAt` 和 `portals`。每项至少包含：

```json
{
  "companyKey": "稳定且唯一的企业键",
  "companyName": "企业名称",
  "industry": "行业",
  "officialCareerUrl": "https://官方招聘网站"
}
```

共享同一招聘系统网址的不同企业不能仅因 URL 相同而合并。

## Codex 同步方式

WorkBuddy 完成后，只需告诉用户以下六个 `latest` 文件均已生成，并附本次统计。Codex会在 `D:\求职追踪网页` 执行：

```powershell
npm.cmd run sync:offerstar
npm.cmd run sync:career-portals
npm.cmd test
npm.cmd run lint
npm.cmd run build
```

同步脚本会把 OfferStar 全量目录复制到职途本地导入区，并让职位库只展示这份目录。用户收藏或准备投递某个岗位时，职途才按需把该岗位写入数据库，以保留收藏、申请和时间线功能。

## 发布边界

周任务完成不等于发布。Codex必须先报告记录数、异常、测试结果并让用户在 `http://localhost:3000/app` 验收。只有用户明确说可以发布后，才能重新连接 GitHub/Vercel并上线。
