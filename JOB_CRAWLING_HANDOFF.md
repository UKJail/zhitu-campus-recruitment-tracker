# 职途 Tracker 官方岗位采集交接说明

更新时间：2026-08-16
工作模式：仅本地整改，不推送 GitHub、不部署 Vercel

## 1. 当前成果

- 企业来源清单：161 家中国大陆及香港中大型企业。
- 当前用户可见职位：449 条。
- 当前已完成全量官方适配的企业：百度集团。
- 当前职位均来自百度校园招聘官方公开接口，覆盖校招、实习、管培及 AIDU 相关岗位。
- 地点已统一为中文，城市筛选会将多城市岗位拆分为单独中文选项。
- 职位库本地验收结果：449 条、45 页，来源显示“百度集团｜官方招聘”。

数据库中另有 2 条旧测试岗位，因为它们关联了不可覆盖的申请事件时间线，所以没有物理删除；它们已标记为隐藏，职位库和首页都不会展示。

## 2. 已执行的数据清理

1. 删除 52 条未关联申请记录的旧测试岗位。
2. 隐藏 2 条有关联申请事件的旧测试岗位。
3. 腾讯官方公开接口曾返回 2 条超过 180 天的旧岗位；加入时效过滤后，这 2 条也已删除。
4. 写入 449 条百度官方近期岗位。

当前数据库总数为 451：

- 449 条用户可见的百度官方岗位。
- 2 条因关联历史申请事件而保留、但用户不可见的旧测试岗位。

## 3. 代码结构

### 企业清单

- `worker/data/company-career-sources.json`
  - 从 Excel 企业清单生成。
  - 包含公司中英文名、序号、市场、所有制、行业、招聘地区、招聘官网、入口类型、核验日期和备注。
- `worker/company-sources.ts`
  - 读取并校验企业来源清单。
  - 支持通过 `COMPANY_SOURCE_ORDINALS` 分批启用企业。

### 城市规范化

- `worker/location.ts`
- `worker/location.test.ts`

规则：

- 将 Beijing、Shanghai、Shenzhen、Guangzhou、Hong Kong 等英文或拼音地点转换为中文。
- 清理 `China`、`中国` 等重复国家信息。
- 保留多个城市，并由前端按 `、`、`;`、`；`、`|` 拆分为独立筛选项。

### 通用官方页面适配器

- `worker/adapters/official-career-page.ts`
- `worker/adapters/official-career-page.test.ts`

能力和边界：

- 只读取无需登录的公开网页。
- 解析网页中的 Schema.org `JobPosting` JSON-LD。
- 不绕过登录、验证码、访问控制或反爬机制。
- 遇到 401、403、412、429 时将来源标记为受限并暂停，不影响其他来源。
- 只保留中国大陆及香港岗位。

### 百度官方适配器

- `worker/adapters/baidu-careers.ts`
- `worker/adapters/baidu-careers.test.ts`
- `scripts/collect-baidu-official.mjs`
- `scripts/probe-baidu-api.mjs`

公开接口：

```text
POST https://talent.baidu.com/httservice/getPostListNew
Content-Type: application/x-www-form-urlencoded
```

主要参数：

```text
recruitType=GRADUATE 或 INTERN
pageSize=10
keyWord=
curPage=页码
projectType=
```

注意事项：

- 官方接口的单页数量上限为 10，需要完整分页。
- 当前适配器最多读取每种招聘类型 30 页。
- 只保留 180 天内更新或发布的岗位。
- 详情链接格式：

```text
https://talent.baidu.com/jobs/mobile/main.html#/detail/{GRADUATE|INTERN}/{postId}
```

### 腾讯官方适配器

- `worker/adapters/tencent-careers.ts`
- `worker/adapters/tencent-careers.test.ts`
- `scripts/collect-tencent-official.mjs`
- `worker/tencent-campus-probe.ts`

当前结论：公开接口只返回 2 条超过 180 天的旧岗位，因此暂不向职位库写入腾讯岗位。不要降低时效标准来凑数量。

### Worker 入口

- `worker/index.ts`
- `worker/probe.ts`
- `worker/api-probe.ts`

`worker/index.ts` 当前路由：

- 企业序号 70：腾讯专用适配器。
- 企业序号 76：百度专用适配器。
- 其他企业：通用公开 JSON-LD 适配器。

## 4. 常用本地命令

只读检查配置：

```powershell
npm.cmd run worker:check-env
```

探测企业清单来源，不写数据库：

```powershell
npm.cmd run worker:probe
```

运行百度公开接口探测，不写数据库：

```powershell
node scripts/probe-baidu-api.mjs
```

采集百度岗位并写入数据库：

```powershell
node scripts/collect-baidu-official.mjs
```

只读审计职位库：

```powershell
node scripts/audit-job-catalog-reset.mjs
```

运行质量检查：

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run build
```

如果本地缺少 Supabase 管理密钥，不要把密钥写进脚本或聊天。当前通过 Railway 的已配置环境运行数据库采集脚本；任何实际写入前都必须先运行只读探测。

## 5. DeepSeek 接手任务顺序

DeepSeek 后续应按以下顺序逐家公司处理，不要一次并发全部 161 家：

1. 从 `worker/data/company-career-sources.json` 选择 3—5 家公司。
2. 先运行只读探测，确认页面可公开访问、岗位确实为当前校招或实习岗位。
3. 如果页面已有 Schema.org `JobPosting`，直接复用通用适配器。
4. 如果是公开动态接口，新增独立适配器和固定样本测试。
5. 如果要求登录、验证码或返回访问限制，记录原因并暂停，不绕过限制。
6. 将英文和拼音城市通过 `worker/location.ts` 转为中文。
7. 过滤 180 天以前的岗位，除非岗位有明确仍开放的截止日期。
8. 在写数据库前输出：总岗位数、校招/实习数量、城市分布、最早和最新日期、重复数量。
9. 用户确认后再写数据库。
10. 写入后运行完整测试、代码检查、构建和本地浏览器验收。

建议下一批优先研究采用相同招聘系统的企业，以复用适配器：

- `*.zhiye.com` 北森招聘系统：中核、中粮、招商局、华润、保利、中国电子、五矿、宝武等。
- `*.hotjob.cn`：中广核、中化等。
- 有独立公开 API 的大型互联网公司。

## 6. 北森 `zhiye.com` 的已知探索结果

已确认：

- `https://cnnc.zhiye.com/jobs` 是无需登录可打开的中核公开职位页。
- 页面由北森招聘门户前端加载，存在校园招聘、实习招聘和社会招聘业务类型。
- 公开前端脚本中可确认职位路由：`/campus/jobs`、`/intern/jobs`、`/social/jobs` 和 `/jobs`。
- 尚未完成稳定的岗位 API 参数和分页协议确认，因此当前没有将中核岗位写入数据库。

接手时不要凭页面结构猜测接口，也不要直接把网页菜单或宣传内容当成职位。应先从浏览器网络请求或公开脚本中确认真实岗位接口，再写适配器。

## 7. 数据质量规则

每条职位至少应保存：

- 官方来源与来源岗位 ID。
- 公司、职位名称、中文城市。
- 招聘类型：应届生或实习。
- 经验、学历（官方未提供时留空，不推测）。
- 职位描述。
- 发布或更新时间、截止日期（官方未提供时留空）。
- 可直接打开的官方详情或投递链接。
- 原始结构化数据，便于排错。

去重优先级：

1. 来源＋官方岗位 ID。
2. 规范化后的官方链接。
3. 公司＋职位＋中文地点指纹。

禁止事项：

- 不绕过验证码、登录和访问控制。
- 不使用非官方聚合站冒充官网数据。
- 不伪造发布日期、学历、经验或招聘类型。
- 不把社会招聘职位标记为校招。
- 不为增加数量而保留明显过期岗位。
- 不在代码、日志或 Markdown 中保存任何密钥。
- 当前整改阶段不推送 GitHub、不部署 Vercel。

## 8. 已完成验证

- `npm test`：29 个测试文件、108 项测试全部通过。
- `npm run lint`：通过。
- `npm run build`：Next.js 生产构建与 TypeScript 检查通过。
- 本地网页：`http://localhost:3000/app` 正常打开。
- 职位库：449 个百度官方岗位，分页 1/45，旧测试岗位不可见。

## 9. 回退与记录

- 所有后续修改继续记录到 `LOCAL_REWORK_LOG.md`。
- 每接入一个招聘系统，单独记录：来源、接口、日期过滤、岗位数量、测试结果和回退点。
- 当前 GitHub 远程保持断开，Vercel 本地绑定保持禁用。
- 等本地验收完成后，再由用户明确确认是否恢复 GitHub 与 Vercel 发布流程。
