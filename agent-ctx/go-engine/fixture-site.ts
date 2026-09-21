// [R50-1] Go 引擎联合 E2E fixture 站(端口 3099)
// 形态与 mini-services/crawler-go/internal/task/task_test.go 的假站一致:
//   /list/{page}.html(2 页×2 书) /book/{id}.html(内嵌目录 3 章+封面) /chapter/{bid}_{n}.html /covers/x.jpg
// [R51-5] 页面体量对齐真实站: 拦截页检测(TS looksBlocked 语义权威)对 <200B 恒拦、
//   200~500B 且可见文本<50 判拦、≥1200B+正常标题豁免 —— fixture 436B 书籍页会被误判,
//   故所有页面填充至 ≥1200B 且带正常 <title>/h1(对齐 R51-3-a2 先例: fixture 对齐真实体量而非放宽阈值)
// 用法: bun run agent-ctx/go-engine/fixture-site.ts   (常驻, 测试完手动杀)
const PORT = 3099

// 确定性填充段落(小说正文风味, 避免引入随机性影响断言)
const FILLER_PARAS = [
  '山间的风穿过林梢，带来远处溪水的凉意。他沿着旧驿道缓行，露水打湿了褪色的行囊。',
  '城中灯火渐次亮起，酒肆里传出断续的琴声，说书人拍响醒木，讲起前朝旧事。',
  '她翻开泛黄的册页，墨迹间夹着半片干枯的枫叶，字里行间尽是未寄出的思量。',
  '海雾漫过码头，桅杆上的灯在风里摇晃，归船的号子声由远及近，又归于寂静。',
  '雪落在青瓦上，檐角铜铃轻响。炉火将熄未熄，映着壁上悬了多年的旧剑。',
]
const filler = (seed: number, paras = 12) =>
  Array.from({ length: paras }, (_, i) => `<p>${FILLER_PARAS[(seed + i) % FILLER_PARAS.length]}</p>`).join('')

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url)
    const p = url.pathname
    const html = (s: string) =>
      new Response(s, { headers: { 'content-type': 'text/html; charset=utf-8' } })

    if (p.startsWith('/list/')) {
      const page = p.endsWith('/2.html') ? 2 : 1
      const items = [(page - 1) * 2 + 1, (page - 1) * 2 + 2]
        .map((id) => `<li><a class="t" href="/book/${id}.html">测试书${id}</a></li>`)
        .join('')
      return html(
        `<html><head><meta charset="utf-8"><title>书库列表 第${page}页</title></head><body>` +
          `<h1>书库列表</h1><div class="booklist"><ul>${items}</ul></div>` +
          `<div class="page-desc">${filler(page, 10)}</div></body></html>`,
      )
    }

    if (p.startsWith('/book/')) {
      const id = Number(p.match(/\/book\/(\d+)\.html/)?.[1] || 0)
      const chapters = Array.from({ length: 3 }, (_, i) => i + 1)
        .map((n) => `<li><a href="/chapter/${id}_${n}.html">第${n}章 标题</a></li>`)
        .join('')
      return html(
        `<html><head><meta charset="utf-8"><title>测试书${id}</title></head><body>` +
          `<h1 class="bt">测试书${id}</h1><span class="ba">作者${id}</span>` +
          `<div id="intro">这是测试书籍${id}的简介, 用于联合 E2E 验证。${filler(id, 6)}</div>` +
          `<img class="cover" src="/covers/x.jpg">` +
          `<div class="toc"><ul>${chapters}</ul></div></body></html>`,
      )
    }

    if (p.startsWith('/chapter/')) {
      const m = p.match(/\/chapter\/(\d+)_(\d+)\.html/) || []
      return html(
        `<html><head><meta charset="utf-8"><title>第${m[2]}章 标题</title></head><body>` +
          `<h1>第${m[2]}章 标题</h1><div id="content">` +
          `<p>这是第${m[2]}章的正文内容, 属于测试图书${m[1]}。</p><p>段落二: 内容清洗链验证。</p>` +
          filler(Number(m[1]) * 10 + Number(m[2] || 1), 10) +
          `</div></body></html>`,
      )
    }

    if (p.startsWith('/covers/')) {
      // 1×1 PNG
      const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
      return new Response(Buffer.from(b64, 'base64'), { headers: { 'content-type': 'image/png' } })
    }

    return new Response('not found', { status: 404 })
  },
})
console.log(`[fixture-site] http://127.0.0.1:${PORT} 就绪`)
