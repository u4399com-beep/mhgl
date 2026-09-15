// ============================================================
// 智能系统 — 智能分类匹配 / 智能完结判断
// 关键词规则优先, LLM(z-ai-web-dev-sdk) 兜底
// ============================================================
import { db } from '@/lib/db'

// ---------------- 智能分类 ----------------
// [R22-c-3] 词表修订(真实库误分类实证驱动):
// - 玄幻去 '逆天'(年代/都市重生文简介高频"逆天改命", 实证《重生老太…》靠它与'重生'打平
//   且按表序误归玄幻), 增 '神祇'/'神国'(全民流/神祇流实证《全民神祇…》修前归类失败落 null)
// - 都市 ' urb '→'urban' + 增 '七零'/'八零'/'九零'(年代文); 军事 ' war '→'war' ——
//   带空格词按 R9-a-17 原样匹配永不命中真实简介(死关键词), R22-c-2 词界方案下不再需要
// - 新增耽美行(置于轻小说之前: 与'校园'打平时耽美优先)
const CATEGORY_KEYWORDS: [string, string[]][] = [
  ['玄幻', ['玄幻', '修罗', '斗气', '魔法学院', '异界', '大陆', '废材', '神帝', '武魂', '神祇', '神国']],
  ['奇幻', ['奇幻', '史诗', '骑士', '法师', '精灵', '龙族', '矮人', '魔兽']],
  ['武侠', ['武侠', '江湖', '剑客', '侠', '武林', '门派', '轻功', '内力', '镖局']],
  ['仙侠', ['仙侠', '修真', '修仙', '筑基', '金丹', '元婴', '渡劫', '灵气', '仙人', '道法']],
  ['都市', ['都市', '重生', '赘婿', '神豪', '总裁', '兵王', '神医', 'urban', '打工', '逆袭', '求婚', '离婚', '七零', '八零', '九零']],
  ['言情', ['言情', '甜宠', '恋爱', '霸总', '婚恋', '公主', '新娘', '嫁', '爱恋', '心动']],
  ['历史', ['历史', '穿越', '朝代', '大唐', '大明', '大清', '三国', '水浒', '宋朝', '始皇', '皇帝', '王朝']],
  ['军事', ['军事', '抗战', 'war', '士兵', '特种兵', '战场', '部队', '军官']],
  ['游戏', ['游戏', '网游', '电竞', '副本', '升级', '系统', '玩家', '战队', '开黑']],
  ['科幻', ['科幻', '星际', '末世', '丧尸', '机甲', '飞船', '外星', '末日', 'AI', '人工智能', '虫族']],
  ['悬疑', ['悬疑', '推理', '侦探', '凶案', '犯罪', '谜团', '刑警', '法医', '命案']],
  ['灵异', ['灵异', '鬼', '阴阳', '风水', '盗墓', '僵尸', '驱魔', '诡异']],
  ['体育', ['体育', '足球', '篮球', '奥运', '冠军', '教练', '联赛']],
  ['耽美', ['耽美', '纯爱', '原耽', '主受', '攻受']],
  ['轻小说', ['轻小说', '萌妹', '校园', '社团', '二次元', '青梅', '学妹', '学姐']],
  ['现实', ['现实', '职场', '创业', '商战', '生活', '家庭', '医生', '教师']],
]

/**
 * [R22-c-2] 分类匹配文本归一化: 全角拉丁/标点(FF01-FF5E)→半角、全角空格→半角空格、
 * 统一小写 —— 修前 'ＡＩ觉醒'(全角)命不中 'AI'、"War"(首字母大写)命不中 ' war '。
 * 中文经此变换不变; 长度逐字不变(1:1 映射), 截断 3000 与原实现等价。
 */
function normalizeCategoryText(text: string): string {
  return (text || '')
    .replace(/\u3000/g, ' ')
    .replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .toLowerCase()
    .slice(0, 3000)
}

// [R19-b-3] 精简: 全库无外部导入(仅本文件 smartCategory 内部使用), 去 export 防误用面
function matchCategoryByText(text: string, existingCategories?: string[]): string | null {
  const t = normalizeCategoryText(text)
  if (!t) return null
  // 1. 直接命中已有分类名(同样归一化, 英文分类名大小写不敏感)
  if (existingCategories?.length) {
    for (const c of existingCategories) {
      const cn = normalizeCategoryText(c)
      if (cn && t.includes(cn)) return c
    }
  }
  // 2. 关键词评分
  let best: { name: string; score: number } | null = null
  for (const [name, kws] of CATEGORY_KEYWORDS) {
    let score = 0
    for (const rawKw of kws) {
      const kw = rawKw.trim()
      if (!kw) continue
      // [R22-c-2] 纯 ASCII 字母数字词走 \b 词边界匹配(复用本文件 wordMatches, 大小写不敏感):
      // 'urban' 不再命中 suburban/turban(承接 R9-a-17 防误伤意图且恢复关键词可用性 ——
      // 修前 ' urb ' 带空格原样匹配在真实简介中永假, 'AI' 大小写敏感漏 'ai');
      // 中文词无词边界概念仍走 includes
      const hit = /^[a-z0-9]+$/i.test(kw) ? wordMatches(t, kw) : t.includes(kw)
      if (hit) score += kw.length >= 2 ? 2 : 1
    }
    if (score > 0 && (!best || score > best.score)) best = { name, score }
  }
  return best ? best.name : null
}

/** LLM 智能分类(后端专用) */
export async function smartCategory(
  bookName: string,
  intro: string,
  sourceCategory?: string
): Promise<{ category: string | null; method: 'source' | 'keyword' | 'llm' | 'none' }> {
  const cats = await db.category.findMany({ orderBy: { sortOrder: 'asc' } }).catch((e: unknown) => {
    // [R9-a-18] 修复: findMany 异常(DB 瞬断/SQLite busy)原先直接上抛 → 采集流水线把整本书
    // 计为失败。智能分类是锦上添花, 异常时退化空分类表(关键词匹配/LLM 兑底照常, 仅丢
    // "直接命中已有分类名"一步)
    console.warn('[smart] 分类表读取失败(退化空表):', (e as Error)?.message?.slice(0, 80))
    return [] as Array<{ name: string }>
  })
  const names = cats.map((c) => c.name)

  // 1. 来源站点自带分类
  if (sourceCategory) {
    const sc = sourceCategory.trim()
    const hit = names.find((n) => n === sc || sc.includes(n) || n.includes(sc.slice(0, 2)))
    if (hit) return { category: hit, method: 'source' }
  }

  // 2. 关键词规则
  const kw = matchCategoryByText(`${bookName}\n${intro}`, names)
  if (kw) return { category: kw, method: 'keyword' }

  // 3. LLM 兜底([R22-c-4] 分类表为空时跳过: 提示词无从选分类, LLM 回答必然匹配失败,
  // 只会白耗一次网络调用+15s 超时预算; 关键词命中仍可在上一步放行 —— 首个分类由关键词表自举)
  if (!names.length) return { category: null, method: 'none' }
  try {
    const ZAI = (await import('z-ai-web-dev-sdk')).default
    const zai = await ZAI.create()
    const prompt = `你是一个小说分类专家。请从以下分类列表中选出最合适的一个分类(只返回分类名本身, 不要其他内容):\n分类列表: ${names.join('、')}\n\n书名: ${bookName}\n简介: ${intro.slice(0, 500)}\n\n只返回一个分类名:`
    const timeoutP = new Promise<never>((_, rej) => {
      const t = setTimeout(() => rej(new Error('LLM 分类超时(15s)')), 15_000)
      if (typeof t.unref === 'function') t.unref()
    })
    timeoutP.catch(() => {}) // 落选后吞掉 rejection, 防 unhandled rejection
    const res = await Promise.race([
      zai.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
      }),
      timeoutP,
    ])
    const answer = (res.choices?.[0]?.message?.content || '').trim()
    const hit = names.find((n) => answer.includes(n))
    if (hit) return { category: hit, method: 'llm' }
  } catch (e: any) {
    console.warn('[smart] llm category failed:', e?.message?.slice(0, 80))
  }
  return { category: null, method: 'none' }
}

// ---------------- 智能完结判断 ----------------
// 词表统一小写; detectCompleteFromText 对文本 toLowerCase 后匹配(大小写不敏感) ——
// 原实现 t.includes(w) 区分大小写, 英文站状态字段 "Ongoing"(首字母大写)匹配不到
// 小写 'ongoing' 落到 unknown, 随后被简介/末章启发式误判成 completed(wuxiaworld 实测)
const COMPLETE_WORDS = ['已完结', '已完本', '完结', '完本', '全本', '大结局', '全书完', '正文完', '无弹窗全本', 'final', 'completed', 'complete', 'finished']
// 英文连载态: Ongoing/On Going/On-Going/Serializing/Updating(+已有 serial)。
// Hiatus/Paused(暂停/休载)系统无此状态(books 状态白名单= unknown/ongoing/completed),
// 按口径归 ongoing 并已在 worklog 记录。'unfinished'/'incomplete' 防御性收录: 否则
// 这两个否定词会被 'finished'/'complete' 子串命中误判成 completed(ongoing 优先检查可拦住)
const ONGOING_WORDS = ['连载中', '连载', '未完结', '未完待续', '新书', '更新中', 'ongoing', 'on going', 'on-going', 'serial', 'serializing', 'updating', 'unfinished', 'incomplete', 'hiatus', 'paused']

/**
 * 词命中判定: 英文单词(纯 [a-z]+)用 \b 词边界匹配 —— 'final' 不再命中 'finally',
 * 'complete' 不再命中 'completely'(Bug 28)。中文词无词边界概念, 仍走 includes。
 * 含连字符/空格的英文短语('on going'/'on-going')不是纯 [a-z]+, 走 includes 分支
 * (短语形态本身就是良好隔离, 子串匹配误伤面极小)。
 */
function wordMatches(t: string, w: string): boolean {
  if (/^[a-z]+$/i.test(w)) {
    try {
      return new RegExp(`\\b${w}\\b`, 'i').test(t)
    } catch {
      // 退化兜底(理论上不会触发, w 已通过 ^[a-z]+$ 校验)
      return t.includes(w)
    }
  }
  return t.includes(w)
}

// [R19-b-3] 精简: 全库无外部导入(仅本文件 smartCompleteDetect 内部使用), 去 export 防误用面
function detectCompleteFromText(text: string): 'completed' | 'ongoing' | 'unknown' {
  // 小写化后匹配: 中英文词表统一大小写不敏感(中文词不受 toLowerCase 影响)
  const t = (text || '').slice(0, 2000).toLowerCase()
  if (!t) return 'unknown'
  // 未完优先(避免"未完结"被"完结"误判)
  for (const w of ONGOING_WORDS) {
    if (wordMatches(t, w)) return 'ongoing'
  }
  for (const w of COMPLETE_WORDS) {
    if (wordMatches(t, w)) return 'completed'
  }
  return 'unknown'
}

/**
 * 智能判断完结:
 * 1. 源站状态字段
 * 2. 简介关键词
 * 3. 最新章节标题含完结词
 * 4. 标题含(完结)
 */
export function smartCompleteDetect(input: {
  statusField?: string
  intro?: string
  latestChapterTitle?: string
  bookName?: string
  lastChapterTitle?: string
}): { status: 'completed' | 'ongoing' | 'unknown'; reason: string } {
  const { statusField, intro, latestChapterTitle, bookName, lastChapterTitle } = input
  if (statusField) {
    const r = detectCompleteFromText(statusField)
    if (r !== 'unknown') return { status: r, reason: `源站状态: ${statusField.slice(0, 30)}` }
  }
  if (intro) {
    const r = detectCompleteFromText(intro)
    if (r !== 'unknown') return { status: r, reason: '简介关键词' }
  }
  if (latestChapterTitle) {
    const r = detectCompleteFromText(latestChapterTitle)
    if (r !== 'unknown') return { status: r, reason: '最新章节标题' }
  }
  if (lastChapterTitle) {
    const r = detectCompleteFromText(lastChapterTitle)
    if (r !== 'unknown') return { status: r, reason: '目录末章标题' }
  }
  if (bookName) {
    const r = detectCompleteFromText(bookName)
    if (r !== 'unknown') return { status: r, reason: '书名标注' }
  }
  return { status: 'unknown', reason: '无法判断' }
}
