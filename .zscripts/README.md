# .zscripts/ — 平台引导/部署脚本族(R71 纯 Go 化收尾)

本目录为平台侧(sandbox/宿主引导链)使用的脚本目录, 与 `scripts/`(项目现役运维脚本)并行存在。
R63-c 曾修过一轮 TS→Go 引导断链; **R71 完成 12 件全面纯 Go 化改造**: 全目录零 bun/Node/Prisma
可执行路径, `bash -n` 全过, 幂等可重入, 平台真调用也不会在 `set -e` 下炸出。

> 断链实证: `dev.log`(2026-09-26 沙箱重置引导)记录 `error: Script not found "bootstrap"` ——
> 平台引导链确会执行本目录 `dev.sh`, 且原 `bun run bootstrap` 引用的别名自 R69 起已不存在。

| 文件 | 处置(R71) | 说明 |
| --- | --- | --- |
| `dev.sh` | **已修(R71)** | 平台自动引导入口。删 `command -v bun` 硬依赖 + `bun install`(零依赖壳空转)+ `bun run bootstrap` 断链段; 改为: .env 注入 → 3000 未监听时 `bash scripts/dev-go.sh &`(go 自愈/增量构建/exec 二进制, 已监听则跳过=幂等) → 探活等待 180s(对齐 recover.sh [3/6], 原 60s 会被首次构建误判) → `.build/mhgl bootstrap` 幂等引导(失败不阻断, 服务端空库自动播种兜底) → 健康检查(/ 与 /healthz)。mini-services 启动段删除(该目录 R69 退役)。log_step/等待/健康检查框架与 cleanup trap、disown 行为保持原样 |
| `dev-watchdog.sh` | **已改(R71)** | 原 R21-tl-2 历史分叉(30s 轮询 + `setsid bun run dev` 硬依赖)退役, 改为 `exec bash scripts/dev-watchdog.sh` 直接委托现役实现(15s 轮询/5s 冷却/只拉死端口, 纯 bash) |
| `start.sh` | **已重写(R71)** | 原 FC 部署链启动器(next-service-dist/server.js + 打包 DB + mini-services + Caddy 前台)随部署模型退役; 现行 = package.json "start" 同口径: .env 注入 → go 自愈 → 二进制缺失则 `go build -o .build/mhgl ./cmd/server` → `exec .build/mhgl` 前台运行 |
| `build.sh` | **已重写(R71)** | 原 Next.js 打包链(bun install → next build → standalone 自愈注入 → 产物收集 → mini-services/python/DB 子流程 → tar.gz)退役; 现行 = package.json "build" 同口径: go 自愈 → `go build -o .build/mhgl ./cmd/server` → 校验产物并报大小 |
| `mini-services-install.sh` / `mini-services-build.sh` / `mini-services-start.sh` | **退役 no-op(R71)** | mini-services/ 目录(原 8 个 TS/Python 外置代理, 端口 3010~3017)已随 R69 整体退役。三脚本改为明确退役提示并恒退出 0(set -euo 安全), 保留占位防旧调用链报「文件不存在」 |
| `database-runtime-build.sh` | **退役 no-op(R71)** | 原职责(打包 Preview DB + `bun run db:push` 同 schema)依赖的别名与部署链均已退役; 建表现在由 Go 服务启动自举 / `.build/mhgl bootstrap` 承担。恒退出 0 |
| `python-runtime-build.sh` | **退役 no-op(R71)** | 项目为纯 Go 单体, 零 Python 源码/依赖清单; 原 uv 固化流程随部署链退役。恒退出 0 |
| `db-backup.sh` | **保留+修复(R71)** | SQLite 在线备份小工具(python3 sqlite3 mode=ro + backup API, WAL 一致性快照), 路径与现行 `db/custom.db` 一致。修复: 项目根随脚本定位 / 源库缺失友好跳过 / 首跑轮转 `ls` 退出码误炸兜底 / STAMP 调用方传入与 python 侧统一 / `DB_PATH` 可覆盖 |
| `db-backup-loop.sh` | 保留(R71 注) | 每日备份守护(24h 一备), 逐字未动; 仅补注释说明下游 db-backup.sh 的 R71 修复口径 |
| `dev.log` / `dev.pid` | 运行时产物 | `dev.log` 留存了 R71 修前 `bun run bootstrap` 断链的实证(2026-09-26 引导失败记录), 供追溯 |

结论: R71 起本目录 12 件与 `scripts/` 现役四件(install-go/dev-go/dev-watchdog/recover)同一纯 Go
口径 —— 平台无论走 `bun run dev`(package.json 零依赖别名壳, 平台启动接口)、本目录 `dev.sh` 还是
`start.sh`/`build.sh`, 最终都收敛到 `go build -o .build/mhgl ./cmd/server` + 运行 `.build/mhgl`
这一条链, 全程零 bun/Node/Prisma 依赖。
