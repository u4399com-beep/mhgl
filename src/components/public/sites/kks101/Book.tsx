// ============================================================
// [R28-2f] kks101 克隆书页 —— 复刻真站 /book/{id}.html
//   快照: /tmp/r28-2b/kks101/book.html(695 行) + style.css。
//
//   真站结构(container > ul.row = col-8 主列 66% + col-4 侧栏 32%, book.html L110-622):
//     主列 .mybox ①: h3.mytitle > .bread 面包屑(首頁>分類>書名, 链接主蓝)
//       .bookbox: .bookimg2 封面 180×240(阴影, .status0 連載角标) + .booknav2
//         (h1 24px + p 作者/分類/字數|連載 + p 更新 + .btn-urge 催更胶囊)
//       .addbtn 四钮: 開始閱讀/加入書架/進入書籤(隐藏)/投推薦票(btn 主蓝 radius5 lh36)
//     主列 .mybox ②: .infotag(h3.tagtitle 標籤 + .tagul 胶囊) + ul.tabs(目錄/簡介/書評)
//       + #tab_chapters ul.qustime 最近 6 章(16px #222 底线行 + small 日期)
//       + #tab_info ul.infolist(字數/章節數 大数字灰底块) + .navtxt p 简介行高35
//       + a.btn.more-btn 完整目錄
//     侧栏 .mybox: h3「本周最強」+ ul.tabs.tabshot(熱門/完本) + .ranking 列表
//       (li: rank_left h3.ranktit 序号徽章 + 激活首项 h4 红字/p 分类.作者; rank_right
//        激活首项 imgbox2 封面 + span 連載/全本, style.css L1495-1593)
//
//   降级/推断说明:
//   ① 封面上「推薦票」黑色浮层(book.html L125-128)为投票数据 → 契约无来源, 不渲染
//   ② .addbtn 仅保留「開始閱讀」(真站指向 /book/{id}/index.html 目录页 → 本站 toc 视图);
//      加入書架(addbookcase 会员态)/進入書籤/投推薦票(do_vote)无契约 → 不渲染
//   ③ .btn-urge「催更」为登录后留言功能 → 不渲染; 更新日期 BookDetail 无 updatedAt
//      字段可显示时不渲染该行
//   ④ .qustime「最近章節」带更新日期(TocChapter 无日期) → 仅列章名; 且契约目录按页
//      取回(首页 1-100)拿不到末章 → 以目录页前 6 章呈现(推断级)
//   ⑤ tabs 書評頁签(review-panel/comment-list)无评论数据契约 → 整个頁签省略,
//      仅保留 目錄/簡介 两頁签
//   ⑥ 侧栏「本周最強」: 熱門頁签以最近更新榜近似(words/人气无来源)、完本頁签以
//      status=completed 过滤近似; 榜首徽章 NO.1 + 红字 h4 按真站结构复刻
// ============================================================
'use client'

import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import type { SiteBookProps } from '../shared'
import { usePublic } from '../../ctx'
import { fetchBooks } from '../../data'
import { BookCover } from '../../BookCover'
import { ErrorState, EmptyState, Sk } from '../../bits'
import { formatWords } from '../../seo'
import type { BookItem } from '../../types'
import { K, cardStyle, MyTitle, Bread, kkStatus } from './parts'

type Nav = ReturnType<typeof usePublic>['navigate']

/** [R28-2f-19] 主蓝方钮(真站 .addbtn .btn: 主蓝 radius5 lh36 16px, style.css L661-667) */
function BigBtn({ label, onClick, disabled }: { label: string; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="kkx-btn"
      style={{
        lineHeight: '36px',
        padding: '0 15px',
        fontSize: 16,
        borderRadius: 5,
        border: 0,
        cursor: disabled ? 'default' : 'pointer',
        color: '#fff',
        background: K.primary,
        marginRight: 6,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {label}
    </button>
  )
}

/**
 * [R28-2f-20] 本周最強列表项(真站 .ranking li: a flex 上下底线, 序号徽章 #eee 圆角2,
 * 激活首项展开 h4 红字 + p 灰字 + 右侧封面 80×105, style.css L1495-1593)
 */
function RankLi({ book, i, active, navigate }: { book: BookItem; i: number; active: boolean; navigate: Nav }) {
  return (
    <li className={active ? 'is-active' : undefined} style={{ borderBottom: `1px solid ${K.line}` }}>
      <button
        type="button"
        onClick={() => navigate({ view: 'book', bookId: book.id })}
        className="kkx-rank-a"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'none', border: 0, padding: '11px 0', cursor: 'pointer', textAlign: 'left' }}
      >
        <span className="kkx-rank-left" style={{ width: '75%' }}>
          <span className="kkx-rank-tit" style={{ display: 'flex', alignItems: 'center', fontSize: 15, fontWeight: 500, color: active ? K.dark : K.ink, paddingBottom: active ? 5 : 0, minWidth: 0 }}>
            <span
              className="kkx-rank-no"
              style={{
                display: active ? 'block' : 'inline-block',
                borderRadius: 2,
                fontSize: 14,
                textAlign: 'center',
                padding: '0 5px',
                marginRight: 10,
                width: active ? 48 : undefined,
                marginBottom: active ? 8 : 0,
                flexShrink: 0,
                ...(i === 0
                  ? { background: K.red, color: '#fff' }
                  : i === 1
                    ? { background: K.orange, color: '#fff' }
                    : i === 2
                      ? { background: K.yellow, color: '#fff' }
                      : { background: K.bg, color: K.ink }),
              }}
            >
              {active ? `NO.${i + 1}` : i + 1}
            </span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{book.name}</span>
          </span>
          {active ? (
            <>
              <span className="kkx-rank-h4" style={{ display: 'block', color: 'red', paddingBottom: 10, fontSize: 14 }}>本周最強</span>
              <span style={{ display: 'block', color: K.dim, fontSize: 14 }}>{book.category}.{book.author}</span>
            </>
          ) : null}
        </span>
        <span className="kkx-rank-right" style={{ width: '23%', textAlign: 'right', maxWidth: 120 }}>
          {active ? (
            <span className="kkx-rank-img" style={{ display: 'block', width: 80, height: 105, margin: '0 auto', overflow: 'hidden', boxShadow: '0 1px 3px rgb(0 0 0 / 30%)' }}>
              <BookCover name={book.name} cover={book.cover} style={{ width: '100%', height: '100%', borderRadius: 0 }} />
            </span>
          ) : (
            <span style={{ color: K.dim, fontSize: 14 }}>{kkStatus(book)}</span>
          )}
        </span>
      </button>
    </li>
  )
}

export function Kks101Book({ data, loading, error }: SiteBookProps) {
  const { navigate } = usePublic()
  const [tab, setTab] = useState<'chapters' | 'info'>('chapters')
  const [sideTab, setSideTab] = useState<'hot' | 'full'>('hot')
  const [hot, setHot] = useState<BookItem[]>([])
  const [full, setFull] = useState<BookItem[]>([])

  const book = data?.book ?? null
  const chapters = data?.chapters ?? []
  const tags = data?.tags ?? []

  // [R28-2f-21] 侧栏双榜数据(熱門=最近更新榜近似 / 完本=completed 过滤, 见说明⑥)
  useEffect(() => {
    let alive = true
    fetchBooks({ sort: 'latest', page: 1, size: 14 }).then((d) => alive && setHot(d.books)).catch(() => {})
    fetchBooks({ status: 'completed', page: 1, size: 14 }).then((d) => alive && setFull(d.books)).catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  if (error) {
    return (
      <div className="kkx-container" style={{ maxWidth: 1112, margin: '0 auto', width: '100%' }}>
        <div className="kkx-mybox" style={cardStyle}>
          <ErrorState message="書籍詳情加載失敗" detail={error} />
        </div>
      </div>
    )
  }
  if (loading || !book) {
    return (
      <div className="kkx-container" style={{ maxWidth: 1112, margin: '0 auto', width: '100%' }}>
        <div className="kkx-mybox" style={cardStyle} role="status" aria-label="書籍詳情加載中">
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            <Sk className="kkx-skb" style={{ width: 180, height: 240, borderRadius: 3 }} />
            <div style={{ flex: 1, minWidth: 240 }}>
              <Sk className="h-7 w-2/3" style={{ borderRadius: 3, marginBottom: 12 }} />
              <Sk className="h-4 w-1/3" style={{ borderRadius: 3, marginBottom: 8 }} />
              <Sk className="h-4 w-1/4" style={{ borderRadius: 3 }} />
            </div>
          </div>
        </div>
      </div>
    )
  }

  const sideBooks = sideTab === 'hot' ? hot : full

  const headBtn: CSSProperties = { background: 'none', border: 0, padding: 0, cursor: 'pointer', color: K.primary, fontSize: 14 }

  return (
    <div className="kkx-container" style={{ maxWidth: 1112, margin: '0 auto', width: '100%' }}>
      <ul className="kkx-bookrow" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexWrap: 'wrap', gap: '2%', alignItems: 'flex-start' }}>
        {/* li.col-8 主列 */}
        <li style={{ width: '66%', minWidth: 0 }}>
          {/* .mybox ① 书籍信息卡 */}
          <div className="kkx-mybox" style={cardStyle}>
            <MyTitle>
              <Bread
                items={[
                  { label: '首頁', onClick: () => navigate({ view: 'home' }) },
                  { label: book.category, onClick: () => navigate({ view: 'category', cat: book.categoryId || undefined }) },
                  { label: book.name },
                ]}
              />
            </MyTitle>
            <div className="kkx-bookbox" style={{ padding: 10, display: 'flex', flexWrap: 'wrap', gap: 16 }}>
              <div className="kkx-bookimg2" style={{ width: 180, height: 240, flexShrink: 0, boxShadow: '0 1px 3px rgb(0 0 0 / 30%)', position: 'relative' }}>
                <BookCover name={book.name} cover={book.cover} style={{ width: '100%', height: '100%', borderRadius: 0 }} />
                <span
                  className="kkx-status-badge"
                  style={{
                    position: 'absolute',
                    top: 8,
                    left: 0,
                    background: book.status === 'completed' ? 'rgba(198,15,19,.92)' : 'rgba(31,108,178,.92)',
                    color: '#fff',
                    fontSize: 12,
                    padding: '2px 8px',
                    borderRadius: '0 3px 3px 0',
                  }}
                >
                  {kkStatus(book)}
                </span>
              </div>
              <div className="kkx-booknav2" style={{ flex: 1, minWidth: 220 }}>
                <h1 style={{ fontSize: 24, lineHeight: 1.3, margin: '0 0 10px', color: K.ink, overflowWrap: 'anywhere' }}>{book.name}</h1>
                <p style={{ fontSize: 15, padding: '5px 0', color: K.muted, margin: 0 }}>作者：{book.author}</p>
                <p style={{ fontSize: 15, padding: '5px 0', color: K.muted, margin: 0 }}>
                  分類：
                  <button type="button" onClick={() => navigate({ view: 'category', cat: book.categoryId || undefined })} className="kkx-bread-a" style={headBtn}>
                    {book.category}
                  </button>
                </p>
                <p style={{ fontSize: 15, padding: '5px 0', color: K.muted, margin: 0 }}>
                  {formatWords(book.wordCount)} | {kkStatus(book)}
                </p>
                <div className="kkx-addbtn" style={{ display: 'flex', paddingTop: 10, flexWrap: 'wrap' }}>
                  <BigBtn label="開始閱讀" onClick={() => navigate({ view: 'toc', bookId: book.id })} />
                </div>
              </div>
            </div>
          </div>

          {/* .mybox ② 標籤 + 目錄/簡介 頁签卡 */}
          <div className="kkx-mybox" style={{ ...cardStyle, marginTop: 0 }}>
            <div className="kkx-infotag" style={{ paddingBottom: 5, display: tags.length ? undefined : 'none' }}>
              <h3 className="kkx-tagtitle" style={{ margin: '10px 5px', float: 'left', fontSize: 16 }}>標籤</h3>
              <ul className="kkx-tagul" style={{ listStyle: 'none', margin: 0, padding: 0, overflow: 'hidden' }}>
                {tags.slice(0, 12).map((t) => (
                  <li key={t.tag} style={{ display: 'inline-block' }}>
                    <button
                      type="button"
                      onClick={() => navigate({ view: 'keyword', tag: t.tag })}
                      className="kkx-taga"
                      style={{ fontSize: '0.8rem', lineHeight: '1.8rem', display: 'inline-block', padding: '0 0.5rem', border: `1px solid ${K.chipLine}`, borderRadius: 10, margin: '0.3rem', background: K.chipBg, color: K.chipText, cursor: 'pointer' }}
                    >
                      {t.tag}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <ul className="kkx-tabs" style={{ display: 'flex', borderBottom: `1px solid ${K.line}`, marginBottom: 10, listStyle: 'none', margin: 0, padding: 0 }}>
              {(
                [
                  ['chapters', '目錄'],
                  ['info', '簡介'],
                ] as const
              ).map(([key, label]) => (
                <li key={key} style={{ width: '33.33%', marginBottom: -1 }}>
                  <button
                    type="button"
                    onClick={() => setTab(key)}
                    className={`kkx-tab-a${tab === key ? ' is-active' : ''}`}
                    style={{
                      display: 'flex',
                      width: '100%',
                      padding: '4px 4px 8px',
                      fontSize: 16,
                      justifyContent: 'center',
                      alignItems: 'center',
                      background: 'none',
                      border: 0,
                      borderBottom: tab === key ? `2px solid ${K.primary}` : '2px solid transparent',
                      borderRadius: '8px 8px 0 0',
                      cursor: 'pointer',
                      color: tab === key ? K.primary : K.ink,
                    }}
                  >
                    {label}
                  </button>
                </li>
              ))}
            </ul>
            {tab === 'chapters' ? (
              <div>
                <ul className="kkx-qustime" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {chapters.slice(0, 6).map((c) => (
                    <li key={c.id} style={{ margin: '0 5px' }}>
                      <button
                        type="button"
                        onClick={() => navigate({ view: 'read', bookId: book.id, chapterId: c.id })}
                        className="kkx-qustime-a"
                        style={{ display: 'flex', justifyContent: 'space-between', width: '100%', borderBottom: `1px solid ${K.cardLine}`, color: K.dark, padding: '15px 0', fontSize: 16, background: 'none', border: 0, borderBottomStyle: 'solid', cursor: 'pointer', textAlign: 'left', gap: 10 }}
                      >
                        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</span>
                      </button>
                    </li>
                  ))}
                </ul>
                {chapters.length === 0 ? <EmptyState text="暫無章節" /> : null}
              </div>
            ) : (
              <div>
                <ul className="kkx-infolist" style={{ padding: '10px 0', background: '#f4f4f4', borderRadius: 8, display: 'flex', marginTop: 20, listStyle: 'none', margin: '20px 0 0' }}>
                  <li style={{ width: '50%', textAlign: 'center', fontSize: 18, fontWeight: 700, lineHeight: '18px' }}>
                    {formatWords(book.wordCount)}
                    <span style={{ display: 'block', fontSize: 12, fontWeight: 300 }}>字數</span>
                  </li>
                  <li style={{ width: '50%', textAlign: 'center', fontSize: 18, fontWeight: 700, lineHeight: '18px' }}>
                    {data?.tocTotal ?? 0}
                    <span style={{ display: 'block', fontSize: 12, fontWeight: 300 }}>章節數</span>
                  </li>
                </ul>
                <div className="kkx-navtxt" style={{ marginTop: 10 }}>
                  <p style={{ color: K.ink, fontSize: 16, lineHeight: '35px', padding: '10px 0', margin: 0 }}>{book.intro || '暫無簡介'}</p>
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={() => navigate({ view: 'toc', bookId: book.id })}
              className="kkx-btn kkx-more-btn"
              style={{ margin: '15px auto 0', display: 'block', width: 'max-content', padding: '6px 12px', fontSize: 13, borderRadius: 4, border: 0, background: K.primary, color: '#fff', cursor: 'pointer' }}
            >
              完整目錄
            </button>
          </div>
        </li>

        {/* li.col-4 侧栏: 本周最強 */}
        <li className="kkx-sidecol" style={{ width: '32%', minWidth: 0 }}>
          <div className="kkx-mybox" style={cardStyle}>
            <MyTitle>本周最強</MyTitle>
            <ul className="kkx-tabs" style={{ display: 'flex', borderBottom: `1px solid ${K.line}`, listStyle: 'none', margin: '0 0 10px', padding: 0 }}>
              {(
                [
                  ['hot', '熱門'],
                  ['full', '完本'],
                ] as const
              ).map(([key, label]) => (
                <li key={key} style={{ width: '50%', marginBottom: -1 }}>
                  <button
                    type="button"
                    onClick={() => setSideTab(key)}
                    className={`kkx-tab-a${sideTab === key ? ' is-active' : ''}`}
                    style={{
                      display: 'flex',
                      width: '100%',
                      padding: '4px 4px 8px',
                      fontSize: 16,
                      justifyContent: 'center',
                      alignItems: 'center',
                      gap: 4,
                      background: 'none',
                      border: 0,
                      borderBottom: sideTab === key ? `2px solid ${K.primary}` : '2px solid transparent',
                      cursor: 'pointer',
                      color: sideTab === key ? K.primary : K.ink,
                    }}
                  >
                    <span aria-hidden style={{ color: 'red', fontSize: 14 }}>🔥</span>
                    {label}
                  </button>
                </li>
              ))}
            </ul>
            <ul className="kkx-ranking" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {sideBooks.length === 0
                ? Array.from({ length: 6 }).map((_, i) => (
                    <li key={i} style={{ borderBottom: `1px solid ${K.line}`, padding: '11px 0' }}>
                      <Sk className="h-5 w-full" style={{ borderRadius: 2 }} />
                    </li>
                  ))
                : sideBooks.map((b, i) => (
                    <RankLi key={b.id} book={b} i={i} active={i === 0} navigate={navigate} />
                  ))}
            </ul>
          </div>
        </li>
      </ul>
    </div>
  )
}

