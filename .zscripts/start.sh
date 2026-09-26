#!/bin/bash

# [R71] 平台启动脚本纯 Go 化 —— 原 Next.js 部署链启动器(next-service-dist/server.js
# + 打包 DB + mini-services + Caddy 前台进程)已随 R66-d/R69 退役。
# 现行职责与 package.json "start" 同口径: 确保 .build/mhgl 存在(缺则构建)后前台运行。
# 用法: bash .zscripts/start.sh   (或打包/部署场景 cwd 无关 —— 自动定位项目根)

exec 2>&1
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

# .env 注入(仅简单 KEY=VALUE 行; Go 二进制不自载 .env)
if [ -f .env ]; then
    set -a
    # shellcheck disable=SC1091
    . ./.env 2>/dev/null || true
    set +a
fi

# go 工具链自愈(与 scripts/dev-go.sh 同口径): PATH 补 ~/go-sdk → 仍缺则 install-go.sh
if ! command -v go >/dev/null 2>&1; then
    export PATH="$HOME/go-sdk/go/bin:$PATH"
fi
if ! command -v go >/dev/null 2>&1; then
    echo "[start] go not found - auto install: bash scripts/install-go.sh (自愈)"
    bash scripts/install-go.sh
    export PATH="$HOME/go-sdk/go/bin:$PATH"
fi
if ! command -v go >/dev/null 2>&1; then
    echo "❌ go 工具链不可用 —— 手动执行 bash scripts/install-go.sh 后重试"
    exit 1
fi

# 构建幂等: 二进制已存在则跳过(增量重建请用 bash scripts/dev-go.sh)
if [ ! -x .build/mhgl ]; then
    echo "[start] building .build/mhgl ..."
    mkdir -p .build
    go build -o .build/mhgl ./cmd/server
fi

# 前台运行(启动自举建表 + 空库自动播种; PORT 缺省 3000)
echo "[start] launching .build/mhgl on :${PORT:-3000} ..."
exec ./.build/mhgl
