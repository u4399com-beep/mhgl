// ============================================================
// [R51-4] 代理 URL → Playwright per-context proxy 参数 单一实现
// 修前双份同语义实现且已漂移: fetcher.playwrightProxyParts(R17-d-2 逐组件安全解码) vs
// obscura.parseProxyParts(单 try 包整体 —— 密码含非法 % 序列时 decodeURIComponent 抛
// URIError, 外层 catch 落 { server: proxy } 把内嵌凭证原样交给 Playwright server 参数,
// 审计 P3-11; playwright 要求 server 不带凭证, 连接即败)。统一为 fetcher 口径:
//   - 凭证拆出 username/password(server 恒无凭证)
//   - 逐组件 decodeURIComponent 容错: 单组件解码失败仅该组件回退原编码值, 不整体 catch
//   - 无凭证时原样返回 { server: proxy }
// 消费方: fetcher.ts(browser 引擎 per-context 代理) + obscura.ts(R9-b-7 隐身上下文代理;
// obscura 禁止反向 import fetcher, 故下沉独立小模块而非并入任一侧)。
// 凭证脱敏(日志面)不属本模块: fetcher.redactProxy 独立保留。
// ============================================================

/** 代理 URL 拆解(Playwright proxy 形态): server 不含凭证, 内联凭证拆 username/password */
export function parseProxyParts(proxy: string): { server: string; username?: string; password?: string } {
  try {
    const u = new URL(proxy)
    if (u.username || u.password) {
      const out: { server: string; username?: string; password?: string } = {
        server: `${u.protocol}//${u.host}`,
      }
      // [R17-d-2](Low): decodeURIComponent 对合法 %XX 但非法 UTF-8 序列(如密码 'a%80b')
      // 抛 URIError → 逐组件安全解码: 解不开退回原编码值, 保证 server 恒无凭证
      // ([R51-4] 修前 obscura 副本单 try 包整体, 解码失败整串带凭证落 server 参数)
      const dec = (s: string) => {
        try {
          return decodeURIComponent(s)
        } catch {
          return s
        }
      }
      const un = dec(u.username)
      const pw = dec(u.password)
      if (un) out.username = un
      if (pw) out.password = pw
      return out
    }
  } catch {
    /* 非法 URL: 原样返回(调用方均已有 isValidProxySpec/格式校验前置, 理论不达) */
  }
  return { server: proxy }
}
