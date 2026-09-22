# mhgl · 小说聚合站（全栈 Golang 单体）

> 🏗️ **R55 架构声明**：项目已整体迁移为 **Golang 单体**——Web 服务/前台站群/后台管理/REST API/
> 采集引擎/调度器编译为**一个 Go 二进制**（监听 :3000），Node.js/Next.js 运行时退役。
> 数据库沿用 SQLite 原文件（零迁移）。TS 时代源码保留于 `src/`（仅作历史参照，不再参与运行时）。
>
> 📖 **安装部署教程（R55 Go 单体版）**：**[docs/INSTALL-GUIDE.md](./docs/INSTALL-GUIDE.md)**（上一版 Next.js 教程留档 docs/INSTALL-GUIDE-r52.bak.md）
> 📋 **功能对齐矩阵**：**[agent-ctx/go-migration/PARITY.md](./agent-ctx/go-migration/PARITY.md)**

## 架构（R55）

```
一个二进制 (.build/mhgl)  →  :3000
├── cmd/server            装配入口(config/store/recovery/manager/http)
├── internal/store        SQLite 直连(Prisma 格式兼容, 单写者 WAL)
├── internal/crawl        采集引擎(原 crawler-go 并入: 反反爬/解析/编排 + bridge 直连持久化 + 调度)
├── internal/api          /api/admin/** + /api/public/** JSON 面
├── internal/web          前台 SSR(aijjxs 主题) + 后台管理(html/template + 原生 JS/CSS)
└── internal/auth         HMAC Cookie 鉴权(与旧栈同源, 会话无缝)
```

## 功能特性

- **采集引擎**（`src/lib/crawl/`）：规则四段（列表/详情/目录/正文）解析、CSS/正则/JSON 字段提取、`{page}`/`{offset:N}` 占位符翻页、编码识别（GBK 等）、正文清洗（广告模式/去壳页）、分卷排序、并发限速 + HostGate、**规则级出口代理池**（http/socks5h 逗号分隔多条轮换≤10，仅国内 IP 可达站点如 77shuku.info 必配）、封面本地化（webp）。
- **多引擎反反爬降级链**：native HTTP（curl 链）→ 代理池轮换 → 中继桥（3011）→ Scrapling 桥（3012，static/stealthy/playwright）→ Obscura 本地 chromium 反检测渲染，按站点防护级别自动降级。
- **站级签名/解密代理**：对 token/签名/AES 类站点以外置 mini-service 承载（见下表），引擎 `tokenUrl` 钩子对接。
- **管理端**：站点规则 CRUD + 在线测试、**内置规则库一键导入**（**35 条**实测站点规则，幂等覆盖可恢复出厂）、任务（单书/批量/实时采集/定时增量 autoRefresh）、书籍/章节管理（批量删除等不可恢复操作带输入确认门槛）、TXT 下载、站群与 SEO（伪静态 6 预设、站点级「自动生成 TDK」一键铺底）、统计看板（仪表盘卡片可开关显示）、**违禁词过滤**（对采集入库内容做屏蔽词/敏感词过滤，mask/remove 双模式）、**规则极限校准**（对模拟源站实测安全并发与速率，一键写回推荐参数）。
- **前台**：多主题站群（**8 配色 × 8 风格 × 8 布局 = 512 套组合主题 + 9 套精选**，含笔趣阁经典、霹雳书屋仿站、久久小说 aijjxs 复刻；非法主题 ID 自动回退默认主题）、阅读页、搜索、sitemap、**6 预设伪静态 URL**（纯数字/字母数字/目录式/无后缀/紧凑双段/动态查询，宽容解析永不断链）、**全链自动 TDK**（标题/描述/关键词 + canonical + JSON-LD 逐页生成，伪静态直达页 SSR 直出）。
- **任务可靠性**：任务状态机（pending/running/paused/stopped/done/error）、暂停续采、服务重启自动回收 running → paused 不丢进度、增量重采跳过已采、dev 模式 OOM 自愈守护（`.zscripts/dev-watchdog.sh`）。

## 技术栈

| 层 | 技术 |
| --- | --- |
| 层 | 技术（R55 Go 单体） |
| --- | --- |
| 语言/运行时 | Go 1.24+（单二进制, 无 Node 依赖） |
| HTTP | stdlib net/http（Go 1.22+ 方法+通配路由） |
| 数据库 | modernc.org/sqlite（纯 Go 驱动, 无 cgo）+ SQLite 单文件 |
| 模板/UI | html/template + 手写 CSS/原生 JS（前台 aijjxs 主题 + 深色管理台） |
| 采集引擎 | 原 crawler-go 引擎代码级并入（goquery 解析 + R51~R54 反反爬体系全量保真） |
| 部署 | 裸机 systemd / Docker 多阶段（golang 构建 → alpine 运行） |

## 快速开始

**Docker 一键安装（生产推荐）**——前置：一台能装 Docker 的 Linux 服务器（首次构建约需 4GB 内存）：

```bash
git clone https://github.com/u4399com-beep/heis.git novel-system
cd novel-system
bash install.sh
```

**本地开发（Bun 路线）**——前置：安装 [Bun](https://bun.sh)（v1.3+）：

```bash
bun install                          # 安装依赖
cp .env.example .env                 # 配置(数据库/后台密码等, 注释齐全); 改 ADMIN_PASSWORD!
bun run db:push                      # 建表(幂等, 首次自动创建 db/custom.db)
bash .zscripts/dev.sh                # 一键启动(主应用 + 8 个 mini-service, 日志见 .zscripts/)
```

| 地址 | 用途 |
| --- | --- |
| `http://localhost:3000/` | 后台管理（规则/任务/书籍/章节） |
| `http://localhost:3000/?view=home` | 前台站点（书城/阅读/搜索） |

> 🔐 后台默认密码 `audit-fix-2025`（dev 模式登录页会显示提示与一键填入）；**生产务必在 `.env` 设置 `ADMIN_PASSWORD` 强密码**。装完去哪做：后台导入规则 → 建站点 → 建任务，全流程见 [docs/INSTALL-GUIDE.md](./docs/INSTALL-GUIDE.md) 第 7~8 章。

## mini-services 支撑服务（8 个，端口 3010~3017）

| 端口 | 服务 | 用途 | 启动 |
| --- | --- | --- | --- |
| 3010 | `bqg713-proxy` | 笔趣阁 bqg713 AES-token 外置转换代理（`/rewrite` `/token`） | `cd mini-services/bqg713-proxy && bun run start` |
| 3011 | `fetch-relay` | bun fetch 中继桥（TLS 指纹出路，`RequestInit.proxy`） | `cd mini-services/fetch-relay && bun run start` |
| 3012 | `scrapling-bridge` | Scrapling 桥：static(curl_cffi)/stealthy(patchright 解 CF 挑战)/playwright 三模式 | `cd mini-services/scrapling-bridge && bun run dev`（需先按其说明装 Python venv） |
| 3013 | `qimao-proxy` | 七猫官方 API 逐请求 MD5 双签名 + 正文 AES 解密 | `cd mini-services/qimao-proxy && bun run start` |
| 3014 | `deqixs-proxy` | 得奇小说网正文三参数动态签名链路代理 | `cd mini-services/deqixs-proxy && bun run start` |
| 3015 | `xjp-proxy` | 新键盘小说网 var c 双层正文解密代理 | `cd mini-services/xjp-proxy && bun run start` |
| 3016 | `cloak-browser` | 独立反检测浏览器服务（puppeteer-extra stealth 三档隐身；采集引擎未把它接入自动降级链，属可选增强） | `cd mini-services/cloak-browser && bun run dev`（需本机 chromium） |
| 3017 | `qidian-proxy` | 起点中文(镜像API)目录签名载荷解码 + 正文转换代理（仅起点规则正文链路需要，正文还需配置 QD_YWKEY/QD_YWGUID 凭证） | `cd mini-services/qidian-proxy && bun run start` |

- 主应用**不启动任何小服务也能正常跑**：内置 35 条规则绝大多数可直连采集，个别站点规则依赖对应代理小服务；依赖对照与排错见 [docs/INSTALL-GUIDE.md](./docs/INSTALL-GUIDE.md) 第 6.7 节；
- **Docker 部署时 5 个 bun 代理（3010/3011/3013/3014/3015）已随主容器共置**，零配置；仅 Python 版 `scrapling-bridge` 不进默认镜像（可选增强，`--profile stealthy`，见 DEPLOY.md）；`cloak-browser`(3016) 与 `qidian-proxy`(3017) 不在容器内共置，本地开发按需启动；
- ⚠ 请勿把 3010~3017 端口暴露到不受信任的网络（`fetch-relay` 与 `scrapling-bridge` 源码钉死仅绑 127.0.0.1）。

## 目录结构

```
prisma/schema.prisma        # 数据模型: Category/Site/Rule/Task/Book/Chapter 等
db/custom.db                # SQLite 运行时数据(不入版本库, ★备份它)
data/                       # 封面 covers/、TXT 下载产物(不入版本库)
src/app/                    # Next.js App Router: /api/admin|public|download + 前台页面
src/components/             # 业务组件(admin/ + public/) + ui/(shadcn 完整组件库)
src/lib/crawl/              # 采集引擎(fetcher/parser/runner/cleaner/storage/obscura/builtin-rules…)
src/lib/auth.ts             # 后台鉴权(ADMIN_PASSWORD + HMAC 会话)
mini-services/              # 上表八个支撑服务(各自独立 package.json)
.zscripts/                  # dev.sh 一键启动 / dev-watchdog.sh OOM 自愈守护 / 运行日志
scripts/                    # seed.ts 演示数据 / seed-rule-*.ts 站点规则种子 / verify-* 质量资产
docker/                     # 自动填充引导: autofill.mjs + autofill-rules.json(9 站点清单)
docs/                       # INSTALL-GUIDE.md 小白教程 / rule-limits.md 规则手册 / images/ 截图
Dockerfile docker-compose.yml install.sh docker-entrypoint.sh   # 生产部署(见 DEPLOY.md)
```

### 常用命令（package.json）

| 命令 | 作用 |
| --- | --- |
| `bun run dev` | 开发模式启动（端口 3000，日志 tee 进 dev.log） |
| `bun run build` / `bun run start` | 生产构建 / 生产启动（standalone，日志 tee 进 server.log） |
| `bun run db:push` | 同步数据库结构（幂等；内置 `--accept-data-loss`，升级前先备份） |
| `bun run db:generate` / `db:migrate` / `db:reset` | Prisma Client 生成 / 迁移 / ⚠清空重建（危险，生产禁用） |
| `bun run lint` + `bunx tsc --noEmit` | 质量门（必须 0 错误 0 警告 / 零类型错误） |

### scripts/ 约定

- `verify-ss-a-docker.ts` / `verify-kk-b-docker.ts` / `verify-ll-a-docker.ts`：三套 Docker 断言资产（断言计数 + `process.exit` 码），CI 级质量关，长期保留。
- `seed-rule-*.ts`：单站真实采集规则幂等入库脚本；`gen-builtin-rules.ts`：从各 seed-rule-* 汇总生成 `src/lib/crawl/builtin-rules.ts`（管理端「内置规则库」对话框的 **35 条**数据源）。
- `seed.ts`：全新库演示数据种子（分类 15 / 默认站点 / 示例规则 3 条 / 演示书 6 本，空库守卫，可重复执行）。
- `ratelimit-site.ts`：本地模拟源站（规则极限校准的探测目标，端口 3040）。
- `archive/`：历史轮次验证脚本归档（只移不删，不参与 tsc/lint 质量门），见 `archive/README.md`。

## 数据备份

本地模式下数据全部在 `db/custom.db` 与 `data/`：停掉服务后直接拷贝这两个目录即可；后台「数据备份」页支持一键导出/导入 JSON（书籍超 **200 本**自动降级为仅元数据导出，大库用文件级备份）。Docker 模式见 [DEPLOY.md](./DEPLOY.md) 第五节。

## 免责声明

1. 本项目仅供**学习与研究**用途，**不得用于商业用途**。
2. 采集功能请仅用于你有权访问的目标站点，使用时请**遵守目标站点的服务条款/robots 协议**，合理控制访问频率，勿对目标站点造成干扰。
3. 通过本项目采集到的全部内容（文字/封面等）**版权归原作者及原网站所有**；请勿传播、转载或转售采集所得数据。
4. 因使用本项目而产生的任何法律问题与责任，由**使用者自行承担**；项目作者与贡献者不对任何滥用行为负责。
5. 若你是站点所有者、不希望被本项目内置规则采集，请提交 issue 说明，我们会在后续版本移除对应规则。
