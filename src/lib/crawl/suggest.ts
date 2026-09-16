// ============================================================
// 搜索引擎下拉关键词聚合
// 百度 / 必应 / 360 / DuckDuckGo 下拉建议 (sogou 已于 [R27-2-1] 剔除, 端点 404)
// 作为书籍辅助标签/关联词, 独立访问页面均指向主书籍信息页
// ============================================================
import { fetchPage } from './fetcher'

interface SuggestEngine {
  name: string
  url: (kw: string) => string
  parse: (body: string) => string[]
}

const ENGINES: SuggestEngine[] = [
  {
    name: 'baidu',
    url: (kw) => `https://www.baidu.com/sugrec?prod=pc&wd=${encodeURIComponent(kw)}`,
    parse: (body) => {
      try {
        const j = JSON.parse(body)
        return (j.g || []).map((x: any) => x.q).filter((s: any) => typeof s === 'string')
      } catch { return [] }
    },
  },
  {
    name: 'bing',
    url: (kw) => `https://api.bing.com/osjson.aspx?query=${encodeURIComponent(kw)}`,
    parse: (body) => {
      try {
        const j = JSON.parse(body)
        return Array.isArray(j?.[1]) ? j[1].filter((s: any) => typeof s === 'string') : []
      } catch { return [] }
    },
  },
  // [R27-2-1] sogou 下拉端点已死(R25-3 实测 sugproxy 404): 从引擎池剔除, 省一次必然失败的
  //   8s 超时等待并腾出引擎位。若后续搜狗恢复, 参考旧实现:
  //   url: https://www.sogou.com/sugproxy/sug?action=get&encode=utf-8&query={kw}
  //   parse: JSON j.data[] → string | {word|q}
  {
    name: 'so360',
    url: (kw) => `https://sug.so.360.cn/suggest?word=${encodeURIComponent(kw)}&encode=utf-8`,
    parse: (body) => {
      try {
        const j = JSON.parse(body.replace(/^[^(]*\(/, '').replace(/\);?\s*$/, ''))
        return (j?.s || j?.data || []).map((x: any) => (typeof x === 'string' ? x : x?.word)).filter(Boolean)
      } catch { return [] }
    },
  },
  {
    name: 'ddg',
    url: (kw) => `https://duckduckgo.com/ac/?q=${encodeURIComponent(kw)}&type=list`,
    parse: (body) => {
      try {
        const j = JSON.parse(body)
        if (Array.isArray(j) && Array.isArray(j?.[1])) return j[1]
        if (Array.isArray(j)) return j.map((x: any) => x?.phrase).filter(Boolean)
        return []
      } catch { return [] }
    },
  },
]

export interface SuggestResult {
  engine: string
  words: string[]
  ok: boolean
}

/** 聚合多引擎下拉词 */
export async function fetchSuggestKeywords(keyword: string, perEngineLimit = 12): Promise<SuggestResult[]> {
  const results: SuggestResult[] = await Promise.all(
    ENGINES.map(async (eng) => {
      try {
        // [R28-4-L5] 改走 fetchPage(http 引擎)替代 fetchBinary: ①修前下拉端点收到
        // `Accept: image/avif,...` 图片形态 Accept(fetchBinary 专用)——AJAX 端点不可能被
        // <img> 引用, 语义指纹异常; fetchPage 指纹链按浏览器家族发导航形态 Accept。
        // ②修前响应体硬编码 utf-8 解码, 将来接入 GBK 端点(如 baidu-m su)会乱码;
        // fetchPage 复用 decodeBuffer 的 charset 三级探测(Content-Type 头/meta 嗅探/FFFD 兜底)。
        // 当前 4 引擎均 UTF-8, 行为等价; SSRF 守卫/超时/重试语义由 fetchPage 统一承担
        const res = await fetchPage(eng.url(keyword), {
          engine: 'http',
          timeout: 8000,
          retries: 0,
          referer: false,
          uaMode: 'rotate',
        })
        const words = eng.parse(res.html)
          .map((w) => String(w).trim())
          .filter((w) => w && w.length <= 50 && !/^https?:/.test(w))
        return { engine: eng.name, words: words.slice(0, perEngineLimit), ok: words.length > 0 }
      } catch {
        return { engine: eng.name, words: [], ok: false }
      }
    })
  )
  return results
}

/** 去重合并 + 相关度过滤(保留含主词的 + 高频关联词) */
export function mergeSuggestWords(
  bookName: string,
  results: SuggestResult[],
  limit = 25
): string[] {
  const freq = new Map<string, number>()
  for (const r of results) {
    for (const w of r.words) {
      const k = w.trim()
      if (!k) continue
      freq.set(k, (freq.get(k) || 0) + 1)
    }
  }
  const scored = Array.from(freq.entries()).map(([word, count]) => {
    let score = count * 10
    if (word.includes(bookName)) score += 30
    if (word === bookName) score += 20
    return { word, score }
  })
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, limit).map((s) => s.word)
}
