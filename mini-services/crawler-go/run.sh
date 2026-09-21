#!/usr/bin/env bash
# ============================================================
# crawler-go 启动脚本 — 契约 §9 mini-services 约定
#   GOMEMLIMIT=600MiB: Go 软内存顶(契约 §1 进程内存策略)
#   崩溃自动重启(1s 退避); 开发期改码手动重启即可
# ============================================================
export PATH=$HOME/go-sdk/go/bin:$PATH
export GOMEMLIMIT=600MiB
cd "$(dirname "$0")"
while true; do
  mkdir -p .build && go build -o .build/crawler-go . && .build/crawler-go
  echo "[crawler-go] exited, restart in 1s"
  sleep 1
done
