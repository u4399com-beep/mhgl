#!/bin/bash
# 每日 DB 备份守护 — [R27-main] 与 dev-watchdog 同款存活策略; 24h 一备, 脚本内自带 7 份轮转
while true; do
  STAMP=$(date +%Y%m%d-%H%M%S) /home/z/my-project/.zscripts/db-backup.sh >/dev/null 2>&1 || true
  sleep 86400
done
