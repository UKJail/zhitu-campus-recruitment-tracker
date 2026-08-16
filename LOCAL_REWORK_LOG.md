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

### 2026-08-16：简化用户侧专属收件地址

本地提交：`b1daf44`（`ui: simplify personal inbound address`）

1. 自动转发设置页仅展示当前用户可直接使用的完整专属收件地址和“复制地址”按钮。
2. 隐藏唯一前缀、共享域名及地址组成说明，避免向普通用户暴露无须理解的实现细节。
3. 仅修改前端展示；地址生成、Webhook 精确归属、通知所有权校验和数据库隔离逻辑均未改变。

验证结果：

- `npm run lint`：通过。
- `npm test`：24 个测试文件、91 项测试全部通过。
- `http://localhost:3000/app`：端口监听正常并返回 200。
- 双账号真实邮件验收：发往 Testing 的邮件仅 Testing 收到，管理员未收到；发往管理员的邮件仅管理员收到，Testing 未收到。双向隔离通过。

### 2026-08-16：邮件入口、投递目标与反馈后台整改

1. 顶部设置入口改为邮件图标，并将可访问名称、悬停提示和弹窗标题统一为“面试邮件自动转发设置”。
2. 删除 163 邮箱教程，只保留 Gmail、Outlook、QQ 邮箱；桌面与手机端均改为三列等宽标签。
3. 今日确认投递目标支持用户直接在侧边栏调整，允许 1—200 的整数；目标保存到当前账号的 Auth 用户偏好中，不作为权限判断依据，也不需要数据库迁移。
4. 账号接口同时支持用户 ID 与投递目标的独立更新，并为缺失或无效的旧偏好保留默认目标 20。
5. 管理员入口明确包含“用户反馈”；后台缺少本地管理员密钥时，不再错误提示配置 Vercel，而是提示仅在本机 `.env.local` 补充且禁止提交。
6. 只读检查确认 `user_feedback` 已有 2 条记录；管理员看不到反馈的直接原因是本地 `SUPABASE_SERVICE_ROLE_KEY` 为空，管理员概览接口返回 503。未绕过 RLS、未读取反馈正文、未修改线上数据。

验证结果：

- `npm test`：25 个测试文件、94 项测试全部通过。
- `npm run lint`：通过。
- `npm run build`：Next.js 生产构建和 TypeScript 检查通过。
- `http://localhost:3000/app`：端口 3000 正常监听并返回 HTTP 200。
- GitHub `origin` 仍为空；Vercel 本地项目绑定仍禁用；未推送、未部署、未执行 Supabase 迁移。

## 已知边界与后续处理

- 本地环境未配置 `RESEND_API_KEY`，因此旧的、只保存纯文本且没有保存官方链接的 QQ 验证邮件无法再次从 Resend 拉取原始 HTML；新邮件仍会由线上 Webhook 保存安全链接。需要本地复现完整验证入口时，再由用户提供本地专用 Resend 密钥。
- 当前代码未连接线上执行历史审计，也未清理任何线上记录。获准处理数据库后，应先导出只读快照，再运行审计工具；只能自动清理归属可可靠确认的记录。
- 两个账号完整专属地址不同的自动化测试已覆盖；真实管理员/Testing 双账号浏览器对照仍需要分别登录后人工验收。
- 管理员要在本地看到用户反馈，仍需从 Supabase 项目设置复制 service role 密钥到本机 `.env.local` 的 `SUPABASE_SERVICE_ROLE_KEY`，然后重启本地服务。密钥不得发到聊天、截图或提交 Git。

### 2026-08-16：按企业官网清单重建校招职位库

数据来源：`中国大陆及香港中大型企业招聘官网清单.xlsx` 的“企业清单”工作表，共整理 161 家企业及其官方招聘入口。

1. 生成 `worker/data/company-career-sources.json`，保存公司中英文名、市场、行业、招聘地区、官网入口、入口类型和核验日期；Worker 可通过 `COMPANY_SOURCE_ORDINALS` 分批启用来源。
2. 新增官方招聘页通用适配器，只读取公开网页中的 Schema.org `JobPosting` 数据；遇到登录、验证码、401、403、412、429 或其他访问限制时暂停该来源，不绕过访问控制。
3. 新增城市中文规范化，英文、拼音和中英文组合地点统一转换为中文；职位库城市筛选会把多城市岗位拆成独立中文选项。
4. 腾讯官方公开接口只返回 2 条超过 180 天的旧岗位，因此加入 180 天时效规则并删除这 2 条过期测试数据，当前不展示腾讯旧岗位。
5. 完成百度校园招聘官方接口适配，完整分页读取校招、实习、管培及 AIDU 相关职位；仅保留中国大陆及香港且 180 天内更新的岗位，生成可直接打开的百度官方详情链接。
6. 清理原职位库：物理删除 52 条未关联的测试岗位；另有 2 条旧岗位关联了不可覆盖的申请时间线，按数据库完整性规则保留但标记为隐藏，用户端不会看到。
7. 写入 449 条百度官方近期岗位。数据库当前共 451 条职位，其中用户可见官方岗位 449 条、隐藏的旧关联岗位 2 条。

本地验收：

- 职位库显示“当前收录 449 个职位”，共 45 页；来源显示为“百度集团｜官方招聘”。
- 公司筛选目前仅出现“百度集团”；城市筛选仅显示上海、北京、南京、大连、广州、成都、杭州、武汉、深圳、苏州、郑州等中文城市。
- 首页高匹配职位与职位库均只展示本轮官方岗位；原有测试岗位不再出现。
- `npm test`：29 个测试文件、108 项测试全部通过。
- `npm run lint`：通过。
- `npm run build`：Next.js 生产构建和 TypeScript 检查通过。
- GitHub `origin` 仍为空；Vercel 本地绑定仍禁用；未推送、未部署。

已知边界：

- 本轮先完成百度的全量官方适配。其余企业中，兼容公开 `JobPosting` 结构化数据的页面可由通用适配器采集；动态接口或不同招聘系统仍需逐个增加来源适配器。
- 52 条已物理删除的测试岗位只能从数据库备份恢复；2 条有关联记录的旧岗位仍安全保留在数据库中，但已从所有用户职位查询中排除。

### 2026-08-16：暂停扩展来源并交接采集任务

1. 保留当前已同步的 449 条百度官方近期岗位，不再继续尝试高消耗的逐站接口探索。
2. 新增 `JOB_CRAWLING_HANDOFF.md`，完整记录企业清单、已完成适配器、清理结果、数据库现状、百度公开接口、腾讯时效结论、北森站点探索线索、安全边界、测试命令和 DeepSeek 接手顺序。
3. 未继续写入其他企业岗位；未推送 GitHub、未部署 Vercel、未修改线上部署连接。

### 2026-08-16：求职日历 ETA 兔子彩蛋

1. 在求职日历标题后加入用户提供的轮滑兔子原图，仅作为装饰，不改变日历功能和数据。
2. 图像生成工具无法可靠输出透明底，因此未采用其重绘结果；网页改用原图配合白色卡片和混合模式，在视觉上只保留原始兔子，避免角色细节被篡改。
3. 加入彩虹流动的 `What's your ETA` 字样和轻微轮滑起伏动画；系统开启“减少动态效果”时自动停止动画。
4. 增加桌面、手机布局适配；素材保存为 `public/newjeans-bunny.jpg`。
5. 本次仍仅修改本地文件，未推送 GitHub、未部署 Vercel。

### 2026-08-16：将有活简历助手改造成职途校招岗位采集器

原 WorkBuddy Skill：`C:\Users\k'k\.workbuddy\skills\youhuo-resume__skillhub`

可恢复备份：`C:\Users\k'k\.workbuddy\skills\youhuo-resume__skillhub__backup_20260816`

本地维护源：`D:\求职追踪网页\integrations\workbuddy\zhitu-campus-job-collector`

1. 只读检查原 Skill 1.5.5：确认其核心采集相关能力只有 541 家企业官方招聘入口与静态查询脚本，不包含岗位分页、JD 提取、日期过滤、城市转换或职位库导入。
2. 保留 MIT 许可证、原作者版权声明、图标和 `assets/apply-portals.json` 企业入口库。
3. 删除简历诊断、STAR 改写、主题、HTML/PDF 渲染、简历 Schema、样例简历和矩阵导流能力。
4. 将 Skill 更名为“职途校招岗位采集器”2.0.0，触发范围改为校招岗位采集、职位库同步、企业官网查询和职途 JSON 导出。
5. 新增公开来源规则、职途岗位 Schema 和 Worker 接入说明；明确不登录、不绕过验证码、受限来源暂停、每批只处理 3—5 家企业、写库前必须确认。
6. 新增四个确定性脚本：企业入口查询、公开 JSON-LD `JobPosting` 提取、中文城市/招聘类型/规范链接/指纹生成、岗位质量报告。
7. 使用本地样本验证：3 条原始岗位保留 1 条校招和 1 条实习、排除 1 条社招；Shenzhen/Hong Kong 转为深圳/香港；移除 UTM 参数；质量检查通过。
8. 原 Skill 整体移动到上述备份目录，新版复制到原目录启用；备份未删除。

恢复方法：关闭 WorkBuddy，将当前 `youhuo-resume__skillhub` 移走，再把 `youhuo-resume__skillhub__backup_20260816` 改回 `youhuo-resume__skillhub`。恢复前不得覆盖或删除备份。

已知边界：通用脚本只能直接采集公开 JSON-LD 岗位；动态招聘系统仍需按公开接口逐个添加适配器。当前 Windows 没有全局 `python` 命令，但 WorkBuddy 原 Skill 本身依赖 Python 脚本；本地验证使用 Codex 自带 Python 3.12.13 完成。

### 2026-08-16：合并秋招雷达偏好能力并接入职位库

参考 Skill：`C:\Users\k'k\.workbuddy\skills\qiuzhao-radar`（只读分析）

维护源：`D:\求职追踪网页\integrations\workbuddy\zhitu-campus-job-collector`

1. 提取秋招雷达中可复用的偏好档案、辅助发现、已见岗位去重和 S/A/B 排序；没有照搬聚合站优先、Markdown 岗位状态表或手动投递管理，因为职途已有官方来源、数据库去重和申请时间线。
2. 将采集器升级为 2.1.0：企业官网继续是唯一可导入来源；当批官方新岗位不足 5 个时，聚合页与搜索结果仅用于发现线索，必须回到官网核验后才能导入。
3. 新增 `scripts/rank_jobs.py`、偏好规范、默认偏好和测试样本；支持届别、岗位方向、城市、校招/实习、关注公司、排除关键词、S/A/B 偏好等级和追加式已见指纹。
4. 职途账号接口新增 `jobPreferences`，保存在当前登录用户的 Supabase Auth `user_metadata`；保存前保留其他元数据，不新增数据库表、不执行迁移。
5. 职位库新增“我的求职偏好”卡片、设置弹窗和“符合我的偏好”筛选；命中岗位显示独立的 `S/A/B 偏好` 标记，不覆盖或伪装 DeepSeek 简历匹配分。
6. 偏好硬筛选包括排除关键词、岗位方向、城市、招聘类型和页面明确写出的届别；关注公司只加分，未填写条件不限制结果。
7. 新增账号偏好解析和职位偏好匹配单元测试；桌面与手机端补充响应式布局、键盘焦点继承和 16px 手机输入字号。
8. 将通过验证的 2.1.0 维护源同步到 WorkBuddy 原 Skill 目录；第一次复制因 PowerShell `LiteralPath` 不展开通配符而未产生修改，随后改为逐项复制并确认版本号与 `rank_jobs.py` 均已生效。原 2.0 前备份目录未覆盖、未删除。

验证结果：

- 采集器样本：2 条校招/实习岗位均进入偏好结果，S 级 2 条；已生成追加式已见指纹。
- `npm test`：30 个测试文件、112 项测试全部通过。
- `npm run lint`：通过。
- `npm run build`：Next.js 16.3.0 生产构建和 TypeScript 检查通过。
- 本地开发服务已恢复，`http://localhost:3000` 显示 Ready；未推送 GitHub、未部署 Vercel、未执行 Supabase 迁移。

已知边界：内置浏览器的本地 URL 安全策略阻止本轮自动截屏验收，因此只完成 HTTP、测试和构建验证；用户仍可在当前 `localhost:3000/app` 页面直接检查界面。偏好储存在用户可编辑元数据中，只用于个性化展示，绝不能用于管理员权限、邀请资格或其他授权判断。

### 2026-08-16：WorkBuddy 岗位采集与职途格式交接文档

1. 新增 `WORKBUDDY_JOB_COLLECTION_GUIDE.md`，规定 WorkBuddy 如何调用职途校招岗位采集器、如何按 3—5 家企业分批处理、何时允许辅助发现以及何时必须暂停来源。
2. 文档固定职途 `CollectedJob` 字段、中文城市、180 天时效、三层去重、偏好排序、每家公司至少 2 条人工抽样和禁止猜测规则。
3. 规定每批交付 7 个文件：原始岗位、职途岗位、偏好排序岗位、偏好、来源状态、未核验线索和采集报告。
4. 明确 WorkBuddy 只生成报告和文件，不直接写数据库；必须经过第二次校验、用户确认和职途服务端 Worker 后才能写入。
5. 在 Skill 中加入 `references/workbuddy-handoff.md` 路由，要求生成职途批次包时读取项目维护源；未推送、未部署、未执行数据库写入。
6. 已把新的 Skill 入口与交接引用同步到 WorkBuddy 启用目录，确认版本 2.1.0、交接引用、偏好排序脚本和岗位 Schema 均存在。
7. Skill Creator 的 `quick_validate.py` 已实际运行，但本机缺少 PyYAML，返回 `ModuleNotFoundError: yaml`，因此未声称自动校验通过；改用只读结构检查确认必需文件和引用齐全。

### 2026-08-16：将 WorkBuddy 采集器改为纯官方岗位日更源

1. 根据最新范围，WorkBuddy 不再读取个人偏好或生成 S/A/B 排序；职途网页自身已有的用户偏好筛选未删除，但不参与采集和同步文件。
2. 将采集器升级为 2.2.0，移除 `rank_jobs.py`、偏好规范、默认偏好和偏好测试样本；Skill 的触发描述与主流程明确限定为官方公开校招、应届生、管培生和实习岗位。
3. 新增 `build_daily_plan.py`：从 541 个官方招聘入口中按游标生成每日 3—5 家轮转计划；同一天重跑复用原计划，只有显式 `--force-next` 才推进下一批。
4. 新增 `build_sync_bundle.py`：合并规范化岗位，按稳定字段计算变化，生成 `zhitu-jobs.json`、`zhitu-upserts.json`、`catalog-snapshot.json`、`sync-manifest.json` 和 `collection-report.md`。
5. 增量同步采用零删除策略：单个每日批次未再次看到历史岗位不等于下架，不自动删除职途记录；下架需要针对同一官网来源连续复核。
6. 重写 `WORKBUDDY_JOB_COLLECTION_GUIDE.md` 和 Skill 交接引用，删除所有个人偏好输入与排序交付物，加入每日轮转、失败恢复和职途增量包流程。
7. 使用 WorkBuddy 自带 Python 3.13 实际验证：同日第二次计划 `reused=true`；样本 3 条岗位保留 2 条校招/实习并排除 1 条社招；首次同步生成 2 条 upsert，再用快照重跑时 upsert 为 0。
8. 2.2.0 已同步到 WorkBuddy 启用目录；已废弃偏好文件从启用目录移除。`youhuo-resume__skillhub__backup_20260816` 原始备份保持未修改。

已知边界：

- Skill 本身不是后台定时器；需要 WorkBuddy 每日触发该任务，或后续单独配置系统定时任务。当前实现保证每日批次和增量包可重复生成，但没有擅自创建外部定时任务。
- 541 个入口是官网目录，不代表每个动态招聘网站都已有自动适配器。JSON-LD 页面可通用处理；其他网站仍需按官网真实公开接口逐个适配，登录、验证码或受限来源必须暂停。
- Skill Creator 官方 `quick_validate.py` 仍因 WorkBuddy Python 缺少 PyYAML 无法运行；本轮新增脚本均已由 WorkBuddy Python 实际执行，未安装额外依赖。
- 本轮未写职途数据库、未推送 GitHub、未部署 Vercel。

### 2026-08-16：本地登录恢复与防复发

1. 确认 `localhost:3000` 与 Next.js 页面本身正常；实际故障是原开发服务器进程无法访问 Supabase Auth。管理员和 Testing 账号未被删除、停用或重置。
2. 新增认证错误分类，把认证服务不可达、密码错误、验证码错误或过期、请求过于频繁、账号停用和会话写入失败分别映射为明确提示，不再把网络故障统一显示成“登录信息无效或已过期”。
3. 新增 `/api/health/auth`，对 Supabase Auth 健康端点执行真实请求；登录页加载时显示认证链路状态。
4. 新增本地启动预检脚本。`npm.cmd run dev` 会先检查 `.env.local` 和 Supabase Auth 连通性，失败时直接停止并说明原因，通过后才启动 Next.js。
5. 密码恢复临时凭证改用独立的 `AUTH_RECOVERY_GRANT_SECRET`，不再复用 `SUPABASE_SERVICE_ROLE_KEY`；本地未配置时只为当前进程生成临时密钥，生产发布前需配置稳定随机值。
6. 固定 Next.js、React、Supabase 和 Zod 的直接依赖版本，并离线更新锁文件，避免重新安装时被 `latest` 或范围版本静默升级。
7. 新增认证错误分类、认证健康检查和独立恢复密钥测试；未发送真实验证码、未读取用户密码、未修改 Supabase 数据。

回退说明：本阶段未推送、未部署、未执行数据库迁移。需要回退时仅撤销本节相关认证文件、启动脚本、依赖固定和文档改动；不要回退同一工作区内其他尚未发布的用户改动。

最终验证：

- `npm.cmd test`：32 个测试文件、119 项测试全部通过。
- `npm.cmd run lint`：通过。
- `npm.cmd run build`：Next.js 16.3.0 生产构建和 TypeScript 检查通过。
- 已确认旧进程属于 `D:\求职追踪网页` 后停止该进程，并从可联网环境重新启动；启动预检显示 Supabase Auth 连接正常，Next.js 在 `http://localhost:3000` Ready。
- `GET /api/health/auth` 返回 `ok: true`，首页返回 HTTP 200；浏览器随后成功请求 `/api/auth/session`、`/app`、账号、职位和日历接口。
- 真实密码和验证码由用户自行输入，本轮未读取、保存或发送任何凭据；管理员与 Testing 的真实密码登录、最新验证码登录以及完整找回密码邮件流程仍需用户在页面完成最终人工验收。

### 2026-08-17：求职进度卡片删除功能

1. 为申请看板的每一张投递卡片增加独立删除按钮、键盘可访问名称和二次确认弹窗；未在验收过程中删除用户的真实测试记录。
2. 因 `application_events` 是不可覆盖、不可删除的时间线，删除采用可追溯软删除：写入 `deleted_by_user` 事件，并从职位聚合结果、看板和统计中隐藏该申请。
3. 从职位库重新打开同一岗位，或再次手动确认外部投递时，会写入 `restored_by_user` 事件并恢复显示，避免唯一约束导致无法重新投递。
4. 删除接口同时按当前登录用户和申请 ID 查询，其他账号的申请返回 404；原有 RLS 仍作为数据库层隔离。
5. 新增申请可见性单元测试，覆盖默认显示、删除隐藏、恢复显示以及以最新生命周期事件为准。

验证结果：

- `npm.cmd test`：33 个测试文件、123 项测试全部通过。
- `npm.cmd run lint`：通过。
- `npx.cmd tsc --noEmit`：通过。
- 本地浏览器确认每张现有卡片显示“删除投递记录”按钮，确认弹窗可打开和返回，控制台无错误。

回退说明：未执行数据库迁移、未推送 GitHub、未部署 Vercel。需要回退时撤销本节新增的申请可见性工具、DELETE 路由，以及职位聚合、恢复入口、看板和样式改动即可。
# 2026-08-17 WorkBuddy 企业校招入口接入

- 核对 WorkBuddy 合并清单：541 家目录企业＋161 家表格企业，12 家重合，合并后 690 条。
- 保留企业共用招聘官网的关联记录，不按 URL 误删；浏览器端只展示企业名称、行业和官方招聘网站按钮。
- 新增本地同步脚本 `scripts/sync-workbuddy-career-portals.mjs`，把完整核验文件裁剪为前端需要的最小字段。
- 职位库新增“具体岗位 / 企业校招入口”双视图；企业入口不计入岗位数、匹配分或投递统计。
- 验证结果：125 项测试、TypeScript、ESLint、Next.js 生产构建全部通过；本地浏览器完成企业搜索、行业筛选及 390px 手机布局验收。
- 数据风险：最终清单为 active 506、seasonal 2、review_required 97、restricted 18、unavailable 67；后续更新应继续复核不可访问和待确认入口。
- WorkBuddy 自检脚本仍有两处非数据错误：`industry 待确认 count` 将数字 0 误作失败，网络核验阶段曾引用未定义的 `prog` 变量。
- 本阶段未推送 GitHub、未部署 Vercel、未执行 Supabase 数据库迁移。

# 2026-08-17 WorkBuddy 周更职位首次同步

- 更新 `scripts/sync-workbuddy-offerstar.mjs`：优先读取 WorkBuddy 新快照的顶层 `recruitmentType`、`industry`、`postDate`、`deadline` 字段，同时保留旧 `rawData` 格式兼容。
- 增加 `--dry-run` 预演模式；预演只校验和统计，不写入职位目录或同步报告。
- 预演接收并通过 20,479 条岗位，0 条重复、0 条拒绝；其中应届生 20,208 条、实习 262 条、其他 9 条、微信公众号链接 18,475 条。
- 替换前保存旧目录回退副本 `imports/workbuddy/offerstar/offerstar-jobs.pre-weekly-sync-20260817.json`，随后将本地 OfferStar 职位目录更新为 20,479 条。
- 按用户决定保留全部 690 家企业入口，不按 WorkBuddy 状态过滤；不生成额外的岗位差异明细报告。
- 验证结果：35 个测试文件、131 项测试全部通过；ESLint 与 TypeScript 检查通过。登录态本地页面显示顶部和默认列表均为 20,479 条；筛选 FIBA 中国后顶部保持 20,479、列表变为 1，清除筛选后恢复 20,479；浏览器控制台无错误。
- 本阶段未推送 GitHub、未部署 Vercel、未执行 Supabase 数据库迁移。

# 2026-08-17 OfferStar 全量职位目录接入

- 接收 WorkBuddy OfferStar 快照 20,638 条；按来源 ID 去重 51 条，最终导入 20,587 条有效岗位，0 条因格式被拒绝。
- 职位库目录改为只读取 OfferStar 本地全量文件；原数据库岗位不再作为职位库目录返回，首页和进度页仅保留用户真实收藏或申请记录。
- 缺少 JD 的 OfferStar 岗位不生成虚假描述，页面引导用户打开原始详情自行查看或复制。
- 采用按需入库：用户收藏或准备投递时，才将对应 OfferStar 岗位写入 `jobs`，继续支持收藏、投递确认和时间线。
- 新增 `sync:offerstar` 与 `sync:career-portals` 脚本，并固定 WorkBuddy 周更交付目录为 `C:\Users\k'k\WorkBuddy\zhitu-career-jobs\latest`。
- 新增 `WORKBUDDY_WEEKLY_SYNC_HANDOFF.md`，约定每周全量快照、失败保留旧版本、统计报告、文件格式及发布边界。
- 当前阶段未使用管理员服务密钥，因此旧数据库岗位尚未物理删除；它们已从职位库隐藏。后续物理清理必须先导出审计快照并由用户再次批准。
- 最终验证：35 个测试文件、127 项测试全部通过；ESLint 通过；Next.js 16.3.0 生产构建与 TypeScript 检查通过。
- 本地浏览器确认职位库显示 20,587 条 OfferStar 岗位、每页 10 条、共 2,059 页，第二页可以正常加载；浏览器控制台无应用错误。

# 2026-08-17 OfferStar 职位筛选栏精简

- 页面顶部仅显示“当前收录 X 个岗位”，删除 OfferStar 品牌后缀、说明文案和“订阅职位提醒”入口；顶部与表格结果数量统一读取同一份服务端统计。
- 删除“经验”筛选；招聘类型固定为“全部 / 校招 / 实习”，OfferStar 中所有非实习记录统一归入校招，避免出现第三类杂项。
- 城市筛选改为白名单归一化：中英文城市名统一为中文，合并多城市记录，保留全国、海外、远程和地点待确认，过滤日期、推文、加号数量及文本碎片。
- 公司筛选从包含数千个 `<option>` 的超长下拉框改为 184px 紧凑输入框，支持按公司部分名称查询；同时缩小了接口响应和页面 DOM，解决长公司名撑宽与页面检查变慢的问题。
- 本地浏览器验证：默认总数上下均为 20,587；输入“腾讯”后上下均变为 116；实习筛选上下数量一致；经验筛选和订阅按钮均不存在；城市选项中未发现日期、推文、`+N`、`具体` 或省份后缀等脏值。
- 最终验证：35 个测试文件、130 项测试全部通过；ESLint 无警告；Next.js 16.3.0 生产构建与 TypeScript 检查通过；独立冷启动浏览器控制台无错误。
- 本阶段未推送 GitHub、未部署 Vercel、未执行 Supabase 数据库迁移。

# 2026-08-17 职位库总收录数与筛选结果数拆分

- 修正职位库顶部和列表共用筛选结果数的问题：接口新增 `catalogTotal`，固定表示完整 OfferStar 去重目录的岗位总数；原 `total` 继续表示当前筛选结果数并用于分页。
- 页面顶部“当前收录 X 个岗位”改用 `catalogTotal`；列表“共找到 X 个职位”和分页继续使用 `total`。搜索、公司、城市、招聘类型、偏好及收藏筛选不再改变顶部总数。
- 新增单元测试，明确验证 4 条全量记录经过公司筛选剩余 1 条时，`catalogTotal=4` 且 `total=1`。
- 本地浏览器验证：默认顶部和列表均为 20,587；筛选 FIBA 中国后顶部保持 20,587、列表变为 1；刷新清除筛选后列表恢复为 20,587，控制台无错误。
- 最终验证：35 个测试文件、131 项测试全部通过；ESLint 通过；Next.js 16.3.0 生产构建与 TypeScript 检查通过。
- 本阶段未推送 GitHub、未部署 Vercel、未执行 Supabase 数据库迁移。

# 2026-08-17 本地运行可复现性收尾

- 确认本地启动脚本已在缺少 `AUTH_RECOVERY_GRANT_SECRET` 时为当前进程生成临时随机密钥，因此普通本地启动和密码重置回调不依赖管理员服务密钥。
- 临时恢复密钥只在当前本地服务进程内有效；如果服务重启，重启前发出的密码重置链接需要重新申请，这是本地隔离模式下的预期行为。
- 在 `package.json` 中固定 `pnpm@11.19.0`，并将剩余 `latest` 依赖全部锁定为当前已经安装和验证的精确版本；同步更新 `pnpm-lock.yaml` 的入口声明，避免重启或重新安装后自动升级导致认证和页面行为变化。
- `pnpm install --lockfile-only --offline` 触发了环境附加的供应链联网检查并被主动停止；未改动已安装依赖。锁文件入口已按现有解析版本完成一致性校正。
- 最终验证：35 个测试文件、131 项测试全部通过；ESLint 与 TypeScript 检查通过；`GET /api/health/auth` 返回 HTTP 200 和 `ok: true`。
- 本阶段未推送 GitHub、未部署 Vercel、未执行 Supabase 数据库迁移。

# 2026-08-17 发布分支本地检查点

- 从 `local-rework` 建立发布分支 `codex/local-rework-release`，保留原本地分支作为回退入口。
- 第一组功能提交：`71fcd05`，包含账号、认证、邮件、申请管理、前端体验与认证健康检查。
- 第二组数据提交：`5510375`，包含 OfferStar 20,479 条岗位、690 条企业入口、职位同步脚本、Worker 适配器和 WorkBuddy 周更交接资料。
- `.gitignore` 明确排除本地检查目录与 `offerstar-jobs.pre-weekly-sync-*.json` 回退副本；环境变量、本地 Vercel 绑定、构建目录和日志继续保持忽略。
- GitHub `origin` 已恢复为 `https://github.com/UKJail/zhitu-campus-recruitment-tracker.git`，但当前网络访问 GitHub 被重置，尚未读取远程历史、推送分支或创建 PR。
- Vercel 连接器可识别团队 `zhitu-tracker`，但当前账号连接未返回项目列表；尚未修改项目设置、环境变量或生产部署。
- 本阶段未执行 Supabase 迁移、未清理线上数据、未修改 Resend Webhook，也未暂停或删除 Railway 服务。

# 2026-08-17 GitHub 与 Vercel Preview 发布记录

- GitHub 远程 `main` 为 `c8ec001`，与本地发布基线一致，没有发现远程额外提交或历史分叉；未使用强制推送。
- 发布分支 `codex/local-rework-release` 已推送到 `origin`。三个可回退提交依次为：`71fcd05`（网站、认证、邮件和用户功能）、`5510375`（OfferStar、企业入口与周同步）、`5026a46`（配置、测试和整改记录）。
- 发布前复验：35 个测试文件、131 项测试通过；ESLint 与 Next.js 16.3.0 生产构建通过；`git diff --check` 无空白错误；密钥扫描只命中 README 中的占位说明，没有提交 `.env.local`、`.vercel`、`.next`、本地缓存或岗位回退副本。
- Vercel 项目重新连接到 GitHub 仓库；项目 ID 为 `prj_QaxOzVLYDkdlnkf0qDFHENCRrZFS`，团队为 `ZHITU Tracker`。发布前生产回退点为 `https://zhitu-tracker-mu40pwh0j-zhitu-tracker.vercel.app`。
- Preview 与 Production 已具备计划中的环境变量名称，并新增同一稳定值的 `AUTH_RECOVERY_GRANT_SECRET`。首次 Preview 暴露出公开变量通过标准输入复制时附带换行，导致构建成 demo 模式且 Supabase Auth 不可达；随后改用无换行输入，以本地已验证的公开 Supabase 配置修复 Preview。
- 修复后的 Preview 为 `https://zhitu-tracker-2lwjruge6-zhitu-tracker.vercel.app`，部署检查页为 `https://vercel.com/zhitu-tracker/zhitu-tracker/8AMiR2KnsUfzQjMgRKDL68ouKSXw`。Vercel 构建、TypeScript 和 33 个页面/接口路由全部通过。
- Preview 基础验收：`/` 返回 HTTP 200；`/api/health` 返回 production 模式；`/api/health/auth` 返回 Supabase Auth 正常；未登录访问 `/api/jobs` 返回 401；`/api/career-portals` 返回 690 条企业入口。
- Railway 服务 `creative-essence` 当前 `deploymentStopped=true`，运行实例为 0，且 `source=null`，没有连接 GitHub 自动部署；因此无需删除服务或变量，也不会继续运行旧采集器。
- 尚未合并 `main`、尚未覆盖正式站、尚未执行 Supabase 迁移或线上数据清理、尚未修改 Resend Webhook。下一步必须先完成人工登录、账号隔离、密码重置和核心功能 Preview 验收，再创建/确认 PR 并决定是否合并上线。

# 2026-08-17 Vercel Preview 密钥作用域修复

- 用户明确授权在系统临时目录中短暂处理 Production 密钥，但 Vercel CLI 对敏感变量的导出只返回不可解密的空占位；未将空值写入 Preview，也未在终端或日志中显示任何密钥。
- 改用 Vercel 内部作用域编辑：精确删除无效 Preview 占位项，将 Production 中原有的 `SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`、`DEEPSEEK_API_KEY`、`DEEPSEEK_MODEL`、`RESEND_API_KEY`、`RESEND_WEBHOOK_SECRET`、`RESEND_INBOUND_DOMAIN` 和 `APP_URL` 扩展为 `Production + Preview`；密钥值全程留在 Vercel 加密存储内。
- `NEXT_PUBLIC_DEMO_MODE`、`NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` 及 `AUTH_RECOVERY_GRANT_SECRET` 保留按环境独立记录；审计确认所有 12 个必需变量均覆盖 Preview。
- 所有 `zhitu-vercel-*` 系统临时目录均已删除，审计数量为 0。
- 新 Preview 为 `https://zhitu-tracker-7pp6qvtmt-zhitu-tracker.vercel.app`，部署 ID 为 `dpl_EphwYEaPfBqQXFwbf2v8pmLvAUZY`，状态为 Ready。Vercel 生产构建、TypeScript 和 33 个页面/接口路由全部通过。
- 基础验收：首页 HTTP 200；`/api/health` 正常；`/api/health/auth` 真实连接 Supabase Auth 成功；`/api/career-portals` 返回 690 条企业入口。
- 本次未修改 Resend Webhook，未执行 Supabase 迁移，未合并 `main`，未提升或覆盖正式部署。下一步仍是由用户在新 Preview 中完成管理员和 Testing 真实登录及数据隔离验收。

# 2026-08-17 Preview 简历分析结构纠错

- 用户确认管理员登录、Testing 登录、账号隔离和密码功能均正常；本阶段只修复简历中心的 DeepSeek 岗位匹配分析，不改密码流程。
- 使用不含简历或个人信息的最小请求确认 Preview 所用 DeepSeek 模型、关闭思考参数和 JSON 输出参数均可正常返回；问题不在密钥、模型或 API 参数。
- 根因是 DeepSeek 返回可解析但字段结构不符合 Zod schema 时，分析路由把模型输出校验错误误报成“请求参数无效”。
- DeepSeek JSON 调用现会在每次响应后立即执行目标 schema 校验；字段缺失或类型错误时，最多重试三次，并只向模型提供错误字段路径，要求不得新增或改写简历事实。
- 分析接口先独立校验客户端请求；只有简历 ID、岗位 JD、目标公司或岗位名称本身不合法时才返回 `INVALID_ANALYSIS_INPUT` 和对应中文字段提示，模型输出错误不再冒充前端参数错误。
- 新增模型字段结构纠错测试与分析接口参数分流测试。最终验证：36 个测试文件、133 项测试全部通过；ESLint 与 Next.js 16.3.0 生产构建通过。
- 本阶段尚未合并 `main`、未覆盖正式站、未执行 Supabase 迁移、未修改 Resend Webhook；修复只准备发布到 Preview 供用户复验。

# 2026-08-17 求职偏好与 OfferStar 目录对齐

- 修复“符合我的偏好”只过滤当前 10 条分页结果的问题：偏好条件改为在服务端对完整 OfferStar 目录筛选和排序，再计算结果总数与分页。
- 新增校招岗位方向词表，将产品、数据分析、市场品牌、金融投资等标准方向展开为当前岗位标题中的常见同义表达；自定义小众关键词继续支持精确匹配。
- 偏好弹窗改用目录可识别选项：届别与招聘类型为固定选项，岗位方向为标准标签，城市来自当前 OfferStar 城市目录，公司输入提供高频公司建议。
- 关注公司仍只用于偏好加分，不会排除其他公司；岗位方向、城市、招聘类型、届别和排除词继续作为“符合我的偏好”的筛选条件。
- 为同义词匹配、全目录筛选和公司建议新增测试。最终验证：36 个测试文件、136 项测试通过；ESLint 与 Next.js 16.3.0 生产构建通过。
- 本阶段未合并 `main`、未覆盖正式站、未执行 Supabase 迁移或修改 Resend Webhook；修改仅准备发布到新的 Preview 验收。

# 2026-08-17 职位排序入口精简

- 删除职位列表中的“OfferStar 更新顺序”选项，职位排序只保留“页面日期优先”和“公司名称排序”。
- 默认排序改为“页面日期优先”，没有显式排序参数的职位接口也采用相同默认值。
- 开启“符合我的偏好”时仍优先按偏好匹配分排序，再用用户选择的页面日期或公司名称处理同分岗位，避免精简入口后削弱偏好功能。
- 新增偏好排序回归测试；本阶段只修改发布分支，未合并 `main` 或覆盖正式站。
- 完整验证结果：36 个测试文件、137 项测试通过；ESLint 与 Next.js 16.3.0 生产构建通过。
- 本地提交为 `7900a68`。GitHub HTTPS 连续三次连接重置或超时，远程分支暂未同步；本地提交保持完整且工作区干净。
- 为避免阻塞验收，使用同一份提交直接创建独立 Vercel Preview：`https://zhitu-tracker-97297rq4m-zhitu-tracker.vercel.app`，部署 ID `dpl_GseHcCDY4qpAYip6hEhHRjdKUmvw`，状态 `READY`；正式站未被覆盖。

# 2026-08-17 隐藏职位数据来源

- 职位列表表头由“来源 / 发布时间”改为“发布时间”，每行只展示页面日期，不再显示数据来源名称。
- 职位比较和求职进度看板同步移除来源标签，避免用户在其他入口再次看到来源名称。
- 后端仍保留来源字段，用于数据同步、去重、排错和投递链接管理；本次只调整用户可见内容。
