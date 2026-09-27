# DEPLOY.md — 部署速查卡（纯 Go 单体版，R69）

> 📖 **完整图文教程：[docs/INSTALL-GUIDE.md](./docs/INSTALL-GUIDE.md)**（前置条件 / 首启自举机制 / 生产加固 / 备份恢复 / FAQ——本文所有条目的详细步骤都在那边）。
>
> ℹ️ **R69 退役注**：原 TS/Prisma 引导链（`bunx prisma db push` 建表 + TS 空库引导脚本）已全量退役——
> 建库建表现在由服务启动时**原生自举**（幂等 DDL + 空库自动播种），引导由 `./.build/mhgl bootstrap` 子命令承担。
> Docker 部署链亦早已退役（R66-d 退役、R69 清退出库，git 历史可考）。现行唯一部署形态 = **Go 单体二进制裸机直跑**。

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
> 开发启动链（`bash scripts/dev-go.sh`，含平台引导链 `bun run dev` 别名与 `.zscripts/dev.sh`）
> 会自动 source `.env`（R71 起全链纯 Go 化，bun 不再是任何一环）。`WorkingDirectory` 必须是项目根
> （相对路径 `db/`、`web/static`、`web/covers` 均以 cwd 为项目根解析）。

## ③ 环境变量表（权威清单；`.env.example` 附注释样例）

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `PORT` | `3000` | 监听端口 |
| `DB_PATH` | `db/custom.db` | SQLite 库文件（相对项目根，可绝对路径）；启动幂等建表，缺文件自动创建 |
| `ADMIN_PASSWORD` | dev 缺省 `audit-fix-2025` | **生产必改**；`GO_ENV=production` 且未设置时登录恒失败（fail-closed） |
| `SESSION_SECRET` | dev 缺省编译期常量 | 生产设独立随机长串（`openssl rand -hex 32`）；生产留空 fail-closed |
| `GO_ENV` | （空） | 设 `production` 启用生产口径（密码/密钥 fail-closed 等）；大小写不敏感，`prod` 等价（R73 起收编别名，防大小写笔误被当 dev） |
| `COOKIE_SECURE` | `0` | 生产 https 才设 `1`（登录/注销 Set-Cookie 附加 `Secure`）；反代终结 TLS 时透传 `X-Forwarded-Proto: https` 也会自动叠加（http 预览误开会断后台登录） |
| `MEM_LIMIT_MB` | `600` | Go 内存软顶（GOMEMLIMIT 同源，MB） |
| `COVER_DIR` | `web/covers` | 封面落盘目录 |
| `MHGL_AUTO_SEED` | （开） | 设 `0` 关闭空库自动播种（纯手动运维） |
| `GO_CALLBACK_SECRET` | `go-cb-2025-mhgl` | 采集回调契约密钥（引擎已并入主二进制，单机无需改） |
| `BACKUP_INTERVAL_HOURS` | `6`（R75 新增） | 主库自动快照周期（小时）；`0` 或非法值=禁用；快照落 `backups/`（WAL 感知在线一致性快照，不停服），详见 §⑤ |
| `BACKUP_KEEP` | `3`（R75 新增） | 自动快照保留份数（`<1` 钳为 `1`），滚动清理旧份 |
| `BACKUP_DIR` | `<db 同级>/backups`（R75 新增） | 快照目录（标准部署即 `./backups`；`db/` 被重置不殃及快照） |

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

### 自动快照与恢复（R75 新增）

- **`backups/` 目录**：快照落盘处（`.gitignore` 已排除，不入库；与 `db/` 同级——`db/` 被沙箱重置清空时快照存活）。R75 起 Go 服务内置定时快照（`store.Open` 自动托管，零接线）：每 `BACKUP_INTERVAL_HOURS`（缺省 6）小时对 `db/custom.db` 做 SQLite 在线一致性快照（`VACUUM INTO` 只读连接，含 WAL 已提交数据，不阻塞业务写）→ gzip 压缩为 `backups/db-YYYYMMDD-HHMMSS.db.gz` → 按 `BACKUP_KEEP`（缺省 3）滚动清理；优雅停机（`Close` 钩子）时也做最后一次快照。
- **admin 手动快照**：`POST /api/admin/backup/snapshot`（登录态；与 `GET /api/admin/backup` 的 JSON 逻辑备份互补，本端点为物理快照，返回快照文件名/大小/耗时与恢复提示）。
- **恢复四步**（停服 → gunzip → 覆盖 → 起服）：

```bash
systemctl stop mhgl                                        # ① 停服务(对应你的常驻形态)
gunzip -t backups/db-20260102-030000.db.gz                 #    可选: 先校验快照完整性
gunzip -c backups/db-20260102-030000.db.gz > db/custom.db  # ②③ 解压覆盖恢复库
rm -f db/custom.db-wal db/custom.db-shm                    #    旧 WAL 与恢复文件不配套, 必须清
systemctl start mhgl                                       # ④ 起服务(自举只补缺失表, 不动恢复出的数据)
```

> 快照只护主数据 `db/custom.db`；封面 `web/covers/` 随 git 回来（README「数据备份」节口径），恢复后无需额外处理。恢复出的库是快照时刻的完整状态——快照之后新采集的章节会丢失，需重采或接受回滚。

## ⑥ 反向代理

- 仓库根自带 **`Caddyfile`**：`:81 → localhost:3000`（R69 已随 mini-services 退役裁剪为单一反代）。
- 自配反代：Caddy `reverse_proxy 127.0.0.1:3000`（默认透传 `X-Forwarded-Proto`，Secure Cookie 全自动）；Nginx 需补 `proxy_set_header X-Forwarded-Proto $scheme;`。
- https 部署无须显式 `COOKIE_SECURE=1`（透传即自动叠加）；http 直连不要开它（浏览器拒收 Secure Cookie 会断后台登录）。

## ⑦ 内容解锁桥与七猫签名桥（可选 mini-services，R76）

主服务（`:3000` 单二进制）**不含也无需**这两个伴生进程；两者均为**可选组件**——仅当启用对应采集规则时才需启动，缺省不启动不影响主服务与其它规则（对应规则会 fail-closed/正文段降级）。均为单文件 Go、**stdlib 零依赖**、仅绑 `127.0.0.1`（不外露，无需反代/防火墙配置）。

| 服务 | 端口 | 用途 | 启用条件（缺省不需要） |
| --- | --- | --- | --- |
| `mini-services/bqg-unlock` | `3010` | bqg713 家族正文 token 桥（AES-128-CBC+MD5 派生 token，host 白名单+同 host ≥600ms 节流）；端点 `GET /unlock?url=<原章节URL>` | 启用「笔趣阁 bqg713」规则时（规则 `contentProxyUrl` 指向 `http://127.0.0.1:3010/unlock?url={url}`） |
| `mini-services/qimao-proxy` | `3013` | 七猫官方 API 签名+AES 解密桥（MD5 双签名+正文 AES-128-CBC 解密）；端点 `/search` `/rank` `/detail` `/toc` `/content` | 启用「七猫官方API」规则时（规则六段全部指向 `http://127.0.0.1:3013/...`） |

**构建与启动**（Go 工具链就绪后，每个服务两行；幂等可重跑）：

```bash
# bqg-unlock(:3010)
cd mini-services/bqg-unlock && go build -o bqg-unlock .
( setsid nohup ./bqg-unlock > /tmp/bqg-unlock.log 2>&1 < /dev/null & )

# qimao-proxy(:3013)
cd mini-services/qimao-proxy && go build -o qimao-proxy .
( setsid nohup ./qimao-proxy > /tmp/qimao-proxy.log 2>&1 < /dev/null & )
```

> systemd 常驻可仿 §② 的 `mhgl.service` 再写两个 unit（`ExecStart=/opt/mhgl/mini-services/<服务>/<二进制>`，`Restart=on-failure`）；主服务升级/重启与二者互不影响（独立二进制）。

**healthcheck**：

```bash
curl http://127.0.0.1:3010/healthz   # → ok
curl http://127.0.0.1:3013/health   # → {"ok":true,"service":"qimao-proxy","selfTestOk":true,...}
```

- `qimao-proxy` 的 `selfTestOk=true` 为启动时 AES-128-CBC 回环自检，`apiReachable` 为上游七猫 API 可达性探针（60s 缓存）；`bqg-unlock` 无自检端点，`/unlock?url=` 实弹验 token 桥（内容域白名单 apibi.cc / apiqu.cc / apige.cc 等）。
- 对应规则未启用时**无需启动**；停掉它们不影响主服务进程，仅对应规则采集失败（诚实留痕）。

## ⑧ 常见问题三条

| 症状 | 处理 |
| --- | --- |
| **端口 3000 被占** | `ss -ltnp \| grep 3000` 找到旧进程处理；或 `PORT=8080` 换端口启动 |
| **沙箱/环境重置后服务消失** | `bash scripts/recover.sh`（幂等一键恢复：装 Go→DB 完整性→启动→引导→看门狗→报告；`RECOVER_START_TASKS=1` 顺带启动本次新建任务） |
| **任务大量超时 / 重启后 paused** | 超时=源站慢/限速，引擎自动退避+镜像切换，人工放慢任务间隔；重启后 running 任务被收编为 paused（进度不丢）——后台任务页点「启动」或 `POST /api/admin/tasks/{id}/control` body `{"action":"start"}` 断点续采 |

> 升级：`git pull && go build -o .build/mhgl ./cmd/server` 后重启进程（或等看门狗/交给 systemd）。备份/回滚/深度 FAQ 见 **[docs/INSTALL-GUIDE.md](./docs/INSTALL-GUIDE.md)**。
