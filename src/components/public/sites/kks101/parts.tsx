// ============================================================
// [R28-2f] kks101(101看書 101kks.com) 克隆共享部件 —— 快照 /tmp/r28-2b/kks101/ 实证复用件
//   色板/卡片/标题条/列表行(#article_list_content)/封面卡(newnovels)/分类 droplist/
//   分页(.pagelink) 等多页型共用元素集中在此, 色值出处见各处注释(style.css 行号)。
// ============================================================
'use client'

import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { usePublic } from '../../ctx'
import { fetchCategories } from '../../data'
import { BookCover } from '../../BookCover'
import type { BookItem, CategoryItem } from '../../types'

// [R28-2f-1] 真站 /css/style.css 实测色板(行号为 style.css 内出处)
export const K = {
  bg: '#f2f3f4', // body background(L13)
  ink: '#333', // body color(L14)
  link: '#666', // a 基色(L30)
  linkHover: '#06c', // a:hover(L40)
  primary: '#1f6cb2', // header/按钮/tabs 激活/面包屑主蓝(L72 L206 L264 L428 L580 L827)
  card: '#fff', // .mybox 卡底(L171)
  cardShadow: '0 1px 3px rgba(0,0,0,.12), 0 1px 2px rgba(0,0,0,.24)', // .mybox(L166-167)
  cardLine: 'rgba(150,150,150,.2)', // .mytitle/.qustime/.catalog 下划线(L187 L727 L2038)
  line: '#eee', // .tabs/.ranking/.newbox 分隔线(L220 L1499 L1763)
  muted: '#757575', // 书页 meta/简介计数(L301 L418 L539 L641)
  dim: '#999', // labelbox 标签/status 文字(L1549 L1811)
  dark: '#222', // 目录/最近更新行文字(L729 L2040)
  black: '#000', // newbox h3 标题(L1790)
  hot: '#c60f13', // .hottext/.xin 红(L2446 L2450)
  red: 'red', // .btn-tp/榜单第 1 名徽章(L1877 L1581)
  orange: 'rgb(255,111,0)', // 榜单第 2 名徽章(L1586 L1893)
  yellow: 'rgb(222,204,1)', // 榜单第 3 名徽章(L1591 L1898)
  chipBg: 'rgb(232,244,255)', // .weekl_yrank/.tag/.listbox 浅蓝底(L1904 L2688 L3280)
  chipLine: '#56a6c3', // 标签胶囊边(L1903 L3277 L3295)
  chipText: '#1f6cb2', // 标签胶囊文字(L1933 L3281)
  night: 'rgb(32,40,46)', // 黑夜模式 .black .mybox(L2098)
  nightText: 'rgb(153,153,153)', // 黑夜模式文字(L2103)
  adStrip: '#fff2df', // .headerad 域名提示条(L3132)
} as const

/** [R28-2f-2] 版心(真站 .container: max-width 1112px, L59-65) */
export function KContainer({ children, pad }: { children: React.ReactNode; pad?: string }) {
  return (
    <div className="kkx-container" style={{ maxWidth: 1112, margin: '0 auto', width: '100%', padding: pad ?? '0 0 24px' }}>
      {children}
    </div>
  )
}

/** [R28-2f-3] 白卡(真站 .mybox: shadow/radius3/padding16/margin24, L164-174) */
export const cardStyle: CSSProperties = {
  background: K.card,
  boxShadow: K.cardShadow,
  borderRadius: 3,
  padding: 16,
  margin: '24px 0',
}

/** [R28-2f-4] 标题条(真站 .mytitle: 16px + 底线 rgba(150,150,150,.2), L185-190) */
export function MyTitle({ children, extra }: { children: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <h3
      className="kkx-mytitle"
      style={{
        margin: '0 0 10px',
        paddingBottom: 5,
        borderBottom: `1px solid ${K.cardLine}`,
        fontSize: 16,
        fontWeight: 700,
        color: K.ink,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        flexWrap: 'wrap',
      }}
    >
      <span style={{ minWidth: 0 }}>{children}</span>
      {extra}
    </h3>
  )
}

/** [R28-2f-5] 状态字(真站行内 label: 連載/全本, class.html L249/Book 侧栏 L276) */
export function kkStatus(b: { status?: BookItem['status'] }): string {
  return b.status === 'completed' ? '全本' : '連載'
}

/** [R28-2f-6] 面包屑(真站 .bread: 14px, 链接主蓝, style.css L574-581) */
export function Bread({ items }: { items: { label: string; onClick?: () => void }[] }) {
  return (
    <div style={{ fontSize: 14, fontWeight: 400, color: K.ink, lineHeight: 1.6, overflowWrap: 'anywhere' }}>
      {items.map((it, i) => (
        <span key={`${it.label}-${i}`}>
          {it.onClick ? (
            <button
              type="button"
              onClick={it.onClick}
              className="kkx-bread-a"
              style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', fontSize: 14, color: K.primary }}
            >
              {it.label}
            </button>
          ) : (
            <span>{it.label}</span>
          )}
          {i < items.length - 1 ? <span> &gt; </span> : null}
        </span>
      ))}
    </div>
  )
}

/** [R28-2f-7] 分类 droplist hook(class.html/full.html/hot.html 共用 .droplist 数据源) */
export function useCategories(): CategoryItem[] {
  const [cats, setCats] = useState<CategoryItem[]>([])
  useEffect(() => {
    let alive = true
    fetchCategories().then((cs) => {
      if (alive) setCats(cs || [])
    }).catch(() => {
      /* 分类拉取失败静默(分类胶囊为辅助导航) */
    })
    return () => {
      alive = false
    }
  }, [])
  return cats
}

type Nav = ReturnType<typeof usePublic>['navigate']

/** [R28-2f-8] 分类胶囊条(真站 .weekl_yrank > ul.droplist: 浅蓝底 #56a6c3 边框盒, class.html L97-123 + style.css L1902-1941) */
export function CatDroplist({
  activeName,
  onPick,
  cats,
}: {
  activeName: string
  onPick: (c: CategoryItem) => void
  cats: CategoryItem[]
}) {
  return (
    <div
      className="kkx-droplist"
      style={{
        border: `1px solid ${K.chipLine}`,
        background: K.chipBg,
        borderRadius: 5,
        padding: 15,
        marginBottom: 15,
        textAlign: 'center',
      }}
    >
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, fontSize: 0 }}>
        {[{ id: '', name: '全部分類' } as CategoryItem, ...cats].map((c) => {
          const on = !c.id && activeName === '全部分類' ? true : c.id === activeName
          return (
            <li key={c.id || 'all'} style={{ display: 'inline-block', fontSize: 14 }}>
              <button
                type="button"
                onClick={() => onPick(c)}
                className={`kkx-droplist-a${on ? ' is-active' : ''}`}
                style={{
                  background: 'none',
                  border: 0,
                  borderRight: `1px solid #dfecf0`,
                  padding: '0 10px 0 0',
                  margin: '0 10px 0 0',
                  cursor: 'pointer',
                  lineHeight: '16px',
                  fontSize: on ? 15 : 14,
                  fontWeight: on ? 700 : 400,
                  color: on ? '#404040' : K.chipText,
                }}
              >
                {c.name}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/**
 * [R28-2f-9] 列表行(真站 #article_list_content li: 封面 imgbox 100×140 + newnav + newright,
 * class.html L240-271 + style.css .newbox L1759-1900; 全站 class/hot/full/search 四页共用行式)。
 * 降级: 真站 newright 的「加入書架」(onclick addbookcase, 会员态)契约无对应 →
 *       以「章節目錄」出口替代(白钮形态保留); piaos 投票占位(空 span/label)同样略去;
 *       有 rank 序号时按真站前三名红/橙/黄徽章渲染(css counter 逐行编号近似)。
 */
export function NewBoxRow({
  book,
  navigate,
  rank,
  showCat,
  titleNode,
}: {
  book: BookItem
  navigate: Nav
  rank?: number
  showCat?: boolean
  /** 自定义书名节点(搜索结果红字高亮用), 缺省渲染纯书名 */
  titleNode?: React.ReactNode
}) {
  return (
    <li className="kkx-newrow" style={{ display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${K.line}`, padding: '20px 0', gap: 12 }}>
      <button
        type="button"
        onClick={() => navigate({ view: 'book', bookId: book.id })}
        aria-label={`查看 ${book.name}`}
        className="kkx-rowimg"
        style={{ width: 100, height: 140, flexShrink: 0, padding: 0, border: 0, background: 'none', cursor: 'pointer', boxShadow: '0 1px 3px rgb(0 0 0 / 30%)' }}
      >
        <BookCover name={book.name} cover={book.cover} style={{ width: '100%', height: '100%', borderRadius: 0 }} />
      </button>
      <div style={{ flex: 1, minWidth: 0, padding: '0 15px' }}>
        <h3 style={{ margin: 0, fontSize: 18, lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <button
            type="button"
            onClick={() => navigate({ view: 'book', bookId: book.id })}
            className="kkx-rowtitle"
            style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', fontSize: 18, color: K.black, textAlign: 'left' }}
          >
            {titleNode ?? book.name}
          </button>
        </h3>
        <div style={{ display: 'flex', padding: '10px 0 15px', flexWrap: 'wrap', rowGap: 4 }}>
          <span style={{ borderRight: '1px solid #ddd', paddingRight: 10, marginRight: 10, color: K.dim, fontSize: 14, lineHeight: 1 }}>{book.author}</span>
          {showCat ? <span style={{ borderRight: '1px solid #ddd', paddingRight: 10, marginRight: 10, color: K.dim, fontSize: 14, lineHeight: 1 }}>{book.category}</span> : null}
          <span style={{ color: K.dim, fontSize: 14, lineHeight: 1 }}>{kkStatus(book)}</span>
        </div>
        <ol
          style={{
            margin: '0 0 15px',
            color: '#777',
            lineHeight: '150%',
            fontSize: 14,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            listStyle: 'none',
            padding: 0,
          }}
        >
          {book.intro || '暫無簡介'}
        </ol>
        {book.latestChapter ? (
          <div className="kkx-zxzj" style={{ display: 'flex', justifyContent: 'space-between', color: K.dim, fontSize: 13, gap: 8 }}>
            <p style={{ margin: 0, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <span style={{ border: `1px solid ${K.line}`, display: 'inline-block', padding: '0 5px', marginRight: 5 }}>最近章節</span>
              <button
                type="button"
                onClick={() => navigate({ view: 'toc', bookId: book.id })}
                className="kkx-rowlatest"
                style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', fontSize: 13, color: K.link }}
              >
                {book.latestChapter}
              </button>
            </p>
          </div>
        ) : null}
      </div>
      <div className="kkx-rowright" style={{ width: 140, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 }}>
        {rank !== undefined ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', width: '100%', color: K.dim }}>
            <label
              style={{
                width: 26,
                height: 26,
                borderRadius: 26,
                textAlign: 'center',
                lineHeight: '26px',
                fontSize: 13,
                color: rank < 3 ? '#fff' : '#777',
                background: rank === 0 ? K.red : rank === 1 ? K.orange : rank === 2 ? K.yellow : K.bg,
                flexShrink: 0,
              }}
            >
              {rank + 1}
            </label>
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => navigate({ view: 'book', bookId: book.id })}
          className="kkx-btn kkx-btn-tp"
          style={{ width: '100%', lineHeight: '30px', fontSize: 14, borderRadius: 4, border: 0, cursor: 'pointer', color: '#fff', background: K.red }}
        >
          點擊閱讀
        </button>
        <button
          type="button"
          onClick={() => navigate({ view: 'toc', bookId: book.id })}
          className="kkx-btn kkx-btn-jrsj"
          style={{ width: '100%', lineHeight: '28px', fontSize: 14, borderRadius: 4, cursor: 'pointer', color: K.link, background: '#fff', border: '1px solid #ddd' }}
        >
          章節目錄
        </button>
      </div>
    </li>
  )
}

/**
 * [R28-2f-10] 封面小卡(真站 .newnovels li: 20%/14.285% 宽 + imgbox 125×180 + h3 14px/h4 12px,
 * class.html L128-136 + style.css L1227-1295; hover 封面 scale 1.1 由 css 串承载)。
 */
export function NovelCard({ book, navigate, h }: { book: BookItem; navigate: Nav; h: number }) {
  return (
    <li className="kkx-nvcard" style={{ display: 'inline-block', verticalAlign: 'top', padding: '9px 10px' }}>
      <button
        type="button"
        onClick={() => navigate({ view: 'book', bookId: book.id })}
        aria-label={`查看 ${book.name}`}
        style={{ display: 'block', width: '100%', textAlign: 'center', background: 'none', border: 0, padding: 0, cursor: 'pointer' }}
      >
        <span className="kkx-nvimg" style={{ display: 'block', margin: '0 auto', overflow: 'hidden', width: h * 0.69, height: h, boxShadow: '0 1px 3px rgb(0 0 0 / 30%)' }}>
          <BookCover name={book.name} cover={book.cover} style={{ width: '100%', height: '100%', borderRadius: 0 }} />
        </span>
        <span className="kkx-nvname" style={{ display: 'block', fontSize: 14, color: K.dark, marginTop: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{book.name}</span>
        <span style={{ display: 'block', fontSize: 12, color: K.link, paddingTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{book.author}</span>
      </button>
    </li>
  )
}

/**
 * [R28-2f-11] 分页(真站 .pages > .pagelink#pagelink: << 上页 数字 strong 下页 >>,
 * class.html L725 + style.css .pagelink L2919-2944; strong 主蓝 #caf1ff 底)。
 */
export function Pager({
  page,
  totalPages,
  onPick,
}: {
  page: number
  totalPages: number
  onPick: (p: number) => void
}) {
  if (totalPages <= 1) return null
  const nums: number[] = []
  const start = Math.max(1, Math.min(page - 4, totalPages - 9))
  for (let i = start; i <= Math.min(totalPages, start + 9); i++) nums.push(i)
  const btn = (label: string, p: number | null, opts?: { strong?: boolean; disabled?: boolean }) => (
    <button
      key={label}
      type="button"
      disabled={opts?.disabled}
      onClick={() => p !== null && onPick(p)}
      className={`kkx-page-a${opts?.strong ? ' is-strong' : ''}`}
      style={{
        background: 'none',
        border: 0,
        padding: '0 6px',
        lineHeight: '30px',
        cursor: opts?.disabled ? 'default' : 'pointer',
        fontSize: 16,
        fontWeight: opts?.strong ? 700 : 400,
        color: opts?.strong ? K.primary : '#7a7a7a',
      }}
    >
      {label}
    </button>
  )
  return (
    <nav className="kkx-pagelink" aria-label="分页" style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', lineHeight: '30px', fontSize: 16, padding: '10px 0' }}>
      {btn('<<', page - 1, { disabled: page <= 1 })}
      {nums.map((p) => btn(String(p), p, { strong: p === page }))}
      {btn('>', page + 1, { disabled: page >= totalPages })}
      {btn('>>', totalPages, { disabled: page >= totalPages })}
    </nav>
  )
}
