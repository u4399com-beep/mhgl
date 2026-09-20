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
// [R46-2c-1] 分类同类合并(R46-3): 灵异行并入悬疑(主流小说站"悬疑灵异"同段惯例, 如起点/
//   纵横/晋江分类页), 主分类收敛到 15 个 —— 词表行数即主分类白名单(15)
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
  ['悬疑', ['悬疑', '推理', '侦探', '凶案', '犯罪', '谜团', '刑警', '法医', '命案', '灵异', '鬼', '阴阳', '风水', '盗墓', '僵尸', '驱魔', '诡异']],
  ['体育', ['体育', '足球', '篮球', '奥运', '冠军', '教练', '联赛']],
  ['耽美', ['耽美', '纯爱', '原耽', '主受', '攻受']],
  ['轻小说', ['轻小说', '萌妹', '校园', '社团', '二次元', '青梅', '学妹', '学姐']],
  ['现实', ['现实', '职场', '创业', '商战', '生活', '家庭', '医生', '教师']],
]

// [R46-2c-1] 主分类白名单(≤15)与兜底分类名 —— consolidateCategories/smartCategory/
//   canonicalizeCategoryName 三者的单一真值源
// [R49-3-7] MAX_MAIN_CATEGORIES 导出常量删除(零引用 ts-prune+rg 双确认): 白名单实体为
//   CANONICAL_CATEGORIES(词表行数派生), 15 仅存于本注释
export const CANONICAL_CATEGORIES: string[] = CATEGORY_KEYWORDS.map(([name]) => name)
const CANON_SET = new Set(CANONICAL_CATEGORIES)
export const FALLBACK_CATEGORY = '其他'

// [R46-2c-1] 源站分类名 → 主分类 精确映射表(键一律小写): 覆盖笔趣阁系/起点系/晋江系/
//   纵横/17K/番茄/七猫/杰奇(x33yq)等常见小说站词表。命中即归一, 不再新建碎片分类。
//   组合分类("A B")按首词归(玄幻奇幻→玄幻/历史军事→历史/军事历史→军事)
const EXACT_CANON_MAP: Record<string, string> = {
  // 玄幻
  '玄幻小说': '玄幻', '东方玄幻': '玄幻', '异世大陆': '玄幻', '玄幻奇幻': '玄幻', '奇幻玄幻': '玄幻',
  '高武': '玄幻', '王朝争霸': '玄幻', '玄幻魔法': '玄幻', '玄幻言情': '玄幻', '转世重生': '玄幻',
  // 奇幻
  '奇幻小说': '奇幻', '西方奇幻': '奇幻', '剑与魔法': '奇幻', '西幻': '奇幻', '魔幻': '奇幻',
  '史诗奇幻': '奇幻', '奇幻修真': '奇幻', '领主种田': '奇幻', '黑暗幻想': '奇幻',
  // 武侠
  '武侠小说': '武侠', '武侠仙侠': '武侠', '传统武侠': '武侠', '新武侠': '武侠', '国术无双': '武侠',
  '快意恩仇': '武侠', '仙侠武侠': '武侠', '武侠同人': '武侠',
  // 仙侠
  '仙侠小说': '仙侠', '修真': '仙侠', '修真小说': '仙侠', '修仙': '仙侠', '古典仙侠': '仙侠',
  '现代修真': '仙侠', '幻想修仙': '仙侠', '洪荒': '仙侠', '凡人流': '仙侠', '仙侠奇缘': '仙侠',
  '幻想修真': '仙侠', '修真仙侠': '仙侠',
  // 都市
  '都市小说': '都市', '都市生活': '都市', '都市言情': '都市', '现代都市': '都市', '都市异能': '都市',
  '异能超能': '都市', '官场': '都市', '官商': '都市', '娱乐明星': '都市', '娱乐': '都市',
  '重生都市': '都市', '都市日常': '都市', '都市职场': '都市', '都市频道': '都市', '合租': '都市',
  // 言情
  '言情小说': '言情', '现代言情': '言情', '古代言情': '言情', '浪漫青春': '言情', '青春': '言情',
  '青春校园': '言情', '青春文学': '言情', '古言': '言情', '现言': '言情', '宫斗': '言情',
  '宅斗': '言情', '豪门世家': '言情', '婚恋情缘': '言情', '女生小说': '言情', '女生频道': '言情',
  '女频': '言情', '女频小说': '言情', '快穿': '言情', '穿越言情': '言情', '总裁豪门': '言情',
  '甜宠': '言情', '古代情缘': '言情', '婚恋': '言情', '言情频道': '言情', '言情小说网': '言情',
  // 历史
  '历史小说': '历史', '架空历史': '历史', '历史传记': '历史', '秦汉三国': '历史', '两晋隋唐': '历史',
  '上古先秦': '历史', '宋元明清': '历史', '外国历史': '历史', '穿越': '历史', '穿越小说': '历史',
  '穿越时空': '历史', '架空': '历史', '架空穿越': '历史', '历史军事': '历史', '历史频道': '历史',
  // 军事
  '军事小说': '军事', '军旅': '军事', '军旅生涯': '军事', '军旅生活': '军事', '抗战': '军事',
  '抗战烽火': '军事', '谍战': '军事', '谍战特工': '军事', '特工': '军事', '战争': '军事',
  '战争幻想': '军事', '军事战争': '军事', '军事历史': '军事',
  // 游戏
  '游戏小说': '游戏', '网游': '游戏', '网游小说': '游戏', '虚拟网游': '游戏', '电子竞技': '游戏',
  '电竞': '游戏', '电竞小说': '游戏', '游戏异界': '游戏', '游戏系统': '游戏', '游戏情缘': '游戏',
  '网游竞技': '游戏', '游戏异世': '游戏', '游戏频道': '游戏',
  // 科幻
  '科幻小说': '科幻', '科幻空间': '科幻', '末世': '科幻', '末世危机': '科幻', '星际': '科幻',
  '星际文明': '科幻', '未来世界': '科幻', '时空穿梭': '科幻', '赛博朋克': '科幻', '机甲': '科幻',
  '超级科技': '科幻', '进化变异': '科幻', '科幻末世': '科幻', '末世科幻': '科幻',
  // 悬疑(含灵异, [R46-2c-1] 合并)
  '悬疑小说': '悬疑', '灵异': '悬疑', '灵异小说': '悬疑', '悬疑灵异': '悬疑', '灵异悬疑': '悬疑',
  '推理': '悬疑', '推理悬疑': '悬疑', '悬疑推理': '悬疑', '侦探': '悬疑', '侦探推理': '悬疑',
  '恐怖': '悬疑', '惊悚': '悬疑', '恐怖惊悚': '悬疑', '惊悚恐怖': '悬疑', '盗墓': '悬疑',
  '盗墓探险': '悬疑', '诡秘': '悬疑', '诡秘悬疑': '悬疑', '探险': '悬疑', '民间传说': '悬疑',
  // 体育
  '体育小说': '体育', '体育竞技': '体育', '竞技': '体育', '篮球': '体育', '篮球运动': '体育',
  '足球': '体育', '足球运动': '体育', '棋牌': '体育', '其他竞技': '体育',
  // 耽美
  '耽美小说': '耽美', '纯爱': '耽美', '原耽': '耽美', '原创耽美': '耽美', '衍生耽美': '耽美',
  'bl': '耽美', 'bl小说': '耽美', '主受': '耽美',
  // 轻小说
  '二次元': '轻小说', '同人': '轻小说', '衍生同人': '轻小说', '同人衍生': '轻小说', '动漫': '轻小说',
  '日轻': '轻小说', '原生幻想': '轻小说', '吐槽': '轻小说', '宅系': '轻小说', '爆笑': '轻小说',
  // 现实
  '现实小说': '现实', '现实百态': '现实', '现实主义': '现实', '社会': '现实', '社会小说': '现实',
  '家庭': '现实', '家庭伦理': '现实', '情感': '现实', '职场': '现实', '职场小说': '现实',
  '商战': '现实', '财经': '现实', '乡土': '现实', '乡土小说': '现实',
  // 归「其他」: 源站导航/运营位噪声分类(不建为真实内容分类)
  '其他': '其他', '小说': '其他', '全本': '其他', '完本': '其他', '全本小说': '其他', '完本小说': '其他',
  '推荐': '其他', '排行榜': '其他', '新书': '其他', '精品': '其他', '热门': '其他', '免费': '其他',
  '综合': '其他', '综合小说': '其他', '杂谈': '其他', '本站精选': '其他', '网友转载': '其他',
}

/** [R46-2c-1] 源站分类名 → 主分类语义归一(同类合并核心工具):
 *  ① 剥书名号/引号/括号包裹与首尾空白 → ② 主分类恒等/精确映射表(EXACT_CANON_MAP) →
 *  ③ 循环剥离通用前后缀(女生/男生/女频/男频前缀, 小说/文学/频道/大全等尾巴)再查表 →
 *  ④ 包含关系回退(源名含某主分类名 → 该主分类, 取最长命中/同长按词表序)。
 *  无法归一返回 null(调用方决定保留或落「其他」)。纯函数, 供 smartCategory /
 *  consolidateCategories / 采集链路(runner 接线点建议)共用 */
export function canonicalizeCategoryName(raw: string): string | null {
  const s0 = (raw || '').trim()
  if (!s0) return null
  // 剥包裹符(书名号/引号/全半角括号)与内部空白
  let s = s0.replace(/^[\s《「『【[(（]+/, '').replace(/[\s》」』】\])）]+$/, '').replace(/\s+/g, '')
  if (!s) return null
  const lookup = (v: string): string | null => {
    if (CANON_SET.has(v)) return v
    return EXACT_CANON_MAP[v.toLowerCase()] ?? null
  }
  const direct = lookup(s)
  if (direct) return direct
  // 通用前后缀循环剥离(≤3 轮防"女生小说频道"类多层叠加)
  const GENDER_PREFIX_RE = /^(?:女生|男生|女频|男频)/
  const GENERIC_TAIL_RE = /(?:免费小说|小说网|文学网|免费阅读|小说|文学|频道|专区|大全|书库|分类|作品|排行榜|推荐|网)$/
  for (let i = 0; i < 3; i++) {
    const next = s.replace(GENDER_PREFIX_RE, '').replace(GENERIC_TAIL_RE, '')
    if (!next || next === s) break
    s = next
    const hit = lookup(s)
    if (hit) return hit
  }
  // 包含关系回退: "都市生活"含"都市"/"悬疑灵异"含"悬疑"。取最长命中(同长取词表序前者,
  // 保证确定性); 排除"其他"自包含
  let best: string | null = null
  for (const c of CANONICAL_CATEGORIES) {
    if (s.includes(c) && (best === null || c.length > best.length)) best = c
  }
  return best
}

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
// [R46-2c-1] 分类同类合并改造(修前碎片化根因): 源站分类原文在「来源命中失败/智能分类关闭」
//  时被 runner 原样 upsert 成新分类, 每站一套词表 → 分类表无限膨胀。改造后:
//  ① 源分类先过 canonicalizeCategoryName 语义归一(映射表/前后缀/包含关系) → 只落主分类;
//  ② 归一失败但原文已是库内分类(操作员自建/存量) → 原样保留不误伤;
//  ③ 全链路落空但源站确实给了分类 → 「其他」兜底(FALLBACK_CATEGORY), 不再新建碎片分类;
//  ④ 无源分类 → null(维持既有"无分类可归"语义, 不硬塞「其他」)
export async function smartCategory(
  bookName: string,
  intro: string,
  sourceCategory?: string
): Promise<{ category: string | null; method: 'source' | 'keyword' | 'llm' | 'fallback' | 'none' }> {
  const cats = await db.category.findMany({ orderBy: { sortOrder: 'asc' } }).catch((e: unknown) => {
    // [R9-a-18] 修复: findMany 异常(DB 瞬断/SQLite busy)原先直接上抛 → 采集流水线把整本书
    // 计为失败。智能分类是锦上添花, 异常时退化空分类表(关键词匹配/LLM 兑底照常, 仅丢
    // "直接命中已有分类名"一步)
    console.warn('[smart] 分类表读取失败(退化空表):', (e as Error)?.message?.slice(0, 80))
    return [] as Array<{ name: string }>
  })
  const names = cats.map((c) => c.name)
  const nameSet = new Set(names)

  // 1. 来源站点自带分类(先语义归一再消费)
  const sc = sourceCategory?.trim() || ''
  if (sc) {
    const canon = canonicalizeCategoryName(sc)
    if (canon) return { category: canon, method: 'source' }
    // 归一失败但已是库内分类: 操作员自建/存量分类原样保留(收敛只走 consolidateCategories)
    if (nameSet.has(sc)) return { category: sc, method: 'source' }
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
  // 4. [R46-2c-1] 终兜底: 源站确实提供了分类但全程(归一/词表/LLM)未命中 → 归入「其他」,
  //  修前该场景把源分类原文 upsert 成新分类(碎片化主入口); 无源分类维持 null 不硬塞
  if (sc) return { category: FALLBACK_CATEGORY, method: 'fallback' }
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

// ---------------- [R46-2c-1] 存量碎片分类收敛 ----------------

export interface ConsolidateResult {
  /** true=仅预览不落库 */
  dryRun: boolean
  /** 收敛前/后分类总数 */
  before: number
  after: number
  /** 无变化分类(主分类自身/不可归一但有书的自建分类) */
  kept: string[]
  /** 合并明细: from=被并入的碎片分类, to=主分类, books=迁移书籍数 */
  merges: Array<{ from: string; to: string; books: number }>
  /** 收敛过程中新建的主分类 */
  created: string[]
  /** 删除的空分类(碎片空壳/不可归一空壳) */
  deleted: string[]
}

/**
 * [R46-2c-1] 存量碎片分类一次性收敛(同类合并):
 *  - 可归一(canonicalizeCategoryName 命中)且有书 → 迁移书籍到主分类后删除碎片分类;
 *  - 可归一但空壳(0 书) → 直接删除;
 *  - 不可归一但有书 → 保守保留(操作员自建分类不误伤, dryRun 可先预览);
 *  - 不可归一且空壳 → 删除(纯导航噪声)。
 * 消费方: POST /api/admin/categories/consolidate(API) 与一次性收敛脚本(采集期后按需执行)。
 * 与在途采集的并发安全: 书籍迁移用 updateMany(原子), 分类删除在迁移之后; 并发窗口内
 * smartCategory 重建同名碎片分类时只会得到 0 书空壳, 不丢数据(下次收敛再清)。
 */
export async function consolidateCategories(opts?: { dryRun?: boolean }): Promise<ConsolidateResult> {
  const dryRun = opts?.dryRun === true
  const cats = await db.category.findMany({
    orderBy: { sortOrder: 'asc' },
    include: { _count: { select: { books: true } } },
  })
  const result: ConsolidateResult = {
    dryRun,
    before: cats.length,
    after: cats.length,
    kept: [],
    merges: [],
    created: [],
    deleted: [],
  }
  if (!cats.length) return result

  const nameToId = new Map(cats.map((c) => [c.name, c.id] as const))

  // 目标规划: 每个分类 → { target(可空), books }
  type Plan = { id: string; name: string; books: number; target: string | null; isSelf: boolean }
  const plans: Plan[] = cats.map((c) => {
    const t = canonicalizeCategoryName(c.name)
    return { id: c.id, name: c.name, books: c._count.books, target: t, isSelf: t === c.name }
  })

  // 需要确保存在的主分类目标: 有书可迁 且 目标≠自身 且 库内暂无同名分类
  const needCreate = new Set<string>()
  for (const p of plans) {
    if (p.target && !p.isSelf && p.books > 0 && !nameToId.has(p.target)) needCreate.add(p.target)
  }
  // 新建主分类(sortOrder=词表序; 「其他」恒排最后)
  for (const name of needCreate) {
    const sortOrder = CANONICAL_CATEGORIES.indexOf(name) >= 0
      ? CANONICAL_CATEGORIES.indexOf(name)
      : CANONICAL_CATEGORIES.length
    if (!dryRun) {
      await db.category.upsert({ where: { name }, create: { name, sortOrder }, update: {} })
    }
    result.created.push(name)
  }

  // 执行迁移 + 删除
  for (const p of plans) {
    if (p.isSelf) { result.kept.push(p.name); continue }
    if (!p.target) {
      // 不可归一: 有书保守保留, 空壳删除
      if (p.books > 0) result.kept.push(p.name)
      else {
        if (!dryRun) await db.category.delete({ where: { id: p.id } }).catch(() => {})
        result.deleted.push(p.name)
      }
      continue
    }
    if (p.books > 0) {
      if (!dryRun) {
        const target = await db.category.findUnique({ where: { name: p.target }, select: { id: true } })
        if (target) {
          await db.book.updateMany({ where: { categoryId: p.id }, data: { categoryId: target.id } })
        }
      }
      result.merges.push({ from: p.name, to: p.target, books: p.books })
    }
    if (!dryRun) await db.category.delete({ where: { id: p.id } }).catch(() => {})
    result.deleted.push(p.name)
  }

  result.after = result.before - result.deleted.length + (dryRun ? 0 : result.created.length)
  return result
}
