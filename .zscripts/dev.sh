#!/bin/bash

# [R71] 平台引导链纯 Go 化终版 —— dev.log(2026-09-26)实证断链修复:
#   原实现 `bun run bootstrap` 引用的 package.json 别名自 R69 起已不存在
#   ("error: Script not found \"bootstrap\"" 后 set -e 中断, 平台引导链断裂);
#   原 `bun install`(package.json 零依赖空转)+`command -v bun` 硬依赖一并退役。
#   现行链路(纯 Go, 零 bun/Node/Prisma):
#     ① .env 注入(Go 二进制不自载 .env, 与 scripts/dev-go.sh ① 步同口径)
#     ② 3000 未监听时拉起 scripts/dev-go.sh(go 自愈安装→增量构建→exec 二进制;
#        启动自举建表 + 空库自动播种) —— 已监听则跳过, 幂等可重入
#     ③ 探活等待 → `.build/mhgl bootstrap` 幂等引导(失败不阻断: 服务端
#        空库自动播种已兜底, 可稍后手动重跑)
#     ④ 健康检查(/ 与 /healthz)
#   mini-services 启动段已删(该目录 R69 整体退役, 采集引擎直连采集)。

set -euo pipefail

# 获取脚本所在目录（.zscripts）
# 使用 $0 获取脚本路径
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

log_step_start() {
        local step_name="$1"
        echo "=========================================="
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting: $step_name"
        echo "=========================================="
        export STEP_START_TIME
        STEP_START_TIME=$(date +%s)
}

log_step_end() {
        local step_name="${1:-Unknown step}"
        local end_time
        end_time=$(date +%s)
        local duration=$((end_time - STEP_START_TIME))
        echo "=========================================="
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] Completed: $step_name"
        echo "[LOG] Step: $step_name | Duration: ${duration}s"
        echo "=========================================="
        echo ""
}

wait_for_service() {
        local host="$1"
        local port="$2"
        local service_name="$3"
        local max_attempts="${4:-60}"
        local attempt=1

        echo "Waiting for $service_name to be ready on $host:$port..."

        while [ "$attempt" -le "$max_attempts" ]; do
                if curl -s --connect-timeout 2 --max-time 5 "http://$host:$port" >/dev/null 2>&1; then
                        echo "$service_name is ready!"
                        return 0
                fi

                echo "Attempt $attempt/$max_attempts: $service_name not ready yet, waiting..."
                sleep 1
                attempt=$((attempt + 1))
        done

        echo "ERROR: $service_name failed to start within $max_attempts seconds"
        return 1
}

cleanup() {
        if [ -n "${DEV_PID:-}" ] && kill -0 "$DEV_PID" >/dev/null 2>&1; then
                echo "Stopping Go dev server (PID: $DEV_PID)..."
                kill "$DEV_PID" >/dev/null 2>&1 || true
        fi
}

trap cleanup EXIT INT TERM

cd "$PROJECT_DIR"

# ---- ① .env 注入(仅简单 KEY=VALUE 行; Go 二进制不自载 .env) ----
if [ -f .env ]; then
        set -a
        # shellcheck disable=SC1091
        . ./.env 2>/dev/null || true
        set +a
fi

port_listening() { ss -ltn 2>/dev/null | grep -q ':3000 '; }

# ---- ② Go 服务启动(3000 已监听则跳过 —— 幂等, 不与 recover.sh/在跑实例抢端口) ----
log_step_start "Starting Go server"
if port_listening; then
        echo "[GO] Port 3000 already listening - skip server start (idempotent)"
else
        echo "[GO] Starting Go monolith server (scripts/dev-go.sh)..."
        bash scripts/dev-go.sh &
        DEV_PID=$!
fi
log_step_end "Starting Go server"

# ---- ③ 探活等待 + bootstrap 幂等引导 ----
log_step_start "Waiting for Go server"
# 180s 窗口与 scripts/recover.sh [3/6] 对齐: 沙箱重置后首次构建(含 go 工具链
# 自愈安装)可能 2~3 分钟, 原 60s 窗口会在构建中途误判失败并触发 cleanup 杀进程
wait_for_service "localhost" "3000" "Go server" 180
log_step_end "Waiting for Go server"

log_step_start "bootstrap (idempotent)"
# [R71] 原 `bun run bootstrap` 断链修复: 改为 R69 Go CLI 形态 `.build/mhgl bootstrap`
# (直连 SQLite 幂等引导: 建表 + 35 规则/16 分类/默认站点/3 任务; 不需要密码/服务在线;
# 失败不阻断引导链 —— 服务端空库自动播种已兜底, 可稍后手动重跑)
if [ -x .build/mhgl ]; then
        if ! .build/mhgl bootstrap; then
                echo "WARN: bootstrap failed (non-fatal; service auto-seed covers empty DB)."
                echo "      Rerun later: .build/mhgl bootstrap"
        fi
else
        echo "WARN: .build/mhgl not found (dev-go.sh build failed?) - skip bootstrap"
fi
log_step_end "bootstrap (idempotent)"

# ---- ④ 健康检查 ----
log_step_start "Health check"
echo "[GO] Performing health check..."
curl -fsS localhost:3000 >/dev/null
curl -fsS localhost:3000/healthz >/dev/null || echo "[GO] (warn: /healthz not 200, root already 200)"
echo "[GO] Health check passed"
log_step_end "Health check"

# [R71] 原 start_mini_services 段删除: mini-services/ 已随 R69 纯 Go 化整体退役
# (外置签名/解密代理 3010~3017 由规则自身 fetch 配置承担, 无伴生进程)。
echo "mini-services retired since R69 - skipping."

if [ -n "${DEV_PID:-}" ]; then
        echo "Go server is running in background (PID: $DEV_PID)."
        echo "Use 'kill $DEV_PID' to stop it."
        disown "$DEV_PID" 2>/dev/null || true
        unset DEV_PID
else
        echo "Go server is already running on port 3000 (started elsewhere; left untouched)."
fi
