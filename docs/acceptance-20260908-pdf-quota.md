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

## 2026-09-09 续验收：生成、预览和下载补齐（未上线）

- 在隔离工作树 `.qa/website-release-20260908` 补充生成后的 PDF 预览、PDF/DOCX 下载和原文件下载；生成成功先预览，不自动触发下载。
- 同一生成版本的预览和下载复用本地 Blob，不重复调用转换或 AI；切换简历/离开页面取消请求、撤销 Blob URL、终止预览 worker 并清除画布。
- 历史版本即使对应分析不可读，仍保留下载入口。原文件接口按登录用户和所属简历双重筛选，私有下载、不缓存，不生成公开存储链接。
- 实测发现 `iframe sandbox=""` 的原生 PDF 预览为空白，已替换为按需加载的 PDF.js 画布预览（同站 worker，不加载 PDF 脚本、表单或链接交互）。真实合成 PDF 在内嵌浏览器显示成功；这是预览器验收，不是服务器 DOCX 转换验收。
- 最终画布预览修改后的全量回归：75 个测试文件、547 项通过；TypeScript、相关 lint 和 `next build --webpack` 通过，36/36 静态页面生成。
- 本地生产构建预览已恢复在 `http://127.0.0.1:3000/app`，未配置真实 Supabase 身份，不能用演示页证明真实账号生成链路。
- 当前原格式生成仍需 DOCX 原模板；PDF-only 输入的原位置重写/重建未实现，不能宣称所有输入格式都已交付。

### 服务器已完成的隔离准备

- 真实应用目录只读确认是 `/opt/zhitu-tracker`；现场健康检查 HTTP 200。没有修改正式环境变量、构建或账号。
- 官方 Debian 固定来源材料完整校验并上传 `/tmp/debian-trixie-slim-amd64.docker.tar`：29,796,352 字节，SHA256 `c63e038754d130aa5dd515070a9e2832aabf95373ac6ce83ce4104bf23f1baeb`。
- `docker load` 成功，镜像 ID `sha256:e426a54f50cc4cf82dd5cab8ba8426ed02c391840cb5a62dfd987542dbabea3b` 与校验配置一致；不含镜像标签覆盖。
- 转换代码和五份合成样例包 `/tmp/pdf-renderer-reviewed-20260908.tar` SHA256 `a31a4810d14034ffcaf5f71500132989e2a9bf3e7c42df0f6244ca3aef796398`，解到新的私有目录 `/opt/zhitu-pdf-qa-reviewed-20260908`；只链接现有 node_modules，不包含网站配置或用户资料。
- 服务器 `--check-fixtures` 通过：5 份、合计 26,271 字节、3 个实际运行模块预编译与安全档案检查成功。输出明确为 `realRenderPerformed:false`。
- 转换镜像构建已启动，限制 768MB 内存/无额外 swap/1 CPU，日志 `/tmp/zhitu-pdf-build-reviewed-20260908.log`；仅使用官方 Debian 源。基础镜像中安装约 192MB 的组件下载很慢，最后观察到第 23 个包（libreoffice-common），尚未得到最终转换镜像 ID。
- **尚未进行真实 DOCX→PDF 转换、中文/双栏视觉验收或正式部署。** 不因自动测试或预览器样例通过而放行。

### 继续时先做

1. 读取上述构建日志并检查 Docker 镜像，不重复启动同一构建。阿里云标签页最新终端为 `5f5y5kqb2h`；操作前核实连接。
2. 若构建成功，记录不可变镜像 ID，再在隔离目录运行 `node scripts/qa-resume-pdf-real.mjs --image=sha256:<实际ID> --docker=/usr/bin/docker --out=/tmp/zhitu-pdf-real-<新的目录>`；不得加载 `.env`。
3. 下载合成 PDF/检查报告，逐页转 PNG 并目视核验。通过后再做真实身份下网页生成→预览→双格式下载且额度不变的联调。
4. 用户已明确允许阿里云官方镜像站。仅构建时可选 `DEBIAN_MIRROR=aliyun-vpc`，使用阿里云文档规定的 VPC HTTP 地址；与基础镜像原 HTTP 传输方式相同，保持原 Debian Signed-By/keyring 与签名/哈希校验，不使用 `trusted=yes`、不关闭 TLS 验证、不改宿主机源。新包 SHA256 `4feddd35f7ec77bef49fb0035d0907cea4f98c454c879f26b634362b5880518a`，新日志 `/tmp/zhitu-pdf-build-aliyun-20260909.log`；先检查这个构建的最终结果。
5. 本地服务端口 3000 已确认 LISTENING、HTTP 200；但内嵌浏览器旧标签仍返回连接失败页。未绕过浏览器限制，不能宣称本地完整网页浏览器联调通过。独立端口的合成 PDF 预览器已实际显示成功。

## 2026-09-09 最新续验收：镜像构建成功，真实转换发现双栏提取误报（未发布）

本节替代上文“尚未实际转换/镜像仍在下载”的状态；不改变之前记录的历史事实。网页功能提交为 `7ebe6a1`，仍只在本地隔离分支，没有推送或部署。

- 在用户明确允许后，仅隔离镜像使用阿里云官方 VPC Debian 镜像站；APT 原有签名与哈希检查保留，宿主机源未修改。
- 构建成功：`zhitu-resume-pdf:reviewed-20260909`，不可变 ID `sha256:4cb43e89cc7c8d2eff9ec3f3fedf8ea5a13109cefd0cd0373a0b07ec720a41cc`。该镜像仍使用旧 `-layout` 提取，不能作为修复版发布。
- 真正运行了五份合成 DOCX 的受限容器转换，输出 `/tmp/zhitu-pdf-real-20260909-a`，每份约 1.2 秒。单栏 A4 与页眉页脚通过；两页样例正确返回 `PAGE_COUNT`；Letter 纸张正确返回 `PAGE_SIZE`；双栏表格返回 `TEXT_MISMATCH`，总结果不能标为通过。
- 五份样例均验证 `busyRejected`、`busyPrepareSkipped`、`preparedOnce`、`sourceUnchanged` 为真。没有调用 AI、网站配置或真实用户简历。
- 双栏实际输出是一页 A4（595.304 × 841.89 pt），PDF SHA256 `694ef6ea6848339ddcbc70f385601fa765faa47d494b96466b668faf2f146e26`。旧物理行提取在右栏句子的“个人”和“独立成果”之间插入了左栏 `Excel SQL Python`，触发严格原文连续性检查。尚未目视检查 PDF，不能据此断言排版已通过。
- 本地候选修复改用 Poppler 默认阅读顺序提取，去掉 `-layout`，不使用 `-raw` 兜底，不降低原文连续性和字符计数要求；4 项 Python 合约测试、72 项相关 TypeScript 测试及完整网站 75 文件/549 项回归通过，相关 lint 和 diff 检查通过。修复版尚未上传、重建或实际转换复验。
- 归档 `/tmp/zhitu-pdf-qa-results-20260909.tar` 只含上述合成样例和报告，SHA256 `2ad183fe6edf727b8ea6bb04e5adf27974e7d8bb335cde8b5f3e37483320f8c7`。阿里云文件下载跳转被内嵌浏览器 `ERR_BLOCKED_BY_CLIENT` 拦截，未绕过；已请用户下载此精确归档并提供本地文件。没有展开无关的服务器临时目录。
- 返回服务器工作台后出现“当前版本加载失败”，尝试官方“返回旧版”仍超时。不要重复执行未核实的终端粘贴命令；需要恢复后先读当前状态。

### 恢复后的验收顺序

1. 校验用户提供归档的 SHA256，安全展开到新的本地 QA 目录；用实际 PDF 对比默认阅读顺序提取与旧版提取。逐页渲染查看全部五份（含两页负例），不得将文本检查当视觉证明。
2. 上传本地修复的隔离转换代码、校验哈希，使用既有固定 Debian 基础镜像重建（可复用安装层缓存），记录新不可变镜像 ID。
3. 用新 ID 跑同一五份样例，输出新的 `/tmp/zhitu-pdf-real-20260909-b`；全部符合预期且页面目视通过后才继续。
4. 完成获授权的真实身份生成→预览→PDF/DOCX 下载联调与额度不变检查。仍然只支持 DOCX 原模板生成；PDF-only 重建尚未实现。
5. 上述条件通过后才推送网站发布、备份旧构建并部署；当前未启用正式 PDF 环境变量，未更换正式网页构建。
