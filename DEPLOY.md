# DEPLOY.md — 部署速查卡（一页式）

> 📖 **完整图文教程：[docs/INSTALL-GUIDE.md](./docs/INSTALL-GUIDE.md)**（R52 重写：架构图 / 环境要求 / 5 分钟快速开始 / TS·Go 双引擎 / Docker 与裸机生产 / 反反爬开关档案 / 内存护栏 / 备份升级 / FAQ——本文所有条目的详细步骤都在那边）。

## ① Docker 三条命令（生产推荐）

```bash
git clone https://github.com/u4399com-beep/heis.git novel-system && cd novel-system
bash install.sh                  # 一键：装 Docker(国内自适应) → 构建 → 健康检查 → 打印地址；幂等可重跑
docker compose ps                # STATUS 出现 (healthy) 即就绪 → http://<IP>:3000（前台 /?view=home）
```

- 首启自动：幂等 `prisma db push`（绝不静默毁数据）→ 拉起 5 个共置采集代理(3010/3011/3013/3014/3015) → `AUTO_FILL=1` 时自动导入 7 站规则并开跑「自动填充·」任务（约 20~40 分钟前台有书，每 30 分钟增量续采）。
- 非 root 容器（uid 1001）：宿主机先 `sudo mkdir -p ./db ./data && sudo chown -R 1001:1001 ./db ./data`。
- 数据全在宿主机 **`./db`**（SQLite）与 **`./data`**（封面/下载产物）——备份/迁移=搬这两个目录。

**裸机（Bun）路线**：`bun install && bun run db:push && bun run build && bun run start`（进程常驻用 systemd/`Restart=on-failure`；dev 守护 `scripts/dev-watchdog.sh`）——详见教程 §6。

## ② 环境变量表（权威全清单 = `.env.example`，每项带中文注释）

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `ADMIN_PASSWORD` | 回落 `audit-fix-2025` | **生产必改**；compose 自动透传进容器，改完 `docker compose up -d` 重建生效 |
| `SESSION_SECRET` | 编译期常量 | 生产设独立随机长串（`openssl rand -hex 32`） |
| `DATABASE_URL` | 容器内 `file:/app/db/custom.db` | compose 已改写指向 `./db` 卷，无需手动设 |
| `AUTO_FILL` | `1` | 装完自动导入规则+建任务；`=0` 关闭 |
| `AUTO_FILL_RULES` | `fanqie,qimao,deqixs,80ge,jhssd,ttkan,bqg713` | 自动填充站点 key 清单（`pili`/`xjp` 需显式加） |
| `LOG_LEVEL` | `info` | `debug`/`info`/`warn`/`error` |
| `GO_CALLBACK_SECRET` / `GO_ENGINE_URL` / `GO_PORT` | `go-cb-2025-mhgl` / `http://127.0.0.1:3032` / `3032` | Go 引擎回调密钥与地址（单机无需改） |
| 反反爬开关 | 多数缺省关；`RETRY_AFTER_HONOR` **缺省开** | `CHALLENGE_ESCALATE` `RESPONSE_SANITY` `FETCH_BINARY_RETRY` `FETCH_BODY_LEN_CHECK` `FETCH_AL_POOL` `HOSTGATE_PACE_PROFILE` `PROXY_HEALTH_SCORING` —— 缺省值/作用/代价权威表见教程 §8 |
| 内存护栏 | `FETCH_RSS_HALT_MB=1950` `FETCH_RSS_RESUME_MB=1900` `FETCH_RSS_SOFT_MB=1550` | 熔断线/恢复水位/软水位行为解释见教程 §9 |
| 国内构建加速 | `USE_CN_MIRROR` `NPM_REGISTRY` `BUN_IMAGE` `NODE_IMAGE` 等 | install.sh 默认自适应；手动覆盖见教程 §6.8 |

## ③ 常见问题三条

| 症状 | 处理 |
| --- | --- |
| **端口 3000 被占** | 改 `docker-compose.yml` ports 左侧（`"8080:3000"`）→ `docker compose up -d`；裸机 `ss -ltnp \| grep 3000` 杀旧进程（EADDRINUSE 详见教程 §13.1） |
| **健康检查一直 starting / unhealthy** | `docker compose logs --tail 100`：见「数据库结构同步失败」→ 备份后强制同步流程（教程 §13.11）；见「/app/db 不可写」→ `sudo chown -R 1001:1001 ./db ./data`；慢机器把 start_period 调大 |
| **任务大量超时 / 频繁自动暂停** | 超时(`code=28`)=源站慢/限速，引擎自动退避+镜像切换，人工放慢节奏（教程 §13.2）；「内存硬熔断 3/3 自动暂停」→ 等自动续采或**切 Go 引擎**（`bash scripts/install-go.sh` + `mini-services/crawler-go` 里 `bash run.sh`，教程 §5/§9/§13.3） |

> 升级：Docker `git pull && bash install.sh`；裸机 `git pull && bun install && bun run db:push` + 重启 + Go 引擎 `bash run.sh` 自动重编。备份/回滚/深度 FAQ 全流程见 **[docs/INSTALL-GUIDE.md](./docs/INSTALL-GUIDE.md) §11~§13**。
