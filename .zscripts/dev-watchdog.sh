#!/bin/bash
# [R71] 与 scripts/dev-watchdog.sh 现役实现对齐 —— 直接委托 exec。
# 背景: 本目录旧版为 R21-tl-2 历史分叉(30s 轮询 + `setsid bun run dev` 硬依赖),
# bun 已不再是启动链一环(R69/R70), 旧版若被调用只会成为断链源。
# 现役语义(scripts/ 版): 15s 轮询 3000 端口, 仅当未监听才拉起 dev-go.sh
# (5s 冷却), 绝不动健康实例 —— 采集任务运行期间零中断。
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
exec bash "$PROJECT_DIR/scripts/dev-watchdog.sh"
