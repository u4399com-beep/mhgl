# DEPLOY.md — 部署速查卡（一页式，R66-d 裸机版）

> 📖 **完整图文教程：[docs/INSTALL-GUIDE.md](./docs/INSTALL-GUIDE.md)**（环境要求 / 快速开始 / 恢复链 / 反反爬开关档案 / 内存护栏 / 备份升级 / FAQ——本文所有条目的详细步骤都在那边）。
>
> ⚠️ **Docker 部署链已退役（R66-d）**：原 `Dockerfile` / `docker-compose.yml` / `install.sh` /
> `docker-entrypoint.sh` 等为 Next.js 时代产物（`next build` 无源可构），整体归档于
> **`docs/archive/docker/`**（含退役原因与恢复方式，见其 README）。现行唯一部署形态 = Go 单体二进制裸机直跑。

## ① 三条命令（生产推荐，裸机）

```bash
git clone https://github.com/u4399com-beep/heis.git novel-system && cd novel-system
bun install && cp .env.example .env   # 工具链依赖(prisma CLI+引导脚本)；改 .env 里 ADMIN_PASSWORD!
bash scripts/recover.sh               # 一键：装 Go → 建表 → 启动(:3000) → 引导(35 条规则/站点/任务) → 看门狗；幂等可重跑
```

- 数据全在 **`./db`**（SQLite）与 **`./web/covers`**（封面）/下载产物——备份/迁移=停服后搬这些目录。
- 常驻：用 systemd 包一层（`Restart=on-failure`），或直接复用仓库看门狗 `scripts/dev-watchdog.sh`（:3000 死亡自动拉起，15s 轮询）。
- 装完验证：`http://<IP>:3000/`（后台）、`http://<IP>:3000/?view=home`（前台）。

## ② 环境变量表（权威全清单 = `.env.example`，每项带中文注释）

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `ADMIN_PASSWORD` | 回落 `audit-fix-2025` | **生产必改**；`.env` 设置后重启生效 |
| `SESSION_SECRET` | 编译期常量 | 生产设独立随机长串（`openssl rand -hex 32`） |
| `COOKIE_SECURE` | `0` | [R62-f] 生产 https 才设 `1`：登录/注销 Set-Cookie 附加 `Secure`；反代终结 TLS 时透传 `X-Forwarded-Proto: https` 也会自动叠加（http 预览误开会断后台登录）。见教程 §7.4 |
| `DATABASE_URL` | `file:./db/custom.db` | SQLite 单文件，一般无需改 |
| `LOG_LEVEL` | `info` | `debug`/`info`/`warn`/`error` |
| `GO_CALLBACK_SECRET` | `go-cb-2025-mhgl` | 内置采集引擎回调密钥（引擎已并入主二进制，单机无需改；`GO_ENGINE_URL`/`GO_PORT` 已废弃） |
| 反反爬开关 | 多数缺省关；`RETRY_AFTER_HONOR` **缺省开** | `CHALLENGE_ESCALATE` `RESPONSE_SANITY` `FETCH_BINARY_RETRY` `FETCH_BODY_LEN_CHECK` `FETCH_AL_POOL` `HOSTGATE_PACE_PROFILE` `PROXY_HEALTH_SCORING` —— 缺省值/作用/代价权威表见教程 §8 |
| 内存护栏 | `FETCH_RSS_HALT_MB=1950` `FETCH_RSS_RESUME_MB=1900` `FETCH_RSS_SOFT_MB=1550` | 熔断线/恢复水位/软水位行为解释见教程 §9 |
| mini-services 桥接 | `BRIDGE_KEY`（可选）、`FETCH_RELAY_URL`、`SCRAPLING_BRIDGE_URL` | 多主机部署才需要；单机 127.0.0.1 直连缺省即可 |

> 原 Docker 专属变量（`AUTO_FILL` / `BUN_IMAGE` / `NPM_REGISTRY` 等）随部署链退役，见 `docs/archive/docker/`。

## ③ 常见问题三条

| 症状 | 处理 |
| --- | --- |
| **端口 3000 被占** | `ss -ltnp \| grep 3000` 找到旧进程处理（EADDRINUSE 详见教程 §13.1）；或 `PORT=8080` 换端口启动 |
| **沙箱/环境重置后服务消失** | `bash scripts/recover.sh`（幂等一键恢复：装 Go→建表→启动→引导→看门狗，教程 §15） |
| **任务大量超时 / 频繁自动暂停** | 超时(`code=28`)=源站慢/限速，引擎自动退避+镜像切换，人工放慢节奏（教程 §13.2）；「内存硬熔断 3/3 自动暂停」→ 等自动续采；采集引擎已并入主二进制（R55 起），无需单独启动（教程 §5/§9/§13.3） |

> 升级：`git pull && go build -o .build/mhgl ./cmd/server` 后重启进程（或等看门狗/交给 systemd）。备份/回滚/深度 FAQ 全流程见 **[docs/INSTALL-GUIDE.md](./docs/INSTALL-GUIDE.md) §11~§13**。
