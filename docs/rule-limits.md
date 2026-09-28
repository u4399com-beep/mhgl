# 采集规则实测矩阵 · livecheck 方法论（R76）＋ 极限校准历史留档（R74）

> **文档结构注**：§1 为 **R76 现行口径**（R75/R76 两轮 35 规则 livecheck 实测矩阵、方法论与引擎侧新杠杆）；
> §2 起为 **R74 历史留档**（TS 时代「极限校准」链：管理后台「校准/全量校准」入口、`/api/admin/rules/{id}/calibrate*`
> 接口、模拟源站 `scripts/ratelimit-site.ts` 均已随 R69 纯 Go 化退役，Go 单体无任何 calibrate 路由）——
> 该部分仅作校准方法论与实测数据的历史档案；现行线程/间隔参数以任务级 fetchConfig 手工配置（教程 §6.3）。

---

## 1. R76 实测矩阵（35 条内置规则终态）

### 1.1 数据源与判定口径

- **数据源**：R75-main「35 规则全量 livecheck」+ R76 各条目（R76-a 代理管线/实网体检、R76-main 语义分层+precursor 豁免、R76-b/b2/b3 逐站攻坚、R76-c 稀释实证）worklog 与 commit 记录，逐条经代码/规则库核实后落笔。
- **实测方式**：每条规则经 admin API 建立**真实探针采集任务**（非模拟请求），全链路跑 list → book → toc → content 四段。
- **判定标准**：`status=done` 且 **`contentDone ≥ 3`**（正文成功入库 ≥3 章才算全链走通；仅出书/出目录不算 PASS）。
- **终态分级**：
  - ✅ **PASS**：探针任务全链路达标，可直接建任务采集；
  - 🔶 **条件性**：规则/引擎侧已无可修点，缺外部资源（可用代理/干净 IP/伴生桥服务/新域名）；
  - ⛔ **fail-closed**：引擎诚实判定不可为（WAF 硬门/JS 挑战/架构不匹配），留档不硬啃；
  - 🧪 **夹具豁免**：指向本机模拟源站的演示规则，不参与真实站点计数。

### 1.2 livecheck 方法论（R75/R76 现行）

1. **建真实探针任务**（admin API，登录态 Cookie）：
   - `GET /api/admin/rules` 取规则清单 → `POST /api/admin/tasks` 建 `range` 模式探针任务（`listStart=listEnd=1`，单页试水，不过量）；
   - 轮询 `GET /api/admin/tasks/{id}` 读 `status / booksDone / contentDone` 与任务日志（`GET /api/admin/tasks/{id}/logs`）定位失败段。
   - R75 留存的驱动脚本 `/home/z/livecheck.py`（wave/status/cleanup 三模式，未入库，可按上述 API 语义自写）。
2. **节流纪律**（两轮实测教训固化）：
   - 探针与 curl 人工复核都要**控频**：book4 勘察期 ~10 连发即触发站点临时限流（503，直连+代理双臂超时）；cuoceng 前 20 章连采后遇 IP 级 400 节流——后者已双落调优（`fetch.waitMs` 500→1200、`globalConcurrency` 6→3）；
   - 探针任务**失败即 DELETE**、成功则 pause 保留（复核与审计留痕，不占调度面）；
   - 同站重探间隔冷却，禁止并行轰炸。
3. **双落纪律**：规则修改必须 `PUT /api/admin/rules/{id}`（运行库）+ `internal/api/builtin_rules.json`（仓库，indent=2，改后 `json` 校验）双落，保证一键导入语义一致。
4. **修完即换装复测**：fetch/blockcheck 层修复需等看门狗重建二进制上线后再探（探针失败形态要区分「规则缺陷」与「代码未上线/站点临时限流」）。

### 1.3 35 规则逐条终态表（R76 终态；R78 活体复核差异见下方横幅）

> **R78 活体复核（2026-09-28）**：P0 三主任务规则（yueyouxs/xyetianlian/xbqg777）+ P1 R76 新破四站（cuoceng/fanqie/bqg713 桥/qimao 桥）引擎级探针回归 **7/7 全 PASS 未退化**；全通规则抽查发现 **5 站新退化**（均为站点侧状态变化、非规则虫，已双落 `[R78复核]` 注）：
> `aijjxs-toplist`（toplist 路径 IP DROP，同站主站列表仍可达→PASS 维持）/ `dafengdagengren`（全路径 IP DROP）/ `moli`（IP DROP, R79 复活见矩阵行）/ `daweixs`（WAF 裸 403，`tlsFingerprint=chrome` 实验无效已保留）/ `pilishuwu`（CF JS 挑战升级 403 1436B，HTTP 引擎无 JS 执行力）。
> **全通口径 23→18，条件性 5→10**。curl 直探假阴性两面已实证：aijjxs/iidcr/yybsw 三站 curl 挂起或 403，引擎完整指纹（TLS+头集+stealth）全链通过（iidcr 125/150 章、yybsw 184/1196 章、aijjxs content 臂启动零失败）——**探针判定必须走引擎级 livecheck，curl 仅作辅助**。

**全通 19 条**（R75 基线 19 + R76 新破 4 − R78 复核退化 5 + R79 复活 1[moli]）＋ fail-closed 4 ＋ 条件性 9（R76 期 5 + R78 复核退化 5 − R79 复活 1）＋ 站点死亡 1（book4，R77 终验）＋ 夹具 1（会计口径见 §1.4 注）。

| 规则 | 终态 | 根因与突破手段 | 所需资源 / 条件 |
|---|---|---|---|
| `80ge` 八零电子书 | ✅ PASS | wap 静态站直连（R75 全通） | 无 |
| `aijjxs` 久久小说 | ✅ PASS（R78 复核维持） | 直连（R75 全通；R78 引擎探针 books=5·content 臂零失败，curl 挂起为假阴性） | 无 |
| `aijjxs-toplist` 久久·排行榜 | ⚠️ 退化（R78 复核） | toplist 路径对沙箱 IP DROP 挂起（同站主站列表路径仍可达，`aijjxs` 行 PASS 维持） | 换 IP 后零改动即采 |
| `dafengdagengren` 大奉打更人 | ⚠️ 退化（R78 复核） | 站点对沙箱 IP 全路径 DROP 挂起（curl+引擎双实证） | 换 IP/换域后零改动即采 |
| `daweixs` 大微小说网 | ⚠️ 退化（R78 复核） | WAF 裸 403（127B 空体）封数据中心 IP；R78 实验 `tlsFingerprint=chrome` 无效（已保留无害） | 干净 IP/住宅代理 |
| `deqixs` 得奇小说 | ✅ PASS | 直连全通（规则遗留 `contentProxyUrl`→127.0.0.1:3014 为 R69 已退役端口，正文段失败自动降级直连，不影响采集） | 无 |
| `hodei` 好读小说 | ✅ PASS | R75 修复：移动 UA 返回空响应实锤 → fetch.headers 钉桌面 UA | 无 |
| `iidcr` 稻草人书屋 | ✅ PASS（R78 复核维持） | 直连（R78 引擎探针 content 125/150 章；curl 403 为假阴性） | 无 |
| `jpxs123` 精品小说（繁体） | ✅ PASS | 直连 + 入库繁转简（`crawlT2S`） | 无 |
| `kanunu8` 努努书坊 | ✅ PASS | GBK 编码自动探测 | 无 |
| `moli` 茉莉小说 | ✅ PASS（R79 复活） | R78 期 DROP 已解除：R79 引擎探针 books=2·content 34/74 零错误全链恢复 | 无 |
| `piaotia` 飘天文学 | ✅ PASS | GBK 直连 | 无 |
| `pilishuwu` 霹雳书屋 | ⚠️ 退化（R78 复核） | CF JS 挑战升级（403 1436B challenge-platform），HTTP 引擎无 JS 执行力 | 真实浏览器方案/干净 IP |
| `shoujixs` 手机小说 | ✅ PASS | R75 修复：站点重构 toc `#lbks`→`#list` + 桌面 UA 钉扎 | 无 |
| `shudugu` 速读谷 | ✅ PASS | 直连（R75 全通） | 无 |
| `wuxiaworld` WuxiaWorld Lite | ✅ PASS | 直连（R75 全通） | 无 |
| `yueyouxs` 神马小说 | ✅ PASS | 移动站静态 HTML 直连（R75 全通；库内另有一条同配置重复行，见 §1.4） | 无 |
| `yybsw` 夜伴书屋 | ✅ PASS（R78 复核维持） | 直连（R78 引擎探针 content 184/1196 章；curl 403 为假阴性） | 无 |
| `xbqg777` 新笔趣阁 | ✅ PASS | bqg 家族静态站直连；R75 中途已修实测通过（R75 终表行为陈旧 FAIL，R76-main 复核采认） | 无 |
| `xyetianlian` 仙侠天恋 | ✅ PASS | 杰奇 WAP 纯静态 http 站直连；采认口径同上条 | 无 |
| `cuoceng` 错层小说网 | ✅ PASS（R76 新破） | 唯一障碍是 fetch 层误拦：真实内容页内嵌 CF `challenge-platform/scripts/precursor/main.js` 落强标记硬判拦 → R76-main blockcheck 豁免扩展（`cfProbeBenign`：jsd\|precursor 双变体 × n≥1200+正常标题，标题黑名单防盾壳穿闸）→ R76-b2 livecheck PASS（books=1·content 20/2033） | 低并发慢跑（waitMs 1200 / globalConcurrency 3 已调优防 400 节流） |
| `fanqie` 番茄聚合API（fq.taijiwang.top） | ✅ PASS（R76 新破） | 真虫定性：R57-2a「池非空→全量走代理」旧语义被 R76 收割激活，直连健康流量被劫持进 8% 存活免费池（探针「代理通道失败: Bad Request」vs curl 直连 200/88KB）→ R76-main 代理语义分层（直连优先+池兜底）根因消除 | 无 |
| `bqg713` 笔趣阁 bqg713.cc | ✅ PASS（R76 新破） | list/book/toc 明文 API + `tlsFingerprint=chrome` 突 WAF（R75）；正文端点强制 token（明文 query 恒 403）→ `mini-services/bqg-unlock` token 桥（:3010，AES-128-CBC+MD5 派生）+ 规则 `contentProxyUrl=http://127.0.0.1:3010/unlock?url={url}` 对接；R75 另修 tocLink bookURL 传参真虫 | 伴生服务 bqg-unlock 需启动（DEPLOY.md §⑦） |
| `qimao` 七猫官方API | ✅ PASS（R76 新破） | 上游全端点强制逐请求验签+正文 AES-128-CBC 加密，声明式规则不可表达 → `mini-services/qimao-proxy`（:3013，MD5 双签名+AES 解密，stdlib 零依赖 Go 复刻）+ 规则六段指向代理（`allowLoopback:true`）；出版书（EPUB）诚实 ok=false | 伴生服务 qimao-proxy 需启动（DEPLOY.md §⑦） |
| `book4` AU文学 book4.cc | ⛔ 站点死亡（R77 终验） | R75「Vue SPA 需浏览器」实为误判：单 `<script>` 壳内嵌 b64 真实 SSR HTML → R76-b3 新增 `fetch.decodeShell` 旋钮（`html_b=`/`dstr=` 双壳形态还原，判定保守防误伤）+ 规则重写（engine=browser→http；book+toc 共用 book.json 三层编码载荷；章节 file_name 唯一路由键），DB+仓库双落完成。R77 复测：503 已演变为服务器下线——域名现指向裸 Go 默认服务（TLS 自签 `CN=example.com` 2019 过期证书，IP 140.235.37.223） | 原站复活或换同壳新域名即采（decodeShell+规则已就绪，零代码改动） |
| `fanqianxs` 番茄小说网 | ⛔ fail-closed | CF IP 信誉硬封（block 1020 族，非 JS 挑战页）；`tlsFingerprint=chrome` 无效实证，规则旋钮已到顶 | 住宅/干净 IP 或内容解锁桥 |
| `biqugetw` 笔趣阁 www.biquge.tw | ⛔ fail-closed | CF「Just a moment」JS 挑战页（非 IP 封禁），纯 HTTP 引擎不可解（同 book4 旧类，但本站无壳可解） | 需真实浏览器渲染方案（超纯 Go 边界） |
| `wanben` 完本神站 | ⛔ fail-closed | GoEdge WAF 全站图形验证码门（http/https、全路径 307→`/WAF/VERIFY/CAPTCHA` 三形态实证）；图形验证码识别超合规边界（不做 OCR 破解），引擎按挑战壳判拦行为正确 | 人工解验证码/解锁桥人工预热 cookie |
| `zxcs` 知轩藏书 | ⛔ fail-closed | 架构不匹配：Vue SSR（YzmCMS）书籍页存在，但「立即下载」→ zxcs.live 纯 TXT 文件流，**站点无章节页**，引擎 toc+content 章节模型不可表达 | 需专用 TXT 导入管线（超本项目范围） |
| `77shuku` 77读书 | 🔶 条件性 | 站点对海外/数据中心 IP 连接级丢弃（自述需国内 IP）；免费池 CN 面实证≈0（§1.5-3） | 自备国内 IP 静态代理（`fetch.proxyUrl`，http/socks5h）或可用动态代理 |
| `x33yq` 33言情 | 🔶 条件性 | 源站对沙箱 IP 段 TLS 握手后掐断（EOF，h1/h2 同灭）；`fetch.proxyCountries=CN` 语义 R76 已活性化（国别过滤拉取，空池保守直连+warn），但免费池 CN 可用量≈0 | 任意可达代理（不必 CN）或干净 IP |
| `trxsw` 同人小说 | 🔶 条件性 | IP 级应用层封锁：TLS 与明文 80 双通道建连后在响应阶段掐断；完整 Chrome 头集/移动 UA/`tlsFingerprint=chrome` 均无效；免费代理亦被拒 | 干净 IP / 可用代理（`tlsFingerprint=chrome` 已留配置，未来干净代理下提升穿透率） |
| `xjp` 新键盘小说 | 🔶 条件性 | R75 起 dial 失败（IP 层），R76 免费代理池探针亦灭（代理通道 EOF/refused）；正文后半层 var c(base64) 解密依赖外置解密代理（遗留 `contentProxyUrl`→127.0.0.1:3015，R69 已退役端口） | 可用代理/新域名；突破后正文解密半层需重建桥或改造规则 |
| `qidian` 起点中文（镜像 full.hnxianxin.cn） | 🔶 条件性 | R75 镜像 dial 失败（IP 层）；目录 C 载荷 b64 签名、正文段依赖外置代理（遗留 `contentProxyUrl`→127.0.0.1:3017，R69 已退役端口） | 可用代理/新镜像域名；突破时需一并处理正文桥 |
| `ratelimit-demo` 极限校准演示 | 🧪 夹具豁免 | 四段指向本机模拟源站 `127.0.0.1:3040`（TS 校准链退役后不再运行），非真实站点规则 | 不参与 livecheck 计数 |

### 1.4 会计口径注

- **「全通 23」口径**＝R75 判定表基线 19（该轮按库内行计，含 yueyouxs 一条同配置重复行）＋ R76 新破 4（cuoceng / fanqie / bqg713 / qimao）。
- 按 **35 条内置规则键位**去重并计入 xbqg777 / xyetianlian 两条采认项后，§1.3 表内实际 PASS 行为 **24**——两口径差异仅源于库内 yueyouxs 重复行与 R75 终表陈旧 FAIL 行（R75 中途已修实测过、R76-main 复核采认），不影响任何单规则结论。
- 各行终态均可由 livecheck 探针任务（PASS 项已 pause 留存）与 admin API 复跑复核。

### 1.5 R76 引擎侧新杠杆与运维预期（后续突破面的资源账）

1. **代理语义分层（R76-main，fetch 层）**：`proxyFirst(target, attempt)` 三态策略门——
   ①**显式代理意图**（规则级静态 `proxyUrl` 池 / `proxyCountries` 国别声明）恒代理优先；
   ②**无显式意图＝直连优先**，动态免费池降为韧性兜底：仅重试链 `attempt>0` 或 per-host 直连网络层失败冷却窗（`directFailCooldown=10min`）内才走代理；
   ③直连网络层失败（dial/EOF/超时类；403/429 WAF 面不触发）经 `ProxyPoolExhausted` 钩子节流（10s CAS）触发池即时重拉，重试链下一 attempt 消费。
   背景：R57-2a「池非空→全量走代理」旧语义在池常年为空时从未暴露，R76 收割 39k 条入池后直连健康站全面劣化——已修复并有 6 面板策略表回归钉死。
2. **proxyCountries 活性化（R76-a）**：解析→`CountryFilteredProxySource` 能力接口→国别过滤拉取（与全量同一健康分存活门）→**过滤后空池不回退全量**（非目标国代理无效且污染健康分），保守直连 + warn-once；源不支持接口时回退全量 + warn-once（配置不静默失效）。
3. **代理收割实网体检（R76-a，运维预期管理）**：17/17 公开源收割全通、39k 条入池、unchecked 校验存活率 ~8.3%（免费池 2~15% 经验区间内）；**CN 免费代理可用量≈0**（源标 CN 14 条实测全死）。→ 「needsAliveProxy」类规则的资源账 = 免费池不可指望，需自备代理/干净 IP；收割/校验入口：后台代理池页（`POST /api/admin/proxy-pool/harvest` / `check`）。
4. **decodeShell 旋钮（R76-b3）**：`fetch.decodeShell=true` 时对每响应体检 base64 软壳（`html_b=` HTML 壳 / `dstr=` JSON 壳含 URL 编码形态）并还原真实载荷；缺省 false 零变化。壳层是唯一反爬手段的站（book4.cc/AU文学 型）纯 HTTP 即可全量采集，回归 4 测试钉死。
5. **blockcheck precursor 豁免（R76-main）**：CF 探测脚本良性豁免从 `scripts/jsd` 单前缀扩展为 `cfProbeBenign` 双变体（jsd|precursor）×（n≥1200 + 正常标题），标题黑名单保证挑战壳无法穿闸——真实内容页误拦封口（cuoceng 实证 PASS，回归 4 测试）。
6. **Go mini-services 两件（R76-b3）**：`mini-services/bqg-unlock`（:3010）与 `mini-services/qimao-proxy`（:3013），均为 **stdlib 零依赖、可选伴生组件**——构建/启动/healthcheck 见 DEPLOY.md §⑦；仅启用对应规则时才需启动。
7. **interfere→pseudo 稀释实证 = 0%（R76-c，R74 留档项闭环）**：干扰句噪声 span 为单个 tokMarkup token、伪原创只扫 tokText → 结构性零稀释（探针实证逐 nonce 替换数完全相等），3 项不变式回归（`internal/stealth/r76c_test.go`）防重构回退；「调整管线顺序/避开插入点」两修法经实证判无意义不取。内容伪装管线顺序维持 **干扰句 → 伪原创 → 转码 → 混淆** 不变。

---

## 2. 历史留档（R74）：校准方法论——三阶段探测协议

> ⚠️ **以下四节为 TS 时代「极限校准」链的历史档案（R74-d 定稿，R76-d 迁移留档）**：校准入口
> （管理后台「校准/全量校准」）、`/api/admin/rules/{id}/calibrate*` 接口与模拟源站
> `scripts/ratelimit-site.ts`（127.0.0.1:3040）**均已随 R69 纯 Go 化退役**，Go 单体无任何 calibrate
> 路由与后台入口（Go 侧仅余 `calibration:<ruleId>` Setting 行的删除清理）。现行线程/间隔参数以
> 任务级 fetchConfig 手工配置（教程 §6.3），真实规则实测以 §1 livecheck 口径为准。

数据来源：ab 轮校准实战（Task ab-a standard 档全量 3 规则 + Task ab-a2 lenient/strict 档单规则矩阵），模拟源站 `scripts/ratelimit-site.ts`（127.0.0.1:3040，已随 TS 链退役）。校准入口（历史）：管理后台规则区「校准」（单规则）/「全量校准」（calibrate-all，对全部 enabled 规则串行执行）。

每条规则按档位对目标源站发起真实 HTTP 探测，三个阶段依次执行：

1. **并发梯**：并发 `1 → 2 → 3 → 4 → 6 → 8 → 10`，每档发出 **12 个探测请求**，通过阈值 `(429 + 403 + 其他异常) / 12 ≤ 10%`；失败即止，记极限并发为上一通过档。
2. **间隔梯**：请求间隔 `2000 → 1500 → 1000 → 700 → 500 → 300 → 150ms`，同样每档 12 探测、同阈值；失败即止，记极限间隔为上一通过档。
3. **验证档**：以「极限并发 × 极限间隔」组合连发 **20 请求，要求零 429 / 零 403 / 零异常**；失败则**回退一档**（并发 −1、间隔 ×1.3）复验一次，仍败则输出保守值并标记 `ok=false`（message 提示「未达验证标准，请勿直接采用」）。

探测流量伪装为浏览器指纹（真实浏览器 UA 池逐请求轮换 + Accept 头组，对齐生产引擎 UA 轮换行为）；引擎感知 429 的 `Retry-After`，遭遇临时封禁会等封禁冷却后重探。一轮单规则校准约 4~6 分钟。

**模拟源站三档限流建模**（`scripts/ratelimit-site.ts` PROFILES，封禁升级链三档同构：累计 429 达阈值 → 临时封 60s（403 + Retry-After）→ 解封后再收 429 达 3 次 → 永久封禁 410）：

- **lenient（宽松）**：120 请求/60s 滑动窗 + 2s 突发 12，累计 8×429 触发临时封。
- **standard（标准）**：60 请求/60s 滑动窗 + 2s 突发 6，累计 5×429 触发临时封。
- **strict（严格）**：30 请求/60s 滑动窗 + 2s 突发 3，累计 3×429 触发临时封，另加 UA 指纹检测（curl/bot 类 UA 直接 403；同一 UA 连续 25 次 → 403）。

## 3. 历史留档（R74）：实测矩阵（规则 × 档位）

**单规则矩阵法**：三条规则指向同一模拟源站，同档位下校准结果必然一致（standard 档 3 条规则实测完全一致已证）。因此 lenient/strict 档仅校准演示规则 1 条即可代表全矩阵。

| 规则 | 档位 | 极限并发 | 极限间隔 | 推荐线程 | 推荐间隔 | hostGateLimit(推荐) | 耗时 | 结论 |
|---|---|---|---|---|---|---|---|---|
| 番茄小说聚合API | standard | 3 | 1000ms | 1~3 | 1000~2500ms | 3 | ≈278s | ✅ ok（验证通过） |
| 七猫官方API | standard | 3 | 1000ms | 1~3 | 1000~2500ms | 3 | ≈278s | ✅ ok（验证通过） |
| 模拟源站·校准演示 | standard | 3 | 1000ms | 1~3 | 1000~2500ms | 3 | ≈278s | ✅ ok（验证通过） |
| 模拟源站·校准演示（代表全矩阵） | lenient | 7 | 195ms | 3~7 | 195~488ms | 7 | 253s | ⚠ ok=false（验证未过，保守值） |
| 模拟源站·校准演示（代表全矩阵） | strict | 1 | 1000ms | 1~1 | 1000~2500ms | 1 | 271s | ⚠ ok=false（验证未过，保守值） |

### 档位实测解读

- **standard（✅ 通过）**：并发梯全过至 3、间隔梯全过至 1000ms，验证档 20 请求零拦截；理论自洽——standard 档 2s 突发窗 6 ≈ 1 req/s 节奏安全，`recommended = { hostGateLimit: 3, threadMin: 1, threadMax: 3, intervalMin: 1000, intervalMax: 2500 }`。
- **lenient（⚠ 保守值）**：并发梯 1→10 全过、间隔梯 2000→150ms 全过（宽松窗 120/60s 对 12 探测/档余量极大）；验证档并发 8 → 429×8（突发窗 12/2s 被 20 连发击穿，且 8×429 恰达临时封禁阈值）→ 回退并发 7/间隔 195~488ms 复验 → 403×20（60s 临时封禁长于回退复验周期，封禁态污染复验）→ 输出保守值 `maxConcurrency=7 / minIntervalMs=195ms`。
- **strict（⚠ 保守值）**：并发梯 1 过；并发 2 即 429×3（窗 30/60s + 突发 3/2s 双紧，恰达临时封禁阈值）；引擎等封禁冷却后重探间隔梯，2000/1500/1000ms 过 → 700ms 再收 429×3 达「再犯」阈值遭 **410 永久封禁**，验证档 20 请求全 410 失败 → 输出保守值 `maxConcurrency=1 / minIntervalMs=1000ms`。UA 指纹维度未被触发（探测 UA 逐请求轮换）。保守值 1 线程/1000ms 间隔与理论预期一致（窗口 30/60s ≈ 0.5 req/s 耐受，1s 间隔贴线安全）。

> ⚠ `ok=false` 的两档：结果为引擎保守输出，可用作参考下限，但**请勿直接采用为生产参数**；复跑时建议先对模拟源站 `POST /reset`（回环地址校准引擎默认自动重置），避免上一轮封禁状态污染本轮轨迹。

## 4. 历史留档（R74）：已应用说明与注意事项

- **standard 档 `recommended.hostGateLimit=3` 已写入全部 3 条规则**的 `config.fetch.hostGateLimit`（同站并发闸门，hostgate 引擎按此限制同 host 的并发抓取）。
- **线程/间隔参数为任务级（fetchConfig）**：`threadMin/threadMax/intervalMin/intervalMax` 不落规则 config，创建采集任务时按对应档位的 recommended 值填写任务抓取配置。
- 「应用推荐并发上限到规则」（历史接口 `POST /api/admin/rules/{id}/calibrate/apply`，已退役）是当时唯一自动落库通道，仅写 `hostGateLimit`（钳 1~8），其余 config 键原样保留。

注意事项（第 1/2 条对现行 livecheck 仍然适用）：

1. **同源站下各规则数值趋同属预期**：校准/探针测的是源站的耐受度而非规则本身；生产中不同规则指向不同 host，才会出现规则间差异。
2. **真实站点校准/探测需谨慎**：务必谨慎控制频率，可能触发对方封禁/风控（§1.2 节流纪律即由此而来）。
3. **结果持久化（历史行为）**：每轮校准结果存 `Setting calibration:<ruleId>`（value = `{ result, profile, finishedAt }`），管理后台打开校准对话框即回显最近一次结果；多轮不同档位复跑按次覆盖同一 key。该链已退役，现无新写入。
4. **真实采集验证（历史数据）**：演示任务曾以校准参数（线程 1~3 / 间隔 1000~2500ms / hostGateLimit 3）对模拟源站真实采集 2 本书 / 120 章，全程零封禁（任务数据已于 ab-a2 收尾 teardown 归零）。
