# 2026-09-08 网站验收与发布记录

## 范围与授权

- 用户已明确授权本轮已验收网站改动推送 GitHub main、部署阿里云，以及启用每分钟额度维护服务。
- PDF 必须先通过真实转换验收才启用；不把单元测试或构建成功视为 PDF 视觉验收。
- 本轮工作在独立 worktree `.qa/website-release-20260908`。根工作区的网申插件改动未合并、未覆盖。
- 未调用 AI、未发送邮件、未删除或修改用户账号，也未使用真实用户简历作转换样本。

## 已上线且现场验证：额度维护

- 正式仓库和服务器源码版本：`b931c251478a656dbc481274f77fd29ce2a13df8`。
- 网站应用构建保持原版本；此次提交仅增加维护工具与文档，没有更换网页构建。
- 已安装独立无登录系统用户 `zhitu-quota`；每分钟 systemd timer 已启用。
- 首次服务结果：`Result=success`、`ExecMainStatus=0`。
- 服务内存上限 192 MiB、CPU 上限 25%、TasksMax 32；维护脚本仅调用既有额度 reconciliation RPC。
- 服务使用服务器现有 Supabase 服务端密钥；该密钥仍是高权限密钥，不应描述为数据库单 RPC 专用凭证。
- 独立凭证目录为 root:root 0700，凭证文件为 root:root 0600；原 `.env.local` 从 0644 收紧为 0600。未输出密钥内容。

验收窗口从 `2026-09-08T13:01:33.000Z` 开始。现场只读检查返回：

```json
{
  "event": "ai_quota_timer_verification",
  "successfulRuns": 40,
  "failedRuns": 0,
  "unexpectedApplicationLogs": 0,
  "spacedRuns": true,
  "hostBootRecoveryObserved": false,
  "firstCompletedAt": "2026-09-08T13:01:34.804Z",
  "lastCompletedAt": "2026-09-08T13:43:45.182Z",
  "lastCounts": {"completed": 0, "released": 0, "examined": 0, "skippedLocked": 0},
  "passed": true
}
```

- 同时 HTTP 健康检查返回 `{"ok":true,"service":"zhitutracker","mode":"production"}`。
- 没有重启服务器验证开机恢复；本窗口没有待处理额度记录，不能声称观察到了真实补扣/退回。
- 发现仅验收脚本存在 systemd 239 时间参数兼容问题：ISO `T/Z` 参数退出码 1，等价 `@epoch` 参数退出码 0。计时服务本身不受此问题影响。
- 正式目录未为此临时改代码；在服务器私有 QA 目录创建仅替换时间格式的验收副本，完成上述全套权限、运行间隔、日志核验。
- 永久兼容修复已提交为 PDF 分支 `697f83e`；另有独立维护发布分支 `codex/quota-systemd-239` 的 `6bb375676f913d5967a6be985362eb55c4577f1e`，其 main 推送尚未成功。

## 已实现、未上线：PDF

- 原位置应用用户已确认的文字，复用 DOCX 导出路径；不重新请求 AI，不额外扣次数。
- 转换前取得跨进程独占锁；下载、解压、模板替换纳入限时和并发保护。
- DOCX 解压大小、条目、路径、CRC 和伪造尺寸检查；不会在完整解压后才判断超限。
- 非 root、无网络、只读根目录 Docker 转换，固定镜像 ID，限制内存、CPU、进程数及时间；文字提取也在容器内。
- 一页 A4、文字层与确认文字一致性门槛；不满足就明确失败，不删改确认文字、不强行缩字号。
- PDF 失败保留 DOCX 与版本，支持重试；修复切换简历、离开工作区、响应乱序引起的旧内容下载/按钮锁死。
- PDF 字符检查不是全部 ATS 兼容性或视觉验收；双栏阅读顺序、页眉页脚和排版仍须实际查看 PDF。

## 本地验证证据

- 隔离网站基线 `703253c`：72 个测试文件、532 项测试通过（`src scripts integrations worker`，maxWorkers 2）。
- 独立 TypeScript 检查通过；`next build --webpack` 成功，36/36 静态页面生成，包含 PDF 接口。
- 后续离线官方镜像材料校验工具单独 8/8 测试通过，lint/diff check 通过。
- 不包括另一任务的 `browser-extension`；不能据此声称插件兼容性通过。
- 五份纯合成 DOCX 样本、真实转换驱动和溢出/非 A4 负例已准备；尚无成功的服务器实际转换或视觉证据。

## 发布状态与外部阻塞

- GitHub 正式 main 当前保持 `b931c25`，服务器额度服务已安装并验收通过。
- 远端 `codex/pdf-quota-production` 最后确认到 `8b1076cbf50a7225269971f6e2a95f25f2842369`。
- 本地后续 `703253c`（交付竞态修复）、`3b43026`（官方材料离线校验）已提交，推送遇连接重置/超时，不能描述为已推送。
- GitHub 连接器能只读，但创建树返回 403；没有绕过其权限或修改授权。
- 阿里云 Docker Hub 下载超时；官方 `raw.githubusercontent.com` 文件请求 15 秒无数据超时；同一 Debian 官方仓库固定 commit 的 Git 下载返回 Empty reply。未改用第三方镜像、代理或关闭 TLS。
- 未加载半成品镜像；未启用 PDF 环境变量或更换正式网页构建。

## 下一步

1. 恢复可用的官方文件/Git 传输，或另行确认可用的可信离线构建与传输环境。
2. 推送永久 systemd 验收修复；确认远端实际 SHA 后才更新服务器。若分支分叉，正常合并，不强推。
3. 根据 `docs/official-debian-archive.md` 获取固定官方材料，验证全部 SHA256/diffID，再加载基础镜像。
4. 用受限资源构建转换镜像，记录实际不可变镜像 ID。
5. 运行 `scripts/qa-resume-pdf-real.mjs`；检查一页/双栏/页眉页脚和负例，再逐页渲染查看。失败时不降低校验标准。
6. 通过后才推送并部署 PDF 网站版本；保留上一 `.next` 和回退路径，最后检查健康、权限、下载回退及额度不变。

所有临时验收目录只存代码或合成样本；本轮没有进行清理删除。不要把临时目录当作正式发布目录。
