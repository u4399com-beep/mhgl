# Go 采集引擎集成契约（go-engine v1）

> 本文档是 Go 采集服务与 Next.js 集成两侧的**唯一事实源**。两侧实现必须严格对齐本文。
> 背景：TS 采集引擎与 Next.js dev server 同堆运行，RSS 峰值 2045MB 触熔断线 1950MB，
> 任务频繁自动暂停。方案：把抓取/解析/编排搬进独立 Go 进程（GOMEMLIMIT 硬顶 600MB），
> Next.js 只负责 DB 持久化与增量决策（单写者）。TS 引擎原样保留作缺省引擎（engine='ts'），零回归。

## 0. 角色与边界

| 侧 | 进程 | 职责 |
|---|---|---|
| Go 服务 | `mini-services/crawler-go`，端口 **3032** | HTTP 抓取(多 charset)、规则解析(css/regex/json/const)、任务编排(单本/书号/列表范围)、并发与间隔控制、熔断、进度内存态 |
| Next.js | dev server 端口 3000 | DB 唯一写者：书/章/内容/封面持久化(Prisma+sharp)、增量决策(needUrls)、进度/日志落 Task 行、控制面转发 |
| 通信方向 | Go → Next.js | HTTP POST 回调（持久化+决策）。Next.js → Go：控制面（start/control/status/capability） |
| 网络路径 | 后端对后端直连 `127.0.0.1` | **不**经 Caddy 网关，无需 XTransformPort；浏览器永不直连 Go 服务 |

- 回调鉴权：HTTP header `x-go-callback-secret`，值取 env `GO_CALLBACK_SECRET`，**缺省固定值 `go-cb-2025-mhgl`**（两侧一致实现：env 缺失用缺省值）。不匹配返回 403。
- 两侧都要容忍对端短暂不可达：回调失败重试 3 次（间隔 1s/2s/4s），仍败则 Go 任务自动转 paused 并记本地日志。

## 1. Go 服务 HTTP API（监听 127.0.0.1:3032）

所有请求/响应 body 为 JSON。错误统一 `{ok:false, error:string}`。

| 方法/路径 | 请求 | 响应 | 说明 |
|---|---|---|---|
| GET `/health` | - | `{ok:true, engine:'go', version:'1.0.0', tasks:{running:int,paused:int}, rssMB:number, uptimeMs:number}` | 健康检查 |
| POST `/capability` | 完整 RuleConfig JSON | `{ok:true, unsupported:string[]}` | 规则子集校验；`unsupported` 非空时 Next.js 回退 TS 引擎 |
| POST `/task/start` | TaskStartPayload（§3） | `{ok:true}` ; 409 `{ok:false,error:'task already exists'}` | 幂等约束：同 taskId 存在（running/paused）时拒绝 |
| POST `/task/{id}/control` | `{action:'pause'\|'resume'\|'stop'}` | `{ok:true, status:string}` | pause=跑完在飞批次后挂起；stop=终止并从注册表移除 |
| GET `/task/{id}/status` | - | `{ok:true, exists:bool, running:bool, phase:string, progress:Progress, stats:Stats, rssMB:number, startedAtMs:number, lastError?:string}` | 不存在时 `{ok:true, exists:false}` |
| GET `/tasks` | - | `{ok:true, tasks:[{id,running,phase,rssMB}]}` | 调试面 |

- 进程内存策略：`GOMEMLIMIT=600MiB`（软顶，由启动脚本环境变量设定）+ 每章处理完即弃（不持有正文跨批）。
- 日志输出到 stdout（带 taskId 前缀），供 dev 式排查。

## 2. 回调协议（Go → `http://127.0.0.1:3000/api/admin/tasks/go-callback`）

POST body：`{taskId:string, kind:string, payload:object}`（见各 kind）。响应体必须含 `{ok:true}`，
**book/chapters 两类回调的响应携带决策字段**（增量语义的核心，Go 必须消费）：

| kind | payload（Go→Next） | 响应（Next→Go） | 语义 |
|---|---|---|---|
| `log` | `{level:'info'\|'success'\|'warn'\|'error', message:string}` | `{ok}` | TaskLog 追加 |
| `status` | `{status:'running'\|'paused'\|'done'\|'error'\|'stopped', note?:string}` | `{ok}` | Task.status 迁移（paused 保留进度） |
| `progress` | `{phase:'idle'\|'discovery'\|'book'\|'toc'\|'content'\|'done', phaseNote?, discovered?, booksDone?, booksTotal?, tocTotal?, contentDone?, contentTotal?, currentBook?, engineRssMB?}` | `{ok}` | merge 进 Task.progress JSON（仅覆盖出现的键）；throttle：同类回调 ≥1 次/秒 |
| `stats` | `{booksCreated?, booksUpdated?, chaptersCreated?, chaptersUpdated?, coversSaved?, errors?}` | `{ok}` | merge 进 Task.stats |
| `book` | `{bookUrl, name?, author?, category?, keywords?, intro?, coverUrl?, status?, latestChapter?}` | `{ok, bookId:string, skipContent:boolean, lastChapterUrl?:string}` | 建书/更新书；**skipContent=true**（完结书且增量模式）→ Go 整本跳过正文阶段 |
| `chapters` | `{bookUrl, items:[{title, url, volume?}]}`（全书目录，单次回调；>5000 章分多次，Go 侧带 `{seq:n, final:bool}`） | `{ok, needUrls:string[]}` | Next.js 重排+建章记录后返回**实际需要抓正文的章节 URL 列表**（增量去重结果）。空数组 → Go 跳过该书正文阶段 |
| `contents` | `{bookUrl, items:[{url, title?, contentHtml:string}]}`（批 ≤20 章） | `{ok}` | 清洗+落库章节正文 |
| `cover` | `{bookUrl, b64:string, contentType:string}` | `{ok, coverPath?:string}` | Next.js sharp→webp 存盘并回写 Book.cover；b64 解码后 ≤10MB |

- 回调顺序保证：同一 taskId 内 book → chapters → contents 串行产生；contents 可并发批（Go 侧按批顺序 POST 亦可乱序，Next.js 按 url 幂等 upsert）。
- `book`/`chapters` 回调超时 30s；`contents` 回调超时 30s。

## 3. TaskStartPayload（Next.js → Go POST /task/start）

```jsonc
{
  "task": {
    "id": "cmu90jsjh000vk4tx38903ner",
    "mode": "single|bookIds|range",
    "bookUrl": "https://.../book/{bookId} 占位符已渲染后的单本地址(bookIds 模式=模板)",
    "bookIds": ["1","2","3"],          // bookIds 模式-列表形态（已展开去重）
    "bookIdFrom": "1", "bookIdTo": "100", // bookIds 模式-范围形态（与列表互斥）
    "listUrl": "https://.../list/{page}.html", // range 模式列表地址模板
    "listStart": 1, "listEnd": 10,
    "bookStart": 0, "bookEnd": 0,       // 列表内书籍序号过滤(0=不限)
    "recrawlMode": "incremental|full",
    "storageMode": "db",                // v1 仅 db；txt → Next.js 侧拒绝启动 go 引擎(回退 TS)
    "threadMin": 1, "threadMax": 3,
    "intervalMin": 500, "intervalMax": 2000
  },
  "rule": { /* 完整 RuleConfig JSON(解析自 DB rule.ruleJson) */ },
  "callback": { "baseUrl": "http://127.0.0.1:3000", "secret": "go-cb-2025-mhgl" }
}
```

## 4. Go 引擎支持的规则子集（capability 校验口径）

参考实现（TS 语义权威，移植对齐）：`src/lib/crawl/parser.ts`（parseList/parseBook/parseToc/parseContent/constTemplate/arithPlaceholderIncomplete/jsonGet/absolutize）+ `src/lib/crawl/types.ts`（FieldRule/PageRule/FetchConfig/CleanConfig）。arithPlaceholderIncomplete 归属更正（R51-3-b）：算术后缀渲染+预检两侧均有 —— TS parser.ts R51-3-b 已补实现（原 R51-2-b 审计发现的单侧漂移已闭环），Go parse.go 同语义（floor 整除/缺变量/除零/未知算子 fail-closed）。

**支持（v1 全量）：**
- 字段类型：`css`（attr: text/html/href/src/任意属性；stripTags；replaceFrom/replaceTo 支持正则；index 逗号分段）、`regex`（flags 缺省 gis、捕获组序号）、`json`（点路径 `data.list.0.name`，数字段=数组下标）、`const`（`{var}` 模板 + 算术后缀 `{var|/N}`/`{var|+N}`/`{var|-N}`，缺变量/除零整体置空 fail-closed，含 R49-9 arithPlaceholderIncomplete 预检语义）
- 页面段：`list`（urlTemplate 支持 `{page}` 与 `{offset:N}`；itemSelector；fields）、`book.fields`、`toc`（itemSelector+fields+`tocLink`+pagination.nextLink/maxPages/joinWith）、`content`（selector+pagination 合并 joinWith）
- fetch 配置：`uaMode`（rotate/fixed/custom：UA 池+同域钉扎；mobile/desktop 已支持：池子集筛选+指纹头组按 UA 家族自洽，R51-3-a 起不再报 unsupported）、`customUa`、`headers`、`cookies`（静态串：按目标 host 懒注入 CookieJar，同名键由服务端 Set-Cookie 覆盖/其余键保留）、`autoCookie`（Go http.Client CookieJar 恒开，直连+代理双路径接线）、`referer`、`refererChain`（目录页带书籍页 Referer、章节页带目录页 Referer、翻页带当前页）、`timeout`、`retries`（400ms×2^a 指数退避钳 8s+抖动；重试间重过闸）、`hostGateLimit`（per-host 在飞闸，缺省 3，连续失败降额至 1/连续成功回升；per-host minGap 准入节奏 max(200ms, interval/threads)，连败≥3 gap×1.5 钳 3s 自适应）、`globalConcurrency`（全局在飞，缺省 10）、`proxyUrl`（http/https/socks5 多条轮换；回环目标豁免直连；per-proxy 失败指数冷却 30s×2^n 钳 10min，全冷却回退直连+warn）、`contentProxyUrl`（`{url}` 替换；响应 JSON `{ok,content}` 或纯文本行→`<p>` wrap；失败降级直连）、`tokenUrl`/`tokenPattern`（`regex:` 前缀或 JSON 点路径）+`tokenInjection`（url 占位符 `{token}` 或 header）/`tokenHeaderName`、`allowLoopback`、`mirrorDomains`（镜像组故障切换 + 成功域 sticky：上次成功域重排首位，成功即记、整组耗尽即清）、`pathJitter`、`jitterMs`
- 反反爬出口判定（R51-3-a）：**拦截页/挑战壳检测** —— STRONG_BLOCK_MARKERS 词表（语义权威=src/lib/crawl/fetcher.ts，两侧同步）+ 状态/WAF Server 头联合判定（403/429/503 + cloudflare/akamai/incapsula/sucuri）+ 极短页判定（<200B 或去标签可见文本<50）+ 合法 JSON 豁免 + 长页正常标题豁免；命中→`Result.Blocked`，编排层等价 httpStatusError{403} 计失败（复用重试/镜像/降额链、不计 chapterOK、内容不进 contents 回调）
- **Retry-After 尊重**（R51-3-a）：429/503 解析 Retry-After（整数秒 + HTTP 日期双形态）；显式合法值 ≥1s 如实采纳、钳 120s 上限、缺失/非法/<1s 兜底 30s；per-host 限流冷却窗（冷却期 acquire 单 timer 阻塞等待，无轮询；重试链同窗等待）；stats 计 rateLimited
- **HTTP 404 语义对齐 TS**（R51-3-a）：404 即失败（`!res.ok` 同口径），不交解析层、不计空正文入库
- **token 预取不过闸**（R51-3-a）：prefetchToken 在全局/host 闸之前执行且自身不过闸（嵌套过闸死锁修复），按 host 缓存 TTL 5min；tokenUrl/contentProxyUrl 隐式 loopback 豁免（URL 校验 + 拨号级复检双通道）
- **SSRF 加固**：自定义 DialContext 拨号后复检 `conn.RemoteAddr()`（防 DNS rebinding TOCTOU）+ DNS 缓存 60s TTL
- charset：Content-Type → HTML meta 自动探测，`golang.org/x/text` 解码（utf-8/gbk/gb18030/big5/shift-jis…）
- clean 配置：Go 侧**不做**内容清洗（clean 传回 TS 侧执行）；但 `content` 字段解析后的原始 HTML 原样回调

**不支持（capability 报告 unsupported，Next.js 回退 TS）：**
- `xpath` 字段类型；`fetch.engine='browser'`/`waitSelector`/`clickSelector`/`browserFallbackStatus`（需无头浏览器）；`fetchMode='scrapling-*'`；`curlImpersonate`；`needsProxy` 自动免费代理池匹配。
- 注（R51-3-a）：`uaMode='mobile'/'desktop'` 指纹头组已实现（UA 池含移动端条目 → 池子集筛选 + sec-ch-ua 三件套/Sec-Fetch 四件套/Accept 家族化/Accept-Language 按 UA locale 推导/显式 `Accept-Encoding: gzip, deflate`），**不再报 unsupported**；TS 侧低熵全量 CH（platform-version/arch/bitness/model/wow64）暂未移植。

**书号范围上限（fail-closed，R51-3-a）**：bookIds 范围形态 `to-from+1 > 100000` → 引擎 Validate 拒绝启动（错误信息说明上限；BuildBookIdQueueFromRange 内同上限截断+warn 兜底防直灌）。口径与 §7 书号 10 万级一致。

**status 响应 stats 字段（R51-3-a 扩展）**：`stats` 除 `errors`/`coversSaved` 外新增 `blocked`（拦截页命中数）/`rateLimited`（429/503 收到数），均由 fetch 层原子计数，仅经 GET /task/{id}/status 暴露（stats 回调键白名单在 Next.js 侧，不新增 kind 载荷键）。

## 5. 编排语义（对齐 TS runner）

- 三种模式：
  - `single`：队列=[bookUrl]
  - `bookIds`：列表形态用 `bookIds[]`、范围形态展开 `from..to` 渲染 `{bookId}` 模板（encodeURIComponent，渲染后去重保序）
  - `range`：逐页抓 `listUrl`（`{page}` 渲染，页序 listStart..listEnd）→ parseList 出书 → `bookStart/bookEnd` 序号过滤（1-based，0=不限）→ 已发现 URL 去重 → 全部入 book 队列
- 单书流水线：抓书籍页/API → parseBook → 回调 `book`（skipContent=true 则本毕）→ 定位目录（`toc.tocLink` 或书籍页本体）→ 目录翻页（pagination，maxPages 防死循环）→ parseToc → 回调 `chapters` 拿 `needUrls` → 正文批次
- 正文批次：批大小 = threadMin..threadMax 随机抽取（每批重抽，同 TS）；批间 sleep intervalMin..intervalMax 随机 + jitterMs；批内洗牌（Fisher-Yates）+ pathJitter；同 host 在飞受 hostGateLimit 闸
- 熔断：连续 20 章真实失败 → 放弃本书（计 errors）；连续 20 本书级失败 → 任务转 error；`chapters` 回调 `needUrls` 为空 → 本毕（不计失败）
- 进度：`booksDone`（书收尾+1）、`discovered`（range 模式发现数）、`contentDone/contentTotal`（needUrls 累计口径）、`currentBook`
- 暂停/恢复：pause 完成在飞批次后挂起（状态保留内存）；resume 从断点续跑。Go 进程重启后任务态丢失 —— Next.js 重发 start，增量决策在回调侧天然幂等（已采书 skipContent/needUrls 空），等价断点续采
- 空队列/全部跳过 → status=done（stats 留痕）

## 6. Next.js 侧改动清单（Task 2-b 实施范围）

1. **Prisma**：Task 增列 `engine String @default("ts")`（`ts`|`go`）→ `bun run db:push`；backup/restore 白名单透传 engine（非 ts/go 丢弃）。
2. **客户端** `src/lib/crawl/go-engine.ts`：`goCapability(rule)`、`goTaskStart(task,rule)`、`goTaskControl(id,action)`、`goTaskStatus(id)`、`goHealth()`；base `http://127.0.0.1:3032`，控制面超时 3s，start 超时 10s；Go 服务不可达/能力不符 → 返回 `{ok:false, fallback:true, reason}`。
3. **控制路由**：`api/admin/tasks/[id]/control` 与 `api/admin/tasks/batch` 中 `control` 前置分支：`task.engine==='go'` 时走 go-engine 客户端（start：先 capability → 不符/不可达 → TaskLog warn + 回退 TS 引擎 TaskRunner；storageMode==='txt' 同样回退）。**engine 缺省/ts 路径逐字节不变**。
4. **回调路由** `api/admin/tasks/go-callback/route.ts`（POST）：校验 secret 头（403）；按 §2 kind 分发；持久化实现要点：
   - `book`：按 `sourceUrl=bookUrl` 幂等 upsert（对齐 runner.ts 现有建书语义：pseudostatic bookNum、slug、cleanIntro、smartCategory smartCompleteDetect 可直接复用 `@/lib/crawl/smart`）；响应 `{bookId, skipContent, lastChapterUrl}`（skipContent=增量模式且 detectedStatus=completed；lastChapterUrl=库里末章 URL 供日志）
   - `chapters`：`reorderToc`（@/lib/crawl/sorter）+ 建缺失章记录（对齐 runner existUrlMap 语义：同 url 跳过）→ `needUrls`=需要抓正文的 url 列表（full=全部；incremental=仅新章）
   - `contents`：`cleanContentHtml`（@/lib/crawl/cleaner，规则 clean 配置）→ 章节行 upsert 正文（db 模式 content 字段）+ stats 计数
   - `cover`：base64 → `saveCoverWebp`（@/lib/crawl/storage）→ 回写 book.cover
   - `progress/stats`：读改写 Task.progress/stats JSON merge；`log`→TaskLog.create；`status`→Task.status 更新（'done' 时若 autoRefresh → 本 v1 记 TaskLog 提示手动重开，不自动循环）
5. **UI**：TaskWizard/TaskDialog 增「采集引擎」选择（经典 TS / Go 高并发-内存隔离，缺省 TS）；engine==='go' 时书号上限文案/计数从 2000 → **100000**（见 §7）；TaskMonitor 任务卡显示引擎徽标（progress.engineRssMB 可选展示）。
6. **API 规范化**：`api/admin/tasks/_shared.ts` engine 字段白名单（'ts'|'go'，缺省 ts）。

## 7. 书号上限按引擎放开（回答用户「为啥 2000」的配套动作）

- `src/lib/book-ids.ts`：新增 `BOOK_ID_MAX_COUNT_GO = 100_000`；`parseBookIdRange(from,to,max?)` 与校验口径增加可选上限参数（缺省仍 2000，**既有调用零回归**）。
- `api/admin/tasks/_shared.ts`：按 `engine` 传上限（ts→2000 / go→100000）；TaskWizard/TaskDialog 实时计数与错误文案同口径。
- 语义说明（写进代码注释）：2000 上限的历史原因是 TS 引擎与 dev server 同堆（队列/进度集合常驻堆内有 OOM 史）+ 单任务失控粒度防护；Go 引擎进程隔离+GOMEMLIMIT 硬顶后，书号模式的输入面上限放开到 10 万，`BOOK_ID_MAX_LEN=200` 防误灌语义不变。

## 8. 验收清单

**Go 侧（Task 2-a 自验）：**
- [ ] `go vet ./...` + `go build` 零错；单测覆盖 constTemplate 算术（含 `{q.id|/1000}`）、json 点路径数组下标、css attr/stripTags/replaceFrom、charset GBK 解码
- [ ] 内置 fixture 站（httptest 起本地 HTML/JSON 假站）走通 single/bookIds/range 三模式 + mock 回调接收器验证 book/chapters/contents/cover/status/progress 全链
- [ ] `contents` 批量回调期间进程 RSS 稳定（GOMEMLIMIT 生效，10 万章队列构建不爆内存——可用合成大 payload 单测验证）
- [ ] package.json `dev` 脚本可启动（见 §9）

**Next.js 侧（Task 2-b 自验）：**
- [ ] `bunx tsc --noEmit` + `bun run lint` 零错；engine 未设置的全部既有路径行为不变（回退审查）
- [ ] db push 成功；TaskWizard/TaskDialog 引擎选择 + 书号 100000 上限口径生效；go-callback 各 kind 手动 curl 打通

**联合（主控执行）：**
- [ ] 真实站点小规模采集（bookIds 2-3 本）全链：Go 抓取→回调→前台可见→TaskMonitor 进度/日志
- [ ] pause/resume/stop 控制面实测；TS 引擎回归冒烟（旧任务 start 正常）

## 9. 启动方式（mini-services 约定）

- `mini-services/crawler-go/package.json`：`{"name":"crawler-go","scripts":{"dev":"bash run.sh"}}`
- `run.sh`：`export PATH=$HOME/go-sdk/go/bin:$PATH; export GOMEMLIMIT=600MiB; cd "$(dirname "$0")"; while true; do go build -o .build/crawler-go . && .build/crawler-go; sleep 1; done`（崩溃自动重启；开发期改码手动重启即可）
- Go 模块依赖经 `GOPROXY=https://proxy.golang.org,direct` 拉取（沙箱已验证可达）；首次 `go mod tidy` 生成 vendor 或直接用模块缓存。
- 服务必须监听 `127.0.0.1:3032`（`GO_PORT` env 可覆盖）。
