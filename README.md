# mhgl · 小说聚合站（纯 Go 单体）

> 🏗️ **R69 纯 Go 化声明**：Web 服务/前台站群/后台管理/REST API/采集引擎/调度器编译为**一个 Go 二进制**
> （`.build/mhgl`，监听 :3000）。**必备路径零 Node/bun/Prisma/TS 依赖**：数据库建表由服务每次启动时
> **原生自举**（幂等 DDL，毫秒级，既有库零改动），空库自动播种运营数据——原 `bunx prisma db push` +
> `bootstrap-db.ts` 的 TS/Prisma 引导链已于 R69 全量退役（历史可考 git），全新部署只需要一个 Go 工具链。
>
> 📖 **安装部署教程（图文）**：**[docs/INSTALL-GUIDE.md](./docs/INSTALL-GUIDE.md)** · 生产速查卡：[DEPLOY.md](./DEPLOY.md)

## 架构（R69）

```
一个二进制 (.build/mhgl)  →  :3000
├── cmd/server            装配入口(config/store/bootstrap/恢复/采集/HTTP; `mhgl bootstrap` 子命令)
├── internal/store        SQLite 直连(纯 Go 驱动 modernc.org/sqlite, 无 cgo, 单写者 WAL)
├── internal/bootstrap    原生自举: 启动幂等建表(14 表) + 空库播种(规则/分类/站点/任务)
├── internal/crawl        采集引擎(反反爬/解析/清洗/编排 + bridge 直连持久化 + 调度)
├── internal/api          /api/admin/** + /api/public/** JSON 面
├── internal/web          前台 SSR(11 主题, 模板 go:embed 内嵌二进制) + 后台管理(html/template + 原生 JS/CSS)
├── internal/stealth      内容伪装渲染管线(R70: 混淆/转码/干扰句/伪原创, 挂公共 HTML 出口, 默认全关)
└── internal/auth         HMAC Cookie 鉴权
```

## 功能特性

- **采集引擎**（`internal/crawl/`）：规则四段（列表/详情/目录/正文）解析、CSS/正则/JSON 字段提取、`{page}`/`{offset:N}` 占位符翻页、编码识别（GBK 等）、正文清洗（广告模式/去壳页）、分卷排序、并发限速 + HostGate、**规则级出口代理池**（http/socks5h 逗号分隔多条轮换≤10，仅国内 IP 可达站点如 77shuku.info 必配）、封面本地化（webp）。
- **多引擎反反爬降级链**：native HTTP（curl 链）→ 代理池轮换 → 中继桥（3011）→ Scrapling 桥（3012，static/stealthy/playwright）→ Obscura 本地 chromium 反检测渲染，按站点防护级别自动降级。
- **站级签名/解密代理**：对 token/签名/AES 类站点以外置 mini-service 承载（见下表），引擎 `tokenUrl` 钩子对接。
- **管理端**：站点规则 CRUD + 在线测试、**内置规则库一键导入**（**35 条**实测站点规则，幂等覆盖可恢复出厂）、任务（单书/批量/实时采集/定时增量 autoRefresh）、书籍/章节管理（批量删除等不可恢复操作带输入确认门槛）、TXT 下载、站群与 SEO（伪静态 6 预设、站点级「自动生成 TDK」一键铺底）、统计看板（仪表盘卡片可开关显示）、**违禁词过滤**（对采集入库内容做屏蔽词/敏感词过滤，mask/remove 双模式）、**规则极限校准**（对模拟源站实测安全并发与速率，一键写回推荐参数）。
- **前台**：多主题站群（**8 配色 × 8 风格 × 8 布局 = 512 套组合主题 + 9 套精选**，含笔趣阁经典、霹雳书屋仿站、久久小说 aijjxs 复刻；非法主题 ID 自动回退默认主题）、阅读页、搜索、sitemap、**6 预设伪静态 URL**（纯数字/字母数字/目录式/无后缀/紧凑双段/动态查询，宽容解析永不断链）、**全链自动 TDK**（标题/描述/关键词 + canonical + JSON-LD 逐页生成，伪静态直达页 SSR 直出）。
- **内容伪装 / 反搜索**（R70，四开关**默认全关**）：页面结构混淆（每页唯一、外观不变）/ 关键词句子实体转码（entity/zwsp 双模式）/ 隐藏干扰句（hidden/offscreen，密度可调）/ 句子伪原创（request/daily/stable 三档种子）——后台「系统设置 → 内容伪装 / 反搜索」设置卡逐项开关。⚠️ 隐藏文字/伪原创可能被搜索引擎判作弊，默认关闭、风险自负。
- **目录分卷分组显示**（R70，`book.volume.show`，默认关）：书籍目录按卷分组渲染（卷名 + 卷内章节两级结构）；关闭时目录平铺展示，与既往完全一致。
- **任务可靠性**：任务状态机（pending/running/paused/stopped/done/error）、暂停续采、服务重启自动回收 running → paused 不丢进度、增量重采跳过已采、dev 模式 OOM 自愈守护（`scripts/dev-watchdog.sh`）。

## 技术栈

| 层 | 技术 |
| --- | --- |
| 语言/运行时 | **Go 1.26+**（单二进制, 无 Node 依赖） |
| HTTP | stdlib net/http（Go 1.22+ 方法+通配路由） |
| 数据库 | modernc.org/sqlite（纯 Go 驱动, 无 cgo）+ SQLite 单文件；启动时原生幂等建表（14 表） |
| 模板/UI | html/template（**go:embed 内嵌二进制**）+ 手写 CSS/原生 JS（前台 11 主题 + 深色管理台） |
| 静态资源 | `web/static` 磁盘直服（改 CSS/JS 即时生效, 无需重建） |
| 采集引擎 | `internal/crawl`（goquery 解析 + 反反爬体系全量保真） |
| 部署 | 裸机 systemd 直跑单二进制（Docker 链已退役，归档 `docs/archive/docker/`） |

## 快速开始

前置：Linux + **Go 1.26+ 工具链**（`bash scripts/install-go.sh` 一键装到 `~/go-sdk`，幂等、免 sudo、国内网络自动回退镜像）。三条命令起站：

```bash
git clone https://github.com/u4399com-beep/mhgl.git && cd mhgl    # 仓库地址以 `git remote -v` 为准
bash scripts/install-go.sh && export PATH=$HOME/go-sdk/go/bin:$PATH   # ① 装 Go 工具链(幂等)
go build -o .build/mhgl ./cmd/server                              # ② 构建单二进制(~23MB)
./.build/mhgl                                                     # ③ 运行 → :3000(前台+后台+API+采集一体)
```

**首次启动自动完成数据库初始化，零外部工具**：幂等建表（14 张，毫秒级）→ 空库后台自动播种（**35 条**内置采集规则 / **16** 分类 / 默认站点 `localhost:3000`·aijjxs 主题 / **3** 条大部头采集任务——任务仅创建不启动）。`MHGL_AUTO_SEED=0` 可关闭自动播种；`./.build/mhgl bootstrap` 可随时显式幂等引导（不起服务）。

开发/懒人启动：`bash scripts/dev-go.sh`——go 缺失自动安装（自愈）+ 源码/内嵌模板变更增量重建 + exec 二进制。沙箱平台的启动钩子是 `bun run dev` → **package.json "dev"** → 本脚本 → Go 二进制：package.json 是**零依赖纯别名壳，平台启动接口而非 JS 依赖**（仓库无任何 Node/TS 源码，"dev" 脚本只是一条 `bash scripts/dev-go.sh`）。

> 常驻用 systemd（`Restart=on-failure`，单元样例见 [DEPLOY.md](./DEPLOY.md)）；全流程图文见 [docs/INSTALL-GUIDE.md](./docs/INSTALL-GUIDE.md)。

| 地址 | 用途 |
| --- | --- |
| `http://localhost:3000/admin` | 后台管理（规则/任务/书籍/章节） |
| `http://localhost:3000/?view=home` | 前台站点（书城/阅读/搜索） |

> 🔐 后台密码：dev 模式缺省 `audit-fix-2025`（登录页会显示提示与一键填入）；**生产务必设置 `ADMIN_PASSWORD` 强密码**（`GO_ENV=production` 且密码为空时登录恒失败，fail-closed）。装完去哪做：后台「采集规则 → 一键导入」其实播种已替你做完 → 建任务 → 开采，全流程见 [docs/INSTALL-GUIDE.md](./docs/INSTALL-GUIDE.md) §6。

> **预览挂掉 / 服务连不上 / 端口 3000 无人监听？** 一条命令自愈：`bash scripts/recover.sh`
> （装 Go → DB 完整性检查 → 启动 → 幂等引导 → 看门狗 → 报告，幂等可重跑；`scripts/dev-go.sh`
> 也已自愈化——go 缺失自动装、库缺失自动自建，见教程 §4/§7）。

## 外置代理小服务（已退役，R69）

原 8 个 TS/Python 外置代理小服务（`bqg713-proxy` / `fetch-relay` / `scrapling-bridge` / `qimao-proxy` / `deqixs-proxy` / `xjp-proxy` / `cloak-browser` / `qidian-proxy`，端口 3010~3017）已随 **R69 纯 Go 化**整体退役（可考古 git 历史 `mini-services/` 目录）。现役采集引擎直连采集，外置签名/解密站点由对应规则自身的 fetch 配置（代理池 / curl 指纹 / token 预取）承担，不再需要任何伴生进程。

## 目录结构

```
cmd/server/                 # Go 装配入口(config/store/bootstrap/恢复/采集/HTTP)
internal/                   # 全部业务: store(SQLite 直连) / bootstrap(原生自举) / crawl(采集引擎) / api(JSON 面) / web(前台+后台) / auth
internal/api/builtin_rules.json  # 内置规则库(go:embed, 35 条实测规则, 播种与后台「一键导入」数据源)
internal/web/tpl/           # 11 套前台主题模板(go:embed 内嵌二进制; 升级换二进制即生效)
web/covers/                 # 封面落盘目录(COVER_DIR 可覆盖; 已被平台 checkpoint 自动提交进 git)
web/static/                 # 前台/后台静态源文件(css/js, 磁盘直服, 入库)
db/                         # SQLite 运行时数据 custom.db(+ -wal/-shm, 不入版本库, ★备份它)
download/  upload/          # TXT 下载产物 / 上传暂存
scripts/                    # install-go.sh 装 Go / dev-go.sh 启动(自愈) / dev-watchdog.sh 守护 / recover.sh 一键恢复
docs/                       # INSTALL-GUIDE.md 小白教程 / rule-limits.md 规则手册 / images/ 截图
.zscripts/                  # 平台启动/守护脚本与运行日志
```

### 常用命令

| 命令 | 作用 |
| --- | --- |
| `go build -o .build/mhgl ./cmd/server` | 构建单二进制 |
| `./.build/mhgl` | 运行（:3000；每次启动幂等建表+空库自动播种） |
| `./.build/mhgl bootstrap` | 显式幂等引导：建表 + 35 规则/16 分类/默认站点/3 任务，随即退出（不起服务、不需要密码） |
| `bash scripts/dev-go.sh`（平台钩子 `bun run dev` → package.json "dev" 别名同款） | 开发启动：go 缺失自装 + 增量构建 + exec 二进制 |
| `bash scripts/recover.sh` | 沙箱/环境重置一键恢复（装 Go→DB 完整性→启动→引导→看门狗→报告；`RECOVER_START_TASKS=1` 顺带启动本次新建任务） |

Go 质量门全量：`gofmt -l internal/ && go vet ./... && go test -count=1 ./internal/... && go build -o .build/mhgl ./cmd/server`。

### 故障排查速查

| 症状 | 处置 |
| --- | --- |
| **预览挂掉 / 3000 无人监听** | `bash scripts/recover.sh` 一键自愈（幂等，装 Go→DB 检查→启动→引导→看门狗）；详教程 §7 |
| `go not found` | `scripts/dev-go.sh` 会自动装；手动补：`bash scripts/install-go.sh && export PATH=$HOME/go-sdk/go/bin:$PATH` |
| 端口 3000 被占 | `ss -ltnp \| grep 3000` 找到占用进程；或 `PORT=3100 ./.build/mhgl` 换端口 |
| 采集任务 paused | 后台任务页点「启动」，或 `POST /api/admin/tasks/{id}/control` body `{"action":"start"}`（断点续采不丢进度） |
| 首页/正文乱码 | GBK 站已自动探测（GB18030 兜底）；个别站核对规则编码配置后重采，详教程 FAQ |
| 不想要自动播种 | `MHGL_AUTO_SEED=0` 启动；或先 `./.build/mhgl bootstrap` 手动铺底（此后规则非空，自动播种不再触发） |

### scripts/ 约定

- `install-go.sh`：Go 1.26+ 工具链一键安装到 `~/go-sdk`（幂等；go.dev 不可达自动回退 golang.google.cn 镜像）。
- `dev-go.sh`：单体启动器（PATH/GOMEMLIMIT 装配 → go 缺失自愈安装 → 源码变更增量构建 → `exec .build/mhgl`）。
- `dev-watchdog.sh`：端口 3000 死亡 15s 自动拉起（OOM 兜底），纯 bash 永远直拉 dev-go.sh；`recover.sh`：环境重置六步一键恢复（见教程 §7）。
- 历史注（R69/R70）：原 TS/Prisma 引导链（建库脚本 + 空库引导 TS 脚本）已退役——职责内化进 `internal/bootstrap`（启动自举 + `mhgl bootstrap` 子命令）；TS 残件（`scripts/*.ts`、`scripts/archive/`、`docs/legacy-seeds/`、`docs/archive/docker/` 等 434 件）已随 R69 清退出库（git 历史可考），`prisma/`、`node_modules/` 不再是任何必需路径的一环。仓库内现存的 JS/TS 仅剩：package.json（零依赖平台启动别名壳）、`web/static/js`（站点浏览器端资产）与 `skills/`（沙箱平台工具链，非项目代码）。

## 数据备份

三类数据、三种保护机制：

- **`db/custom.db`（主数据，不入版本库）**：SQLite 处于 WAL 模式——在线备份用 `sqlite3 db/custom.db ".backup '备份文件.db'"`（一致性快照），或**停服后**直接拷贝文件；或后台「数据备份」页一键导出/导入 JSON（书籍超 **200 本**自动降级为仅元数据导出，大库用文件级备份）。整库丢失时重跑服务即自动重建空表 + 空库播种——**书籍/章节数据不可再生，务必例行备份**。
- **`web/covers/`（封面）**：已被平台 checkpoint **自动提交进 git**——沙箱重置后封面随仓库整体恢复，无需单独备份；自建部署迁移时随目录拷贝。
- **`worklog.md` / `agent-ctx/` / `docs/`（协作档案，git 追踪）**：跨 agent 协作总线、任务上下文与文档档案，git 内自带历史；退役部署链存于 `docs/archive/`。

## 免责声明

1. 本项目仅供**学习与研究**用途，**不得用于商业用途**。
2. 采集功能请仅用于你有权访问的目标站点，使用时请**遵守目标站点的服务条款/robots 协议**，合理控制访问频率，勿对目标站点造成干扰。
3. 通过本项目采集到的全部内容（文字/封面等）**版权归原作者及原网站所有**；请勿传播、转载或转售采集所得数据。
4. 因使用本项目而产生的任何法律问题与责任，由**使用者自行承担**；项目作者与贡献者不对任何滥用行为负责。
5. 若你是站点所有者、不希望被本项目内置规则采集，请提交 issue 说明，我们会在后续版本移除对应规则。
