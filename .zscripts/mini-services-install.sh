#!/bin/bash

# [R71] 退役安全 no-op —— 原 mini-services 依赖批量安装器(bun install)。
# mini-services/ 目录(原 8 个 TS/Python 外置签名/解密代理, 端口 3010~3017)已随
# R69 纯 Go 化整体退役: 现役采集引擎直连采集, 外置签名/解密由对应规则自身的
# fetch 配置(代理池/curl 指纹/token 预取)承担, 不再需要任何伴生进程(可考古
# git 历史 mini-services/)。本脚本保留占位防旧调用链报「文件不存在」, 恒退出 0。

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)/mini-services"

if [ -d "$ROOT_DIR" ]; then
    echo "[retired] mini-services/ 目录存在, 但已随 R69 纯 Go 化退役 ——"
    echo "          本脚本不再对其做任何安装/构建/启动动作(如需考古: git 历史 mini-services/)"
else
    echo "[retired] mini-services 已随 R69 纯 Go 化退役(目录不存在) ——"
    echo "          无需安装任何子服务依赖, 安全跳过(退出 0)"
fi
exit 0
