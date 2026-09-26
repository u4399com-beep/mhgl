#!/bin/bash

# [R71] 退役安全 no-op —— 原「构建期把 Python 依赖固化进部署产物(uv) + 携带
# Python 源码」的子流程。项目现为纯 Go 单体(仓库零 .py 源码、零 requirements.txt/
# pyproject.toml), 原 Next.js 部署打包链与 next-service-dist 载体均已退役;
# 原唯一调用方 build.sh 已于 R71 纯 Go 化, 现无任何调用方。

set -euo pipefail
echo "[retired] python-runtime-build.sh 已退役(R71): 项目为纯 Go 单体, 无 Python"
echo "          源码/依赖清单, 部署打包链已废 —— 安全跳过(退出 0)"
exit 0
