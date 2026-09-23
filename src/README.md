# src/ — 历史资产（非运行时代码）

本目录是 Next.js 时代的 TS/TSX 前端源码。项目 R55 起已全栈 Golang 化
（单二进制 internal/… + cmd/server），本目录**不参与构建与运行**。

保留原因：`components/public/sites/` 下各站点 React 组件是各主题模板
（internal/web/tpl/themes/）1:1 复刻的**视觉参考权威**（布局/类名/硬编码配色），
主题移植与回源对比时以此对照。全主题移植完成前请勿删除。

- 运行时入口：`cmd/server/main.go`
- 部署：`package.json scripts`（dev/build/start 全部 Go 语义）
