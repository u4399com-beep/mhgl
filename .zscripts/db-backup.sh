#!/bin/bash
# SQLite 每日备份 — [R27-main] DB 清空事故(2026-09-15)后加的保险:
# 每日备份 db/custom.db 到 backups/, 保留最近 7 份; 由 cron 工具调度
# [R71] 修复与加固(行为向后兼容):
#   ① 项目根随脚本定位(原硬编码 cd /home/z/my-project)
#   ② 源库缺失/空(沙箱重置后服务尚未建库)→ 友好跳过退出 0, 不再 python 报错炸出
#   ③ 首跑 backups/ 无历史文件时 `ls backups/db-*.db` 退出码非零, set -e 会在
#      备份成功后误报失败 —— 兜底 || true
#   ④ STAMP 尊重调用方传入(db-backup-loop.sh 传入环境变量)并 export,
#      shell 变量与 python os.environ 不再各取各的时间戳
#   ⑤ 在线备份语义保留: python sqlite3 mode=ro 连接 + backup API(WAL 一致性快照)
set -euo pipefail
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
export PROJECT_DIR   # python 段经 os.environ 消费
cd "$PROJECT_DIR"
mkdir -p backups
STAMP="${STAMP:-$(date +%Y%m%d-%H%M%S)}"
export STAMP

# DB 路径对齐现行口径: DB_PATH(DB_PATH_CHECK 同名覆盖)缺省 db/custom.db; 相对路径按项目根解析
DB_FILE="${DB_PATH:-db/custom.db}"
case "$DB_FILE" in
  /*) : ;;
  *)  DB_FILE="$PROJECT_DIR/$DB_FILE" ;;
esac
export DB_FILE   # python 段经 os.environ 消费

if [ ! -s "$DB_FILE" ]; then
  echo "skip: 源库不存在/为空 ($DB_FILE) —— 服务尚未建库(沙箱重置后属正常), 本次不备份"
  exit 0
fi

python3 - << 'PYEOF'
import sqlite3, os
src = os.environ['DB_FILE']
dst = f"{os.environ['PROJECT_DIR']}/backups/db-{os.environ.get('STAMP','manual')}.db"
con = sqlite3.connect(f'file:{src}?mode=ro', uri=True)
bak = sqlite3.connect(dst)
con.backup(bak)
bak.close(); con.close()
print('backup ->', dst)
PYEOF
ls -1t backups/db-*.db 2>/dev/null | tail -n +8 | xargs -r rm -f || true
echo "done $STAMP"
