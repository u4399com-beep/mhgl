#!/bin/bash

# [R71] 平台构建脚本纯 Go 化 —— 原 Next.js 部署打包链全部退役:
#   bun install → next build → standalone 自愈注入 → .next/public 产物收集 →
#   mini-services 安装/构建 → python-runtime 固化 → DB 打包 → tar.gz。
#   上述链路的载体(src/、prisma/、mini-services/、Dockerfile、部署 tar)已随
#   R62-a/R63-c/R66-d/R69 陆续退役, git 历史可考。
# 现行构建 = go build -o .build/mhgl ./cmd/server (与 package.json "build" 同口径)。

exec 2>&1

set -eu

# 获取脚本所在目录（.zscripts 目录）
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if [ ! -d "$PROJECT_DIR" ]; then
    echo "❌ 错误: 项目目录不存在: $PROJECT_DIR"
    exit 1
fi

echo "🚀 开始构建 Go 单体二进制..."
echo "📁 项目路径: $PROJECT_DIR"

cd "$PROJECT_DIR"

# go 工具链自愈(与 scripts/dev-go.sh 同口径): PATH 补 ~/go-sdk → 仍缺则 install-go.sh
if ! command -v go >/dev/null 2>&1; then
    export PATH="$HOME/go-sdk/go/bin:$PATH"
fi
if ! command -v go >/dev/null 2>&1; then
    echo "📦 go not found - auto install: bash scripts/install-go.sh (自愈)"
    bash scripts/install-go.sh
    export PATH="$HOME/go-sdk/go/bin:$PATH"
fi
if ! command -v go >/dev/null 2>&1; then
    echo "❌ 构建失败: go 工具链不可用 —— 手动执行 bash scripts/install-go.sh 后重试"
    exit 1
fi

echo "🔨 go build -o .build/mhgl ./cmd/server"
mkdir -p .build
go build -o .build/mhgl ./cmd/server

if [ ! -x .build/mhgl ]; then
    echo "❌ 构建失败: 未产出 .build/mhgl"
    exit 1
fi

echo ""
echo "✅ 构建完成!"
echo "📊 产物:"
ls -lh .build/mhgl
echo ""
echo "ℹ️  运行: ./.build/mhgl (或 bash .zscripts/start.sh) → :3000"
echo "ℹ️  首次启动自动幂等建表+空库播种; 显式引导: .build/mhgl bootstrap"
