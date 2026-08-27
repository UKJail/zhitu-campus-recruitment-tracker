# 职途Tracker

面向中国大陆求职者的邀请制求职追踪 MVP。当前仓库包含响应式登录页、五个核心模块、Supabase 数据与权限模型、真实简历上传/解析，以及基于 DeepSeek 的 JD 匹配分析。

## 当前完成度

- Supabase 生产项目已连接，核心迁移、面试复盘持久化和申请状态流转迁移均已应用。
- 15 张业务表全部启用行级权限（RLS），用户简历、申请、邮件和复盘彼此隔离。
- `resumes` 私有存储桶已创建，限制 PDF/DOCX、单文件不超过 10MB。
- 邮箱验证码登录使用 Supabase SSR，会话由 `proxy.ts` 刷新。
- 简历中心已接入真实上传、PDF/DOCX 文本解析、列表和删除接口。
- DeepSeek JD 分析已接入登录用户、每日配额和运行记录。
- Resend Inbound Webhook 已按 Svix 签名规范实现，支持邮件去重、分类、职位匹配、用户确认后更新进度，以及单封邮件敏感内容删除。
- 面试复盘、职位筛选/比较、申请事件时间线、个人数据导出和账号注销均已接入真实数据。
- 管理后台已实现邀请、AI 配额和职位来源健康度；生产端服务密钥已配置并通过未授权访问测试。
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

## 首位管理员与邀请制登录

真实登录启用前，需要在 Supabase 控制台完成一次初始化：

1. 打开项目 `职途Tracker Project` → Authentication → URL Configuration。
2. Site URL 填写 `http://localhost:3000`，Redirect URLs 添加 `http://localhost:3000/auth/callback`；部署后再添加生产域名对应地址。
3. 打开 Authentication → Users，使用“邀请用户/发送邀请”创建首位账号。不要开启公开注册。
4. 用户接受邀请后，在 SQL Editor 执行下面的语句，将邮箱替换为真实管理员邮箱：

```sql
update public.profiles
set is_admin = true
where id = (
  select id from auth.users where lower(email) = lower('admin@example.com')
);
```

5. 将 `.env.local` 中的 `NEXT_PUBLIC_DEMO_MODE` 改为 `false`，重启开发服务，然后测试邮箱验证码登录。

服务端 Secret/Service Role 密钥不要放进 `NEXT_PUBLIC_*` 变量、浏览器代码、Git 仓库或聊天消息。登录、简历和 AI 流程只需要 publishable key；邀请码注册、账号彻底注销和 Resend Webhook 需要仅服务端可见的 Service Role 密钥。

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
AUTH_BETA_INVITE_CODE=
APP_URL=http://localhost:3000
```

`AUTH_RECOVERY_GRANT_SECRET` 仅用于服务器端密码恢复临时凭证，与 `SUPABASE_SERVICE_ROLE_KEY` 分离。本地启动脚本在未配置时会为当前进程临时生成；生产发布前必须设置稳定的随机密钥。二者都不得使用 `NEXT_PUBLIC_*` 前缀或提交到 Git。

`AUTH_BETA_INVITE_CODE` 是小范围内测共用的邀请码。建议使用至少 12 位的随机字母和数字，只写入 `.env.local` 或生产服务器环境变量；注册时忽略大小写和首尾空格。旧的一次性激活链接仍保留兼容。

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

`invites` 和 `source_runs` 故意不向普通登录用户配置策略，它们保持默认拒绝，仅供受信任的后台服务操作。

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

根目录的 `index.html` 是无需构建即可打开的像素锁定登录页。CSS、JavaScript、SVG、字体和视频海报均已内嵌，运行时唯一外部请求是指定的游隼 MP4。由于 Eloquia 无可验证的嵌入授权文件，页面使用内嵌 Manrope Variable 代替；FreeSans 使用内嵌 grotesque 替代，并保留原字体接口。

## Resend Inbound

生产环境已配置 `RESEND_API_KEY`、`RESEND_WEBHOOK_SECRET`、`RESEND_INBOUND_DOMAIN` 和 `SUPABASE_SERVICE_ROLE_KEY`。Resend 托管收件域名为 `irknumo.resend.app`，接收 `email.received` 的 Webhook 地址为：

```text
https://zhitu-tracker.vercel.app/api/webhooks/resend
```

用户在设置页获得形如 `专属别名@收件域名` 的地址。Webhook 只接收元数据，服务端会通过 Resend Receiving API 拉取正文；高置信度识别结果进入通知中心，任何申请状态变化都必须由用户确认。

## 上线运维项

- 首轮邀请用户扩大前，完成数据库备份恢复演练。
- 按运维周期轮换 Supabase Service Role、Resend Webhook Secret 和 DeepSeek API Key，并在轮换后重新部署与回归。
- 持续观察职位来源健康度、邮件识别准确率、AI 建议接受率和投递确认率。

产品边界不变：不做自动代投，不托管招聘平台账号，不绕过登录、验证码、访问控制或反爬机制，不生成虚构经历。
