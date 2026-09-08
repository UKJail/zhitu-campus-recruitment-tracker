# 阿里云 AI 额度维护：独立 systemd 服务

这是**供审阅、获授权后安装的正式站模板**，不是已经安装的声明。不创建公网接口，不调用 AI，不读写简历或附件；只调用既有服务端结算 RPC。Windows 本地测试不能代替 Linux 主机验收。

## 固定部署边界

- 正式项目：`ijnhswcolasqlfjtjbkf`；目录 `/opt/zhitu-tracker`；Node `/usr/bin/node`，要求 Node 22+。
- systemd 要求 239+。先核对目标主机版本，并以目标机 `systemd-analyze verify` 为准，不能忽略未知指令警告。
- 进程专用用户/组 `zhitu-quota`：系统账号、禁止交互登录、不创建 home；不加入网站用户组、Docker 组或 sudo 组。不得递归更改网站目录属主/权限。
- 系统级 `EnvironmentFile` 由 systemd/root 读取并传给进程。`/etc/zhitu-ai-quota-reconciliation` 为 `root:root 0700`，`service.env` 为 `root:root 0600`、普通文件、单硬链接，不能使用符号链接。
- 文件严格只有 `SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY` 两项配置；用 `service.env.example` 了解格式，不要将示例占位值当真实凭证。不得 source、打印或整份复制网站环境，不从 CLI 参数传入密钥，不在日志/验收材料中显示内容。
- 独立用户最小化的是**主机权限**；已有 Supabase `service_role` 仍是高权限凭证，不应描述为“仅允许一个 RPC 的密钥”。本轮不新增数据库角色、授权或迁移。
- 主进程没有写入网站目录的权限，沙箱隐藏所有常用网站 `.env` 路径及专用凭证目录；安装前另行核查网站其他私密文件/备份的 Unix 权限，不能声称沙箱枚举了任意自定义密钥文件。

## 执行预算

每次最多 50 条（SQL 上限 100），RPC 客户端 20 秒，整个 oneshot 30 秒，停止宽限 5 秒。不自动重试不确定的请求；后续定时批次按数据库持久关联幂等恢复。

V8 heap 96 MiB、进程 MemoryMax 192 MiB、CPUQuota 25%、TasksMax 32、LimitNOFILE 128、core dump 禁用。必须用真实一次运行确认目标 cgroup 支持并生效；若资源限制不足，应停下评估后调整模板及测试，不悄悄去掉限制。

`OnUnitInactiveSec=60s` 是上次运行结束后约 60 秒触发，另有 5 秒精度窗口，不是每分钟整点。systemd 不重复启动仍 active 的同一服务；不要自行启动多个平行 node 命令。timer 启用到 `timers.target` 后，主机启动约 60 秒恢复检查。无需 `Persistent=true`：它仅适用于 `OnCalendar`，并不会给这个单调时钟 timer 增加补跑能力。[systemd 239 timer 文档](https://github.com/systemd/systemd/blob/v239/man/systemd.timer.xml)。

## 获授权后的安装顺序

此目录没有自动安装脚本，避免静默创建系统账号、复制密钥或启动有写入效果的结算。操作者逐项核实：

1. 只读检查版本、部署 SHA、Node 路径、用户/组是否已存在、部署目录遍历和脚本/依赖读取权限；服务用户不能修改部署代码。专用用户若已存在且权限不符，停止，不改其他服务用户。
2. 单独获授权创建所需专用用户/私密目录并安全准备两项环境；真实值只在服务器内处理，不输出内容。仅检查属主/模式/文件类型，不能将 `cat service.env` 或 `systemctl show --property=Environment` 当验收命令。
3. 审核当前 service/timer 与服务器事实一致，将两份单元以 `root:root 0644` 安装到 `/etc/systemd/system/`。若已有同名文件，先保留可回退副本，不能直接覆盖未核对配置。核实没有 drop-in 覆盖。
4. 用以下检查单元语法，任何错误或未知指令均停止：

   ```sh
   systemd-analyze verify /etc/systemd/system/zhitu-ai-quota-reconciliation.service /etc/systemd/system/zhitu-ai-quota-reconciliation.timer
   ```

5. 获授权后刷新 systemd 配置，先手动运行一次该 service；确认退出 0、`Result=success`、仅数量日志。注意：启动 service 会执行真实结算，不是只读预检；不要用正式用户数据制造失败样本。
6. 获授权后启用 timer。记录启用后的 UTC 时间作为验收窗口起点；之后**不要手动 start/restart service**，让 timer 自行产生至少两次成功结果。可分次查看，避免长时间阻塞沟通。
7. 运行只读验收器，将 ISO 时间替换为步骤 6 的实际值：

   ```sh
   /usr/bin/node /opt/zhitu-tracker/integrations/ai-quota-reconciliation/verify-deployment.mjs --since 2026-09-08T12:00:00.000Z
   ```

   验收器需要 root 只读权限以查看受限文件**元数据**和 journal。它不读取凭证内容，不执行 RPC，不启动/停止服务，仅输出计数与验证结论；失败退出 1。检查当前实际单元与仓库模板一致、无 drop-in、无需 daemon-reload、限额生效、timer 启用、至少两次不同调用且间隔不低于 55 秒成功，失败窗口不通过。这里只计当前 24 小时内显式窗口中的最近 200 条日志；窗口过长或繁忙时请缩短，不把日志截断后的计数当历史总量。
8. 维护进程/定时器停止恢复和主机重启后的恢复是另两项验收。只在获授权维护窗口操作；不能为本项擅自重启正式服务器。验收输出 `hostBootRecoveryObserved=false` 时必须保留“主机重启恢复未实测”。定时器活动和间隔日志只是佐证，不能证明期间没有人工触发；操作者需遵守步骤 6。

## 回退与已知边界

停止/禁用本 timer 只阻止未来维护，不删除用户、结果、数据库执行关联，也不撤销已提交的结算；网站中的按用户恢复仍可工作。回退前后保留已有单元与发布信息，不通过回滚迁移恢复不安全的普通用户 RPC 权限。

SQL 中 profile/task 行锁可能等待未使用同一 advisory lock 的管理更新；批次 LIMIT 先于跳锁，热点用户可能挤占批次。这是多连接压力测试重点，不扩大本轮为生产 SQL 修改。20 秒客户端超时不能证明远端 SQL 已取消或事务已回滚，后续恢复必须继续依赖幂等关联。持续 `skippedLocked>0`、满批或失败，应人工查看积压；当前不新增收费监控、邮件收件人或自动通知。

本地可运行：

```sh
npm test -- integrations/ai-quota-reconciliation/verify-deployment.test.mjs scripts/reconcile-ai-quota.test.mjs scripts/ai-quota-reconciliation-sql.test.mjs
```

参考：[Supabase 服务端密钥边界](https://supabase.com/docs/guides/getting-started/api-keys)、[Node 内存上限](https://nodejs.org/api/cli.html#--max-old-space-sizesize-in-mib)。
