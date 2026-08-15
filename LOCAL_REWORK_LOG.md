# 职途 Tracker 本地整改记录

> 本文件记录 2026-08-15 起的本地整改操作。整改期间不提交、不推送、不部署；确认验收后再由用户决定是否恢复 GitHub 与 Vercel 连接。

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

回退方法：

```powershell
git remote add origin https://github.com/UKJail/zhitu-campus-recruitment-tracker.git
Move-Item -LiteralPath ".vercel\project.json.disabled" -Destination ".vercel\project.json"
```

## 待记录

- Gmail / QQ 邮箱验证 UI 统一。
- 专属收件地址与通知隔离修复。
- 本地测试和浏览器验收结果。
