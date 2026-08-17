# WorkBuddy × 职途岗位周更交接

更新时间：2026-08-17
适用 Skill：`zhitu-campus-job-collector`

> 这份文件是 WorkBuddy 当前应读取的主规则。旧的“每日 3–5 家企业官网增量采集”只作为历史脚本参考，不再是职途职位库主流程。

## 给 WorkBuddy 的固定任务

> 使用“职途校招岗位采集器”每周更新一次职途职位库数据。具体岗位以 OfferStar 公开岗位列表为主来源；企业官网只做“企业校招入口”目录核验。不要读取我的简历或个人偏好，不做 S/A/B、推荐分、匹配分或个性化排序，不直接写职途数据库，不推送 GitHub，不部署网站。
>
> 采集结果必须写入固定目录 `C:\Users\k'k\WorkBuddy\zhitu-career-jobs\latest\`。如果本次采集或校验失败，不要覆盖旧 `latest`，把失败结果和原因放到 `failed-runs`。

## 固定输出目录

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

`latest` 只能保存最后一次完整通过校验的结果。建议先写临时文件，全部校验通过后再替换。

## 一、OfferStar 具体岗位采集

OfferStar 是职途“具体岗位”列表的主来源。采集时必须遵守：

1. 抓取 OfferStar 当前公开岗位全量快照。
2. JSON 数组顺序必须严格保留 OfferStar 页面默认顺序。
3. 不要按 `postDate`、公司名称、岗位标题、偏好分或本地解析时间重新排序。
4. 不要因为缺少 JD 而丢弃岗位；没有 JD 可以留空，让用户自己复制 JD。
5. 不要虚构 JD、薪资、学历、经验、批次、招聘岗位或截止日期。
6. 对来源 ID、规范链接、公司+标题+地点指纹去重。
7. 链接必须是 `http://` 或 `https://`，并能打开详情或投递页面。

### 为什么不能二次排序

OfferStar 的更新时间是页面展示字段，可能出现跨年日期，例如 `12-31` 实际属于上一年。如果按这个字段排序，会把旧岗位错误排到最前。职途会直接按照 JSON 数组顺序展示岗位，所以 WorkBuddy 必须保留 OfferStar 默认顺序。

## 二、职途展示 10 列字段

职途岗位列表严格展示：

```text
公司名称 / 标题 / 批次 / 更新时间 / 招聘岗位 / 工作地点 / 行业 / 招聘类型 / 截止时间 / 操作
```

`offerstar-to-zhitu.json` 每条记录请尽量提供：

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
  "fingerprint": "稳定去重指纹",
  "description": ""
}
```

字段要求：

- `externalId`、`company`、`title`、`applyUrl`、`normalizedUrl`、`fingerprint` 必填。
- `offerstarType` 优先来自页面批次；如果页面没有，只能从标题中明确出现的 `2027届`、`2026届` 等文字提取，不能猜测。
- `position` 必须优先来自 OfferStar 的“招聘岗位”列。如果当前自动化抓不到这一列，要更新采集规则，而不是用标题或 JD 伪造。
- `postDate` 原样保留，只展示，不参与排序。
- `location` 尽量转中文；多个地点用 `、` 分隔。无法拆分时保留页面原文并写入报告。
- `recruitmentType` 使用 `校招`、`实习`、`应届生` 或 `其他`。
- `deadline` 不确定时可以为空或保留 `尽快投递`。

## 三、OfferStar 报告

`offerstar-to-zhitu-report.json` 至少包含：

```json
{
  "generatedAt": "ISO 时间",
  "source": "OfferStar",
  "sourceCount": 0,
  "acceptedCount": 0,
  "duplicateCount": 0,
  "rejectedCount": 0,
  "fieldCoverage": {
    "company": {"present": 0, "total": 0},
    "title": {"present": 0, "total": 0},
    "offerstarType": {"present": 0, "total": 0},
    "postDate": {"present": 0, "total": 0},
    "position": {"present": 0, "total": 0},
    "location": {"present": 0, "total": 0},
    "industry": {"present": 0, "total": 0},
    "recruitmentType": {"present": 0, "total": 0},
    "deadline": {"present": 0, "total": 0},
    "applyUrl": {"present": 0, "total": 0}
  },
  "displayContractWarnings": [],
  "sampleChecked": []
}
```

如果 `position`、`offerstarType`、`industry` 或 `deadline` 覆盖率下降，要在 `displayContractWarnings` 中明确说明。不要静默覆盖旧数据。

`offerstar-run-summary.json` 至少记录：

- 运行时间。
- 源记录数、有效数、重复数、拒绝数。
- 与上周相比新增、消失、变化数量。
- 失败来源和错误摘要。
- 是否覆盖 `latest`。

## 四、企业校招入口目录

企业入口目录不是具体岗位。它只用于职途职位库中的“企业校招入口”页签，展示：

```text
企业名称 / 行业 / 进入官方招聘网站
```

`career-portals.json` 根对象必须包含：

```json
{
  "generatedAt": "ISO 时间",
  "portals": [
    {
      "companyKey": "稳定且唯一的企业键",
      "companyName": "企业名称",
      "industry": "行业",
      "officialCareerUrl": "https://官方招聘网站",
      "status": "active"
    }
  ]
}
```

要求：

- WorkBuddy 可按它已有的 541 家企业库 + 用户提供的表格企业一起核验。
- 共享同一招聘系统网址的不同企业不能仅因 URL 相同而合并。
- 不可访问、受限、季节性关闭的入口保留状态，不猜测替代网址。
- 遇到登录、验证码、401、403、429、反爬或频率限制时停止该来源并记录原因。

## 五、失败时不要覆盖 latest

出现以下任一情况，本周任务应标记失败并写入 `failed-runs`：

- OfferStar 有效岗位数比上周下降超过 5%，且没有明确解释。
- `externalId`、`company`、`title` 或 `applyUrl` 大量缺失。
- URL 非法或重复来源 ID 明显异常。
- 10 列展示字段覆盖率明显下降但报告未说明。
- JSON 数组被二次排序。
- 输出文件不是合法 JSON。

## 六、交给 Codex 的信息

WorkBuddy 完成后，只需要告诉用户：

1. 本次 OfferStar 源记录数、有效岗位数、重复数、拒绝数。
2. `offerstar-to-zhitu.json` 的绝对路径。
3. `offerstar-to-zhitu-report.json` 的绝对路径。
4. `offerstar-run-summary.json` 的绝对路径。
5. 企业入口三份文件的绝对路径。
6. `displayContractWarnings` 中的关键问题。

Codex 会在 `D:\求职追踪网页` 执行：

```powershell
npm.cmd run sync:offerstar
npm.cmd run sync:career-portals
npm.cmd test
npm.cmd run lint
npm.cmd run build
```

然后由用户在本地或预览站验收。

## 七、禁止事项

- 不读取用户简历、邮箱、账号、个人偏好或密码。
- 不生成推荐分、匹配分、录取概率或个性化排序。
- 不保存 Cookie、Token、验证码、API Key 或数据库密钥。
- 不直接写 Supabase 数据库。
- 不修改 `D:\求职追踪网页`。
- 不推送 GitHub。
- 不部署 Vercel 或阿里云。
- 不用示例岗位凑数。

## 当前已知重点

上一次同步时，职途已经能读取 OfferStar 全量快照并展示岗位。后续 WorkBuddy 最需要继续优化的是：

1. 尽量补齐 `position`，即 OfferStar 的“招聘岗位”列。
2. 尽量补齐 `offerstarType`，即批次。
3. 保持 OfferStar 默认顺序不变。
4. 每次报告字段覆盖率，方便 Codex 判断是否可以同步。
