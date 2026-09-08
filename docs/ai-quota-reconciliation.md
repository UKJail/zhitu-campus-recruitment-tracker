# AI 额度结算恢复（2026-09-08）

## 发布顺序

1. 先在独立测试数据库验证、再部署迁移 `20260908073828_ai_usage_reconciliation.sql`。
2. 网站创建 `ai_runs` 后、任何 DeepSeek 调用之前，调用 `bindAIUsageRun(supabase, taskId, runId)`。绑定失败时不得开始生成。
3. 部署网站代码。绑定调用前先保存 `runId`，失败处理继续将尚未开始的 run 标记失败并释放预留。
4. 独立维护入口为 `scripts/reconcile-ai-quota.mjs`，建议每分钟一批。它不提供公网 API，服务端凭证只能通过受限环境文件载入。
5. `/api/ai/quota` 已先执行 `reconcileAIUsageForUser(supabase)` 再读取额度；身份来自 Supabase 验证，不接受请求体传入用户 ID。无法对账、锁繁忙或三批后仍有大量积压时返回 503，而不是伪装成最新准确额度。

本文件只描述集成要求，不代表定时维护、正式库迁移或网站部署已经完成。

## 已集成的网站入口

- `src/app/api/ai/analyze/route.ts`：run 创建后立即绑定，在解析/分析 provider 之前执行；失败沿用未完成 run 的释放流程。
- `src/app/api/interview-preparations/route.ts`：run 创建后、面试 provider 之前绑定；失败只移除本次尚未完成的上传。
- 两个入口均对 expired/released 的同 operation 返回 409 `AI_TASK_EXPIRED`，不会自行生成第二次。
- 现有分析和面试按钮每次点击均生成新的随机 operation ID，无需为这个恢复逻辑修改大型 `tracker-app.tsx`；网络请求自动重试仍必须复用原 ID。

## 阿里云独立定时维护部署模板

不挂在职位采集 worker 的两小时间隔上，也不依赖 Next.js 某个请求结束后的内存定时器。使用主机已有 systemd 定期运行一个短进程，停机后第一次触发继续检查数据库中的持久执行关联。

可审阅的具体单元、环境示例、只读验收器和完整安装/回退步骤已放入 [integrations/ai-quota-reconciliation](../integrations/ai-quota-reconciliation/README.md)。它们不自动安装、不读取网站环境、不创建账号，也不证明主机验收已经完成。

正式模板绑定 `/opt/zhitu-tracker`、`/usr/bin/node`、项目 `ijnhswcolasqlfjtjbkf`；要求现场核实 Node 22+ 和 systemd 239+。进程使用独立非 root 用户 `zhitu-quota`，无 sudo/Docker 权限。专用 `service.env` 只有两项 Supabase 配置，由 systemd/root 读取后传给进程；文件 `root:root 0600`、父目录 `root:root 0700`，不能把完整网站环境复制过去或打印真实内容。服务本身通过沙箱看不到常用网站环境文件和专用凭证目录。OS 权限独立不改变 Supabase service-role 凭证本身的高权限属性。

模板每批 50 条，RPC 请求超时 20 秒，systemd 整个进程 30 秒，内存 192 MiB、V8 heap 96 MiB、CPU 25%、最多 32 个任务。`OnUnitInactiveSec=60s` 表示运行结束后约一分钟再次触发；同一 oneshot 仍在运行时不启动第二份，不能用多个手动 node 进程替代。启用到 `timers.target` 后按 `OnBootSec=60s` 在开机后恢复，不使用仅对 OnCalendar 有效的 Persistent 选项。[systemd timer 官方说明](https://github.com/systemd/systemd/blob/v239/man/systemd.timer.xml)。

顺序：先测试库故障恢复 → 应用迁移 → 部署网站及脚本 → 审核、安装并验证实际 unit → 获授权手动运行一次 service → 启用 timer → 不人工触发，观察连续至少两次定时成功 → 在另行获授权的维护窗口验证停止/重启恢复。不可为此擅自重启正式服务器。

`verify-deployment.mjs --since <本次实际 UTC ISO 时间>` 只读检查单元状态、资源限制、凭证文件元数据（不读内容）以及脱敏计数日志，至少两次不同进程且有时间间隔的成功才通过，不能把一次手动执行或网站 HTTP 200 当定时器证明。`hostBootRecoveryObserved=false` 时必须保留“主机重启恢复未实测”。

批次有 `skippedLocked` 或 `examined` 持续等于上限时应检查积压；持续失败需由现有运维监控处理。本方案不新增邮件收件人、收费告警服务或外部通知，也不把 journal 有日志描述为“已经通知管理员”。停止 timer 只影响之后的维护，不撤销已经提交的结算。网页回退不能删除历史执行关联或恢复不安全的用户可调用 RPC 权限。

## 恢复原则

- 一个执行 run 只能绑定一个 task；绑定必须在 30 分钟有效预留内完成，而且 run 当时必须是该用户、该任务种类、同一输入指纹的 running 记录。
- 后台只按该明确绑定恢复；不根据相同简历/JD 指纹猜测历史 run。上线前没有绑定的历史故障保持原样，需人工核对，不自动补扣。
- reserved 或 expired 的任务，只有对应 run 已完成，且同用户的简历分析结果或面试准备成果仍存在并通过基本结构检查，才改为 completed。
- 更新的是原 task，不增加另一条扣费记录。完成后的重复结算直接返回额度。`quota_date` 始终不变，隔天补结算不会扣今天的次数。
- 30 分钟后才完成的成果可能使原发生日的已用数高于原每日上限，因为预留已经超时释放；仍然只记录那一次真实生成，不把差额转嫁给后来日期。
- 失败 run 必须没有成果输出，才释放未完成的预留；released 任务从不自动补扣。缺失、损坏、归属不符的成果不自动结算、不删除，也不会重跑 AI。
- 已绑定的过期/已释放 task 不被同 operation ID 删除和重建。接口应返回 `AI_TASK_EXPIRED` 等明确提示；用户确认新任务时使用新的 operation ID。`forceNew` 不能绕过同 operation 的幂等边界。
- 批次上限 100，默认 50；遵循用户锁 → 资料行锁 → 任务行锁顺序，已忙碌的用户跳过，后续批次重试。锁和结算均在数据库事务内完成。
- 返回仅含处理数量，不包含简历正文、文件路径、用户邮箱或密钥。维护不会调用 AI，不会修改/删除成果或存储文件。

## 已完成的本地验证

运行 `src/lib/ai/quota-reconciliation.test.ts`、`scripts/ai-quota-reconciliation-sql.test.mjs` 和原 `src/lib/ai/quota.test.ts`：29 个测试通过。路由集成及可信脚本另有 46 个测试通过，覆盖绑定失败时零 provider 调用、过期任务保护、额度失败不返回旧值、目标环境校验、权限凭证类型和请求超时。现有简历分析重试界面的 2 个测试也通过。

SQL 测试使用独立 PGlite PostgreSQL/WASM，包含真实 SQL 执行、迁移重复运行、普通角色 RPC 权限隔离、服务角色执行、账户删除、跨用户成果拒绝、过期保留、隔天恢复、同 run 不重复扣费及后台批次限制。

提供 `supabase/tests/ai_usage_reconciliation.sql` 供获授权独立测试项目在单连接中整份执行：只插入事务内合成行，通过断言后回滚，最终账户和任务残留计数均应为零。该文件也已纳入本地 SQL 测试。`supabase/tests/ai_usage_reconciliation_permissions.sql` 仅做只读 RPC 角色权限和 RLS 检查。

2026-09-08 在与线上一致的隔离版本 `55d7172` 重跑相关 7 文件/74 测试全部通过；另用无网络模拟确认客户端超时约 20 秒、单次 RPC、不自动重试。以上不是正式网络超时/数据库取消证明。

尚需实际部署环境验证：多连接同时结算/预留的压力测试、维护进程跨重启恢复、定时入口访问控制。PGlite 单实例测试及静态锁顺序检查不是线上多连接并发证明。尤其需覆盖未遵循 advisory lock 的 profile 管理更新引起的行锁等待，以及队首热点用户占满批次的公平性；不在本轮扩大为生产 SQL 修改。
