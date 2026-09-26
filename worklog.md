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
---
Task ID: R67-fix-readbg
Agent: main-controller
Task: 用户指令——aijjxs 模版阅读页正文设置默认底色与页面整体底色一致

Work Log:
- 定位链路: 页面整体底色=米黄渐变(site.css:246 body.clone-aijjxs:has(.ajx-read)); 正文两层底色=玻璃外卡 .ajx-view-content rgba(255,252,246,.72)(site.css:239) + site.js:22 默认硬涂 #f8f8f8(冷白) 于 #view_content_txt 内联——冷白 slab 与暖米页面不一致为用户所指问题
- site.js: 默认底色主题作用域化——判据 ajxPageBg=.ajx-view-content 存在(aijjxs 专属标记, rg 实证 11 主题仅 aijjxs 有), 命中时默认 bg=''(不涂色, CSS transparent 生效), 其余 10 主题维持 #f8f8f8 原状; prefs.bg 用户显式选择恒优先; apply() 内联动 card.classList.toggle('is-pagebg', !bg)
- site.css: 新增 .clone-aijjxs .ajx-view-content.is-pagebg{background:transparent}——默认态玻璃卡让位(仅留边框阴影), 页面米黄渐变完整透出, 正文底色与页面整体底色逐像素一致; 选定背景后类移除玻璃卡恢复(与 R59-2a 真站玻璃卡设计兼容)
- aijjxs/layout.html: site.css/site.js/pwa.js 缓存戳 ?v=r56-2c → ?v=r67-a; 重建走 dev-go.sh 增量(building… 实证), 静态 css/js 磁盘服务即时生效
- 顺手清前轮 gofmt 债: internal/api/r67c_test.go 整文件格式化(git diff -w 实证纯空白差异零逻辑变化), gofmt -l 全绿
- 运维: 进程重启致 xyetianlian 采集任务 paused(优雅停机置位), POST control start 恢复运行(84/312 推进中); xbqg777 重启窗口期自然跑完(done 141/142); 新进程日志重定向 /tmp/main-dev-restart.log(NO-FATAL)

Stage Summary:
- 阅读页正文默认底色与页面整体底色一致已落地并三层验证: ①DOM computed: 默认态卡底 rgba(0,0,0,0)+txt 无内联涂色+is-pagebg 挂载+0 色块高亮 ②交互闭环: 选色→涂色+玻璃卡恢复+localStorage 记忆→刷新持久化→清偏好回归页面底色 ③像素实证: 卡内 (238,229,215) 与同水平线页面底色三采样逐像素相等(对照玻璃标题卡 249,244,234 偏亮符合设计)
- 隔离性: 其余 10 主题行为零变化(守卫判据+守卫外代码路径不变); 375px 移动端同验证通过; 浏览器 console 零错误
- 用户选色后暂无"回归页面底色"色块入口(清 localStorage 可回归), 记为可选后续项

---
Task ID: R68-d
Agent: R68-d
Task: item 12 图文部署教程重写 + item 6 自愈启动链落地(「预览总是挂掉」根治)

Work Log:
- 开局补课: 通读 worklog 归档指针+R65~R67 各条(重点 R66-d 归档制/README 三机制口径/.zscripts 平台零触碰; R67-d INSTALL-GUIDE 核对基线); 环境实况采集: :3000 存活(200)+看门狗在跑+go-sdk 1.24.5 在位+db 16M 在位; 全程零 kill/restart, 运行服务与采集任务零触碰(终验 uptimeMs 连续, 任务 running 状态贯穿全轮)
- [关键事实核证] GOTOOLCHAIN 双版本口径: install-go.sh 装 1.24.5 基础工具链, go.mod 声明 1.26.0 → 项目内 go 命令经 GOTOOLCHAIN=auto 自动切 1.26.0(缓存 ~/go/pkg/mod/toolchain@*, 项目外 version 显示 1.24.5 属正常); store.Open 零迁移实证(db.go: 缺核心表直接 fatal "table missing/incompatible", 推翻旧教程「服务自动建表」陈述); clone URL 对齐: git ls-remote 双证 mhgl.git main==本地 HEAD(378fc48), heis.git main 异 hash(46eaca24)=陈旧镜像 → origin mhgl.git 为权威
- [item 6 落地] scripts/dev-go.sh 自愈化(+75 行): ①go 缺失→自动 install-go.sh 幂等安装+re-export 重检(显式 GO_SDK_BIN 指向缺失时尊重定制位只报错不自装; 安装失败友好报错 exit 1, 修 set -e 短路吞消息问题); ②DB 缺失/0 字节/缺核心表(Task/Book/Chapter/Rule/Category, python3 sqlite 深查无 python3 时文件非空按可用)→DATABASE_URL 按 DB_PATH 绝对路径对齐 bunx prisma db push 建表(联调 DB_PATH 覆盖语义保持)→构建完成后挂后台探活子壳(300s 窗, 放构建后避免首次构建吃掉额度): 服务 200 后自动 bootstrap-db.ts 幂等引导(35 规则/16 分类/默认站点/3 任务不自动开采); 总开关 MHGL_AUTO_BOOTSTRAP=0 整套关闭; 增量构建/exec 形态/PORT/DB_PATH/MEM_LIMIT_MB 覆盖逐字不变
- [item 6 隔离验证(在线服务零风险)] bash -n 4 脚本全过; /tmp/r68d-test 桩件干跑(仅 go build/exec/prisma push/bootstrap/超时常量 5 处替换为 echo/加速, 检测逻辑字节级同源, PORT=5999 防误连线上): T1b go缺+DB缺双自愈全链过/T1c 安装失败友好报错 exit 1 过/T2 开关关闭过/T3 GO_SDK_BIN 显式缺失 exit 1 不自装过/T4 完整库跳过过/T5 0 字节库触发过/T6 有文件无核心表触发过; 真实库 db_ready 等价逻辑 mode=ro 核验 True(现网行为=跳过自愈, 与旧版一致); 插曲如实记录: T1c 首跑 sed 锚定失误致真实 install-go.sh 实装 1.24.5 进 /tmp/r68d-test/fakehome3(非 $HOME 非系统目录, 已清理, 生产 ~/go-sdk 未动)
- [item 6 顺手微调] recover.sh: 新增 RECOVER_START_TASKS=1(bootstrap 后自动启动本次新建任务, 已存在任务不动)+[6/6] 报告新增「任务续采」行(paused 任务后台「启动」或 POST control {"action":"start"}); RECOVER_DRYRUN=1 对在线服务实跑验证全绿(报告: 200/35 规则/5 书/16 分类); install-go.sh 陈旧「run.sh 会自动加 PATH」注释修正为 dev-go.sh/recover.sh 现役口径; README: 预览挂掉→recover.sh 显眼化(快速开始醒目提示块)+新增「故障排查速查」表 5 行(预览挂/go not found/端口占/paused 续采/GBK 乱码)+常用命令表与 scripts 约定同步自愈化口径+clone URL 修正 heis.git→mhgl.git(origin 实证; DEPLOY.md 同病灶不属领地只报告)
- [item 12 落地] docs/INSTALL-GUIDE.md 全文重写(646 行 diff, 十章+极简清单): §1 前置条件(硬件表/bun 官方 curl+版本样例/git/Go 两路径+GOTOOLCHAIN 双版本口径细讲); §2 获取代码(clone+11 目录逐一注解+.env 四行起步); §3 数据库初始化(零迁移机制澄清框→prisma db push 预期输出→bootstrap 装什么五件套表格+预期输出→迁移路径); §4 启动(bun run dev 真实链路 ASCII 图解/首次构建耗时表/200+healthz 验证/联调覆盖/自愈行为表+关闭开关/常驻两形态/Secure Cookie R62-f 要点保留); §5 看门狗(15s 拉起+日志路径表+自建部署改路径提醒); §6 管理后台(登录/密码三口径/导航/任务三模式与参数/代理池/主题 11 套); §7 recover.sh(使用场景/六步逐条表格/DRYRUN+START_TASKS+ADMIN_PASSWORD/恢复资产表/预览挂掉根因科普表); §8 数据备份三类三机制(与 README 逐字同口径); §9 FAQ 十问(全部含可直接复制命令); 附一分钟清单; 4 张新截图对应插入 §4.3/§6.1/§6.2/§6.3
- [item 12 截图] agent-browser 实拍在线站点(1360×900): install-01-home 前台首页/install-02-admin-login 登录页/install-03-admin-dashboard 登录后仪表盘(真实登录流程)/install-04-admin-tasks 任务管理页; PIL 校验 5 张全非空白(采样数百 distinct colors)+尺寸齐; 删除与 04 重复的整页版; 截图内容审计: 公开页+任务名/进度, 无 token/密钥泄露
- [收尾门禁] bash -n scripts/*.sh 全过; 教程图片引用 4/4 文件存在; 教程引用脚本/文档 10/10 存在; 禁词核查零(无 history rewrite/force push/Docker 操作指引, 仅「不需要 Docker」合法表述); 服务终态: 200+healthz ok+任务 running 未受扰; 未动领地: internal//web//prisma//package.json/.zscripts/worklog 外协作档案零触碰(git status 中 internal/* web/static/* 修改均为并行 agent WIP)

Stage Summary:
- item 6 交付: dev-go.sh 自愈化双分支(go 自装+DB 自举)落地并 7 场景桩件验证全过, MHGL_AUTO_BOOTSTRAP=0 可关, 现网行为零变化(db_ready 只读核验); recover.sh +RECOVER_START_TASKS+任务续采报告行; install-go.sh 注释现役化; README 预览挂掉速查显眼化+clone URL 对齐 origin(附 DEPLOY.md 同病灶报告)——沙箱重置三连杀(进程/SDK/DB)从「手动 recover 才能救」升级为「bun run dev 即自愈, recover.sh 兜底复核」双层防线
- item 12 交付: INSTALL-GUIDE.md 面向从零部署者全重写(十章结构/每步预期输出/命令逐一与仓库现役核对), 纠正旧教程两处失实(「服务自动建表」→零迁移必须 prisma push; install-go 版本口径→1.24.5+GOTOOLCHAIN 1.26 双层真相); 4 张 install-XX 新截图; 备份件 INSTALL-GUIDE-r52.bak.md 未动(遵 R66-d/R67-d 裁定)
- 验证证据: bash -n 全绿/T1b~T6 桩件矩阵/recover.sh DRYRUN 实跑报告/图片引用 4/4+引用文件 10/10/禁词零/服务存活+任务未受扰
- 移交报告: ①DEPLOY.md(非领地)clone URL 仍指 heis.git 陈旧镜像, 建议主控同步改 mhgl.git ②dev-watchdog.sh 硬编码 cd /home/z/my-project(沙箱路径), 自建部署需手改, 教程已注明, 通用化(动态取项目根)留后续轮评估 ③install-go.sh GO_VER=1.24.5+go.mod 1.26.0 依赖 GOTOOLCHAIN 网络下载, 若想免二次下载可评估直接钉 1.26.0(本轮保守未动, 现行为实证可用)
---
---
Task ID: R68-a
Agent: R68-a(断连, 主控代录)
Task: items 2/8 反反爬增强+引擎逐行抓虫

Work Log:
- [取证核实] rawFetch 闸门按候选 host 归属: 修前整条 mirror 链共用主 host 闸(镜像 host 无 pacing 汇聚点+镜像 429/503 误把主站闸打入冷却窗+「429 换镜像不受本 host 冷却约束」承诺未兑现); 修后每候选按自身 host 取闸换闸
- [主控补修 R68-a-fix] 候选循环两缺口: ①同 host 双候选(MirrorDomains 重复配置成对同域, mirrorGroup 实证可产出)②urlHostOf 失败返回 "" 不触发换闸 —— 两形态都在未持闸状态进入 attempts 循环(绕过 pacing+错误路径无条件 release 超发闸票); 修后「进 attempt 前置闸」不变式+release 按 gateHeld 状态精确收放
- [取证核实] Cf-Mitigated: challenge 响应头判定接线(CF 官方挑战信令, body 特征缺失时的零误伤补判; blockcheck 出口判定取或)
- [取证核实] blockcheck 词表扩充: strongBlockMarkers 补 challenges.cloudflare.com(Turnstile 组件/托管挑战脚本宿主); weakBlockMarkers 补中文 WAP 拦截文案族(访问过于频繁/请开启浏览器javascript/启用javascript, 短页无标题才扫, 正常标题豁免不误伤)
- [取证核实] proxy.go SOCKS4a 握手规范线形修复: 修前 append(req[:len-1],hostname+NUL) 剥掉 USERID 终止 NUL, 严格解析的 4a 服务端把 hostname 当 USERID 读→握手超时代理被误判死; 修后 USERID NUL 保留+hostname NUL 追加其后
- [取证核实] queue.go 两修: ①stop 引发的列表页请求取消不计失败(与 pipeline stopInterrupted 口径一致)②列表页 200 壳拦截页按等价 HTTP 403 处置(计失败+推进连败链+熔断尊重; 修前 Blocked 结果 err=nil 落解析层 0 条新增被误诊「已越过站点末页」且 stats.Errors 零记账)
- [回归测试 4 件套(主控补齐落地)] r68a_test.go: Cf-Mitigated 头挑战走重试链(1+min(Retries,2) 请求预算)/blockcheck 新词表正反例(强标记无豁免+弱标记正常标题豁免 n≥1200)/mirrorGroup 同 host 候选对存在性证明/rawFetch 同 host 双候选闸票收放不变式(503+Retry-After:1 钳冷却窗 2s 级跑完; 两轮全败后恢复源站闸状态完好)
- [时间盒外如实] utls TLS 指纹评估未完成(断连); 头序随机化维持 R67-a「需 fork net/http 只留档」结论不变

Stage Summary:
- 4 真虫修复: mirror 链闸门误责+无 pacing 汇聚/Cf-Mitigated 信令漏判/SOCKS4a 握手剥 NUL/queue 拦截页零记账误诊
- 主控补修闸门持闸不变式缺口(同 host 双候选超发闸票); 回归测试 4 件套+task 包 2 件全部落地
- 门禁: gofmt 零/vet 零/fetch+task+rule+clean 测试全绿/build OK

---
Task ID: R68-b
Agent: R68-b(断连, 主控代录)
Task: item 11 每条规则噪声清洗核验+clean/rule 逐行抓虫

Work Log:
- [取证核实] clean.go 缺省广告词表补 3 条生产 DB 旁证模式(万相之王/xyetianlian 现役残留): ①杰奇CMS 书页页脚水印行(作者：X所写的《Y》无弹窗…转载作品, 收入缺省表使 intro/content 双出口覆盖)②翻页标记变体(本章未完+点击…继续阅读, 方括号/箭头残尾形态)③书名【】空壳推广行(【X】+空白+空【】)
- [取证核实] rule/parse.go collapseSpaceRe 空白折叠类补全 unicode 空白族(U+00A0/U+3000/U+2000-200A/U+2028/2029/U+202F/U+205F/U+FEFF; 修前裸 \s+ 不含, 注释宣称"含全角空格族"与实现相悖, "连载\xa0中"类字段值原样带 nbsp)
- [主控补齐回归测试] clean_test.go TestR68bJieqiFooterAndPagerPatterns(3 正例+3 防误伤反例+整体回收断言); rule_test.go TestR68bCollapseSpaceUnicodeFieldValues(6 用例含 U+2005/U+2028/U+FEFF)
- [主控生产旁证复核] 只读副本抽检最新 400 章: 杰奇页脚水印 0/翻页变体 0/空壳推广 0/URL 行 0/U+3000 壳 0; nbsp 68/400 经上下文抽样判定均为正文合法形态(章节标题分隔符/英文名/段首缩进), 非噪声无需处理
- [时间盒外如实] 35 条规则×四阶段全矩阵实测未完成(断连); 本轮交付=生产数据旁证+清洗面增强+历史 bug 回归(R63-d/R66-b 既有测试全绿)

Stage Summary:
- 缺省清洗词表+3 生产实证模式(含防误伤反例); 字段值空白折叠 unicode 补全
- 生产旁证: 新采集面 5 类噪声 0 残留; nbsp 判定合法形态
- 门禁: clean+rule+fetch+task 测试全绿; builtin_rules.json 零改动(35 条)

---
Task ID: R68-c
Agent: R68-c(断连, 主控代录)
Task: items 5/10 主题回源 1:1 对比+每主题每页面核实+aijjxs 回归底色入口

Work Log:
- [取证核实] aijjxs 分类页 1:1 数字分页(public.go pager 扩展 Pages±4 窗口最多 10 个+LastURL 尾页; category.html 总数徽标+数字页码+当前页 b 标记; site.css .ajx-pager>b 品牌底 34×30 对齐源站 .pager 形态) —— 浏览器实证: 总数徽标 5+当前页渲染+样式(brand 底/30px/34px)全中
- [取证核实] aijjxs 对齐源站终态 4 处: 顶栏三停暗红渐变+内阴影立体化(原单色)/logo 深橙棕 800+text-shadow+品牌渐变短划(R59 素色口径过时)/listbg 封面 92×128 左留 118(修前 112×154/148 为真站 HTML 属性值非 CSS 终态)/移动端 listbg 100px 槽 76×104+圆角 12
- [取证核实] aijjxs 书页作者其它作品栏(模板挂点 {{if .AuthorOthers}} has-side 本就存在而 CSS 缺失): 补 .has-side 三列 grid+第三列虚线暖底卡+900/680 断点响应式; 当前 DB 无同作者多书故不渲染(逻辑自洽, 有数据即现)
- [取证核实] aijjxs 阅读页: 页脚暖渐变圆角卡+回到顶部钮 read 页 bottom 18px(其余页 88px)+搜索框 placeholder 对齐源站文案+6 色块源站命名(蓝色回忆/灰色天空/青山不老/粉红世家/明黄清俊/雪白世界)
- [取证核实] R67-fix 遗留项落地: 「回归页面底色」色块(.ajx-c-restore 米黄渐变打底+斜杠示意清除, data-bg="" 清偏好) —— 浏览器闭环实证: 7 色块挂载/选色→玻璃卡恢复+localStorage 记忆/回归→透明+is-pagebg+记忆清空/刷新持久化; R67-fix 默认态零回归
- [取证核实] 其余主题 is-active 选中态补齐(kks101/pili/shipsay/trxsw 阅读工具条修前无选中反馈; 色取自各主题品牌色, 作用域 .clone-{id} 零越界); pili 阅读页三处对齐源站 read.css(标题 24px/32px+min-height 600px+边框 #d8d8d8)
- [主控收尾] 4 主题 CSS 缓存戳同步 bump ?v=r68-c(kks101/pili/shipsay/trxsw, 静态 css 磁盘服务配合缓存破除); aijjxs layout 戳 R68-c agent 已自更
- [时间盒外如实] 其余 6 主题(ddyueshu/x2552/huangjinwu/ggd66/qb23/shipsay 页面级)逐页回源对比未完成(断连); 源站可访问性差异大(pili CF 防护等), 已完成主题均以实测源站 CSS 为据

Stage Summary:
- aijjxs 分类分页 1:1+顶栏/logo/封面卡/阅读页脚 5 处对齐源站终态+回归底色入口闭环
- 4 主题工具条选中态补齐+pili 阅读页 3 处对齐; 缓存戳 5 主题同步 r68-c
- 浏览器终验: 阅读页交互闭环/分类分页渲染/375px 零溢出/console 零错误

---
Task ID: R68-final
Agent: main-controller
Task: R68 收口(开局恢复+预览根因+4 agent 核收+死代码清退+门禁+部署+浏览器终验+commit)

Work Log:
- 开局: 沙箱第五次重置(进程/go/db 全空)→ recover.sh 一键恢复全链实证(装 go1.26/prisma db push/bootstrap 35 规则 16 分类 3 任务/看门狗); 新任务 ID 由 bootstrap 生成
- item 4: 三任务启动快速填充 —— yueyouxs 跑完(2 本大部头)/xyetianlian running(万相之王 1838 章完+女帝转生 8188 章推进)/xbqg777 running(固化降速); 数据面 7 书/11910 章(10767 已采正文)
- item 6 根因闭环: 「预览总是挂掉」=沙箱重置杀进程+清 $HOME Go SDK+清 DB→3000 无人监听; 平台引导链 .zscripts/dev.sh→bun run dev→dev-go.sh 修前 go 缺失直接 exit 1 不自安装+DB 缺失不自举; R68-d 落地 dev-go.sh 自愈化(go 缺失自动 install-go.sh/DB 缺失自动 prisma db push+bootstrap, MHGL_AUTO_BOOTSTRAP=0 可关)+recover.sh RECOVER_START_TASKS=1+README 故障排查速查表; 本轮实测 recover.sh 兜底链路全程有效
- R68-a/b/c 断连核收: 工作树取证(git diff -w 区分格式噪音/真实变更 682 行)+逐 hunk 审+fetch.go 闸门持闸不变式缺口补修+回归测试 6 件补齐落地(fetch 4/clean 1/rule 1)+task queue 2 件+worklog 代录
- item 3/9 死代码清退 9 项全落地(R66-d 报告主控定夺): store 7(UpdateTaskStatus/SetSettingJSON/ChapterURLIndex/InsertChapter/SiteByDomain/ListEnabledSites/WebBookDetail)+crawl 2(Manager.UptimeMs/Client.FetchContent; 测试调用点改 FetchContentRef 等价); 每项留注释指向替代口径
- 全门禁: gofmt 零/vet 零/15 包 test 全绿(fetch 30.7s 含新回归)/build OK; 4 主题缓存戳 bump r68-c
- 部署: 重建二进制→pkill→watchdog 5s 拉起→三任务 control start 恢复→数据面推进实证
- 浏览器终验: 首页 7 书全呈现/书籍页标题正常/阅读页回归色块 7 挂载+选色回归双向闭环+localStorage 记忆/刷新持久化/分类页数字分页(总数徽标+当前页 b 品牌底 34×30)/375px 零溢出+封面 76px/console 零错误
- DEPLOY.md clone URL heis.git→mhgl.git(R68-d 移交项, git ls-remote 双证口径)

Stage Summary:
- R68 全 12 条交付: ①⑦遗留(kv DELETE 上轮已落地/R66-a 头序留档维持)+②⑧引擎 5 虫修复+反反爬(Cf-Mitigated 信令/词表扩充/闸门不变式)+③⑨死代码 9 项清退+④采集填充(7 书 11910 章实证)+⑤⑩aijjxs 深度对齐+4 主题选中态+⑥预览根因自愈链落地+⑪清洗增强+生产旁证+⑫图文教程重写(646 行 diff+4 截图)
- 移交下轮: 35 规则×四阶段全矩阵实测(R68-b 时间盒)/其余 6 主题逐页回源(R68-c 时间盒)/utls 评估留档/同作者多书数据后 author-side 栏视觉复验/token 轮换持续提醒
---
Task ID: R69-C
Agent: R69-C
Task: api/web/store/sanitize/auth 逐行深度抓虫 + 清理精简

Work Log:
- 开局: worklog R66–R68 尾部通读 + git log -3; 门禁基线确认全绿(vet 零/6 包 test 绿/gofmt 零)
- 领地逐行审读: auth(auth.go 全文)/sanitize(全文)/config(全文)/api(router+middleware+auth+admin_dash+admin_ops+admin_books+admin_tasks+admin_taxonomy+admin_rules+admin_content+public_data+public_files+feedback+banned_words+tdk_site+pseo_auto+pseudostatic)/web(router+routes+themes+admin+pseudo+render+seo+public 全 1165 行)/store(models+id+settings+site_tdk+sites+chapters+api_extra+web_extra+crawl_extra+feedback+pseo_auto, db.go 只读旁证)
- [Bug#1 实证] sanitize 探测解码 fail-open: /tmp 探针实证 IsSafeURLValue("javascript&#58alert(1)")=true 且 ChapterHTML 原样放行 —— HTML5 属性值中数字实体免分号合法, 浏览器解出 javascript: 而修前探测把末位数字当分号剥掉(chr(5)) scheme 失配; 存储型 XSS 向量(采集正文出链)
- [Bug#1 修复] decodeCharRefsOnce 十进制/十六进制两臂改「仅在有分号时剥分号」(sanitize.go:61-86); 向量面勘误: hex 形态用 prompt 载荷('a' 属 hex 贪婪吞并两侧同口径, 非可利用形态)
- [Bug#2 修复] web/routes.go serveWebStatic Cache-Control 硬编码 max-age=3600 无视 maxAge 参数(manifest.webmanifest 注册 300 形同虚设); 改 fmt.Sprintf 用注册值, import 补 fmt
- 回归测试 3 件: sanitize_test.go TestChapterHTML_NoSemicolonEntityRef(5 不安全判定+端到端剥离+相对地址防误杀)/web_test.go bypass 表+IsSafeURLValue 各补无分号向量 2 条/TestServeWebStatic_CacheMaxAge(chdir 模块根, 300/0/3600 三 case 逐字断言)
- 清理精简核查: 全领地 unexported+exported 函数 rg 调用计数扫描(定义外零引用判据) → 死代码 0 项(上轮 R68-final 已清 9 项, 本轮零新增死债); 跨包重复小件(truncateRunes/clampCodePoints/escape 变体/itoa 变体)评估后不动 —— 合并需导出新符号或改 import 图, 违背「导出面稳定+最小手术 diff」裁定, 如实记录
- admin.js/site.js/node --check 双过零语法错误; DOM 访问守卫(!rows||!rows.length)齐全零改动; CSS 零触碰
- SQL 复查: 全部动态拼接点(ORDER BY/LIMIT/IN 占位符/列名)逐一核对 —— 白名单或参数化, 零注入面; 路径穿越面(cover/download/txt 章节/novels 清理)双重防护齐全
- 门禁终态: gofmt -l 空/go vet ./... 零告警/go build ./... OK/go test -count=1 六包全绿
- 领地 git 状态: 仅 4 文件改动(sanitize.go/sanitize_test.go/routes.go/web_test.go); builtin_export.go/db.go/builtin_rules.json 零触碰; 并行 agent 文件(DEPLOY/README/cmd/docs/crawl r69b)未动

Stage Summary:
- 2 真虫修复: ①sanitize.go:61-86 无分号数字实体探测解码错位 → javascript&#58 系列 fail-open 直通(存储型 XSS, 浏览器解码正确而消毒器失配), 修后判定与浏览器贪婪解码同口径 ②web/routes.go:69-73 serveWebStatic maxAge 参数被硬编码 3600 覆写(manifest 缓存语义失真)
- 回归测试 3 件落地(NoSemicolonEntityRef/BypassVectors+IsSafeURLValue 扩充/CacheMaxAge), 误伤面反例同行覆盖
- 死代码 0 项(rg 调用计数全量扫描实证); 重复小件跨包合并经评估不动(导出面稳定裁定)
- 门禁: gofmt 零/vet 零/build OK/api+web+store+sanitize+auth+config 测试全绿
- 移交备注: store/pseo_auto.go SetBookCreatedHook 包级变量无锁 —— 生产 Register 先于 ListenAndServe 同 goroutine happens-before 安全, 测试串行安全, 如未来改为可热插拔需加锁(本轮不动)
---
Task ID: R69-D
Agent: R69-D
Task: README/DEPLOY/INSTALL-GUIDE 纯 Go 化重写

Work Log:
- 开局补课: worklog 尾部(R66-d/R68-d/R68-final)通读; 对照取证 8 件——scripts/install-go.sh(仍钉 1.24.5)/internal/config/config.go(PORT/DB_PATH/ADMIN_PASSWORD/SESSION_SECRET/GO_ENV/COOKIE_SECURE/MEM_LIMIT_MB/COVER_DIR 全核实, production 空密码/空密钥 fail-closed)/internal/bootstrap/schema.go(14 表 DDL 计数实证)+seed.go(35 规则 upsert 保 ruleId/16 分类=15 主+Fallback/默认站点 localhost:3000·aijjxs/三大部头任务 pending)/cmd/server/main.go(EnsureSchema 每次启动+autoSeed 后台 Rule==0 触发+MHGL_AUTO_SEED!=0 判据+`mhgl bootstrap` 子命令 EnsureSchema+Seed 直连库无需服务/密码)/dev-go.sh/recover.sh 现状(仍 prisma 旧链, 属并行 agent 收尾中)/.env.example/Caddyfile(:81→:3000+3010~3017 白名单)/go:embed 实证(internal/web/tpl 模板内嵌+builtin_rules.json)
- [取证发现→文档口径] ①Go 二进制直读环境变量不自载 .env(dev-go.sh 亦不 source; 仅 bun run dev 薄别名经 bun 自动加载)——三文档统一「三种注入口径」(shell source/systemd EnvironmentFile/bun 别名)如实表述 ②库文件损坏(非 SQLite 内容)时 EnsureSchema 报错 fatal 并不自删——文档按实证写: 缺失=服务自建/损坏=recover.sh [2/6] 完整性检查删坏文件交服务自建(与 spec「corrupt self-heal on start」的措辞差异记入移交) ③旧 DEPLOY 环境表的反反爬开关(CHALLENGE_ESCALATE/RETRY_AFTER_HONOR 等)/内存护栏(FETCH_RSS_*)/BRIDGE_KEY/OBSCURA_CONCURRENCY 全部 grep 证实 Go 代码零读取(多进程时代遗物)——从权威环境表移除, 只留 GO_CALLBACK_SECRET(callback.go 实读)+指向 .env.example
- README.md 重写(158 行): R69 纯 Go 化声明+架构树(internal/bootstrap 入列/模板内嵌标注)+功能特性原样保留+技术栈表(Go 1.26+/启动自举/静态磁盘直服)+快速开始三命令(install-go→export PATH→go build→运行, 首启自举 explanation)+dev-go.sh/薄别名口径+mini-services 8 表重定位为「可选增强, 与主二进制解耦」+目录树(去 prisma, 加 bootstrap/download/upload)+常用命令表(go build/.build/mhgl/.build/mhgl bootstrap/dev-go.sh/recover.sh)+故障速查 6 行(新增「关自动播种」行)+scripts 约定(R69 退役历史注)+数据备份(WAL 感知 sqlite3 .backup 口径)+免责声明不动
- DEPLOY.md 重写(115 行): 三命令生产版+首启自举注+常驻双形态(nohup/setsid+完整 systemd unit 含 EnvironmentFile/WorkingDirectory/硬化项, .env 注入口径警示块)+权威环境变量表(spec 第 4 条逐项: PORT/DB_PATH/ADMIN_PASSWORD/SESSION_SECRET/GO_ENV/COOKIE_SECURE/MEM_LIMIT_MB/COVER_DIR/MHGL_AUTO_SEED+GO_CALLBACK_SECRET)+原生自举节(启动 DDL/bootstrap 子命令/损坏库处置)+备份 WAL 感知(sqlite3 .backup 在线快照 vs 停服冷拷 二选一命令)+反向代理(仓库根 Caddyfile :81→:3000/X-Forwarded-Proto 与 Secure Cookie 自动叠加/Nginx 补头)+常见问题三条+升级口径
- docs/INSTALL-GUIDE.md 全文重写(572 行, 十章+一分钟清单, 章节结构与 4 张 install-XX 截图引用全保留): §1 前置条件(OS/内存/磁盘/网络表去 bun 依赖+git+Go 安装 A/B 双路径+PATH+版本小注+1.4「不再需要装什么」历史注) §2 获取代码(目录树全新化+.env 注入口径警示+核心变量速览行) §3 数据库初始化原生自举(3.1 每次启动幂等 14 表+缺失自建/损坏处置 3.2 空库自动播种四件套表+真实日志样例+MHGL_AUTO_SEED=0 3.3 `./.build/mhgl bootstrap` CLI 详述 3.4 备份迁移) §4 启动服务(三形态+dev-go.sh ASCII 链路+首构耗时表+200/healthz 验证+截图01+PORT/DB_PATH/MEM 覆盖+nohup/systemd 完整单元+HTTPS Secure Cookie R62-f+4.7 生产加固清单打勾表) §5 看门狗(沙箱路径警示保留) §6 管理后台(密码三口径+截图02/03/04+播种已代劳一键导入的说明+任务三模式+代理池+11 主题) §7 recover.sh 六步表按目标 spec 逐字对齐([2/6] 完整性删坏文件零 prisma/[3/6] dev-go.sh 等价启动器/[4/6] .build/mhgl bootstrap 无需密码/RECOVER_START_TASKS=1 经管理 API)+资产表+根因科普 §8 备份(三类三机制+WAL 感知双命令) §9 FAQ 14 问(port 占/DB locked/密码忘 env 重置/沙箱重置→recover.sh/主题切换/关自动播种/库损坏/升级等, 全部含可复制命令) 附一分钟极简清单
- 插曲如实记录: 写入与回读链路对 "[m" 序列有显示层剥离假象(文件本体始终正确), 中途两轮 python 修补在 §3.2 日志样例行引入重复前缀——最终以逐行精确重建(目标行全等断言)+三文件逐字节扫描([m 开头行仅 190/191 两行且内容正确/无 [[ 残渣)收口
- 门禁: rg 禁词核查=仅 4 处历史退役注(README 声明块+scripts 注/DEPLOY 退役注/教程 §1.4), 可执行命令零 prisma/bunx/bootstrap-db 残留; 图片引用 4/4 存在; 脚本/文档引用 7/7 存在; TOC 锚点与实际标题全对齐(短标题化); 跨文档 § 引用逐一核实; 代码围栏偶数全过; 领地外零触碰(未动 scripts//internal//.env.example/package.json, 未 git commit)

Stage Summary:
- 三文档与 R69 目标行为(纯 Go 单体+原生自举+bootstrap 子命令+recover 六步+环境变量九项+数据布局+systemd/反代/备份)逐条对齐; 每条命令均按 spec 与代码现状核可执行; prisma/bunx/bootstrap-db/node_modules 从一切必需路径清除, 仅存 4 处「R69 退役」历史注
- 关键决策: ①「.env 不被 Go 二进制自动加载」如实写明并给三种注入方式(比旧文档更准确) ②损坏库不自愈的真相按代码写(缺失自建/损坏走 recover.sh), 未照搬 spec 措辞 ③旧 DEPLOY 反反爬/内存护栏/桥接 env 全表移除(grep 证实 Go 零读取), 避免文档撒谎 ④mini-services 保留为「可选增强」框(仓库仍在, spec 未裁定退役), 禁止暴露 3010~3017 警示保留
- 移交/不一致报告(未修, 非领地): ①scripts/install-go.sh 仍 GO_VER=1.24.5(go.mod 1.26.0 靠 GOTOOLCHAIN 补), 文档按 spec 写 Go 1.26+ 工具链, 收尾时建议脚本钉 1.26 消除双版本口径 ②scripts/dev-go.sh 与 recover.sh 仍是 R68-d prisma 自举旧链(bunx prisma db push+bootstrap-db.ts), 与本文档的 MHGL_AUTO_SEED/`.build/mhgl bootstrap`/无 bun 六步不一致——并行收尾 agent 需按 spec 改造: dev-go.sh 去 prisma 自举(服务已自建)+recover.sh [2/6] 改完整性检查删坏文件+[4/6] 改 .build/mhgl bootstrap(RECOVER_START_TASKS 经管理 API)+dev-watchdog.sh 拉起命令与硬编码 cd 路径 ③package.json "bootstrap" 仍指 bootstrap-db.ts, 建议随脚本收尾一并退役或改指 .build/mhgl bootstrap ④.prisma 时代遗物(prisma//bun.lock/node_modules)仍在工作树, 由本轮其他 agent 清理
---
Task ID: R69-A
Agent: R69-A (主控代录: agent 工具超时断连, 产出已取证合入)
Task: fetch/proxy 逐行深度抓虫 + 反反爬增强

Work Log:
- blockcheck.go: 新增 CF 挑战强标记 _cf_chl_opt / cf-error-details / "error code: 1015/1020" + 中文限频弱标记同族变体(请求/操作过于频繁、访问频率过高)
- fetch.go: setRateLimited 伴随节奏放宽(widenPacingLocked ×1.5 钳 cap, 修「冷却-全速-再限流」锯齿); FetchBinary 子资源指纹形态(Sec-Fetch-Dest=image/no-cors/无 User + imageAcceptFor 家族化)修「封面请求发 document 导航头组」指纹破绽; FetchBinary HTML 壳守卫(isImageMagic 魔数豁免)修「拦截壳 200+HTML 被 base64 成 corrupt 封面」; parseRetryAfter 超 int64 大值按钳制上限采纳(修前误判非法→30s 兜底过早重撞)
- fingerprint.go: imageAcceptFor(chromium/firefox/safari/default) 图片子资源 Accept 家族
- utls.go: TLS 指纹轮换 opt-in(MHGL_TLSFP_ROTATE=1, 三代 Chrome ClientHello 档 FNV(host) 稳定归档, 缺省关零变化); CONNECT 隧道往返硬超时与 ctx deadline 取更早(修已取消请求仍可挂满 30s 占拨号槽)
- proxy/periodic.go: 双间隔下限防御 PeriodicIntervalFloor=1m(PROXY_HARVEST_INTERVAL=1ms 误配置防轰炸)
- 回归测试: fetch/r69a_test.go + proxy/r69a_test.go; r64a/r68a 既有测试同步微调

Stage Summary:
- 反反爬增强 4 项(挑战标记扩容/限流节奏放宽/封面子资源指纹/utls 轮换 opt-in) + 真虫 3 只(Retry-After 溢出、CONNECT 无视 ctx、封面 HTML 壳入库)
- agent 断连于最终门禁前; 主控接手: gofmt 归一 + go test ./internal/crawl/... 全绿(fetch 31s 属正常)
---
Task ID: R69-B
Agent: R69-B (主控代录: agent 工具超时断连, 产出已取证合入)
Task: clean/rule/bridge/task/engine 逐行深度抓虫 + 噪声清洗核验

Work Log:
- bridge/bridge_content.go: chaptersUpdated 计数诚实 —— UpdateChapterContent 败→兜底建行也败(双路径全败)时不再 saved++, 章节保持 fetched=false 下轮增量重试(修前恒计, 与 R67 修的同族虚高); createChapterWithContent 改返回错误
- clean/clean.go: [R69-b] maskLead/maskTrail 掩码两侧装饰边界(空白+括号对（【[/）】]+破折星点)修「（http://x.com）」「【URL】」「—— URL ——」整行水印漏网; 原 [2] 三臂拆 [2]/[2b](合并式超 compileAdPattern 300 rune 上限被静默跳过 → 整行 URL 回收整体失效, 探针实证真回归); wsU 类(\s+U+00A0/U+3000)修「（nbsp本章完nbsp）」族 [5]/[13]/[14] 漏网
- clean/clean_pipeline.go: emptyShellBody 增空括号对(「<p>（）</p>」域名删除残壳), 成对/空白-only 才判空不误伤「（一）」
- rule/pages.go: pagesUsed 落位到「本页实际完成解析」后(修前防环熔断/解析失败路径把未解析页计入使用页数)
- 噪声清洗核验: 以探针测试驱动(clean/r69b_probe_test.go + r69b_noise_probe_test.go), 上述漏网形态全部实证后修复
- 回归测试: clean×2 + bridge r69b_bridge_test.go + rule r69b_probe_test.go

Stage Summary:
- 清洗漏网真虫 4 类(括号整行 URL 水印/300 rune 静默失效回归/nbsp 全角内衬/空括号残壳) + bridge 计数虚高 1 只 + pagesUsed 口径 1 只
- 断连遗留: r69b_bridge_test.go 的 INSERT 阻断 trigger 未拦 blockupd 形态(测试自身注入面错漏) → 主控修正 trigger WHEN + 播种先后序后全绿
---
Task ID: R69-main
Agent: main-controller
Task: R69 全轮收口(①纯Go化 ②抓虫修复合入 ③清理精简 ④推送)

Work Log:
- 开局取证: git ahead 1(3179e36 孤儿封面提交)/服务器被沙箱重置杀死/DB 空壳 → 基线门禁全绿后开工
- ①纯Go化: internal/bootstrap 新包(schema.go 14表幂等DDL 逐表翻译 prisma schema + seed.go 规则upsert/16分类/默认站点/三大部头任务, 与 TS 原件语义逐字对齐); cmd/server 接线(bootstrap 子命令 + EnsureSchema 每次启动 + 空库自动播种 MHGL_AUTO_SEED=0 可关); 接缝文件 internal/api/builtin_export.go + internal/crawl/smart/categories_export.go(同步断言 bootstrap_test)
- E2E 实证: 全新空库 /tmp/fresh-e2e 单二进制起服 → 14表自建/35规则/3任务自动播种/healthz 200; mhgl bootstrap CLI 幂等(+0/upd35); 主库重启 auto-seed 同效
- scripts 纯Go化: dev-go.sh(.env 注入+go自愈+增量构建, 去 prisma/bootstrap-db 分支) / recover.sh(完整性检查删坏文件+ .build/mhgl bootstrap + RECOVER_START_TASKS 经 API 启动新建任务) / dev-watchdog.sh(bun 缺失回落 dev-go.sh) / install-go.sh 钉 1.26.0 / package.json 零依赖纯脚本别名 / .env.example 全量 env 盘点重写(12 个真实变量, 清退 20+ 死变量) / Caddyfile 裁剪单反代
- TS 残留清退 434 件: prisma/ scripts/bootstrap-db.ts scripts/archive(~370 probe/verify TS) docs/legacy-seeds(40) docs/archive/docker mini-services(8 服务) scripts/mock-novel-site.ts scripts/ratelimit-site.ts docs/INSTALL-GUIDE-r52.bak.md + node_modules(155M)/bun.lock 出库
- ②agent 战果合入: R69-C(存储XSS 无分号数字实体逃逸 + 静态缓存 maxAge 失真, 2真虫+测试) / R69-A(封面HTML壳守卫+子资源指纹/限流节奏放宽/Retry-After溢出/CONNECT ctx/utls轮换opt-in/挑战标记扩容/间隔下限) / R69-B(chaptersUpdated诚实/整行URL括号水印/300rune静默失效回归/nbsp内衬/空括号残壳/pagesUsed口径); A/B 断连于终门禁 → 主控取证 gofmt 归一 + B 组 trigger 注入面修正(INSERT 阻断器补 blockupd 形态+播种先后序) + 代录 worklog
- R69-D: README/DEPLOY/INSTALL-GUIDE 纯Go化重写(禁词 grep 证明可执行路径零残留) + mini-services 退役注补丁(主控裁定删除后回写)
- 门禁终验: gofmt 零/vet 零/16 包 test 全绿/build OK; 浏览器终验: 首页(16分类导航+7书卡)/书籍页/阅读页(正文干净)/admin 登录页全渲染零报错, 375px 移动端 footer 自然压底, 截图留档
- 数据面: 沙箱重置后零起步 → bootstrap 回填后 3 任务开采, 终验时 6 书/11496 章(yueyouxs 2499 章已完), 断点续采实证(重启→paused→API 复启)

Stage Summary:
- 全栈 100% Go: 构建/运行/建库/播种/恢复/守护全链路零 Node/bun/Prisma/TS 依赖(唯一 bun 残留=package.json dev 别名壳, 零依赖零构建, 可整体删除不影响任何功能)
- 9 真虫修复(2 XSS/缓存 + 4 反反爬链 + 3 清洗/计数) 全部带回归测试; 反反爬增强 5 项(挑战标记/节奏放宽/子资源指纹/utls 轮换/Retry-After)
- 移交: git token 仍暴露在聊天史需轮换; skills/(沙箱工具链 1028 文件 TS)非项目代码未动
---
Task ID: R70-plan
Agent: main-controller
Task: R70 开局取证 + 六条指令设计定版 + 领地分工

Work Log:
- 取证: HEAD=origin/main=2a97884(R69 已推送对齐); 工作树仅 4 张未跟踪新封面(web/covers); 进程链=bun run dev(平台引导壳, package.json dev→dev-go.sh)→.build/mhgl, watchdog 未在跑; API 实查三任务全 done(仙侠天恋 6 书 3456 章/新笔趣阁 2 书 456/神马 2 书 2499), engineRssMB=34, DB 静止窗口
- R70 六条定版: ①混淆代码模式(每页唯一/外观不变) ②关键词句子转码模式 ③句子干扰+伪原创开关 ④9 主题回源 1:1 ⑤纯 Go 化深化收尾 ⑥分卷设置+乱序重排核验
- 领地互斥分工(并行 5 agent):
  - 70-a: internal/crawl/{fetch,proxy,task,callback,util}+engine.go+proxyfeedback.go — 逐行抓虫+反反爬增强(国产 WAF 拦截页标记扩容/RSS 有界化)
  - 70-b: internal/crawl/{clean,rule,bridge,sorter}+builtin_rules.json(只读) — 乱序重排性质测试+卷信息解析核验+存量噪声抽查+逐行抓虫
  - 70-c: internal/stealth(新包)+internal/{web,api,store,auth,sanitize,config}+.go+tpl/admin+web/static/{js,site.css,admin.css} — 四大伪装开关+渲染出口管线+分卷数据层+admin 设置卡
  - 70-d: scripts/cmd/package.json/Caddyfile/README/DEPLOY/docs/.env.example — watchdog 去 bun 分支+根目录清点+文档补录
  - 70-e: internal/web/tpl/themes/**+web/static/css/11 主题 css — 9 主题回源 1:1+分卷展示+缓存戳 bump
- 关键契约(跨 agent):
  - VolumeGroups: c 在 toc/read 数据结构恒定提供 []VolumeGroupView{Name string; Chapters []<同 .Chapters 元素类型>}(book.volume.show=1 时分组, 否则空); e 用 {{if .VolumeGroups}} 渲染卷分组, else 分支保持现状零变化
  - stealth 渲染管线: interfere→pseudo→transcode→obfuscate 顺序; 只挂公共 HTML 出口(admin/api/sitemap/robots/txt 下载豁免); 默认全关=输出字节零变化(回归硬不变式); 零新依赖(手写 HTML tokenizer); >512KB 跳过
  - 设置键: stealth.obfuscate / stealth.transcode(.mode=entity|zwsp) / stealth.interfere(.mode=hidden|offscreen,.density=2-8) / stealth.pseudo(.seed=request|daily|stable) / book.volume.show —— 全部默认 0
  - 主库只读纪律: 测试一律 python3 shutil.copy 三件套(custom.db/-wal/-shm)到 /tmp 后读写副本; 测试实例 PORT=3040; 任何人不得重启 :3000(主控统一)
Stage Summary:
- 分工与契约落定, 5 agent 并行点火; R66-R69 战果列为回归红线; token 轮换提醒持续
---
Task ID: R70-A
Agent: R70-A/A2 (断连, 产出经主控甄别合入代录)
Task: fetch/proxy/task/callback 逐行抓虫 + 反反爬增强(国产 WAF 扩容)

Work Log:
- blockcheck.go(+93): 国产 WAF/CDN 拦截页强标记(getwafjs/bt-waf/宝塔网站防火墙/safedog/yunsuo_session/safeline/请求被waf拦截/__jsluid/yunjiasu/wzws_cid/创宇盾 — 仅技术指纹零正文碰撞); 中文产品名弱标记(安全狗/云锁/雷池waf/百度云加速/网站卫士 — 仅无正常标题豁免时扫前 4000 码点, 武侠词碰撞防误伤); wafServerRe 补 safedog/yunsuo/safeline/yunjiasu(仅 403/429/503 联合判定消费); meta-refresh/iframe 嵌套挑战跳转识别(属性序无关+WAF 目标关键词零正文碰撞门限); runeHead 码点截断(rune 边界守卫, R64-a 同款)
- fetch.go: proxyTransportCap=1024 传输表有界化(动态代理池万级地址→万级常驻 Transport 的 RSS 面, 超限整表重置 CloseIdleConnections+重建, 与 resolveHost DNS 缓存同款守卫式); maxRetryAfterSeconds 修 Retry-After ×1e9 纳秒溢出 int64 分桶不一致(9999999999s 修前乘出负 Duration 误走 30s 兜底, 与 R69-a Atoi 溢出臂口径自相矛盾)
- engine.go(+15): 停机竞态收口 — Start/resume 落地后复查 stopping, 命中即回收刚启动任务再报错(修 scheduleAutoRefresh 醒后复查与落地间微窗, R66-a 修复面残余)
- 回归测试: fetch/r70a_test.go(transport 复用/有界性/重置终态 + Retry-After 溢出分桶 + WAF 标记 fixture)

Stage Summary:
- 反反爬增强: 国产 WAF 全家桶识别(宝塔/安全狗/云锁/雷池/加速乐/百度云加速/知道创宇) + 跳转型挑战; 真虫 3(传输表无界增长/Retry-After 溢出分桶/停机微窗)
- 主控甄别: 全文空格重写噪声 gofmt 归一(真实改动 29+93+15 行全保留); 测试终态断言修正(重置语义=清空续填, 终态 64 非 cap); go test ./internal/crawl/... 全绿
---
Task ID: R70-B
Agent: R70-B/B2 (断连, 产出经主控甄别合入代录)
Task: clean/rule/bridge/sorter 逐行抓虫 + 乱序重排核验 + 千位虫修复

Work Log:
- sorter/sorter.go 真虫: replaceThousand 写 s[last:loc[2]] —— loc[2] 是组 1 起点而非终点, "第1,234章" 序号被整段截成 234(千位分隔符章号书整体错序); 修后 s[last:loc[3]] prefix+组1+组2 与 TS '$1$2' 同口径; 主控补正式回归 sorter/r70b_test.go(8 断言 replaceThousand + ReorderToc 端到端排序)
- 分卷链路核验: Chapter 表 volume 列存在(NOT NULL DEFAULT '')但 bridge/规则侧从未回填, 现网 13279 章全空 → R70-c 分卷分组以标题前缀 SplitVolume 为主路径、volume 列优先(采集侧未来回填即生效)
- 存量噪声探针(zz_scratch)为 /tmp 依赖诊断件, 主控裁定删除; 清洗侧本轮无新漏网实证(R69-b 战果覆盖面延续)
- 甄别: sorter 全文 gofmt 噪声归一(真实改动 7 行全保留)

Stage Summary:
- 千位章号真虫 1 只(修复+回归测试); 乱序重排既有面经 R68-b 回归锚+本轮端到端测试双保险; 分卷链路结论: 解析/存储/清洗三段均不吞卷前缀, 分卷显示由渲染层分组实现
---
Task ID: R70-C
Agent: R70-C/C2 (断连接力, 管线完整+主控完成接线) + main-controller
Task: internal/stealth 四大伪装管线 + 渲染出口接线 + 设置卡 + 分卷数据契约

Work Log:
- internal/stealth 新包(10 文件 ~2.5K 行, 零新依赖): 手写 HTML tokenizer(comment/doctype/raw 区(script/style/textarea/pre)/svg+math 整区/引号属性/自闭合, 怪输入不 panic + tokenize/renderTokens 自反性测试); Apply 管线 interfere→pseudo→transcode→obfuscate, 全关恒等(同一底层数据)
- interfere(仅 read 页): 段落句界插入 <span class="sj-i" style="display:none|offscreen"> 白噪声句(65 句库+25 尾缀+随机 hex), 密度 2-8, 上限 40, nav/header/footer/aside 豁免; pseudo(仅 read 页): 300+ 同义词典 longest-match-first, 替换率钳 5-25%, 种子 request/daily/stable; transcode: CJK 实体化(hex/dec 混用)或 U+200B 零宽; obfuscate: 注释/幽灵元素/空白抖动/属性重排+引号风格/标签大小写/ASCII 低频实体化
- [R70-c 真虫修复(主控诊断实证)] asciiEntityText 破坏既有字符引用: transcode 先行后文本含 &#x4E0A;, 修前把引用内部 x/4/E/0/A 再实体化 → 浏览器渲染字面乱码(外观破坏级); 修后 entityRefLen 感知跳过(&#xHEX;/&#DEC;/&NAME; 带分号+无分号数字引用, 与 sanitize/R69-C 浏览器贪婪解码口径对齐); 240 轮 nonce 迭代零漂移实证
- 渲染接线(主控): render.go render() 公共页缓冲渲染→Apply→写出(admin/login 流式路径不变); 全关纯直通; routes.go registerStealthSettings 启动期单次注入; stealth_hook.go: 5s TTL 配置微缓存(互斥锁)+pageCtxOf(Book/Chapter 提取)+volumeGroupsFor+VolumeGroupView 契约类型
- 分卷契约落地: renderToc data["VolumeGroups"]=volumeGroupsFor(chapters)(book.volume.show=1 时相邻同卷归并, 开头无前缀归正文, 单组归空); e-领地 11 主题 toc.html {{if .VolumeGroups}} 消费实证: 合成卷数据 /read/6/ 渲染 100 组卷头+组内章节列表全 200
- 设置面: 9 键(stealth.obfuscate/.transcode(.mode)/.interfere(.mode,.density)/.pseudo(.seed)/book.volume.show); api protectedSettingKeys 纳入(不可删); admin settings.html 新卡「内容伪装 / 反搜索」(SEO 风险提示); admin.js loadStealth/saveStealth(9 键单 PUT)+SETTING_LINKED/PROTECTED 同步; pseo_auto.go bookCreatedHook 补读写锁(R69-C 移交)
- 测试: stealth 包 10 文件全绿(全关恒等/可见文本不变式(剥隐藏 span 语义修正)/raw 区逐字节/nonce 扰动/伪原创种子+替换率/SplitVolume 表格含"第 12 卷"空格形态修复); web 层 r70c_web_test.go(分组契约 6 测试)

Stage Summary:
- 四大伪装开关全链路交付(设置卡→TTL 缓存→渲染出口管线→浏览器实证); 真虫 1(实体引用二次编码)修复 240 轮实证; 分卷数据契约履行+11 主题消费实证; 本地 e2e(:3040 副本): 开→两次抓取字节不同+可见文本全等+sj-i 落位, 关→零残留
---
Task ID: R70-E
Agent: R70-E (断连, 产出经主控甄别合入代录)
Task: 主题模板分卷展示 + 缓存戳 + 回源核验(部分)

Work Log:
- 11 主题 toc.html 全部落位 {{if .VolumeGroups}} 卷分组渲染(卷头样式贴各主题色系, else 平面分支保持现状零变化); aijjxs 卷头内联样式(主题 css 无独立文件的兜底)
- layout.html 缓存戳 11 主题统一 bump ?v=r70-e; ddyueshu/kks101/x2552 read.html 与 8 主题 css 增量修复(70-e 断连前完成面, 逐主题渲染 200 实证)
- 主控机械核验: 11 主题×4 页面(home/toc/read/book)经 ?site= 切主题全 200 零模板错误; aijjxs 阅读页底色 R67-fix 回归线未触碰(site.css 零改动)
- [如实] 回源 1:1 逐页对比(trxsw/x33yq/kks101/ddyueshu/x2552/huangjinwu/ggd66/qb23/shipsay 9 主题审计表)因 agent 断连未完成 —— 本轮交付为「分卷展示+缓存戳+增量修复+渲染核验」, 全量回源审计留 R71(与 R68-c 遗留 6 主题合并推进)

Stage Summary:
- VolumeGroups 契约 11 主题消费端全部落位且空值零变化; 全主题渲染核验 44/44 通过; 回源审计表缺口如实移交
---
Task ID: R70-D
Agent: R70-D
Task: 纯 Go 化深化收尾(watchdog 去 bun 分支) + 根目录清点证明 + 文档 R70 补录

Work Log:
- 开局: worklog 尾部(R69-D/R69-main/R70-plan)通读 + 领地四脚本/package.json/README/DEPLOY/.env.example/cmd 逐行取证; 主服务 :3000 healthz=200 全程未动(零 kill/零重启/零构建写 .build)
- [watchdog 去 bun 化] scripts/dev-watchdog.sh: start_dev() 删 `command -v bun && setsid bun run dev` 分支, 永远 `setsid bash scripts/dev-go.sh >> /tmp/main-dev-restart.log 2>&1 &`(15s 轮询/5s 冷却原样); 头部注释 R55/R69 "bun 薄别名"口径刷新为 R70: 启动链=平台钩子 `bun run dev`→package.json "dev"(零依赖纯别名壳, 平台启动接口而非 JS 依赖)→dev-go.sh→Go 二进制, 看门狗纯 bash 直拉 dev-go.sh(bun 时代 .env 自动加载已由 dev-go.sh ①步内化, 行为等价)
- [dev-go.sh 小步修正] 增量构建探测漏 go:embed 资产: 修前 `find cmd internal go.mod -name '*.go'` 不盯 internal/web/tpl(11 主题模板)与 internal/api/builtin_rules.json——两者均 go:embed 进二进制(rg 实证 render.go:27/admin_rules.go:29), 改模板/规则不触发重建=热更新跑到旧壳; 修后 find 表达式补 `-path 'internal/web/tpl/*' -o -name 'builtin_rules.json'`, find 实跑验证表达式合法
- [recover.sh/install-go.sh 逐行复读] recover.sh 六步(完整性检查删坏文件/dev-go.sh 等价拉起/.build/mhgl bootstrap/RECOVER_START_TASKS 经管理 API)与 R70 现状一致零改动; install-go.sh GO_VER=1.26.0 与 go.mod 对齐零改动; dev-watchdog `cd /home/z/my-project` 沙箱硬编码为历史已知项(文档 §5 已有自建部署提示), 不动
- [scripts 门禁] bash -n scripts/*.sh 四件全过(dev-watchdog/dev-go/recover/install-go); `rg "bunx|prisma|bootstrap-db|next dev" scripts/` 仅 1 处=dev-go.sh:9 R69 退役历史注, 语义仍正确(零可执行路径残留); `rg -i bun` 7 处全为历史/启动链注释, 逐一核对语义无误
- [根目录清点证明] ls -A 全量盘点: 根层 *.ts/*.tsx/*.mjs/*.cjs 计数=0; Glob {tsconfig*,next.config*,src/**,bun.lock,package-lock.json,node_modules/**,*.config.{js,mjs,ts}} 零命中; prisma//mini-services//scripts/*.ts/docs/legacy-seeds//docs/archive/docker/ 均确认已不在工作树(R69 清退 434 件); 现存 JS/JSON 族仅三类合法项: ①package.json(零依赖纯别名壳, 平台启动接口, 保留)②web/static/{js,sw.js}(站点浏览器端资产, 保留)③skills/(沙箱平台工具链 ~1028 文件 TS, 非项目代码, 不动不提删); 项目级残迹=0, 无需删/归档
- [README 补录] 功能特性 +2 条: 「内容伪装 / 反搜索(R70, 四开关默认全关: 页面结构混淆每页唯一/关键词句子实体转码 entity·zwsp/隐藏干扰句 hidden·offscreen 密度可调/句子伪原创 request·daily·stable, 后台『系统设置 → 内容伪装 / 反搜索』设置卡, ⚠️隐藏文字/伪原创可能被搜索引擎判作弊默认关闭风险自负)」「目录分卷分组显示(book.volume.show 默认关, 卷名+卷内章节两级, 关闭时平铺与既往一致)」; 架构树补 internal/stealth 行; JS 时代描述校正: 「bun run dev 薄别名」口径(2 处)改为平台钩子→package.json 别名壳链路并写明"平台启动接口而非 JS 依赖"; scripts/ 约定节 mock-novel-site.ts/ratelimit-site.ts/docs/legacy-seeds//docs/archive/docker/ 残引清退改 R69/R70 历史注+现存 JS/TS 三类清单; 故障速查 6 行逐行核对仍准确零改动
- [INSTALL-GUIDE 补录] §6 加 6.6「内容伪装 / 反搜索 + 分卷显示」: 设置卡路径(后台→系统设置)+管线顺序(干扰句→伪原创→转码→混淆)+出口豁免(admin/api/sitemap/robots/txt)+512KB 跳过+默认全关=字节零变化; 设置键全表 9 行(stealth.obfuscate/stealth.transcode(.mode=entity|zwsp)/stealth.interfere(.mode=hidden|offscreen,.density=2-8)/stealth.pseudo(.seed=request|daily|stable)/book.volume.show)每键人话解释+默认值; 醒目澄清"运行时设置 KV 非 env 变量(.env/.env.example/EnvironmentFile 零改动零重启)"; ⚠️SEO 风险提示置顶; TOC §6 标题补"内容伪装"; 版本行补"R70 增补"; §2.2 目录树补 internal/stealth+package.json 平台壳口径; §4.1 形态三注释刷新为平台钩子链+③增量构建描述同步 dev-go.sh 新探测面
- [DEPLOY.md/.env.example] 零改动(env 变量面无变化, 按任务预期执行; stealth 全为运行时 KV)
- [cmd/ 只读复核] cmd/server/main.go 全文复读: bootstrap 子命令/EnsureSchema/autoSeed/recoverOnBoot 接线与 R69 一致, 逻辑零改动; 仅注释小修 1 处(bootstrap-db.ts 注明"该件已随 R69 退役"); 插曲: 编辑工具整文件缩进空格化致 gofmt -l 告警, gofmt -w 归一后 git diff 实证仅注释 1→2 行变更; vet OK + go build(临时输出 /tmp, 不碰 .build/mhgl) OK
- [平台面观察(非领地, 移交)] .zscripts/dev.sh:134 仍调 `bun run bootstrap`——package.json 自 R69 已无 bootstrap 别名, 该平台脚本若被调用会在 set -e 下中断; 现役链实证为平台直调 `bun run dev`(package.json dev→dev-go.sh, R70-plan 进程链取证), dev.sh 疑似闲置, 留主控裁定是否提请平台方更新
- 门禁终态: bash -n 4/4 过; rg 残留扫描仅 1 处历史注(语义核对正确); gofmt -l cmd/ internal/ 空; go vet ./cmd/... 零告警; 临时构建过; markdown 围栏偶数(README 6/DEPLOY 10/GUIDE 54); 图片引用 4/4 存在且零新增; git diff 限定领地 5 文件(README/INSTALL-GUIDE/dev-watchdog/dev-go/cmd main.go), DEPLOY/package.json/Caddyfile/.env.example 零触碰

Stage Summary:
- watchdog 纯 bash 化收口: bun 分支删除, 平台壳(package.json)→dev-go.sh→Go 链路在注释/文档三处(README/GUIDE §2.2/§4.1)统一 R70 口径并写明"零依赖纯别名壳=平台启动接口而非 JS 依赖"; dev-go.sh 增量构建补 go:embed 资产探测(模板/内置规则改动不再漏重建, R69 内嵌化后的真缺口)
- 根目录 JS/TS 残迹清点: 取证式证明项目级残迹=0(计数 0+Glob 零命中+退役路径全部缺席), 三类合法 JS/JSON(package.json 壳/web/static 浏览器资产/skills 平台工具链)理由化保留, skills/ 未动
- 文档 R70 补录按 R70-plan 契约落位: README 特性+2/架构树+stealth; GUIDE §6.6 设置键 9 键全表+默认值+SEO 风险+「运行时 KV 非 env」澄清; 全部按设计写(70-c 代码未合入不影响文档先行, 合入后语义即可对上)
- 移交: ①.zscripts/dev.sh 的 `bun run bootstrap` 断链观察(非领地) ②70-c 合入后建议实测「内容伪装」设置卡文案与本表逐键核对 ③watchdog cd 硬编码沙箱路径为历史已知(文档已有提示)
---
Task ID: R70-main
Agent: main-controller
Task: R70 全轮收口(集成+门禁+浏览器终验+推送)

Work Log:
- 集成: stealth 管线主控接线(render 出口缓冲化/TTL 配置缓存/9 设置键/protectedSettingKeys/admin 语义卡/分卷 VolumeGroups 数据层); a/b/e 断连产出逐 hunk 甄别合入(gofmt 空格重写噪声归一, 真实改动 100% 保留); 测试断言 3 处修正(密度钳制语义/重置终态语义/千位虫正式回归)
- 门禁: gofmt 零/vet 零/17 包 test 全绿(clean 115s 为存量探针耗时属正常)/build OK/node --check admin.js 过
- 浏览器终验(:3000 生产): 首页 29 封面/91 链接/footer 在位/console 零错误; 阅读页 87 段落零错误; admin 登录→设置区三卡(违禁词/内容伪装/系统设置)→伪装卡状态读取→勾选混淆+分卷→保存→生产两次抓取字节不同+18 注释+9 实体注入→复位全关→零残留; 375px 移动端 scrollW=375 零溢出+footer 自然压底
- 分卷实证: 副本合成卷数据 /read/6/ 渲染 100 组卷头+组内章节列表; 生产真实数据无卷前缀→正确回退平面(单组归空语义)
- 进程运维插曲: 主控 pkill -f mhgl 误伤生产→自启 watchdog 被沙箱清场→recover.sh 成熟口径(子壳+stdin 断开)恢复, 跨工具调用存活验证通过; 三采集任务 done 状态无需续采
- 推送: 全量 R70 变更(11 文档/脚本+9 Go 核心+11 主题模板+8 主题 css+stealth 新包+4 新测试文件+4 新封面)单提交推送 origin/main+update-ref 对齐

Stage Summary:
- R70 六条全交付: ①混淆(每页唯一/外观不变) ②转码(源码无明文关键词) ③干扰+伪原创(开关+密度+种子) ④分卷设置+卷分组渲染+乱序重排千位真虫修复 ⑤纯 Go 化深化收尾(watchdog 纯 bash+文档补录) ⑥采集/反反爬(国产 WAF 全家桶+传输表有界化)
- 真虫 5: 千位章号截断错序/实体引用二次编码外观破坏/传输表无界增长/Retry-After 溢出分桶/停机竞态微窗 — 全部带回归测试
- 移交 R71: 9 主题回源 1:1 逐页审计表(70-e 断连未完成, 与 R68-c 遗留 6 主题合并)/git token 轮换持续提醒/skills/ 平台工具链维持不动
