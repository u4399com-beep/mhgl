// 本地mock小说站 — 验证采集全链路: 乱序目录/URL+标题去重/正文分页/广告清洗
import http from 'http'

const BOOKS: Record<string, { name: string; author: string; cat: string; intro: string; cover: string }> = {
  '1': { name: '测试之书甲', author: '作者一', cat: '玄幻', intro: '这是一本测试书籍的简介，包含一些内容。 已完结。', cover: '/covers/a.png' },
  '2': { name: '测试之书乙', author: '作者二', cat: '都市', intro: '第二本测试书, 讲述都市故事, 连载中。', cover: '/covers/b.png' },
}

const CHAPTER_TITLES = ['第1章 初入', '第2章 相遇', '第10章 突破', '第3章 风波', '第11章 危机', '第4章 线索', '第5章 反转', '第12章 决战', '第6章 余波', '第13章 新程']

function page302(title: string, url: string): string {
  return `<html><head><meta charset="utf-8"><title>${title} - 目录 - 全本小说库</title></head>
<body><div id="list"><dl>
${CHAPTER_TITLES.map((t, i) => `<dd><a href="/chapter/${url}/${i + 1}">${t}</a></dd>`).join('\n')}
<dd><a href="/chapter/${url}/1">第1章 初入</a></dd>
</dl></div><a href="/toc/${url}">下一页</a></body></html>`
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url || '/', 'http://localhost:3030')
  const p = u.pathname
  if (p.startsWith('/covers/')) {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')
    res.writeHead(200, { 'Content-Type': 'image/png' })
    return res.end(png)
  }
  if (p.startsWith('/list/')) {
    const items = Object.entries(BOOKS).map(([id, b]) => `<li><a href="/book/${id}">${b.name}</a> ${b.author} ${b.cat}</li>`).join('')
    const html = `<html><head><meta charset="utf-8"><title>全本小说库 - 书籍列表</title></head><body><h1>全本小说库</h1><ul class="l">${items}</ul><p>本站共收录 ${Object.keys(BOOKS).length} 本测试书籍，每日持续更新，提供全文在线阅读与整本下载服务，您可以通过分类导航或搜索功能快速查找感兴趣的书籍，阅读过程如遇问题欢迎反馈。</p></body></html>`
    res.writeHead(200, { 'Content-Type': 'text/html' })
    return res.end(html)
  }
  if (p.startsWith('/book/')) {
    const id = p.split('/')[2] || ''
    const b = BOOKS[id]
    if (!b) { res.writeHead(404); return res.end('404') }
    const html = `<html><head><meta charset="utf-8"><title>${b.name} - 全本小说库</title></head><body>
<div id="maininfo"><h1>${b.name}</h1><p>作者：${b.author}</p><p>分类：${b.cat}</p><p>字数：约53万字</p><p>更新时间：2026-09-01</p></div>
<div id="intro">${b.intro} 本书情节跌宕起伏，人物刻画细腻，文笔流畅，是一部不可多得的佳作，欢迎广大书友收藏阅读，并将本书推荐给身边的朋友，您的支持是我们更新的最大动力。</div>
<img id="fmimg" src="${b.cover}"/>
<div id="list-link"><a href="/toc/${id}">查看目录</a></div>
<script>var ad="this should be removed";</script>
</body></html>`
    res.writeHead(200, { 'Content-Type': 'text/html' })
    return res.end(html)
  }
  if (p.startsWith('/toc/')) {
    const id = p.split('/')[2] || '1'
    const html = page302(BOOKS[id]?.name || '', id)
    res.writeHead(200, { 'Content-Type': 'text/html' })
    return res.end(html)
  }
  if (p.startsWith('/chapter/') && !p.endsWith('/p2')) {
    const [, , bid, n] = p.split('/')
    const title = CHAPTER_TITLES[parseInt(n || '1') - 1] || `第${n}章`
    const html = `<html><head><meta charset="utf-8"><title>${title} - 全本小说库</title></head><body>
<div id="content">
<h2>${title}</h2>
<p>这是第${n}章的正文第一页内容。山雨欲来风满楼，主角踏上了新的旅途。夜色渐深，远处的山影如同蛰伏的巨兽，风声穿过林梢带来隐约的钟声，他握紧手中的信物，朝着记忆中的方向继续前行。</p>
<p>请记住本书首发域名 www.junk-ad.com 免费读</p>
<div id="content-page2-link"><a href="/chapter/${bid}/${n}/p2">下一页</a></div>
</div>
<script>var tracking=1;</script>
</body></html>`
    res.writeHead(200, { 'Content-Type': 'text/html' })
    return res.end(html)
  }
  if (p.endsWith('/p2')) {
    const html = `<html><head><meta charset="utf-8"><title>正文继续 - 全本小说库</title></head><body><div id="content"><p>这是第二页内容，剧情继续推进。真相渐渐浮出水面。尘封的旧卷宗里夹着半张泛黄的信笺，字迹早已模糊，唯有落款处的印章依稀可辨，他把信笺凑近烛火，火光摇曳间，多年前的那个雨夜仿佛又在眼前重现。</p></div></body></html>`
    res.writeHead(200, { 'Content-Type': 'text/html' })
    return res.end(html)
  }
  res.writeHead(404); res.end('404')
})

server.listen(3030, () => console.log('mock novel site on :3030'))

export {}
