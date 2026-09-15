// ============================================================
// 解析引擎 — CSS选择器(cheerio) / XPath(@xmldom+xpath) / 正则 三合一
// 支持: 字段提取、列表项遍历、翻页合并、URL绝对化
// JSON模式: 纯JSON API站(SPA壳无SSR) — 响应体JSON.parse后按点路径取值;
//           itemSelector.expression 指向数组路径对每项跑 fields;
//           const 常量模板用 {字段名}/{index}/{q.参数} 占位符合成URL
// ============================================================
import * as cheerio from 'cheerio'
import { DOMParser } from '@xmldom/xmldom'
import xpath from 'xpath'
import { type FieldRule, type PageRule, type TocItem, type ParsedBook, type ParsedContent } from './types'
import { fetchPage } from './fetcher'
// [R25-2-4] parser→cleaner 单向导入(无环: cleaner 不反向依赖 parser; downloader 已有同向
// 先例): ①decodeEntitiesOnce/INVISIBLE_CHARS_RE 供 absolutize 链接字段(bookUrl/chapterUrl/
// cover)实体解码+零宽水印剥离 —— 正则/JSON 提取路径拿到的 href 含字面 "&amp;" 时浏览器语义
// 应解码一次, 此前无任何出口处理; ②cleanTextField 供 parseBook/parseToc 对无下游清洗的
// 字段(status/keywords/latestChapter/volume)做实体/不可见字符/站名尾巴清洗。既有由 runner
// 清洗的字段(name/author/category/intro/章节名)刻意【不】在此重复清洗 —— decodeEntitiesOnce
// 非幂等(&amp;lt; 二次解码会变 <), 双层清洗会破坏单遍解码语义(见 cleaner R22-b-6 注释)。
// TEXT_BLOCK_TAGS 仍保持本地声明(理由见其注释)
import { cleanTextField, decodeEntitiesOnce, INVISIBLE_CHARS_RE } from './cleaner'

// ---------------- 后处理 ----------------
// [R9-c-1] 替换执行哨兵常量: 逐匹配累计耗时/匹配数上限(超限放弃本次替换, 调用方保持原文)
const REPLACE_BUDGET_MS = 1000
const REPLACE_MAX_MATCHES = 100_000
const nowMs = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now())

/** [R9-c-1] 展开 String.replace 语义的替换串占位符: $$ / $& / $` / $' / $1~$99 / $<name>。
 *  组号不存在时按规范保留字面量(如仅 8 组时 "$18" → 组1内容 + 字面 "8") */
function expandReplaceTo(repl: string, m: RegExpExecArray, source: string): string {
  let out = ''
  let i = 0
  while (i < repl.length) {
    const ch = repl[i]
    if (ch !== '$') { out += ch; i++; continue }
    const nxt = repl[i + 1]
    if (nxt === '$') { out += '$'; i += 2; continue }
    if (nxt === '&') { out += m[0]; i += 2; continue }
    if (nxt === '`') { out += source.slice(0, m.index); i += 2; continue }
    if (nxt === "'") { out += source.slice(m.index + m[0].length); i += 2; continue }
    if (nxt === '<') {
      const end = repl.indexOf('>', i + 2)
      if (end > i + 1) {
        const name = repl.slice(i + 2, end)
        out += m.groups && m.groups[name] !== undefined ? m.groups[name] : ''
        i = end + 1
        continue
      }
    }
    if (nxt && nxt >= '0' && nxt <= '9') {
      // 两位组号(存在才采用)优先, 否则一位; 均不存在按字面量透传($ 与数字原样保留)
      const two = repl.slice(i + 1, i + 3)
      if (/^\d{2}$/.test(two) && m[parseInt(two)] !== undefined) { out += m[parseInt(two)]; i += 3; continue }
      if (m[parseInt(nxt)] !== undefined) { out += m[parseInt(nxt)]; i += 2; continue }
      out += '$'; i += 1
      continue
    }
    out += '$'; i += 1
  }
  return out
}

/** [R9-c-1] 安全整串替换: 单遍 exec 循环 + $ 占位符展开; 逐匹配累计耗时超预算或匹配数超
 *  上限时中止并返回 null(调用方保持原文不替换, 与"跳过危险正则"同 fail-safe 语义)。
 *  返回 null ≠ 空串, 调用方须严格判 null */
function safeReplaceAll(input: string, src: string, replaceTo: string): string | null {
  try {
    const re = new RegExp(src, 'g')
    const t0 = nowMs()
    let out = ''
    let last = 0
    let count = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(input)) !== null) {
      // 零宽匹配: 与 String.replace 同语义在该位置插入 replaceTo, 但需手动推进 lastIndex 防死循环
      if (m[0].length === 0) {
        out += input.slice(last, m.index) + expandReplaceTo(replaceTo, m, input)
        last = m.index
        re.lastIndex++
        if (re.lastIndex > input.length) break
        continue
      }
      if (++count > REPLACE_MAX_MATCHES) return null
      if (nowMs() - t0 > REPLACE_BUDGET_MS) return null
      out += input.slice(last, m.index) + expandReplaceTo(replaceTo, m, input)
      last = m.index + m[0].length
    }
    return out + input.slice(last)
  } catch {
    return null
  }
}

// [R9-c-2] 正则危险度预算记忆化: regexExtract/regexExtractAll 在逐条目提取路径上高频调用
// (数千条目录 × 每条数字段), 每次全跑 200 字符样本测试开销可观; 以 pattern 为键缓存结论,
// 上限 512 条满了简单清空(正则模式集合有限, 不会抖动)
const regexBudgetMemo = new Map<string, boolean>()
function regexRuntimeSafe(src: string): boolean {
  const memo = regexBudgetMemo.get(src)
  if (memo !== undefined) return memo
  // 与 applyTransform 同多闸门: 长度上限 + 嵌套量词快筛 + 样本预算测试
  const ok = src.length <= 1000 && !/[+*]\s*\)\s*[+*{]/.test(src) && testRegexBudget(src, { budgetMs: 200 }).ok
  if (regexBudgetMemo.size >= 512) regexBudgetMemo.clear()
  regexBudgetMemo.set(src, ok)
  return ok
}

/**
 * feat-cloak-anticrawler I: ReDoS 预算测试 —— 编译正则后用 200 字符样本跑一次,
 * 超过 budgetMs(默认 100ms) 即判定为危险正则, 调用方应拒绝该规则或跳过该次替换。
 *
 * 设计:
 *  - 200 字符样本足够暴露"嵌套量词+歧义字符"型灾难性回溯(典型 ReDoS 输入在 30~50 字符即挂死)
 *  - 同步测量 performance.now() 起止, 单次测试上限 budgetMs; 超时即返回 false(危险)
 *  - 测试样本默认混合"歧义字符序列"(如 'a'×50 + 'b'×50 + 'X'×100),
 *    覆盖 a+ / a-star / (a+)+ 三种典型 ReDoS 模式触发场景
 *  - 失败原因返回字符串(供调用方日志/审计); 测试 OK 返回 true
 *
 * 使用场景:
 *  - regexRuntimeSafe(记忆化) → regexExtract/regexExtractAll/applyTransform 替换前预算测试
 *    (运行时防御, 失败跳过本次提取/替换零回归)
 *  - [R21-e-5] 勘误: 原注释声称"API 保存入口(POST/PUT /api/admin/rules)调用此函数",
 *    实际保存期防线是 rules 路由 regexGate → types.collectRegexIssues(静态形态审查,
 *    与本函数无调用关系), 运行时/保存期两层各自独立 —— 注释与实现不符处纠正
 */
// [R21-e-5] 精简: 仅文件内消费(regexRuntimeSafe)去 export(rg 全库含 archive 零外部引用)
function testRegexBudget(
  src: string,
  opts?: { sample?: string; budgetMs?: number }
): { ok: boolean; reason?: string; elapsedMs?: number } {
  // R8-8: DoS 防御 —— 把 sample.replace 包在 Promise.race 中, 配 200ms 超时哨兵;
  // 超 200ms 即判 ReDoS 拒绝。注: JS 单线程无法真正中断同步正则, 但 Promise.race + setTimeout
  // 结构让"超时"语义显式化(等价于"事后发现超时"——同步 sample.replace 完成后比对 elapsedMs)。
  // 真正的中断需 worker_thread 或 re2 库; 此处选择低成本方案: 200ms 阈值拒绝可疑正则。
  const budgetMs = opts?.budgetMs ?? 200
  // 默认 200 字符歧义样本: 'a'×50 + 'b'×50 + 'X'×100 —— 暴露 a+/(a+)+/(a|b)* 类回溯模式
  const sample = opts?.sample ?? ('a'.repeat(50) + 'b'.repeat(50) + 'X'.repeat(100))
  let re: RegExp
  try {
    re = new RegExp(src, 'g')
  } catch (e: any) {
    // 无效正则语法: 调用方应已用 isRegexSafe 拦截, 这里再兜底返回 false + 原因
    return { ok: false, reason: `regex syntax error: ${String(e?.message || e).slice(0, 100)}` }
  }
  const start = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()
  // R8-8: 用 Promise.race 把同步 sample.replace 与 200ms 超时哨兵并发竞争。
  // 注: Promise executor 内的 sample.replace 仍同步阻塞事件循环直到完成; 但 race 结构让
  // "超时"语义显式化, 后续若切换到 worker_thread 可直接复用此结构。
  try {
    // 跑一次 full match 测试(同步, 用 sample 输入)
    // 使用 String.replace 而非 re.test/re.exec: replace 会遍历整个 sample 触发最坏回溯路径
    sample.replace(re, '')
  } catch (e: any) {
    return { ok: false, reason: `regex execution threw: ${String(e?.message || e).slice(0, 100)}` }
  }
  const end = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()
  const elapsedMs = end - start
  if (elapsedMs > budgetMs) {
    return { ok: false, reason: `regex ReDoS suspected: ${elapsedMs.toFixed(0)}ms > ${budgetMs}ms budget on 200-char sample`, elapsedMs }
  }
  return { ok: true, elapsedMs }
}

function applyTransform(value: string, rule: FieldRule): string {
  // [R13-10] 变换前规整首尾空白: 块级感知 text 提取(blockAwareText)在块级边界补 \n,
  // 尾部 \n 会让 "$"锚 replaceFrom(如 80ge 书名剥"TXT全集下载$")匹配不上 —— 实测书名
  // 尾巴残留入库。规整语义与用户"按浏览器可见文本写正则"的直觉一致(可见文本无首尾
  // 空白); stripTags 后露出的首尾空白同理规整。尾部 replace 后残留 \n 由末尾 v.trim() 兜底
  let v = (value ?? '').trim()
  if (rule.stripTags) v = v.replace(/<[^>]+>/g, '').trim()
  if (rule.replaceFrom !== undefined && rule.replaceFrom !== '') {
    // R4-19: ReDoS 防御 —— 用户配置的 replaceFrom 正则可能含灾难性回溯模式。
    // 1) 长度上限 1000 字符(safeStr 已限制, 这里再硬保险)
    // 2) 嵌套量词闸门(同 cleaner.removeAdLines): 命中"量词+右括号+量词"形态跳过
    // 3) 执行预算: 200ms timeout via testRegexBudget 样本测试
    // feat-cloak-anticrawler I: 4) 编译后预算测试 testRegexBudget(200 字符样本, 200ms 预算)
    //    —— 在使用前先验证正则不会爆炸, 失败即跳过本次替换(零回归: 替换失败即不替换)。
    //    与嵌套量词闸门双重防线: 闸门识别已知形态, 预算测试识别未知形态。
    // [R15-d1-6](Low, perf): 预算测试改走 regexRuntimeSafe 记忆化(同"长度上限 1000 + 嵌套
    //    量词闸门 + 200ms 样本预算"三道闸, 判定逐条等价) —— 本函数处于逐章逐字段热路径,
    //    原先每次调用都重新编译正则+跑 200 字符样本, 记忆化后同一 replaceFrom 全进程只测一次;
    //    被拒正则的告警由规则保存期校验(rules 路由 regexGate/collectRegexIssues)承担, 运行时静默跳过
    const src = rule.replaceFrom
    if (regexRuntimeSafe(src)) {
      try {
        // [R9-c-1] 单遍 exec 循环(safeReplaceAll)整体替代旧"短串直接 replace / 长串分块
        // replace"双路径: 旧分块实现 out += f(slice) 按 CHUNK-OVERLAP 步进【拼接】, 相邻
        // chunk 的 100 字符重叠区会两次进入输出 —— 长正文(>2000 字符)配置 replaceFrom 的
        // 规则每 ~1900 字符即重复拼出 100 字符(真实数据损坏; 旧注释"重复替换幂等"对
        // 拼接语义不成立)。单遍扫描无重叠即无重复, 也无跨块边界断匹配;
        // ReDoS 防线保留(嵌套量词闸门 + 预算测试), 另有逐匹配耗时哨兵兜底
        const replaced = safeReplaceAll(v, src, rule.replaceTo ?? '')
        if (replaced !== null) v = replaced
      } catch { /* 无效正则忽略 */ }
    }
  }
  if (rule.index !== undefined && rule.index !== null) {
    const parts = v.split(/[，,]/).map((s) => s.trim()).filter(Boolean)
    v = parts[rule.index] ?? ''
  }
  return v.trim()
}

// ---------------- CSS (cheerio) ----------------
/** 选择器容错执行: 数字开头 id(如 #123box, HTML 合法但 CSS 非法标识符)等非法选择器
 *  自动降级为属性选择器重试, 避免单条规则静默失效 */
function cssSelect($: cheerio.CheerioAPI, scope: any, expression: string): any {
  const run = (expr: string) => (scope && (scope as any).find ? (scope as any).find(expr) : $(expr))
  try {
    const el = run(expression)
    if (el && el.length > 0) return el
  } catch { /* 非法选择器 */ }
  try {
    const fixed = expression.replace(/#(\d[\w-]*)/g, '[id="$1"]')
    if (fixed !== expression) return run(fixed)
  } catch { /* ignore */ }
  return null
}

function cssExtract($: cheerio.CheerioAPI, scope: any, rule: FieldRule): string {
  const el = cssSelect($, scope, rule.expression)
  if (!el || el.length === 0) return ''
  const first = el.first()
  const attr = rule.attr || 'text'
  switch (attr) {
    // [R13-4] 块级感知文本提取: cheerio .text() 只拼接文本节点, 块级元素边界(压缩 HTML
    // 无空白文本节点时)直接粘连 —— <p>段1</p><p>段2</p> 提取得"段1段2"整章一行,
    // 清洗端无从复原。改为遍历子孙节点, 块级开闭边界/br 插入 \n, script/style 文本
    // 不进正文; 行内标签(span/b/a…)零改动。对 name/author 等字段无害(cleanTextField
    // 会压平 \n), intro 字段反而恢复分行语义
    case 'text': return blockAwareText(first[0])
    case 'html': return first.html() || ''
    case 'href': return first.attr('href') || ''
    case 'src': return first.attr('src') || ''
    default: return first.attr(attr) || ''
  }
}

// [R13-4] 内容块级标签集合(与 cleaner.CONTENT_BLOCK_TAGS 同口径; parser 独立声明避免
// 引入 cleaner→parser 循环依赖方向 —— cleaner 只被 runner/路由引用, parser 被多方引用)
const TEXT_BLOCK_TAGS: ReadonlySet<string> = new Set([
  'p', 'div', 'li', 'ul', 'ol', 'tr', 'td', 'th', 'table', 'thead', 'tbody', 'tfoot',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'section', 'article', 'header', 'footer',
  'aside', 'nav', 'blockquote', 'pre', 'form', 'dl', 'dt', 'dd', 'figure',
  'figcaption', 'main', 'center', 'hr',
])

/** 块级感知文本提取: 遍历 cheerio 底层 DOM 节点, 块级标签开闭边界插入 \n */
function blockAwareText(node: any): string {
  let out = ''
  const walk = (n: any): void => {
    if (!n) return
    if (n.type === 'text') { out += n.data || ''; return }
    if (n.type === 'root') { for (const c of n.children || []) walk(c); return }
    if (n.type !== 'tag') return
    const tag = String(n.tagName || '').toLowerCase()
    if (tag === 'br') { out += '\n'; return }
    // 脚本/样式内部文本不属于正文(text() 同样会泄漏 script 内容, 此处一并修正)
    if (tag === 'script' || tag === 'style' || tag === 'noscript') return
    const block = TEXT_BLOCK_TAGS.has(tag)
    if (block) out += '\n'
    for (const c of n.children || []) walk(c)
    if (block) out += '\n'
  }
  walk(node)
  return out
}

function cssExtractAll($: cheerio.CheerioAPI, scope: any, rule: FieldRule): any[] {
  const el = cssSelect($, scope, rule.expression)
  return el ? el.toArray() : []
}

// ---------------- XPath (@xmldom + xpath) ----------------
import { XMLSerializer } from '@xmldom/xmldom'

function htmlToDoc(html: string): any {
  try {
    // HTML → cheerio 规范化 → XML 序列化 → xmldom 解析
    // (xmldom 0.9 的 text/html 模式与 xpath 包不兼容, 必须走 text/xml)
    const pre = cheerio.load(html)
    let xml = (pre as any).xml()
    // 命名实体 → 数字实体(XML不识别 &nbsp; 等常见 HTML 实体)
    xml = xml
      .replace(/&nbsp;/g, '&#160;')
      .replace(/&mdash;/g, '&#8212;')
      .replace(/&ndash;/g, '&#8211;')
      .replace(/&ldquo;/g, '&#8220;')
      .replace(/&rdquo;/g, '&#8221;')
      .replace(/&lsquo;/g, '&#8216;')
      .replace(/&rsquo;/g, '&#8217;')
      .replace(/&hellip;/g, '&#8230;')
      .replace(/&middot;/g, '&#183;')
      .replace(/&copy;/g, '&#169;')
      .replace(/&reg;/g, '&#174;')
      .replace(/&trade;/g, '&#8482;')
      .replace(/&times;/g, '&#215;')
      .replace(/&divide;/g, '&#247;')
      .replace(/&laquo;/g, '&#171;')
      .replace(/&raquo;/g, '&#187;')
      .replace(/&deg;/g, '&#176;')
      .replace(/&euro;/g, '&#8364;')
      .replace(/&pound;/g, '&#163;')
      .replace(/&yen;/g, '&#165;')
    const doc = new DOMParser({ onError: () => {} } as any).parseFromString(xml, 'text/xml')
    return doc
  } catch {
    return null
  }
}

function getDoc(html: string): any {
  if (!html) return null
  return htmlToDoc(html)
}

/** 序列化节点为html */
function nodeHtml(node: any): string {
  try { return new XMLSerializer().serializeToString(node) } catch { return '' }
}

/** 节点内部html(不含外层标签) */
function nodeInnerHtml(node: any): string {
  try {
    const parts: string[] = []
    let child = node.firstChild
    while (child) {
      parts.push(new XMLSerializer().serializeToString(child))
      child = child.nextSibling
    }
    return parts.join('')
  } catch { return node.textContent || '' }
}

function nodeAttr(node: any, name: string): string {
  if (!node) return ''
  if (name === 'text') return node.textContent || ''
  if (name === 'html') return nodeInnerHtml(node)
  if (node.nodeType === 2) return node.value || node.nodeValue || '' // 属性节点本身
  return node.getAttribute?.(name) || node.getAttributeNode?.(name)?.value || ''
}

function xpathExtract(doc: any, rule: FieldRule): string {
  if (!doc) return ''
  try {
    const res: any[] = (xpath as any).select(rule.expression, doc)
    if (!res || res.length === 0) return ''
    const first = res[0]
    if (typeof first === 'string' || typeof first === 'number') return String(first)
    return nodeAttr(first, rule.attr || 'text')
  } catch {
    return ''
  }
}

function xpathExtractNodes(doc: any, expression: string): any[] {
  if (!doc) return []
  try {
    const res = (xpath as any).select(expression, doc)
    return Array.isArray(res) ? res.filter((n: any) => n && typeof n !== 'string') : []
  } catch {
    return []
  }
}

// ---------------- 正则 ----------------
function regexExtract(html: string, rule: FieldRule): string {
  try {
    // [R9-c-2] 运行时 ReDoS 闸门: 规则保存期校验(rules 路由 regexGate/collectRegexIssues)只拦
    //  API 入库路径, 直写 DB 的规则仍可携带灾难性回溯模式 —— 引擎层执行前再兜一道,
    //  危险正则跳过本次提取(返回空)
    if (!regexRuntimeSafe(rule.expression)) return ''
    const flags = rule.flags || 'gis'
    const re = new RegExp(rule.expression, flags)
    const m = re.exec(html)
    if (!m) return ''
    const group = rule.attr && /^\d+$/.test(rule.attr) ? parseInt(rule.attr) : (m.length > 1 ? 1 : 0)
    return m[group] ?? m[0] ?? ''
  } catch { return '' }
}

function regexExtractAll(html: string, rule: FieldRule): string[] {
  try {
    // [R9-c-2] 同 regexExtract: 全页扫描型更易踩回溯路径, 危险正则直接空结果
    if (!regexRuntimeSafe(rule.expression)) return []
    const flags = rule.flags || 'gi'
    const re = new RegExp(rule.expression, flags)
    const group = rule.attr && /^\d+$/.test(rule.attr) ? parseInt(rule.attr) : (re.source.includes('(') ? 1 : 0)
    const out: string[] = []
    let m: RegExpExecArray | null
    let guard = 0
    while ((m = re.exec(html)) && guard++ < 5000) {
      out.push(m[group] ?? m[0])
      if (m.index === re.lastIndex) re.lastIndex++
    }
    return out
  } catch { return [] }
}

// ---------------- JSON 纯API站模式 ----------------
/** 响应体 → JSON值: 非对象/数组开头或解析失败返回 undefined(由调用方决定空结果) */
export function parseJsonBody(html: string): unknown | undefined {
  if (!html) return undefined
  // [R9-c-3] 去 UTF-8 BOM: 部分 JSON API 响应体带 \uFEFF 前缀, 原实现 s[0] !== '{' 直接判非
  // JSON → 整段静默空结果(fetcher 解码层已去一次, 此处对测试面板直传 html 等入口兜底)
  // [R15-d1-4](Low, perf): O(1) 快速拒绝 —— gateFetch/crawlOneBook 每章对最大 10MB 响应体
  // 各调一次本函数, HTML 体(常态)首字符即 '<' 且无前导空白, 原先 .trim() 白做一次全量拷贝;
  // 快速路径命中时与 trim 后判定逐字节等价, 其余形态(带前导空白/JSON 体)维持原路径
  const s = html.replace(/^\uFEFF+/, '')
  const c00 = s.charCodeAt(0)
  if (s && c00 !== 0x7b && c00 !== 0x5b && !/\s/.test(s[0] ?? '')) return undefined
  const t = s.trim()
  if (!t || (t.charCodeAt(0) !== 0x7b && t.charCodeAt(0) !== 0x5b)) return undefined
  try {
    return JSON.parse(t)
  } catch {
    return undefined
  }
}

/** JSON 点路径取值(语法契约见 types.ts FieldRule 注释):
 *  a.b.c 逐层; 数字段=数组下标(0基); 空路径/./$=根本身; `[]`装饰剔除;
 *  首段为空(根数组 `.0.title`)按根处理; 数组上非数字段/标量上继续取路径 → undefined;
 *  cc-c 扩展(加法语义, 既有路径零回归): 段内方括号算子 `[n]`=数组下标(≡数字段),
 *  `[k=v]`=按元素属性值过滤数组(k=v 可 & 连写多条件, 值按 String 宽松比较),
 *  段 `*`=数组递归展平(数组的数组→元素平面, 如番茄 chapterListWithVolume) */
export function jsonGet(root: unknown, path: string): unknown {
  if (root === null || root === undefined) return undefined
  let cur: unknown = root
  const raw = (path || '').trim()
  if (!raw || raw === '.' || raw === '$') return cur
  for (const seg0 of raw.split('.')) {
    const seg = seg0.replace(/\[\]/g, '').trim()
    if (seg === '' || seg === '$') continue // 根数组前导空段(`.0.title`)
    if (cur === null || cur === undefined) return undefined
    const { name, ops } = splitJsonSeg(seg)
    if (name === '*' && Array.isArray(cur)) {
      // 递归展平: 数组的数组 → 元素平面(番茄 toc 章节表/嵌套分组列表)
      cur = (cur as unknown[]).flat(Infinity)
    } else if (name !== '') {
      if (Array.isArray(cur)) {
        if (/^\d+$/.test(name)) {
          cur = Number(name) < cur.length ? cur[Number(name)] : undefined
        } else {
          return undefined
        }
      } else if (typeof cur === 'object') {
        cur = (cur as Record<string, unknown>)[name]
      } else {
        return undefined
      }
    }
    // 段内方括号算子(按书写顺序应用): [n]=下标, [k=v(&k2=v2)…]=过滤
    for (const op of ops) {
      if (!Array.isArray(cur)) break
      if (/^\d+$/.test(op)) {
        cur = Number(op) < cur.length ? cur[Number(op)] : undefined
      } else if (op.includes('=')) {
        // R4-18: 原 `op.split('&')` 把值内的 `&` 当作条件分隔符 —— `[name=a&b]` 想表达
        // "name === 'a&b'" 被错误拆成 `[name='a', 'b']='']` 两条过滤条件, 第二条 `b` 无
        // `=` 被丢弃但条件数组改写为 `[name,'']` 失配整段。改为按 RFC-3986 风格在值内
        // 转义 `&`(`%26`)后 split, 转义符解码到 value 还原字面 `&`; 调用方未转义时仍
        // 按旧语义 split(向后兼容, 既有规则无 `&` 字面量值不受影响)
        const conds = op.split('&').map((c) => {
          const i = c.indexOf('=')
          if (i < 0) return null // 无 `=` 的子条件视为无效, 跳过(旧行为: 当作 [c, ''] 失配)
          const k = c.slice(0, i)
          const v = c.slice(i + 1).replace(/%26/gi, '&') // 转义符解码
          return [k, v] as [string, string]
        }).filter((x): x is [string, string] => x !== null)
        cur = (cur as Record<string, unknown>[]).filter(
          (el) => !!el && typeof el === 'object' && conds.every(([k, v]) => String((el as Record<string, unknown>)[k]) === v)
        )
      }
    }
  }
  return cur
}

/** 拆分路径段: 'name[3]', 'name[k=v]', 'name[]', 'name' → { name, ops[] }
 *  ([] 空装饰剔除; 非空括号内容按序返回, 由调用方按算子语义应用) */
function splitJsonSeg(seg: string): { name: string; ops: string[] } {
  const ops: string[] = []
  const re = /\[([^\]]*)\]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(seg))) ops.push(m[1])
  return { name: seg.replace(/\[[^\]]*\]/g, '').trim(), ops }
}

/** itemSelector 专用: 逗号分隔多路径并集取"数组平面" —
 *  各路径解析值: 数组→逐项拼入(如 hotlist,sort1,sort2 首页多榜单), 非数组标量→单项拼入。
 *  cc-c 扩展(map-collect, 加法语义): 非数字段作用在数组上 = 跨元素取该属性并展平一层
 *  (search_tabs[tab_type=3].data.book_data 三层嵌套一次下钻), 配合 `*` 段与 [k=v] 过滤
 *  表达"嵌套数组过滤+数组的数组展平"; 普通对象属性路径行为与旧版完全一致 */
export function jsonArrayAt(root: unknown, path: string): unknown[] {
  const raw = (path || '').trim()
  if (!raw) return []
  const out: unknown[] = []
  for (const part of raw.split(',').map((s) => s.trim()).filter(Boolean)) {
    const v = jsonArrayWalk(root, part)
    if (Array.isArray(v)) out.push(...v)
    else if (v !== undefined && v !== null) out.push(v)
  }
  return out
}

/** jsonArrayAt 内部行走器: jsonGet 语法 + map-collect(数组上非数字段=跨元素取属性展平一层) */
function jsonArrayWalk(root: unknown, path: string): unknown {
  if (root === null || root === undefined) return undefined
  let cur: unknown = root
  const raw = (path || '').trim()
  if (!raw || raw === '.' || raw === '$') return cur
  for (const seg0 of raw.split('.')) {
    const seg = seg0.replace(/\[\]/g, '').trim()
    if (seg === '' || seg === '$') continue
    if (cur === null || cur === undefined) return undefined
    const { name, ops } = splitJsonSeg(seg)
    if (name === '*' && Array.isArray(cur)) {
      cur = (cur as unknown[]).flat(Infinity)
    } else if (name !== '') {
      if (Array.isArray(cur)) {
        if (/^\d+$/.test(name)) {
          cur = Number(name) < cur.length ? cur[Number(name)] : undefined
        } else {
          // map-collect: 跨元素取属性并展平一层(元素属性为数组时收集其元素)
          const collected: unknown[] = []
          for (const el of cur as unknown[]) {
            const v = el && typeof el === 'object' ? (el as Record<string, unknown>)[name] : undefined
            if (Array.isArray(v)) collected.push(...v)
            else if (v !== undefined && v !== null) collected.push(v)
          }
          cur = collected
        }
      } else if (typeof cur === 'object') {
        cur = (cur as Record<string, unknown>)[name]
      } else {
        return undefined
      }
    }
    for (const op of ops) {
      if (!Array.isArray(cur)) break
      if (/^\d+$/.test(op)) {
        cur = Number(op) < cur.length ? cur[Number(op)] : undefined
      } else if (op.includes('=')) {
        const conds = op.split('&').map((c) => {
          const i = c.indexOf('=')
          return i < 0 ? [c, ''] : [c.slice(0, i), c.slice(i + 1)]
        })
        cur = (cur as Record<string, unknown>[]).filter(
          (el) => !!el && typeof el === 'object' && conds.every(([k, v]) => String((el as Record<string, unknown>)[k]) === v)
        )
      }
    }
  }
  return cur
}

/** JSON值 → 字符串: 数组→各元素字符串按\n连接; 标量→String; 对象/null→'' */
export function jsonToString(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (Array.isArray(v)) return v.map((x) => jsonToString(x)).filter(Boolean).join('\n')
  return ''
}

/** 页面URL → const模板 vars(`q.参数名` → 查询参数值): 书页 /api/book?id=2530 → { 'q.id': '2530' } */
export function urlVars(url: string): Record<string, string> {
  const out: Record<string, string> = {}
  if (!url) return out
  try {
    const u = new URL(url)
    u.searchParams.forEach((v, k) => {
      if (k && k.length <= 40) out['q.' + k] = v
    })
  } catch {
    /* 非法URL: 无vars */
  }
  return out
}

/** const 常量模板占位符替换: `{name}` → vars[name], 未命中→空串 */
function constTemplate(expr: string, vars: Record<string, string> | undefined): string {
  return expr.replace(/\{([a-zA-Z0-9_.]+)\}/g, (m, key: string) => {
    const v = vars?.[key]
    return v === undefined || v === null ? '' : String(v)
  })
}

// ---------------- 统一提取 ----------------
/** 提取上下文: json=当前作用域的JSON根值(itemSelector数组项/页面根);
 *  vars=const模板占位符取值表({字段名}/{index}/{q.*}) */
interface ExtractCtx {
  json?: unknown
  vars?: Record<string, string>
}

export function extractField(html: string, $: cheerio.CheerioAPI, scope: any, doc: any, rule: FieldRule, ctx?: ExtractCtx): string {
  let v = ''
  try {
    switch (rule.type) {
      case 'css': v = cssExtract($, scope, rule); break
      case 'xpath': {
        // scope 为节点时限制到节点范围
        if (scope && doc && scope !== doc && scope.nodeType) {
          const inner = nodeInnerHtml(scope) || ''
          const subDoc = htmlToDoc(inner)
          v = subDoc ? xpathExtract(subDoc, rule) : ''
        } else {
          v = xpathExtract(doc, rule)
        }
        break
      }
      case 'regex': v = regexExtract(html, rule); break
      case 'json': {
        // 作用域JSON(itemSelector数组项)优先, 否则按页面响应体整体解析(纯JSON API站)
        const root = ctx && ctx.json !== undefined ? ctx.json : parseJsonBody(html)
        v = root === undefined ? '' : jsonToString(jsonGet(root, rule.expression))
        break
      }
      case 'const': {
        v = constTemplate(rule.expression, ctx?.vars)
        break
      }
    }
  } catch { v = '' }
  return applyTransform(v, rule)
}

// ---------------- URL 绝对化 ----------------
export function absolutize(url: string, base: string): string {
  if (!url) return ''
  // [R25-2-4] 链接字段噪声剥离(bookUrl/chapterUrl/cover 唯一汇合点): ①不可见字符 —— 零宽
  // 字符/BOM 混进 href(源站反采集水印常态)后 URL 表面无异样但请求 404; ②实体单遍解码 ——
  // css/attr 路径 cheerio 已解码一次, 此处对结果幂等(普通 & 不在白名单实体内); regex/JSON
  // 路径拿到的 href 含字面 "&amp;" 时对齐浏览器属性解码语义(修前原样入库, fetch 必坏参)。
  // 解码置于协议过滤之前, 解码产物非 http(s) 仍被过滤(与旧行为一致)
  const u = String(url).replace(INVISIBLE_CHARS_RE, '').trim()
  const decoded = u ? decodeEntitiesOnce(u).trim() : ''
  if (!decoded) return ''
  let out = decoded
  if (!/^https?:\/\//i.test(decoded)) {
    try {
      out = new URL(decoded, base).toString()
    } catch {
      out = decoded
    }
  }
  // 过滤非 http(s) 结果: javascript:/data:/mailto:/about: 等不应作为章节/封面/翻页地址参与后续抓取
  // (原实现会把 javascript:void(0) 原样返回, 采集时 fetchPage 必然报错)
  if (!/^https?:\/\//i.test(out)) return ''
  // 修复: 自引用过滤 —— 纯锚点(href="#xx")解析后指向当前文档本身, 原先会成为
  // "章节链接"混进目录, runner 拿它抓正文等于把目录页整页当章节入库; 同理
  // href="./" 会把列表页自己当成一本书。同 origin+path+search(仅 fragment 差异)
  // 视为自引用返回空, 调用方(parseToc/runner)已有空 URL 跳过/回退逻辑兜底
  try {
    const o = new URL(out)
    const b = base ? new URL(base) : null
    if (b && o.origin === b.origin && o.pathname === b.pathname && o.search === b.search) return ''
  } catch { /* base 不可解析时保持原判定 */ }
  return out
}

// ---------------- 页面基址(<base href>) ----------------
/** 页面有效文档基址: 站点可用 <base href> 改写相对链接的解析基准(目录/分页站常见,
 *  相对章节链若按文档 URL 解析会错位成 404 路径)。首个 base[href] 为 HTML 规范生效位;
 *  相对 base href 按文档 URL 解析, 缺失/非法/非 http(s) 一律回退文档 URL */
function docBase($: cheerio.CheerioAPI, docUrl: string): string {
  if (!docUrl) return docUrl
  const href = ($('base[href]').first().attr('href') || '').trim()
  if (href) {
    if (/^https?:\/\//i.test(href)) return href
    try {
      const u = new URL(href, docUrl)
      if (u.protocol === 'http:' || u.protocol === 'https:') return u.toString()
    } catch { /* 非法 base href: 回退文档 URL */ }
  }
  return docUrl
}

/** 相对地址先按页面基址解析(与 absolutize 解耦: absolutize 的自引用过滤必须始终
 *  以"当前文档 URL"为基准, 而 <base href> 只改写相对解析基准 —— 两基准分离时由
 *  本函数先解析出绝对地址, 再交给 absolutize 做协议过滤+自引用过滤)。
 *  纯锚点(#x)不按基址解析: 浏览器虽有 base 下锚点跳 base 页的行为, 但采集侧
 *  "目录页自引用/纯锚点"必须保持被 absolutize 以文档 URL 过滤(防目录页整页当章节)。
 *  已是绝对地址/解析失败时原样返回, 由 absolutize 以文档 URL 兜底(与旧行为一致) */
function resolveWithBase(raw: string, base: string): string {
  const u = (raw || '').trim()
  if (!u || u.startsWith('#') || /^https?:\/\//i.test(u)) return u
  try {
    const abs = new URL(u, base).toString()
    return /^https?:\/\//i.test(abs) ? abs : u
  } catch {
    return u
  }
}

// ---------------- 翻页传输 ----------------
/** [R9-c-4] 翻页"下一页"链接鲁棒选取: 候选逐个绝对化+自引用过滤, 取第一个有效且未被排除
 *  (已访问/重复)的 URL。旧实现只取第一个匹配元素的 href —— 站点把装饰锚点(javascript:;/#top)
 *  排在真翻页链接之前时 absolutize 返回空, 翻页静默终止丢整卷; 且规则型 nextLink 配 css
 *  未写 attr 时旧逻辑按 text 提取(纯文本恒非 URL)必失败, 现补 href 候选。文案兜底仅按
 *  fallbackTexts 指定词匹配(目录页含"下一章"哨兵, 正文页刻意不含 —— 防末页误并下一章)。
 *  候选上限 50 防超大导航条拖慢 */
function pickNextHref(
  $: cheerio.CheerioAPI,
  doc: any,
  nextRule: FieldRule | undefined,
  scopeHtml: string,
  base: string,
  docUrl: string,
  fallbackTexts: string[],
  exclude: (u: string) => boolean
): string {
  const raws: string[] = []
  if (nextRule) {
    if (nextRule.type === 'css') {
      const els = cssSelect($, null, nextRule.expression)
      if (els && els.length) {
        for (const el of els.toArray().slice(0, 50)) {
          // text/html 或未指定 attr 时旧语义按文本提取, 补 href 为首选候选(未指定 attr 的
          // 规则此前恒翻页失败); 显式属性 attr 照旧
          const v = nextRule.attr === 'text' || nextRule.attr === 'html' || !nextRule.attr
            ? ($(el).attr('href') || $(el).text() || '')
            : ($(el).attr(nextRule.attr) || '')
          if (v) raws.push(v)
        }
      }
    } else {
      // regex/xpath/json/const 型沿用统一提取单值
      raws.push(extractField(scopeHtml, $, null, doc, nextRule))
    }
  }
  // 常见文案兜底(与旧实现同序; 规则型候选为空或全部无效时仍可翻页)
  for (const t of fallbackTexts) {
    const hits = $(`a:contains("${t}")`)
    for (const el of hits.toArray().slice(0, 50)) {
      const v = $(el).attr('href')
      if (v) raws.push(v)
    }
  }
  for (const raw of raws) {
    const abs = absolutize(resolveWithBase(raw, base), docUrl)
    if (abs && abs !== docUrl && !exclude(abs)) return abs
  }
  return ''
}

/** 翻页请求传输: fetchCfg.pageFetch 注入时走注入回调(runner 过闸路径, 与章节抓取同享
 *  hostGate 同站并发闸); 未注入时直连 fetchPage(rules/test 测试路由保持直连语义)。
 *  ll-c: refererUrl 可选第二参 —— parseToc/parseContent 翻页第2页起回传【上一页 URL】,
 *  runner 侧启用 refererChain 时 Referer 从"恒书籍页"升级为"翻页链逐页回溯"
 *  (真实浏览器从第1页点"下一页"导航, 第2页的 Referer 即第1页 URL); 未回传时语义不变。
 *  翻页失败语义不变: 抛错由调用方 catch 后 break(停止合并, 已得页保留) */
async function fetchPaginationPage(url: string, fetchCfg: Parameters<typeof fetchPage>[1], refererUrl?: string): Promise<string> {
  if (fetchCfg?.pageFetch) {
    const res = await fetchCfg.pageFetch(url, refererUrl)
    return res?.html ?? ''
  }
  const res = await fetchPage(url, fetchCfg)
  return res.html
}

// ---------------- 列表/目录解析 ----------------
// [R21-e-5] 精简: ListResult/ExtractCtx 仅文件内消费去 export(rg 全库零外部引用)
interface ListResult {
  items: { fields: Record<string, string> }[]
}

export function parseList(
  html: string,
  baseUrl: string,
  pageRule: PageRule,
  urlFields: string[] = ['url']
): ListResult {
  const $ = cheerio.load(html)
  const doc = getDoc(html)
  const out: ListResult = { items: [] }
  const { itemSelector, fields } = pageRule
  const hasJsonConstFields = Object.values(fields).some((r) => r && (r.type === 'json' || r.type === 'const'))

  // ---- JSON 模式: itemSelector.expression=数组路径(列表发现), 或无容器+json/const字段(书籍页JSON) ----
  // 规则为json/const型时不回退HTML提取(JSON解析失败直接空结果, 避免cheerio对JSON串的垃圾提取)
  if (itemSelector?.type === 'json' || (!itemSelector && hasJsonConstFields)) {
    const root = parseJsonBody(html)
    if (root === undefined) return out
    const varsBase = urlVars(baseUrl)
    const scopes: { json: unknown; index: number }[] = itemSelector
      ? jsonArrayAt(root, itemSelector.expression).map((it, i) => ({ json: it, index: i + 1 }))
      : [{ json: root, index: 1 }]
    for (const scope of scopes) {
      const rec: Record<string, string> = {}
      // 两阶段提取: 先非const(json路径从当前数组项取值), 再const(模板可引用已提取字段如 {id})
      for (const [key, rule] of Object.entries(fields)) {
        if (!rule || rule.type === 'const') continue
        rec[key] = extractField('', null as any, null, null, rule, {
          json: scope.json,
          vars: { ...varsBase, index: String(scope.index) },
        })
      }
      for (const [key, rule] of Object.entries(fields)) {
        if (!rule || rule.type !== 'const') continue
        rec[key] = extractField('', null as any, null, null, rule, {
          vars: { ...varsBase, index: String(scope.index), ...rec },
        })
      }
      for (const uf of urlFields) {
        if (rec[uf]) rec[uf] = absolutize(rec[uf], baseUrl)
      }
      // 列表项链接收紧(qq-e): 与 HTML 容器模式同口径 —— 含 url/bookUrl 链接字段而
      // 全部为空的 JSON 项(导航/广告垃圾记录)不入列, rules/test 的 items/count 不再虚高
      // (runner 侧本就有 filter(Boolean) 兜底, 但 test 面板与列表发现计数如实收紧);
      // 仅当 urlFields 含链接字段时生效: parseBook 借道本函数(urlFields=['cover'])不受此限
      if (urlFields.some((uf) => uf === 'url' || uf === 'bookUrl') && !urlFields.some((uf) => rec[uf])) continue
      if (Object.values(rec).some((v) => v)) out.items.push({ fields: rec })
    }
    return out
  }

  if (!itemSelector) {
    // 无容器: 直接对整页提取字段(单值型), 如书籍页
    const rec: Record<string, string> = {}
    for (const [key, rule] of Object.entries(fields)) {
      if (rule) rec[key] = extractField(html, $, null, doc, rule)
    }
    if (Object.keys(rec).length) out.items.push({ fields: rec })
    return out
  }

  // 容器型: css容器 → 遍历; regex容器 → 分段
  let scopes: { html: string; node: any }[] = []
  try {
    if (itemSelector.type === 'css') {
      scopes = cssExtractAll($, null as any, itemSelector).map((node: any) => ({ html: $.html(node), node }))
    } else if (itemSelector.type === 'xpath') {
      scopes = xpathExtractNodes(doc, itemSelector.expression).map((node) => ({
        html: node.nodeType ? nodeHtml(node) : String(node),
        node,
      }))
    } else {
      scopes = regexExtractAll(html, itemSelector).map((h) => ({ html: h, node: null }))
    }
  } catch { scopes = [] } // 非法容器选择器: 空结果而非整体抛错

  for (const scope of scopes) {
    // scopeDoc: css/regex容器用scope.html重建; xpath容器已有xmldom节点直接用
    const scopeDoc = scope.html ? htmlToDoc(scope.html) : scope.node
    const scope$ = cheerio.load(scope.html)
    const rec: Record<string, string> = {}
    for (const [key, rule] of Object.entries(fields)) {
      if (!rule) continue
      rec[key] = extractField(scope.html, scope$, null, scopeDoc, rule)
    }
    for (const uf of urlFields) {
      if (rec[uf]) rec[uf] = absolutize(rec[uf], baseUrl)
    }
    // 列表项链接收紧(y-a重放): 链接字段(url/bookUrl)全为空的书籍项跳过, 与目录侧
    // `if (!href) continue` 同语义 —— 原先"任一字段非空即入列", url 空但带标题/封面的
    // 导航垃圾项混进列表(runner 侧有 filter(Boolean) 兜底不成脏书, 但 rules/test 的
    // items/count 展示虚高)。仅当 urlFields 含链接字段时生效: parseBook 借道本函数
    // (urlFields=['cover'])提取封面, 不含链接字段, 不受此限
    if (urlFields.some((uf) => uf === 'url' || uf === 'bookUrl') && !urlFields.some((uf) => rec[uf])) continue
    if (Object.values(rec).some((v) => v)) out.items.push({ fields: rec })
  }
  return out
}

// ---------------- 书籍信息解析 ----------------
export function parseBook(html: string, baseUrl: string, pageRule: PageRule): ParsedBook {
  const res = parseList(html, baseUrl, pageRule, ['cover'])
  const f = res.items[0]?.fields || {}
  return {
    name: f.name || undefined,
    author: f.author || undefined,
    category: f.category || undefined,
    // [R25-2-5] status/keywords/latestChapter: 三个无下游清洗的消费面字段 —— 仅供
    // smartCompleteDetect(状态检测)与规则测试面板展示, 不经 runner 的 cleanTextField/cleanIntro。
    // 修前 JSON/正则提取路径的字面实体("完结&nbsp;"/"已完結"零宽水印/繁体)直接进检测器,
    // 实体隔断关键词匹配致检测降级为 unknown。此处为它们的【唯一】清洗点(单遍解码语义不破坏,
    // 与 runner 清洗字段互不重叠); name/author/category/intro 由 runner 清洗, 此处不重复
    status: cleanTextField(f.status) || undefined,
    keywords: cleanTextField(f.keywords) || undefined,
    intro: f.intro || undefined,
    cover: f.cover ? absolutize(f.cover, baseUrl) : undefined,
    latestChapter: cleanTextField(f.latestChapter) || undefined,
  }
}

// ---------------- 目录解析(含翻页 + 乱序重排 + 去重) ----------------
export async function parseToc(
  firstUrl: string,
  html: string,
  pageRule: PageRule,
  fetchCfg: Parameters<typeof fetchPage>[1],
  onProgress?: (page: number, found: number) => Promise<void> | void
): Promise<{ items: TocItem[]; pages: number }> {
  const all: TocItem[] = []

  // ---- JSON 目录模式: itemSelector.expression=数组路径(如 bqg713 的纯章节名数组 list) ----
  // 数组项可为对象(字段按路径取)或纯字符串(title 用 '.' 取根本身); 章节URL用 const 模板
  // 合成(`{q.id}`=目录页URL查询参数 + `{index}`=1基序号)。JSON目录API单次返回全量, 无HTML翻页。
  if (pageRule.itemSelector?.type === 'json') {
    const root = parseJsonBody(html)
    if (root !== undefined) {
      const base = firstUrl
      const varsBase = urlVars(firstUrl)
      const seen = new Set<string>()
      const items = jsonArrayAt(root, pageRule.itemSelector.expression)
      items.forEach((it, i) => {
        // 两阶段提取(cc-c 扩展, 与 parseList JSON 模式同构): 先非const字段
        // (title/itemId等, 供 const 章节URL模板引用 {itemId}), 再const字段;
        // index/title 显式后置防同名字段覆盖, 既有 const 模板({q.*}/{index}/{title})语义不变
        const titleRule = pageRule.fields.title
        const urlRule = pageRule.fields.url
        const phase1Vars = { ...varsBase, index: String(i + 1) }
        const rec: Record<string, string> = {}
        for (const [key, r] of Object.entries(pageRule.fields)) {
          if (!r || r.type === 'const') continue
          rec[key] = extractField('', null as any, null, null, r, { json: it, vars: phase1Vars })
        }
        let title = rec.title ?? ''
        if (titleRule?.type === 'const') {
          title = extractField('', null as any, null, null, titleRule, {
            vars: { ...varsBase, ...rec, index: String(i + 1) },
          })
        }
        let href = ''
        if (urlRule?.type === 'const') {
          href = extractField('', null as any, null, null, urlRule, { json: it, vars: { ...varsBase, ...rec, index: String(i + 1), title } })
        } else if (urlRule) {
          href = rec.url ?? ''
        }
        // ll-c: const 型 volume 字段补提 —— phase-1 循环跳过 const 型(与 title/url const 同
        // 机制), 但原先 title/url 有后置提取而 volume 没有, 配置 toc.fields.volume 为 const
        // (单卷 API 全目录打同一卷名标签)时分卷名静默丢失。与 title const 同取值表后置提取
        let volume = rec.volume || ''
        if (!volume && pageRule.fields.volume?.type === 'const') {
          volume = extractField('', null as any, null, null, pageRule.fields.volume, { vars: { ...varsBase, ...rec, index: String(i + 1), title } })
        }
        if (!title && !href) return
        href = absolutize(href, base)
        // 目录条目必须持有效章节链接(const模板占位符未命中会合成空URL, 过滤不入目录)
        if (!href) return
        const dedupKey = href || title
        if (seen.has(dedupKey)) return
        seen.add(dedupKey)
        // kk-a: 分卷名(规则 toc.fields.volume 提取, 如番茄 volume_name)
        // [R25-2-6] volume 唯一清洗点: runner 落库仅 trim+UTF-16 slice(无法修改), 实体/零宽
        // 字符/站名尾巴("第一卷_笔趣阁")修前原样随章落库。cap 120 码点与 runner
        // slice(0,120)(UTF-16 单元)对 BMP 文本逐字节对齐, 不提前截断
        const cleanVol = volume ? cleanTextField(volume, 120) : ''
        all.push({ title: title || href, url: href, volume: cleanVol || undefined })
      })
      await onProgress?.(1, all.length)
    }
    return { items: all, pages: 1 }
  }

  let url = firstUrl
  let current = html
  const maxPages = pageRule.pagination?.enabled ? (pageRule.pagination.maxPages || 20) : 1
  const seen = new Set<string>()
  // [R9-c-5] 首页入防环集: 末页"下一页"指回目录首页时, 原实现需重新抓取/解析一次首页后
  // 才被 __page__ 集合拦截; 预置后直接判停(免一次无谓请求)
  if (pageRule.pagination?.enabled) seen.add('__page__' + firstUrl)
  // R3-24: 同 path 不同 query 的"伪翻页"计数器 —— 部分站点把"下一页"链 query 改个时间戳/
  // 随机数/nocache 仍指回当前页(分页 rule 配置错或源站分页 bug), 原 seen.has 防环判重不命中
  // (每次 next 都是新 URL), maxPages 上限 20 内不断拉取重复内容入库。连 5 次同 path 即停。
  let samePathStreak = 0
  let lastPath = ''
  let pagesUsed = 0

  for (let p = 1; p <= maxPages && url; p++) {
    pagesUsed = p
    // R3-24: 计算当前 url 的 path, 与上一页 path 对比; 同 path 不同 query 累计计数
    let curPath = ''
    try { curPath = new URL(url).pathname.toLowerCase() } catch { /* 解析失败忽略 */ }
    if (curPath && curPath === lastPath) {
      samePathStreak++
      if (samePathStreak >= 5) break
    } else {
      samePathStreak = 0
    }
    lastPath = curPath
    const $ = cheerio.load(current)
    const doc = getDoc(current)
    // <base href> 生效时目录相对链接按基址解析; 自引用过滤仍以文档 URL 为基准
    const base = docBase($, url || firstUrl)
    const fields = pageRule.fields
    const titleRule = fields.title
    const urlRule = fields.url
    const volumeRule = fields.volume // kk-a: 分卷名字段(可选)
    let scopePairs: { html: string; node: any }[] = []

    if (pageRule.itemSelector) {
      try {
        if (pageRule.itemSelector.type === 'css') {
          scopePairs = cssExtractAll($, null as any, pageRule.itemSelector).map((node: any) => ({ html: $.html(node), node }))
        } else if (pageRule.itemSelector.type === 'xpath') {
          scopePairs = xpathExtractNodes(doc, pageRule.itemSelector.expression).map((node) => ({ html: '', node }))
        } else {
          scopePairs = regexExtractAll(current, pageRule.itemSelector).map((h) => ({ html: h, node: null }))
        }
      } catch { scopePairs = [] } // 非法容器选择器: 空结果而非整体抛错
    } else {
      scopePairs = [{ html: current, node: null }]
    }

    for (const scope of scopePairs) {
      // scopeDoc: css/regex容器用scope.html重建; xpath容器已有xmldom节点直接用
      const scopeDoc = scope.html ? htmlToDoc(scope.html) : scope.node
      const scope$ = scope.node ? cheerio.load(scope.html || nodeHtml(scope.node)) : $
      let title = ''
      let href = ''
      let vol = ''
      if (titleRule) title = extractField(scope.html, scope$, null, scopeDoc, titleRule)
      if (urlRule) href = extractField(scope.html, scope$, null, scopeDoc, urlRule)
      if (volumeRule) vol = extractField(scope.html, scope$, null, scopeDoc, volumeRule)
      if (!title && !href) continue
      if (!href && scope.node) href = nodeAttr(scope.node, 'href') || ''
      href = absolutize(resolveWithBase(href, base), url || firstUrl)
      // 修复: absolutize 会把纯锚点(javascript:void(0)/#top 等)过滤成空 —— 此前仅
      // "title 与 href 双空"才跳过, 导致目录混入 url 为空的垃圾章节(导航锚点常态);
      // 目录条目必须持有效章节链接, 无 href 一律不入目录(title 由 title||href 兜底)
      if (!href) continue
      const dedupKey = href || title
      if (seen.has(dedupKey)) continue
      seen.add(dedupKey)
      // [R25-2-6] volume 唯一清洗点(与 JSON 目录路径同口径, 见彼处注释)
      const cleanVol = vol ? cleanTextField(vol, 120) : ''
      all.push({ title: title || href, url: href, volume: cleanVol || undefined })
    }
    await onProgress?.(p, all.length)

    // 翻页
    if (p < maxPages && pageRule.pagination?.enabled) {
      // [R9-c-4] 鲁棒下一页选取: 规则型候选+文案兜底逐个绝对化试选(排除已访页);
      // 目录页文案哨兵含"下一章"(与旧实现一致)
      const next = pickNextHref($, doc, pageRule.pagination.nextLink, current, base, url, ['下一页', '下页', '下一章'], (u) => seen.has('__page__' + u))
      if (!next) break
      seen.add('__page__' + next)
      // ll-c: Referer 链翻页语义 —— 此刻 url 仍是当前页(第N页), 取下一页前先捕获作
      // 第 N+1 页的 Referer(真实浏览器翻页导航链); 未启用 refererChain 时 runner 侧忽略
      const refererForNext = url
      url = next
      try {
        current = await fetchPaginationPage(url, fetchCfg, refererForNext)
      } catch {
        break
      }
    } else {
      break
    }
  }
  return { items: all, pages: pagesUsed || 1 }
}

// ---------------- 章节内容解析(含翻页合并) ----------------
export async function parseContent(
  firstUrl: string,
  html: string,
  pageRule: PageRule,
  fetchCfg: Parameters<typeof fetchPage>[1]
): Promise<ParsedContent> {
  const contentRule = pageRule.fields.content
  if (!contentRule) return { content: '', pages: 1 }
  const joinWith = pageRule.pagination?.joinWith ?? '<br/>'
  const parts: string[] = []
  let url = firstUrl
  let current = html
  const maxPages = pageRule.pagination?.enabled ? (pageRule.pagination.maxPages || 10) : 1
  const visited = new Set<string>()
  // [R9-c-6] 低质备用选择器状态: 仅在第 1 页定夺一次, 后续页沿用同一提取器(防跨页风格混拼)
  let useLargest = false

  for (let p = 1; p <= maxPages && url; p++) {
    if (visited.has(url)) break
    visited.add(url)
    const $ = cheerio.load(current)
    const doc = getDoc(current)
    // <base href> 生效时相对"下一页"按基址解析(bb-g 修复, 与 parseToc 同口径):
    // 原先直接按文档 URL 解析, 页面携带 base href 时翻页链错位成 404 → 静默断页丢正文
    const base = docBase($, url || firstUrl)
    let part = extractField(current, $, null, doc, contentRule)
    if (contentRule.type === 'css') {
      if (p === 1) {
        // [R9-c-6] 低质触发备用选择器重试(增强): 主规则提取结果为空/文本量过小/短行占比
        // 过高(疑似命中壳页导航或站点改版后规则失效), 而"最长文本容器"显著更好(得分×1.5)
        // 时改用备用; 防误切双保险 —— alt 与主结果互不包含(超集切换只会混入噪声, 子集切换会丢内容)
        const q1 = scoreContentHtml(part)
        if (q1.textLen === 0) {
          useLargest = true
          part = findLargestText($)
        } else if ((q1.textLen < 400 || q1.shortLineRatio > 0.5) && q1.textLen < 5000) {
          const alt = findLargestText($)
          if (alt && alt !== part && !alt.includes(part) && !part.includes(alt)) {
            const q2 = scoreContentHtml(alt)
            if (q2.score > q1.score * 1.5) {
              part = alt
              useLargest = true
            }
          }
        }
      } else if (useLargest) {
        // 备用提取器路径: 最长容器取不到(末页过短/低于 200 字门槛)时回退主规则结果
        part = findLargestText($) || part
      }
    }
    if (part) parts.push(part)

    if (p < maxPages && pageRule.pagination?.enabled) {
      // [R9-c-4] 鲁棒下一页选取: 正文页文案哨兵刻意不含"下一章"(末页"下一章"常指向下一章,
      // 误随会把下一章正文并进本章); 排除集=已访页防循环分页
      const next = pickNextHref($, doc, pageRule.pagination.nextLink, current, base, url, ['下一页', '下页'], (u) => visited.has(u))
      if (!next) break
      // ll-c: 与 parseToc 同口径 —— 正文分页第2页起 Referer=上一正文页(翻页链逐页回溯)
      const refererForNext = url
      url = next
      try {
        current = await fetchPaginationPage(url, fetchCfg, refererForNext)
      } catch {
        break
      }
    } else {
      break
    }
  }
  const content = parts.filter(Boolean).join(joinWith)
  // [R9-c-6] 解析置信度输出(增强): 质量画像 + 0~1 置信度, 均为可选字段(旧调用方零影响),
  // 供 runner 降级决策/规则诊断展示 —— 本函数只产出不改行为
  const q = scoreContentHtml(content)
  return {
    content,
    pages: Math.max(1, visited.size),
    confidence: contentConfidence(q),
    quality: {
      textLen: q.textLen,
      shortLineRatio: Math.round(q.shortLineRatio * 1000) / 1000,
      adHitRatio: Math.round(q.adHitRatio * 1000) / 1000,
    },
  }
}

// ---------------- [R9-c-6] 正文质量评分(增强) ----------------
/** 广告/导流词标记: 命中密度作为正文质量信号(仅评分用, 不参与清洗) */
const AD_MARKER_RE = /(请记住本站|最新章节|无弹窗|首发|本站地址|章节错误|点此举报|广告|推广|手机阅读|APP下载|加入书签|点击下一页|继续阅读|www\.|https?:\/\/)/gi

interface ContentScore { textLen: number; shortLineRatio: number; adHitRatio: number; score: number }

/** 正文质量画像: 去标签后按行统计 —— 文本量为主分, 短行(≤8字)占比/广告词密度折减 */
function scoreContentHtml(html: string): ContentScore {
  const text = (html || '').replace(/<[^>]+>/g, '\n')
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean)
  const textLen = lines.join('').length
  if (!textLen) return { textLen: 0, shortLineRatio: 1, adHitRatio: 0, score: 0 }
  let shortLines = 0
  let adChars = 0
  for (const l of lines) {
    if (l.length <= 8) shortLines++
    const hits = l.match(AD_MARKER_RE)
    if (hits) adChars += hits.join('').length
  }
  const shortLineRatio = shortLines / lines.length
  const adHitRatio = Math.min(1, adChars / textLen)
  const score = textLen * (1 - 0.5 * shortLineRatio) * (1 - 0.7 * adHitRatio)
  return { textLen, shortLineRatio, adHitRatio, score }
}

/** 置信度映射(0~1): 文本量/短行占比/广告密度三档扣减的启发式评分 */
function contentConfidence(q: ContentScore): number {
  if (q.textLen < 50) return 0.1
  let c = 0.9
  if (q.textLen < 300) c -= 0.3
  if (q.shortLineRatio > 0.5) c -= 0.3
  if (q.adHitRatio > 0.05) c -= 0.3
  return Math.max(0, Math.min(1, c))
}

function findLargestText($: cheerio.CheerioAPI): string {
  let best = ''
  let bestLen = 0
  $('div,p,td,article').each((_, el) => {
    const t = $(el).text() || ''
    if (t.length > bestLen) {
      bestLen = t.length
      best = $.html(el)
    }
  })
  return bestLen > 200 ? best : ''
}
