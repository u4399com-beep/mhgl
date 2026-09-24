# .zscripts/ — 平台引导目录(R63-c 留档)

本目录为平台侧(sandbox/宿主引导链)使用的脚本目录, 与 `scripts/`(项目现役脚本)并行存在。
R62-a 曾提请主控评估, R63-c 完成核查与小修。逐文件处置如下:

| 文件 | 处置 | 说明 |
| --- | --- | --- |
| `dev.sh` | **已修(R63-c)** | 平台自动引导入口。原实现 `bun run db:push` 引用已消失的 package.json 脚本(`dev.log` 实证 `error: Script not found "db:push"` 后 `set -e` 中断, 引导链断裂), 且后续步骤仍按 Next.js 时代写 `bun run dev`。已改为: `bun run bootstrap`(现行幂等引导 scripts/bootstrap-db.ts)+ `bash scripts/dev-go.sh`(Go 单体构建+启动)。mini-services 启动段保留(5 个签名代理仍由 builtin 规则引用) |
| `dev-watchdog.sh` | 不动, 留档说明 | 与 `scripts/dev-watchdog.sh` 分叉; **`scripts/` 版为现役**(Go 进程看门狗), 本目录版本为历史分叉, 平台如引用将得到旧语义(仅杀 Next.js 进程), 无破坏性 |
| `start.sh` / `build.sh` | 留档, 不动 | 平台历史构建/启动链(TS 时代形态), 项目现行入口 = `scripts/dev-go.sh` / `scripts/recover.sh`; 平台脚本保持原样以便平台侧回滚兼容 |
| `database-runtime-build.sh` | 留档, 不动 | 内部引用 `bun run db:push`(已消失脚本), 但仅在其本地子流程使用且无平台调用证据; 如被触发会失败于 db:push 步骤(与 dev.sh 修前同病), 修复需平台侧确认其用途后再做 |
| `mini-services-*.sh` | 保留 | 5 个签名代理(qimao/deqixs/bqg713/xjp/qidian)被 `internal/api/builtin_rules.json` 规则描述引用, 装配/启动脚本仍有效 |
| `db-backup.sh` / `db-backup-loop.sh` | 保留 | DB 备份小工具, 与运行时无关 |
| `dev.log` / `dev.pid` | 运行时产物 | `dev.log` 留存了修前 `db:push` 断链的实证(2026-09-24 引导失败记录), 供追溯 |

结论: 平台引导断链根因 = Go 化后 `db:push` 脚本移除而平台目录未同步。`dev.sh` 已修为
Go 链路; 其余分叉/陈旧脚本以留档方式声明, 不做破坏性变更(平台目录归属主控)。
