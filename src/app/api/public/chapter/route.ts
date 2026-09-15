// 前台章节内容(阅读页)
import { db } from '@/lib/db'
import { ok, fail } from '@/lib/api'
import { readChapterTxt } from '@/lib/crawl/storage'
import { decodeEntitiesOnce } from '@/lib/crawl/cleaner'
import { applyBannedWordsToHtml } from '@/lib/banned-words'
import { getBannedWordsConfig } from '@/lib/banned-words-server'
import { withGuard, str } from '../../_lib/http'

export async function GET(req: Request) {
  return withGuard(async () => {
    const url = new URL(req.url)
    const id = str(url.searchParams.get('id'), 64).trim()
    if (!id) return fail('缺少id')

    const ch = await db.chapter.findUnique({
      where: { id },
      // num: 伪静态数字书号(前台生成 /read/{num}/{idx}.html 链接)
      include: { book: { select: { id: true, num: true, name: true, author: true, status: true, keywords: true } } },
    })
    if (!ch) return fail('章节不存在', 404)

    let content = ch.content || ''
    if (ch.storage === 'txt' && ch.filePath) {
      const raw = await readChapterTxt(ch.filePath)
      if (raw) {
        content = raw.split('\n').slice(1).join('\n').trim()
        // 修复(存储型注入面): txt 文件内容是 htmlToPlainText 产物 —— 实体已解码, 源站
        // "&lt;img src=x onerror=…&gt;" 这类实体编码载荷在落盘时还原成标签字面量;
        // 此处按空行切段后 <p>${p}</p> 直拼, 前台 ReadView 检测到内容含 <p> 会原样
        // 放行 dangerouslySetInnerHTML → 字面量成为活动节点。段落内容先转义 & < >
        // 再包 <p>(与 ReadView 对无标签纯文本的转义分支同语义)
        // [R23-主-2] 存量实体解码: R22-b 清洗器落地前入库的落盘文件含未解码命名/数字实体
        // (全量实测 6063/6974 章节文件含 &nbsp;), 修前"实体已解码"假设对存量失效 ——
        // &nbsp; 经下方安全转义变 &amp;nbsp;, 前台渲染成字面 "&nbsp;" 垃圾(阅读页实证)。
        // 此处在转义【前】先 decodeEntitiesOnce(与 R22-b 主清洗链同口径, 白名单实体+代理区拒绝),
        // 再走既定安全转义 —— 解码产物(如 &lt;img…&gt; 还原的标签字面量)随即被转义拒活,
        // 注入面零回归; 已干净文件解码为无操作, 幂等。download 成品 TXT 为独立流式链路, 另档。
        content = content
          .split(/\n{2,}/)
          .map((p) => `<p>${decodeEntitiesOnce(p.trim()).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`)
          .join('')
      }
    }

    // [R21-h-1] 违禁词过滤(前台公共渲染点): 配置 60s 缓存 + 保存即失效;
    // 空词表零开销直通; 只过滤文本段不动标签(applyBannedWordsToHtml),
    // 防词表命中 <p>/属性名等破坏 HTML 结构
    if (content) {
      content = applyBannedWordsToHtml(content, await getBannedWordsConfig())
    }

    // idx: 伪静态需要(prev/next 也按预设生成 /read/{num}/{idx}.html 链接)
    const [prev, next] = await Promise.all([
      db.chapter.findFirst({ where: { bookId: ch.bookId, idx: { lt: ch.idx } }, orderBy: { idx: 'desc' }, select: { id: true, idx: true, title: true } }),
      db.chapter.findFirst({ where: { bookId: ch.bookId, idx: { gt: ch.idx } }, orderBy: { idx: 'asc' }, select: { id: true, idx: true, title: true } }),
    ])

    return ok({
      chapter: {
        id: ch.id,
        idx: ch.idx,
        title: ch.title,
        content,
        wordCount: ch.wordCount,
        storage: ch.storage,
      },
      book: ch.book,
      prev,
      next,
    })
  })
}
