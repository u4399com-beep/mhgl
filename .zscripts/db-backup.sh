#!/bin/bash
# SQLite 每日备份 — [R27-main] DB 清空事故(2026-09-15)后加的保险:
# 每日备份 db/custom.db 到 backups/, 保留最近 7 份; 由 cron 工具调度
set -e
cd /home/z/my-project
mkdir -p backups
STAMP=$(date +%Y%m%d-%H%M%S)
python3 - << PYEOF
import sqlite3, os
src = '/home/z/my-project/db/custom.db'
dst = f'/home/z/my-project/backups/db-{os.environ.get("STAMP","manual")}.db'
con = sqlite3.connect(f'file:{src}?mode=ro', uri=True)
bak = sqlite3.connect(dst)
con.backup(bak)
bak.close(); con.close()
print('backup ->', dst)
PYEOF
ls -1t backups/db-*.db 2>/dev/null | tail -n +8 | xargs -r rm -f
echo "done $STAMP"
