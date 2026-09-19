# 反反爬 10 工具探讨与择优评估（R27-1）

- Task ID: R27-1 · 日期: 2026-09-15 · 性质: 纯研究，零 src/ 代码改动
- 对象: Scrapling / CloakBrowser / BrowserAct / invisible_playwright / MediaCrawler / curl-impersonate / aiohttp / Dokobot / Trafilatura / Obscura
- 依据: web 搜索实证（2025~2026 资讯）+ 本机只读探测 + `src/lib/crawl/fetcher.ts` 引擎链现场比对
- ⚠️ 同名辨析: 本项目存在**内部自研模块 `src/lib/crawl/obscura.ts`**（playwright 隐身封装）与**内部自研服务 `mini-services/cloak-browser`**（puppeteer-extra-stealth，:3016）——与外部工具 Obscura(h4ckf0r0day)、CloakBrowser(CloakHQ) 同名不同物，本文严格区分「内部自研」与「外部工具」。

---

## 一、择优集成建议（摘要表）

| 工具 | 结论 | 集成成本 | 预期收益 | 性价比 |
|---|---|---|---|---|
| Scrapling | **已集成·维持升级**（桥 :3012 v0.4.15） | 0（可选补装 camoufox） | 已兑现（stealthy/static/playwright 三档在链） | 5 |
| curl-impersonate（lexiforest/curl_cffi 系） | **✅ 本轮集成** | 低 | JA3/JA4+HTTP/2 指纹级过盾，直击 curl 链 OpenSSL 指纹短板（trxsw 类站点） | 5 |
| Trafilatura | **✅ 本轮集成**（桥内新增 /extract 兜底） | 低（纯 pip 依赖） | 无规则自适应正文提取，规则失败站点的解析兜底 | 4 |
| CloakBrowser（外部 CloakHQ 版） | 仅评估（二轮集成候选） | 中（补丁级 chromium 二进制 ~150MB） | 源码补丁级指纹伪装（TLS/JA4 + CDP 全套），强于 JS 注入系 | 3 |
| invisible_playwright（feder-cr） | 仅评估 | 中 | 无头 **Firefox** 形态指纹面——现有全链均为 Chromium 形，唯一互补项 | 3 |
| MediaCrawler（NanmiCoder） | 仅评估（**只借鉴中间件**，不整平台引入） | — | CDP 挂真实浏览器/签名服务/登录态缓存/代理池的工程范式 | 2 |
| Obscura（外部 h4ckf0r0day，Rust） | 仅评估（项目过新） | 中 | 与内部 obscura.ts 同名不同物，暂无替换动机 | 2 |
| BrowserAct | **弃** | — | SaaS/AI Agent 定位，与确定性规则引擎不合 | 2 |
| aiohttp | **弃** | — | 异步 HTTP 已被 bun native fetch 覆盖；固定 TLS 握手=JA3 天然短板 | 1 |
| Dokobot | **弃（无法确证）** | — | 仅见 GitHub org（AI persona/X 抓取玩具），非成熟通用反反爬工具 | — |

**本轮集成清单（可执行）**：
1. **curl-impersonate**——bun 侧 curl 链换装 impersonate 二进制（方案见 §四.1）；Python 侧 curl_cffi 0.16.3 已随 scrapling 桥在位，无需动作。
2. **trafilatura**——装入 scrapling-bridge venv，桥内新增 `/extract` 自适应正文端点（方案见 §四.2），供 calibrate/parser 兜底，fetcher 零改动。

---

## 二、本地现状（只读探测实录，2026-09-15）

**二进制与包：**
- `which curl-impersonate curl_chrome116 curl-impersonate-chrome` → **全部未安装**（系统 curl 8.14.1，OpenSSL 后端=默认指纹，JA3 可被 WAF 识别）
- 主 venv `/home/z/.venv`（Python 3.12.14）：`playwright` ✅ 已装、`aiohttp 3.13.3` ✅ 已装；`scrapling / curl_cffi / trafilatura / patchright / camoufox` **均未装**
- 桥专用 venv `mini-services/scrapling-bridge/.venv`：`scrapling 0.4.15` ✅、**`curl_cffi 0.16.3` ✅**、`patchright` ✅（随 scrapling[fetchers] 带入）、`playwright` ✅、`camoufox` ❌、`trafilatura` ❌

**服务面（端口 3010~3017 全占用，新服务须 3018+）：**
- `GET :3012/health` → `{"ok":true,"selfTestOk":true,"versions":{"python":"3.12.14","scrapling":"0.4.15"},"modes":["static","stealthy","playwright"]}` —— 桥健康、自检通过
- 监听中：3010 bqg713-proxy / 3011 fetch-relay / 3012 scrapling-bridge / 3013~3015 内容解密代理（xjp/deqixs/qimao 系）/ **3016 cloak-browser（内部自研 puppeteer-stealth 三档）** / 3017 qidian-proxy

**结论**：curl-impersonate 二进制与 trafilatura 均为零现成依赖的净新增；curl_cffi 已在桥 venv 内（`fetchMode='scrapling-static'` 实际已在消费它）。

---

## 三、现有引擎链对照（fetcher.ts 扩展点实录）

引擎降级链（fetcher.ts:4-18 头注释 + 代码实证）：
**native fetch → curl 链（多 TLS 画像，host 钉扎）→ fetch-relay(:3011) → scrapling 桥(:3012) → Obscura 内部模块 → 裸 Playwright → cloak-browser(:3016)**，qidian(:3017) 为 contentProxy 范式的转换代理（非传输档）。

| 扩展点 | 位置（行号实证） |
|---|---|
| `FetchConfig.fetchMode` 文档注释 | types.ts:212-225 |
| fetchMode sanitize 白名单（`'native'/'scrapling-static'/'scrapling-stealthy'/'scrapling-playwright'`） | types.ts:644-648 |
| `scraplingModeOf()` 模式判定（新桥模式仿此处） | fetcher.ts:2891-2893 |
| `fetchViaScraplingBridge()` 桥调用（信封 `{ok,status,html,finalUrl}`） | fetcher.ts:2936-3005；`SCRAPLING_BRIDGE_URL` :2885 |
| `fetchPageOnce()` 顶层桥分流点 | fetcher.ts:3598-3616 |
| curl 第二级传输（子进程，本轮换装目标） | fetcher.ts:2423 起 |
| `curlTlsProfileIndex()` host→画像钉扎（impersonate 目标映射挂点） | fetcher.ts:2467（调用点 2497 / 2631） |
| fetch-relay 中继（`RELAY_URL`） | fetcher.ts:2735 |
| 浏览器档 `obscuraFetch()` 调用 | fetcher.ts:1377 |

实测教训映射：fanqianxs.com（CF IP 级封锁，全出口 403）→ 客户端工具均无效，唯代理池/出口换 IP 可解，本轮 10 工具无一适用；trxsw.com（HTTP/2 framing 层拒绝）→ **curl-impersonate 的真实浏览器 HTTP/2 SETTINGS/伪头指纹正对此症**；demo.shipsay.com 直连可达 → 无需升级。

---

## 四、逐工具详析

### 1. Scrapling（D4Vinci/Scrapling）— 评分 5 — **已集成·维持升级**
- **定位与原理**：Python 自适应抓取框架；三类 Fetcher：`Fetcher`（基于 curl_cffi，TLS/JA3 伪装）、`StealthyFetcher`（**Patchright** 补丁版 Playwright，CF 挑战自动求解）、`PlaywrightFetcher`（裸 chromium 渲染）；自适应解析（元素失踪自愈重定位）。
- **反检测**：TLS/JA3 ✅（curl_cffi 底座）、JS 执行 ✅、浏览器指纹 ✅（patchright 启动期补丁而非运行时 JS 注入）、HTTP/2 ✅。第三方评测（ianlpaterson 2026 benchmark / pim97 对比仓）认可其浏览器层逃逸为 patchright 实现。
- **部署/依赖**：pip `scrapling[fetchers]` + `scrapling install`；BSD-3-Clause；**~41K stars**（2026-05 实测量级），活跃维护。
- **集成方式**：**已在链**——`mini-services/scrapling-bridge`(:3012, v0.4.15) 三档全通（health 实证），`fetchMode='scrapling-*'` 白名单在 types.ts:644-648。
- **结论**：已集成。唯一增量建议：补装 `camoufox`（scrapling 官方可选 Firefox 形后端，评测公认硬指纹站最强），作为第四档低成本试水——本轮不做强制。

### 2. curl-impersonate（lwthiker 原版 → lexiforest fork / curl_cffi）— 评分 5 — **✅ 集成安装**
- **定位与原理**：补丁版 curl，逐字节模拟真实浏览器 **TLS ClientHello（JA3/JA4）+ HTTP/2 SETTINGS/伪头顺序** 指纹。原版停更后，社区活跃线为 lexiforest fork；Python 绑定即 `curl_cffi`（`impersonate="chrome124"` 一行生效）。
- **反检测**：TLS/JA3 ✅✅（本品类天花板）、HTTP/2 ✅✅、JS 执行 ❌（纯传输层）、浏览器 JS 指纹 ❌。HN/评测公认：对「TLS 握手即杀」型 WAF 是首选；benchmark 显示 `curl_cffi impersonate=chrome` 与 Camoufox 在 TLS 指纹目标上并列最强。
- **部署/依赖**：二进制（curl_chrome/curl_firefox 系列，单文件，无运行时依赖）或 Python `curl_cffi`（已装于桥 venv 0.16.3）。
- **集成方式**：**双轨**——①Python 轨已在位（scrapling-static 即 curl_cffi，零动作）；②bun 轨为本轮增量：系统 curl 8.14.1 OpenSSL 指纹是 curl 链最短板，换装 impersonate 二进制即补齐（方案 §五.1）。**trxsw.com 的 HTTP/2 framing 拒绝是其最佳试金石**（native bun HTTP/2 与系统 curl 双双被拒的场景，真实浏览器指纹可能通过）。
- **结论**：**集成安装**（bun 侧 curl 链换装 + 实测 trxsw）。

### 3. Trafilatura — 评分 4 — **✅ 集成安装**
- **定位与原理**：Python 正文/元数据提取库（启发式 boilerplate 剔除），adbar/trafilatura；当前 2.x，多轮学术/工业评测（scrapinghub article-extraction-benchmark 等）中文本提取 F1 常年第一梯队；纯 lxml 实现，无浏览器依赖。
- **反检测**：**不适用**（它是解析侧工具，非传输/隐身工具）——评估价值在「采集到 HTML 之后」。
- **部署/依赖**：pip 单包（依赖 lxml 等），MIT；活跃维护，star 数千量级（~4K+）。
- **集成方式**：装入 `scrapling-bridge/.venv`，桥新增 `POST /extract {html}` → `{title,text,markdown}` 端点；fetcher 零改动。用途：①calibrate 校准失败时的规则推荐素材；②parser 规则全失败站点的**无规则兜底正文提取**（本章节点位为小说正文，trafilatura 对文章型页面强、对强模板小说页需实测，故定位「兜底」而非主力）。
- **结论**：**集成安装**（低风险低成本的解析侧增量）。

### 4. CloakBrowser（外部，CloakHQ/CloakBrowser）— 评分 3 — **仅评估（二轮集成候选）**
- **定位与原理**：**源码补丁级**反检测 Chromium fork（「drop-in Playwright replacement with source-level fingerprint patches」），PyPI 包 `cloakbrowser`；自托管 Multilogin/GoLogin/AdsPower 替代品；TLS/JA4 指纹在浏览器层直伪（无需额外组件）。
- **反检测**：TLS/JA4 ✅✅（补丁级，JS 注入系做不到）、JS/Canvas/WebGL 指纹 ✅（编译期）、HTTP/2 ✅、生态为 Playwright API ✅。
- **部署/依赖**：pip 安装含补丁 chromium 二进制（体积大）；ossinsight 实证 **~30.2K stars / 2.5K forks**，2026 年最热免费反检测浏览器；license 需装前复核。
- **集成方式**：与内部 cloak-browser(:3016, puppeteer-extra-stealth) **同名不同物**——外部版是补丁浏览器，理论上是内部版 12 flags JS 注入的更深层替代。可作 :3016 的 `tier:'maximum'` 之上的第四档，或独立 mini-service :3018（Python async API，信封复用 scrapling 桥同款 `{ok,status,html,finalUrl}`）。
- **结论**：**仅评估**。理由：现有 chromium 形隐身已有三层（Obscura 内部模块 / patchright / 内部 cloak-browser），边际收益收窄；但若后续遇到 JS 注入系过不去的「编译期指纹检测」站，它是第一顺位升级。

### 5. invisible_playwright（feder-cr/invisible_playwright）— 评分 3 — **仅评估**
- **定位与原理**：确证为 **feder-cr 的开源项目**——「undetected headless **Firefox** fingerprint」的 Playwright 兼容隐身层（补丁版 Playwright，围绕隐身 Firefox profile；确定性 session 指纹、recaptcha/bot 检测绕过）。与 Scrappey/pim97 评测体系中的 patchright（Chromium 系）互为镜像。
- **反检测**：JS 执行 ✅、浏览器指纹 ✅（Firefox 形，全链唯一）、TLS/JA3 随真实 Firefox 网络栈 ✅（较自然）、并发性能中等（Firefox 头重）。
- **部署/依赖**：pip；维护活跃度中等（个人项目，star 万级以下），长期性需观察。
- **集成方式**：与内部 cloak-browser/patchright **零重叠、纯互补**（全链第一个 Firefox 形态）；若集成则同样走 :3018 新桥 + fetchMode 新枚举，仿 scraplingModeOf（fetcher.ts:2891）。
- **结论**：**仅评估**。触发条件：camoufox（更成熟、背靠 scrapling 生态）先试，若其 Firefox 形态实测有效则 invisible_playwright 无必要；作为备胎记录。

### 6. MediaCrawler（NanmiCoder/MediaCrawler）— 评分 2 — **仅评估（借鉴中间件，不引入）**
- **定位与原理**：小红书/抖音/快手/B站/微博/贴吧/知乎多平台社媒采集事实标准（GitHub 中文社区顶流）；核心 = Playwright **CDP 连接真实 Chrome** 绕风控 + 各平台**签名服务**（xhs sign 等）+ 登录态缓存 + 代理池。
- **反检测**：JS 执行 ✅、真实浏览器指纹 ✅✅（CDP attach 真.Chrome 是其立身之本）、TLS ✅（真浏览器）、平台签名 ✅（逆向层，非通用）。
- **部署/依赖**：Python/playwright；中文文档全；AGPL-3.0 类强 copyleft（**引入代码有传染风险，整平台引入需谨慎**）；star 3 万+。
- **集成方式**：**只借鉴范式，不引代码**——①CDP attach 真实 Chrome 档位（比补丁浏览器更真，代价是需真 Chrome 进程池）可记入 cloak-browser:3016 的演进 backlog；②签名服务外置范式与本项目 tokenUrl/tokenPattern 钩子同构，验证了现架构方向；③登录态缓存≈现有 cookie 持久化（feat-cloak-anticrawler B）已覆盖。
- **结论**：**仅评估（借鉴）**。整平台引入 = 弃（领域不合：社媒平台 vs 小说站；license 风险）。

### 7. Obscura（外部，h4ckf0r0day/obscura）— 评分 2 — **仅评估**
- **定位与原理**：**Rust 编写的无头浏览器引擎**，面向 AI agent 与抓取（V8、原生渲染、宣称 30MB 内存/80ms 加载、per-session 反指纹）。
- **反检测**：JS 执行 ✅（V8）、指纹 ✅（宣称 per-session 编译级）、TLS/HTTP2 未见公开评测佐证、CDP 兼容性未知。
- **部署/依赖**：Rust 二进制；**项目极新**（搜索窗口内 repo 提交距今 1 天，社区/评测/issue 生态未成型）；license 待查。
- **集成方式**：**与内部 `src/lib/crawl/obscura.ts` 同名不同物**——内部版是 1339 行自研 playwright 隐身封装（指纹池/头序/TLS 画像/CF 挑战等待/cookie 回流），是本项目核心资产，不受外部同名工具影响，无替换动机。外部版若成熟，理论可作 :3018 新档（Rust 引擎轻量高并发）。
- **结论**：**仅评估**（无法确证为成熟工具前不投入；列入观察名单，待其出现第三方 benchmark 再议）。

### 8. BrowserAct — 评分 2 — **弃**
- **定位与原理**：browseract.com 出品，面向 AI Agent 的浏览器自动化（云端真实浏览器会话 + 无代码自然语言抓取 + CLI `stealth-extract`；stealth 浏览器 + 动态代理）。
- **反检测**：宣传层面全绿（stealth 过反检测测试的实测文有），但为**闭源 SaaS**。
- **集成方式**：与本项目**确定性规则引擎**定位根本不合——我们每一步抓取须可复现、可配置、可自托管；云端 AI 会话引入外部依赖/费用/数据出境面。中文评测（腾讯云开发者/知乎/CSDN 2026）均按「AI agent 工具」定位介绍。
- **结论**：**弃**。（若未来做「自然语言建规则」类功能，可重访其 CLI 形态。）

### 9. aiohttp — 评分 1 — **弃**
- **定位与原理**：经典 Python 异步 HTTP 客户端/服务端，无任何反检测设计。
- **反检测**：TLS/JA3 **天然短板**（固定 OpenSSL ClientHello，CSDN/腾讯云 2021 起大量「aiohttp 被 JA3 识别」实证；绕法=自改 SSLContext ciphers，脆弱且过时）。
- **部署/依赖**：主 venv 已装 3.13.3（系统既有，非本项目引入）。
- **集成方式**：无需——异步传输已被 bun native fetch（引擎第一档）覆盖；Python 侧异步传输位已被桥内 curl_cffi/patchright 占据，aiohttp 无生态位。
- **结论**：**弃**。（它频繁出现在反反爬语境的唯一原因是「大家用它爬」——搜索实证其恰是**被识别**的反面教材。）

### 10. Dokobot — **无法确证** — **弃**
- **搜索结论**：仅能找到 `github.com/dokobot` org 及其描述（「free browsing tool for AI agents」「Scrape any X (Twitter) account and distill … into a reusable AI persona skill」）——定位是 **X(Twitter) 账号人格蒸馏的 AI 玩具工具**，无独立文档站、无版本发布记录、无第三方评测、无反检测维度证据。
- **判定**：**无法确证为公开成熟的反反爬工具**。最接近的候选（若原意是「AI agent browsing 工具」品类）：browser-use、Skyvern、browserbase——均非本项目所需（同 BrowserAct 弃理由）。
- **结论**：**弃**。若主控掌握 Dokobot 的其他出处（内部项目/付费产品），请补充材料后重评。

---

## 五、被建议集成项的落地方案草图

### 1. curl-impersonate → bun curl 链换装（fetcher 侧，改 2 处 + 新依赖）
- **依赖**：下载 lexiforest curl-impersonate 静态二进制（`curl_chrome`/`curl_firefox` 系列）至 `mini-services/_bin/`（或 `CURL_IMPERSONATE_BIN` 环境变量指定路径），零运行时依赖。
- **fetcher.ts 扩展点**：
  - `curlTlsProfileIndex()`（fetcher.ts:2467）：现有 host 钉扎画像数组的每项追加 `impersonate` 字段（如 `'chrome124'`/`'firefox133'`），钉扎语义不变，仅把「TLS 版本/密码套件开关组合」升级为「真浏览器完整指纹」；
  - curl 子进程构造处（fetcher.ts:2423 起的第二级传输，命令拼装在 `fetchHttpWithCurlSingle` 内 2497/2631 调用点）：当 host 画像命中 `impersonate` 且二进制可用时，用 impersonate 二进制替代系统 curl；二进制缺失→回退系统 curl（零回归）。
- **配置面**：无需新 FetchConfig 字段（画像内置）；可选环境变量 `CURL_IMPERSONATE_BIN` 供部署覆盖。
- **验证靶**：trxsw.com（HTTP/2 framing 拒绝）——impersonate 的真浏览器 HTTP/2 指纹若通过即为立竿见影；fanqianxs.com 为阴性对照（IP 级封锁，预期仍 403，证明工具边界）。

### 2. trafilatura → scrapling-bridge 新增 /extract（纯桥侧，fetcher 零改动）
- **依赖**：`uv pip install --python mini-services/scrapling-bridge/.venv/bin/python trafilatura`（桥 venv 内，与 scrapling 0.4.15 共存无冲突）。
- **server.py**：新增 `POST /extract`，body `{html:string, url?:string}` → `{ok:true, title, text, markdown}`；内部 `trafilatura.extract(html, url=…, output_format='markdown', favor_recall=True)`；异常→`{ok:false,error}` 200 信封（与桥现有错误形态一致）。
- **消费面（本轮不实现，留接口）**：parser.ts 规则全空时的兜底调用点、calibrate.ts 的规则推荐素材——均属 src/ 改动，按纪律留给后续轮次；本轮仅铺桥端点与依赖。
- **配置面**：`scraplingBridgeUrl`（types.ts:223-225）复用，无新字段。

### 3.（二轮候选，非本轮）外部 CloakBrowser / invisible_playwright → 独立 mini-service :3018
- 端口 :3018（3010~3017 全占用）；服务形态复制 scrapling-bridge 模式（Python venv + `{ok,status,html,finalUrl}` 信封 + SSRF 双重校验 + 仅绑 127.0.0.1）。
- fetcher 侧照抄 scrapling 分流四件套：types.ts:644-648 白名单加 `'cloakbrowser'/'invisible-pw'` 枚举 → types.ts:212-225 补文档注释 → fetcher.ts:2891 处新增 `cloakModeOf()` → fetcher.ts:3598 分流点加一分支；`scraplingBridgeUrl` 旁新增 `cloakBridgeUrl` 字段（sanitize 白名单同步透传）。

---

## 六、附：搜索证据要点（2026-09 检索）
- Scrapling：github.com/D4Vinci/Scrapling；「41K stars」量级（2026-05 评测视频）；BSD-3-Clause；readthedocs。
- 反检测横评：ianlpaterson.com《Anti-Detect Browser Benchmark 2026: 7 Tools, 651 Verdicts》（patchright/camoufox/curl_cffi/CloakBrowser 横评）；github.com/pim97/anti-detect-browser-tools-tech-comparison。
- CloakBrowser：github.com/CloakHQ/CloakBrowser；pypi「cloakbrowser」；ossinsight 30,239 stars / 2,498 forks。
- invisible_playwright：github.com/feder-cr/invisible_playwright；sourceforge/scraping-wiki 收录（Firefox 补丁版 Playwright）。
- MediaCrawler：github.com/NanmiCoder/MediaCrawler；腾讯云开发者 2026-06（CDP 连真实 Chrome）。
- curl-impersonate：github.com/lexiforest/curl_cffi（活跃 fork）；curl-cffi.readthedocs.io（impersonate 版本表）；HN 2025 讨论（原版停更、fork 活跃）。
- Trafilatura：trafilatura.readthedocs.io（Benchmarks 节）；github.com/scrapinghub/article-extraction-benchmark。
- Obscura：github.com/h4ckf0r0day/obscura（Rust 无头浏览器，repo 极新）；pim97 对比仓收录条目。
- BrowserAct：browseract.com；腾讯云开发者 2026-07 / 知乎 2026-09 / CSDN 2026-05（AI Agent CLI 定位实证）。
- aiohttp JA3 短板：CSDN 2021、腾讯云开发者 2021、cnblogs 2026-01（curl_cffi 对比文明确点名 requests/aiohttp 指纹缺陷）。
- Dokobot：仅 github.com/dokobot org 页（AI persona/X 抓取），无成熟度证据。

---

## 七、[R43-1a] browser-use 增补评估（第 11 项，2026-09-19）

### browser-use（browser-use/browser-use）— 评分 2 — **仅评估（弃，同 BrowserAct 定位）**
- **定位与原理**：Python 的 **LLM 驱动浏览器自动化 agent**——把 Playwright 包成"给 AI 用的浏览器工具"（DOM 抽取为 text signature 供 LLM 决策、多 tab 管理、Agent 评分自我评估、MCP server 形态、Claude/Gemini/OpenAI 多模型接入），2025~2026 增长最快的 agent browsing 框架（GitHub 60K+ stars 量级，Cloudflare/Google Summer 等背景的商用化公司 browser-use Inc 托管）。
- **反检测**：**零自身反检测**——传输/浏览器层完全复用其底层 Playwright（可配 camoufox/patchright 等，但那是上游件的功劳）。对反反爬没有独立贡献维度。
- **与本系统对照**：本项目 fetcher 引擎链是**确定性规则引擎**（选择器+字段映射+可复现传输态），browser-use 的价值在"无规则的自然语言导航"——每一步抓取由 LLM 现场决策，成本（每页 LLM token）、延迟、不可复现性都与确定性采集根本不合。
- **适用位（如未来引入）**：①"自然语言建规则"助手（LLM 探索站点→产出本系统 FieldRule JSON，人类审核后入库——产物是确定性规则，运行期无 LLM）；②规则全失败站点的**一次性人工辅助侦察**。二者皆是"规则生产工具"而非"采集传输引擎"。
- **结论**：**弃（不进传输链）**。与 BrowserAct 同型：AI Agent 定位 ≠ 确定性规则引擎。登记为未来"自然语言建规则"候选（与 BrowserAct CLI 并列）。

### R43 十一项总表（增量行）
| 工具 | R43 结论 | 状态 |
|---|---|---|
| browser-use | 仅评估（弃传输链；未来 NL 建规则候选） | 本轮新增 |

---

## 八、[R43-1b] 集成落地状态复核（2026-09-19，全部实测）

R27 规划的两项集成（curl-impersonate / trafilatura）+ scrapling 桥，在 R43 轮完成**最终落地与实测闭环**：

| 项 | R27 时状态 | R43 实测状态 |
|---|---|---|
| scrapling 桥 venv | .venv 缺失（R40-1 遗留） | ✅ `uv venv + scrapling[fetchers]+trafilatura` 重建，`/health selfTestOk=true`（scrapling 0.4.15 / curl_cffi 0.16.3 / trafilatura 2.2.0） |
| 桥 /fetch static（curl_cffi） | 未验证 | ✅ 经 /api/admin/rules/test 端到端实测：aijjxs toplist 200（15798B, 593ms）+ 80ge lastupdate 200（40493B, 420ms），桥日志实锤 |
| 桥 /fetch stealthy（patchright） | 未验证 | ✅ example.com 200（chromium-1234 缓存复用，R42 补装生效） |
| 桥 /extract（trafilatura） | 端点已写、依赖缺 | ✅ 实测 x33yq 书页 → title+正文 397 字提取成功 |
| 桥 /impersonate（curl_cffi 档位） | 未验证 | 端点健康（capabilities.impersonate=true）；curl_cffi 档位白名单 chrome/edge/safari/firefox+版本号 |
| bun 侧 curl-impersonate 二进制 | 已装（R27 轮） | ✅ `mini-services/scrapling-bridge/_bin/`（curl_chrome116/curl_safari17_0/curl-impersonate-chrome）；fetcher [R27-1b] 接线在位（FetchTlsProfile.impersonate + 档位解析 + 惰性探测） |
| fetchMode 规则面 | 白名单在位 | ✅ RuleEditor「采集传输模式」4 档下拉在位（native / scrapling-static / scrapling-stealthy / scrapling-playwright），测试 API fetch 覆盖注入实测可用 |

**引擎链终态**：native fetch → curl 链（可按 host 钉扎升级 impersonate 档）→ fetch-relay(:3011) → scrapling 桥(:3012, static/stealthy/playwright 三档+impersonate+extract) → Obscura 内部模块 → 裸 Playwright → cloak-browser(:3016)。规则侧适配面：`FetchConfig.fetchMode`（桥三档）+ `impersonate` host 画像档位 + `needsProxy/proxyCountries`（R42 代理池）——四者正交可组合。

**运维注记**：桥重启方式 = `cd mini-services/scrapling-bridge && bun run dev`（package.json 自动优先 .venv/bin/python）；venv 重建命令见 /health 的 installHint。沙箱重启会灭 .venv（/home/z 持久、/tmp 与部分缓存不保证），重启后按 hint 重建即可。
