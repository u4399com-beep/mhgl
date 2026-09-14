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
const ENTITY_RE = /&(?:nbsp|amp|lt|gt|quot|apos|#x[0-9a-f]+|#[0-9]+);/gi
// [R9-cl-2] 整合: 控制字符剥离正则本文件内 4 处同款重复, 提取为具名常量(\t\n\r 保留口径不变)
const CTRL_CHARS_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F]/g
// [R21-c-2] 不可见 Unicode 剥离: 零宽字符(\u200b-\u200d ZWSP/ZWNJ/ZWJ)/方向标记(\u200e\u200f)/
// 双向控制(\u202a-\u202e 与 \u2066-\u2069 隔离符)/词连接器(\u2060-\u2064)/软连字符(\u00ad)/
// 蒙元元音分隔(\u180e)/BOM(\ufeff)。这些 Cf 类字符不参与可见渲染, JS 的 trim/\s/CTRL_CHARS_RE
// 均不覆盖 —— 源站反采集水印靠它们产生"纯不可见字符"幽灵段落(行判空失效, bun 复现实证)、
// 躲避广告正则命中、读者复制出隐形字符。downloader.obfuscateText 的零宽混淆发生在清洗之后的
// TXT 导出侧, 与本剥离互不影响
const INVISIBLE_CHARS_RE = /[\u00ad\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/g
// [R13-2] 内容块级标签集合: 白名单剥壳时这些标签的开闭边界补 \n(段落分隔), 供
// "按换行重建段落"复原分段。覆盖容器/段落/表格/列表/标题/语义分区; 内联标签
// (span/b/i/a/font…)不入集 —— 行内文本不因标签边界断行。hr 视觉即分隔线
export const CONTENT_BLOCK_TAGS: ReadonlySet<string> = new Set([
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
export function stripHtmlTags(html: string): string {
  return html.replace(TAG_QUOTE_AWARE_RE, '').replace(TAG_NAIVE_RE, '')
}
/**
 * [R21-c-3] HTML → 带换行纯文本(单一实现): 危险标签整段剥除(script/style/noscript/iframe/
 * object/embed, 含截断未闭合形态) + br/块级标签开闭边界 → \n + 引号感知剥签 + 实体单遍解码 +
 * 控制/不可见字符剥离。cleanContentHtml 纯文本模式与 downloader.stripHtmlToText(TXT 导出)
 * 共用, 保证两条出口段落语义不再漂移。输出不 trim(按行消费的调用方自行处理)
 */
export function htmlToPlainLines(html: string): string {
  if (!html) return ''
  const text = html
    .replace(/<(script|style|noscript|iframe|object|embed)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<(script|style|noscript|iframe|object|embed)\b[^>]*\/>/gi, ' ')
    // R5-16: 截断/未闭合的 script|style|... 段 —— 贪婪匹配到串尾, 杜绝 JS 代码/样式漏进纯文本
    .replace(/<(script|style|noscript|iframe|object|embed)\b[^>]*>[\s\S]*$/gi, ' ')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(CONTENT_BLOCK_TAG_LINEBREAK_RE, '\n')
  return decodeEntitiesOnce(stripHtmlTags(text))
    .replace(CTRL_CHARS_RE, '')
    .replace(INVISIBLE_CHARS_RE, '')
}
const ENTITY_BASIC: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
function fromCodePointSafe(cp: number): string {
  if (!Number.isFinite(cp) || cp < 0 || cp > 0x10ffff) return ''
  try {
    // 孤立代理区(0xD800-0xDFFF) String.fromCodePoint 直接抛 RangeError
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
      .map((l) => l.trim())
      .filter(Boolean)
      .join('\n\n')
    // 不再结尾二次 t2sText: 入口 t2sHtml 已转完 —— 转换非幂等(含「乾」的文本第二遍
    // 会把词组保护外的「乾县」继续转成「干县」), 双重转换是真实的简体损坏路径
    // 控制字符剥离(\b 退格等源站杂符; \t\n\r 不在剥离类内): 全库实扫发现 2 章孤立 \b
    // 随正文入库(dd 轮), 输出层统一剥离一次
    return text.replace(CTRL_CHARS_RE, '')
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
        out = out
          .replace(/<\s*br\s*\/?\s*>\s*<\s*br\s*\/?\s*>/gi, '</p><p>')
      }
    }
    // 修复: 空段落清理由 <p></p> 扩展到 <p>空白/&nbsp;/纯<br></p>, 消除广告行删除后残留的空壳段落
    // (<br><br>→</p><p> 替换在边界处可能产生空 <p></p>: 如开头 <br><br> → </p><p> 会产出
    // 前置 <p></p>; 此处一并清掉。纯文本输入无标签零匹配, 共用零开销)
    out = out
      .replace(/<p>(?:\s|&nbsp;|<br\s*\/?\s*>)*<\/p>/gi, '')
      .replace(/<p>\s+/g, '<p>')
      .replace(/\s+<\/p>/g, '</p>')
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
  return out.replace(CTRL_CHARS_RE, '').trim()
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
  v = v
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
  if (maxLength && v.length > maxLength) {
    // 按码点截断(UTF-16 slice 会把 emoji 等 astral 字符代理对斩半产出乱码 U+FFFD)
    v = sliceCodePoints(v, maxLength)
  }
  return v
}

/** 清洗多行简介 */
export function cleanIntro(raw: string | undefined | null, maxLength = 2000): string {
  if (!raw) return ''
  // [R21-c-3] 块级开+闭边界 → \n(与正文链同口径, 未闭合 <p>/<div> 链简介不再粘连)
  let v = String(raw).replace(/<\s*br\s*\/?>/gi, '\n').replace(CONTENT_BLOCK_TAG_LINEBREAK_RE, '\n')
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
    .map((l) => l.trim())
    .filter(Boolean)
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
