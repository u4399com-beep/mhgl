// ============================================================
// 内容清洗系统 — 广告清洗 / HTML标签规范 / 段落规整 / 繁体→简体
// 适用于 书籍信息 / 章节目录 / 章节内容
// ============================================================
import * as cheerio from 'cheerio'
import * as OpenCC from 'opencc-js'
import { type CleanConfig, DEFAULT_CLEAN_CONFIG } from './types'
// [R9-cl-1] 整合: escapeRegExp/sliceCodePoints 下沉到 @/lib/utils 共用(原本文件内 escapeReg
// 与 DebugHtmlViewer.escapeRegExp 重复; 码点截断惯用法三处重复)
import { escapeRegExp, sliceCodePoints } from '@/lib/utils'
// [R51-3-c] 违禁词接线: 纯引擎(applyBannedWordsToHtml) + 服务端配置缓存(60s TTL, 单一事实源
// 在 banned-words-server, 本模块只持同步快照供同步热路径读取)
import { applyBannedWordsToHtml, type BannedWordsConfig } from '@/lib/banned-words'
import {
  getBannedWordsConfig,
  invalidateBannedWordsCache as invalidateServerBannedWordsCache,
} from '@/lib/banned-words-server'

// ---------- 繁体→简体转换(OpenCC, 采集源为繁体时自动启用) ----------
// 设计: 逐段检测"繁体独有字"命中才触发转换 —— 简体源站零误转, 繁体源站任意段落必然
// 高频命中。转换用 OpenCC 词组级词典(t→cn), 对已是简体的词组(如「乾隆」「乾坤」)有
// 短语保护, 不会误改。
// 强信号集: 差异字中再过滤掉"同形归并字"(t2s 会改写但 s2t 不回环的字, 如 乾→干/
// 係→系/唸→念 共 281 个) —— 这些字在规范简体中合法存在(乾隆/乾县/乾坤), 却会被
// OpenCC 字符级归并, 若作为触发信号则简体文本被误转换(乾县→干县)。过滤法: 双向回环
// 检测 s2t(t2s(ch))===ch 的字才是繁体特有字(書→书→書 ✓; 乾→干→幹 ✗ 被排除)。
// 注意: 转换只做单遍(不做不动点迭代) —— 含「乾」的文本(乾县/乾清宫等非词组保护词)
// 第二遍会被继续转成「干县」, 单遍语义下第一遍保留的写法才是正确结果(繁体源 乾縣→乾县)。
type T2SConv = (s: string) => string
interface T2SState {
  conv: T2SConv
  /** 简体→繁体反向转换器: 仅供构建强信号集(同形归并字回环过滤)用 */
  convBack?: T2SConv
  /** 繁体特有字强信号集: 全 CJK 区逐字符过转换器, t2s 有变化且 s2t 回环一致(即该字
   * 不会以简体身份出现)的字。简体文本含这些字才视为繁体源; 同形归并字(乾/係/唸…)被
   * 排除在外, 简体正文/书名含它们零误触发 */
  diffSet: Set<string>
}
// 挂 globalThis 防 dev 热更新每轮模块重求值都重建转换器+差异字集(实测构建约 70ms,
// 且 HMR 多实例下重复驻留词典内存); 与 hostGates/__novelHostGate_v1 同款做法。
// v2: diffSet 语义收紧(同形归并字排除), 键升级防热重载复用旧全量集合
const globalForT2S = globalThis as unknown as { __novelT2S_v2?: T2SState | null }

/** 强信号差异字集构建: CJK扩展A + 基本区 + 兼容表意文字, 分块以换行分隔逐字转换防词组跨界合并。
 * 行数不变式断言: 输出若与输入行数不齐(词组词典跨行合并/吞行), 该块降级逐字转换兜底,
 * 保证差异字集不错位漏字。t2s 变化的字再做 s2t 回环检查(排除同形归并字) */
function buildDiffCharSet(conv: T2SConv, convBack: T2SConv): Set<string> {
  const set = new Set<string>()
  const chars: string[] = []
  for (let cp = 0x3400; cp <= 0x9fff; cp++) chars.push(String.fromCodePoint(cp))
  for (let cp = 0xf900; cp <= 0xfa6f; cp++) chars.push(String.fromCodePoint(cp))
  const CHUNK = 500
  for (let i = 0; i < chars.length; i += CHUNK) {
    const chunk = chars.slice(i, i + CHUNK)
    let out: string[] | null = null
    try {
      const joined = conv(chunk.join('\n')).split('\n')
      if (joined.length === chunk.length) out = joined
    } catch { /* 该块降级逐字 */ }
    for (let j = 0; j < chunk.length; j++) {
      const ch = chunk[j]
      const converted = out ? out[j] : conv(ch)
      if (converted === ch) continue
      // 同形归并字过滤: s2t(t2s(ch)) 回环不到原字的(乾→干→幹), 说明该字在规范简体中
      // 合法存在(乾隆/乾坤), 不作为繁体触发信号 —— 否则简体文本被误转换
      try {
        if (convBack(converted) !== ch) continue
      } catch {
        // R4-21: convBack 抛错时不再"保守收录"——旧行为 fall-through 到 set.add(ch) 会把
        // 乾/係/唸 这类"在规范简体中合法存在但 convBack 异常"的字当作繁体触发信号, 导致
        // 简体源站被误判为繁体并执行 t2s 转换(乾县→干县, 真实简体损坏)。改为 continue
        // 跳过该字(保守视为非繁体信号), 与"无变化"分支同口径——单字漏判不触发整段转换,
        // 整段真正含繁体字时其他字仍会命中 diffSet
        continue
      }
      set.add(ch)
    }
  }
  return set
}

/** 惰性初始化(每进程最多构建一次, 失败标记 null 不再重试) */
function ensureT2S(): T2SState | null {
  if (globalForT2S.__novelT2S_v2 !== undefined) return globalForT2S.__novelT2S_v2
  try {
    const conv = OpenCC.Converter({ from: 't', to: 'cn' }) as T2SConv
    const convBack = OpenCC.Converter({ from: 'cn', to: 't' }) as T2SConv
    globalForT2S.__novelT2S_v2 = { conv, convBack, diffSet: buildDiffCharSet(conv, convBack) }
  } catch {
    globalForT2S.__novelT2S_v2 = null
  }
  return globalForT2S.__novelT2S_v2
}

/** 文本是否含繁体特有字(强信号) */
function hasVariantChinese(text: string, st: T2SState): boolean {
  if (!text) return false
  for (const ch of text) if (st.diffSet.has(ch)) return true
  return false
}

/** 繁体→简体(纯文本); 简体/无CJK文本原样返回; 空值安全 */
export function t2sText(text: string | undefined | null): string {
  if (!text) return ''
  const st = ensureT2S()
  if (!st) return text
  if (!hasVariantChinese(text, st)) return text
  return st.conv(text)
}

/** 标签段匹配(用于 t2sHtml 拆分): 收窄为 <[a-zA-Z/! 开头 —— 文本中的裸 "<"(如 "1 < 2")
 *  后跟非标签字符时, 宽松版 <[^>]*> 会一路吞到下一个真正的 ">" 为止, 把中间的繁体文本
 *  并进"标签"段漏转换(htmlparser2 对裸 < 按文本解析, 收窄后两侧行为一致)。
 *  注释/CDATA 整段按标签跳过不转换(均不进渲染文本, 无碍) */
const T2S_TAG_SPLIT = /(<[a-zA-Z/!][^>]*>)/g

/** HTML 繁体→简体: 仅转换标签外文本段(标签/属性名不动; 早期转换让后续广告正则/导航词
 *  匹配都在简体上进行)。split 捕获组保证标签恒落在奇数下标, 文本段按下标奇偶精确区分。
 *  供采集管线与后台存量数据批量繁转简共用; 检测未命中时原样返回(简体内容零开销) */
export function t2sHtml(html: string): string {
  if (!html) return html
  const st = ensureT2S()
  if (!st) return html
  // 快速预检: 剥标签后的可见文本无差异字则整段跳过(纯ASCII/简体页零开销)
  if (!hasVariantChinese(html.replace(T2S_TAG_SPLIT, ''), st)) return html
  const parts = html.split(T2S_TAG_SPLIT)
  for (let i = 0; i < parts.length; i += 2) {
    if (parts[i]) parts[i] = st.conv(parts[i])
  }
  return parts.join('')
}

// ---------- 实体单遍解码(防双重解码) ----------
/** 白名单实体一次扫描解码, 不回扫替换产物: 逐条 .replace 链会"链式再解码" —— 源文
 *  &amp;lt; 先被 &amp; 规则还原成 "&lt;", 又被后续 &lt; 规则二次还原成 <, 源站刻意
 *  展示的转义字面量被吃掉; 单遍正则一次消费后扫描指针越过已替换文本, &amp;lt;
 *  恒解码为字面量 "&lt;"(与浏览器对已解码文本的展示语义一致)。数字实体复用
 *  fromCodePointSafe(越界/孤立代理区返回空) */
// [R22-b-6] 命名实体覆盖面扩展: 修前仅 6 个基础实体+数字/十六进制, 常见命名实体
// (&mdash; &hellip; &ldquo; &middot; &ensp; 等)在纯文本/字段/简介出口残留字面量
// "&mdash;" 字符串进库 —— HTML 模式经 cheerio 解析层已全量解码, 两出口口径不一致
// (实测 cleanTextField('书名&mdash;续') → '书名&mdash;续')。新增集与 parser.htmlToDoc
// 的 XML 序列化映射表(mdash/ndash/ldquo/rdquo/lsquo/rsquo/hellip/middot/copy/reg/
// trade/times/divide/laquo/raquo/deg/euro/pound/yen)对齐, 另补空格三兄弟(ensp/emsp/
// thinsp)/bull/plusmn/sect/para/cent/分数/上标/箭头/shy/zwsp; shy/zwsp 解码产物为
// 不可见字符, 由随后的 INVISIBLE_CHARS_RE 剥离(各路径解码后均紧跟该剥离)。单遍语义
// 不变: &amp;mdash; 恒解码为字面量 "&mdash;" 不链式
const ENTITY_RE = /&(?:nbsp|ensp|emsp|thinsp|amp|lt|gt|quot|apos|mdash|ndash|lsquo|rsquo|ldquo|rdquo|hellip|middot|bull|copy|reg|trade|deg|plusmn|times|divide|laquo|raquo|euro|pound|yen|cent|sect|para|frac12|frac14|frac34|sup2|sup3|larr|rarr|uarr|darr|harr|shy|zwsp|#x[0-9a-f]+|#[0-9]+);/gi
// [R9-cl-2] 整合: 控制字符剥离正则本文件内 4 处同款重复, 提取为具名常量(\t\n\r 保留口径不变)
const CTRL_CHARS_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F]/g
// [R21-c-2] 不可见 Unicode 剥离: 零宽字符(\u200b-\u200d ZWSP/ZWNJ/ZWJ)/方向标记(\u200e\u200f)/
// 双向控制(\u202a-\u202e 与 \u2066-\u2069 隔离符)/词连接器(\u2060-\u2064)/软连字符(\u00ad)/
// 蒙元元音分隔(\u180e)/BOM(\ufeff)。这些 Cf 类字符不参与可见渲染, JS 的 trim/\s/CTRL_CHARS_RE
// 均不覆盖 —— 源站反采集水印靠它们产生"纯不可见字符"幽灵段落(行判空失效, bun 复现实证)、
// 躲避广告正则命中、读者复制出隐形字符。downloader.obfuscateText 的零宽混淆发生在清洗之后的
// TXT 导出侧, 与本剥离互不影响
// [R25-2-4] 导出: parser.absolutize 对链接字段(bookUrl/chapterUrl/cover)共用同一不可见
// 字符剥离口径(零宽水印混进 href 会使章节 404); 无反向依赖(parser→cleaner 单向, 无环)
export const INVISIBLE_CHARS_RE = /[\u00ad\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/g
// [R22-b-2] Unicode 空格家族(不含行终止符与 \t —— 按行消费时行分隔符已拆走): 裸写的
// \u00a0(nbsp)/\u1680/\u2000-\u200a/\u202f/\u205f/\u3000(全角空格)。与实体解码口径对齐:
// ENTITY_BASIC 把 &nbsp; 解码为普通空格 ' ', 但源站【裸写】的同族字符此前原样残留(字段级
// 书名/作者中部、正文/简介行中部实测), 破坏精确匹配/去重/检索且各出口字节不一致。行级
// 归一为普通空格(行首尾由既有 trim 吃掉)
const UNICODE_SPACE_RE = /[\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]/g
// [R13-2] 内容块级标签集合: 白名单剥壳时这些标签的开闭边界补 \n(段落分隔), 供
// "按换行重建段落"复原分段。覆盖容器/段落/表格/列表/标题/语义分区; 内联标签
// (span/b/i/a/font…)不入集 —— 行内文本不因标签边界断行。hr 视觉即分隔线
// [R21-e-5] 精简: CONTENT_BLOCK_TAGS/stripHtmlTags/htmlToPlainLines 仅文件内消费去 export
// (rg 全库含 scripts/archive 零外部引用; parser 侧 TEXT_BLOCK_TAGS 为同口径独立声明,
// 刻意不引入 parser→cleaner 依赖方向, 见其注释)
const CONTENT_BLOCK_TAGS: ReadonlySet<string> = new Set([
  'p', 'div', 'li', 'ul', 'ol', 'tr', 'td', 'th', 'table', 'thead', 'tbody', 'tfoot',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'section', 'article', 'header', 'footer',
  'aside', 'nav', 'blockquote', 'pre', 'form', 'dl', 'dt', 'dd', 'figure',
  'figcaption', 'main', 'center', 'hr',
])
// [R21-c-3] 块级标签(开+闭)边界 → \n: 供纯文本出口/TXT 导出与 HTML 模式 cheerio 链同一
// 分段口径。旧行为只识别闭标签且集合过窄(p/div/h/li) —— 未闭合 <p> 链(<p>段1<p>段2</p>,
// 笔趣阁系源站常见)与表格/列表单元格(td/tr/table/section…)在纯文本出口粘连丢段(bun 复现)
const CONTENT_BLOCK_TAG_LINEBREAK_RE = new RegExp(
  `</?(?:${[...CONTENT_BLOCK_TAGS].join('|')})\\b[^>]*>`,
  'gi'
)
// [R21-c-4] 引号感知标签剥离: '>' 位于双/单引号属性值内时不终结标签(对齐浏览器词法) ——
// 旧裸剥 <[^>]+> 在 <img alt="4>3" src=x> 处提前截断, 残留 `3" src=x">` 进纯文本出口(bun 复现)。
// 两段式: 先引号感知剥一遍, 再以旧裸剥兜底一遍 —— 引号不配对的畸形标签(引号感知版无法
// 完成闭合匹配)由兜底剥到首个 '>', 任一输入类下输出不劣于旧实现, 良构输入逐字节不变
const TAG_QUOTE_AWARE_RE = /<(?:[^>"']|"[^"]*"|'[^']*')*>/g
const TAG_NAIVE_RE = /<[^>]+>/g
/** 剥离全部 HTML 标签(引号感知 + 裸剥兜底, 见 TAG_QUOTE_AWARE_RE 注释) */
function stripHtmlTags(html: string): string {
  return html.replace(TAG_QUOTE_AWARE_RE, '').replace(TAG_NAIVE_RE, '')
}
/**
 * [R21-c-3] HTML → 带换行纯文本: 危险标签整段剥除(script/style/noscript/iframe/
 * object/embed, 含截断未闭合形态) + br/块级标签开闭边界 → \n + 引号感知剥签 + 实体单遍解码 +
 * 控制/不可见字符剥离。cleanContentHtml 纯文本模式的单一实现; 下载TXT链(downloader.
 * stripHtmlToText)走其自有较窄口径转换器, 仅实体解码层共用 decodeEntitiesOnce ——
 * [R21-e-5] 勘误: 本函数原注释声称"与 TXT 导出共用", 实际 downloader 未接入(R21-c 计划
 * 未落地), 按实际消费面去 export 并纠正注释。输出不 trim(按行消费的调用方自行处理)
 */
function htmlToPlainLines(html: string): string {
  if (!html) return ''
  const text = html
    // [R22-b-4] \r 归一: 修前仅靠按行 trim 吃掉行尾 \r(\r\n 形态正确), 孤立 \r(源站
    // 极旧 Mac 形态)整段粘成一行且行中部残留 \r 进库; 统一先归一为 \n 再走换行链
    .replace(/\r\n?/g, '\n')
    .replace(/<(script|style|noscript|iframe|object|embed)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<(script|style|noscript|iframe|object|embed)\b[^>]*\/>/gi, ' ')
    // R5-16: 截断/未闭合的 script|style|... 段 —— 贪婪匹配到串尾, 杜绝 JS 代码/样式漏进纯文本
    .replace(/<(script|style|noscript|iframe|object|embed)\b[^>]*>[\s\S]*$/gi, ' ')
    // [R22-b-3] br 匹配放宽到带属性形态: 修前 <\s*br\s*\/?> 只认裸 <br>/<br/>, 源站
    // <br class="x">/<br style="…"/> 不被换行、随后被标签剥离静默删除 → 相邻行粘连成一段
    // (纯文本出口实测丢段); \b 防误配 <brx>, [^>]* 容忍任意属性(属性内 > 的畸形标签与
    // 旧口径同样受限, 由标签剥离兜底)
    .replace(/<\s*br\b[^>]*>/gi, '\n')
    .replace(CONTENT_BLOCK_TAG_LINEBREAK_RE, '\n')
  return decodeEntitiesOnce(stripHtmlTags(text))
    .replace(CTRL_CHARS_RE, '')
    .replace(INVISIBLE_CHARS_RE, '')
}
const ENTITY_BASIC: Record<string, string> = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  // [R22-b-6] 常见命名实体(见 ENTITY_RE 注释)
  ensp: '\u2002', emsp: '\u3000', thinsp: '\u2009', mdash: '\u2014', ndash: '\u2013',
  lsquo: '\u2018', rsquo: '\u2019', ldquo: '\u201c', rdquo: '\u201d', hellip: '\u2026',
  middot: '\u00b7', bull: '\u2022', copy: '\u00a9', reg: '\u00ae', trade: '\u2122',
  deg: '\u00b0', plusmn: '\u00b1', times: '\u00d7', divide: '\u00f7', laquo: '\u00ab',
  raquo: '\u00bb', euro: '\u20ac', pound: '\u00a3', yen: '\u00a5', cent: '\u00a2',
  sect: '\u00a7', para: '\u00b6', frac12: '\u00bd', frac14: '\u00bc', frac34: '\u00be',
  sup2: '\u00b2', sup3: '\u00b3', larr: '\u2190', rarr: '\u2192', uarr: '\u2191',
  darr: '\u2193', harr: '\u2194', shy: '\u00ad', zwsp: '\u200b',
}
function fromCodePointSafe(cp: number): string {
  // [R22-b-7] 孤立代理区(0xD800-0xDFFF)显式拒绝: 修前注释声称"String.fromCodePoint 对代理区
  // 抛 RangeError"不实 —— 规范只对越界/非整数抛错, 代理区码点原样返回孤立代理(bun 实测),
  // 随后 JSON 序列化产出非法转义/入库链路可能损坏。数字实体 &#xd800; 类输入一律拒绝返回空
  if (!Number.isFinite(cp) || cp < 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return ''
  try {
    return String.fromCodePoint(cp)
  } catch {
    return ''
  }
}
/** 实体单遍解码(白名单实体; 不回扫替换产物防链式二次解码)。
 *  qq-e2 起导出: 下载TXT链(downloader.stripHtmlToText)与主清洗链共用同一解码口径,
 *  防 replace 链 "&amp;lt;"→"&lt;"→"<" 双重解码在各出口漂移 */
export function decodeEntitiesOnce(s: string): string {
  return s.replace(ENTITY_RE, (m) => {
    const key = m.slice(1, -1).toLowerCase()
    const basic = ENTITY_BASIC[key]
    if (basic !== undefined) return basic
    if (key.startsWith('#x')) return fromCodePointSafe(parseInt(key.slice(2), 16))
    return fromCodePointSafe(parseInt(key.slice(1), 10))
  })
}

/** 清洗章节正文HTML */
// ---------- 违禁词过滤接线 [R51-3-c](admin/banned-words route 契约) ----------
// 契约(见 api/admin/banned-words/route.ts 头注释): cleaner 持惰性缓存(60s TTL)并在管理端
// 保存后 invalidate + 同步预载, 采集/预览等所有 cleanContentHtml 出口自动按新词表过滤。
// 实现: 配置读取/缓存单一事实源复用 banned-words-server(60s TTL + fail-open 默认空词表),
// 本模块额外持一份同步快照 —— cleanContentHtml 是同步热路径, 未就绪/过期时 kick 后台刷新
// (stale-while-revalidate), 冷启动首章 fail-open 直通(与 server 端读侧同口径, 不过滤不出错)。

const BANNED_SNAPSHOT_TTL_MS = 60_000
let bwSnapshot: { at: number; cfg: BannedWordsConfig } | null = null
let bwRefreshing = false

function refreshBannedWordsSnapshot(): void {
  if (bwRefreshing) return
  bwRefreshing = true
  void getBannedWordsConfig()
    .then((cfg) => {
      bwSnapshot = { at: Date.now(), cfg }
    })
    .catch(() => {
      bwSnapshot = null
    })
    .finally(() => {
      bwRefreshing = false
    })
}

/** 同步读取快照(过期即 kick 后台刷新); 未就绪返回 null → 调用方直通(fail-open) */
function peekBannedWordsConfig(): BannedWordsConfig | null {
  if (!bwSnapshot || Date.now() - bwSnapshot.at > BANNED_SNAPSHOT_TTL_MS) refreshBannedWordsSnapshot()
  return bwSnapshot?.cfg ?? null
}

/** 管理端保存违禁词后调用: 服务端配置缓存 + 本模块同步快照双失效(下次 peek 拉新) */
export function invalidateBannedWordsCache(): void {
  invalidateServerBannedWordsCache()
  bwSnapshot = null
}

/** 管理端保存后同步预载新配置: await 返回后 cleanContentHtml 立即按新策略处理(无 fail-open 窗口) */
export async function reloadBannedWordsCache(): Promise<void> {
  invalidateServerBannedWordsCache()
  bwSnapshot = null
  try {
    const cfg = await getBannedWordsConfig()
    bwSnapshot = { at: Date.now(), cfg }
  } catch {
    bwSnapshot = null
  }
}

/** 出口统一违禁词过滤: 快照未就绪(冷启动首章)或词表为空时零开销直通; 只过滤文本段不动标签 */
function applyBannedWordsIfLoaded(text: string): string {
  const bw = peekBannedWordsConfig()
  if (!bw || !text) return text
  return applyBannedWordsToHtml(text, bw)
}

export function cleanContentHtml(raw: string, cfgOverride?: Partial<CleanConfig>): string {
  const cfg: CleanConfig = { ...DEFAULT_CLEAN_CONFIG, ...cfgOverride }
  if (!raw) return ''
  // 0. 繁体→简体(标签外文本段): 后续广告清洗/导航词匹配/存储统一在简体上进行
  // [R21-c-2] 不可见 Unicode 剥离置于两模式共用入口: HTML 模式出库内容零残留; 纯文本模式
  // 让"纯零宽字符行"先于按行判空变空行(幽灵段落根因), 并使广告正则不再被水印字符隔断命中
  const html = t2sHtml(raw).replace(INVISIBLE_CHARS_RE, '')

  if (cfg.plainText) {
    // 纯文本模式: 剥全部标签保留换行 —— 标签→换行/实体单遍解码/控制与不可见字符剥离统一
    // 委托 htmlToPlainLines([R21-c-3], 与 TXT 导出同口径; 历史 R4-20/R5-16 语义保留在其内)
    let text = htmlToPlainLines(html)
    text = removeAdLines(text, cfg.adPatterns)
    text = text
      .split('\n')
      // [R22-b-2] 行中部裸 \u00a0/\u3000 等归一为普通空格(与 &nbsp; 实体解码口径一致),
      // 行首尾由 trim 吃掉 —— 纯文本出口不再有非常规空白字节
      .map((l) => l.replace(UNICODE_SPACE_RE, ' ').trim())
      .filter(Boolean)
      .join('\n\n')
    // 不再结尾二次 t2sText: 入口 t2sHtml 已转完 —— 转换非幂等(含「乾」的文本第二遍
    // 会把词组保护外的「乾县」继续转成「干县」), 双重转换是真实的简体损坏路径
    // 控制字符剥离(\b 退格等源站杂符; \t\n\r 不在剥离类内): 全库实扫发现 2 章孤立 \b
    // 随正文入库(dd 轮), 输出层统一剥离一次
    // [R51-3-c] 违禁词出口过滤(纯文本出口同口径, 无标签段全量文本过滤)
    return applyBannedWordsIfLoaded(text.replace(CTRL_CHARS_RE, ''))
  }

  // HTML模式
  const $ = cheerio.load(`<div id="__clean_root">${html}</div>`)
  // 0. 硬移除脚本/样式类标签: 修复 —— 自定义清洗配置可能不带 removeSelectors(或遗漏),
  //    白名单剥壳时 script/style 的内部代码会以"纯文本"形式漏进正文
  $(`#__clean_root script, #__clean_root style, #__clean_root noscript, #__clean_root iframe, #__clean_root object, #__clean_root embed`).remove()
  // 1. 移除指定选择器(广告/脚本)
  for (const sel of cfg.removeSelectors) {
    try { $(`#__clean_root ${sel}`).remove() } catch { /* 无效选择器 */ }
  }
  // 1.5 移除分页/导航链接(下一页/上一页/目录等)
  $(`#__clean_root a`).each((_, el) => {
    const t = ($(el).text() || '').trim()
    if (t && /^(下一页|上一页|下页|上页|目录|首?页|尾?页|返回目录|继续阅读|点击阅读|分页阅读?|加入书签|推荐本书?|报错).{0,4}$/.test(t)) {
      $(el).remove()
    }
  })
  // 1.8 乱序段落重排: 部分站点(如 5165.org)把段落以 <div data-id="n"> 乱序输出作反采集
  //     手段 —— 直接清洗会保留乱序段落顺序。判定: 同一父容器下 ≥3 个 data-id 子元素且
  //     数值序列非单调递增时, 按 data-id 数值升序重组父容器内容(恢复原文段落顺序)。
  //     修复: 原 parent.html(重排字符串) 以"序列化→重解析"重组父容器全部内容, 同父容器
  //     内非 data-id 兄弟节点(真实正文段落间夹带的 span/em/br/文本等)被整体丢弃。改为
  //     DOM 节点移动: 按 data-id 升序把各 data-id 节点 appendChild 到父容器尾部, 其后
  //     紧邻的非 data-id 兄弟(直到下一个 data-id 节点为止)作为同组尾随节点一起移动;
  //     首个 data-id 之前的节点无处可随, 原地保留。单调 data-id 快路径与"无 data-id
  //     不走此路径"的判定不变, 唯一行为差异是不再吞掉这些夹带节点。
  //     重组后复刻旧版包 <p> 语义: 内部 html 以 <p>/<br> 开头时原位展开原子节点,
  //     否则子节点整体移入新建 <p>(包裹判定与旧版逐字符一致, 但不再字符串重组,
  //     属性/实体保真)。append/replaceWith 对已存在节点均为移动而非复制(cheerio 实测)。
  {
    const dEls = $(`#__clean_root [data-id]`).toArray()
    if (dEls.length >= 3) {
      const parent = $(dEls[0]).parent()
      const inParent = dEls.filter((el) => $(el).parent().is(parent))
      if (inParent.length === dEls.length) {
        const items: { n: number; el: any }[] = []
        let ok = true
        for (const el of inParent) {
          const n = Number($(el).attr('data-id'))
          if (!Number.isFinite(n)) { ok = false; break }
          items.push({ n, el })
        }
        const nums = items.map((x) => x.n)
        const monotonic = nums.every((n, i) => i === 0 || n >= nums[i - 1])
        if (ok && !monotonic) {
          // items.sort 稳定(同值保持文档序, 与旧版一致); 快照遍历期间节点仅被移动
          // 不被复制, 引用恒有效
          items.sort((a, b) => a.n - b.n)
          const tails = new Map<any, any[]>()
          let cur: any[] | null = null
          for (const node of parent.contents().toArray()) {
            const a = (node as any).attribs
            const isDataId = (node as any).type === 'tag' && !!a && Object.prototype.hasOwnProperty.call(a, 'data-id')
            if (isDataId) { cur = []; tails.set(node, cur) } else if (cur) cur.push(node)
          }
          for (const { el } of items) {
            const tail = tails.get(el)
            if (!tail) continue // 防御: 与快照不一致时跳过该项(不应发生)
            parent.append(el)
            for (const t of tail) parent.append(t)
          }
          for (const { el } of items) {
            const $el = $(el)
            const h = ($el.html() || '').trim()
            if (/^<(p|br)\b/i.test(h)) {
              $el.replaceWith($el.contents())
            } else {
              const p = $('<p></p>')
              const kids = $el.contents()
              $el.replaceWith(p)
              p.append(kids)
            }
          }
        }
      }
    }
  }
  // 2. 白名单外的标签剥壳保文本
  // 修复: 原实现 replaceWith($(el).html()) 会把子节点重新 parse 成新副本, 而迭代快照
  // 仍指向已脱离文档的旧节点 —— 外层容器(div等)先被剥壳后, 内层 span/style 等永远
  // 逃过白名单过滤泄漏进正文。改用 contents() 移动【原节点】而非字符串重解析, 快照引用
  // 保持挂载, 内层标签能继续被后续迭代处理。
  // [R13-2] 块级标签剥壳时前后补 \n: 源站正文常见 <div>段1</div><div>段2</div> 形态
  // (默认白名单不含 div), 裸剥壳后文本节点直接拼接成"段1段2"整章粘连(段落全丢)。
  // 块级开闭边界插入 \n 文本节点, 后续第 5 步"按换行重建段落"即可复原分段;
  // 内联标签(span/b/a…)不受影响。cheerio before/after 对空白字符串创建纯文本节点
  const $root = $(`#__clean_root`)
  $root.find('*').each((_, el) => {
    const tag = (el as any).tagName?.toLowerCase()
    if (tag && !cfg.whitelist.includes(tag)) {
      if (CONTENT_BLOCK_TAGS.has(tag)) {
        $(el).before('\n')
        $(el).after('\n')
      }
      $(el).replaceWith($(el).contents())
    }
  })
  // 2.5 白名单标签属性消毒: 采集正文内嵌 on* 事件属性 / style 表达式会随内容入库,
  // 前台 dangerouslySetInnerHTML 渲染成活动节点(存储型注入面)。白名单语义
  // 是"只保留内容标签", 默认白名单(p/br/b/strong/em/i/u/h1-6)内所有标签均无合法属性
  // 用例 —— 属性一律剥除; 仅 a/img(自定义白名单可能放行)保留指定属性:
  //   • a href: 必须 http(s) 绝对地址(与 parser.absolutize 的协议过滤同口径)
  //   • img src: 必须 http(s) 绝对地址; data: 不放行(防 base64 大图撑爆正文 + 内容回环)
  //     (R3-25: 修前 img 标签白名单放行但 src 被一刀切剥光, 正文插图全裂)
  //   • img alt: 任意文本(纯描述性, 不存在注入面)
  // 其余属性(onerror/onload/style 等)一律剥除。须置于 1.8 重排之后:
  // 重排依赖 data-id 属性判定, 先剥会永久禁用重排。
  $(`#__clean_root *`).each((_, el) => {
    const a = (el as any).attribs as Record<string, string> | undefined
    if (!a) return
    const tag = (el as any).tagName?.toLowerCase()
    for (const name of Object.keys(a)) {
      const val = a[name] || ''
      const keep =
        (tag === 'a' && name === 'href' && /^https?:\/\//i.test(val)) ||
        (tag === 'img' && name === 'src' && /^https?:\/\//i.test(val)) ||
        (tag === 'img' && name === 'alt')
      if (!keep) $(el).removeAttr(name)
    }
  })
  let out = $root.html() || ''
  // 3. 广告正则清洗
  out = removeAdLines(out, cfg.adPatterns)
  // [R13-1] 块级段落结构判定(置于 normalize 包裹之前): 旧实现第 5 步判据检查的是
  // 【包裹后的 out】—— normalize 无条件 '<p>'+out+'</p>' 后输出必含 <p>, 第 5 步
  // "按换行重建段落"永不触发。纯文本输入(json 提取/转换代理输出, \n 分段)因此整章
  // 塞进单个 <p>(内部 \n 是空白文本节点, HTML 渲染折叠) —— 读者看到整章一大段。
  // 判据含 div: 自定义白名单保留 div 时 div 本身就是块级分段
  const hadParaStructure = /<(?:p|br|div|h[1-6]|li)\b/i.test(out)
  // 4. 规范化
  if (cfg.normalize) {
    if (!hadParaStructure) {
      // [R13-1] 纯文本输入(无任何块级标签): 包裹只会给第 5 步重建制造外层 <p> 残骸
      // (split('\n') 把 <p>/</p> 拆进首尾行 → <p><p>段1</p>…</p> 嵌套), 此处不动,
      // 段落结构完全交给第 5 步按 \n 重建
    } else {
      // [R13-3] 已有块级结构: 仅"纯 <br> 分段"(无 p)才走包裹+替换 —— Bug 15 语义
      // (<br><br>→</p><p> 需外层 <p> 充当首尾配对); 已含 <p> 结构时包裹产生嵌套
      // <p><p>…</p></p>, 且 p 结构外的游离 <br><br> 替换成 </p><p> 会不配对 ——
      // 两者都跳过, 游离 <br> 保留(渲染层 br 即换行, 语义无损)
      const hasP = /<\s*p[\s>]|<\s*\/\s*p/i.test(out)
      if (!hasP) {
        // Bug 15 修复: <br><br> → </p><p> 替换在【未包裹外层 <p>】的情况下产生不配对标签
        // (输出 <div>line1</p><p>line2</div> 即 </p> 在 <div> 内但无匹配 <p> 开标签)。
        // 修复: 替换前先用 <p>...</p> 整体包裹, 这样 <br><br> 替换产生 </p><p> 必然
        // 配对成 <p>line1</p><p>line2</p>(外层 <p> 充当首个开标签 + 末个闭标签)。
        out = '<p>' + out + '</p>'
        // [R22-b-3] br-br 识别同步放宽到带属性形态(与换行链/空壳清理同一 br 口径)
        out = out
          .replace(/<\s*br\b[^>]*>\s*<\s*br\b[^>]*>/gi, '</p><p>')
      }
    }
    // 修复: 空段落清理由 <p></p> 扩展到 <p>空白/&nbsp;/纯<br></p>, 消除广告行删除后残留的空壳段落
    // (<br><br>→</p><p> 替换在边界处可能产生空 <p></p>: 如开头 <br><br> → </p><p> 会产出
    // 前置 <p></p>; 此处一并清掉。纯文本输入无标签零匹配, 共用零开销)
    // [R22-b-5] 空壳清理再扩展(循环至不再变化, 嵌套壳逐层剥; 无壳输入恰好一轮判定退出):
    //  ① 空块级壳 <h2></h2>/<li></li>/<div><br></div>(自定义白名单放行该标签时)/
    //     <blockquote>/<center>/<ul>/<ol> —— 空白/&nbsp;/纯<br> 内容的块级元素渲染为带
    //     margin 的幽灵空行, 此前只有 <p> 版本被清(实测 <h2></h2> 存活);
    //     td/th/table 不入集(保持表格结构完整性)。反向引用 \1 防跨标签错配;
    //  ② 空内联壳 <p><b></b></p>/<b>&nbsp;</b> —— 广告正则吃掉 <b>广告文本</b> 的文本后
    //     白名单内联壳残留(实测 <p><b></b></p> 存活), 剥空内联后下一轮剥空 <p>;
    //  ③ <p> 首尾的空白/&nbsp;/<br> 修剪扩到 &nbsp; 实体形态 —— cheerio 序列化把 \u00a0
    //     还原成 &nbsp; 字面量, 修前 <p>\s+ 类正则对它失明, 段首 &nbsp; 缩进残留入库(实测);
    //     同口径清理 <p> 内首尾 <br>(渲染为段内首/尾空行噪声);
    //  ④ 块间游离 <br> 垫片与首尾裸 <br> —— <div><br></div>(div 非白名单)剥壳后残留
    //     </p>\n<br>\n<p> 形态(实测), 渲染为段间空白行; 首尾裸 br 同为噪声。仅处理与
    //     <p>/<\/p> 相邻或串首尾的垫片, 不触碰正文行内的真实换行 br
    // [R22-b-8] 收尾: 移除循环残留的未用 prev 声明(收敛判定走 next===out 比对, lint 修复)
    for (; ; ) {
      const next = out
        .replace(/<(p|div|h[1-6]|li|ul|ol|blockquote|center)\b[^>]*>(?:\s|&nbsp;|<br\b[^>]*>)*<\/\1>/gi, '')
        .replace(/<(b|strong|em|i|u|span|font|small|big|sub|sup|s|del|ins|mark|a)\b[^>]*>(?:\s|&nbsp;|<br\b[^>]*>)*<\/\1>/gi, '')
        .replace(/<p>(?:\s|&nbsp;|<br\b[^>]*>)+/gi, '<p>')
        .replace(/(?:\s|&nbsp;|<br\b[^>]*>)+<\/p>/gi, '</p>')
        .replace(/<\/p>\s*(?:<br\b[^>]*>\s*)+(?=<p[\s>])/gi, '</p>')
        .replace(/^(?:\s|&nbsp;|<br\b[^>]*>)+/i, '')
        .replace(/(?:\s|&nbsp;|<br\b[^>]*>)+$/i, '')
      if (next === out) break
      out = next
    }
    // [R22-b-9] 段间原始空白坍缩: br-br 包裹产物在 </p> 与 <p> 之间残留源站原始换行
    //  (kanunu8 实测 </p>\n\n\n<p> 形态 289 处) —— 浏览器渲染为无(块级间空白惰性), 但
    //  存库冗余、纯文本表面化后呈 3+ 连续空行、审计口径不过。坍缩到零间距, 渲染零差异
    out = out.replace(/<\/(p|h[1-6]|li|blockquote)>\s*(?=<)/gi, '</$1>')
  }
  // 5. 若无任何块级段落标签, 按换行重建段落 —— [R13-1] 判据用包裹前状态且与 normalize
  // 包裹互斥(纯文本输入不再被包裹污染), 旧判据检查包裹后的 out 恒含 <p>, 重建永不触发
  if (!hadParaStructure) {
    out = out
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => `<p>${l}</p>`)
      .join('')
  }
  // 同上: HTML 模式出口同样剥离控制字符(源站 \b 杂符曾随 <p>\b话虽… 入库)
  // [R51-3-c] 违禁词出口过滤: 采集/预览等所有 cleanContentHtml 出口自动覆盖(只过滤文本段不动标签)
  return applyBannedWordsIfLoaded(out.replace(CTRL_CHARS_RE, '').trim())
}

// 广告正则清洗的 URL 保护例外(y-a重放): 默认首条广告正则
// (www\.)?[a-z0-9-]+\.(com|net|…)(\/\S*)? 会把正文里【带 scheme 的合法 URL 文本】
// 一并啃掉 —— "访问https://example.com/book看正文"被剥成"访问https://看正文",
// <a href="https://…"> 的 href 属性同理受损。方案(取最小): 跑广告正则前先把
// "https?://…" 完整 URL 区段掩码成 \uE000N\uE001 占位符, 正则跑完原样还原。
// 覆盖面: 正文行内 URL / <a href> 属性值 / 引号或括号上下文中的完整 URL;
// 裸域名灌水(www.xxx.com 无 scheme, 广告常态)不受保护, 照常剥除。
// 占位符损坏容忍: 若某条广告正则恰好吃掉占位符一半(如含 \d 的模式), 还原失败
// 的残留 \uE000\uE001 序列由末尾 scrub 兜底清掉, 不留控制字符进库
// R8-18: 占位符从 \u0000 改为 \uE000/\uE001(Unicode Private Use Area) —— \u0000(NUL)
// 可能源站二进制污染出现, 与占位符冲突导致 URL 还原失败; PUA 区段(0xE000~0xF8FF)
// 在合法源文本中几乎不出现, 冲突概率极低
// [R15-d1b-6](Med,perf) 广告正则编译缓存: removeAdLines 在逐章热路径上(cleanContentHtml/
// cleanIntro 每章各跑一遍全部 patterns), 原实现每章每条 new RegExp(p,'gi') 现场编译 ——
// 默认 6 条 × 万章 = 6 万次重复编译(自配 30 条上限时 30 万次), 同一 pattern 字符串的编译
// 产物恒等且 String.replace 对 /g 正则执行完毕后 lastIndex 复位(复用无状态残留), 进程内
// 有界 Map 缓存编译结果(含"跳过/非法"负缓存, 保持原 skip 口径逐条一致), FIFO 驱逐防
// 多规则长跑时键空间无界增长(单键即 pattern 原串, 上限 400 条内存可控)
const AD_RE_CACHE_MAX = 400
const adReCache = new Map<string, RegExp | null>()

function compileAdPattern(p: string): RegExp | null {
  const hit = adReCache.get(p)
  if (hit !== undefined) return hit
  let re: RegExp | null = null
  // 判定口径与原逐条 skip 完全一致: 空串/超长(>300)/嵌套量词形态跳过, 编译失败跳过
  if (p && p.length <= 300 && !/[+*]\s*\)\s*[+*{]/.test(p)) {
    try { re = new RegExp(p, 'gi') } catch { re = null }
  }
  if (adReCache.size >= AD_RE_CACHE_MAX) {
    const oldest = adReCache.keys().next().value
    if (oldest !== undefined) adReCache.delete(oldest)
  }
  adReCache.set(p, re)
  return re
}

function removeAdLines(text: string, patterns: string[]): string {
  const urls: string[] = []
  // [R17-b-1] 掩码扩面: 协议相对 URL(//host/…)此前不受保护, 正文可见文本里的这类 URL
  // 会被通用域名正则啃成 "//"(如 "阅读地址：//77shuku.net/x" → "阅读地址：//"), DEFAULT
  // 与种子规则共用的通用域名模式全量暴露此面(白名单放行 a/img 的自定义规则本可经
  // href/src 属性受损, 但 2.5 属性消毒本就剥除非 http(s) 属性值, 故实际残余面=可见文本)。
  // (?:https?:)? 前缀改可选: 对已带 scheme 的 URL 匹配起点/长度逐字节不变, 纯新增
  // //host 形态; 裸域名(无 // 前缀, 广告常态)维持照常剥除口径; 顺带覆盖 ftp:// 等
  // 非 http(s) scheme 的 // 形态。占位符校验位/scrub 兜底机制不受影响
  let out = text.replace(/(?:https?:)?\/\/[^\s"'<>]+/gi, (m) => {
    urls.push(m)
    // [R9-c-7] 编号带校验位: encode(n)=n*10+(n%9+1)。相邻占位符被广告正则吃掉中间
    // \uE001…\uE000 时会合并成 \uE00012\uE001 形态, 旧纯数字编号会把 urls[12](存在时!)
    // 错注入正文; 校验位不符的合并串还原失败 → 走末尾清理(丢一条 URL, 不注入错 URL)
    const idx = urls.length - 1
    return `\uE000${idx * 10 + (idx % 9 + 1)}\uE001`
  })
  for (const p of patterns) {
    // [R15-d1b-6](Med,perf) 编译改走缓存(空串/超长/嵌套量词/非法正则 → null 跳过, 口径同前)
    const re = compileAdPattern(p)
    if (!re) continue
    out = out.replace(re, '')
  }
  // 还原被保护的 URL(校验位验签通过且索引存在), 不合法/合并串一律丢弃
  out = out.replace(/\uE000(\d+)\uE001/g, (_, s: string) => {
    const v = Number(s)
    if (!Number.isInteger(v) || v < 1) return ''
    const body = Math.floor(v / 10)
    return body % 9 + 1 === v % 10 && body < urls.length ? urls[body] : ''
  })
  // [R9-c-7] 残留清理覆盖"开标签被吃"残骸: 旧 scrub(\uE000\d*\uE001?)对 \uE000 被吃掉的
  // 孤立 \uE001 不清理, PUA 控制字符可随正文入库
  out = out.replace(/[\uE000\uE001]/g, '')
  return out
}

// [R25-2-1] 短字段站名尾巴/营销词精确剥离(白名单制): 书名/作者/分类/章节名等短字段的
// 「_笔趣阁」「-某某小说网」「(笔趣阁)」类站点后缀此前只有章节名链(cleanChapterTitle)在剥,
// 书名/作者/分卷名原样入库。词表 = 精确白名单(与既有广告过滤/章节名垃圾词同口径), 非泛匹配:
//   • 域名尾 (www.)?xxx.(com|net|cc|org|info|top|xyz|vip|site|la|mobi|tv) —— TLD 白名单,
//     "第1.5章"/"v2.0" 等小数/版本号因 TLD 不命中天然免疫
//   • 站点品牌词: 笔趣阁|笔趣网|笔趣吧|小说网|文学网|中文网|阅读网
//   • 营销动作词(仅限显式标点分隔, 沿用 cleanChapterTitle 垃圾词口径): 首发|无弹窗|全文阅读|
//     在线阅读|最新章节|手打|txt下载|敬请期待|免费阅读|全本阅读
// 两档分隔符: 域名+品牌词允许【空格】分隔(源站 <title> 常态 "书名 笔趣阁"); 营销词必须
// 显式标点分隔 —— 空格分隔的营销词不剥, 防"第3章 首发"(篮球题材真实章节名)这类误杀。
// 刻意【不】收录 (全本)/(完本) 等括注词: 它们同时是合法版本标注(用户指令明确要求保留
// 《xx(全本)》形态书名), 收录即误杀; 尾部锚定($) + 分隔符前置双约束保证只剥尾巴不伤正文。
const FIELD_SITE_DOMAIN = '(?:www\\.)?[a-z0-9-]{2,}\\.(?:com|net|cc|org|info|top|xyz|vip|site|la|mobi|tv)'
const FIELD_SITE_BRANDS = '笔趣阁|笔趣网|笔趣吧|小说网|文学网|中文网|阅读网'
const FIELD_SITE_MARKETING = '首发|无弹窗|全文阅读|在线阅读|最新章节|手打|txt下载|敬请期待|免费阅读|全本阅读'
// 任意分隔符(含空格) × 域名+品牌词
const FIELD_TAIL_ANYSEP_RE = new RegExp(
  `(?:[\\s_\\-–—·・|｜:：,，~]+|\\s*[(（【\\[]\\s*)(${FIELD_SITE_DOMAIN}|${FIELD_SITE_BRANDS})\\s*[)）\\]】]?\\s*$`,
  'i'
)
// 显式标点分隔(不含空格) × 域名+品牌词+营销词(词表超集, 优先尝试)
const FIELD_TAIL_PUNCTSEP_RE = new RegExp(
  `(?:[_\\-–—·・|｜:：,，~]+|\\s*[(（【\\[]\\s*)(${FIELD_SITE_DOMAIN}|${FIELD_SITE_BRANDS}|${FIELD_SITE_MARKETING})\\s*[)）\\]】]?\\s*$`,
  'i'
)

/** [R25-2-1] 剥离短字段尾部的站点后缀/营销词尾巴("凡人修仙传_笔趣阁"→"凡人修仙传"),
 *  多级尾巴循环剥("xx_笔趣阁_小说网"→"xx"); 剥后为空则保留原文(与 cleanChapterTitle
 *  "剥后为空则保留原标题"同口径)。无词表命中时原样返回, 对干净字段零改动 */
export function stripFieldSiteSuffix(text: string): string {
  if (!text) return text
  let v = text
  // 有界循环(6 层)防意外; 每轮仅当词表命中才连带清理残留分隔符尾巴("xx- (笔趣阁)"→"xx-")
  for (let i = 0; i < 6; i++) {
    let next = v.replace(FIELD_TAIL_PUNCTSEP_RE, '').replace(FIELD_TAIL_ANYSEP_RE, '')
    if (next === v) break
    next = next.replace(/[\s_\-–—·・|｜:：,，~]+$/, '')
    if (!next.trim()) return text
    v = next
  }
  return v
}

/** 清洗纯文本字段(简介/标题等) */
export function cleanTextField(raw: string | undefined | null, maxLength?: number): string {
  if (!raw) return ''
  // [R21-c-4] 标签剥离改引号感知(属性内 > 不再截断残留)
  let v = stripHtmlTags(String(raw))
  // 实体单遍解码(含 nbsp/apos/数字实体): 旧 replace 链 &amp; 规则最前, "&amp;lt;"
  // 类序列会被后续 &lt; 规则链式二次解码; 解码置于空白规整之前, &nbsp; 与普通空格同待遇
  v = decodeEntitiesOnce(v)
  // 控制字符剥离(qq-e): dd 轮只修了正文出口(cleanContentHtml), 纯文本字段(章节标题/简介/
  // 关键词)漏网 —— 源站标题混入 \x00/\x08/\x0B 等随 DB 入库并进 JSON API/前台。
  // \t\n\r(\x09\x0A\x0D)不在剥离类内, 与正文出口同口径
  v = v.replace(CTRL_CHARS_RE, '')
  // [R21-c-2] 标题/简介/作者等短字段同样剥离零宽与双向控制字符(源站标题水印实证存活)
  v = v.replace(INVISIBLE_CHARS_RE, '')
  // 繁体→简体(检测未命中原样返回)
  v = t2sText(v)
  // [R22-b-1] 字段级空白归一: 修前两步(\r\n\t→' ' 再 \s{2,}→' ')会残留【单个】非常规空白 ——
  // 实测书名/作者中部的裸 \u00A0、\u3000(全角空格)与 \u2028/\u2029(行/段分隔符)原样入库,
  // 而同源的 &nbsp; 实体经解码已是普通空格(ENTITY_BASIC), 两口径不一致且破坏精确匹配/去重/检索。
  // 改单步 \s+→' ': JS \s 恒等覆盖 Unicode 空格家族+行终止符, 既有两步的全部折叠结果逐字节
  // 不变, 纯增量清掉单个非常规空白(修后 '第\u00A0一\u00A0章'→'第 一 章')
  v = v.replace(/\s+/g, ' ').trim()
  // [R25-2-2] 站名尾巴/营销词剥离: 白名单制(见 FIELD_TAIL_*_RE 注释), 尾部锚定+分隔符前置,
  // 干净字段零改动; 置于空白归一之后(分隔符已折叠为单字符便于匹配)、码点截断之前
  v = stripFieldSiteSuffix(v)
  if (maxLength && v.length > maxLength) {
    // 按码点截断(UTF-16 slice 会把 emoji 等 astral 字符代理对斩半产出乱码 U+FFFD)
    v = sliceCodePoints(v, maxLength)
  }
  return v
}

/** [R25-2-3] 简介纯垃圾行判定: 整行仅由 域名/站点品牌词/营销词(+括号包裹/尾标点) 构成时
 *  判为广告尾巴行 —— 与 removeAdLines 域名模式互补: 后者剥行内域名后残留的裸站名行
 *  ("笔趣阁 www.bqg.com"→"笔趣阁")由此收尾。行内含非白名单文本(如"转载自红袖小说网"的
 *  "转载自"前缀)不命中, 保守不误删 */
const INTRO_JUNK_LINE_RE = new RegExp(
  `^\\s*[(（【\\[]?\\s*(?:(?:${FIELD_SITE_DOMAIN})|(?:${FIELD_SITE_BRANDS})|(?:${FIELD_SITE_MARKETING}))(?:[\\s_\\-–—·・|｜:：,，~]+(?:(?:${FIELD_SITE_DOMAIN})|(?:${FIELD_SITE_BRANDS})|(?:${FIELD_SITE_MARKETING})))*[)）\\]】]?\\s*[。．.!！]?$`,
  'i'
)

/** 清洗多行简介 */
export function cleanIntro(raw: string | undefined | null, maxLength = 2000): string {
  if (!raw) return ''
  // [R21-c-3] 块级开+闭边界 → \n(与正文链同口径, 未闭合 <p>/<div> 链简介不再粘连)
  // [R22-b-4] 孤立 \r 归一(与 htmlToPlainLines 同口径, 行拆分前统一换行语义)
  let v = String(raw).replace(/\r\n?/g, '\n').replace(/<\s*br\b[^>]*>/gi, '\n').replace(CONTENT_BLOCK_TAG_LINEBREAK_RE, '\n')
  // [R21-c-4] 标签剥离改引号感知
  v = stripHtmlTags(v)
  v = decodeEntitiesOnce(v)
  // 控制字符剥离(qq-e): 与 cleanTextField 同口径(\t\n\r 保留, 供下方按行切段)
  v = v.replace(CTRL_CHARS_RE, '')
  // [R21-c-2] 不可见 Unicode 剥离(与 cleanTextField 同口径)
  v = v.replace(INVISIBLE_CHARS_RE, '')
  v = t2sText(v)
  v = removeAdLines(v, DEFAULT_CLEAN_CONFIG.adPatterns)
  v = v
    .split('\n')
    // [R22-b-2] 行中部裸 \u00a0/\u3000 等归一为普通空格(与 cleanTextField/正文纯文本出口同口径)
    .map((l) => l.replace(UNICODE_SPACE_RE, ' ').trim())
    // [R25-2-3] 纯站点词垃圾行丢弃(整行仅域名/品牌词/营销词, 见 INTRO_JUNK_LINE_RE 注释)
    .filter((l) => l && !INTRO_JUNK_LINE_RE.test(l))
    .join('\n')
  if (v.length > maxLength) v = sliceCodePoints(v, maxLength)
  return v
}

/** 清洗章节标题(去书名号残留/网站后缀) */
export function cleanChapterTitle(raw: string | undefined | null, bookName?: string): string {
  if (!raw) return ''
  let t = cleanTextField(raw)
  if (bookName) {
    t = t.replace(new RegExp(`^${escapeRegExp(bookName)}\\s*`, 'g'), '')
  }
  // 修复(qq-e): 剥离切割点从「分隔符起点」改为「垃圾关键词起点」—— 原实现
  // t.slice(0, junk.index) 以匹配起点(分隔符)切割, 标题内嵌连字符且站点尾巴与正文隔了
  // 空格时把真实内容一并切掉("龙争-虎斗 www.y.com"→"龙争", 丢了"-虎斗")。
  // 关键词起点切割后: 尾巴紧贴分隔符("转折_www.x.com首发")结果不变("转折"),
  // 隔空格形态只剥尾巴本身("龙争-虎斗 www.y.com"→"龙争-虎斗");
  // 切割后残留的分隔符/空白尾巴统一清掉。无分隔符前缀的纯垃圾(如"www.x.com"整标题)
  // 仍不命中(防"我的首发日"这类正文词误伤, 与旧行为一致), 落码点截断兜底。
  // 修复(qq-e2): 量词必须懒惰(*?) —— 贪婪版回溯语义是「取最右关键词」:
  // "转折_www.x.com首发"贪婪命中最右侧"首发", 切割结果"转折_www.x.com"(域名残留!),
  // "龙争-虎斗 www.y.com"命中"y.com"残留"www."(修前双例实测皆反, 与本注释承诺相悖);
  // 懒惰版从最短前缀起试, 恒取【最左】关键词, 一切从首个垃圾词起全剥, 上述双例
  // 实测复原为"转折"/"龙争-虎斗"。
  const junk = t.match(/[_\-–—|]\s*[^_\-–—|]*?((?:www\.|[a-z0-9-]+\.(?:com|net|cc|org|info|top|xyz|vip)|中文网|文学网|小说网|首发|无弹窗|全文阅读|在线阅读|最新章节|手打|txt下载|敬请期待))/i)
  if (junk && junk.index !== undefined && junk[1]) {
    const cutAt = junk.index + junk[0].length - junk[1].length
    const cut = t.slice(0, cutAt).replace(/[\s_\-–—|]+$/, '').trim()
    if (cut) t = cut // 剥后为空则保留原标题, 避免标题被清空
  }
  // 按码点截断(与 cleanTextField/cleanIntro 同款): UTF-16 slice(0,120) 会把 emoji 等
  // astral 字符代理对斩半产出乱码(U+FFFD)
  return sliceCodePoints(t.trim(), 120) || '未命名章节'
}
