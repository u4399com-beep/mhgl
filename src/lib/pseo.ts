// ============================================================
// [R27-2-3] PSEO 关键词落地页 — 纯函数层(无 Prisma/无 fetch, 客户端服务端同构)
// 下拉词/模板词 → 目标关键词候选 + slug 生成 + 相关书挑选。
// 服务端生成服务(Prisma 写库)见 ./pseo-server; 前台 SSR 见 src/app/[...slug]/page.tsx。
// ============================================================

/** 单关键词码点上限(SQLite 索引友好 + 搜索展示安全线) */
const PSEO_KEYWORD_MAX = 40
/** slug 清洗后正文段码点上限(剩空间给哈希后缀) */
const PSEO_SLUG_BODY_MAX = 72
/** slug 哈希后缀字符数(base36) */
const PSEO_SLUG_SUFFIX_LEN = 6
/** 单次生成全局页数上限(保护 POST 时长与 SQLite 写入) */
export const PSEO_RUN_LIMIT = 500
/** sitemap 纳入 PSEO URL 上限 */
export const PSEO_SITEMAP_LIMIT = 2000

// ---------------- 关键词清洗 ----------------

/** 关键词规范化: 折叠空白 + 去控制字符 + 码点截断; 空返回 ''(调用方丢弃) */
export function normalizeKeyword(raw: string): string {
  const s = String(raw || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const pts = Array.from(s)
  return pts.length <= PSEO_KEYWORD_MAX ? s : pts.slice(0, PSEO_KEYWORD_MAX).join('')
}

// ---------------- 模板族 ----------------

interface PseoBookMeta {
  name: string
  author: string
  category?: string | null
}

/**
 * 书籍元数据 → 模板族关键词(固定高意图族, 生成序即优先级):
 *   txt下载 / 作者全集 / 最新章节 / 无弹窗阅读 / 分类小说 —— 与任务给定模板族一致。
 * 模板族恒最先入候选(管理端「每书页数」优先给到它们)。
 */
export function templateKeywordsOf(book: PseoBookMeta): string[] {
  const name = normalizeKeyword(book.name)
  if (!name) return []
  const author = normalizeKeyword(book.author || '')
  const category = normalizeKeyword(book.category || '')
  const out = [
    `${name}txt下载`,
    author ? `${name}${author}全集` : '',
    `《${name}》最新章节`,
    `${name}无弹窗在线阅读`,
    category ? `《${name}》${category}小说` : '',
  ]
  return out.map(normalizeKeyword).filter(Boolean)
}

/**
 * 关联下拉词 w → 关键词:
 *   w 已含书名(含大小写变体) → 直接用 w(如「完美世界 小说」);
 *   否则 → 《书名》+w(如 w=「第二季」→「《完美世界》第二季」)。
 */
export function keywordFromSuggestWord(book: PseoBookMeta, word: string): string {
  const w = normalizeKeyword(word)
  const name = (book.name || '').trim()
  if (!w) return ''
  if (name && w.toLowerCase().includes(name.toLowerCase())) return w
  return normalizeKeyword(`《${name}》${w}`)
}

// ---------------- slug 生成 ----------------

/** slug 安全字符: CJK 统一表意/扩展A/注音兼容 + 字母数字 + -_ */
const SLUG_SAFE_RE = /[^\p{Script=Han}\p{L}\p{N}_-]+/gu

/**
 * slug 方案(任务建议: CJK 关键词直接进路径 + 短 id 后缀防碰撞):
 *   ① 非 [汉字/字母/数字/-_] 字符(空格、/、?、#、% 等路径/编码敏感符)折叠为 '-'
 *   ② 去首尾 '-', 收敛连续 '-', 正文段码点截断至 72(留出哈希后缀空间)
 *   ③ 追加 '-' + 6 位 base36 FNV-1a(keyword) 哈希 —— 确定性后缀: 同关键词再生成
 *      得到同 slug(管理端重复点「生成」不产生新 URL), 不同关键词哈希几乎必异;
 *   ④ 剩余碰撞由调用方捕获 Prisma P2002 后加随机熵重试兜底(见 pseo-server)。
 * 理由: 全 slug URL 对爬虫可读, 哈希后缀仅 7 字符成本换全局唯一硬约束。
 */
export function pseoSlugOf(keyword: string): string {
  const base = (keyword || '')
    .replace(SLUG_SAFE_RE, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
  const pts = Array.from(base)
  const body = (pts.length > PSEO_SLUG_BODY_MAX ? pts.slice(0, PSEO_SLUG_BODY_MAX).join('') : base)
    .replace(/-+$/g, '')
  return `${body || 'kw'}-${fnv1a36(keyword).toString(36).padStart(PSEO_SLUG_SUFFIX_LEN, '0')}`
}

/** FNV-1a 32bit → 无符号整数(确定性, 零依赖) */
function fnv1a36(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

// ---------------- 相关书挑选(生成期) ----------------

/** 相关书挑选的最小形状(生成期从 Prisma select 得到) */
interface PseoRelatedCandidate {
  id: string
  categoryId?: string | null
  wordCount?: number | null
}

/**
 * 主书 + 候选池 → matchedBookIds(主书恒最前):
 *   ① 同分类书按字数降序取前 4(内容相关性最强);
 *   ② 不足额用全库字数榜补位 —— 保证非 thin content(≥3 本相关书)。
 */
export function pickMatchedBookIds(
  primary: PseoRelatedCandidate,
  pool: PseoRelatedCandidate[],
  take = 4,
): string[] {
  const ids: string[] = [primary.id]
  const seen = new Set<string>([primary.id])
  const sameCat = pool
    .filter((b) => !seen.has(b.id) && b.categoryId && b.categoryId === primary.categoryId)
    .sort((a, b) => (b.wordCount || 0) - (a.wordCount || 0))
  const rest = pool
    .filter((b) => !seen.has(b.id))
    .sort((a, b) => (b.wordCount || 0) - (a.wordCount || 0))
  for (const b of [...sameCat, ...rest]) {
    if (ids.length >= take + 1) break
    if (seen.has(b.id)) continue
    seen.add(b.id)
    ids.push(b.id)
  }
  return ids
}
