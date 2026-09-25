# mhgl 小说聚合站 · 安装部署图文教程（Go 单体版 · R68-d 全重写）

> 适用版本：R55 起（全栈 Golang 单体）· 本版更新：**R68-d**（面向从零部署者逐细节重写；自愈化启动口径）
> 架构一句话：**一个 Go 二进制**（`.build/mhgl`）承载 Web 前台 / 管理后台 / REST API / 采集引擎 / 调度器，监听 `:3000`，数据落 SQLite 单文件 `db/custom.db`。Node.js / Next.js / Docker / MySQL / Redis 全部不需要。
>
> 全程约 15~30 分钟（大头是首次构建与下载，取决于网络）。每步都给出「预期结果」，与预期不符直接跳 **§9 常见问题排查**；**部署完成站点「预览挂掉」时直接跳 §7 一键恢复**。

---

## 目录

1. [前置条件（系统 / bun / git / Go）](#1-前置条件)
2. [获取代码与目录认识](#2-获取代码)
3. [数据库初始化（prisma db push + bootstrap 引导）](#3-数据库初始化)
4. [启动服务（bun run dev 真实链路 + 自愈行为）](#4-启动服务)
5. [看门狗（进程死了 15 秒自动拉起）](#5-看门狗)
6. [管理后台（登录 / 建任务 / 代理池 / 主题）](#6-管理后台)
7. [recover.sh 一键恢复（预览挂掉的工程化兜底）](#7-recover-sh-一键恢复)
8. [数据备份（三类三机制）](#8-数据备份)
9. [常见问题排查 FAQ](#9-常见问题排查-faq)
10. [附：一分钟极简清单](#附一分钟极简清单)

---

## 1. 前置条件

### 1.1 操作系统 / 内存 / 磁盘 / 网络

| 项目 | 最低 | 推荐 | 说明 |
|---|---|---|---|
| 操作系统 | Linux x86_64 / arm64（Ubuntu 20.04+、Debian 11+ 已验证） | 同左 | 裸机直跑，无需容器 |
| 内存 | 512MB | 1GB+ | Go 侧 `GOMEMLIMIT` 内建 600MiB 软上限（`MEM_LIMIT_MB` 可调）；采集线程开大时吃内存的是宿主而非引擎 |
| 磁盘 | 500MB（工具链 + 空库） | 2GB+ | 正文库按采集量增长，万章 ≈ 数百 MB；Go 工具链占 ~250MB |
| 网络 | 能访问 GitHub（拉代码 / 装 Go）+ Bun 官方源（装 bun）+ 目标采集源站 | — | 国内网络装 Go 会自动回退 golang.google.cn 镜像（脚本内置） |

### 1.2 git

拉代码用。绝大多数发行版自带；没有就装：

```bash
# Debian/Ubuntu
sudo apt-get install -y git
git --version        # 预期: git version 2.x.x
```

### 1.3 安装 bun（工具链依赖，必装）

> bun 在本项目里**不跑业务**（业务全在 Go 二进制里），只承担三件工具活：
> ① 安装 `prisma` CLI（建表用）② 跑空库引导脚本 `scripts/bootstrap-db.ts` ③ `bun run dev` 作为启动壳。
> 所以**必装**，但不必新版本，1.3+ 即可。

```bash
curl -fsSL https://bun.sh/install | bash
```

装完按提示重开终端（或 `source ~/.bashrc`），验证：

```bash
bun --version
# 预期输出样例:
# 1.3.14
```

### 1.4 安装 Go（两条路径任选其一）

本项目需要 Go 1.26 级别的工具链（`go.mod` 声明 `go 1.26.0`）。

#### 方式 A：一键脚本（推荐）

```bash
cd /path/to/mhgl          # 若尚未拉代码, 先看 §2 再回来执行也行
bash scripts/install-go.sh
```

脚本行为（幂等，重复执行安全）：

1. 把 **Go 1.24.5 基础工具链**解压到 `~/go-sdk/go`（**不污染系统目录，无需 sudo**；go.dev 不可达时自动回退 golang.google.cn 镜像）；
2. 打印版本号并提示完成。

预期输出：

```
go version go1.24.5 linux/amd64
[install-go] 完成。dev-go.sh/recover.sh 会自动把 /home/you/go-sdk/go/bin 加入 PATH(dev-go.sh 检测到 go 缺失时也会自动调本脚本)
```

> **版本口径（重要，R68-d 实测）**：脚本装的是 1.24.5 基础工具链，而 `go.mod` 要求 1.26.0。
> Go 的 `GOTOOLCHAIN=auto` 机制（默认开启）会在**项目目录内首次执行 go 命令时自动下载 go1.26.0 工具链**
> （缓存于 `~/go/pkg/mod/golang.org/toolchain@*`）。所以：
> - 在项目内跑 `go version` 显示 `go1.26.0`，在项目外显示 `go1.24.5` —— **都是正常的**；
> - 首次构建会多花一点时间下载 1.26 工具链（需网络）。

#### 方式 B：手动安装

```bash
# amd64 示例; arm64 把文件名/目录名里的 amd64 换成 arm64
curl -LO https://go.dev/dl/go1.24.5.linux-amd64.tar.gz
mkdir -p ~/go-sdk && tar -C ~/go-sdk -xzf go1.24.5.linux-amd64.tar.gz
```

#### 让 PATH 生效（两种方式任选）

```bash
# 临时（当前终端有效）
export PATH=$HOME/go-sdk/go/bin:$PATH

# 永久（写入 shell 配置）
echo 'export PATH=$HOME/go-sdk/go/bin:$PATH' >> ~/.bashrc && source ~/.bashrc
```

**验证：**

```bash
cd /path/to/mhgl        # 项目内(此时 GOTOOLCHAIN 可能已切 1.26)
go version
# 预期输出: go version go1.26.0 linux/amd64   (或 go1.24.5, 见上方版本口径)
```

> **日常启动其实不用手动 export**：`scripts/dev-go.sh` 每次启动都会自动把 `~/go-sdk/go/bin` 加进 PATH；
> 而且从 R68-d 起，**go 缺失时 `bun run dev` 会自动调 `scripts/install-go.sh` 自愈安装**（见 §4.5）。
> 只有你直接敲 `go build` / `go test` 等命令时才需要先 export。

---

## 2. 获取代码

### 2.1 clone 仓库

```bash
git clone https://github.com/u4399com-beep/mhgl.git
cd mhgl
```

> 仓库地址以 `git remote -v` 输出为准（本教程与仓库 origin 一致）。

### 2.2 目录结构（每个目录是什么）

```
mhgl/
├── cmd/server/            # Go 装配入口: config → store(SQLite) → 恢复 → 采集管理器 → HTTP
├── internal/              # 全部业务代码(Go):
│   ├── store/             #   SQLite 直连数据层(Prisma 落库格式兼容, 单写者 WAL)
│   ├── crawl/             #   采集引擎(反反爬/解析/清洗/编排/调度, 引擎内置于主二进制)
│   ├── api/               #   /api/admin/** + /api/public/** JSON 接口
│   │   └── builtin_rules.json  # 内置规则库(35 条实测规则, go:embed, 后台「一键导入」数据源)
│   ├── web/               #   前台 SSR(11 套主题) + 后台管理模板 + 静态 JS/CSS
│   ├── auth/              #   HMAC Cookie 鉴权
│   ├── config/            #   环境变量配置
│   └── sanitize/          #   展示级 HTML 消毒
├── web/
│   ├── covers/            # 封面图落盘目录(随 git 回来, 见 §8)
│   └── static/            # 前台/后台静态源文件(css/js, 入库)
├── scripts/               # 运维脚本: install-go.sh / dev-go.sh / dev-watchdog.sh / recover.sh / bootstrap-db.ts
├── prisma/schema.prisma   # 数据模型(Category/Site/Rule/Task/Book/Chapter/Setting/Feedback 等)
├── db/                    # SQLite 运行时数据(custom.db, 不入库, ★备份它)
├── mini-services/         # 8 个可选支撑代理(3010~3017, 主应用不装它们也能跑)
├── docs/                  # 本教程 / 规则手册 / 历史归档
├── package.json           # bun 命令入口(dev/build/start/lint/bootstrap)
└── .env.example           # 环境变量样例(注释齐全, 复制为 .env 使用)
```

### 2.3 安装工具链依赖

```bash
bun install
```

预期：秒级完成，安装 `prisma` CLI（§3 建表用）。已有 `bun.lock` 锁定版本。

### 2.4 配置 .env

```bash
cp .env.example .env
```

`.env.example` 每项带中文注释。第一次部署**只需关心一项**：

```bash
# ===== 后台鉴权 =====
ADMIN_PASSWORD=audit-fix-2025     # 生产环境务必改成强密码!(改完重启服务生效)
```

其余（`DATABASE_URL=file:./db/custom.db`、`LOG_LEVEL=info` 等）用默认值即可。全变量表见 `.env.example` 与 [DEPLOY.md](../DEPLOY.md)。

---

## 3. 数据库初始化

### 3.1 机制澄清（先读这个，R68-d 实测口径）

- 数据库 = **SQLite 单文件 `db/custom.db`**（位置可用 `DB_PATH` 覆盖）。
- **Go 服务是「零迁移」设计**：启动时只打开既有库并自检核心表（Task/Book/Chapter/Rule/Setting/Site），**缺表直接拒绝启动**（日志 `store: table Task missing/incompatible`）。**它不会替你建表**——建表这一步由 Prisma 完成（下节）。
- 因此「库文件没了」是硬故障：要么跑一键恢复 `bash scripts/recover.sh`（§7），要么手动 §3.2，要么直接 `bun run dev`——**R68-d 起 dev-go.sh 检测到库缺失/缺表会自动自举**（§4.5）。

### 3.2 建表：bunx prisma db push（全新部署 / 库被清后）

```bash
DATABASE_URL="file:$(pwd)/db/custom.db" bunx prisma db push --skip-generate
```

预期输出（关键行）：

```
Environment variables loaded from .env
Prisma schema loaded from prisma/schema.prisma
Datasource "db": SQLite database "custom.db"

🚀  Your database is now in sync with your schema. Done in XXXms
```

看到 `in sync with your schema` 即成功，空表已建好。

### 3.3 铺运营数据：bun run bootstrap（幂等引导）

空库能跑（前台显示暂无书籍），但建议一键铺好运营基线。**前置：服务已在运行**（先看 §4 启动，再回来执行）：

```bash
bun run bootstrap          # 等价: bun run scripts/bootstrap-db.ts
```

脚本做 4 件事（全部幂等，重复执行安全）：

| 步骤 | 装什么 | 幂等行为 |
|---|---|---|
| ① 登录后台 API | 用 `ADMIN_PASSWORD`（缺省 `audit-fix-2025`） | 取 `heis_admin` 会话 |
| ② 导入内置规则 | **35 条**实测站点规则（笔趣阁家族/杰奇 CMS/GBK 站/JSON API 站/CF 防护站等） | 全量导入覆盖式 |
| ③ 固化分类 | **16 个** 4 字分类（玄幻奇幻/都市生活/…/综合其他） | 按名查重跳过 |
| ④ 默认站点 | `localhost:3000`，aijjxs 主题 | 仅 Site 表为空时创建 |
| ⑤ 三大部头任务 | 神马小说(yueyouxs)/仙侠天恋(xyetianlian)/新笔趣阁(xbqg777)，engine=go | 按任务名查重；**只创建不启动** |

预期输出样例：

```
[bootstrap] BASE=http://localhost:3000 START=false
[bootstrap] rules imported ok=35 err=0
[bootstrap] categories ensured: total=16 created=16 existed=0
[bootstrap] default site created: ok
[bootstrap] task created: 神马小说·大部头批量(yueyouxs) (id=c..., R52-a 实测无反爬)
[bootstrap] task created: 仙侠天恋·分类批量(xyetianlian) (id=c..., ...)
[bootstrap] task created: 新笔趣阁·大部头批量(xbqg777) (id=c..., ...)
[bootstrap] done
```

> 想引导完立即开采集：`bun run scripts/bootstrap-db.ts --start`（只启动**本次新建**的任务）。
> 引导脚本不含书籍/章节数据——那要靠采集任务回填。

### 3.4 从备份迁移（老手路径）

把旧机的 `db/custom.db`（建议连同 `web/covers/` 封面目录）整体拷到新机同路径，直接 §4 启动即可，**跳过 §3.2/§3.3**。备份口径见 §8。

---

## 4. 启动服务

### 4.1 `bun run dev` 的真实链路

```bash
bun run dev
```

这条命令背后发生的事（R68-d 口径，逐层核对过）：

```
bun run dev
  └─ package.json "dev" → bash scripts/dev-go.sh
       ├─ ① PATH 前插 ~/go-sdk/go/bin(GO_SDK_BIN 可覆盖), GOMEMLIMIT=${MEM_LIMIT_MB:-600}MiB
       ├─ ② [自愈] go 缺失? → 自动 bash scripts/install-go.sh 后重试        (R68-d 新增)
       ├─ ③ [自愈] DB 文件缺失/空/缺核心表? → bunx prisma db push 建表,      (R68-d 新增)
       │      并挂后台子壳: 服务 200 后自动跑 bootstrap-db.ts 幂等引导
       ├─ ④ 增量构建: cmd/internal/go.mod 的 .go 源或 web/ 任一文件比
       │      .build/mhgl 新 → go build -o .build/mhgl ./cmd/server
       └─ ⑤ exec .build/mhgl  →  监听 :3000
```

二进制产物在 **`.build/mhgl`**（单文件，~23MB）。源码没改时④跳过，秒级启动。

### 4.2 首次构建耗时预期

| 场景 | 预期耗时 |
|---|---|
| 首次构建（拉 Go 模块 + 可能自动下载 go1.26 工具链） | **1~3 分钟**，日志停在 `[dev-go] building…` 属正常 |
| 日常启动（二进制已缓存，源码无变更） | <1s（直接 exec） |
| 改了源码后启动 | 增量重建 10~60s |

> 国内网络模块拉取慢：`go env -w GOPROXY=https://goproxy.cn,direct`（写入 `~/go/pkg` 的环境配置，一次性）。

### 4.3 验证启动成功

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/
# 预期: 200

curl -s http://127.0.0.1:3000/healthz
# 预期: {"ok":true,"app":"mhgl","engine":"go","rssMB":...,"uptimeMs":...}
```

浏览器打开前台（书城/阅读/搜索）：

![前台首页](./images/install-01-home.png)

核对清单：首页有「最新上传 / 封面推荐 / 小说分类」面板（空库显示空态文案，正常）；页脚有「管理 / 反馈」链接；分类导航为 4 字锚。

### 4.4 联调覆盖（PORT / DB_PATH / 内存）

```bash
PORT=3040 DB_PATH=db/go-test.db bash scripts/dev-go.sh   # 联调形态: 独立端口+独立库
MEM_LIMIT_MB=1024 bun run dev                            # 调大 Go 内存软顶
```

### 4.5 自愈行为与关闭开关（R68-d）

`dev-go.sh` 启动前自动做两件自愈（就是「预览总是挂掉」的根治）：

| 自愈项 | 触发条件 | 动作 |
|---|---|---|
| ① Go 工具链 | PATH 里没有 `go`（典型=沙箱重置清空了 `~/go-sdk`） | 自动 `bash scripts/install-go.sh` 幂等安装 → 重新检测；安装失败则明确报错退出。**显式设置 `GO_SDK_BIN` 指向的路径缺失时不自装**（尊重定制安装位，直接报错指引） |
| ② DB 表结构 | `DB_PATH` 指向的库文件缺失 / 0 字节 / 缺核心表（Task/Book/Chapter/Rule/Category） | 先 `bunx prisma db push`（`DATABASE_URL` 按 `DB_PATH` 对齐，联调库也正确）→ 挂后台子壳等服务 200 后自动 `bootstrap-db.ts` 幂等引导（35 规则/16 分类/默认站点/3 任务，不自动开采集） |

**关闭整套自举**（纯手动运维，例如你想完全掌控建库节奏）：

```bash
MHGL_AUTO_BOOTSTRAP=0 bun run dev
```

> 自愈不会动你已有的数据：库文件完整且表齐时，两个分支都不触发，行为与旧版逐字节一致。

### 4.6 后台常驻（生产推荐）

```bash
# 形态一: 脚本托管(与 recover.sh 同款)
( setsid nohup bun run dev > dev.log 2>&1 < /dev/null & )

# 形态二: systemd(推荐)
#   [Service] WorkingDirectory=/opt/mhgl ExecStart=/opt/mhgl/.build/mhgl Restart=on-failure
#   (先 bun run build 构建出二进制; systemd 环境记得带上 .env 里的 ADMIN_PASSWORD 等)
```

### 4.7 生产 HTTPS / Secure Cookie（[R62-f]）

会话 Cookie（`heis_admin`）默认 `HttpOnly + SameSite=Lax`、不带 `Secure`（保 http 直连可用）。生产 https：

- **反代终结 TLS（推荐）**：反代透传 `X-Forwarded-Proto: https` 即自动附加 `Secure`，零配置。Caddy `reverse_proxy 127.0.0.1:3000` 默认透传；Nginx 需 `proxy_set_header X-Forwarded-Proto $scheme;`。
- **显式开关**：`COOKIE_SECURE=1` 强制所有登录/注销报文带 `Secure`（http 站点不要开，浏览器会拒收导致后台登不上）。

---

## 5. 看门狗

`scripts/dev-watchdog.sh`：每 **15s** 探测一次 3000 端口，**死了就自动拉起**（5s 冷却），日志追加到拉起方指定的文件。它解决的是 **OOM** 类死亡——宿主内存被打爆杀掉服务进程（数据不丢，重启安全，启动恢复机制会把中断任务收编为 paused）。

```bash
# 手动拉起(recover.sh 第 5 步就是这条):
( setsid nohup bash scripts/dev-watchdog.sh > /tmp/watchdog.log 2>&1 < /dev/null & )
pgrep -f dev-watchdog.sh    # 预期: 打印一个 pid
```

| 文件 | 内容 |
|---|---|
| `/tmp/watchdog.log` | 看门狗自身日志（`port 3000 dead, restarting...` 字样=触发过拉起） |
| `/tmp/main-dev-restart.log` | 被拉起服务的输出 |
| `dev.log` | recover.sh 形态拉起的服务输出 |

> 注意：看门狗脚本内 `cd /home/z/my-project` 是本仓库开发沙箱的路径，**自建部署请把该行改成本机项目路径**，或用 systemd 的 `Restart=on-failure` 替代它。

---

## 6. 管理后台

### 6.1 登录

- 入口 1：任意页面页脚「管理」；入口 2：直达 `http://服务器IP:3000/admin`（未登录自动 302 到登录页）。

![后台登录](./images/install-02-admin-login.png)

- 密码：dev/预览模式缺省 **`audit-fix-2025`**（登录页会显示提示并支持一键填入）；`.env` 里 `ADMIN_PASSWORD=你的密码` 覆盖后**重启生效**；`GO_ENV=production` 且未配置密码时**登录恒失败**（fail-closed，防裸奔）。
- 生产环境登录后第一件事：**改成强密码**（改 `.env` 重启，或在系统设置确认无弱口令风险）。

### 6.2 后台导览

登录后进入仪表盘：

![后台仪表盘](./images/install-03-admin-dashboard.png)

左侧导航：仪表盘 / 采集任务 / 采集规则 / 代理池 / 书籍管理 / 分类管理 / 站群系统 / 友链链轮 / TXT下载 / 系统设置 / 用户反馈 / 数据备份。

### 6.3 建采集任务（或直接用 bootstrap 自带 3 条）

路径：后台 → **采集任务** → 新建。

![采集任务管理页](./images/install-04-admin-tasks.png)

> §3.3 的 bootstrap 已自带 **3 条现成任务**（神马小说/仙侠天恋/新笔趣阁，创建态不自动跑）——在任务页点「启动」即可开采；下面是自己新建时的字段说明。

三种模式：

| 模式 | 填什么 | 典型用途 |
|---|---|---|
| `single` | 一本书的 URL | 补采/重采单本 |
| `bookIds` | 书号列表（换行/逗号分隔） | 按源站书号批量 |
| `range` | 列表页 URL 模板（`{page}` 占位符）+ listStart/listEnd | 按列表页翻页扫站 |

关键参数（引擎已内建防抖钳制）：

- **线程** threadMin/threadMax：并发章节抓取数（≤20/批）
- **间隔** intervalMin/intervalMax（ms）：批间随机休眠——反爬敏感的站从 800~2000 起步
- **engine**：`go`（唯一引擎）

点「启动」后状态 running，进度实时刷新（书数/章数/失败数）。暂停/停止/恢复用行内控制按钮。

**验收建议**：先拿一条直连规则起 `range` 任务 `listStart=listEnd=1` 试水，确认出书、出章节、正文干净后再放量。

### 6.4 代理池（反反爬，可选）

后台 → 代理池：收割（12 个公开源）/ 校验（并发探针）/ 周期化常驻（缺省 6h 收割 + 30min 校验）/ 消费（引擎按健康分取 Top64 免费池）。规则级出口代理在「采集规则 → fetch → 代理」配置（http/socks5h 逗号分隔轮换）。系统设置 → `proxyPool` 可开关自动喂给采集。

### 6.5 主题切换（可选）

后台 → 站群系统 → 编辑站点 → `themeId` 填主题目录名。内置 11 套：`aijjxs`（缺省，久久小说复刻）/ `pili`（霹雳书屋米色纸感）/ `shipsay` / `x2552` / `kks101` / `trxsw` / `ddyueshu` / `ggd66` / `huangjinwu` / `qb23` / `x33yq`。

---

## 7. recover.sh 一键恢复

> `scripts/recover.sh`（R61-1A 引入）= 「预览总是挂掉」的工程化兜底：把原本 5 步手工恢复链收敛为一键幂等流程。**R68-d 起日常自愈已下沉到 `bun run dev`（§4.5），recover.sh 用于「环境整个坏了」的兜底与复核。**

### 7.1 什么时候用它

- **沙箱/环境重置**（本开发环境主因）：重置杀进程 + 清空 `$HOME`（Go SDK 没了）+ 删 DB 文件 → 3000 无人监听、数据清零；
- **预览挂掉**：`http://IP:3000/` 连接拒绝 / 一直转圈；
- **换机迁移**：新机器 clone 完代码后一条命令拉起全套；
- 平时复核：幂等，随时可跑，各项就绪即跳过。

### 7.2 用法与六步流程

```bash
cd /path/to/mhgl
bash scripts/recover.sh                              # 标准恢复
ADMIN_PASSWORD=你的密码 bash scripts/recover.sh       # 覆盖管理员密码(bootstrap 登录用)
RECOVER_START_TASKS=1 bash scripts/recover.sh        # [R68-d] 引导后自动启动本次新建的任务
RECOVER_DRYRUN=1 bash scripts/recover.sh             # 演练模式: 只打印将执行的动作, 不真执行
```

| 步骤 | 做什么 | 幂等行为 |
|---|---|---|
| [1/6] | 检测 Go SDK（`~/go-sdk/go/bin/go version`） | 已装跳过；缺失跑 `scripts/install-go.sh` |
| [2/6] | 检测 DB 表（Task/Book/Chapter/Rule/Category） | 表全在跳过；缺库/缺表才 `rm` 旧库文件 → `bunx prisma db push` 重建空表 |
| [3/6] | 检测 3000 端口 | 已监听跳过；未监听后台拉起 `bun run dev`（日志 `dev.log`），轮询 `/` 直到 200（超时 180s，首次构建 2~3 分钟属正常） |
| [4/6] | `bun run scripts/bootstrap-db.ts` 幂等引导 | 35 规则 + 16 分类 + 默认站点 + 3 大部头任务；**缺省不带 `--start` 不自动开采集**；`RECOVER_START_TASKS=1` 时带 `--start`（只启动本次新建任务） |
| [5/6] | 检测看门狗 | 已运行跳过；未运行后台拉起 `dev-watchdog.sh`（此后端口死亡 15s 内自动拉起） |
| [6/6] | 恢复报告 | 服务 HTTP 码 / 看门狗状态 / 任务续采提示 / 规则数·书籍数·分类数 |

### 7.3 恢复后哪些资产回来了、哪些要重采

| 资产 | 位置 | 沙箱重置后 |
|---|---|---|
| 源码 / 主题模板 / CSS | git 仓库 | ✅ 重新 clone 即回来 |
| 采集规则库（35 条） | `internal/api/builtin_rules.json`（git 内） | ✅ bootstrap 幂等导入 |
| 16 个分类 / 默认站点 / 3 大部头任务 | 固化在 `scripts/bootstrap-db.ts` | ✅ bootstrap 重建（不自动启动） |
| 已提交的封面图 | `web/covers/`（git 内） | ✅ 随仓库回来 |
| **书籍 / 章节正文** | `db/custom.db` | ❌ 丢——需例行备份（§8）或重新采集 |
| 后台设置（主题/TDK/违禁词等） | `db/custom.db` Setting 表 | ❌ 丢——后台手动重配，或用 §8 备份导入 |

### 7.4 预览为什么会挂？（根因科普）

| 根因 | 机理 | 现在的对策 |
|---|---|---|
| **沙箱/环境重置** | 杀进程 + 清 `$HOME`（Go SDK）+ 删 DB → 3000 无人监听 | `bun run dev` 自愈（装 Go + 建表 + 引导）；重度场景 `recover.sh` 一键兜底 |
| **OOM** | 宿主内存天花板 ~2.6-3GB，采集峰值+编译尖峰触发 `global_oom` 杀进程（数据不丢） | 看门狗 15s 自动拉起；启动恢复机制把 running 任务收编为 paused，断点续采 |

快速判定：

```bash
pgrep -f '.build/mhgl'; ss -ltn | grep ':3000 '     # 进程/端口在不在
~/go-sdk/go/bin/go version                          # SDK 在不在(报错=被清)
ls -la db/custom.db                                 # 库文件在不在
tail -50 dev.log; dmesg | grep -i oom               # 死因日志
```

---

## 8. 数据备份

三类数据、三种保护机制（与 README「数据备份」节同一口径）：

| 数据 | 位置 | 保护机制 | 你要做的 |
|---|---|---|---|
| **主数据**（书籍/章节/规则/设置） | `db/custom.db`（**不入版本库**） | 例行备份 + `recover.sh`/bootstrap 可重建**空骨架** | **书籍章节不可再生，务必例行备份**：停服后直接拷文件；或后台「数据备份」页导出 JSON（书籍超 200 本自动降级为仅元数据导出，大库用文件级备份） |
| **封面**（webp/jpg） | `web/covers/` | 已被平台 checkpoint **自动提交进 git**（数据保护机制） | 无需单独备份——随仓库整体恢复；自建迁移时随目录拷贝 |
| **协作档案**（worklog / agent-ctx / docs） | git 追踪 | git 自带历史 | 无需操作 |

恢复路径：小事故 → 后台「数据备份」导入；整库丢 → `recover.sh` 重建空表 + bootstrap 引导 + 恢复你的备份文件。**永远不要在服务运行时用第三方工具直写 `db/custom.db`**（单写者锁设计，见 §9 Q7）。

---

## 9. 常见问题排查 FAQ

**Q1：预览挂了 / 3000 打不开？**
第一反应：`bash scripts/recover.sh`（幂等一键自愈，§7）。轻度场景（只是进程死了、数据都在）`bun run dev` 即可（R68-d 起它会顺带自愈 go 与库缺失）。判定根因见 §7.4。

**Q2：`go not found`？**
`bun run dev` 现在会自动跑 `scripts/install-go.sh` 自装；若你绕过启动脚本直接敲 go 命令，手动执行：`bash scripts/install-go.sh && export PATH=$HOME/go-sdk/go/bin:$PATH`。

**Q3：端口 3000 被占用？**
`ss -ltnp | grep 3000` 找到占用进程处理；或换端口 `PORT=3100 bun run dev`（前台地址相应变为 `:3100`）。

**Q4：首次启动等了很久没响应？**
首次构建要拉 Go 模块（可能还自动下载 go1.26 工具链），1~3 分钟正常。`tail -f dev.log` 看 `[dev-go] building…` 进度。

**Q5：后台登录密码忘了？**
`ADMIN_PASSWORD=新密码 bun run dev`（或 systemd 环境改 `.env` 后重启）即可覆盖；dev 模式登录页也提示缺省密码 `audit-fix-2025`。

**Q6：某站采集 403/412/503 / 正文乱码（GBK 站）？**
403 类=该站有反爬：调大任务间隔 → 规则 fetch 配代理池 → 镜像域名（CF 指纹级防护不强求全通）。GBK 站已自动探测编码（GB18030 兜底），个别站乱码检查规则 fetch 编码配置后重采。规则参数安全档位见 `docs/rule-limits.md`。

**Q7：database is locked？**
服务对主库单连接写（maxConns=1）+ WAL，正常使用不会锁。出现锁=有外部进程在直写库文件——**停掉第三方工具**，需要改数据走后台或 API。

**Q8：任务显示 paused 没在跑？**
服务重启后运行中任务会被收编为 paused（防冲突设计，进度不丢）。恢复：后台「采集任务」页点「启动」；或 API：

```bash
curl -c /tmp/jar -X POST http://127.0.0.1:3000/api/auth/login \
  -H 'Content-Type: application/json' -d '{"password":"你的密码"}'
curl -b /tmp/jar -X POST http://127.0.0.1:3000/api/admin/tasks/{任务ID}/control \
  -H 'Content-Type: application/json' -d '{"action":"start"}'
```

**Q9：想清空重来？**
停服 → `rm -f db/custom.db db/custom.db-wal db/custom.db-shm` → `bun run dev`（自动建表+引导）或手动 §3.2/§3.3。

**Q10：升级版本？**
`git pull && bun run build`，重启进程（看门狗/systemd 会接管）。启动时恢复机制把中断任务安全转 paused，后台手动「启动」续采（增量模式不重复抓已有章节）。

---

## 附：一分钟极简清单

```bash
git clone https://github.com/u4399com-beep/mhgl.git && cd mhgl
curl -fsSL https://bun.sh/install | bash && bun install     # bun + 工具链依赖
cp .env.example .env                                        # 生产改 ADMIN_PASSWORD!
bash scripts/recover.sh                                     # 一键: 装Go→建表→启动→引导→看门狗
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/   # 200 即成
# 前台: http://IP:3000/?view=home   后台: http://IP:3000/admin (缺省密码 audit-fix-2025)
# 预览挂掉 → 再跑一遍 bash scripts/recover.sh
```
