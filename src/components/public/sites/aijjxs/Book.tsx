// ============================================================
// [R28-2a] aijjxs 克隆书页(书籍详情) —— 复刻真站 /txt/57361.html
//   (快照 /tmp/r28-2a/aijjxs/aijjxs-book.html + style.css .detail 段实测)
//
//   真站结构(类名注释对应真站; 全部 .panel 白卡纵排):
//     panel h3「《书名》」 + .body.detail(grid 122px 1fr 235px → 真站右侧第三列为站内
//       推荐模块空置, 契约无数据 → 双列 122px+1fr):
//       .pic 封面 92×128(边 #d8d8d8) + .copy-btn「加入收藏」(登录态 → TXT下载同位替代,
//         边 #b8ddd6 #0f766e, hover bg #e5fcfa)
//       .kv 行: 书籍作者/书籍分类/书籍大小(KB)/写作进度(.sfwj 青底 #09B295 白字圆角胶囊)
//         /上传时间/下载方式(全本免费)
//     panel「内容简介」 .desc(#374151)
//     panel「下载与说明」: .download-btn 电子书下载地址(渐变 #da562a→#b8461d, hover
//       #c94a20→#9e350f) + .download-btn 在线阅读全文 + .tips 说明文案
//     panel「猜您喜欢」 .grid2 > .book 卡(封面 88×122 + h4 + .meta + .desc)
//
//   降级/推断说明:
//   ① 「书籍大小：464 KB」真站为 txt 体积 → wordCount/1024 折算 KB
//   ② 「加入收藏」copy-btn 真站为登录收藏交互 → 无数据源, 位置以「TXT 下载」按钮同形替代
//      (真站 .copy-btn 形态保留: 边 #b8ddd6 青字)
//   ③ 「猜您喜欢」真站为站方推荐 → 契约无推荐数据, 以同分类最新书近似(BookDetailData 无
//      分类外书列表 → 由目录页数据不可得, 改 fetchBooks 同分类切片, 推断级)
//   ④ 真站详情第三列(右侧 235px)无稳定内容(站方广告位) → 不渲染
// ============================================================
'use client'

import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import type { SiteBookProps } from '../shared'
import { usePublic } from '../../ctx'
import { fetchBooks } from '../../data'
import { BookCover } from '../../BookCover'
import { ErrorState, Sk } from '../../bits'
import { fmtDate, statusLabel } from '../../seo'
import type { BookItem } from '../../types'

// [R28-2a-17] 真站 style.css .detail 段实测色值
const C = {
  bg: '#f3efe7',
  paper: '#fffdf8',
  muted: '#6b7280',
  line: '#e5dccd',
  brand: '#0f766e',
  brandDark: '#115e59',
  sfwj: '#09B295', // .sfwj 写作进度胶囊底
  green: '#2a7b5f', // .classname chip 字色
  radius: '14px',
  shadow: '0 10px 30px rgba(17, 24, 39, 0.08)',
} as const

function kb(n?: number | null): string {
  return `${Math.max(1, Math.round((n || 0) / 1024))} KB`
}

export function AijjxsBook({ data, loading, error, tocPage }: SiteBookProps) {
  const { site, navigate } = usePublic()
  const book = data?.book ?? null
  const chapters = data?.chapters ?? []
  const tags = data?.tags ?? []

  // [R28-2a-18] 猜您喜欢: 同分类最新书(排除自身; 降级声明③)
  const [related, setRelated] = useState<BookItem[] | null>(null)
  useEffect(() => {
    if (!book) return
    let alive = true
    fetchBooks({ site: site.id, cat: book.categoryId || undefined, page: 1, size: 5 })
      .then((d) => {
        if (alive) setRelated(d.books.filter((b) => b.id !== book.id))
      })
      .catch(() => {
        if (alive) setRelated([])
      })
    return () => {
      alive = false
    }
  }, [site.id, book])

  const panel: CSSProperties = { border: `1px solid ${C.line}`, borderRadius: C.radius, background: C.paper, boxShadow: C.shadow, overflow: 'hidden', marginTop: 14 }
  // [R28-2a-19] panel 标题条(真站 .panel h3: 渐变竖条 + 底边 rgba(255,214,224,.28))
  const panelTitle: CSSProperties = {
    position: 'relative',
    margin: 0,
    padding: '12px 12px 12px 20px',
    fontSize: 18,
    fontWeight: 700,
    color: '#1f3f3a',
    letterSpacing: '0.4px',
    borderBottom: '1px solid rgba(255, 214, 224, 0.28)',
  }

  if (error) {
    return (
      <div className="ajx-book-page" style={{ background: C.bg, padding: '18px 14px' }}>
        <div className="mx-auto w-full" style={{ maxWidth: 1220 }}>
          <ErrorState message="书籍信息加载失败" detail={error} />
        </div>
      </div>
    )
  }

  if (loading || !book) {
    return (
      <div className="ajx-book-page" style={{ background: C.bg, padding: '14px 14px 24px' }} role="status" aria-label="书籍信息加载中">
        <div className="mx-auto w-full" style={{ maxWidth: 1220 }}>
          <Sk className="h-52 w-full" style={{ borderRadius: 14, background: 'rgba(255,253,248,0.9)' }} />
          <Sk className="mt-3.5 h-40 w-full" style={{ borderRadius: 14, background: 'rgba(255,253,248,0.9)' }} />
        </div>
      </div>
    )
  }

  const firstChapter = chapters[0]

  return (
    <div className="ajx-book-page" style={{ background: C.bg, padding: '0 0 24px' }}>
      <div className="mx-auto w-full" style={{ maxWidth: 1220, padding: '18px 14px 0' }}>
        {/* panel《书名》 + .body.detail */}
        <article style={{ ...panel, marginTop: 0 }}>
          <h3 style={panelTitle} className="ajx-h3">
            《{book.name}》
          </h3>
          <div className="ajx-detail" style={{ display: 'grid', gridTemplateColumns: '122px minmax(0,1fr)', gap: 14, alignItems: 'start', padding: '6px 14px 14px' }}>
            {/* .pic */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 7, paddingTop: 6 }}>
              <BookCover name={book.name} cover={book.cover} style={{ width: 92, height: 128, borderRadius: 0, border: '1px solid #d8d8d8', background: '#fff' }} />
              {/* .copy-btn 位置以 TXT 下载同形替代(降级声明②) */}
              <a
                href={`/api/public/download?book=${encodeURIComponent(book.id)}`}
                target="_blank"
                rel="noreferrer"
                className="ajx-copy"
                style={{ border: '1px solid #b8ddd6', borderRadius: 8, padding: '6px 10px', fontSize: 12, background: '#fff', color: C.brand, textDecoration: 'none' }}
              >
                TXT下载
              </a>
            </div>
            {/* .kv */}
            <div style={{ minWidth: 0 }}>
              {[
                { k: '书籍作者：', v: <span className="ajx-a" style={{ color: C.brandDark }}>{book.author}</span> },
                { k: '书籍分类：', v: <span>{book.category || '--'}</span> },
                { k: '书籍大小：', v: <span>{kb(book.wordCount)}</span> },
                {
                  k: '写作进度：',
                  v: (
                    <span style={{ background: C.sfwj, borderRadius: 9, color: '#fff', padding: '1px 8px 3px 6px', fontSize: 13 }}>
                      {statusLabel(book.status)}
                    </span>
                  ),
                },
                { k: '上传时间：', v: <span>{fmtDate(book.updatedAt) || '--'}</span> },
                { k: '下载方式：', v: <span>全本免费</span> },
              ].map((row) => (
                <p key={row.k} style={{ margin: '0 0 4px 4px', fontSize: 14, lineHeight: 1.9, color: '#374151' }}>
                  <strong style={{ color: '#1f3f3a' }}>{row.k}</strong>
                  {row.v}
                </p>
              ))}
              {/* 关键词 chips(契约 tags 字段, 真站无此板块 → 补充呈现, 不删数据) */}
              {tags.length > 0 && (
                <p style={{ margin: '8px 0 0 4px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {tags.slice(0, 6).map((t) => (
                    <button
                      key={t.tag}
                      type="button"
                      onClick={() => navigate({ view: 'keyword', tag: t.tag })}
                      className="ajx-cat-pill"
                      style={{ border: '1px solid #d6ebde', borderRadius: 999, background: '#f1faf6', color: C.green, fontSize: 12, padding: '2px 8px', cursor: 'pointer' }}
                    >
                      {t.tag}
                    </button>
                  ))}
                </p>
              )}
            </div>
          </div>
        </article>

        {/* panel 内容简介 */}
        <article style={panel}>
          <h3 style={panelTitle} className="ajx-h3">
            内容简介
          </h3>
          <div style={{ padding: '10px 14px 14px' }}>
            <div style={{ padding: 10, borderRadius: 10, border: '1px solid #ece2d2', background: '#fff', color: '#374151', fontSize: 14, lineHeight: 1.9, whiteSpace: 'pre-line' }}>
              {book.intro || '暂无简介'}
            </div>
          </div>
        </article>

        {/* panel 下载与说明 */}
        <article style={panel}>
          <h3 style={panelTitle} className="ajx-h3">
            下载与说明
          </h3>
          <div style={{ padding: '10px 14px 14px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {/* 真站唯一下载出口 → TXT 下载(全站唯一允许 <a> 出口之一) */}
              <a
                href={`/api/public/download?book=${encodeURIComponent(book.id)}`}
                target="_blank"
                rel="noreferrer"
                className="ajx-dl"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: 184,
                  borderRadius: 12,
                  padding: '11px 16px',
                  color: '#fff',
                  textDecoration: 'none',
                  fontWeight: 700,
                  background: 'linear-gradient(135deg, #da562a, #b8461d)',
                }}
              >
                电子书下载地址
              </a>
              <button
                type="button"
                onClick={() => (firstChapter ? navigate({ view: 'read', chapterId: firstChapter.id }) : navigate({ view: 'toc', bookId: book.id }))}
                className="ajx-dl ajx-dl-read"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: 184,
                  borderRadius: 12,
                  padding: '11px 16px',
                  color: '#fff',
                  fontWeight: 700,
                  border: 0,
                  cursor: 'pointer',
                  background: 'linear-gradient(135deg, #0f766e, #115e59)',
                }}
              >
                在线阅读全文
              </button>
            </div>
            <div style={{ marginTop: 10, fontSize: 13, color: C.muted, lineHeight: 1.8 }}>
              点击「电子书下载地址」可获取 TXT 全本文件；不想等待下载也可以直接「在线阅读全文」继续阅读。
            </div>
          </div>
        </article>

        {/* panel 猜您喜欢(降级声明③) */}
        <article style={panel}>
          <h3 style={panelTitle} className="ajx-h3">
            猜您喜欢
          </h3>
          <div style={{ padding: 14 }}>
            {related === null ? (
              <Sk className="h-36 w-full" style={{ borderRadius: 12, background: 'rgba(255,250,241,0.9)' }} />
            ) : related.length === 0 ? (
              <p style={{ margin: 0, color: C.muted, fontSize: 13 }}>暂无同类推荐</p>
            ) : (
              <div className="ajx-grid2" style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 12 }}>
                {related.slice(0, 4).map((b) => (
                  <div key={b.id} className="ajx-book" style={{ border: `1px solid ${C.line}`, borderRadius: 12, background: '#fff', padding: 10, overflow: 'hidden' }}>
                    <div style={{ overflow: 'hidden' }}>
                      <button
                        type="button"
                        onClick={() => navigate({ view: 'book', bookId: b.id })}
                        style={{ float: 'left', marginRight: 10, padding: 0, border: 0, background: 'none', cursor: 'pointer' }}
                        aria-label={`查看 ${b.name}`}
                      >
                        <BookCover name={b.name} cover={b.cover} style={{ width: 88, height: 122, borderRadius: 8 }} />
                      </button>
                      <h4 style={{ margin: '2px 0 4px', fontSize: 15, lineHeight: 1.5 }}>
                        <button
                          type="button"
                          onClick={() => navigate({ view: 'book', bookId: b.id })}
                          className="ajx-book"
                          style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', color: C.brandDark, fontSize: 15, fontWeight: 600, textAlign: 'left' }}
                        >
                          {b.name}
                        </button>
                      </h4>
                      <div className="ajx-meta" style={{ color: C.muted, fontSize: 12, marginTop: 4, clear: 'both' }}>
                        {b.author} · {b.category} · {kb(b.wordCount)} · {fmtDate(b.updatedAt) || '--'}
                      </div>
                    </div>
                    <div style={{ marginTop: 8, padding: 10, borderRadius: 10, border: '1px solid #ece2d2', background: '#fff', color: '#374151', fontSize: 14, lineHeight: 1.7, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {b.intro || '暂无简介'}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ marginTop: 10, textAlign: 'right' }}>
              <button
                type="button"
                onClick={() => navigate({ view: 'toc', bookId: book.id, page: tocPage > 0 ? tocPage : 1 })}
                className="ajx-flat"
                style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', color: C.brand, fontSize: 13 }}
              >
                查看完整目录 &gt;&gt;
              </button>
            </div>
          </div>
        </article>
      </div>
    </div>
  )
}

