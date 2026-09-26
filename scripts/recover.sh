#!/usr/bin/env bash
# ============================================================
# [R61-1A] 沙箱/环境重置 一键恢复脚本 —— 「预览总是挂掉」的工程化兜底
#
# 用法:  bash scripts/recover.sh
#        ADMIN_PASSWORD=xxx bash scripts/recover.sh     # 覆盖管理员密码
#        RECOVER_DRYRUN=1 bash scripts/recover.sh       # 演练模式: 只打印将执行的动作,
#                                                       # 不安装/不建库/不启动/不引导
#        RECOVER_START_TASKS=1 bash scripts/recover.sh  # bootstrap 后自动启动
#                                                       # 本次新建的任务(已存在的任务不动)
#
# 背景: 沙箱重置会 杀进程 + 清空 $HOME 下 Go SDK + 清掉 DB 文件, 导致
#       3000 端口无人监听 → 预览打不开。本脚本把原本 5 步手工恢复链
#       (装 Go → 重建库 → 起服务 → bootstrap → 看门狗) 收敛为一键幂等流程:
#
#   [1/6] 检测 Go SDK, 缺失则 bash scripts/install-go.sh
#   [2/6] 检测 DB 文件完整性: 缺失→跳过(服务自建); 损坏/缺核心表→rm 坏文件
#         (服务启动时 EnsureSchema 原生重建, 无任何外部工具依赖) [R69 纯 Go 化]
#   [3/6] 检测 3000 端口, 未监听则后台拉起 dev-go.sh, 轮询 / 直到 200
#         (超时 180s —— 首次构建 + 拉模块可能 2~3 分钟)
#   [4/6] .build/mhgl bootstrap 幂等引导(规则/分类/站点/任务, 不开采集;
#         服务空库自动播种的同口径 CLI 形态, 幂等可重复) [R69: 替代 TS 引导脚本]
#   [5/6] 检测 dev-watchdog.sh 看门狗, 未运行则后台拉起
#   [6/6] 打印恢复报告(服务 HTTP 码 / 规则数 / 书数 / 分类数)
#
# 幂等: 可重复执行, 各步检测到位即跳过。允许单步失败继续(不用 set -e)。
# 纯 Go: 全流程零 bun/Node/Prisma 依赖 [R69]。
# ============================================================
set -uo pipefail
cd "$(dirname "$0")/.."

DRYRUN="${RECOVER_DRYRUN:-0}"
JAR="/tmp/recover-jar"

say()  { echo "[recover] $*"; }
warn() { echo "[recover] ! $*"; }

port_listening() { ss -ltn 2>/dev/null | grep -q ':3000 '; }

# ------------------------------------------------------------
# [1/6] Go 工具链
# ------------------------------------------------------------
GO_BIN="${HOME}/go-sdk/go/bin/go"
if [ -x "$GO_BIN" ] && "$GO_BIN" version >/dev/null 2>&1; then
  say "[1/6] Go SDK 已就绪: $("$GO_BIN" version 2>/dev/null)"
else
  say "[1/6] Go SDK 缺失 → bash scripts/install-go.sh"
  if [ "$DRYRUN" = "1" ]; then
    echo "  [dryrun] 将执行: bash scripts/install-go.sh"
  else
    bash scripts/install-go.sh || warn "install-go.sh 失败, 继续后续步骤(编译/启动可能仍失败)"
  fi
fi
export PATH="${HOME}/go-sdk/go/bin:$PATH"

# ------------------------------------------------------------
# [2/6] DB 文件完整性(缺失→服务自建; 损坏/缺核心表→删坏文件交服务重建)
# ------------------------------------------------------------
DB_FILE="${DB_PATH:-db/custom.db}"
db_state="$(DB_PATH_CHECK="$DB_FILE" python3 - <<'PYCHECK' 2>/dev/null
import os, sqlite3
p = os.environ.get("DB_PATH_CHECK", "db/custom.db")
if not os.path.exists(p):
    print("DBFILE_MISSING")
    raise SystemExit(0)
try:
    con = sqlite3.connect(p)
    rows = {r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    con.close()
except Exception:
    print("DB_OPEN_FAIL")
    raise SystemExit(0)
need = {"Task", "Book", "Chapter", "Rule", "Category"}
missing = sorted(need - rows)
print("MISSING:" + ",".join(missing) if missing else "DB_OK")
PYCHECK
)"
[ -n "$db_state" ] || db_state="PY_FAIL"   # python3 缺失/崩溃 → 空输出按缺表处理

if [ "$db_state" = "DB_OK" ]; then
  say "[2/6] DB 完整 ($DB_FILE), 跳过"
elif [ "$db_state" = "DBFILE_MISSING" ]; then
  say "[2/6] DB 文件缺失 ($DB_FILE) → 服务启动时原生自建(EnsureSchema), 无需处理"
else
  say "[2/6] DB 损坏/缺核心表 ($db_state) → 删除坏文件, 服务启动时原生重建"
  if port_listening; then
    warn "3000 端口仍在监听但 DB 缺表 —— 异常状态; 仅删坏文件, 不重启服务"
  fi
  if [ "$DRYRUN" = "1" ]; then
    echo "  [dryrun] 将执行: rm -f $DB_FILE $DB_FILE-wal $DB_FILE-shm"
  else
    rm -f "$DB_FILE" "$DB_FILE-wal" "$DB_FILE-shm"
    mkdir -p "$(dirname "$DB_FILE")"
  fi
fi

# ------------------------------------------------------------
# [3/6] 3000 端口与服务探活
# ------------------------------------------------------------
if port_listening; then
  say "[3/6] 端口 3000 已监听"
else
  if [ "$DRYRUN" = "1" ]; then
    say "[3/6] [dryrun] 3000 未监听, 将执行: ( setsid nohup bash scripts/dev-go.sh > dev.log 2>&1 < /dev/null & )"
  else
    say "[3/6] 3000 未监听 → 后台拉起 dev-go.sh (日志: dev.log)"
    ( setsid nohup bash scripts/dev-go.sh > dev.log 2>&1 < /dev/null & )
  fi
fi

if [ "$DRYRUN" = "1" ] && ! port_listening; then
  http_code="(dryrun-未启动, 跳过探活)"
else
  say "     探活轮询 http://127.0.0.1:3000/ 直到 200 (超时 180s, 首次构建可能 2~3 分钟)…"
  http_code="000"
  deadline=$((SECONDS + 180))
  while [ "$SECONDS" -lt "$deadline" ]; do
    http_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:3000/ 2>/dev/null || true)"
    [ "$http_code" = "200" ] && break
    sleep 3
  done
fi
if [ "$http_code" = "200" ]; then
  say "     服务存活 (HTTP 200)"
else
  warn "服务探活未通过 (HTTP $http_code) —— tail dev.log 查看构建/启动日志"
fi

# ------------------------------------------------------------
# [4/6] bootstrap 幂等引导(.build/mhgl bootstrap; 不开采集)
#   RECOVER_START_TASKS=1: 记录引导前任务名 → 引导后仅启动本次新建任务
# ------------------------------------------------------------
ADMIN_PASSWORD="${ADMIN_PASSWORD:-audit-fix-2025}"
export ADMIN_PASSWORD

api_get() {  # $1=路径(需已登录 jar) → stdout=body
  curl -s --max-time 10 -b "$JAR" "http://127.0.0.1:3000$1" 2>/dev/null || true
}
admin_login() {
  rm -f "$JAR"
  curl -s --max-time 10 -c "$JAR" -o /dev/null -X POST http://127.0.0.1:3000/api/auth/login \
    -H 'Content-Type: application/json' -d "{\"password\":\"$ADMIN_PASSWORD\"}" >/dev/null 2>&1
}
# task_names 快照: python3 解析 /api/admin/tasks 的 name 列表
task_names() {
  api_get /api/admin/tasks | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print('\n'.join(sorted(t.get('name','') for t in d.get('data') or [])))
except Exception:
    pass
" 2>/dev/null || true
}

if [ "$http_code" = "200" ]; then
  BUILD_BIN=".build/mhgl"
  if [ ! -x "$BUILD_BIN" ]; then
    say "[4/6] .build/mhgl 不存在 → go build(服务进程可能尚未产出二进制)"
    if [ "$DRYRUN" != "1" ]; then go build -o "$BUILD_BIN" ./cmd/server || warn "go build 失败"; fi
  fi
  if [ "${RECOVER_START_TASKS:-0}" = "1" ]; then
    say "[4/6] 运行 .build/mhgl bootstrap (幂等引导; 随后启动本次新建任务)"
    if [ "$DRYRUN" = "1" ]; then
      echo "  [dryrun] 将执行: 快照任务名 → $BUILD_BIN bootstrap → 登录 API 启动新增任务"
    else
      BEFORE="$(admin_login; task_names)"
      "$BUILD_BIN" bootstrap || warn "bootstrap 失败 —— 可稍后单独重跑: .build/mhgl bootstrap"
      AFTER="$(admin_login; task_names)"
      NEWN="$(comm -13 <(printf '%s\n' "$BEFORE" | sort -u) <(printf '%s\n' "$AFTER" | sort -u) | sed '/^$/d')"
      if [ -n "$NEWN" ]; then
        admin_login
        printf '%s\n' "$NEWN" | while IFS= read -r tname; do
          tid="$(api_get /api/admin/tasks | TNAME="$tname" python3 -c "
import sys, json, os
want = os.environ.get('TNAME','')
try:
    d = json.load(sys.stdin)
    for t in d.get('data') or []:
        if t.get('name') == want:
            print(t['id']); break
except Exception:
    pass
" 2>/dev/null)"
          if [ -n "$tid" ]; then
            code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 -b "$JAR" -X POST \
              "http://127.0.0.1:3000/api/admin/tasks/$tid/control" \
              -H 'Content-Type: application/json' -d '{"action":"start"}' 2>/dev/null || true)"
            say "       新任务启动: $tname (id=$tid) → HTTP $code"
          fi
        done
      else
        say "       无本次新建任务(既有任务不动)"
      fi
    fi
  else
    say "[4/6] 运行 .build/mhgl bootstrap (幂等引导, 不自动开采集)"
    if [ "$DRYRUN" = "1" ]; then
      echo "  [dryrun] 将执行: $BUILD_BIN bootstrap"
    else
      "$BUILD_BIN" bootstrap || warn "bootstrap 失败 —— 可稍后单独重跑: .build/mhgl bootstrap"
    fi
  fi
else
  warn "[4/6] 服务未探活(HTTP $http_code), 跳过 bootstrap; 服务就绪后请手动跑: .build/mhgl bootstrap"
fi

# ------------------------------------------------------------
# [5/6] 看门狗(dev-watchdog: 端口死亡自动拉起)
# ------------------------------------------------------------
if pgrep -f 'scripts/dev-watchdog.sh' >/dev/null 2>&1; then
  say "[5/6] 看门狗已在运行 (pid: $(pgrep -f 'scripts/dev-watchdog.sh' | tr '\n' ' '))"
else
  say "[5/6] 看门狗未运行 → 后台拉起 (日志: /tmp/watchdog.log)"
  if [ "$DRYRUN" = "1" ]; then
    echo "  [dryrun] 将执行: ( setsid nohup bash scripts/dev-watchdog.sh > /tmp/watchdog.log 2>&1 < /dev/null & )"
  else
    ( setsid nohup bash scripts/dev-watchdog.sh > /tmp/watchdog.log 2>&1 < /dev/null & )
  fi
fi

# ------------------------------------------------------------
# [6/6] 恢复报告
# ------------------------------------------------------------
say "[6/6] 恢复报告"
echo "------------------------------------------------------------"
echo "  服务探活 : http://127.0.0.1:3000/ → HTTP $http_code"
if pgrep -f 'scripts/dev-watchdog.sh' >/dev/null 2>&1; then
  echo "  看门狗   : 运行中 (端口死亡 15s 内自动拉起)"
else
  echo "  看门狗   : 未运行 (!) — 手动: ( setsid nohup bash scripts/dev-watchdog.sh > /tmp/watchdog.log 2>&1 < /dev/null & )"
fi
echo "  任务续采 : 服务重启后被收编为 paused 的任务 → 后台「采集任务」页点「启动」,"
echo "             或 POST /api/admin/tasks/{id}/control --data '{\"action\":\"start\"}' 续采(断点不丢)"

if [ "$http_code" = "200" ]; then
  admin_login
  stats_json="$(api_get /api/admin/stats)"
  rules_json="$(api_get /api/admin/rules)"
  rm -f "$JAR"

  parse_num() {  # $1=json  $2=python 表达式 → 数字或 "?"
    printf '%s' "$1" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    v = $2
    print(v if isinstance(v, int) else '?')
except Exception:
    print('?')
" 2>/dev/null || echo "?"
  }
  books="$(parse_num "$stats_json" 'd.get("data", {}).get("books")')"
  cats="$(parse_num "$stats_json" 'len(d.get("data", {}).get("categories") or [])')"
  rules="$(parse_num "$rules_json" 'len(d.get("data") or [])')"

  if [ "$rules" != "?" ] || [ "$books" != "?" ]; then
    echo "  数据面   : 规则 $rules 条 / 书籍 $books 本 / 分类 $cats 个"
    echo "  提示     : 数据面为 0 时重跑本脚本或手动 .build/mhgl bootstrap"
  else
    echo "  数据面   : 无法读取(登录失败? 核对 ADMIN_PASSWORD, 缺省同登录页提示)"
  fi
else
  echo "  数据面   : 服务未探活, 略; 就绪后跑 bash scripts/recover.sh 复核"
fi
echo "------------------------------------------------------------"
say "恢复流程结束 (RECOVER_DRYRUN=1 可演练)"
