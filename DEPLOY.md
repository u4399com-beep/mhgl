# DEPLOY.md — 部署速查卡（纯 Go 单体版，R69）

> 📖 **完整图文教程：[docs/INSTALL-GUIDE.md](./docs/INSTALL-GUIDE.md)**（前置条件 / 首启自举机制 / 生产加固 / 备份恢复 / FAQ——本文所有条目的详细步骤都在那边）。
>
> ℹ️ **R69 退役注**：原 TS/Prisma 引导链（`bunx prisma db push` 建表 + TS 空库引导脚本）已全量退役——
> 建库建表现在由服务启动时**原生自举**（幂等 DDL + 空库自动播种），引导由 `./.build/mhgl bootstrap` 子命令承担。
> Docker 部署链亦早已退役（R66-d，归档 `docs/archive/docker/`）。现行唯一部署形态 = **Go 单体二进制裸机直跑**。

## ① 三条命令（生产推荐，裸机）

```bash
git clone https://github.com/u4399com-beep/mhgl.git novel-system && cd novel-system
bash scripts/install-go.sh && export PATH=$HOME/go-sdk/go/bin:$PATH   # Go 1.26+ 工具链(幂等, 装 ~/go-sdk, 免 sudo)
go build -o .build/mhgl ./cmd/server && ADMIN_PASSWORD=你的强密码 ./.build/mhgl   # ★生产必改密码!
```

- **首次启动自动完成初始化**：幂等建表（14 张，毫秒级）→ 空库后台自动播种（35 条内置规则 / 16 分类 / 默认站点 / 3 条大部头任务，任务仅创建**不自动启动**）。`MHGL_AUTO_SEED=0` 可关闭；`./.build/mhgl bootstrap` 可显式幂等引导（建表+播种后退出，不起服务、不需要密码）。
- 数据全在 **`./db`**（SQLite，含 `-wal/-shm`）与 **`./web/covers`**（封面）/ `download/`（TXT 产物）——备份/迁移见 §⑤。
- 装完验证：`curl http://127.0.0.1:3000/healthz` → `{"ok":true,"app":"mhgl","engine":"go",...}`；后台 `http://<IP>:3000/admin`、前台 `http://<IP>:3000/?view=home`。
- 沙箱/环境重置兜底：`bash scripts/recover.sh`（装 Go → DB 完整性 → 启动 → 引导 → 看门狗 → 报告，幂等可重跑）。

## ② 常驻形态（生产推荐 systemd）

**形态一：nohup/setsid**（快速上手；先 `go build -o .build/mhgl ./cmd/server`）：

```bash
( set -a; source .env; set +a; setsid nohup ./.build/mhgl > mhgl.log 2>&1 < /dev/null & )
```

**形态二：systemd**（推荐）——`/etc/systemd/system/mhgl.service`：

```ini
[Unit]
Description=mhgl novel aggregation (Go monolith)
After=network.target

[Service]
WorkingDirectory=/opt/mhgl
EnvironmentFile=/opt/mhgl/.env
ExecStart=/opt/mhgl/.build/mhgl
Restart=on-failure
RestartSec=5
User=www-data
# 硬化(可选, 按发行版能力增删)
NoNewPrivileges=true
ProtectSystem=full
ProtectHome=true

[Install]
WantedBy=multi-user.target
```

```bash
cd /opt/mhgl && bash scripts/install-go.sh && export PATH=$HOME/go-sdk/go/bin:$PATH
go build -o .build/mhgl ./cmd/server        # 升级时: git pull 后重跑本行, 再 systemctl restart mhgl
systemctl enable --now mhgl
```

> ⚠️ **环境变量注入口径**：Go 二进制直读进程环境变量，**不会自己读 `.env` 文件**——
> systemd 用 `EnvironmentFile=` 注入；shell 用 `set -a; source .env; set +a` 后再启动；
> 仅当经 `bun run dev`（薄别名）启动时 bun 会自动加载 `.env`。`WorkingDirectory` 必须是项目根
> （相对路径 `db/`、`web/static`、`web/covers` 均以 cwd 为项目根解析）。

## ③ 环境变量表（权威清单；`.env.example` 附注释样例）

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `PORT` | `3000` | 监听端口 |
| `DB_PATH` | `db/custom.db` | SQLite 库文件（相对项目根，可绝对路径）；启动幂等建表，缺文件自动创建 |
| `ADMIN_PASSWORD` | dev 缺省 `audit-fix-2025` | **生产必改**；`GO_ENV=production` 且未设置时登录恒失败（fail-closed） |
| `SESSION_SECRET` | dev 缺省编译期常量 | 生产设独立随机长串（`openssl rand -hex 32`）；生产留空 fail-closed |
| `GO_ENV` | （空） | 设 `production` 启用生产口径（密码/密钥 fail-closed 等） |
| `COOKIE_SECURE` | `0` | 生产 https 才设 `1`（登录/注销 Set-Cookie 附加 `Secure`）；反代终结 TLS 时透传 `X-Forwarded-Proto: https` 也会自动叠加（http 预览误开会断后台登录） |
| `MEM_LIMIT_MB` | `600` | Go 内存软顶（GOMEMLIMIT 同源，MB） |
| `COVER_DIR` | `web/covers` | 封面落盘目录 |
| `MHGL_AUTO_SEED` | （开） | 设 `0` 关闭空库自动播种（纯手动运维） |
| `GO_CALLBACK_SECRET` | `go-cb-2025-mhgl` | 采集回调契约密钥（引擎已并入主二进制，单机无需改） |

其余可选采集调优项见 `.env.example` 注释；原 Docker/Prisma 专属变量已随链退役。

## ④ 原生自举与引导（R69）

- **每次启动**：幂等 DDL 补全 14 张表（`CREATE TABLE IF NOT EXISTS`，既有库空转毫秒级）→ 空库（规则 0 条）后台自动播种（不阻塞监听）。
- **显式引导**：`./.build/mhgl bootstrap` —— 建 schema + 播种后退出；幂等；无需服务在线/密码/bun。
- **库文件缺失**：服务自动创建（含目录）；**库文件损坏**（非 SQLite 内容）：启动会报错退出——跑 `bash scripts/recover.sh`（其 DB 完整性检查会删坏文件，交给服务自建），或手动 `rm -f db/custom.db db/custom.db-wal db/custom.db-shm` 后重启。

## ⑤ 备份（WAL 感知）

SQLite 处于 WAL 模式，**直接 `cp` 运行中的库文件可能得到缺 `-wal` 的不一致快照**，二选一：

```bash
# A. 在线一致性快照(推荐, 不停服):
sqlite3 db/custom.db ".backup '/backup/custom-$(date +%F).db'"

# B. 停服后冷拷贝:
systemctl stop mhgl && cp -a db web/covers /backup/ && systemctl start mhgl
```

也可后台「数据备份」页导出 JSON（书籍超 200 本自动降级为仅元数据导出，大库用文件级备份）。恢复：备份文件放回 `db/custom.db` → 重启（服务只补缺失表，不动既有数据）；整库丢失 → 直接重启服务自动重建空骨架+播种。

## ⑥ 反向代理

- 仓库根自带 **`Caddyfile`**：`:81 → localhost:3000`（R69 已随 mini-services 退役裁剪为单一反代）。
- 自配反代：Caddy `reverse_proxy 127.0.0.1:3000`（默认透传 `X-Forwarded-Proto`，Secure Cookie 全自动）；Nginx 需补 `proxy_set_header X-Forwarded-Proto $scheme;`。
- https 部署无须显式 `COOKIE_SECURE=1`（透传即自动叠加）；http 直连不要开它（浏览器拒收 Secure Cookie 会断后台登录）。

## ⑦ 常见问题三条

| 症状 | 处理 |
| --- | --- |
| **端口 3000 被占** | `ss -ltnp \| grep 3000` 找到旧进程处理；或 `PORT=8080` 换端口启动 |
| **沙箱/环境重置后服务消失** | `bash scripts/recover.sh`（幂等一键恢复：装 Go→DB 完整性→启动→引导→看门狗→报告；`RECOVER_START_TASKS=1` 顺带启动本次新建任务） |
| **任务大量超时 / 重启后 paused** | 超时=源站慢/限速，引擎自动退避+镜像切换，人工放慢任务间隔；重启后 running 任务被收编为 paused（进度不丢）——后台任务页点「启动」或 `POST /api/admin/tasks/{id}/control` body `{"action":"start"}` 断点续采 |

> 升级：`git pull && go build -o .build/mhgl ./cmd/server` 后重启进程（或等看门狗/交给 systemd）。备份/回滚/深度 FAQ 见 **[docs/INSTALL-GUIDE.md](./docs/INSTALL-GUIDE.md)**。
