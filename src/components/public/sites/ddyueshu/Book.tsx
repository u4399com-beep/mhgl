// ============================================================
// [R28-2a] ddyueshu 克隆书页(书籍详情) —— 复刻真站 /2_2096/ 类书页
//   (快照 /tmp/r28-2a/ddyueshu/ddyueshu-book.html + biquge.css #maininfo/#list 段全量实测)
//
//   真站结构(类名注释对应真站; 经典笔趣阁形态):
//     .box_con(边 2px #88C6E5 w976) > .con_top 面包屑(bg #E1ECED lh40 底边 #88C6E5)
//     #maininfo > #info: h1 28px 黑体 + p「作    者：X」+ p「动    作：加入书架,直达底部」
//       + p「最后更新：…」; #intro(上边 dashed #88C6E5 13px, p 缩进 2em)
//     #sidebar > #fmimg(bg #E1ECED w126 padding 12, img 120×150)
//     #listtj「书名推荐阅读:」关键词链 → 契约无对应 → 不渲染(降级声明③)
//     .box_con > #list dl: dt(bg #C3DFEA lh28 居中)《书名》最新章节 + dd×N(w33% dashed #CCC)
//       + dt《书名》正文 + dd 全量(契约 100 章/页 → 真站全量单页改分页, 降级声明②)
//
//   降级/推断说明:
//   ① 「动    作：加入书架」真站为登录书架 JS → 以「TXT下载」+「阅读历史」等价操作替代
//   ② 真站 #list 单页全量章节 → 契约 fetchBook 100 章/页 → dt 分卷/分组按数据呈现 + .page 分页
//   ③ #listtj 关键词落地链(/kw/...)为站方 SEO 内链 → 契约无对应, 以 tags 芯片等价呈现
//   ④ 「最后更新：2023-08-29 16:06:03」精确到秒 → 契约 updatedAt 展示 YYYY-MM-DD
// ============================================================
'use client'

import type { CSSProperties } from 'react'
import type { SiteBookProps } from '../shared'
import { usePublic } from '../../ctx'
import { BookCover } from '../../BookCover'
import { ErrorState, Sk } from '../../bits'
import { fmtDate, statusLabel } from '../../seo'
import { groupTocVolumes } from '../template-kit'

const C = {
  page: '#E9FAFF',
  ink: '#555',
  link: '#6F78A7',
  ddInk: '#444444', // #list dd a:link
  boxBorder: '#88C6E5',
  conTopBg: '#E1ECED',
  dtBg: '#C3DFEA',
  row: '#CCCCCC',
  fmBg: '#E1ECED',
  blueBtn: '#459DF5', // style.css .downtxt a
  blueBtnHover: '#118860',
  dtSpan: '#999999', // [R28-2a2 交接] dt 辅助文字色(Category.tsx 同名键同值; R28-2a 遗漏致 TS2339)
} as const

// [R34-2c-8] 原 Book/Toc/Fulltext 三组件内部逐字节相同的 pgBtn 提升为模块级单处定义
export const pgBtn = (on: boolean): CSSProperties => ({
  display: 'inline-block',
  margin: '4px 10px 4px 0',
  padding: '4px 12px',
  background: on ? '#00A86E' : '#fff',
  color: on ? '#fff' : '#666',
  border: `1px solid ${on ? '#00A86E' : '#BBB'}`,
  fontSize: 12,
  lineHeight: '16px',
  cursor: 'pointer',
})

export function DdyueshuBook({ data, loading, error, tocPage, currentChapterId }: SiteBookProps) {
  const { navigate } = usePublic()
  const book = data?.book ?? null
  const chapters = data?.chapters ?? []
  const tags = data?.tags ?? []
  const tocTotalPages = data ? Math.max(1, data.tocTotalPages || 1) : 1
  const curPage = tocPage > 0 ? tocPage : 1
  const vols = groupTocVolumes(chapters)

  // [R36-2b-4] 真站「《书名》最新章节」= 站方倒序 12 条; 原「当前页尾 12 条倒序」(多页书第 1 页≈最早)
  // 升级为 API 全书最新 12 章(latestChapters idx desc 最新在前, 与目录分页解耦)。展示序与原设计
  // 一致(最新在前) → API desc 序直接用不再 reverse; 缺字段容旧响应回落当前页尾 12 条倒序原口径
  const latest12 = data?.latestChapters ? [...data.latestChapters] : [...chapters].slice(-12).reverse()
  const mainChapters = vols ? null : chapters

  if (error) {
    return (
      <div className="dy-book" style={{ background: C.page, color: C.ink, padding: '14px 10px' }}>
        <div className="mx-auto w-full" style={{ maxWidth: 980 }}>
          <ErrorState message="书籍信息加载失败" detail={error} />
        </div>
      </div>
    )
  }

  if (loading || !book) {
    return (
      <div className="dy-book" style={{ background: C.page, color: C.ink, padding: '14px 10px 24px' }} role="status" aria-label="书籍信息加载中">
        <div className="mx-auto w-full" style={{ maxWidth: 980 }}>
          <Sk className="h-10 w-full" style={{ borderRadius: 0, background: 'rgba(225,236,237,0.9)' }} />
          <Sk className="mt-2.5 h-52 w-full" style={{ borderRadius: 0, background: 'rgba(255,255,255,0.8)' }} />
          <Sk className="mt-2.5 h-72 w-full" style={{ borderRadius: 0, background: 'rgba(255,255,255,0.8)' }} />
        </div>
      </div>
    )
  }

  const firstChapter = chapters[0]

  return (
    <div className="dy-book" style={{ background: C.page, color: C.ink, fontFamily: '"Segoe UI","Microsoft YaHei",sans-serif', fontSize: 12, padding: '0 0 16px' }}>
      <div className="mx-auto w-full" style={{ maxWidth: 980, padding: '10px 10px 0' }}>
        {/* .box_con 信息块 */}
        <div className="dy-boxcon" style={{ border: `2px solid ${C.boxBorder}`, overflow: 'hidden', marginBottom: 10 }}>
          {/* .con_top 面包屑 */}
          <div className="dy-con-top" style={{ borderBottom: `1px solid ${C.boxBorder}`, textAlign: 'left', padding: '0 10px', lineHeight: '40px', height: 40, background: C.conTopBg }}>
            <button type="button" onClick={() => navigate({ view: 'home' })} className="dy-a" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', color: C.link, fontSize: 12 }}>
              顶点小说
            </button>
            {' &gt; '}
            <button type="button" onClick={() => navigate({ view: 'category', cat: book.categoryId || undefined })} className="dy-a" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', color: C.link, fontSize: 12 }}>
              {book.category || '小说'}
            </button>
            {' &gt; '}
            <span>{book.name}最新章节</span>
          </div>

          <div style={{ padding: 12, overflow: 'hidden' }}>
            {/* #sidebar #fmimg 封面(窄屏上文) */}
            <div className="dy-fmimg" style={{ background: C.fmBg, width: 126, margin: 12, padding: 12, float: 'right', boxSizing: 'border-box' }}>
              <BookCover name={book.name} cover={book.cover} style={{ width: 120, height: 150, borderRadius: 0, border: 'none', margin: '0 auto' }} />
              {/* .downtxt TXT 下载钮(真站 style.css .downtxt a: #459DF5 白字 lh34, hover #118860) */}
              <a
                href={`/api/public/download?book=${encodeURIComponent(book.id)}`}
                target="_blank"
                rel="noreferrer"
                className="dy-btn"
                style={{ display: 'block', width: '100%', lineHeight: '34px', margin: '8px 0 0', borderRadius: 2, fontSize: 14, color: '#fff', background: C.blueBtn, textAlign: 'center', textDecoration: 'none' }}
              >
                TXT下载
              </a>
            </div>

            {/* #maininfo #info */}
            <div style={{ minWidth: 0, overflow: 'hidden' }}>
              <div className="dy-info">
                <h1 style={{ fontFamily: '黑体, SimHei, sans-serif', fontSize: 28, fontWeight: 700, overflow: 'hidden', margin: 0, padding: '1px 0', color: '#333' }}>
                  {book.name}
                </h1>
                <p style={{ height: 25, lineHeight: '25px', paddingTop: 2, margin: 0, overflow: 'hidden', fontSize: 15 }}>
                  <strong>作&nbsp;&nbsp;&nbsp;&nbsp;者：</strong>
                  <span className="dy-a">{book.author}</span>
                  <span style={{ color: C.dtSpan, marginLeft: 10, fontSize: 12 }}>[{statusLabel(book.status)}]</span>
                </p>
                <p style={{ height: 25, lineHeight: '25px', paddingTop: 2, margin: 0, overflow: 'hidden', fontSize: 15 }}>
                  <strong>动&nbsp;&nbsp;&nbsp;&nbsp;作：</strong>
                  <a href={`/api/public/download?book=${encodeURIComponent(book.id)}`} target="_blank" rel="noreferrer" className="dy-btn-inline" style={{ color: C.link, textDecoration: 'none' }}>
                    TXT下载
                  </a>
                  {' ，'}
                  <button
                    type="button"
                    onClick={() => navigate({ view: 'toc', bookId: book.id, page: curPage })}
                    className="dy-a"
                    style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', color: C.link, fontSize: 15 }}
                  >
                    章节目录
                  </button>
                </p>
                <p style={{ height: 25, lineHeight: '25px', paddingTop: 2, margin: 0, overflow: 'hidden', fontSize: 15 }}>
                  <strong>最后更新：</strong>
                  {fmtDate(book.updatedAt) || '--'}
                  <span style={{ color: C.dtSpan, marginLeft: 10, fontSize: 12 }}>分类：{book.category || '--'}</span>
                </p>
                {/* #intro */}
                <div style={{ width: '96%', overflow: 'hidden', lineHeight: '150%', borderTop: `1px dashed ${C.boxBorder}`, padding: 10, fontSize: 13, marginTop: 8 }}>
                  <p style={{ textIndent: '2em', marginTop: 10, marginBottom: 0 }}>{book.intro || '暂无简介'}</p>
                </div>
                {/* #listtj 等价: tags 芯片(降级声明③) */}
                {tags.length > 0 && (
                  <p style={{ margin: '8px 0 0', display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                    <span style={{ color: '#666' }}>{book.name}相关标签：</span>
                    {tags.slice(0, 8).map((t) => (
                      <button
                        key={t.tag}
                        type="button"
                        onClick={() => navigate({ view: 'keyword', tag: t.tag })}
                        className="dy-a"
                        style={{ border: `1px solid ${C.boxBorder}`, background: '#fff', borderRadius: 2, padding: '2px 8px', fontSize: 12, color: C.link, cursor: 'pointer' }}
                      >
                        {t.tag}
                      </button>
                    ))}
                  </p>
                )}
              </div>
            </div>
            <div style={{ clear: 'both' }} />
          </div>
        </div>

        {/* #list 章节块 */}
        <div className="dy-boxcon" style={{ border: `2px solid ${C.boxBorder}`, overflow: 'hidden' }}>
          <div style={{ padding: 2, overflow: 'hidden' }}>
            {/* dt《书名》最新章节(降级为当前页尾 12 条倒序, 头注声明) */}
            <dl style={{ margin: '0 0 10px', overflow: 'hidden' }}>
              <dt style={{ background: C.dtBg, display: 'block', fontSize: 14, lineHeight: '28px', overflow: 'hidden', textAlign: 'center', width: '98%', margin: '0 auto 5px', color: '#333' }}>
                《{book.name}》最新章节
              </dt>
              {latest12.map((c) => (
                <dd key={`new-${c.id}`} style={{ borderBottom: `1px dashed ${C.row}`, display: 'inline-block', width: '33%', minWidth: 200, height: 25, lineHeight: '200%', margin: 0, marginBottom: 5, overflow: 'hidden', textAlign: 'left', textIndent: 10, verticalAlign: 'middle', whiteSpace: 'nowrap', textOverflow: 'ellipsis', boxSizing: 'border-box' }}>
                  <button
                    type="button"
                    onClick={() => navigate({ view: 'read', chapterId: c.id })}
                    className="dy-dd"
                    style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', color: C.ddInk, fontSize: 12, textAlign: 'left', width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  >
                    {c.title}
                  </button>
                </dd>
              ))}
            </dl>

            {/* dt 正文/分卷章节列表 */}
            {vols ? (
              vols.map((g) => (
                <dl key={g.volume} style={{ margin: '0 0 10px', overflow: 'hidden' }}>
                  <dt style={{ background: C.dtBg, display: 'block', fontSize: 14, lineHeight: '28px', overflow: 'hidden', textAlign: 'center', width: '98%', margin: '0 auto 5px', color: '#333' }}>
                    {g.volume || '正文'}
                  </dt>
                  {g.chapters.map((c) => (
                    <dd key={c.id} style={{ borderBottom: `1px dashed ${C.row}`, display: 'inline-block', width: '33%', minWidth: 200, height: 25, lineHeight: '200%', margin: 0, marginBottom: 5, overflow: 'hidden', textAlign: 'left', textIndent: 10, whiteSpace: 'nowrap', textOverflow: 'ellipsis', boxSizing: 'border-box' }}>
                      <button
                        type="button"
                        onClick={() => navigate({ view: 'read', chapterId: c.id })}
                        className={`dy-dd${currentChapterId === c.id ? ' dy-cur' : ''}`}
                        style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', fontSize: 12, textAlign: 'left', width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      >
                        {c.title}
                      </button>
                    </dd>
                  ))}
                </dl>
              ))
            ) : (
              <dl style={{ margin: '0 0 10px', overflow: 'hidden' }}>
                <dt style={{ background: C.dtBg, display: 'block', fontSize: 14, lineHeight: '28px', overflow: 'hidden', textAlign: 'center', width: '98%', margin: '0 auto 5px', color: '#333' }}>
                  《{book.name}》正文
                </dt>
                {(mainChapters || []).map((c) => (
                  <dd key={c.id} style={{ borderBottom: `1px dashed ${C.row}`, display: 'inline-block', width: '33%', minWidth: 200, height: 25, lineHeight: '200%', margin: 0, marginBottom: 5, overflow: 'hidden', textAlign: 'left', textIndent: 10, whiteSpace: 'nowrap', textOverflow: 'ellipsis', boxSizing: 'border-box' }}>
                    <button
                      type="button"
                      onClick={() => navigate({ view: 'read', chapterId: c.id })}
                      className={`dy-dd${currentChapterId === c.id ? ' dy-cur' : ''}`}
                      style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', fontSize: 12, textAlign: 'left', width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {c.title}
                    </button>
                  </dd>
                ))}
              </dl>
            )}

            {/* .page 分页(真站全量单页 → 契约 100 章/页, 降级声明②) */}
            {tocTotalPages > 1 && (
              <div className="dy-pagebar" style={{ width: '100%', margin: '10px auto', overflow: 'hidden' }} aria-label="目录分页">
                {Array.from({ length: Math.min(tocTotalPages, 10) }).map((_, i) => {
                  const p = i + 1
                  return (
                    <button key={p} type="button" onClick={() => navigate({ view: 'book', bookId: book.id, page: p })} className="dy-pg" style={pgBtn(p === curPage)}>
                      {p}
                    </button>
                  )
                })}
                {curPage < tocTotalPages && (
                  <button type="button" onClick={() => navigate({ view: 'book', bookId: book.id, page: curPage + 1 })} className="dy-pg" style={pgBtn(false)}>
                    下一页
                  </button>
                )}
                <b style={{ float: 'none', display: 'inline-block', margin: '4px 0', padding: '4px 12px', color: '#888', fontSize: 12 }}>
                  共 {data?.tocTotal ?? chapters.length} 章
                </b>
              </div>
            )}
            {firstChapter && (
              <div style={{ textAlign: 'center', padding: '8px 0 4px' }}>
                <button
                  type="button"
                  onClick={() => navigate({ view: 'read', chapterId: firstChapter.id })}
                  className="dy-btn dy-btn-more"
                  style={{ display: 'inline-block', width: '90%', lineHeight: '42px', borderRadius: 6, fontSize: 16, color: '#EEE', background: C.boxBorder, border: 0, cursor: 'pointer', margin: '0 auto' }}
                >
                  开始阅读
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

