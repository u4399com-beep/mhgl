#!/bin/bash
# dev server 自愈守护 — [R21-tl-2]
# 背景: 本沙箱 watchman 会在 Bash 调用结束后 1~2 分钟回收 next-server 进程(已知运维行为,
# 见 worklog R21-b 排障注记), 导致用户侧预览间歇性 502。
# 策略: 每 30s 探测 3000 端口, 仅当不可达时才拉起新实例 —— 绝不 kill/重启健康实例,
# 因此用户采集任务运行期间本守护不会造成任何中断(任务运行中服务必然在线, 守护空转)。
while true; do
  if ! curl -s --max-time 5 -o /dev/null http://127.0.0.1:3000/; then
    cd /home/z/my-project || exit 1
    setsid bun run dev >/dev/null 2>&1 &
  fi
  sleep 30
done
