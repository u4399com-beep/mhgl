#!/usr/bin/env bash
# [R52] Go 工具链一键安装(~/go-sdk) —— Go 单体(.build/mhgl)的编译依赖。
# 沙箱/环境重置会清空 $HOME 下内容, 重置后执行: bash scripts/install-go.sh
# 幂等: 已安装且版本匹配则跳过。镜像源自动回退(go.dev → golang.google.cn)。
set -euo pipefail
GO_VER="1.26.0"
PREFIX="${HOME}/go-sdk"
ARCH="$(uname -m)"
case "$ARCH" in x86_64) GOARCH="amd64" ;; aarch64|arm64) GOARCH="arm64" ;; *) echo "unsupported arch: $ARCH"; exit 1 ;; esac

if [ -x "$PREFIX/go/bin/go" ] && "$PREFIX/go/bin/go" version 2>/dev/null | grep -q "go$GO_VER"; then
  echo "[install-go] $GO_VER 已就绪: $PREFIX/go/bin/go"
  exit 0
fi

mkdir -p "$PREFIX"
TGZ="go${GO_VER}.linux-${GOARCH}.tar.gz"
if ! curl -fsSL -o "$PREFIX/go.tgz" "https://go.dev/dl/$TGZ"; then
  echo "[install-go] go.dev 不可达, 回退国内镜像"
  curl -fsSL -o "$PREFIX/go.tgz" "https://golang.google.cn/dl/$TGZ"
fi
tar -xzf "$PREFIX/go.tgz" -C "$PREFIX" && rm -f "$PREFIX/go.tgz"
"$PREFIX/go/bin/go" version
echo "[install-go] 完成。dev-go.sh/recover.sh 会自动把 $PREFIX/go/bin 加入 PATH(dev-go.sh 检测到 go 缺失时也会自动调本脚本)"
