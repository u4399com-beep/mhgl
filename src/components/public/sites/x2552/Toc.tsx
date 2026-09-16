// ============================================================
// [R28-2d-x8] x2552(吾爱文学网) 目录页克隆 —— 黑冰模板 Wayback 实测 1:1
// 素材: /tmp/r28-2d/x2552/x2-book.html(2023-12-04 /html/1/1326/ 快照)
// 真站 DOM: #a_main(全宽无左栏) > .bdtop+.bdsub > dl:
//   dt( p.fr 右浮: 加入书架|推荐本书|返回书页 + 面包屑 首页->分类->书名最新章节 )
//   + dd h1「{书名}最新章节」 + dd h3「作者：X」 + dd table#at(4列 td.L 章节链, cellspacing1 bg#E4E4E4)
// 降级: ①加入书架/推荐本书(登录态) → 未渲染, 保留「返回书页」 ②真站整本单页 → 契约
//   100 章/页分页(Pagelink, 真站无) ③当前章 #FF3300 高亮(真站无, 可用性增强, 声明)
// ============================================================
'use client'

import type { SiteTocProps } from '../shared'
import { usePublic } from '../../ctx'
import { BdSub, BdTop, C, Pagelink } from './_kit'

export function X2552Toc({ data, loading, error, page, currentChapterId }: SiteTocProps) {
  const { site, navigate } = usePublic()
  const book = data?.book ?? null
  const chapters = data?.chapters ?? []
  const totalPages = data ? Math.max(1, data.tocTotalPages || 1) : 1
  // 4 列网格(实测: 每行 4 个 td.L)
  const cols = 4
  const rows: (typeof chapters)[] = []
  for (let i = 0; i < chapters.length; i += cols) rows.push(chapters.slice(i, i + cols))

  return (
    <div style={{ width: '100%', maxWidth: 960, margin: '0 auto', padding: '0 8px' }}>
      <div style={{ height: 8 }} />
      <BdTop />
      <BdSub>
        <dl style={{ margin: 0, padding: '4px 8px 10px' }}>
          <dt style={{ lineHeight: '30px', fontSize: 12, color: C.text, overflow: 'hidden' }}>
            <span
              style={{
                float: 'right',
                display: 'inline-flex',
                gap: 6,
                alignItems: 'center',
              }}
            >
              {/* 真站 p.fr: 加入书架|推荐本书|返回书页 → 前两者登录态未渲染(声明) */}
              {book && (
                <button type="button" className="x2-a" onClick={() => navigate({ view: 'book', bookId: book.id })}>
                  返回书页
                </button>
              )}
            </span>
            <button type="button" className="x2-a" onClick={() => navigate({ view: 'home' })}>
              {site.name}
            </button>
            {'->'}
            {book && (
              <>
                {' '}
                <button type="button" className="x2-a" onClick={() => navigate({ view: 'category', cat: book.categoryId || undefined })}>
                  {book.category || '小说'}
                </button>
                {'->'}
              </>
            )}
            {book ? `${book.name}最新章节` : '章节目录'}
          </dt>
          {error ? (
            <dd style={{ margin: 0, padding: '30px 0', textAlign: 'center', color: 'red', fontSize: 13 }}>目录加载失败：{error}</dd>
          ) : loading && !book ? (
            <dd style={{ margin: '6px 0' }}>
              <span className="block h-[26px] w-2/3 animate-pulse" style={{ background: C.face }} />
              <span className="mt-2 block h-[180px] w-full animate-pulse" style={{ background: C.face }} />
            </dd>
          ) : book ? (
            <>
              <dd style={{ margin: 0 }}>
                <h1 style={{ fontSize: 18, lineHeight: '30px', color: C.text, fontWeight: 'bold', margin: '4px 0' }}>
                  {book.name}最新章节
                </h1>
              </dd>
              <dd style={{ margin: 0 }}>
                <h3 style={{ fontSize: 13, fontWeight: 'normal', color: C.text, margin: '2px 0 8px' }}>作者：{book.author}</h3>
              </dd>
              <dd style={{ margin: 0 }}>
                <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                <table
                  className="x2-tbl x2-at"
                  cellPadding={0}
                  cellSpacing={0}
                  style={{ width: '100%', minWidth: 560, borderCollapse: 'separate', borderSpacing: 1, background: C.border, fontSize: 12, color: C.link }}
                >
                  <tbody>
                    {rows.map((row, ri) => (
                      <tr key={ri} style={{ background: '#fff' }}>
                        {row.map((c) => (
                          <td key={c.id} className="L" style={{ padding: '4px 6px', width: '25%' }}>
                            <button
                              type="button"
                              className="x2-a block max-w-full truncate text-left"
                              style={c.id === currentChapterId ? { color: C.red } : undefined}
                              onClick={() => navigate({ view: 'read', bookId: book.id, chapterId: c.id })}
                              title={c.title}
                            >
                              {c.title || `第${c.idx}章`}
                            </button>
                          </td>
                        ))}
                        {row.length < cols &&
                          Array.from({ length: cols - row.length }).map((_, k) => (
                            <td key={`pad-${k}`} className="L" style={{ padding: '4px 6px', width: '25%', background: '#fff' }} />
                          ))}
                      </tr>
                    ))}
                    {!rows.length && (
                      <tr style={{ background: '#fff' }}>
                        <td colSpan={cols} style={{ padding: '18px 0', textAlign: 'center', color: C.text }}>
                          暂无章节
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                </div>
              </dd>
            </>
          ) : null}
        </dl>
      </BdSub>
      <Pagelink page={page} totalPages={totalPages} onPage={(p) => book && navigate({ view: 'toc', bookId: book.id, page: p })} />
    </div>
  )
}
