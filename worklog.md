# mhgl 工作日志（跨 agent 协作总线）

> **历史归档指针（R67-d, 2026-09-25）**：2026-09-10 ~ 2026-09-24 的全部历史条目
> （Task 3-a ~ R65-d，共 285 条，约 1.05MB）已零损失切分归档至 **`docs/archive/worklog-2026-09.md`**。
> 归档件头部自带全条目索引（起始行 + Task ID + 任务一句话），查历史先看该索引。
> 本文件现仅保留最近一轮（R65-final 收口 + R66 全轮）共 6 条；新条目照常在文件尾按原格式追加
> （三横线分隔行起头，下一行 Task ID: 标头，随后 Agent:/Task:/Work Log:/Stage Summary:）。

---
Task ID: R65-final
Agent: main-controller
Task: R65 收口（终验+commit+push）

Work Log:
- 浏览器端到端终验: ①智能 TDK 站群 UI(18 套勾选+5 页类型下拉+保存)→book 页 8 连抓 3 风格随机命中→补勾首页/分类套后 home 4 连 2 风格+category 3 连 2 风格 → 占位符(书名/作者/分类/状态/热词)全部正确; ②规则结构化表单渲染(分区/中文引导/四类选择器下拉)→真实编辑保存 PUT 200→回读语义零丢失(urlTemplate 保留实证)
- TDK 保留启用状态交付(sets 1/3/7/14-18, pages 全 smart, 站长可在后台自由增减)
- 门禁终验: gofmt 零/vet 零/14 包 test 全绿/build OK/node --check OK
- commit 7909674 (22 files, +1736/-21) 推送 GitHub main(远端 R63-d rehash 版 cc48e6c 为本地超集, force-with-lease 安全覆盖, update-ref 对齐)

Stage Summary:
- R65 全部交付: 规则表单结构化(指令2)/智能TDK 18套(指令3)/智能设置9项审计(指令4)/规则实测矩阵+极限参数三档(指令1)/R64 遗留收口(指令5)
- 采集任务运行中持续回填(万古神帝 5967/7774+); 数据面 7 书/9000+ 章
- 遗留移交: 封面文件名双点形态(功能无损留档)/.git 325M 历史评估/Docker 链退役评估(R64-d 报告)/token 轮换提醒(已在聊天暴露需撤销轮换)
---
Task ID: R66-d
Agent: R66-d
Task: 清理整合精简(A Docker 链退役落地 / B .git 325M 评估 / C 根目录·scripts·docs 清理整合 / D 量化收尾)

Work Log:
- 开局: 读 worklog 尾部 ~300 行(R62 Go 化收口/R64-d 清理与 Docker 评估/R65-final 移交项); 基线采集 du(.git 328M, 总仓 excl .git 282M, db 16M); 核实运行进程三件套(bun run dev / .build/mhgl / bash scripts/dev-watchdog.sh)全程未 kill/restart 未触 :3000; 领地互斥: internal/、web/covers/、prisma/、db/ 零触碰
- [A 复评] rg 全仓 Dockerfile/docker-compose/Docker 引用 21 文件甄别: 运行时面(internal/cmd/web/mini-services/prisma/go.mod/package.json/Caddyfile/.zscripts)零引用; 引用集中于文档(README/DEPLOY)+链自身+scripts/archive 三套历史 docker 断言探针+INSTALL-GUIDE-r52.bak.md(历史 bak); Dockerfile 为 next build standalone 形态而 src/ 已于 R62-a 全删(无源可构), docker-entrypoint 启动 node server.js 与 Go 单体失配 → 确认退役(与 R64-d 报告一致)
- [A 落地] git mv 9 件入 docs/archive/docker/: Dockerfile / Dockerfile.scrapling / docker-compose.yml / .dockerignore / docker-entrypoint.sh / install.sh / docker/autofill.mjs / docker/autofill-rules.json / scripts/export-autofill-rules.ts(后者为 Docker 自动填充清单导出器, 唯一产出物即 autofill-rules.json, 随链退役); 新写 docs/archive/docker/README.md(退役原因 4 条/文件清单/「全量-简化-退役」三档矩阵/恢复方式); rmdir docker/; PARITY.md 实际不存在(git 全历史无此文件, R64-d 已修正其悬空引用), 三档矩阵代持于归档 README
- [A 文档同步] README.md 6 处(技术栈部署行改裸机/快速开始 Docker 块→裸机 recover.sh 三条命令/mini-services 共置句改逐个启动/目录结构 docker 行→archive 行+删 Dockerfile 行/scripts 约定 export-autofill 行改退役记录/数据备份删 Docker 句); DEPLOY.md 全文重写为裸机速查卡(顶部一句 Docker 退役指针, 环境变量表删 Docker 专属行, FAQ 改裸机口径); .env.example 头注+DATABASE_URL 注释去 Docker 化, 「Docker 一键部署+构建参数」两大节收拢为退役指针; scripts/archive/README.md 活资产清单更新; docs/legacy-seeds/seed-rule-pilishuwu.ts 注释路径改归档位; INSTALL-GUIDE.md 核对: 零 Docker 章节, Go 单体口径准确, 无需改
- [B 量化] git count-objects -vH: loose 3455 对象/241.38MiB + 2 pack/84.45MiB = 328M; rev-list+cat-file top 批量统计: >5MB 大 blob = 二进制 17 件 297.7MB(.build/mhgl+根 server 历史 6 件≈131.6M / mini-services/crawler-go/.build 8 件≈99.3M / scrapling-bridge curl-impersonate 3.5M) + skills/design/design-templates 大 HTML 3 件 35.6M(waitlist 19.4M/standalone 11M/carousel 5.2M) + worklog.md 历史 76 个版本(近期各 1.4M); git fsck 仅 60 个 unreachable(次要), 即 328M 主体是「可达历史里的构建产物」
- [B gc 试跑] git gc --aggressive: 328M→177M(-151M/-46%), 耗时 70s; 零 history rewrite/force push, 分支与 reflog(93 条)全保, fsck 连通性干净; 收益机制=二进制 blob 入 pack 后 delta 压缩(同项目多版本二进制相似度高); 3455 loose 全部收编
- [B .gitignore 审查] 已忽略项齐备(.build//dev.log/*.db/.env/upload/tool-results/agent-ctx/worklog.md/*.db-wal 等); db/ 未被追踪(符合 bootstrap 重建策略, 维持现状); 两处「忽略但已追踪」(tracked-before-ignored): worklog.md(1 件, 历史 76 版)与 agent-ctx/(30 件)——报告不改(多 agent 并行轮次不宜动提交基线, 留主控定夺); web/covers 实际 487 张被追踪(平台 UUID checkpoint 自动提交所致, 与 README「产物不入版本库」陈述矛盾——这是沙箱重置后封面可从 git 恢复的数据保护机制, 未动仅报告)
- [C 根目录] 无 .bak/.old/一次性脚本残留; Caddyfile 判定保留(:81 反代 mini-services+XTransformPort SSRF 白名单, 现役部署资产); .env/.env.example/bun.lock/package.json/go.mod/go.sum 保留
- [C scripts] 收口后 7 件: 生命线 5(bootstrap-db/dev-go/dev-watchdog/install-go/recover, 逐字未动)+现役工具 2(mock-novel-site/ratelimit-site, 头注核实); ratelimit-site.ts 头注悬空引用修正(TS 时代 src/lib/crawl/calibrate.ts → 现行「后台规则测试/极限校准直连本站」口径, 纯注释); scripts/archive/ 只移不删政策未破
- [C examples/.zscripts/docs] examples/ 已不存在(R63-c 已删 websocket demo, 本轮核实零遗留); .zscripts/ 遵 R63-c 留档结论零触碰(dev.sh 为平台引导链现役件, dev.log/dev.pid 为其运行时产物); docs/ 盘点: INSTALL-GUIDE.md(准确)/INSTALL-GUIDE-r52.bak.md(README 在引, 留档)/anticrawler-tools-eval.md(独立主题评估存档)/rule-limits.md(rg 无 TS 时代残留)/legacy-seeds(builtin_rules.json source 字段引用)+images(INSTALL-GUIDE 引用) 全保留, 无重复内容需合并
- [D 收尾] go build -o .build/mhgl ./cmd/server OK + go vet ./... 零 + bash -n scripts/*.sh OK; rg 死引用复查: 运行时面对 9 个移动文件名零命中(唯一疑似 .zscripts/build.sh 实为调 mini-services-install.sh 子串误报), 文档面仅剩三类合法引用(退役指针/归档内部/历史 bak); du 终测: .git 328M→177M, 总仓 excl .git 282M→314M(差值= db 16M→47M 运行时回填增长, 非清理副作用; 归档为 git mv 等量迁移, scripts 3.0M→2.9M/docs 2.6M→2.8M)

Stage Summary:
- Docker 链退役落地(R64-d 报告执行): 9 文件 git mv 归档 docs/archive/docker/ + 归档 README(含退役三档矩阵, PARITY.md 本就不存在由其代持), 零删除全可考; README/DEPLOY/.env.example/scripts-archive-README 四文档同步裸机口径; 运行时零依赖 rg 实证; INSTALL-GUIDE.md 无 Docker 章节未动
- .git 325M 评估结论: 构成=历史误提交 Go 二进制≈298M(mhgl/server/crawler-go 多版本)+skills 平台大 HTML 35.6M+worklog 76 版本, 全为可达历史; git gc --aggressive 实跑 328M→177M(-46%)无 history rewrite; 进一步真瘦身需 history rewrite/force push(禁, 属远程协作基线, 留主控决策); 建议: 构建产物永不入库(.build 已忽略, 现状已防复发)/worklog 与 agent-ctx 可考虑 git rm --cached 落实 ignore 语义(主控窗口执行)/skills 大模板如平台允许可评估 LFS
- 删除/归档清单: 删除 0 件; 归档 9 件(git mv docs/archive/docker/); 改 7 文件(README.md/DEPLOY.md/.env.example/scripts/archive/README.md/scripts/ratelimit-site.ts/docs/legacy-seeds/seed-rule-pilishuwu.ts)+新增 1(docs/archive/docker/README.md)
- 留档报告三项(未动手): worklog.md+agent-ctx tracked-but-ignored 不一致; web/covers 487 张实际被平台 checkpoint 追踪与 README 陈述矛盾(实为数据保护机制); scripts/archive/ 2.7M 维持只移不删
- 门禁全绿: go build OK/go vet 零/bash -n OK; git status 改动清单明确(9 R+5 M+1 new; 另见并行 agent WIP 文件 internal/crawl/smart/tdk.go、internal/web/seo.go、web/static/js/admin.js、fetch/hdrorder_probe*_test.go, 非本 agent 领地未触碰)
---
---
Task ID: R66-c
Agent: R66-c
Task: API/Web/Smart 层逐行抓虫(用户指令⑤全面审查+⑥逐行抓虫)

Work Log:
- 门禁基线全绿(gofmt/vet/test/build)后逐行审: internal/api 全 18 文件 + internal/web 全 8 文件(公共逻辑/SSR 路径全读, 11 主题模板抽查公共挂点) + auth/config + internal/crawl/smart/tdk.go(R65 引擎, 任务书写的 internal/smart/ 实际位于 internal/crawl/smart/ —— 仅触碰该引擎子包, internal/crawl 其余零接触)
- A1 API 面: 全部 /api/admin/** 挂 requireAdmin 逐一核对(router.go 62 端点)、body 全走 readBodyMap(MaxBytesReader 5MB, encoding/json 自带 1e4 层深度上限)、注入面(orderBy/whereSQL 拼接源全为代码常量+白名单)、error 信封消毒(sanitizeRestoreErr 剥 file: 路径)、SSRF 面(bookUrl/listUrl/sourceUrl/logo/httpUrlOf scheme 白名单 → 引擎侧 SSRF 三层防线接续, fetchConfig.contentProxyUrl 包裹语义属 crawl 领地已留档)
- 实锤 bug 1(Medium·SEO, smart 引擎): BuildTDK 产出无长度钳制 —— 书名/作者/分类为爬虫可控数据(书名 200 字节级), 经 {占位符} 直出无界 <title>/<meta description>, 智能TDK 开启即重现 R64-c 修掉的「无界 TDK」病灶(且站点级覆盖模板 ParseSiteCfg 允许 500 码点入同病); 修: 引擎内 clampRunes(title≤40/desc≤160, 对齐 web/seo.go composeXxxTdk 站内口径, kw≤200 已有)
- 实锤 bug 2(High·并发, web/seo.go): tagReCache 共享 map 无锁读写 —— readHTML→contentToParagraphs→hasAnyTag 每次阅读页渲染调用(11 主题), 进程冷启动并发首遇即并发 map 写 = Go 运行时 fatal(不可 recover, 进程崩溃面); 修: sync.Mutex 包裹(键集固定 p/div/br, 锁开销可忽略)
- 实锤 bug 3(High·admin UX, web/static/js/admin.js): 系统设置「保存全部/添加键」PUT body 形态 {key,value} 与后端 adminSettingsPut「body=键值映射」契约错位 —— 实际写出 Setting 表名为 key/value 两个垃圾行, 目标设置永远保存不上(活体取证: /api/admin/settings 现存键无 key/value, 站长尚未踩雷的潜伏死功能); 修: 改发 {设置键:值} 映射(与 feedback.html 开关同款契约)+settings.html「留空键将被删除」失真文案改为「留空保存为空串读侧回落默认」
- 实锤 bug 4(Medium·admin UX, admin.js): TXT下载列表「下载」按钮 href=/api/public/download?file=... —— 该端点只认 ?id/?book, ?file 被忽略恒 400(活体 curl 实证), 按钮自上线即死链; 修: 改 ?book={bookId}(publicDownload 自动取该书最新 done 任务)
- 实锤 bug 5(Low·SEO 语法, smart 引擎): 空作者时 11 套书族模板直出「是创作的小说」「{作者}笔下」空洞语法; 修: tdkVals 空作者回落「佚名」(对齐 adminBooksCreate 手动入库缺省; 分类空值在各模板自然成句无需回落, 站名生产面恒非空)
- 回归测试: internal/crawl/smart/tdk_r66c_test.go 4 组(病态长输入全套×全页类型钳制断言/覆盖模板 500 码点入钳制/空作者佚名回落+非空不误伤/常规输入零截断钉) + internal/web/r66c_web_fix_test.go 2 组(tagReCache 16 goroutine×200 轮并发锤击(-race 绿)/contentToParagraphs 三形态语义钉含存储型注入转义)
- 审查方法论: 活体只读取证走 API(登录 jar/GET settings 键清单/GET sites smartTdk 状态/GET download?file= 状态码), 零触 :3000 进程与 db 文件; admin.js 改动 node --check 过
- 门禁收口: gofmt -l internal/ cmd/ 零/vet ./... 零/go test -count=1 ./internal/... 全 16 包绿/go build -o .build/mhgl OK(运行中进程持有旧 inode 不受影响, 新二进制待主控部署)/go test -race web+smart 绿; 轮内 transient: internal/crawl/engine.go atomic 未导入编译红(并行 agent WIP), 对方自行收口后终验全绿

Stage Summary:
- 改动 6 文件: internal/crawl/smart/tdk.go(产出钳制+佚名回落)/internal/crawl/smart/tdk_r66c_test.go(新)/internal/web/seo.go(tagReCache 锁)/internal/web/r66c_web_fix_test.go(新)/web/static/js/admin.js(设置保存契约+下载死链)/internal/web/tpl/admin/sections/settings.html(失真文案)
- bug 清单(根因一句话): ①智能TDK 无长度钳制=引擎缺站内码点上限对齐 ②tagReCache 竞态=包级 map 冷缓存无锁 ③设置保存死写=JS PUT 形态与后端映射契约错位 ④下载按钮死链=复用 cover 端点的 ?file 参数语义 ⑤空作者空洞语法=引擎值表缺佚名回落
- UX 审查发现(修复 3+报告 5): 修复=设置保存死写/下载死链/设置页「留空键将被删除」失真文案; 报告=①违禁词引擎(API 全套)无任何后台 UI 入口 ②backup.html「restore 暂缓见 PARITY」文案过时(POST /api/admin/backup/restore R56-2b 已实现)且后台无恢复入口 ③设置分区把全部 Setting 键以裸 JSON textarea 呈现(高级面保留, 但 feedback/proxyPool 等已有语义 UI 的键存在双头编辑互踩风险) ④validThemeIDs/themeCatalog 两处 11 主题硬编码清单与 tpl/themes 目录手工同步(加主题需三处同改) ⑤后台管理操作无审计日志(仅 TaskLog 面)
- SEO 审查发现(修复 1+报告 4): 修复=智能TDK 无界产出; 报告=①11 主题 canonical/og:type/og:title/og:description/og:url 全覆盖✓, 缺 og:image 与 JSON-LD 结构化数据(增强项) ②sitemap 双轨: web /sitemap.xml(首页/分类/书 2000, 无章节) vs /api/public/sitemap(分页 5000+章节+PSEO), 覆盖与口径不一 ③robots.txt 未 Disallow /feedback(已有 noindex meta 兜底) ④404 页无 noindex meta(HTTP 404 状态已足够)
- 遗留报告(领地外只记录): /api/public/chapter db 存储内容仅写侧清洗无展示级 sanitizeChapterHTML(纵深缺口, api 包不可 import web 修复需下沉消毒器, 且自有前端零消费该端点风险低); /api/admin/tasks control start 失败 400 透出管理器错误原文(R64-c 已留档维持); pseudoCuidTokenRe 大小写 PARITY 差异(R64-c 已留档); 智能TDK 修复需部署生效(活体站点 smartTdk 现为空=引擎休眠, 修复上线后才开启无暴露窗口); preset 2 标题双写风格长书名下会触发 40 码点截断(风格取舍留档)
---

---
Task ID: R66-a
Agent: R66-a(断连, 主控代录)
Task: 采集引擎反反爬突破+极限参数实测压测(用户指令①⑥)

Work Log:
- [断连前完成] fetch.go: 200 壳挑战页退避重试链(challengeRetryMax=2, base 400ms×2^attempt 钳 3s+0~50% 抖动, Retries=0 保持旧口径)+Set-Cookie 回写带证重访(challenge 形态与浏览器「领挑战→解题→带证重访」同构)+noteChallengePacing 按 host 反馈准入节奏(×1.5 钳 gateGapCap, 不枪毙并发额度——200 挑战证据强度低于 429/503)
- [断连前完成] engine.go: managerAdapter.stopping atomic.Bool——StopAll 置位后 scheduleAutoRefresh 醒来不再重启任务(修停机窗口内 autoRefresh goroutine 复活任务无人监管竞态)
- [断连前完成] blockcheck.go: looksBlocked 码点计数 4 次 O(n) 扫描合并为 1 次; 头 4000 截断改 rune 边界字节切片守卫式(语义不变零大额分配)
- [断连前完成] engine_stress_test.go 615 行极限压测 harness: httptest mock 源站(延迟/429 token-bucket/确定性 503·403 注入/5~50KB 正文)+本地 absolute-URI 正向代理回路+矩阵执行器(吞吐/错误率分账/p50·p95/HeapAlloc 峰值); 6 快测单元(门禁默认)+TestStressMatrixFull 全矩阵(MHGL_STRESS_FULL=1)+BenchmarkStressBatchThreads8; r66a_test.go 6 组挑战重试/Cookie 回放/退避曲线回归
- [断连残留, 主控修复] harness 三伤情: 130 行游离 s.mu.Unlockless() 幽灵调用删除; errRand.Intn 并发无锁(rand.Rand 非线程安全, handler 并发面)→bodySize() 持 mu 封装; stressMetrics 缺 lat 字段(312 行在用)补齐; envStressFull() 未定义补 os.Getenv 实现
- [主控修复] TestStressHarnessRateLimit429 断言错位: 429 被客户端 Retry-After 冷却+退避「透明消化」(rl=16 实证), 最终分账恒无 429 → 断言改打服务端注入分账 site.snapshot()
- [主控执行] MHGL_STRESS_FULL=1 全矩阵实跑 436s PASS(全 loopback 零外网)

Stage Summary:
- 反反爬新增: 挑战页退避重试+Cookie 回放+noteChallenge 节奏自适应+StopAll/autoRefresh 竞态守卫; blockcheck 热路径再省 3 次 O(n)
- 极限矩阵实证(A 常规档: pipeline 缺省 gap/gateLimit=3/global=10 清场源站): 线程 1→16 吞吐恒 271~298 章/分, 加线程只涨延迟(t=1 p95=245ms → t=16 p95=3.1s)——瓶颈在 hostGate 节奏非线程, 极限配置加线程无意义, 调 gap/gateLimit 才有效; 代理回路零损耗零错误(hops 逐跳核账精确)
- 极限矩阵实证(B 极限档: gap=0 gateLimit=threads, 源站 25rps+10% 503): 吞吐钉死 60~100 章/分=服务端配额, p95 8~9s=Retry-After 冷却主导, 错误率 6~10%≈注入 503-重试消化量; 引擎自身 16 线程×50KB 零降级 heapΔ≤3MB——引擎不是瓶颈, 源站配额才是
- 三档建议(R65)获本地实证背书: 保守/均衡档不变; 「激进档上限=源站限流值」从推测升级为实测结论
- 遗留: 头序随机化/h2 ALPN 覆盖评估未深入(时间盒), 建议下轮接续

---
Task ID: R66-b
Agent: R66-b(断连, 主控代录)
Task: 采集规则+清洗管线逐行抓虫+封面双点根治(用户指令①⑥)

Work Log:
- [断连前完成] bridge_content.go 封面双点根治: coverExtByType 返回值规范为不带点(png/webp/gif/jpg)+saveCoverFile 侧 strings.TrimPrefix 防御性规范化(双保险; web/covers 留档 38 个双点文件, git 实证 R63-c 引入 CreateTemp 模板后出现)
- [断连前完成] clean.go lonelyMaskAt 真虫: 前向扫描遇文本起点(loc[0]==0 或前缀全空白)恒返回 false, 与注释「或到文本起点」契约相悖——章节体首孤立 URL 行(HTML 模式无 <p> 包裹形态 "URL<br>正文")漏网; 修后 fwd 初始 true, 文本起点视同 '>' 边界与后向对称
- [断连前完成] bridge_cover_test.go +45 行(双点回归: 扩展名单点断言)/clean_test.go +33 行(体首孤立 URL 回收+行内防误伤)
- [主控核收] diff 逐 hunk 审: 两处改动语义正确, 测试全绿; lonelyMaskAt 语义收紧不伤合法内容(掩码 token 前置条件不变)
- [主控验证] 存量 6 个双点封面: 经真实消费路径 /api/public/cover?file= 返回 200 image/jpeg(coverFileRe 允许, 功能无损)——R65「功能无损留档」裁定维持, 文件名畸形已被根治阻断, 存量无需迁移
- [主控澄清] /covers/ 裸路径形态 404 是 URL 形态误用(前台 coverURL 恒走 /api/public/cover 包装), 非缺陷

Stage Summary:
- 封面双点文件名根治(双保险)+清洗体首孤立 URL 漏网真虫修复
- 规则矩阵未扩容(agent 断连时间盒): R65 基线 35 规则实测维持, 建议下轮抽样 8-10 条跨站点结构复验

---
Task ID: R66-final
Agent: main-controller
Task: R66 收口(开局恢复+四 agent 核收+门禁+部署+浏览器终验+commit+push)

Work Log:
- 开局核验: 沙箱再次重置(go-sdk+db 双清, 封面 487 文件因 git 追踪幸存)→ recover.sh 一键恢复(HTTP 200/35 规则/16 分类/bootstrap 三任务)→ 三采集任务启动回填
- R66-c 收工(6 文件): 智能TDK 产出钳制(title≤40/desc≤160 码点, 修爬虫可控书名直出无界 TDK)+空作者佚名回落; tagReCache 补 sync.Mutex(并发 map 写=进程级 fatal 崩溃面); admin.js 系统设置「保存全部/添加键」PUT 契约死写修复(修前写 key/value 垃圾行, 目标设置永存不上)+TXT 下载死链(?file= → ?book=); 设置区失真文案修正; 新增 tdk_r66c_test.go 4 组+r66c_web_fix_test.go 2 组(-race 绿)
- R66-d 收工: Docker 链退役落地(9 件 git mv 归档 docs/archive/docker/+README 退役说明/DEPLOY.md 裸机化重写); .git 328M→177M(-46%, git gc --aggressive 零 rewrite); 根目录/scripts/docs 清理整合; 评估留档: 可达历史误提交 Go 二进制≈298M 为 .git 主体, 真瘦身需 history rewrite(禁, 留主控决策)
- R66-a/b 断连核收: 工作树取证+diff 逐 hunk 审+断连残留三伤情修复(见 R66-a 条目)+worklog 代录
- 全门禁: gofmt 零/vet 零/14 包 test 全绿(含 fetch 29.6s 压测套件)/build OK
- 部署: 新二进制上线(watchdog 拉起 HTTP 200); 数据面回填 6 书/10415 章(yueyouxs 2499/2499 完+xbqg777 142/142 完+xyetianlian 5703/7774 进行中)
- 浏览器终验: 首页(16 分类导航+封面推荐数据)/书籍页(智能 TDK「万古神帝_飞天鱼小说全文免费阅读」生效)/阅读页(正文干净零噪声)/后台系统设置(添加键→持久化→保存值→持久化全链通, R66-c 死写修复实证)/全程零控制台错误
- 小发现留档: 设置 KV 无 DELETE 端点(GET/PUT only), 探针键以空串中和(惰性无害)

Stage Summary:
- R66 全部交付: 反反爬突破(挑战重试链+竞态守卫)+极限参数实测矩阵(引擎非瓶颈/源站配额是/加线程无意义三结论)+封面双点根治+清洗体首 URL 真虫+TDK 钳制+tagReCache 并发崩溃面+设置死写修复+Docker 退役+.git -46%
- 沙箱重置应对闭环: recover.sh 恢复→回填启动→数据面验证, 恢复生命线全链实证有效
---
Task ID: R67-d
Agent: R67-d
Task: 清理整合 round2（A worklog/agent-ctx 追踪基线评估落地 / B README 数据备份陈述修正 / C docs·根目录·scripts·.zscripts 复核 / D Go 死代码扫描报告 / E 量化收尾）

Work Log:
- 开局: 读 worklog 尾部(R66-d 留档三项+R66 收口); 基线量化: .git 179M / 总仓 excl .git 279M / docs 2.8M / worklog.md 1.5M(7899 行 291 条目, Task 3-a~R66-final, git 76 版本) / agent-ctx 292K(30 文件全 tracked-but-ignored, .gitignore 27 行在忽略); covers 493 tracked+未追踪动态增(采集进行时); db 零追踪; 运行进程/:3000/采集回填零触碰, internal/ web/covers/ prisma/ db/ 零触碰
- [A2 worklog 归档落地] 决策: 归档制(非维持现状)。python 按条目边界(三横线分隔行+下一行 Task ID: 标头)单次读-切-写: 285 条(Task 3-a~R65-d, 2026-09-10~09-24, 1.05M)→docs/archive/worklog-2026-09.md; 主文件保留 R65-final 收口+R66 全轮共 6 条(129 行/13.8KB)+头部归档指针; 归档件头部自带全条目索引(285 行: 起始行号+Task ID+任务一句话, 行号已实校 L298=首条/L8055=末条), 新 agent 指针→索引→行号三跳可达任意历史条目; 零损失对账 285+6=291; 写后尾部校验 R66-final 条目完好
- [A3 agent-ctx 处置] 抽读 3 类样本: 1-a-auth.md(TS 时代任务上下文档案: Files created/modified+实现注记)/go-engine/CONTRACT.md(mini-services 双进程时代采集契约, 单体化后已历史)/r49-8-cover-audit.md(封面审计输出); 判定=历史任务上下文档案(最新文件 9/20, 本轮零新写=非活跃机制, 但属平台 checkpoint 追踪保护面); 处置=保留追踪不动(292K 廉价+git 历史可考; 若主控执行 git rm --cached 落实 ignore 语义, 建议与 worklog 追踪语义一并决策)
- [B README 修正 2 处] ①目录树 web/ 行「产物不入版本库」失真→改为「covers 已被平台 checkpoint 自动提交进 git(重置可随仓库恢复)+web/static 静态源文件(入库)」; ②数据备份节重写为三类三机制口径: db/custom.db 不入库靠例行备份+recover.sh/bootstrap 重建(书籍章节不可再生务必备份)/covers 490+ 张 git 追踪=数据保护机制/worklog·agent-ctx·docs 协作档案 git 自带历史+归档指针; INSTALL-GUIDE §15.3 恢复资产表本就准确(covers git 内✅随仓库回来)未动
- [C1 docs 复核] INSTALL-GUIDE.md 核对准确(Go 单体口径/prisma 仅 recover 建表链/bun run dev→dev-go.sh 现役)零改动; rule-limits.md(ratelimit-site.ts 现役引用)准确; anticrawler-tools-eval.md=R27-1 独立研究存档(日期+历史口径自明)留档; 修 INSTALL-GUIDE-r52.bak.md 2 处悬空链接(agent-ctx/go-migration/PARITY.md+theme-audit.md 已散佚)→散佚说明+docs/archive/docker/README.md 三档矩阵代持指针; PARITY.md/theme-audit.md 顶层确认不存在(R66-d 已证 git 全历史无 PARITY.md)
- [C2 根目录+scripts] 根目录零残留(无 .bak/.old/探针/一次性脚本; dev.log=ignored 运行日志); scripts/ 7 件=生命线 5(recover/install-go/dev-go/dev-watchdog/bootstrap-db 逐字未动)+工具 2(mock-novel-site/ratelimit-site), 本轮无新增探针(git status 仅 covers+本 agent 改动); scripts/archive 遵「只移不删」未动
- [C3 .zscripts] 确认=平台引导目录现役机制(dev.log/dev.pid 今日 08:47 新鲜=平台今晨实跑 dev.sh; R63-c 已修 dev.sh 为 Go 引导链; 其 README 逐文件留档完整); 处置=零触碰(平台文件外部引用不可考); 分叉陈旧件(start.sh/build.sh/database-runtime-build.sh TS 时代形态)维持留档声明, 处置权主控/平台侧
- [D 死代码扫描·只报告] 方法: python 提取 internal+cmd 全部导出 func/type 声明, 全仓词频交叉引用(排除声明文件), 零引用候选逐个 rg 同文件/跨包复核, 剔除接口协议方法名(Error/String/ServeHTTP 等)与 _test 声明噪声
- [D 结论·生产零调用导出符号 9 项(全部声明后零消费, rg 全仓含测试零引用)] store 包 7: chapters.go ChapterURLIndex(TS 增量决策 existUrlMap 口径遗留)+InsertChapter / models.go UpdateTaskStatus(被 UpdateTaskStatusIf 取代, api+engine 在用后者) / settings.go SetSettingJSON / sites.go ListEnabledSites+SiteByDomain(TS 站群自动路由口径遗留) / web_extra.go WebBookDetail; crawl 包 2: task/task.go Manager.UptimeMs / fetch/fetch.go Client.FetchContent(contentProxy 包裹封装, 生产 contentProxy 经 fetchConfig 直配 engine/rule 面, 仅 1 测试调用); 未注册 handler=0(router 注册面全对上, api/web 包内小写 helper 均有包内消费); 导出但仅包内消费 8 项核实为活代码: auth.VerifySession(Service.Check 消费)/callback Send·SendWithDecision(回调链)/proxy.ParseSourceBody(Harvest 消费)/smart PageMode·WordBand(BuildTDK 消费)/task.StatusInfo(Status/snapshot)/store.ToMS(ToInt); 处置权主控(store 属 R67-a/b/c 领地本轮零触碰)
- [E 收尾] go build -o .build/mhgl ./cmd/server OK+bash -n scripts/*.sh OK; rg 复查: 归档指针/引用全可达, go-migration 仅剩历史性提及(归档件内+r52.bak 散佚说明), 无新增死链; git status= M README.md+M docs/INSTALL-GUIDE-r52.bak.md+M worklog.md(本条目)+?? docs/archive/worklog-2026-09.md(另平台新 covers 非本 agent); du 终测: worklog 1.5M→24K(-98%), docs 2.8M→4.2M(+归档件 1.1M), .git 179M 持平(归档 blob 待 commit 才入包), 总仓 279M→308M(+29M≈db 回填运行时增长至 42M 含 WAL, 非清理副作用)

Stage Summary:
- R66-d 留档项全部落地: ①worklog 基线=归档制(285 条 1.05M→docs/archive/worklog-2026-09.md 带全条目索引, 主文件 6 条 13.8KB+指针, 291=285+6 零损失) ②agent-ctx=历史任务上下文档案保留追踪(292K/30 文件, 非活跃机制但属 checkpoint 保护面, untrack 与否留主控一并决策) ③README 数据备份陈述修正(目录树 web/ 行+数据备份节三类三机制)
- 改动清单: 改 2(README.md / docs/INSTALL-GUIDE-r52.bak.md)+归档切分 1(worklog.md 重写为指针+近轮)+新增 1(docs/archive/worklog-2026-09.md); 删除 0 件
- 死代码报告(只报告, 主控定夺): 生产零调用导出符号 9 项(见 Work Log [D]), 未注册 handler 0, 包内消费型 8 项为活代码
- .zscripts=活跃平台机制零触碰; scripts 生命线 5 件逐字未动; internal/ 零触碰
- 量化: worklog.md 1.5M→24K; docs 2.8M→4.2M; .git 179M 持平; 总仓 279M→308M(+29M 全 attributable db 回填)
- 验证: go build OK / bash -n OK / git status 清晰; 未做: 未跑 go test 全套(并行 agent WIP 可能致瞬态红+非本任务门禁), 未动 .gitignore/worklog 追踪语义(R66-d 移交主控窗口决策)

---
Task ID: R67-a
Agent: R67-a(断连, 主控代录)
Task: 头序随机化评估+反反爬指纹增强+引擎逐行抓虫(用户指令②)

Work Log:
- [断连前完成] 逐跳 Referer 浏览器语义(strict-origin-when-cross-origin): 修前标准库对显式 Referer 原样透传到重定向链任一异源目标(泄漏+非浏览器指纹); 修后 ①https→http 降级不发 ②跨源仅发 origin ③同源全 URL 剥 userinfo; cfg.headers Referer 覆盖语义只作用首跳(与浏览器「重定向后 Referer 永远重算」一致)
- [断连前完成] 头序评估结论: Go 标准库 h1 头序字典序不可控, 头序仿真需 fork net/http(fhttp/azuretls 类, >100 行+新依赖)——只评估不动手留档; 转而做头集完整性: 家族化 Accept-Encoding(chromium/firefox 广告 br+zstd, safari 广告 br, 未知族保守 gzip,deflate)+readBodyDecompressed 补 brotli/zstd 解压(均为既有间接依赖, go.mod 转直接)
- [断连前完成] 指纹三修: Safari 纳入 Sec-Fetch(16.4+ 已落地 Fetch Metadata, 池内 UA 17.4/18.4 不发反自相矛盾; sec-ch-ua 仍不发); Sec-Fetch-User 恒 "?1"(修前有 Referer 发 "?0"=非浏览器特征, "?0" 从不上线); Edge sec-ch-ua 品牌集对齐真 Edge(Microsoft Edge+Chromium+GREASE, 修前混入 Google Chrome)+品牌序 FNV-1a(UA 种子)稳定置换(同 UA 恒序/异 UA 打散, Chrome GREASE 真实行为)
- [断连前完成] SSRF 面: CGNAT 100.64/10 纳入拒绝(net.IP.IsPrivate 不覆盖); 代理地址缺省端口补齐(http:80/https:443/socks5:1080, JoinHostPort 保 IPv6 括号, curl 同口径); 负 Retries 零值防御(修前 rawFetch attempts≤0 重试循环整体跳过=每抓必败)
- [断连前完成] r67a_test.go 回归; 主控核收 diff 逐 hunk+补 gofmt
- [主控验证] 全矩阵压测套件(fetch 29.6s)在新指纹面下全绿

Stage Summary:
- 头序仿真正确裁定: 标准库不可控需 fork, 只评估; 头集完整性落地(Accept-Encoding 家族化+br/zstd 解压成对)
- 指纹自洽性三修(Safari Sec-Fetch/?1 恒值/Edge 品牌集)+品牌序稳定置换
- SSRF 面补 CGNAT 段+代理缺省端口+负 Retries 防御; 逐跳 Referer 浏览器语义(泄漏+指纹双修)

---
Task ID: R67-b
Agent: R67-b(断连, 主控代录)
Task: task/queue+bridge 逐行抓虫+死代码处置(用户指令②)

Work Log:
- [断连前完成] queue.go 发现数终值对齐: 修前 discovered 只在页循环尾推进, 单轮上限命中(break pageLoop)或末页条目循环跳出时终页计数不落盘——进度面 discovered 恒为前一页值与实际脱钩(首页即达 maxURLs 时恒 0)
- [断连前完成] task.go Start 锁窗初始化: startedAt/phase 由 run 协程稍后置位, Start→run 首行窗口内 Status 快照 StartedAtMs 零值(管理面呈现「1970 年前启动」幻象)+phase 空串; 修后与 running 同锁置位
- [断连前完成] 死方法 Counts 删除(全仓零消费者+running 计数未排除 stopped 与 R53-5 口径不一致, 与其留语义陈旧死方法不如删, 未来接线按 snapshotLocked 重写); bridge_content.go 批内 URL 去重(修前同批重复项双双计入 chaptersUpdated 虚高; 去重判定置于 skip 检查后保 skip 语义不变)+封面孤儿文件预防(书行预检前移: 修前先落盘再定位书行, 书被中途删除窗口下 covers/ 残留无主孤儿且每次重发再写一份)
- [断连前完成] r67b_task_test.go+r67b_bridge_test.go 回归
- [主控核收] diff 逐 hunk 审, task 包 11s 测试绿
- [未做, 如实] 规则矩阵 8-10 条抽样复验未执行(断连时间盒), 建议下轮接续

Stage Summary:
- 4 真虫: discovered 终值脱钩/Start 锁窗 1970 幻象/批内 chaptersUpdated 虚高/封面孤儿文件窗口
- 死代码: Manager.Counts 删除(与 R67-d 死代码报告独立互证)

---
Task ID: R67-c
Agent: R67-c(断连, 主控代录)
Task: R66-c 审查发现 10 项落地+纵深消毒(用户指令①②)

Work Log:
- [断连前完成] internal/sanitize 公共包(自 web/seo.go 下沉, 对齐 TS R33 口径): 危险块级标签连内容剥离/on* 属性剥离(含 "/" 属性分隔符变体)/href-src scheme 白名单(单遍字符引用解码+剥 \t\n\r+C0 控制符, jav&#x09;ascript: 等编码变体全拦)/标签 span 引号感知; /api/public/chapter 输出面接入展示级消毒(R66-c 纵深缺口闭环)+web 层改消费公共包
- [断连前完成] 主题注册表单一来源(internal/web/themes.go): id 清单动态读 embed FS tpl/themes 目录+themeMeta 登记表; api 层 validTheme/adminThemesList 改读注册表(修前三处 11 主题硬编码手工同步, 漏改即非法主题入库/清单缺新主题); 新增主题=加目录+登记一行
- [断连前完成] og:image+Book JSON-LD: head map OgImage/JsonLD 键+11 主题 layout 全接入; bookJSONLD 用 json.Marshal 默认 HTML 转义(<>&→\uXXXX 数据面注入无法逃出 script)+template.JS 包装(实测 html/template script 上下文对字符串会二次引号化破坏 JSON 结构, template.JS 原样放行——正确技术洞察, 注释留档)
- [断连前完成] 设置 DELETE 端点(DELETE /api/admin/settings/{key}): protectedSettingKeys 核心键白名单(rg 全 internal 读点全集 9 键: bannedWords/seoTemplates/theme_overrides/linkwheel/feedback/pseoAutoGenerate/proxyPool/download/pseudostatic)拒绝删除并提示复位路径+key 正则+404; admin.js 删除按钮(核心键显「核心键不可删除」)+确认对话框
- [断连前完成] 违禁词结构化编辑 UI(SETTING bannedWords 语义化: 启用开关/mask|remove 模式/逐行词表+空表启用防御; GET/PUT /api/admin/banned-words 新端点); 双头消歧 SETTING_LINKED 联动标注(bannedWords/proxyPool/feedback 三键)+语义侧保存后刷新 KV 列表; backup.html restore 文案+恢复表格中文标签
- [断连前完成] robots.txt 补 Disallow: /feedback; sitemap 双轨统一(web /sitemap.xml 301 至 api 轨, 视图/分类面 sitemapStaticEntries 并入单页与分页两分支口径一致)
- [断连前完成] r67c_test.go+r67c_web_test.go 回归
- [主控修复] TestPublicSitemapIncludesViewsAndCategories fixture 缺 pseudostatic Setting(APIPseudoPreset 缺省回落 query→书籍面查询形态, 断言 /book/1001.html 落空); 补 {"preset":"numeric"} 与生产形态一致
- [主控核收] gofmt 补齐 r67c_test.go; import 方向核实(api→web 单向无环)

Stage Summary:
- R66-c 审查发现 10 项全落地: 违禁词 UI/restore 文案/双头消歧/主题单一来源/设置 DELETE/robots /feedback/og:image/JSON-LD/sitemap 统一/chapter 消毒纵深
- 新包 internal/sanitize(15 包测试含它全绿); 新端点 banned-words GET/PUT+settings DELETE
- 浏览器终验(主控): robots 含 Disallow:/feedback; 书籍页 og:image(新数据单点封面)+JSON-LD 合法(Book/我 在万界送外卖); 后台违禁词 UI/联动标注 4 处/非核心键添加→删除按钮→确认→UI+服务端双消失全链通; 核心键 0 删除按钮(白名单生效实证)

---
Task ID: R67-final
Agent: main-controller
Task: R67 收口(开局恢复+三 agent 核收代录+门禁+部署+浏览器终验+commit+push)

Work Log:
- 开局: 沙箱第四次重置(go+db 双清)→recover.sh 恢复→三任务启动回填
- R67-d 收工: worklog 归档制(1.5M/7899 行/291 条 → 13.8KB/129 行, 285 条历史进 docs/archive/worklog-2026-09.md 含全条目索引+行号三跳可达, 零损失对账 285+6=291); README 数据备份三机制口径修正; INSTALL-GUIDE-r52.bak 悬空链接修复; agent-ctx 保留决策(平台 checkpoint 保护面); 死代码报告 9 项(store 7+crawl 2, 生产零调用, 留主控排轮)
- R67-a/b/c 断连核收: 工作树取证+diff 逐 hunk 审+三处收尾(r67c_test fixture 补 pseudostatic/gofmt 补齐/import 无环核实)+worklog 代录
- 全门禁: gofmt 零/vet 零/15 包 test 全绿(含新 sanitize 包)/build OK/node --check OK
- 部署: kill→watchdog 拉起→三任务重启→数据面 7 书/11638 章
- 浏览器终验: 见 R67-c 条目 Stage Summary 末行

Stage Summary:
- R67 全部交付: 反反爬(逐跳 Referer+指纹自洽三修+头集完整性+SSRF CGNAT)+4 真虫(discovered/1970 幻象/虚高/孤儿文件)+R66 审查 10 项全落地+worklog 归档制(-98%)+主题注册表单一来源
- 移交下轮: 规则矩阵抽样复验(R67-b 时间盒未做)/死代码 9 项移除决策/头序仿真 fork 评估(留档)/token 轮换持续提醒

---
Task ID: R67-b-supplement
Agent: main-controller
Task: R67-b 遗留矩阵数据打捞(.r67b-work/matrix.jsonl 断连前已产出未及上报)

Work Log:
- 发现 R67-b 断连前已实测 10 条规则矩阵于 .r67b-work/matrix.jsonl(工作目录被误提交), 数据打捞后补录, 目录清退出库

Stage Summary:
- 规则矩阵(10 条跨站点结构): PASS 7 = 努努书坊(197 书/toc 14)/飘天文学(toc 9743)/茉莉小说/手机小说(杰奇WAP GBK)/八零电子书(toc 200)/WuxiaWorld Lite(toc 500)/久久小说网(toc 1313)——list/book/toc/content 四阶段全通
- FAIL 3(均 list 阶段): 同人小说网(上游 502 网络层)/笔趣阁(403——测试端点不应用 contentProxyUrl 的已知语义局限, R65 澄清口径)/错层小说网(反爬拦截页, 需代理+镜像通道, 与固化降速参数场景同族)
- 结论: 35 规则中抽样 10 条 + R65 实测若干, 规则面总体健康; 3 条 FAIL 属源站网络/反爬形态而非规则 selector 失效
