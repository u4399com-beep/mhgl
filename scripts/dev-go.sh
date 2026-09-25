#!/usr/bin/env bash
# ============================================================
# mhgl Go 单体 dev 启动脚本(bun run dev 的后端实现)
#   默认 PORT=3000 DB_PATH=db/custom.db(正式运行)
#   联调: PORT=3040 DB_PATH=db/go-test.db bash scripts/dev-go.sh
# 依赖: ~/go-sdk/go/bin(GO_SDK_BIN 可覆盖); 二进制缓存于 .build/mhgl,
#       源码有变更时自动重建。
#
# [R68-d] 自愈化启动(根治「预览总是挂掉」): 沙箱/环境重置会杀进程+清空
#   $HOME 下 Go SDK+清掉 DB 文件 → 3000 无人监听。本脚本启动前自检自愈:
#   ① go 缺失 → 自动 bash scripts/install-go.sh 幂等安装后重试
#      (显式 GO_SDK_BIN 指定时尊重定制安装位, 只报错不自装);
#   ② DB 文件缺失/空/缺核心表 → bunx prisma db push 建表(Go 侧 store.Open
#      零迁移, 缺表直接 fatal, 必须在启动前建好), 并挂后台探活子壳: 服务
#      HTTP 200 后跑 scripts/bootstrap-db.ts 幂等引导(35 规则/16 分类/
#      默认站点/三大部头任务, 不自动开采集);
#      设 MHGL_AUTO_BOOTSTRAP=0 可整套关闭自举(纯手动运维)。
#   增量构建逻辑与 PORT/DB_PATH/MEM_LIMIT_MB 覆盖形态保持不变。
# ============================================================
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="${GO_SDK_BIN:-$HOME/go-sdk/go/bin}:$PATH"
export GOMEMLIMIT="${MEM_LIMIT_MB:-600}MiB"

# ---- [R68-d] ① 自愈: Go 工具链 ----
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

# ---- [R68-d] ② 自愈: DB 表结构 + 运行态引导 ----
DB_FILE="${DB_PATH:-db/custom.db}"
case "$DB_FILE" in /*) DB_ABS="$DB_FILE" ;; *) DB_ABS="$(pwd)/$DB_FILE" ;; esac

db_ready() {  # 文件存在且非空且(能深查时)含核心表 → 0
  [ -s "$1" ] || return 1
  command -v python3 >/dev/null 2>&1 || return 0   # 无 python3: 文件非空按可用处理(不误伤既有库)
  python3 - "$1" <<'PYCHECK' 2>/dev/null
import sys, sqlite3
con = sqlite3.connect(sys.argv[1])
rows = {r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
con.close()
sys.exit(0 if {"Task", "Book", "Chapter", "Rule", "Category"} <= rows else 1)
PYCHECK
}

if [ "${MHGL_AUTO_BOOTSTRAP:-1}" != "0" ] && ! db_ready "$DB_ABS"; then
  if ! command -v bun >/dev/null 2>&1; then
    echo "[dev-go] ! DB 缺失/缺表 ($DB_FILE) 但 bun 不可用, 无法自举 —— 手动: bunx prisma db push + bun run scripts/bootstrap-db.ts" >&2
  else
    echo "[dev-go] DB 缺失/缺表 ($DB_FILE) → 自举建表: bunx prisma db push (关闭自举: MHGL_AUTO_BOOTSTRAP=0)"
    mkdir -p "$(dirname "$DB_ABS")"
    if ! DATABASE_URL="file:$DB_ABS" bunx prisma db push --skip-generate; then
      echo "[dev-go] ! prisma db push 失败 —— 缺表状态下服务会启动失败; 检查 bun/网络后重跑 (手动: DATABASE_URL=file:$DB_ABS bunx prisma db push)" >&2
    fi
  fi
fi

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

# ---- [R68-d] ② 续: 服务就绪后补运行态引导(后台子壳, 不阻塞启动) ----
# 放在构建之后: 探活窗只覆盖「拉起到 200」(秒级), 不被首次构建(分钟级)吃掉额度。
# bootstrap-db.ts 走管理 API, 必须等服务起来; 幂等, 重复执行安全。
if [ "${MHGL_AUTO_BOOTSTRAP:-1}" != "0" ] && ! db_ready "$DB_ABS" && command -v bun >/dev/null 2>&1; then
  wait_port="${PORT:-3000}"
  (
    deadline=$((SECONDS + 300))
    while [ "$SECONDS" -lt "$deadline" ]; do
      code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "http://127.0.0.1:$wait_port/" 2>/dev/null || true)"
      if [ "$code" = "200" ]; then
        echo "[dev-go] 服务已就绪(:$wait_port) → bun run scripts/bootstrap-db.ts (幂等引导: 35 规则/16 分类/默认站点/3 任务)"
        bun run scripts/bootstrap-db.ts || echo "[dev-go] ! bootstrap 失败 —— 可稍后手动: bun run scripts/bootstrap-db.ts"
        exit 0
      fi
      sleep 2
    done
    echo "[dev-go] ! 服务 300s 未就绪, 跳过 bootstrap 引导 (就绪后手动: bun run scripts/bootstrap-db.ts)"
  ) &
fi

exec "$BUILD"
