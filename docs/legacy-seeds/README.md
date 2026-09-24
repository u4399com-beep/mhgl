# docs/legacy-seeds — TS 时代规则种子归档（R62-a）

本目录是 **Go 化收口（R62-a）** 时从 `scripts/` 迁入的历史种子脚本。它们是 TS 全栈时代
「单站规则以 TS 脚本形态入库」的载体，现运行时已不再依赖。

## 为什么归档（证据）

1. **运行时唯一权威已是 `internal/api/builtin_rules.json`**（`go:embed` 进二进制，
   见 `internal/api/admin_rules.go`），空库恢复链走
   `bootstrap-db.ts → POST /api/admin/rules/import-builtin`，完全不经过本目录。
2. **覆盖关系 1:1 已核验（R62-a）**：`scripts/seed-rule-*.ts` 35 个文件 ↔
   `internal/api/builtin_rules.json` 35 条规则 key 精确一一对应
   （`seed-rule-<key>.ts` → key），且每条 name 双向一致、零缺漏（双向查空均零）。
3. **`gen-builtin-rules.ts` 生成目标本是 TS 时代的 `src/lib/crawl/builtin-rules.ts`**，
   src/ 已删除，该工具随之失去消费对象；Go 侧规则修改流程为
   管理端 API 写回 → 手工同步 `internal/api/builtin_rules.json`（R61-1B 口径）。
4. `seed-rules-v2.ts` / `seed-rules-batch-v2.ts` / `seed-rules-import-all.ts` 是
   R15 之前的批量灌库旧形态，已被 import-builtin 端点取代（其中未被 builtin 收录的
   早期实验规则仅存于此，随目录整体保留）。

## 内容

- `seed-rule-*.ts`（35 个）：单站规则种子，含大量站点逆向知识（请求头/加密/分页语义），
  规则语义已全量固化进 `internal/api/builtin_rules.json`。
- `_seed-lib.ts`：种子公共库（登录/幂等入库/四段实测工具）。
- `gen-builtin-rules.ts`：TS 时代内置规则库生成器（写 `src/lib/crawl/builtin-rules.ts`，已随 src/ 淘汰）。
- `seed-rules-v2.ts` / `seed-rules-batch-v2.ts` / `seed-rules-import-all.ts`：批量灌库旧工具。

## 复用方式

按惯例「只移不删」：如需复跑某条种子，`git mv` 回 `scripts/` 原位
（`bun run scripts/seed-rule-<key>.ts`，需 3000 端口服务在运行）。
