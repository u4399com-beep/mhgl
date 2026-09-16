// ============================================================
// [R27-5b-H1] 友链/外链 URL 渲染出口白名单 —— 存储型 javascript: 伪协议 XSS 的渲染层兜底
//
// 背景: 友链 url 经 管理端录入(/api/admin/links, 已有 http(s) 白名单)或备份导入
// (/api/admin/backup/restore)入库; 存量脏数据/历史绕过仍可能含 javascript: 等伪协议,
// 渲染出口必须自净 —— 任何访客点击即执行的存储型 XSS 由这里拦死。
//
// 规则: 仅 http(s):// 前缀(大小写不敏感)与站内相对地址(/、#)放行, 其余一律返回 '#'
// (链接退化为同页锚点, 不再携带可执行伪协议)。白名单判定要求字面 https?:// 前缀,
// 对 &#58; 等实体编码形态天然免疫(实体串不会匹配前缀, 一律归 '#')。
// ============================================================
const SAFE_HREF_RE = /^https?:\/\//i

export function safeHref(url: string | null | undefined): string {
  const s = (url || '').trim()
  if (!s) return '#'
  // 协议相对地址(//host): 无伪协议执行风险, 但会按页面协议解析为外链并被第三方反解析
  // 访客来源 —— 与入库侧 normalizeLogo 同口径一律拒绝
  if (s.startsWith('//')) return '#'
  // 站内相对路径/锚点放行(友链库理论只存外链, 存量数据可能混入)
  if (s.startsWith('/') || s.startsWith('#')) return s
  return SAFE_HREF_RE.test(s) ? s : '#'
}
