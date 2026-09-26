#!/bin/bash
# 每日 DB 备份守护 — [R27-main] 与 dev-watchdog 同款存活策略; 24h 一备, 脚本内自带 7 份轮转
# [R71] 口径注: db-backup.sh 已自定位项目根与 DB 路径(db/custom.db, DB_PATH 可覆盖),
# 源库缺失时友好跳过 —— 沙箱重置后空转属正常, 服务建库后自动恢复备份。
while true; do
  STAMP=$(date +%Y%m%d-%H%M%S) /home/z/my-project/.zscripts/db-backup.sh >/dev/null 2>&1 || true
  sleep 86400
done
