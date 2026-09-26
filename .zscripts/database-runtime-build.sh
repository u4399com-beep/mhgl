#!/bin/bash

# [R71] 退役安全 no-op —— 原「把 Preview DB 打进部署产物 + `bun run db:push` 同步
# schema」的构建期子流程。其依赖的 package.json "db:push" 别名(R63-c 消失)与
# Next.js 部署打包链(build.sh 旧形态)均已退役; 原唯一调用方 build.sh 已于 R71
# 纯 Go 化, 现无任何调用方。
# 现行口径: SQLite 建表由 Go 服务每次启动原生幂等自举(internal/bootstrap
# EnsureSchema, 14 表); 空库自动播种; 显式引导 = `.build/mhgl bootstrap`(幂等)。

set -euo pipefail
echo "[retired] database-runtime-build.sh 已退役(R71): 建库建表由 Go 服务启动自举"
echo "          / '.build/mhgl bootstrap' 承担, 部署打包链已废 —— 安全跳过(退出 0)"
exit 0
