import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* 关闭 X-Powered-By 响应头 (middleware 也会兜底删除) */
  poweredByHeader: false,
  /* SEO: /sitemap.xml 与 /robots.txt 直接可用 */
  async rewrites() {
    return [
      { source: "/sitemap.xml", destination: "/api/public/sitemap" },
    ];
  },
  /* 强制类型检查 (Task 2-a: 重新启用生产构建类型门禁) */
  typescript: {
    ignoreBuildErrors: false,
  },
  /* 开发模式安全检查 (Task 2-a: 开启 React StrictMode) */
  reactStrictMode: true,
  /* [R49-10] Turbopack 文件监视排除运行时高频写入路径 —— 实证: 项目根下任意未被忽略的文件
   *  被持续改写都会触发路由模块图失效 → 监控页 2s 轮询每请求重编译(实测 compile: 50-105ms)
   *  +全图重新求值(fetcher 配置日志反复打印)。Next 16 turbopack.watchOptions.ignored 已移除
   *  (tsc 实证), 监视排除改由 .gitignore 驱动(turbopack 原生 watcher 尊重 gitignore) ——
   *  运行时高频产物(dev.log/db/data/worklog/agent-ctx 等)已在 .gitignore 全量覆盖 */
};

export default nextConfig;
