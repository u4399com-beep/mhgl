# 小说聚合站 · 安装部署教程（R55 Go 单体版）

> **架构变更声明（R55）**：项目已整体迁移为 **Golang 单体**——Web 服务、前台站群、后台管理、
> REST API、采集引擎、调度器全部编译为**一个 Go 二进制**，监听 `:3000`。
> Node.js/Next.js 运行时**退役**；数据库沿用 SQLite 原文件（**零迁移**，历史数据直接可用）。
> 上一版（Next.js 双栈）教程见 git 历史或 [INSTALL-GUIDE-r52.bak.md](INSTALL-GUIDE-r52.bak.md)。

---

## 1. 这套系统是什么

小说聚合站 = **SEO 站群前台**（默认 aijjxs 主题，伪静态 `/book/{num}.html`，TDK/OG/sitemap 全套）
+ **采集引擎**（反反爬：拦截页检测/UA 指纹/Retry-After/镜像 sticky/代理冷却/Charset 自适应）
+ **后台管理**（任务/规则/书籍/站点/设置/代理池/备份，深色管理台）。

一个二进制，一个 SQLite 文件，一台机器即可跑。

## 2. 环境要求

| 项 | 要求 |
|---|---|
| 操作系统 | Linux / macOS（Windows 用 WSL） |
| Go | ≥ 1.24（`GOTOOLCHAIN=auto` 会自动拉 go.mod 声明的版本） |
| 内存 | ≥ 512MB 可跑（进程内存软顶默认 600MB，`MEM_LIMIT_MB` 可调） |
| 磁盘 | 数据库 + 封面 + 下载目录（初始 <10MB，随采集量增长） |

## 3. 快速开始（5 分钟）

```bash
# 1) 拉代码
git clone https://github.com/u4399com-beep/mhgl.git && cd mhgl

# 2) 构建（依赖 modernc.org/sqlite 纯 Go 驱动, 无 cgo, 无需 gcc）
go build -o .build/mhgl ./cmd/server

# 3) 初始化数据库（首次部署: 从零建表）
bun run scripts/bootstrap-db.ts        # 或用 docker-entrypoint 的等价逻辑
#   —— 已有旧版数据库(db/custom.db)则跳过: Go 直连, 零迁移

# 4) 启动
PORT=3000 ./build/mhgl

# 5) 打开
#    前台:  http://127.0.0.1:3000/?view=home
#    后台:  http://127.0.0.1:3000/admin   (缺省密码 audit-fix-2025)
```

开发模式（改码自动重建）：`bun run dev`（内部执行 `scripts/dev-go.sh`，源码变更自动 `go build` 后启动）。

## 4. 初始化说明

**全新部署**（无旧库）：先跑一次旧栈引导或手工建表后，登录后台 →
「采集规则 → 导入内置规则库」（40 条站源规则幂等导入）→「站群系统」确认默认站点 →
「采集任务 → 新建任务」选规则 + 单本/书号/列表范围模式 → 启动。

**从 R54 及以前版本升级**：什么都不用做。`db/custom.db` 原样直连
（Prisma 的 DateTime=毫秒整数/Boolean=0/1 存储格式 Go 侧完全兼容）；
启动时恢复机制自动把遗留的 `running` 行收编为 `paused`，后台点「续跑」即断点续采。

## 5. 环境变量

| 变量 | 缺省 | 说明 |
|---|---|---|
| `PORT` | `3000` | HTTP 监听端口 |
| `DB_PATH` | `db/custom.db` | SQLite 文件路径（相对进程工作目录） |
| `ADMIN_PASSWORD` | `audit-fix-2025`(dev) | 后台密码；**生产必须显式设置**（缺省时 fail-closed 拒绝登录） |
| `SESSION_SECRET` | dev 固定值 | 会话 HMAC 密钥；生产必须显式设置 |
| `COVER_DIR` | `web/covers` | 封面落盘目录 |
| `MEM_LIMIT_MB` | `600` | Go 内存软顶（Go runtime GC 目标） |
| `GO_ENV` | - | 设为 `production` 启用生产 fail-closed 口径 |

## 6. 生产部署

### 裸机 + systemd

```ini
[Unit]
Description=mhgl novel site (go monolith)
After=network.target

[Service]
WorkingDirectory=/opt/mhgl
Environment=PORT=3000
Environment=DB_PATH=/opt/mhgl/db/custom.db
Environment=ADMIN_PASSWORD=改成强密码
Environment=SESSION_SECRET=改成随机串
Environment=GO_ENV=production
ExecStart=/opt/mhgl/.build/mhgl
Restart=always
RestartSec=3
# 内存软顶由进程内 debug.SetMemoryLimit 执行, 无需 GOMEMLIMIT

[Install]
WantedBy=multi-user.target
```

### Docker

```dockerfile
FROM golang:1.24-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN go build -ldflags="-s -w" -o /out/mhgl ./cmd/server

FROM alpine:3.20
RUN adduser -D mhgl
WORKDIR /app
COPY --from=build /out/mhgl /app/mhgl
COPY web /app/web
USER mhgl
EXPOSE 3000
ENV PORT=3000 DB_PATH=/app/db/custom.db
VOLUME /app/db
CMD ["/app/mhgl"]
```

> 旧版镜像（Dockerfile.scrapling/docker-compose 多服务拓扑）已随架构退役；
> 单体无浏览器引擎依赖，无需 scrapling/cloak-browser 旁挂服务。

## 7. 反向代理

Caddy 示例（自动 HTTPS）：

```caddy
example.com {
    reverse_proxy 127.0.0.1:3000
}
```

Nginx 需携带 `X-Forwarded-For`（后台登录限流按其取 IP）。

## 8. 内存与采集行为

- 进程内存软顶 `debug.SetMemoryLimit(600MB)`：采集高峰 GC 平滑回收；
  对比旧栈（Next.js dev 基线 ~2GB + 采集增量），单体 RSS 稳定在 **15~30MB** 量级。
- 任务暂停/恢复/停止均为进程内原子操作；`running` 行在进程重启后由恢复机制收编为 `paused`，
  后台「续跑」= 断点续采（增量决策幂等）。
- autoRefresh 任务：终态后进程内定时自动重启（5~1440 分钟钳制）。

## 9. 常见问题

**Q: 后台登录 401？** 生产模式未设 `ADMIN_PASSWORD`（fail-closed）；dev 缺省 `audit-fix-2025`。

**Q: 封面 404？** 封面目录 `web/covers` 为空（旧库文件随环境丢失时）；前台自动回退书名占位块，
重新采集或手工补图即可。

**Q: 任务启动报「规则含 Go 引擎不支持的能力」？** 规则用了 browser/scrapling/xpath 等特性；
单体无 TS 回退，请改用 http 引擎规则（40 条内置规则均为兼容口径）。

**Q: 数据库被锁？** 单体内已单写者串行；如另有进程（旧栈/脚本）同时写同一文件，
请确保只留一个写者。

## 10. 功能对齐与迁移细节

见 [agent-ctx/go-migration/PARITY.md](../agent-ctx/go-migration/PARITY.md)（全量/简化/退役三档矩阵）
与 [agent-ctx/go-migration/theme-audit.md](../agent-ctx/go-migration/theme-audit.md)（逐页核实审计）。
