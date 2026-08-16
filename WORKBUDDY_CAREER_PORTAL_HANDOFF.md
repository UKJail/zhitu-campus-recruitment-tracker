# WorkBuddy → 职途：企业校招入口采集交接文档

版本：1.0
日期：2026-08-17
执行方：WorkBuddy
接收与部署方：Codex / 职途项目

## 1. 本次任务目标

WorkBuddy 本阶段只负责收集和核验企业官方招聘入口，不负责：

- 抓取或同步具体岗位；
- 根据任何用户的个人偏好排序；
- 修改职途网页代码；
- 写入 Supabase 或其他数据库；
- 推送 GitHub、部署 Vercel 或改动线上环境。

职途后续会在“职位库”中增加独立的“企业校招入口”区域。每条记录在用户界面只展示：

1. 企业名称；
2. 行业；
3. “进入官方招聘网站”按钮。

Codex 收到合格数据后，负责数据校验、网页开发、本地验收、数据库迁移以及最终发布。

## 2. 数据来源与覆盖范围

使用以下两份来源做并集，不再只处理 Excel 中的 161 家：

1. WorkBuddy / 原 Skill 自带的 541 家企业官方招聘入口目录；
2. 下方 Excel“企业清单”中的企业：

```text
C:\Users\k'k\Desktop\中国大陆及香港中大型企业招聘官网清单.xlsx
```

先读取完整的 541 家目录，再加入 Excel 中尚未覆盖的企业。最终数量不是固定 161，而是两份来源去重后的总数，正常情况下不得少于 541 家。

合并规则：

- 同一企业同时出现在两份来源时合并为一条，并在 `sourceOrigins` 中同时保留两个来源；
- 企业中文名相同且最终招聘网址相同时视为同一条；
- 企业名称略有差异但官网、集团主体或品牌关系明确相同时，标记 `review_required`，不要擅自合并；
- 集团与具有独立招聘入口的子公司、品牌或事业部应分别保留；
- 两份来源的网址冲突时，实时核验后选择当前有效的官方招聘入口，并在报告中记录旧网址、新网址及选择理由；
- 不得静默删除 541 家目录中的企业；链接失效也要保留记录并标记 `unavailable`；
- 若发现 Excel 中的企业未包含在 541 家目录中，必须新增，并标记来源为 `workbook_161`。

## 3. WorkBuddy 要完成的工作

对每一家企业执行以下步骤：

1. 读取 541 家目录和 Excel 中的企业中文名、行业、原官方招聘网址及来源标识。
2. 打开原网址并确认它仍然指向该企业的招聘官网、Career Page、校园招聘专题，或企业明确授权的招聘系统。
3. 记录跳转后的最终网址；优先保留 HTTPS 地址。
4. 判断入口状态：
   - `active`：入口可访问并且能看到招聘相关页面；
   - `seasonal`：属于届次型或招聘季页面，当前可能没有岗位；
   - `restricted`：页面存在，但需要登录、验证码、地区确认或其他访问步骤；
   - `unavailable`：超时、404、域名失效或无法确认属于该企业；
   - `review_required`：结果存在歧义，需要人工决定。
5. 识别底层招聘系统（仅作为维护信息，不在网页展示）：
   - `greenhouse`
   - `lever`
   - `ashby`
   - `workday_public_site`
   - `zhiye`
   - `hotjob`
   - `zhaopin_enterprise`
   - `custom`
   - `unknown`
6. 判断接入方式（仅作为维护信息）：
   - `documented_public_api`
   - `observed_public_feed`
   - `json_ld`
   - `portal_only`
   - `restricted`
   - `unavailable`
7. 记录核验时间、HTTP 状态或可观察到的错误、页面标题以及简短证据。

重要：入口可以正常打开，不等于“当前正在开放校招”。除非页面明确显示当前届次或有效招聘活动，否则不要写“校招开放”，只标记入口可用。

## 4. 不要做的事情

- 不要把企业官网入口伪装成具体岗位。
- 不要生成虚构的岗位名称、JD、城市、学历、薪资或发布日期。
- 不要把普通猎聘、BOSS、前程无忧等聚合搜索页当作企业官网。
- 企业明确使用的官方授权招聘专题可以保留，但必须记录平台和证据。
- 不要用大模型猜测底层 ATS；无法确认时填 `unknown`。
- 不要因为两家公司使用同一个平台就假设接口参数完全一致。
- 不要把 Workday 官方租户 API 当作无认证公开职位 API；若只观察到公开 Career Site 数据请求，标记为 `observed_public_feed`。
- 不要尝试绕过登录、验证码或访问限制。
- 不要保存 Cookie、令牌、账号、密码、个人简历或任何密钥。
- 不要修改源 Excel。

## 5. 必须交付的文件

请把最终结果直接保存到以下两个绝对路径，方便 Codex 无需人工复制即可读取：

```text
D:\求职追踪网页\imports\workbuddy\career-portals.json
D:\求职追踪网页\imports\workbuddy\career-portals-report.md
```

如果 WorkBuddy 无法直接写入该目录，则在自己的任务目录生成同名文件，并在回复中提供两个文件的完整绝对路径。不要只给出带省略号的路径。

### 5.1 `career-portals.json`

这是供职途自动导入的唯一机器数据源。必须为 UTF-8 编码的有效 JSON，不得包含 Markdown、注释、尾随逗号或解释文字。

完整结构：

```json
{
  "schemaVersion": "1.1",
  "generatedAt": "2026-08-17T12:00:00.000Z",
  "sourceCatalogs": ["workbuddy_541", "workbook_161"],
  "sourceWorkbook": "中国大陆及香港中大型企业招聘官网清单.xlsx",
  "sourceSheet": "企业清单",
  "count": 600,
  "portals": [
    {
      "companyKey": "state-grid-corporation-of-china",
      "sourceOrigins": ["workbuddy_541", "workbook_161"],
      "workbookOrdinal": 1,
      "companyName": "国家电网有限公司",
      "industry": "能源/电力",
      "officialCareerUrl": "https://zhaopin.sgcc.com.cn/",
      "finalUrl": "https://zhaopin.sgcc.com.cn/",
      "status": "active",
      "platform": "custom",
      "accessMode": "portal_only",
      "verifiedAt": "2026-08-17T12:00:00.000Z",
      "httpStatus": 200,
      "pageTitle": "国家电网有限公司招聘平台",
      "evidence": "页面标题和企业标识均指向国家电网招聘平台",
      "notes": ""
    }
  ]
}
```

示例中的 `count: 600` 仅用于展示结构，不代表最终目标数量；必须填写实际去重后的数量。

字段规则：

- `companyKey`：稳定、唯一、小写英文标识，只允许 `a-z`、`0-9` 和连字符；后续每日更新不得改变。
- `sourceOrigins`：数组，只允许包含 `workbuddy_541` 和 `workbook_161`；同时出现时保留两个值。
- `workbookOrdinal`：企业存在于 Excel 时填写原序号；只来自 541 家目录时填 `null`。
- `companyName`：Excel 已收录的企业使用 Excel 中文名；只来自 541 家目录的企业使用原目录正式中文名。
- `industry`：Excel 已收录的企业沿用 Excel 行业值；只来自 541 家目录的企业优先使用原目录行业。原目录缺失且无法可靠核验时填写 `待确认` 并写入报告，不得凭印象猜测。
- `officialCareerUrl`：经过核验后准备展示给用户的官网地址。
- `finalUrl`：实际跟随跳转后的地址；无跳转时与 `officialCareerUrl` 相同。
- `status`、`platform`、`accessMode`：只能使用本交接文档列出的枚举值。
- `verifiedAt`、`generatedAt`：使用 ISO 8601 UTC 时间。
- `httpStatus`：已获得响应时填写整数；完全没有响应时填 `null`。
- `pageTitle`、`evidence`、`notes`：必须是纯文本，不要保存整页 HTML。

网页首版只读取 `companyName`、`industry` 和 `officialCareerUrl`；其余字段用于去重、链接维护、状态判断和未来升级具体岗位适配器。

### 5.2 `career-portals-report.md`

这是人工审计报告，至少包含：

- 总记录数；
- `active / seasonal / restricted / unavailable / review_required` 各有多少条；
- 各 `platform` 和 `accessMode` 的数量；
- 原网址发生变化的企业清单；
- 失效或待人工确认的企业清单；
- 重复企业、重复网址或一个网址对应多家企业的情况；
- 与上一次运行相比的新增、删除、网址变化和状态变化；
- 明确声明是否完整处理 WorkBuddy 原有 541 家，以及 Excel 中新增了多少家企业。

报告中不要粘贴大量 HTML、控制台日志或网页正文。

## 6. 每日更新方式

每天都生成一份完整快照并覆盖上述两个交付文件，不要只交付增量片段。

处理顺序：

1. 读取上一版 `career-portals.json`。
2. 按相同 `companyKey` 核验新状态，并保留 `sourceOrigins`。
3. 未发现明确变化时保持 `companyKey` 和官网地址稳定。
4. 生成新的完整 `career-portals.json`。
5. 在 `career-portals-report.md` 中列出本次变化。

完整快照比零散增量更便于 Codex进行校验、回退和幂等导入。

## 7. 交付前自检

WorkBuddy 必须确认：

- `count` 等于 `portals.length`，且不得少于 541；
- WorkBuddy 原有 541 家企业全部有对应记录，不得漏项；
- Excel 中未被 541 家目录覆盖的企业已经补入；
- 所有 `companyKey` 唯一且不为空，所有非空 `workbookOrdinal` 在 Excel 来源内唯一；
- 所有 `companyName`、`industry`、`officialCareerUrl` 不为空；
- `active` 和 `seasonal` 记录的网址以 `https://` 或 `http://` 开头；
- JSON 可被标准解析器直接解析；
- 未混入具体岗位、个人偏好或用户数据；
- 不能确认的内容使用 `unknown` 或 `review_required`，不猜测；
- 报告中的数量与 JSON 一致。

## 8. 给 WorkBuddy 的最终回复格式

完成后只需回复：

```text
已完成企业校招入口核验。
WorkBuddy 原目录处理：541 / 541 家
Excel 企业处理：161 / 161 家
合并去重后总数：<实际数量> 家
Excel 新增补充：<数量> 家
机器数据绝对路径：<career-portals.json 的完整路径>
审计报告绝对路径：<career-portals-report.md 的完整路径>
待人工确认：<数量> 家
失效入口：<数量> 家
```

不要在聊天中粘贴完整 JSON。Codex 将直接读取文件并完成后续网站开发与部署。

## 9. Codex 接手后的工作

WorkBuddy 交付后，Codex 将依次完成：

1. 校验 JSON schema、数量、重复项和危险网址；
2. 对异常样本进行人工复核；
3. 新建独立的企业招聘入口数据模型，不把入口写成假岗位；
4. 在职位库增加“企业校招入口”标签页；
5. 页面只展示企业名称、行业和“进入官方招聘网站”按钮；
6. 保持真实岗位数量、筛选、收藏、匹配分和投递统计不受影响；
7. 在本地完成桌面与手机端验收；
8. 经用户确认后，再恢复 GitHub 同步并部署网站。
