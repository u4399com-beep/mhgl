# docs/archive/docker/ — Docker 部署链退役归档（R66-d）

> **退役结论**：Docker 部署链已于 R66-d 整体退役并移入本目录归档（git mv，历史可考）。
> 项目现行部署形态 = **Go 单体二进制（`.build/mhgl`）裸机部署**，见 `README.md` 快速开始、
> `DEPLOY.md` 部署速查卡、`docs/INSTALL-GUIDE.md`（§15 一键恢复链 `scripts/recover.sh`）。

## 退役原因（R64-d 评估 → R66-d 落地）

1. **构建链断链**：`Dockerfile` 为 Next.js 时代形态（builder 阶段执行 `next build` 产出
   standalone server.js）——`src/` 已于 R62-a 全量移除，**无源可构**。
2. **运行形态失配**：`docker-entrypoint.sh` 启动的是 `node server.js` + `prisma db push`，
   而现行产品是单一 Go 二进制（DB 自举由 `scripts/bootstrap-db.ts` + 引擎幂等建表承担）。
3. **零运行时依赖**：全仓 rg 复核，`internal/`、`cmd/`、`scripts/` 现役脚本、恢复链
   （recover/install-go/dev-go/dev-watchdog/bootstrap-db）对 Docker 链**零引用**；
   沙箱恢复链与 dev 看门狗均不经过 Docker。
4. R64-d 报告提请主控决策，R66-d 按退役档落地（保留归档而非直接删除，可随时 `git log` 考古恢复）。

## 归档文件清单

| 文件 | 原位置 | 说明 |
| --- | --- | --- |
| `Dockerfile` | 根目录 | 生产镜像多阶段构建（bun builder `next build` → node runner），**已无法构建** |
| `Dockerfile.scrapling` | 根目录 | 可选 scrapling 桥镜像（`--profile stealthy`，GB 级，沙箱从未真构建） |
| `docker-compose.yml` | 根目录 | 单服务编排 + scrapling 可选服务（healthcheck/安全加固/卷映射） |
| `.dockerignore` | 根目录 | 构建上下文排除表 |
| `docker-entrypoint.sh` | 根目录 | 容器首启入口（prisma db push → 5 个 bun 代理 → autofill 引导 → node server.js） |
| `install.sh` | 根目录 | Docker 一键安装器（装 Docker→构建→健康检查，41KB，国内镜像自适应） |
| `autofill.mjs` | `docker/` | 容器首启「自动填充·」引导脚本（读 autofill-rules.json 建 7 站任务） |
| `autofill-rules.json` | `docker/` | 上述脚本的规则+任务模板清单（9 站点，51KB） |
| `export-autofill-rules.ts` | `scripts/` | 生成 autofill-rules.json 的导出器（ss-a；移动后 `../docs/legacy-seeds/` import 路径失效，可运行版本见 git 历史） |

## 退役三档矩阵（原 PARITY 矩阵口径，本文档代持）

| 档 | 内容 | 状态 |
| --- | --- | --- |
| 全量 | TS/Next.js 全栈（src/ + node 运行时 + Docker 链） | **退役**（src/ R62 删除；Docker 链 R66-d 归档于此） |
| 简化 | Go 单体二进制 + 裸机/沙箱直跑（现行） | **现役** |
| 退役 | Docker/K8s 等容器编排 | **退役**（如需恢复：`git checkout <历史提交> -- Dockerfile docker-compose.yml install.sh docker-entrypoint.sh .dockerignore docker/`） |

## 关联文档同步点（R66-d）

- `README.md`：快速开始/技术栈/目录结构/scripts 约定已改为裸机口径。
- `DEPLOY.md`：重写为裸机部署速查卡，Docker 仅留一句归档指针。
- `.env.example`：Docker 专属变量段（AUTO_FILL/BUN_IMAGE 等）已收拢为归档指针。
- `scripts/archive/verify-{ll-a,ss-a,kk-b}-docker.ts`：历史校验探针，引用原根路径，随档失效（仅历史参考）。
