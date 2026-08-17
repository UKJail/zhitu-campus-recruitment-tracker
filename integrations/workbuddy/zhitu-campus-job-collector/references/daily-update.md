# 每周更新与全量同步

每周更新一次 OfferStar 全量岗位快照，并核验企业校招入口目录。流程不读取个人偏好，不对岗位做二次排序。

## 固定目录

所有输出写入：

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

先写临时文件并校验。只有完整通过校验后，才覆盖 `latest`；失败时保留旧 `latest`，把失败结果放入 `failed-runs`。

## OfferStar 全量包

输出：

- `offerstar-to-zhitu.json`：OfferStar 全量岗位数组，顺序必须等于 OfferStar 页面默认顺序。
- `offerstar-to-zhitu-report.json`：字段覆盖率、去重、异常和样本检查。
- `offerstar-run-summary.json`：运行时间、源记录数、有效数、重复数、拒绝数、与上周相比新增/消失/变化数量。

职途会用最新 OfferStar 全量快照作为具体岗位展示目录。不要因为缺少 JD 丢弃岗位；缺失 `position`、`offerstarType` 等展示字段时写入报告。

## 企业入口包

输出：

- `career-portals.json`：企业名称、行业、官方招聘入口、状态。
- `career-portals-report.md`：本周新增、失效、受限和需要人工复核的入口。
- `career-portals-run-summary.json`：运行摘要。

企业入口不是岗位，不要把入口拆成虚构岗位。

## 失败判定

出现以下情况时，本周任务标记失败，不覆盖 `latest`：

- OfferStar 总有效岗位数比上周下降超过 5%，且没有明确解释。
- `externalId`、`company`、`title` 或 `applyUrl` 大量缺失。
- URL 非法或重复来源 ID 明显异常。
- 10 列展示字段覆盖率明显下降但报告未说明。
- 页面顺序被二次排序。

## 失败恢复

- OfferStar 结构变化：标记 `adapter_changed`，暂停覆盖 `latest`。
- 官网入口受限：在企业入口报告中标记 `restricted`，保留原因，不重试绕过。
- 空结果：区分 `no_valid_jobs`、`no_campus_jobs` 和 `parse_failed`。
- 同周重跑：复用原始响应或重新抓取均可，但最终必须重新校验；不要用示例岗位替代失败结果。
