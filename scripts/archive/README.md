# scripts/archive — 历史验证脚本归档

本目录存放**历史轮次的验证/侦察/修复脚本**：结论已沉淀进 worklog、规则库或 `src/` 实现，仅保留**考古与参考价值**，不再作为活跃资产维护，**不参与主 tsc / lint 质量门**（见 `tsconfig.json` exclude 与 `eslint.config.mjs` ignores）。归档策略（zz-e 轮起）**只移不删，零数据丢失**——任何脚本需要时可 `git mv` 回 `scripts/` 原位复跑。

## 归档规则（zz-e 轮定版）

- `scripts/` 根目录只保留「活资产」：种子脚本（`seed.ts` / `seed-rules-v2.ts` / `seed-rule-*.ts` / `seed-rules-batch-v2.ts` / `_seed-lib.ts`）、站点 mock（`mock-novel-site.ts`）、运维工具（`export-autofill-rules.ts` / `backfill-book-num.ts` / `gen-builtin-rules.ts`）、限流测试服务（`ratelimit-site.ts`）。注：zz-e 轮定性保留的三套 Docker 断言与 `fix-dd-b-stale-task.ts` 已在 R30 轮一并归档（见下节），质量门由 lint+tsc+E2E 串行取代。
- **其余一律归档**：历史轮次 `verify-*`（结论已沉淀进断言矩阵或 worklog）、历史 `e2e-*`、一次性修复/工具脚本、历史轮次的 HTML/JSON 侦察取证样本。
- 近三轮（zz/yy/xx）若新增 `e2e-*` 端到端回归脚本，应留在 `scripts/` 根目录。
- 历史规则（ll-b/rr-b 轮）曾将 `verify-*`/`e2e-*` 定性为「永远留在原地」；zz-e 轮收紧为「根目录仅留断言资产+种子+运维工具」，其余下移本目录——两者不冲突：归档非删除，断言资产仍以三套 docker verify 为准。

## zz-e 轮归档（125 个，2026-09）

移动方式：`git mv`（历史以 rename 保留）。归档前交叉引用核查：`src/`、`package.json`、`install.sh`、Dockerfile/compose 对以下文件**零功能性引用**（仅注释提及，注释路径已同步）。

### e2e-* 端到端回归（9 个）— rr 轮曾定性「成熟真网回归资产」

建任务→轮询≥3章→stop→逐章质量断言（字数/junk词/FFFD/控制字符/\u0000/base64）→删任务删书还原→DB 残余核对三段齐备。因均属 aa~hh 历史轮次（超出「近三轮保留」窗口）归档于此，**复跑前需按当轮 worklog 恢复对应 seed 规则**：

e2e-bb-a2（yybsw）/ e2e-bb-b（dawei|dafeng 参数化）/ e2e-cc-a2（book4 browser 引擎）/ e2e-cc-b（shudugu）/ e2e-cc-d2（bqg713 token 链）/ e2e-dd-c（dafeng|daweixs）/ e2e-ee-b（iidcr）/ e2e-ff-a-bqg713（AES 代理链+同名书预检）/ e2e-hh-a（aijjxs+封面本地化断言）

### verify-* 历史轮次验证（89 个）

| 轮次 | 文件 |
| --- | --- |
| qq/e2e 样本取证 | verify-80ge |
| aa | verify-aa-d / verify-aa-f |
| bb | verify-bb-d-{1,2,3} / verify-bb-e / verify-bb-f{,-ui} / verify-bb-g{,-e2e,-regress} |
| cc | verify-cc-c / verify-cc-d2-foursection / verify-cc-e-index |
| dd | verify-dd-a-proxy / verify-dd-a2-rules / verify-dd-b-{mirror,p2025} / verify-dd-c-foursection / verify-dd-e-{editor,testroute,ui} / verify-deqixs |
| ee | verify-ee-a-wanben-offline / verify-ee-b-foursection / verify-ee-c-ui / verify-ee-d-{epoch,gbk,redirect,sanitize,timeout} |
| ff | verify-ff-a-{bqg713,wanben-proxy} / verify-ff-b / verify-ff-c-{fixes,ui} |
| gg | verify-gg-a-{dlcap,frameclick,regex,regex-api,txt-baseline,txt-stream} / verify-gg-b-{book-sample,wanben-book-offline} / verify-gg-c-ui / verify-gg-d-{hostgate,referer-chain,relay-token} / verify-gg-relay{,-down} |
| hh | verify-hh-a-foursection / verify-hh-b-ui / verify-hh-c-{bridge,engine} / verify-hh-d-fingerprint |
| ii | verify-ii-a-{fixes,ui} / verify-ii-c-{fetchmode,obscura} |
| jj | verify-jj-{b-api,c-ui,d-engine,e-autorefresh,f-taskdialog} |
| kk（除 kk-b-docker） | verify-kk-a-sorter / verify-kk-c-{api,ui} / verify-kk-d-ui |
| ll（除 ll-a-docker） | verify-ll-c-{listfields,parser,runner,sorter} / verify-ll-d-ui |
| mm | verify-mm-a / verify-mm-b-{bridge,hostgate,pili} / verify-mm-theme |
| qq | verify-qq-c-p2025 / verify-qq-e2-{cleaner,downloader,obscura,parser,sorter} / verify-qq-ui |
| rr | verify-rr-c2-control-race / verify-rr-c3-{redos,token-cache} / verify-rr-d-{api,ui} / verify-rr-d2-ui |
| ss（除 ss-a-docker） | verify-ss-b3-xjp / verify-ss-d-relay / verify-ss-d2-proxies |
| tt | verify-tt-{b-api,c-volume-reorder,d-ui} |

### 修复/工具/杂项（14 个）

| 组 | 文件 | 说明 |
| --- | --- | --- |
| 运维 | backup-db.ts | SQLite 备份小工具（结论：现役备份策略在运维手册，此脚本为历史形态） |
| 任务运行器 | run-task-80ge.ts / run-task-deqixs.ts | 硬编码 ruleId 的建任务/监控/停止 CLI（一次性 seeding 载体） |
| 回归/冒烟/测试 | regress-dd-a2-sites.ts / smoke-n3-util.ts / test-rr-a-foursection.ts / test-rule-sections.ts / test-ss-b2-xjp-foursection.ts | 历史轮次临时回归与四段结构测试 |
| 侦察探针 | probe-ss-c-confirm-visual.ts | ss-c 视觉确认探针 |
| 取证样本 | qq-a2-{toc-sample,wap-book,wap-ch1p2,wap-root,wap-toc,www-book,www-list}.html | qq-a2 轮站点 HTML 快照（侦察证据） |
| 书源参考 | reference-shuyuan-{7724,7698-qimao}.json | 「阅读(legado)」书源 JSON 参考（seed-rule-fanqie/qimao 头注释已同步改指本目录） |

## R30 轮归档（2026-09, 「297+1357行精简归档」落地; README 索引 R34-2c 补录）

| 组 | 文件 | 归档依据 |
| --- | --- | --- |
| Docker 断言三套 | verify-ss-a-docker.ts / verify-kk-b-docker.ts / verify-ll-a-docker.ts | zz-e 轮定性「根目录活资产」, R30 轮随清理一并归档(质量门已由 lint+tsc+E2E 串行取代); 复跑 `git mv` 回 `scripts/` 原位 |
| 运维 | fix-dd-b-stale-task.ts | dd-b 一次性僵尸任务修复 CLI(R33 轮根目录重复副本已删, 本目录为唯一留存) |
| 运行时构建取证 | tests-legacy/{database-runtime-build.sh, python-runtime-build.sh, python-runtime-container.sh} | 历史 Python/DB 运行时构建脚本, 现行 Dockerfile/compose 不引用 |
| ab 轮验证 | verify-ab-b-ratelimit.ts / verify-ab-c-apply.ts | 限流桶/落地验证, 结论已沉淀进 proxy 与 worklog |
| zz-a 校准 | verify-zz-a-calibrate.ts | 校准探针一次性, 结论已沉淀进 calibrate 实现与 worklog |
| rr 轮探针补录 | probe-rr-c2-control-race.ts / probe-rr-c3-{redos,token-cache}.ts / probe-rr-d2-headers.ts | rr 轮控制链竞态/ReDoS/token 缓存/响应头侦察, 此前未列入 rr-a2/rr-b 索引, R34-2c 补录(verify 同名套件已在上表 verify-rr 段) |

## R31-7 轮归档（2 个，2026-09）

| 文件 | 归档依据 |
| --- | --- |
| verify-r21-rules.ts（759 行） | R21-a 一次性内置规则全量复测 harness（25 规则×四段），结论已沉淀进 worklog 与后续断言矩阵；无任何代码/package.json 引用 |
| verify-r22-rules.ts（1143 行） | R22-a 同族一次性复测 harness（27 规则×四段+清洗专项），R31-1 审查 P2-3 点名归档；无任何代码/package.json 引用 |

两文件均以 `../src/lib/crawl/*` 相对路径 import（归档后不复跑）；如需复跑按惯例 `git mv` 回 `scripts/` 原位。

## 此前批次（历史记录保留）

### rr-b 轮归档（58 个，mm~qq 轮残留探针 + ll-b 例外复审）

| 组 | 文件 | 归档依据 |
| --- | --- | --- |
| mm（ll-b 后残留） | probe-mm-pili-rule | pili 规则一次性入库载体，规则已在库，重跑会重复建规则/任务 |
| qq-a/a2 | probe-qq-a-80ge / probe-qq-a2-{book,chend,qiushu,quick,wap} | 站点侦察，结论已沉淀进 seed-rule-* |
| qq-b/b2 | probe-qq-b-{recon6,xjpan-getjs} / probe-qq-b2-{details,recon3,ttkan-{a,b,c,d,e,f,fix,rule},jhssd-{a,b,c,d,rule},libahao-{a,b}} | 站点侦察/一次性规则修补 |
| qq-c | probe-qq-c-{db-evidence,state} / probe-qq-c-fanqie-{app-api,web,web-anatomy,web-state} / probe-qq-c-tomato-{conc,content,engine,engine-content,expr,lock,multibook,recon,seq,symptom,tab3,tail,tocitem} | 番茄任务诊断侦察，结论已沉淀进 worklog |
| qq-d | probe-qq-d-{qimao-api,qimao-content,qimao-explore,yckceo7698-fetch} | 七猫侦察，规则已入库 |
| qq-e | qq-e-probe{1,2,3,4,5,6,7,8} | 引擎行为侦察，断言版已固化为 verify-qq-e2-* 五套（现随 zz-e 归档） |
| ll-b 例外复审 | probe-hh-tomato-revive / probe-ff-a-fanqie-api | 番茄 API 一次性复活复验/健康探测，rr-b 复审定性一次性 |

### rr-a2 轮归档（8 个，rr-a 残作收编）

| 组 | 文件 | 归档依据 |
| --- | --- | --- |
| rr-a 探针 | probe-rr-a-deqixs{,2,3}.ts | deqixs 站点一次性侦察，结论已沉淀进 seed-rule-deqixs / worklog |
| rr-a 上游取证 js | rr-a-deqixs-{md5,common,yuedu,inline5,chapter-script}.js | 站点脚本原文存证，非本项目代码 |

### ll-b 轮归档（43 个，aa~ii 轮探针）

probe-bb-b-{clean-diag,dump,waf} / probe-bb-g-dafeng / probe-bun-manual-redirect / probe-cc-a-{browser,clean,pages,pages2,unwrap} / probe-cc-a2-{content,decode} / probe-cc-b-fetch / probe-cc-d2-{direct,engine} / probe-dd-b-bqg-mirrors / probe-dd-c-{ch3,junkctx,recon,recon2,recon3} / probe-dd-d-{recon,recon2,recon3,tails,turnstile,ybswo-engine} / probe-ee-a-wanben-{engine,recon} / probe-ee-b-engine / probe-ee-c-{debug,gcd,interact,shots,uaa} / probe-ff-a-wanben-{hunt,proxy,sample} / probe-gg-b-wanben-{bisect,book} / probe-hh-{a-taskdiag,a-tocorder,d2-book4,tomato-revive} / probe-ii-b-{wanben,ybswo} / probe-ll-{tomato,tomato2,rules,restore-tomato} / probe-mm-b-db{1..8} / probe-mm-{bridge-flow,pili-recon,pili-localshot,pili-samples} / probe-qq-{a2-ua,b-cms3,b-deqixs,b-gegedang,b-jhsssd,b-xinjianpan}

### ss 轮散件归档（探针与取证）

probe-ss-c-confirm-visual 之外的 ss 轮散件（ss-a-observe / ss-a-prod-task-peek / ss-final-probe / ss-home-dom / ssb2-xjp-live / xjp-* 取证件 / dump-rules / peek-churls 等）随当轮收尾归档，详见 worklog。

注：各轮探针证据与结论在 `worklog.md` 对应条目中留档。
