# 职途岗位数据格式

每条岗位必须尽量提供以下字段：

```json
{
  "externalId": "来源岗位ID",
  "company": "公司中文名",
  "title": "岗位名称",
  "location": "中文城市",
  "salaryText": null,
  "experience": "应届生或实习",
  "education": "本科及以上",
  "description": "完整岗位描述",
  "publishedAt": "ISO 8601 日期或 null",
  "expiresAt": "ISO 8601 日期或 null",
  "applyUrl": "官方直接投递链接",
  "normalizedUrl": "规范化岗位链接",
  "fingerprint": "稳定去重指纹",
  "rawData": {}
}
```

## 必填质量线

- `externalId`、`company`、`title`、`location`、`description`、`applyUrl`、`normalizedUrl`、`fingerprint` 不得为空。
- `applyUrl` 必须为 `http` 或 `https`，且应指向岗位详情或官方投递页。
- 城市使用中文；多城市使用 `、` 分隔。
- 日期使用 ISO 8601；无法证明时保持 `null`，不得猜测。
- 招聘类型只能基于页面原文判断，不得仅凭岗位名称臆测。

## 去重顺序

1. 来源名＋`externalId`。
2. `normalizedUrl`。
3. 公司＋职位名称＋中文城市指纹。

同一岗位更新时保留最新公开内容和原始来源数据，不创建重复记录。
