// ============================================================
// [R28-2f] kks101(101看書 101kks.com) 克隆首页 —— 复刻真站 https://101kks.com/
//   快照: /tmp/r28-2b/kks101/home.html(971 行) + style.css + block_booklist.css 全量。
//
//   真站结构(类名注释对应真站 DOM; 版心 .container max-width:1112px style.css L59-65):
//     ① .adbanner > .headerad 域名提示条(#fff2df 40px 16px 居中, style.css L3127-3133)
//     ② ul.row > li.col-xinindex > .mybox:
//        .xinlogo 站名大字(35px/weight550/居中, style.css L3304-3311)
//        .error-text.searchBox 大搜索框(输入 50px 圆角 25 + 右侧透明搜索钮, L3178-3209)
//        .indexdaohang 四枚主蓝导航砖(#1f6cb2 20% 50px radius10, L3313-3333):
//          我的書架/閱讀記錄/排行榜/完本小說
//        h3.mytitle「熱門書單推薦」 + .booklist-block > .booklist-grid 8 张書單卡
//          (block_booklist.css: 卡 128px 高/封面区 #667eea→#764ba2 渐变/L7-64)
//        .tag 热门标签胶囊墙(border #56a6c3 radius10 浅蓝底主蓝字, style.css L3289-3300)
//     ③ .foot — 公共壳 SiteFooter 已统一渲染 → 模板不重复
//   真站首頁主體為「書單+標籤」落地頁, 无书籍列表板块。
//
//   降级/推断说明:
//   ① .headerad 文案按快照原文照录(「請技術我們的域名：101kks.com」, 原站即如此);
//      广告实质 → 仅保留提示条形态
//   ②「熱門書單推薦」書單聚合数据(書單名/收錄数/創建者/三封面疊加/.cover-count)
//      契约无数据源 → 以最新书籍单封面卡近似復刻書單卡形態, meta 三项换真实数据
//      (字數/分類/作者), 封面叠加与「+N」角标不渲染
//   ③ .indexdaohang「我的書架」为会员功能(bookcase.php)无公共视图 → 按钮保留真站文案
//      置 disabled;「閱讀記錄」→ 内置 history 视图
//   ④ 真站首頁無书籍列表 → 契约 48 本最新书以真站 /last 页「最近更新」
//      (.recentupdate2 行式: 书名 40% / 最新章 60% / 日期 #999 右对齐, style.css L1625-1641)
//      板块承载, 板块名沿用真站「最近更新」(推断级)
//   ⑤ 标签墙真站为运营固定词表(/newtag/ 链接 90 个) → 以 fetchSuggestTags 词池替代,
//      点击走站内 keyword 视图(近似)
//   ⑥ 繁简切换 .lang(zh_tran) 与左侧滑出菜单(会员登录)契约无对应 → 由公共壳统一头部承担,
//      模板内不复刻(降级)
// ============================================================
'use client'

import { useEffect, useState } from 'react'
import type { SiteHomeProps } from '../shared'
import { usePublic } from '../../ctx'
import { fetchSuggestTags } from '../../data'
import { BookCover } from '../../BookCover'
import { Sk } from '../../bits'
import { fmtDate } from '../../seo'
import type { BookItem } from '../../types'
import { K, KContainer, cardStyle, MyTitle } from './parts'

type Nav = ReturnType<typeof usePublic>['navigate']

/** [R28-2f-12] 域名提示条(真站 .headerad, style.css L3127-3133) */
function HeaderAd() {
  return (
    <div className="kkx-headerad" style={{ textAlign: 'center', height: 40, lineHeight: '40px', fontSize: 16, background: K.adStrip, color: K.ink }}>
      請技術我們的域名：101kks.com
    </div>
  )
}

/** [R28-2f-13] 首页大搜索框(真站 .error-text.searchBox, style.css L3178-3209; home.html L100-111) */
function HomeSearch({ navigate }: { navigate: Nav }) {
  const [q, setQ] = useState('')
  const submit = () => {
    const t = q.trim()
    if (t) navigate({ view: 'search', q: t })
  }
  return (
    <form
      className="kkx-searchbox"
      style={{ position: 'relative', maxWidth: 600, margin: '5% auto 10px' }}
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="搜索小說"
        placeholder="請輸入搜索內容！"
        className="kkx-searchinput"
        style={{
          border: '1px solid #eef0f4',
          color: '#444444',
          padding: '0 48px 0 17px',
          height: 50,
          lineHeight: '50px',
          width: '100%',
          borderRadius: 25,
          outline: 'none',
          marginBottom: 30,
          fontSize: 16,
          background: '#ffffff',
          boxShadow: '0 4px 20px rgba(0,25,104,.05)',
        }}
      />
      <button
        type="submit"
        aria-label="搜索"
        className="kkx-searchbtn"
        style={{
          background: 'transparent',
          border: 'none',
          color: '#666666',
          padding: 0,
          width: 48,
          height: 48,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'absolute',
          right: 0,
          top: 1,
          zIndex: 10,
          cursor: 'pointer',
          borderTopRightRadius: 25,
          borderBottomRightRadius: 25,
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
          <path d="M16.5 16.5 21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
    </form>
  )
}

/**
 * [R28-2f-14] 書單卡(真站 .booklist-card: 左渐变封面区 120px + 右信息区,
 * block_booklist.css L29-64/L165-215; 降级为单封面书籍卡, 见文件头说明②)
 */
function BooklistCard({ book, navigate }: { book: BookItem; navigate: Nav }) {
  return (
    <div className="kkx-blcard" style={{ background: '#fff', borderRadius: 10, boxShadow: '0 2px 10px rgba(0,0,0,0.08)', border: '1px solid rgba(0,0,0,0.06)', height: 128, overflow: 'hidden' }}>
      <button
        type="button"
        onClick={() => navigate({ view: 'book', bookId: book.id })}
        aria-label={`查看 ${book.name}`}
        className="kkx-blcard-link"
        style={{ display: 'flex', width: '100%', height: '100%', background: 'none', border: 0, padding: 0, cursor: 'pointer', textAlign: 'left' }}
      >
        <span className="kkx-blcover" style={{ flex: '0 0 120px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
          <span className="kkx-blcovermain" style={{ width: 50, height: 70, background: 'rgba(255,255,255,0.9)', borderRadius: 3, display: 'flex', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
            <BookCover name={book.name} cover={book.cover} style={{ width: '100%', height: '100%', borderRadius: 0 }} />
          </span>
        </span>
        <span style={{ flex: 1, minWidth: 0, padding: '12px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <span className="kkx-bltitle" style={{ fontSize: 14, fontWeight: 600, color: '#2c3e50', lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {book.name}
          </span>
          <span className="kkx-blmeta" style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '8px 0', fontSize: 12, color: '#7f8c8d', flexWrap: 'wrap' }}>
            <span className="kkx-blmeta-item" style={{ display: 'flex', alignItems: 'center', gap: 3 }}>{fmtWords(book.wordCount)}</span>
            <span className="kkx-blmeta-item" style={{ display: 'flex', alignItems: 'center', gap: 3 }}>{book.category}</span>
            <span className="kkx-blmeta-item" style={{ display: 'flex', alignItems: 'center', gap: 3 }}>{book.author}</span>
          </span>
          <span className="kkx-bldesc" style={{ fontSize: 11, color: '#7f8c8d', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {book.intro || '這個書單還沒有簡介...'}
          </span>
        </span>
      </button>
    </div>
  )
}

/** [R28-2f-15] 字数缩写(真站書單 meta 数字形态近似; 复用 formatWords 万位缩写) */
function fmtWords(n?: number | null): string {
  if (!n || n <= 0) return '0字'
  if (n >= 10000) {
    const w = n / 10000
    return `${w >= 100 ? Math.round(w) : Number(w.toFixed(1))}萬`
  }
  return `${n}字`
}

/** [R28-2f-16] 导航砖(真站 .indexdaohang li: #1f6cb2 50px 圆角10, style.css L3313-3333) */
function DaoTile({ label, onClick, disabled }: { label: string; onClick?: () => void; disabled?: boolean }) {
  return (
    <li style={{ background: K.primary, width: '20%', minWidth: 150, height: 50, display: 'inline-block', borderRadius: 10, lineHeight: '50px', margin: '0.5rem' }}>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        title={disabled ? '會員功能(書架)暫不開放' : undefined}
        style={{ display: 'block', width: '100%', height: '100%', background: 'none', border: 0, cursor: disabled ? 'default' : 'pointer', padding: 0 }}
      >
        <span style={{ fontSize: 16, color: disabled ? 'rgba(246,246,246,.6)' : '#f6f6f6', fontWeight: 500 }}>{label}</span>
      </button>
    </li>
  )
}

/** [R28-2f-17] 最近更新行(真站 /last .recentupdate2 li, style.css L1625-1641; last.html L98-102) */
function LastRow({ book, navigate }: { book: BookItem; navigate: Nav }) {
  return (
    <li style={{ display: 'flex', borderBottom: `1px solid ${K.line}`, padding: '15px 0', flexWrap: 'wrap', fontSize: 15, alignItems: 'baseline', gap: 8 }}>
      <button
        type="button"
        onClick={() => navigate({ view: 'book', bookId: book.id })}
        className="kkx-ru-name"
        style={{ width: 'calc(40% - 50px)', paddingRight: 10, background: 'none', border: 0, padding: 0, cursor: 'pointer', fontSize: 15, color: K.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'left' }}
      >
        {book.name}
      </button>
      <button
        type="button"
        onClick={() => navigate({ view: 'toc', bookId: book.id })}
        className="kkx-ru-chap"
        style={{ width: 'calc(60% - 100px)', paddingRight: 10, background: 'none', border: 0, padding: 0, cursor: 'pointer', fontSize: 15, color: K.link, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'left' }}
      >
        {book.latestChapter || '暫無章節'}
      </button>
      <span style={{ width: 100, color: K.dim, textAlign: 'right', flexShrink: 0 }}>{fmtDate(book.updatedAt) || '--'}</span>
    </li>
  )
}

export function Kks101Home({ books, loading }: SiteHomeProps) {
  const { site, navigate } = usePublic()
  const [tags, setTags] = useState<string[]>([])

  // [R28-2f-18] 热门标签墙数据(真站为固定运营词表, 以词池近似, 见降级说明⑤)
  useEffect(() => {
    let alive = true
    fetchSuggestTags()
      .then((e) => {
        if (alive) setTags(e?.tags?.slice(0, 60) || [])
      })
      .catch(() => {
        /* 词池失败静默(辅助板块) */
      })
    return () => {
      alive = false
    }
  }, [])

  const recommend = books.slice(0, 8)
  const latest = books.slice(8, 40)

  return (
    <KContainer>
      {/* ① .adbanner > .headerad */}
      <HeaderAd />
      {/* ② li.col-xinindex > .mybox */}
      <div className="kkx-mybox" style={cardStyle}>
        {/* .xinlogo */}
        <div className="kkx-xinlogo" style={{ maxWidth: 300, fontSize: 35, margin: '40px auto', fontWeight: 550, textAlign: 'center', color: K.ink }}>
          {site.name || '101看書'}
        </div>
        {/* .error-text.searchBox */}
        <HomeSearch navigate={navigate} />
        {/* .indexdaohang */}
        <ul className="kkx-daohang" style={{ textAlign: 'center', marginBottom: 20, listStyle: 'none', margin: '0 0 20px', padding: 0 }}>
          <DaoTile label="我的書架" disabled />
          <DaoTile label="閱讀記錄" onClick={() => navigate({ view: 'history' })} />
          <DaoTile label="排行榜" onClick={() => navigate({ view: 'ranking' })} />
          <DaoTile label="完本小說" onClick={() => navigate({ view: 'fulltext' })} />
        </ul>
        {/* h3.mytitle「熱門書單推薦」 + .booklist-block */}
        <MyTitle>熱門書單推薦</MyTitle>
        {loading ? (
          <div role="status" aria-label="熱門書單加載中">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <Sk key={i} className="h-32 w-full" style={{ borderRadius: 10 }} />
              ))}
            </div>
          </div>
        ) : recommend.length === 0 ? (
          <Sk className="h-32 w-full" style={{ borderRadius: 10 }} />
        ) : (
          <div className="kkx-blblock">
            <div className="kkx-blgrid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12, padding: 0, margin: 0 }}>
              {recommend.map((b) => (
                <BooklistCard key={b.id} book={b} navigate={navigate} />
              ))}
            </div>
          </div>
        )}
        {/* .tag 标签墙(真站 mytitle 为空 h3 + 胶囊 ul, home.html L669-897) */}
        <div className="kkx-tagwrap">
          <h3 className="kkx-mytitle" style={{ margin: '10px 0', borderBottom: `1px solid ${K.cardLine}`, paddingBottom: 5, fontSize: 16 }} aria-hidden />
          <ul className="kkx-tagul" style={{ listStyle: 'none', margin: 0, padding: 0, textAlign: 'justify' }}>
            {tags.map((t) => (
              <li key={t} style={{ display: 'inline-block', listStyle: 'none' }}>
                <button
                  type="button"
                  onClick={() => navigate({ view: 'keyword', tag: t })}
                  className="kkx-taga"
                  style={{
                    fontSize: '0.8rem',
                    lineHeight: '1.8rem',
                    display: 'inline-block',
                    padding: '0 0.725rem',
                    textAlign: 'center',
                    border: `1px solid ${K.chipLine}`,
                    borderRadius: 10,
                    margin: '0.5rem',
                    background: K.chipBg,
                    color: K.chipText,
                    cursor: 'pointer',
                  }}
                >
                  {t}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
      {/* ④「最近更新」(真站 /last 板块复用, 推断级见说明④) */}
      <div className="kkx-mybox" style={{ ...cardStyle, margin: '0 0 24px' }}>
        <MyTitle>最近更新</MyTitle>
        {loading ? (
          <div role="status" aria-label="最近更新加載中">
            {Array.from({ length: 6 }).map((_, i) => (
              <Sk key={i} className="h-10 w-full" style={{ borderRadius: 3, marginBottom: 8 }} />
            ))}
          </div>
        ) : latest.length === 0 ? (
          <Sk className="h-10 w-full" style={{ borderRadius: 3 }} />
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {latest.map((b) => (
              <LastRow key={b.id} book={b} navigate={navigate} />
            ))}
          </ul>
        )}
      </div>
    </KContainer>
  )
}

