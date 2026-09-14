# DEPLOY.md — 部署专篇（生产向）

> 🚀 **零基础首次部署？** 先看图文教程 **[docs/INSTALL-GUIDE.md](./docs/INSTALL-GUIDE.md)**（手把手：Bun 本机直跑与 Docker 双路线 + 首次登录 + 建任务采集 + 21 条新手 FAQ）。本文是**生产部署与运维手册**：部署方式选型、Docker 交付物全部细节、进程守护、环境变量权威速查、升级备份、安全加固与深度 FAQ，供部署前选型与部署后日常查阅。

> **验证状态（诚实声明）**：本套 Docker 交付物（Dockerfile / docker-compose.yml / install.sh /
> docker-entrypoint.sh）已通过两层验证：
> ① 语法与结构层自动化验证（`bun run scripts/verify-kk-b-docker.ts`：Dockerfile 分层/COPY 顺序/
>    EXPOSE、compose 键、脚本 `bash -n`/`sh -n` 语法、幂等与安全分支等数十项断言）；
> ② **ll 轮等价模拟生产验证**（`bun run scripts/verify-ll-a-docker.ts`）：因交付机器无 Docker
>    daemon（无 root），按 Dockerfile 逐命令在隔离目录**真实执行**了等价构建流程 —— bun install →
>    prisma generate → `next build`(standalone) → 裁剪生产依赖 → 按 runner 布局组装 →
>    容器 ENV 下运行 entrypoint（`prisma db push` 首建 + 幂等复跑 + 容错分支）→ `node server.js`
>    生产模式启动 → compose 同款 healthcheck 探活 → 首页/公开 API/管理 API/sitemap 端到端全 200。
>    实测确认了内存需求（Turbopack 构建峰值超 2GB，见下）；真实 Docker 构建的差异点仅剩基础镜像
>    拉取与 COPY 合并语义（模拟已按合并语义对齐）；
> ③ 自动填充链路 e2e（ss-a，对 dev server 全流程实测）：DRY_RUN 意图打印 / 规则幂等导入 /
>    建「自动填充·」任务并开跑 / 状态机续跑 / 幂等二连；结构断言见 `scripts/verify-ss-a-docker.ts`
>    （Dockerfile/entrypoint/compose/install.sh/autofill/构建源加速/基础镜像预拉兜底/加速器自检/镜像站清单/set-u 加固等十二段 106 项，实跑 106/106 ALL PASS）。

---

## 一、部署方式选型（先选路再动手）

| 方式 | 适合谁 | 内存要求 | 运维成本 | 入口 |
| --- | --- | --- | --- | --- |
| **A. Docker 一键**（推荐生产） | 想要开机自启、崩溃自动拉起、免环境折腾 | 构建 ≥4GB；运行期很小 | 最低（`install.sh` 幂等） | `bash install.sh` |
| **B. Docker 手动** | 想看每一步 | 同上 | 低 | `docker compose up -d --build` |
| **C. 本机直跑（Bun）** | 已装 Bun、需要 3012/3016/3017 全套 mini-service 或调试引擎 | 构建 ≥4GB | 中（自管进程守护） | `bun run build && bun run start` |
| D. 开发模式 | 本地试玩/跟着小白教程走 | dev 编译尖峰实录 2.2GB+，建议 4GB | 高（不适合生产） | `bash .zscripts/dev.sh`（见教程 6.2） |

三种部署**共用同一套数据形态**：SQLite 单文件 + `data/` 目录；业务数据恒为 `db/custom.db` 与 `data/`（Docker 下挂载为宿主机 `./db`、`./data`），换部署方式 = 搬这两个目录。

硬件基线：**4GB 内存 / 10GB 磁盘 / x86_64 或 arm64**（镜像在部署机现场构建，自动适配架构；2GB 机器构建会被 OOM 杀，需加 swap 或走 Docker + swap）。

---

## 二、Docker 生产部署（推荐路线）

### 2.1 一键安装

```bash
# 1) 拿到代码（任选其一）
git clone https://github.com/u4399com-beep/heis.git novel-system && cd novel-system
# 或者：把整个项目目录(含 Dockerfile/docker-compose.yml/install.sh)拷到服务器上

# 2) 一键安装：自动检测 Docker → 构建 → 启动 → 等健康检查 → 打印访问地址
bash install.sh
```

脚本会自动做这些事：

1. 检测 Docker 与 Docker Compose；**没有则询问你是否自动安装**
   （安装源多级自动切换：官方 `get.docker.com` → 阿里云 → 清华 → 中科大 —— 国内服务器官方源
   连不通时无需任何配置，脚本自动改用国内镜像站安装 Docker + compose 插件；
   服务器缺 gpg 时自动补装 gnupg 或改走免 gpg 的 `.asc` 密钥写 Docker 源（详见 FAQ 第 15 条）；
   macOS 给出 Docker Desktop 安装指引）；
2. 国内网络自适应：自动把 Docker Hub 拉取加速器合并写入 `/etc/docker/daemon.json` 并重启 docker，
   基础镜像直指可达镜像站并构建前预拉兜底（失败自动换站重试）；
   构建期依赖源（npm/pip/apt/playwright）同步切国内经 compose build args 注入；
   GitHub 克隆直连失败自动走加速代理（详见 FAQ 第 11 条）；
   未安装 git 自动补装（apt/dnf/yum），git 不可用或克隆全败时自动改走压缩包下载兜底（详见 FAQ 第 14 条）；
3. 预检端口 3000 占用情况；
4. `docker compose up -d --build` 构建并启动；
5. 轮询容器健康检查（最长等 5 分钟），失败时打印最近 50 行日志与中文排查清单；
6. 成功后打印访问地址（本机 + 局域网 IP）。

**重复执行 `bash install.sh` 是安全的（幂等）**：已有容器会被自动重建，数据在 `./db`、`./data` 中不受影响。

远程一键（脚本直链方式，需要仓库可公开访问并填 `REPO_URL`）：

```bash
curl -fsSL https://raw.githubusercontent.com/u4399com-beep/heis/main/install.sh \
  | REPO_URL=https://github.com/u4399com-beep/heis.git bash
```

> 管道执行（`curl | bash`）模式下无法交互提问：若缺少 Docker，脚本会直接打印安装指引后退出。

### 2.2 手动部署

前置条件：已安装 Docker 20.10+（含 compose 插件，`docker compose version` 能出版本号）。

```bash
cd <项目目录>
docker compose up -d --build      # 构建镜像并后台启动
docker compose ps                 # STATUS 列出现 (healthy) 即就绪
```

访问 `http://localhost:3000` 即可。

容器首启时入口脚本会自动执行 `prisma db push`（幂等）：
- 全新部署：自动创建 `db/custom.db` 并建好全部表；
- 重复重启：库结构已一致则直接通过，**不会报"表已存在"，也不会动已有数据**。

### 2.3 容器以非 root 运行（安全加固，注意属主）

镜像内 `USER app` (uid=1001, gid=1001) 让容器进程**非 root**运行，避免「容器逃逸 → 宿主 root」的攻击面。代价是：bind mount 的 `./db`、`./data` 目录在宿主机上若属主不匹配，容器内 app 用户没有写权限 → `prisma db push` 失败（错误形态：`SQLITE_READONLY` 或 `[警告] 数据库结构同步失败`）。

**首启前请先在宿主机执行一次（幂等）：**

```bash
sudo chown -R 1001:1001 ./db ./data
# 没有就创建（首次部署时 docker compose up 也会自动建空目录）
mkdir -p ./db ./data
sudo chown -R 1001:1001 ./db ./data
```

> 升级到 1-c 版本后**第一次 `docker compose up`** 也需要重跑一次这条命令 —— 历史部署的 `./db`、`./data` 可能仍属 root。entrypoint 启动时会自检：若 `/app/db` 不可写，docker logs 顶部会看到 `[初始化] [警告] /app/db 不可写` 提示和具体 chown 命令。

不希望改属主？两个等价替代（**均不推荐**，会回退 root 运行态）：改 `docker-compose.yml` 加 `user: "0:0"`，或删 Dockerfile 的 `USER app` 行。

### 2.4 自动填充：装完即有书（默认开启）

安装完成、服务健康检查通过后，容器内的引导脚本（`docker/autofill.mjs`）会**自动**：

1. 把 7 个实测站点的采集规则幂等导入数据库（番茄小说聚合API、七猫官方API、得奇小说网、八零电子书、精华书阁、天天看小说、笔趣阁bqg713；同名规则已存在则**跳过，绝不清空/覆盖你改过的规则**）；
2. 为每个站点创建一条「自动填充·」前缀的单书采集任务并自动开跑——首次跑完约 20~40 分钟内，前台 `/?view=home` 就会有真实书籍与正文可读；
3. 每条任务完成后每 30 分钟自动增量续采（autoRefresh），持续保持内容更新；容器重启后未完成的任务自动续跑（已完成的不会重跑）。

```bash
docker compose logs -f | grep 自动填充   # 引导日志（[自动填充] 前缀）
docker compose logs -f                    # 全部日志（含各采集代理）
# 或打开后台 http://<IP>:3000/ 的「采集任务」页看实时进度
```

常用开关（重启容器后生效）：

```bash
AUTO_FILL=0 bash install.sh                                  # 关闭自动填充
AUTO_FILL_RULES=fanqie,qimao bash install.sh                 # 只自动填充指定站点
# 等价: 编辑 docker-compose.yml 的 environment 后 docker compose up -d
```

> 站点 key 对照：`fanqie`(番茄) / `qimao`(七猫) / `deqixs`(得奇) / `80ge`(八零电子书)
> / `jhssd`(精华书阁) / `ttkan`(天天看) / `bqg713`(笔趣阁) / `pili`(霹雳书屋，
> 默认不参与——依赖可选 scrapling 桥，见第五节) / `xjp`(新键盘小说网，默认不参与——
> 单书 6254 章体量大，需时加 `AUTO_FILL_RULES=...,xjp` 启用)。想采集更多书，装完在后台
> 「采集任务」里用任意规则再建任务即可（内置规则库共 27 条实测规则，一键导入，见教程 8.1）。

### 2.5 默认入口与密码

| 地址 | 用途 |
| --- | --- |
| `http://<IP>:3000/` | 后台管理 |
| `http://<IP>:3000/?view=home` | 前台站点（书城/阅读/搜索） |

> ⚠ 密码来源唯一：`ADMIN_PASSWORD` 环境变量。未设置时回落编译期默认密码 `audit-fix-2025` 并在启动日志给出 `[auth] ADMIN_PASSWORD 未设置` 警告 —— **生产务必在 `.env` 设置强密码**（compose 会自动透传宿主机 `.env` 的该项进容器）。改完 `docker compose up -d` 重建生效，旧会话自动失效。前台对全网公开；生产建议放内网，或前面加一层反向代理做 IP 白名单 / Basic Auth。

### 2.6 环境变量速查（权威清单 = `.env.example`）

权威清单永远是项目根目录的 **`.env.example`**（每个变量都带中文注释）；`cp .env.example .env` 后按需修改。`docker-compose.yml` 已内置透传进容器的只有核心几项，其余变量属脚本级或本地开发级。

**核心鉴权与自动填充（compose 已透传进容器）**

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `ADMIN_PASSWORD` | 空 → 回落 `audit-fix-2025` | 后台登录密码。**生产必改**；未设置时启动日志有警告。改完重建容器生效 |
| `SESSION_SECRET` | 空 → 编译期固定常量 | 登录会话签名密钥。生产建议设置独立随机长串 |
| `AUTO_FILL` | `1` | 装完自动导入站点规则并开跑任务；`=0` 关闭 |
| `AUTO_FILL_RULES` | `fanqie,qimao,deqixs,80ge,jhssd,ttkan,bqg713` | 参与自动填充的站点 key 清单 |
| `DATABASE_URL` | `file:/app/db/custom.db` | 容器内由 compose 改写指向 `/app/db`（宿主机 `./db` 卷），无需手动设置 |

**install.sh 一键脚本读取（非 Docker 部署可忽略）**

- 国内加速：`USE_CN_MIRROR`（总开关，空=自动探测/`1` 强制/`0` 禁用）、`REGISTRY_MIRRORS`（加速器清单覆盖）、`SKIP_REGISTRY_MIRROR=1`（不动 daemon.json）；
- 基础镜像手动指定：`BUN_IMAGE` / `NODE_IMAGE` / `PYTHON_IMAGE`；
- 构建期依赖源：`NPM_REGISTRY` / `PIP_INDEX_URL` / `DEBIAN_MIRROR` / `PLAYWRIGHT_DOWNLOAD_HOST`；
- 远程一键模式：`HOST_PORT`（端口预检）/ `WAIT_TIMEOUT`（健康检查等待秒数）/ `REPO_URL` / `INSTALL_DIR`。

**可选高级项（本地开发 / 特殊部署，缺省全部回落安全默认值）**

| 组 | 变量 | 用途 |
| --- | --- | --- |
| 多主机闸门 | `BRIDGE_KEY` | 共置 bun 代理的共享密钥（设后非 `/health` 请求需带 `X-Bridge-Key` 头，常量时间比较失败 401）；单机部署无需设置 |
| 采集引擎增强 | `FETCH_BINARY_RETRY` `FETCH_BODY_LEN_CHECK` `RETRY_AFTER_HONOR` `CHALLENGE_ESCALATE` `RESPONSE_SANITY` `FETCH_AL_POOL` `HOSTGATE_PACE_PROFILE` `PROXY_HEALTH_SCORING` | 反反爬增强开关，全部缺省关（`=1` 开启）；语义见 `.env.example` 注释 |
| 渲染链 | `OBSCURA_CONCURRENCY` `OBSCURA_DEVID` `CLOAK_DEVID` `CLOAK_UA_POOL` `FETCH_RELAY_URL` `SCRAPLING_BRIDGE_URL` | Obscura/cloak 隐身渲染与桥地址调优 |
| 起点中文代理 | `QD_YWKEY` `QD_YWGUID` `QD_UPSTREAM` | mini-services/qidian-proxy(3017) 的正文凭证与上游镜像（代理进程级变量，非主应用） |
| 中继桥调优 | `RELAY_MAX_INFLIGHT`（缺省 32） `RELAY_BLOCK_PRIVATE` | fetch-relay 自身并发上限与私网目标拦截 |
| 日志 | `LOG_LEVEL` | `debug` / `info`(prod 默认) / `warn` / `error` |

> 另注：`scripts/seed-rule-77shuku.ts` 支持两个**脚本级**变量 `CN_PROXY=<国内IP代理>` 与 `CN77_PROBE=1`——它们不是运行时环境变量，不进 compose；Docker 部署用户直接在管理端规则编辑器「反反爬设置 → 出口代理」里填代理即可（图文用法见教程 8.7）。

---

## 三、本机直跑生产部署（Bun 路线）

### 3.1 构建与启动

```bash
cd ~/novel-system
bun install            # 依赖（升级后重跑）
bun run db:push        # 建库建表（幂等；带 --accept-data-loss，升级前先备份）
bun run build          # 生产构建（Turbopack，峰值内存超 2GB，4GB 机器为底线）
bun run start          # 启动：NODE_ENV=production 运行 standalone server，日志 tee 进 server.log
```

### 3.2 进程常驻（三选一）

`bun run start` 前台运行，关掉 ssh 窗口就停。生产常驻三选一：

```bash
# ① nohup（最简单）：
nohup bun run start > server.log 2>&1 &
# 停止: ps aux | grep server.js → kill <PID>

# ② tmux / screen（可随时回前台看日志）：
tmux new -s novel      # 在 tmux 里跑 bun run start；Ctrl+B 然后 D 脱离；tmux attach -t novel 回来

# ③ systemd（开机自启，通用做法；按实际用户/路径改）：
# /etc/systemd/system/novel.service
#   [Unit]
#   Description=Novel System
#   After=network.target
#   [Service]
#   User=root
#   WorkingDirectory=/root/novel-system
#   ExecStart=/root/.bun/bin/bun run start
#   Restart=on-failure
#   [Install]
#   WantedBy=multi-user.target
# 启用: sudo systemctl daemon-reload && sudo systemctl enable --now novel
```

### 3.3 OOM 自愈守护（dev-watchdog）

背景与机制（详见教程 6.4）：dev 模式编译期内存尖峰（实录 2.2GB+）可触发系统 OOM 杀掉 next-server；项目自带 `.zscripts/dev-watchdog.sh`——**每 30 秒探测 `http://127.0.0.1:3000/`，仅当端口不可达时**才 `setsid bun run dev` 拉起新实例，绝不触碰健康实例（采集任务运行期零中断）。被杀后 ≤35 秒自动恢复。

```bash
# 启用（后台常驻）。⚠ 脚本内写死 /home/z/my-project，项目在别处先改脚本内路径
nohup bash .zscripts/dev-watchdog.sh >/dev/null 2>&1 &
```

定位说明：该守护主要服务于**开发模式**稳定性。生产模式的进程守护请优先用 3.2 的 systemd/`Restart=on-failure`，或 Docker 路线的 `restart: unless-stopped`（容器方案自带崩溃拉起，无需此脚本）。

### 3.4 mini-services 常驻

本机直跑路线下 mini-services **不会**自动拉起（那是 dev.sh/容器的行为）。用到哪个按需启动（目录名=服务名，长期运行用 `start`）：

```bash
cd mini-services/bqg713-proxy  && nohup bun run start >/dev/null 2>&1 & cd ../..
# 其余: fetch-relay(3011) qimao-proxy(3013) deqixs-proxy(3014) xjp-proxy(3015) qidian-proxy(3017)
# cloak-browser(3016) 用 bun run dev 启动（需 chromium）；scrapling-bridge(3012) 为 Python 可选桥（见第五节）
```

端口/用途/依赖规则对照表见教程 8.7（27 条内置规则中仅 5 条依赖对应代理）。

---

## 四、升级 / 回滚

```bash
# Docker 路线（推荐）：
cd ~/novel-system && git pull && bash install.sh    # 幂等重建，数据不受影响
# 等价手动: docker compose up -d --build

# 本机直跑路线：
cd ~/novel-system && git pull && bun install && bun run db:push
# 然后重启进程（systemd: systemctl restart novel；nohup: kill 旧 PID 后重跑）
```

- 升级前**先备份**（第五节）；
- Docker 路线容器首启自动做 `prisma db push` 增量同步（**刻意不带** `--accept-data-loss`，绝不静默毁数据；遇冲突性变更见 FAQ #4 的手动流程）；
- 本机直跑路线的 `bun run db:push` 自带 `--accept-data-loss`，升级前务必已备份；
- 升级后重启手动拉起的 mini-services；
- 回滚 = `git checkout <旧commit>` 后按同流程重建（数据目录不动）。

---

## 五、备份与恢复

数据全部在 `db/custom.db`（SQLite 单文件）与 `data/`（封面/下载产物）。两种方式：

**① 后台一键**：管理后台 → 数据备份 → 导出（JSON 全量快照）/ 导入恢复。

> ⚠ **大库降级阈值 = 200 本**（共享常量 `src/lib/backup.ts` 的 `BACKUP_BIG_BOOKS_THRESHOLD`，前后端同源）：书籍超过 200 本时导出自动降级为仅书籍元数据（不含章节正文），防止数百 MB JSON 撑爆内存，界面亮「大库模式」徽标。大库完整备份用方式②。

**② 文件级（最彻底）**：

```bash
docker compose down                 # 先停服（保证 SQLite 落盘一致）；直跑路线 kill 进程
cp -r db data /你的备份路径/         # 整体拷走
docker compose up -d                # 再启动
# 恢复: 目录放回原位再启动; Docker 用户注意属主: sudo chown -R 1001:1001 ./db ./data
```

---

## 六、安全加固清单（生产上线前过一遍）

| 项 | 状态/做法 |
| --- | --- |
| 后台密码 | ✅ 必做：`.env` 设强 `ADMIN_PASSWORD`（默认 `audit-fix-2025` 随仓库公开）+ 独立 `SESSION_SECRET` |
| 登录防爆破 | ✅ 内置：同 IP 60s 窗口最多 5 次（auth 层），超限返回 Retry-After |
| 容器非 root | ✅ 内置：`USER app`(uid 1001) + `cap_drop: ALL` + `no-new-privileges`（1-c 加固） |
| 日志轮转 | ✅ 内置：compose `json-file max-size=20m max-file=5` |
| 端口面 | ✅ 只暴露 3000；3010~3017 全部钉死 127.0.0.1，**勿映射公网**（`fetch-relay`/`scrapling-bridge` 源码层仅绑回环） |
| 网络位置 | 建议：后台放内网或前置反向代理（Nginx/Caddy）做 IP 白名单 / Basic Auth / HTTPS |
| 数据备份 | 按 3.1~3.3 建立例行备份（后台导出 + 文件级双轨） |
| 采集合规 | 控制频率（慢速档起步）、遵守目标站 robots/服务条款、仅采集有权访问的站点；免责声明见 README |

---

## 七、mini-services 在 Docker 部署中的定位

**结论：5 个 bun 站点代理已随主容器共置（零配置）；仅 Python 版 scrapling-bridge 默认不启用。**

- `bqg713-proxy`(3010) / `fetch-relay`(3011) / `qimao-proxy`(3013) / `deqixs-proxy`(3014) / `xjp-proxy`(3015) 已打进主镜像，由容器入口脚本（docker-entrypoint.sh）自动拉起，自动填充规则内的 `127.0.0.1:301x` 即容器内回环，装完即用、无需任何配置；
- 核心采集能力由**内置 native HTTP 采集引擎**完整承担（规则四段解析、编码识别、翻页、正则清洗、并发限速等全功能），不依赖代理也可直连采集大部分站点，代理仅服务签名/解密类站点；
- `scrapling-bridge`(3012, Python) 是**可选增强**（个别强 JS 渲染/CF 挑战站备用路径）：镜像含 Python 与浏览器内核（GB 级），默认**不构建不启动**；确需时 `docker compose --profile stealthy up -d --build`（经 network_mode 与主容器共享 127.0.0.1 回环），并以 `AUTO_FILL_RULES=...,pili` 启用霹雳书屋自动填充；或在宿主机按本地开发模式跑（见教程 8.7），Docker 容器与宿主机服务互不干扰；
- `cloak-browser`(3016) 与 `qidian-proxy`(3017) **不在容器内共置**（前者需 chromium 环境，且当前采集引擎未把它接入自动降级链——它是独立增强服务，健康页列为可选监控；后者仅起点规则需要，规则内 `127.0.0.1:3017` 写死了容器内回环地址）：纯 Docker 部署下容器内引擎无法访问宿主机回环 → 起点规则在容器内部署的目录/正文段会失败/降级（其余站点不受影响）；需要时改用本机直跑（Bun）部署并在宿主机 `cd mini-services/<目录> && bun run start`（qidian 正文还需 `QD_YWKEY`/`QD_YWGUID` 凭证）。
- 8 个服务的端口/用途/依赖规则对照表见 **docs/INSTALL-GUIDE.md 8.7 节**。

---

## 八、运维 FAQ（深度条目）

新手向 21 条速查（端口占用/登录/乱码/采集 0 本/OOM 自愈/时区等）见 **docs/INSTALL-GUIDE.md 第 10 章**。本节收录 Docker 与生产运维深度条目。

### 1. 端口 3000 被占用了怎么办

编辑 `docker-compose.yml`，把 ports 左侧（宿主机端口）改成空闲端口，右侧容器端口**不要动**：

```yaml
    ports:
      - "8080:3000"     # 改成这样 → http://<IP>:8080 访问
```

然后 `docker compose up -d` 重建。查端口占用：`lsof -i :3000` 或 `ss -ltnp | grep 3000`。

### 2. 数据库结构变更（需要删数据的破坏性变更）

入口脚本**刻意不带** `--accept-data-loss`，绝不静默销毁数据。若日志出现 `[警告] 数据库结构同步失败`：

```bash
docker compose down
cp -r db db.bak.$(date +%F)                              # 1) 先备份！
docker compose run --rm --entrypoint node novel-system \
  node_modules/prisma/build/index.js db push \
  --schema prisma/schema.prisma --accept-data-loss       # 2) 明确确认后强制同步
docker compose up -d
```

> 注意 `--entrypoint node` 不能省：镜像入口是 `docker-entrypoint.sh`（会做幂等 db push 并拉起服务），不覆盖入口的话 `run` 后附的命令不会被执行。

### 3. 怎么看日志 / 重启 / 卸载

```bash
docker compose logs -f              # 跟踪日志（应用日志走 docker logs，不写文件）
docker compose logs --tail 100      # 最近 100 行
docker compose restart              # 重启
docker compose down                 # 停止并删除容器（数据保留）
docker compose down --rmi local     # 连同本机构建的镜像一起清理（卸载）
```

### 4. 健康检查一直 starting / unhealthy

```bash
docker compose ps                   # 看状态
docker compose logs --tail 100      # 看报错
```

- 启动慢：`start_period` 已给 40 秒预热，慢机器可再调大；
- 日志出现 `[警告] 数据库结构同步失败`：见上面第 2 条；
- `/app/db` 不可写属主警告：见 2.3 节 chown。

### 5. 首次构建很慢 / 失败 / `Killed`

- 首次构建要下载依赖并编译前端，**3~10 分钟属正常**；重复构建走缓存会快很多；
- 内存不足 2GB 可能被 OOM 杀掉（日志出现 `Killed`）：Dockerfile 已放宽 node 堆上限，再不行就加大机器内存或加 swap；
- 拉取基础镜像慢：一键脚本已自动配置三层保障（加速器 + 基础镜像直指可达镜像站 + 预拉兜底自动换站，见第 8 条）；手动部署 `USE_CN_MIRROR=1 bash install.sh`。

### 6. 无权限操作 Docker（permission denied）

```bash
sudo bash install.sh                       # 临时方案：sudo 执行
sudo usermod -aG docker "$USER"            # 长期方案：加入 docker 组
# 然后退出重新登录生效
```

### 7. macOS / Windows 能用吗

- macOS：装 Docker Desktop 后正常使用 `bash install.sh`；
- Windows：建议在 WSL2 (Ubuntu) 里执行，Docker Desktop 开启 WSL 集成即可。

### 8. 国内网络部署（安装 Docker / 拉镜像 / 构建依赖全链路加速）

一键脚本对国内服务器做了全链路自适应，默认零配置：

| 环节 | 脚本行为 | 可用开关 |
| --- | --- | --- |
| 安装 Docker | 官方 `get.docker.com` 探测不通（4 秒快速失败）→ 自动改用阿里云/清华/中科大镜像站安装 `docker-ce` 与 compose 插件 | `USE_CN_MIRROR=1` 强制国内 / `=0` 禁用 |
| 拉取基础镜像 | 三层保障：① 加速器——把 Docker Hub 加速器**合并**写入 `/etc/docker/daemon.json`（保留已有配置）并重启 docker，写完自检 `docker info` 是否真显示 `Registry Mirrors`；② 直指镜像站——`oven/bun`、`node`、`python` 基础镜像**直指探测可达的镜像站**构建（BuildKit 拉取对加速器兼容不稳，直指最稳）；③ 预拉兜底——构建前先预拉 `oven/bun` 与 `node`，失败自动**换站重试且换成的站即构建用站**；国内模式若未探测到任何镜像站，再用官方名 `docker pull` 预拉兜底 | `REGISTRY_MIRRORS=地址1,地址2` 覆盖清单 / `SKIP_REGISTRY_MIRROR=1` 不改动 daemon.json；`BUN_IMAGE` / `NODE_IMAGE` / `PYTHON_IMAGE` 手动覆盖（非 root + sudo 路径同样生效） |
| GitHub 克隆 | 直连失败自动尝试 ghfast.top / gh-proxy.com / ghproxy.net 加速代理（克隆后 origin 指回官方地址） | 无需配置 |
| 构建期依赖 | `bun install`→npmmirror、`pip`→阿里云 PyPI、apt→阿里云 Debian、playwright 浏览器内核→npmmirror（经 compose build args 注入，留空=海外默认） | `NPM_REGISTRY` / `PIP_INDEX_URL` / `DEBIAN_MIRROR` / `PLAYWRIGHT_DOWNLOAD_HOST` 手动覆盖 |

> - 内置镜像站候选共 **7 站**（加速器写入与镜像站直指同源）：`docker.m.daocloud.io` / `docker.1ms.run` / `docker.aityp.com` / `docker.xuanyuan.me` / `hub.rat.dev` / `docker.1panel.live` / `docker.hlmirror.com`，脚本按 `/v2/` 探活**依序选用首个可达站**；
> - `DEBIAN_MIRROR` 只传**主机名段**（如 `mirrors.aliyun.com`），不要带 `https://`；
> - 手动配置加速器：`sudo tee /etc/docker/daemon.json <<< '{"registry-mirrors":["https://docker.m.daocloud.io"]}' && sudo systemctl restart docker`；
> - 构建源加速对可选的 scrapling 镜像（`--profile stealthy`）同样生效。

### 9. 报错 `install.sh: line 480: USE_CN_MIRROR: unbound variable`（或任何 `unbound variable`）

**原因**：服务器上跑的是**旧版脚本**。旧版在 `set -u` 严格模式下，二次运行、检测到 Docker 已安装时引用了从未赋值的 `USE_CN_MIRROR`，直接崩溃；新版脚本已把该变量预初始化为空串，此故障不会再出现。

**处理（三选一）**：

```bash
# ① 推荐：进项目目录更新脚本后重跑
cd novel-system && git pull && bash install.sh

# ② 删目录重新克隆（先备份 ./db ./data 数据目录！装完放回即可）
rm -rf novel-system
curl -fsSL https://raw.githubusercontent.com/u4399com-beep/heis/main/install.sh \
  | REPO_URL=https://github.com/u4399com-beep/heis.git bash

# ③ 应急热修（一行补上变量预初始化，其余逻辑不变，改完直接重跑）：
sed -i 's/^set -euo pipefail/set -euo pipefail\nUSE_CN_MIRROR="${USE_CN_MIRROR:-}"/' install.sh
bash install.sh
```

### 10. 加速器已写入 daemon.json，但构建时仍卡在拉取镜像

Docker 的构建器 **BuildKit** 拉取基础镜像时对 `daemon.json` 的 `registry-mirrors` 兼容不稳（可能仍直连 `docker.io`）。一键脚本已做三层兜底（直指镜像站 → 预拉换站 → 官方名走加速器），正常无需处理。自检加速器是否真生效：

```bash
docker info | grep -A3 Mirrors
# 出现 "Registry Mirrors:" 段=已生效；无输出=daemon.json 未生效
```

若构建仍卡在拉取，手动指定镜像站后重跑：

```bash
BUN_IMAGE=docker.m.daocloud.io/oven/bun:1 \
NODE_IMAGE=docker.m.daocloud.io/library/node:22-slim \
bash install.sh
```

### 11. 报错 `git: command not found`（服务器没装 git）

新版 install.sh 已内置三层处理（检测到缺 git 自动补装 → 补装失败自动改走压缩包下载 → 项目目录内运行根本不需要 git），正常无需手动干预。手动等价：

```bash
curl -fL https://github.com/u4399com-beep/heis/archive/refs/heads/main.tar.gz -o heis.tar.gz
tar -xzf heis.tar.gz && cd heis-main && bash install.sh
# 直连失败时在 URL 前加加速前缀（脚本内置同款回退）
```

> 附注：在已有项目目录内直接 `bash install.sh` 时，脚本本身**不需要 git**。

### 12. 报错 `gpg: command not found`（docker-ce 无安装候选）

Debian 12+ / Ubuntu 最小化系统常不预装 gpg，老版脚本写 Docker CE 源时硬依赖 `gpg --dearmor` 生成 keyring 导致失败。新版已内置三层降级（gpg 在场走原路径 → 缺失自动补装 gnupg → 补装失败改用免 gpg 的 `.asc` 密钥）。手动补装：`sudo apt-get install -y gnupg` 后重跑 `bash install.sh`。报错行里的 `/usr/bin/sqv`（trixie 新签名验证器）属正常现象。

### 13. 点「校准」提示「校准服务暂不可用」或探测全败

管理后台规则页的「校准 / 全量校准」需要先有一台**模拟源站**（校准默认对 `http://127.0.0.1:3040` 发探测请求）：

```bash
# ① 模拟源站未启动 → 启动它（Docker 部署在宿主机上跑）
bun scripts/ratelimit-site.ts --port 3040 --profile standard

# ② 确认可达：/stats 应返回 JSON 计数
curl http://127.0.0.1:3040/stats

# ③ Docker 部署：容器内的 127.0.0.1 指容器自身而不是宿主机 →
#    校准对话框「高级」里把源站地址改成容器可达的宿主机地址（见第六节 6.4）
```

补充：校准档位与模拟源站 `--profile` 不一致时结果消息会带 ⚠ 提醒，建议两侧保持同档；对真实站点校准属真实请求行为，务必谨慎（见第六节 6.4 红线注意）。

---

## 九、规则极限校准（为每条规则实测安全的并发与速率）

管理后台「采集规则」页内置**极限校准**：校准引擎按规则的完整四段链路对「模拟源站」逐步加压（并发梯 1→2→3→4→6→8→10、间隔梯 2000→150ms），实测该规则在不同封禁策略下能承受的极限并发与最快节奏，并给出可直接落库的推荐参数。适合新规则上线前摸底、被 429/封禁困扰时重新定参。

### 9.1 入口与流程

| 入口 | 位置 | 形态 |
| --- | --- | --- |
| 单规则校准 | 规则行的「校准」按钮 | 对话框：选档位 → 开始 → 实时探测轨迹 → 结果卡；进行中可关闭对话框（后台继续，重开自动接续）或「取消校准」中止 |
| 全量校准 | 规则页工具栏「全量校准」 | 按所选档位逐条**串行**校准全部规则，进度 x/y，完成后逐条摘要 |

### 9.2 三档位（模拟源站封禁严格度）

| 档位 | 对应源站 profile | 封禁严格度 |
| --- | --- | --- |
| 宽松 | `lenient` | 封禁宽松（60s 窗 120 请求 / 2s 突发 12 请求起限），大步进探测，快速摸上限 |
| 标准（默认） | `standard` | 封禁中等（60s 窗 60 请求 / 2s 突发 6 请求），步进均衡，通用推荐 |
| 严格 | `strict` | 封禁严格（60s 窗 30 请求 / 2s 突发 3 请求），小步进保守探测，结果更稳妥；另含 UA 指纹检测 |

三档共用同一条封禁升级链：累计 429 达阈值 → 临时封禁 60 秒（403 + Retry-After）→ 解封后再犯 → 410 永久封。校准档位应与模拟源站 `--profile` 保持一致，不一致时结果消息会带 ⚠ 提醒。

### 9.3 校准产物与「应用推荐」

结果卡五格结论：

| 结论 | 含义 |
| --- | --- |
| 极限并发 | 并发梯实测能通过的最大并发 |
| 极限间隔 | 间隔梯实测的最小安全批间隔（ms） |
| 推荐线程 | 由极限并发外推的安全区间（threadMin~threadMax），建任务时手动填写 |
| 推荐间隔 | 由极限间隔外推的安全区间（intervalMin~intervalMax），建任务时手动填写 |
| 同站并发上限 hostGateLimit | 点「应用推荐」后**唯一自动落库**的参数 |

「应用推荐」语义：把 hostGateLimit 写入该规则的 `config.fetch.hostGateLimit`（采集引擎的同站并发闸门）；推荐线程/推荐间隔只展示不落库。结果同时持久化到 `Setting` 表（key=`calibration:<ruleId>`），重开对话框自动回显；每档探测在「探测轨迹」折叠表可查。一轮完整校准约 3~6 分钟（档间含冷却排空期，属正常节奏）。

### 9.4 模拟源站 scripts/ratelimit-site.ts

校准默认对本地模拟源站打，先启动它：

```bash
bun scripts/ratelimit-site.ts --port 3040 --profile standard   # profile ∈ lenient | standard | strict
```

- 页面结构与真实小说站四段同构（`/list` `/book` `/toc` `/chapter`），限流建模即 9.2 三档；
- `POST /reset`：清空全部 IP 计数与封禁状态（校准引擎对回环地址默认每轮自动重置；指向非回环地址时需手动重置）；
- `GET /stats`：观测计数（总请求/分状态码/窗口计数/封禁状态），本身豁免限流。

> **⚠️ 红线注意：模拟源站仅限本地/测试环境使用；对真实站点校准会真实请求源站，务必谨慎控制频率，可能触发封禁**（轻则 429 限流、重则 IP 被拉黑）。真实站点校准在对话框「高级」里改源站地址，校准前请确认你有权对该站点做此类探测。

**Docker 部署注意**：校准引擎跑在**容器内**，容器里的 `127.0.0.1:3040` 指容器自身——模拟源站在宿主机启动后，请在校准对话框「高级」把源站地址改成**容器可达的宿主机地址**（宿主机内网 IP，或 compose 网络网关，`docker network inspect <项目>_default` 可查 Gateway，形如 `http://172.18.0.1:3040`）。

规则字段与各参数的极限/推荐取值另见 `docs/rule-limits.md`（规则字段极限手册）。

---

## 十、交付物文件清单

| 文件 | 作用 |
| --- | --- |
| `README.md` | 项目门面：功能总览 / 10 行快速开始 / 目录结构 |
| `docs/INSTALL-GUIDE.md` | 零基础图文安装教程（主文档：12 章 + 21 条新手 FAQ + 附录速查） |
| `docs/rule-limits.md` | 规则字段极限手册 |
| `Dockerfile` | 多阶段构建：bun 构建 standalone → node:22-slim 运行（含 5 个共置代理与自动填充引导） |
| `docker-compose.yml` | 单服务编排：端口/数据卷/健康检查/自动重启/AUTO_FILL 注入（+ scrapling 可选 profile） |
| `docker-entrypoint.sh` | 容器入口：建目录 → 幂等 `prisma db push` → 拉起 5 代理 + 自动填充引导 → 启动 server |
| `.env.example` | 环境变量权威清单（鉴权/自动填充/镜像加速/引擎开关等，全部带中文注释），复制为 `.env` 使用 |
| `install.sh` | 零基础一键安装：装 Docker（多源自动切换+国内加速）→ 构建 → 等健康 → 自动填充状态 → 打印地址 |
| `docker/autofill.mjs` | 自动填充引导脚本：等服务健康 → 幂等导入规则 → 建「自动填充·」任务并按状态机开跑 |
| `docker/autofill-rules.json` | 自动填充站点清单（9 站：默认 7 站，pili/xjp 需 AUTO_FILL_RULES 显式加） |
| `Dockerfile.scrapling` | 可选构建：scrapling 桥镜像（`--profile stealthy`，含浏览器内核 GB 级） |
| `.dockerignore` | 控制构建上下文：运行时数据/依赖/Python 桥/scripts 不进镜像 |
| `.zscripts/dev.sh` / `.zscripts/dev-watchdog.sh` | 开发模式一键启动 / OOM 自愈守护（见教程 6.2/6.4） |
| `scripts/verify-*-docker.ts` | Docker 结构自检脚本（`verify-kk-b-docker.ts` / `verify-ll-a-docker.ts` / `verify-ss-a-docker.ts`） |
