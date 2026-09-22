#!/usr/bin/env bash
# ============================================================
# mhgl Go 单体 dev 启动脚本(bun run dev 的后端实现)
#   默认 PORT=3000 DB_PATH=db/custom.db(正式运行)
#   联调: PORT=3040 DB_PATH=db/go-test.db bash scripts/dev-go.sh
# 依赖: ~/go-sdk/go/bin(GO_SDK_BIN 可覆盖); 二进制缓存于 .build/mhgl,
#       源码有变更时自动重建。
# ============================================================
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="${GO_SDK_BIN:-$HOME/go-sdk/go/bin}:$PATH"
export GOMEMLIMIT="${MEM_LIMIT_MB:-600}MiB"

command -v go >/dev/null 2>&1 || { echo "[dev-go] go not found in PATH (安装: bash scripts/install-go.sh)" >&2; exit 1; }

mkdir -p .build
BUILD=".build/mhgl"

# 增量构建: 任一 .go/.html/.css/.js 源比二进制新则重建
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

exec "$BUILD"
