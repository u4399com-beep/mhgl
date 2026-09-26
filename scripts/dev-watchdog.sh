#!/bin/bash
# [R36-m-1] dev server 守护: 端口 3000 死亡即重启(15s 轮询, 5s 冷却)。
# 背景: pod 内存天花板 ~2.6-3GB, 采集任务(RSS 2.6GB)+编译尖峰曾击杀旧 next-server
# (dmesg 实锤 global_oom; R55 起 dev server=Go 单体 .build/mhgl, bun run dev 仅作构建+拉起壳)。
# 服务器死亡=任务已全部中止, 此时重启安全(孤儿恢复机制接管)。
# 仅在 3000 未监听时拉起, 不做健康检查级重启(避免误杀运行中的服务器)。
# [R69] 纯 Go 化: 优先直接 bash scripts/dev-go.sh(零 bun 依赖); bun 存在时仍可
# 走 bun run dev 薄别名(行为等价, 额外多一层 bun 自动 .env 加载, dev-go.sh 已内化)。
cd /home/z/my-project
start_dev() {
  if command -v bun >/dev/null 2>&1; then
    setsid bun run dev >> /tmp/main-dev-restart.log 2>&1 &
  else
    setsid bash scripts/dev-go.sh >> /tmp/main-dev-restart.log 2>&1 &
  fi
}
while true; do
  if ! ss -ltn 2>/dev/null | grep -q ':3000 '; then
    echo "[watchdog $(date -u '+%H:%M:%S')] port 3000 dead, restarting dev server..."
    start_dev
    sleep 5
  fi
  sleep 15
done
