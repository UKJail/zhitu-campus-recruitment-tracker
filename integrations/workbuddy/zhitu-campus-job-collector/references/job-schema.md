# 职途 OfferStar 岗位数据格式

具体岗位以 OfferStar 全量快照为主。`offerstar-to-zhitu.json` 必须是 JSON 数组，并严格保留 OfferStar 页面默认顺序；不要按更新时间、公司、标题、偏好或本地解析日期重新排序。

每条岗位必须尽量提供以下字段：

```json
{
  "externalId": "offerstar-稳定来源ID",
  "company": "公司名称",
  "title": "标题",
  "offerstarType": "批次，例如 2027届、校招、实习；无法确认可为空",
  "postDate": "OfferStar 页面展示的更新时间，原样保留",
  "position": "招聘岗位列原文；没有采到时留空",
  "location": "工作地点，中文城市或页面原文",
  "industry": "行业",
  "recruitmentType": "校招、实习、应届生或其他",
  "deadline": "截止时间；无法确认可为空或尽快投递",
  "applyUrl": "详情或投递链接",
  "normalizedUrl": "规范化链接",
  "salaryText": null,
  "experience": "应届生、实习或其他",
  "education": "本科及以上",
  "description": "",
  "publishedAt": "ISO 8601 日期或 null",
  "expiresAt": "ISO 8601 日期或 null",
  "fingerprint": "稳定去重指纹",
  "rawData": {}
}
```

## 职途展示 10 列

职途岗位列表必须严格显示：

| 职途列名 | JSON 字段 | 采集规则 |
| --- | --- | --- |
| 公司名称 | `company` | 必填，来自 OfferStar 页面 |
| 标题 | `title` | 必填，来自 OfferStar 页面标题 |
| 批次 | `offerstarType` | 优先采集页面批次；若页面没有，可从标题中明确出现的 `2027届` 等提取；不要猜测 |
| 更新时间 | `postDate` | 页面原样展示字段，只展示，不用于排序 |
| 招聘岗位 | `position` | 优先采集页面“招聘岗位”列；没有就留空并在报告中提示，不用标题伪造 |
| 工作地点 | `location` | 页面地点；英文、拼音和常见城市名尽量转中文 |
| 行业 | `industry` | 页面行业；无法确认可为空 |
| 招聘类型 | `recruitmentType` | `校招`、`实习`、`应届生` 或 `其他` |
| 截止时间 | `deadline` | 页面截止时间；无法确认时保留“尽快投递”或空值 |
| 操作 | `applyUrl` | http(s) 详情或投递链接，必填 |

## 必填质量线

- `externalId`、`company`、`title`、`applyUrl`、`normalizedUrl`、`fingerprint` 不得为空。
- `applyUrl` 必须为 `http` 或 `https`，且应指向岗位详情或官方投递页。
- 城市尽量使用中文；多城市使用 `、` 分隔。确实无法拆分时保留页面原文并写入报告。
- `postDate` 保留页面展示文本，不得自行补年后排序；`publishedAt` 如无法可靠确定年份则保持 `null`。
- 招聘类型只能基于页面原文、标题明确词或 OfferStar 分类判断，不得凭想象推断。
- 没有 JD 属于允许状态，不要用标题或通用模板伪造 `description`。

## 报告质量线

`offerstar-to-zhitu-report.json` 必须输出 10 列字段覆盖率。若 `position`、`offerstarType`、`industry`、`deadline` 覆盖率下降，必须写入 `displayContractWarnings`，不能静默覆盖旧 `latest`。

## 去重顺序

1. `externalId`。
2. `normalizedUrl`。
3. 公司＋职位名称＋中文城市指纹。

同一岗位更新时保留最新公开内容和原始来源数据，不创建重复记录。
