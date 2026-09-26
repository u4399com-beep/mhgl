#!/usr/bin/env bash
# ============================================================
# mhgl Go 单体 dev 启动脚本(bun run dev 的后端实现; 亦可直接 bash scripts/dev-go.sh)
#   默认 PORT=3000 DB_PATH=db/custom.db(正式运行)
#   联调: PORT=3040 DB_PATH=db/go-test.db bash scripts/dev-go.sh
# 依赖: ~/go-sdk/go/bin(GO_SDK_BIN 可覆盖); 二进制缓存于 .build/mhgl,
#       源码有变更时自动重建。
#
# [R69] 纯 Go 化: 不再依赖 bun / Node / Prisma / bootstrap-db.ts ——
#   DB 建表(internal/bootstrap EnsureSchema, 每次启动幂等)与空库运行态播种
#   (35 规则/16 分类/默认站点/三大部头任务, 规则表为空时自动执行)已全部
#   内化进 Go 二进制。本脚本职责收敛为:
#     ① .env 注入(Go 二进制不自载 .env)
#     ② go 工具链自愈(缺失时自动 bash scripts/install-go.sh)
#     ③ 增量构建(源码比二进制新才重建)
#     ④ exec 服务(自举在服务进程内完成)
#   运行态播种开关: MHGL_AUTO_SEED=0(服务内空库自动引导关闭, 纯手动运维)。
# ============================================================
set -euo pipefail
cd "$(dirname "$0")/.."

# ---- ① .env 注入(仅简单 KEY=VALUE 行; 与 bun 薄别名时代的自动加载口径一致) ----
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env 2>/dev/null || true
  set +a
fi

export PATH="${GO_SDK_BIN:-$HOME/go-sdk/go/bin}:$PATH"
export GOMEMLIMIT="${MEM_LIMIT_MB:-600}MiB"

# ---- ② go 工具链自愈 ----
go_ok() { command -v go >/dev/null 2>&1; }
if ! go_ok; then
  if [ -n "${GO_SDK_BIN:-}" ]; then
    echo "[dev-go] GO_SDK_BIN=$GO_SDK_BIN 下未找到 go —— 不自装(尊重定制安装位); 修好该路径, 或清掉 GO_SDK_BIN 走缺省自装: bash scripts/install-go.sh" >&2
    exit 1
  fi
  echo "[dev-go] go not found in PATH → 自动安装: bash scripts/install-go.sh (自愈)"
  if ! bash scripts/install-go.sh; then
    echo "[dev-go] go 自愈安装失败 —— 手动执行 bash scripts/install-go.sh 后重试" >&2
    exit 1
  fi
  export PATH="$HOME/go-sdk/go/bin:$PATH"
  go_ok || { echo "[dev-go] go 安装后仍不可用 —— 手动执行 bash scripts/install-go.sh 后重试" >&2; exit 1; }
fi

# ---- ③ 增量构建 ----
mkdir -p .build
BUILD=".build/mhgl"
needs_build=0
if [[ ! -x "$BUILD" ]]; then
  needs_build=1
else
  newer=$(find cmd internal go.mod -name '*.go' -newer "$BUILD" 2>/dev/null | head -1 || true)
  newer_tpl=$(find web -newer "$BUILD" 2>/dev/null | head -1 || true)
  [[ -n "$newer" || -n "$newer_tpl" ]] && needs_build=1
fi

if [[ "$needs_build" == "1" ]]; then
  echo "[dev-go] building…"
  go build -o "$BUILD" ./cmd/server
fi

# ---- ④ exec 服务(缺表自举/空库播种在服务进程内自动完成) ----
exec "$BUILD"
