# 职途 Tracker

**AI 求职追踪与岗位匹配平台｜个人开发项目**

面向应届生与年轻求职者的一站式求职工作台，将岗位发现、简历优化、投递追踪、邮件识别与面试复盘集中到同一套流程中。

[在线体验](https://zhitutracker.com/) · [Vercel 备用地址](https://zhitu-tracker.vercel.app/)

## 产品成果

- 从内测推进到公开测试，用户增长超过 **500%**。
- 将逐岗位阅读 JD、比对简历和反复改写整合为一次集中分析，整体流程效率提升 **100%**。
- 已落地 **15 张启用 RLS 的业务表**、私有简历存储、AI 任务额度、申请事件时间线和个人数据导出。
- 生产职位库包含 **54 个岗位**，定时 Worker 每两小时同步公开职位并执行双重去重。
- 已完成 Gmail → Resend → 签名 Webhook → 邮件分类 → 岗位匹配 → 用户确认 → 时间线与提醒的端到端验收。

## 核心模块

| 模块 | 用户问题 | 解决方案 |
|---|---|---|
| 职位发现 | 校招岗位分散、重复筛选耗时 | 多来源岗位采集、筛选、比较与来源健康度监控 |
| 简历优化 | 不同 JD 需要反复比对和改写 | PDF/DOCX 解析、JD 匹配、问题定位与可追溯修改建议 |
| 投递管理 | 申请状态和关键节点容易遗漏 | 受控状态流转、事件时间线、用户确认与提醒 |
| 邮件识别 | 面试和申请邮件散落在邮箱 | 签名 Webhook、分类、岗位关联与敏感内容删除 |
| 面试复盘 | 准备材料和复盘记录缺乏沉淀 | AI 面试准备、结构化复盘与真实数据持久化 |

## 技术栈

Next.js 16 · React 19 · TypeScript · Supabase · PostgreSQL / RLS · DeepSeek · Resend · Vercel · Railway · Vitest

## 当前完成度

- Supabase 生产项目已连接，核心迁移、面试复盘持久化和申请状态流转迁移均已应用。
- 15 张业务表全部启用行级权限（RLS），用户简历、申请、邮件和复盘彼此隔离。
- `resumes` 私有存储桶已创建，限制 PDF/DOCX、单文件不超过 10MB。
- 邮箱验证码登录使用 Supabase SSR，会话由 `proxy.ts` 刷新。
- 注册确认使用同一个安全 OTP 校验入口：填写邮箱和密码 → 收取 6 位验证码 → 输入并进入职途。页面关闭后可从首页「继续验证注册邮箱」重新进入；不会保存密码或验证码。旧确认链接仍兼容，找回密码流程不变。
- 托管 Supabase 的 Authentication → Emails → Confirm sign up：标题使用「职途｜注册邮箱验证码」，正文使用 `supabase/templates/confirmation.html`（`{{ .Token }}`，不是确认链接）。Sign In / Providers → Email 中保持邮箱确认开启，Email OTP Length 为 6；验证码登录模板也需包含 `{{ .Token }}`。此 HTML 是版本化配置副本，Git 部署不会自动更新托管邮件模板。
- 验证码校验和发送均有按 IP、按邮箱的进程内限流，并依赖 Supabase 自身的验证限流；多实例部署时需改用共享限流存储。邮件是否进入收件箱由收件方决定，验证码方式不会自动消除垃圾邮件问题。
- 简历中心已接入真实上传、PDF/DOCX 文本解析、列表和删除接口。
- DeepSeek JD 分析与面试准备共用每日 AI 任务额度；简历上传解析、JD 分析和优化建议合并计为一次成功任务，最终简历导出不扣次数。
- Resend Inbound Webhook 已按 Svix 签名规范实现，支持邮件去重、分类、职位匹配、用户确认后更新进度，以及单封邮件敏感内容删除。
- 面试复盘、职位筛选/比较、申请事件时间线、个人数据导出和账号注销均已接入真实数据。
- 管理后台已实现用户管理、AI 配额和职位来源健康度；生产端服务密钥已配置并通过未授权访问测试。
- Vercel 生产站点为 `https://zhitu-tracker.vercel.app`，Railway 定时 Worker 与 Resend Inbound 均已上线。
- 真实邮件端到端验收已通过：Gmail → Resend → 签名 Webhook → 邮件分类 → 岗位匹配 → 用户确认 → 申请事件时间线 → 24 小时提醒。
- 演示数据仍保留，便于没有外部账号时查看完整交互。

## 本地运行

```powershell
Copy-Item .env.example .env.local
npm.cmd install
npm.cmd run dev
```

启动命令会先真实检查 Supabase Auth 是否可访问；只有检查通过后才会启动 Next.js。终端出现 `Ready` 后再打开 `http://localhost:3000`。如果提示“无法连接认证服务”，请在能够正常联网的独立 Windows PowerShell 中重新运行上述命令，不要继续尝试密码或验证码。

可用 `http://localhost:3000/api/health/auth` 检查认证链路。返回 `ok: true` 才表示本地网页能够向 Supabase 发起登录请求。首次配置期间保持 `NEXT_PUBLIC_DEMO_MODE=true`；真实账号可登录后再改为 `false`。

## 公开注册与首位管理员

真实登录启用前，需要在 Supabase 控制台完成一次初始化：

1. 打开项目 `职途Tracker Project` → Authentication → URL Configuration。
2. Site URL 填写 `http://localhost:3000`，Redirect URLs 添加 `http://localhost:3000/auth/callback`；部署后再添加生产域名对应地址。
3. 打开 Authentication → Providers → Email，允许邮箱注册，并开启邮箱确认；公开测试用户可在登录页直接注册。
4. 首位管理员完成邮箱注册和确认后，在 SQL Editor 执行下面的语句，将邮箱替换为真实管理员邮箱：

```sql
update public.profiles
set is_admin = true
where id = (
  select id from auth.users where lower(email) = lower('admin@example.com')
);
```

5. 将 `.env.local` 中的 `NEXT_PUBLIC_DEMO_MODE` 改为 `false`，重启开发服务，然后测试邮箱验证码登录。

服务端 Secret/Service Role 密钥不要放进 `NEXT_PUBLIC_*` 变量、浏览器代码、Git 仓库或聊天消息。注册、登录、简历和 AI 流程只需要 publishable key；账号彻底注销和 Resend Webhook 需要仅服务端可见的 Service Role 密钥。

## 环境变量

```dotenv
NEXT_PUBLIC_DEMO_MODE=true
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
DEEPSEEK_API_KEY=
DEEPSEEK_MODEL=deepseek-v4-flash
RESEND_API_KEY=
RESEND_WEBHOOK_SECRET=
RESEND_INBOUND_DOMAIN=
SUPABASE_SERVICE_ROLE_KEY=
AUTH_RECOVERY_GRANT_SECRET=
APP_URL=http://localhost:3000
```

`AUTH_RECOVERY_GRANT_SECRET` 仅用于服务器端密码恢复临时凭证，与 `SUPABASE_SERVICE_ROLE_KEY` 分离。本地启动脚本在未配置时会为当前进程临时生成；生产发布前必须设置稳定的随机密钥。二者都不得使用 `NEXT_PUBLIC_*` 前缀或提交到 Git。

公开测试注册不再需要邀请码。Supabase Email Provider 应允许新用户注册并开启邮箱确认；旧的一次性激活链接仍保留兼容。

如果曾在聊天、截图或仓库中暴露 DeepSeek 密钥，请先到 DeepSeek 控制台吊销旧密钥并生成新密钥，然后只写入本地 `.env.local` 或部署平台的加密环境变量。

## 数据库迁移

迁移文件位于 `supabase/migrations`：

- `001_initial_schema.sql`：核心实体、约束、RLS、私有存储策略和触发器。
- `002_foreign_key_indexes.sql`：外键查询索引。
- `003_ai_run_updates.sql`：允许用户更新自己发起的 AI 运行结果。
- `004_job_application_flow.sql`：岗位定制简历版本、可追溯建议应用和投递确认流程。
- `005_inbound_email_actions.sql`：邮件识别通知及用户确认状态更新。
- `006_manual_external_applications.sql`：用户手动添加外部申请。
- `20260814071548_interview_review_persistence.sql`：面试复盘真实存储。
- `20260814073831_application_status_transition.sql`：受控状态流转与事件追加。
- `20260901092026_ai_usage_tasks.sql`：简历优化与面试准备共用任务额度、成功后扣次、失败释放和 30 分钟过期预留。
- `20260901092151_ai_usage_result_run_index.sql`：补充额度任务结果外键索引。

上线新版本前必须先应用最新迁移，再部署应用代码，否则统一 AI 额度接口会不可用。

`invites` 仅用于兼容已经发出的旧激活链接；它和 `source_runs` 都不向普通登录用户配置策略，保持默认拒绝，仅供受信任的后台服务操作。

## 验证

```powershell
pnpm test
pnpm lint
pnpm build
```

## 职位采集 Worker

独立 Worker 位于 `worker/`，通过 Greenhouse 官方公开 Job Board API 采集 IDEO、Adyen、AppLovin、Xendit、Eclipse Trading、AlphaGrep Securities 和 Rock Bund Capital 的大中华区职位。生产数据库当前包含 54 个职位；重复采集验证新增为 0。每次运行会按“来源岗位 ID”和“公司 + 职位 + 地点”指纹去重，并把运行结果写入 `source_runs`。遇到 401、403、429 或响应结构变化时，会暂停对应来源并记录原因；猎聘、智联招聘和前程无忧当前保持受限状态，不进行登录、验证码处理或访问控制绕过。

Railway 使用根目录 `railway.json` 构建，并通过 UTC 定时表达式 `0 */2 * * *` 每两小时执行一次。任务完成后立即退出，避免 Worker 常驻消耗额度。部署时只在 Railway 加密变量中配置：

```dotenv
SUPABASE_URL=https://你的项目.supabase.co
SUPABASE_SERVICE_ROLE_KEY=仅服务端使用的密钥
WORKER_INTERVAL_MS=7200000
```

本地验证公开适配器（只读，不写数据库）：

```powershell
pnpm worker:build
pnpm worker:probe
```

关键业务规则：打开原始投递页只进入“准备投递”，用户确认后才计为“已投递”；AI 建议保留原文和用户决策；申请事件只追加不覆盖；私有业务表均由 RLS 隔离。

## 独立登录页参考

根目录的 `index.html` 是无需构建即可打开的像素锁定登录页。CSS、JavaScript、SVG、字体和视频海报均已内嵌，运行时唯一外部请求是指定的游隼 MP4。由于 Eloquia 无可验证的嵌入授权文件，页面使用内嵌 Manrope Variable 代替；FreeSans 使用内嵌 grotesque 代替，并保留原字体接口。

## Resend Inbound

生产环境已配置 `RESEND_API_KEY`、`RESEND_WEBHOOK_SECRET`、`RESEND_INBOUND_DOMAIN` 和 `SUPABASE_SERVICE_ROLE_KEY`。Resend 托管收件域名为 `irknumo.resend.app`，接收 `email.received` 的 Webhook 地址为：

```text
https://zhitu-tracker.vercel.app/api/webhooks/resend
```

用户在设置页获得形如 `专属别名@收件域名` 的地址。Webhook 只接收元数据，服务端会通过 Resend Receiving API 拉取正文；高置信度识别结果进入通知中心，任何申请状态变化都必须由用户确认。

## 上线运维项

### 管理员删除测试账号

- 管理员控制台 → 用户列表 → 删除，输入目标账号完整邮箱后确认永久删除。当前管理员及其他管理员账号均禁止删除。
- 服务端先枚举并清理目标用户在 `resumes` 私有桶内的文件（含面试准备文件及未关联记录的上传），再通过 Supabase Auth 删除账号，业务数据依赖外键级联清理。
- 文件与 Auth 删除不在同一个事务中；如后一步失败，界面会明确提示部分文件可能已清理，账号尚需重试删除。
- 发布前应用 `allow_account_event_cleanup` 迁移，允许账号删除级联清理申请历史；存续账号的历史仍禁止修改或单独删除。`supabase/tests/account_event_cleanup.sql` 使用临时账号验证数据库行为并全量回滚，不删除真实用户。
- 此操作不能在产品内撤销；删除后同一邮箱可重新注册，但不会恢复旧账号数据。

- 首轮邀请用户扩大前，完成数据库备份恢复演练。
- 按运维周期轮换 Supabase Service Role、Resend Webhook Secret 和 DeepSeek API Key，并在轮换后重新部署与回归。
- 持续观察职位来源健康度、邮件识别准确率、AI 建议接受率和投递确认率。

产品边界不变：不做自动代投，不托管招聘平台账号，不绕过登录、验证码、访问控制或反爬机制，不生成虚构经历。
