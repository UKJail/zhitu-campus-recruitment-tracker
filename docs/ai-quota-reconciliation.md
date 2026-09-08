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

先只读核实 Node 22+ 的绝对路径、网站部署目录、可用的非 root 服务用户，以及两个环境是否各自持有正确凭证。专用私有环境文件只需 `SUPABASE_URL` 和 `SUPABASE_SERVICE_ROLE_KEY`，文件和父目录只能由服务用户/管理员读取；绝不放入 Git。URL 必须与显式提供的 `--expected-project-ref` 一致；若 `NEXT_PUBLIC_SUPABASE_URL` 也存在，也必须指向同一项目。环境变量会优先于 Node 环境文件中的同名项，因此要核对运行时有效环境，而不是仅看文件。[Node 官方环境文件说明](https://nodejs.org/api/cli.html#--env-filefile)。

以下值都是占位符，需现场替换后才能安装；没有创建、启用任何主机服务：

```ini
# /etc/systemd/system/zhitu-ai-quota-reconciliation.service
[Unit]
Description=Zhitu AI quota reconciliation
Wants=network-online.target
After=network-online.target

[Service]
Type=oneshot
User=VERIFIED_NONROOT_USER
WorkingDirectory=VERIFIED_DEPLOY_DIRECTORY
ExecStart=VERIFIED_NODE_PATH --env-file=VERIFIED_PRIVATE_ENV_FILE scripts/reconcile-ai-quota.mjs --run --expected-project-ref VERIFIED_PROJECT_REF --limit 50
TimeoutStartSec=30s
TimeoutStopSec=5s
Restart=no
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
StandardOutput=journal
StandardError=journal
```

```ini
# /etc/systemd/system/zhitu-ai-quota-reconciliation.timer
[Unit]
Description=Run Zhitu quota reconciliation periodically

[Timer]
OnBootSec=60s
OnUnitInactiveSec=60s
AccuracySec=5s
Unit=zhitu-ai-quota-reconciliation.service

[Install]
WantedBy=timers.target
```

每批最多 100 条，默认 50 条；脚本自身请求超时为 20 秒，systemd 额外限制整个进程 30 秒。同一 oneshot 仍在执行时不启动第二份；不用 `RemainAfterExit=yes`。[systemd timer 官方说明](https://github.com/systemd/systemd/blob/main/man/systemd.timer.xml)。

上线步骤：先测试库故障恢复 → 应用迁移 → 部署网站及脚本 → 在目标主机手动运行一次可信脚本 → 核对只有数量的完成输出 → 用 `systemd-analyze verify` 验证实际 unit → 安装启用 timer → 验证连续至少两次触发及重启后恢复。启动失败/网络失败退出非零，只打印固定脱敏错误码；不能把“网站 HTTP 200”当作定时器运行证明。

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

尚需实际部署环境验证：多连接同时结算/预留的压力测试、维护进程跨重启恢复、定时入口访问控制。PGlite 单实例测试及静态锁顺序检查不是线上多连接并发证明。
