#!/bin/bash
# [R36-m-1] dev server 守护: 端口 3000 死亡即重启(15s 轮询, 5s 冷却)。
# 背景: pod 内存天花板 ~2.6-3GB, 采集任务(RSS 2.6GB)+编译尖峰会击杀 next-server
# (dmesg 实锤 global_oom)。服务器死亡=任务已全部中止, 此时重启安全(孤儿恢复机制接管)。
# 仅在 3000 未监听时拉起, 不做健康检查级重启(避免误杀运行中的服务器)。
cd /home/z/my-project
while true; do
  if ! ss -ltn 2>/dev/null | grep -q ':3000 '; then
    echo "[watchdog $(date -u '+%H:%M:%S')] port 3000 dead, restarting dev server..."
    setsid bun run dev >> /tmp/main-dev-restart.log 2>&1 &
    sleep 5
  fi
  sleep 15
done
