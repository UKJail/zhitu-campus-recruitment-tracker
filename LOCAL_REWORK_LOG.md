# 职途 Tracker 本地整改记录

> 本文件记录 2026-08-15 起的本地整改操作。整改期间允许建立本地提交作为回退点，但不推送、不部署；确认验收后再由用户决定是否恢复 GitHub 与 Vercel 连接。

## 基线与回退点

- GitHub 远程仓库：`https://github.com/UKJail/zhitu-campus-recruitment-tracker.git`
- Vercel 本地项目：`zhitu-tracker`
- Vercel 项目 ID：`prj_QaxOzVLYDkdlnkf0qDFHENCRrZFS`
- Vercel团队 ID：`team_Gas5qLsn08GMKp5PoGy1NNdi`
- 本地检查地址：`http://localhost:3000`

## 操作记录

### 2026-08-15：进入本地整改模式

1. 移除本地 Git `origin`，防止误推送；GitHub 仓库本身未删除、未改动。
2. 将 `.vercel/project.json` 改名为 `.vercel/project.json.disabled`，防止 Vercel CLI 将本地操作误指向线上项目；线上项目与现有部署未删除。
3. 本地开发服务继续使用 `.env.local` 与 `localhost:3000`，不会把本地端口连接为线上端口。
4. 建立本地专用分支 `local-rework`，整改前回退提交为 `1e30e95`。

回退方法：

```powershell
git remote add origin https://github.com/UKJail/zhitu-campus-recruitment-tracker.git
Move-Item -LiteralPath ".vercel\project.json.disabled" -Destination ".vercel\project.json"
```

### 2026-08-16：统一 Gmail / QQ 验证体验

本地提交：`4b39a4f`（`feat: unify forwarding verification UI`）

1. Gmail 与 QQ 邮箱共用同一个验证状态卡组件，统一等待、已收到、已打开、加载和错误状态。
2. QQ 验证邮件弹窗与 Gmail 使用同一结构；仅显示经过官方域名白名单校验的入口。
3. Gmail 保留 8 位确认码；QQ 保留官方接受转发链接；无法安全识别时明确要求重新生成验证邮件。
4. 收件地址界面明确展示当前用户唯一前缀、共享收件域名及完整专属地址。
5. 本地 `.env.local` 补充收件域名配置（该文件保持 Git 忽略，不会提交）。

浏览器验收：

- 桌面端 Gmail 等待卡与 QQ 已收到卡均正常显示。
- QQ 验证邮件详情正常显示安全提示和“未识别到安全验证入口”空状态。
- 手机端 390×844 视口无横向溢出，地址组成与验证卡片改为单列。

### 2026-08-16：收件人和通知归属隔离

本地提交：`fe748a9`（`fix: isolate inbound mail ownership by user`）

1. Webhook 改为精确匹配完整收件地址的唯一前缀，不再把 `+标签` 地址折叠为已有账号。
2. 零匹配、多账号匹配或重复前缀全部进入隔离结果，不写入邮件记录和通知。
3. 收件人、邮件所属用户和通知所属用户使用同一个不可分叉的 `owner` 对象；通知写入前再次断言用户一致。
4. 邮件记录保存脱敏审计所需的 `recipientAlias`，但接口继续按当前登录用户和 RLS 双重限定。
5. 新增只读审计命令：`npm run audit:mail-isolation -- <snapshot.json>`。工具不连接数据库、不修改数据，只输出脱敏异常清单。

验证结果：

- `npm test`：24 个测试文件、91 项测试全部通过。
- `npm run lint`：通过。
- `npm run build`：Next.js 生产构建和 TypeScript 检查通过。
- `http://localhost:3000/app`：开发服务已重新启动并返回 200。
- GitHub `origin` 仍为空；`.vercel/project.json` 仍禁用；未推送、未部署、未执行 Supabase 迁移或历史清理。

## 已知边界与后续处理

- 本地环境未配置 `RESEND_API_KEY`，因此旧的、只保存纯文本且没有保存官方链接的 QQ 验证邮件无法再次从 Resend 拉取原始 HTML；新邮件仍会由线上 Webhook 保存安全链接。需要本地复现完整验证入口时，再由用户提供本地专用 Resend 密钥。
- 当前代码未连接线上执行历史审计，也未清理任何线上记录。获准处理数据库后，应先导出只读快照，再运行审计工具；只能自动清理归属可可靠确认的记录。
- 两个账号完整专属地址不同的自动化测试已覆盖；真实管理员/Testing 双账号浏览器对照仍需要分别登录后人工验收。
