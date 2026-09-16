// ============================================================
// [R28-2d-x0] x2552(吾爱文学网) 黑冰模板公共件 —— 各页型共享的 DOM 小件
// 素材: Wayback 实测 2023-12-04 快照(x2552-home/list/book/1326/fulltxt + heibing/css/style.css
// 11.3KB 全量, /tmp/r28-2d/x2552/)。色值/尺寸逐条注明 style.css 出处。
// 头部声明: 真站 .main.m_head 报头与 .m_menu 导航由全局 SiteHeader 承担, 模板从内容区起渲染。
// ============================================================
'use client'

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { usePublic } from '../../ctx'
import { fetchBooks } from '../../data'
import type { BookItem } from '../../types'

/** [R28-2d-x0] 黑冰模板实测色板(heibing/css/style.css 逐条) */
export const C = {
  text: '#666666', // body{color:#666}
  link: '#2f468f', // a,a:visited{color:#2f468f}
  hover: '#FF6600', // a:hover{color:#ff6600}
  border: '#E4E4E4', // .block/table/bdsub 边
  face: '#F2F2F2', // pagelink/表头/圆点底
  blueTop: '#33CCFF', // .bdtop{border:1px solid #33CCFF}
  blueBg: '#D9EDFF', // .bdtop{background:#D9EDFF}
  red: '#FF3300', // .red{color:#FF3300}
  hot: '#FF6600', // .hottext{color:#FF6600}
  thBlue: '#E4EBF1', // #a_main #at th{background:#E4EBF1}
} as const

/** [R28-2d-x0] 精灵图(wamcc.png)标题条/灰钮/页脚 → 纯 CSS 渐变等价(推断级, R27 同口径); TITLE_BAR/GRAY_BTN 供站内页型用 */
export const GRAY_BTN = 'linear-gradient(180deg, #ffffff 0%, #e5e5e5 100%)'
const TITLE_BAR = 'linear-gradient(180deg, #fbfcfe 0%, #e9eef5 100%)'

/** [R28-2d-x0] .bdtop: height:2px;border:1px solid #33CCFF;background:#D9EDFF;font-size:0(实测) */
export function BdTop() {
  return <div className="x2-bdtop" aria-hidden style={{ height: 2, border: `1px solid ${C.blueTop}`, background: C.blueBg, fontSize: 0 }} />
}

/** [R28-2d-x0] .bdsub: padding:1px;background:#FFF;border:1px solid #E4E4E4(实测) */
export function BdSub({ children }: { children: ReactNode }) {
  return (
    <div style={{ padding: 1, background: '#fff', border: `1px solid ${C.border}` }}>
      {children}
    </div>
  )
}

/** [R28-2d-x0] .block: border:1px solid #E4E4E4;margin-top:8px + .blocktitle(精灵图条→渐变, h40) */
export function Block({ title, withIcon, label, more, children }: { title?: string; withIcon?: boolean; label?: boolean; more?: { text: string; onClick: () => void }; children: ReactNode }) {
  return (
    <div style={{ border: `1px solid ${C.border}`, marginTop: 8 }}>
      {title && (
        <div className="x2-blocktitle" style={{ height: 40, lineHeight: '40px', fontSize: 14, background: TITLE_BAR, overflow: 'hidden' }}>
          {withIcon && (
            <i
              aria-hidden
              style={{ display: 'inline-block', width: 12, height: 16, background: C.hover, borderRadius: 2, margin: '12px 10px 0 15px', verticalAlign: 'top' }}
            />
          )}
          {label ? (
            // 真站 blocktitle><span>: 80×30 灰底标签钮(精灵图 0 -384px → 渐变等价)
            <span style={{ float: 'left', display: 'inline-block', width: 80, height: 30, lineHeight: '30px', textAlign: 'center', fontSize: 12, background: GRAY_BTN, border: `1px solid ${C.border}`, margin: '5px 0 0 10px' }}>
              {title}
            </span>
          ) : (
            title
          )}
          {more && (
            // 真站 .blockmore「更多...」右浮 12px 链接
            <button type="button" className="x2-a" style={{ float: 'right', display: 'inline', fontSize: 12, lineHeight: '40px', marginRight: 10 }} onClick={more.onClick}>
              {more.text}
            </button>
          )}
        </div>
      )}
      <div className="x2-blockcontent">{children}</div>
    </div>
  )
}

/** [R28-2d-x0] ul.ultop 行(右上角数值 p + 书名 a; li 底 dotted #F2F2F2, 行高 25px 内距 5px, 实测) */
export function UlTopRows({ rows }: { rows: { id: string; name: string; meta?: string; onClick: () => void }[] }) {
  return (
    <ul className="x2-ultop" style={{ lineHeight: '25px', padding: 5 }}>
      {rows.map((r) => (
        <li key={r.id} style={{ borderBottom: `1px dotted ${C.face}`, padding: '0 3px', listStyle: 'decimal inside', position: 'relative', fontSize: 11, overflow: 'hidden' }}>
          <button type="button" className="x2-a" style={{ fontSize: 12, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }} onClick={r.onClick}>
            {r.name}
          </button>
          {r.meta !== undefined && (
            <p style={{ position: 'absolute', top: -3, right: 0, fontSize: 11, color: C.text }}>{r.meta}</p>
          )}
        </li>
      ))}
    </ul>
  )
}

/** [R28-2d-x0] .pagelink 分页条(border #E4E4E4 bg #F2F2F2 右浮; strong 当前页 #ff6600; em 页况;
 *  实测: em#pagestats「1/42」+ a.first「1」+ a.pgroup「<<」+ strong 当前 + 页码 + 下一页/末页) */
export function Pagelink({ page, totalPages, onPage, align = 'right' }: { page: number; totalPages: number; onPage: (p: number) => void; align?: 'right' | 'center' }) {
  if (totalPages <= 1) return null
  const btn: CSSProperties = { float: 'left', display: 'inline', padding: '0 6px', lineHeight: '30px', height: 30 }
  const win: number[] = []
  const s = Math.max(1, Math.min(page - 2, totalPages - 4))
  for (let i = s; i <= Math.min(totalPages, s + 4); i++) win.push(i)
  return (
    <div className="x2-pagewrap" style={{ overflow: 'hidden', padding: '8px 10px', textAlign: align === 'center' ? 'center' : undefined }}>
      <div className="x2-pagelink" style={{ display: 'inline-flex', border: `1px solid ${C.border}`, background: C.face, margin: align === 'center' ? '0 auto' : undefined }}>
        <em style={{ ...btn, borderRight: `1px solid ${C.border}`, fontStyle: 'normal', color: C.text }}>
          {page}/{totalPages}
        </em>
        {page > 1 && (
          <button type="button" className="x2-a" style={btn} onClick={() => onPage(1)}>
            首页
          </button>
        )}
        {page > 1 && (
          <button type="button" className="x2-a" style={{ ...btn, borderLeft: `1px solid ${C.border}` }} onClick={() => onPage(page - 1)}>
            &lt;&lt;
          </button>
        )}
        {win.map((p) =>
          p === page ? (
            <strong key={p} style={{ ...btn, fontWeight: 'bold', color: C.hover, background: C.face }}>
              {p}
            </strong>
          ) : (
            <button key={p} type="button" className="x2-a" style={btn} onClick={() => onPage(p)}>
              {p}
            </button>
          ),
        )}
        {page < totalPages && (
          <button type="button" className="x2-a" style={{ ...btn, borderLeft: `1px solid ${C.border}` }} onClick={() => onPage(page + 1)}>
            &gt;&gt;
          </button>
        )}
        {page < totalPages && (
          <button type="button" className="x2-a" style={btn} onClick={() => onPage(totalPages)}>
            末页
          </button>
        )}
      </div>
    </div>
  )
}

/** [R28-2d-x0] 字数短格式(右栏数值列; 真站为推荐票数 → 字数替代口径, 声明) */
export function shortWords(n?: number | null): string {
  if (!n || n <= 0) return '0'
  if (n >= 10000) return `${Math.round(n / 10000)}万`
  return String(n)
}

/** [R28-2d-x0] 真站大小列: 46285K ≈ 2370万字(GBK 2 字节/字) → wordCount/512 KB 换算(推断级, 声明) */
function sizeK(n?: number | null): string {
  if (!n || n <= 0) return '0K'
  return `${Math.max(1, Math.round(n / 512))}K`
}

/** [R28-2d-x0] YY-MM-DD(真站列表更新列 23-12-04 形态) */
export function yymmdd(d?: string | null): string {
  if (!d) return '--'
  const m = /\d{4}-\d{2}-\d{2}/.exec(d)
  return m ? m[0].slice(2) : '--'
}

/** [R28-2d-x0] 状态文案(真站表中「连载中/已完成」) */
export function statusText(s?: string | null): string {
  if (s === 'completed') return '已完成'
  return '连载中'
}

/** [R28-2d-x0] 站内书跳转(navigate 包装; 全站导航一律 button 契约) */
export function useBookNav() {
  const { navigate } = usePublic()
  return {
    goBook: (id: string) => navigate({ view: 'book', bookId: id }),
    goRead: (bookId: string, chapterId: string) => navigate({ view: 'read', bookId, chapterId }),
    goCat: (cat?: string) => navigate({ view: 'category', cat, page: 1 }),
    goRanking: () => navigate({ view: 'ranking' }),
  }
}

// ============================================================
// [R28-2d-x2] 左栏 #left —— 分类页/全本页/书页共用的「会员推荐 + 排行榜」双 block
// 素材: x2-list.html/x2-fulltxt.html/x2-bookdetail.html 三快照 #left 结构一致(实测):
//   .block > .blocktitle.wsd(i 图标)「会员推荐」+ ul.ultop×15(li>p 计数右上角, 末行「更多...」→ toplist)
//   .block > .blocktitle.wld「排 行 榜」+ ul.ulcenter 12 榜 li(width:50%;float:left;)
// 降级: ①推荐计数为票数(无契约) → 字数替代 ②真站 12 榜(总点击/总推荐/月点击/月推荐/周点击/
//   周推荐/入库/更新/原创更新/转载更新/总收藏/字数) → 数据面三榜, 榜名 12 条全还原但统一导航
//   至站内排行榜视图(声明)
// ============================================================
const BOARD_LINKS: string[] = [
  '总点击榜', '总推荐榜', '月点击榜', '月推荐榜', '周点击榜', '周推荐榜',
  '入库时间', '更新时间', '原创更新', '转载更新', '总收藏榜', '字数排行',
]

export function LeftRail() {
  const { site } = usePublic()
  const { goBook, goRanking } = useBookNav()
  const [rows, setRows] = useState<BookItem[] | null>(null)
  useEffect(() => {
    let alive = true
    fetchBooks({ site: site.id, sort: 'words', page: 1, size: 15 })
      .then((d) => {
        if (alive) setRows(d.books || [])
      })
      .catch(() => {
        if (alive) setRows([])
      })
    return () => {
      alive = false
    }
  }, [site.id])

  return (
    <div style={{ width: '100%' }}>
      {/* 会员推荐(ultop×15, 计数=字数替代票数, 声明) */}
      <Block title="会员推荐" withIcon>
        {!rows ? (
          <ul className="x2-ultop" style={{ lineHeight: '25px', padding: 5 }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <li key={i} className="h-[25px] animate-pulse" style={{ borderBottom: `1px dotted ${C.face}` }} />
            ))}
          </ul>
        ) : (
          <>
            <UlTopRows rows={rows.slice(0, 14).map((b) => ({ id: b.id, name: b.name, meta: shortWords(b.wordCount), onClick: () => goBook(b.id) }))} />
            <div style={{ textAlign: 'right', borderTop: 'none', padding: '2px 6px' }}>
              <button type="button" className="x2-a" style={{ fontSize: 12 }} onClick={goRanking}>
                更多...
              </button>
            </div>
          </>
        )}
      </Block>
      {/* 排行榜(ulcenter 12 榜双列; 真站为 /top/{sort} 外链 → 站内排行榜视图, 声明) */}
      <Block title="排 行 榜" withIcon>
        <ul className="x2-ulcenter" style={{ padding: 5, overflow: 'hidden', lineHeight: '25px' }}>
          {BOARD_LINKS.map((name) => (
            <li key={name} style={{ width: '50%', float: 'left', listStyle: 'none', fontSize: 12 }}>
              <button type="button" className="x2-a" onClick={goRanking}>
                {name}
              </button>
            </li>
          ))}
        </ul>
        <div style={{ clear: 'both' }} />
      </Block>
    </div>
  )
}

/** [R28-2d-x3] #centerm 六列书目表 —— 分类/全本/排行/搜索四页型共用
 *  实测(x2-list/x2-fulltxt 快照): table 736px cellpadding0 cellspacing1 bgcolor#E4E4E4(1px 网格线)
 *  th 行 bg#F2F2F2 宽 18/46/13/8/9/6%; 数据行 bg#FFFFFF; td.L 左/td.C 中/td.R 右(大小列)
 *  降级: 最新章节列真站为章链接(列表契约无 chapterId) → 纯文本(声明); 大小列 K 值为 wordCount/512 换算 */
export function BookTable({ books, loading, empty }: { books: BookItem[]; loading?: boolean; empty?: boolean }) {
  const { goBook } = useBookNav()
  return (
    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <table
        className="x2-tbl"
        cellPadding={0}
        cellSpacing={0}
        style={{ width: '100%', minWidth: 620, borderCollapse: 'separate', borderSpacing: 1, background: C.border, fontSize: 12, color: C.text }}
      >
      <thead>
        <tr style={{ background: C.face, textAlign: 'center', height: 26 }}>
          <th style={{ width: '18%', fontWeight: 'normal' }}>书 名</th>
          <th style={{ width: '46%', fontWeight: 'normal' }}>最新章节</th>
          <th style={{ width: '13%', fontWeight: 'normal' }}>作者</th>
          <th style={{ width: '8%', fontWeight: 'normal' }}>大小</th>
          <th style={{ width: '9%', fontWeight: 'normal' }}>更新</th>
          <th style={{ width: '6%', fontWeight: 'normal' }}>状态</th>
        </tr>
      </thead>
      <tbody>
        {loading &&
          Array.from({ length: 10 }).map((_, i) => (
            <tr key={i} style={{ background: '#fff', height: 28 }}>
              {Array.from({ length: 6 }).map((_, j) => (
                <td key={j} style={{ padding: '4px 6px' }}>
                  <span className="block h-[14px] animate-pulse" style={{ background: C.face }} />
                </td>
              ))}
            </tr>
          ))}
        {!loading && empty && (
          <tr style={{ background: '#fff' }}>
            <td colSpan={6} style={{ padding: '18px 0', textAlign: 'center', color: C.text }}>
              暂无书籍
            </td>
          </tr>
        )}
        {!loading &&
          books.map((b) => (
            <tr key={b.id} style={{ background: '#fff', height: 28 }}>
              <td className="L" style={{ padding: '4px 6px', overflow: 'hidden', maxWidth: 0 }}>
                <button type="button" className="x2-a block max-w-full truncate text-left" title={b.name} onClick={() => goBook(b.id)}>
                  {b.name}
                </button>
              </td>
              <td className="L" style={{ padding: '4px 6px', overflow: 'hidden', maxWidth: 0 }}>
                <span className="block max-w-full truncate">{b.latestChapter || '--'}</span>
              </td>
              <td className="C" style={{ padding: '4px 6px' }}>
                <span className="block max-w-full truncate">{b.author}</span>
              </td>
              <td className="R" style={{ padding: '4px 6px', textAlign: 'right' }}>{sizeK(b.wordCount)}</td>
              <td className="C" style={{ padding: '4px 6px' }}>{yymmdd(b.updatedAt)}</td>
              <td className="C" style={{ padding: '4px 6px' }}>{statusText(b.status)}</td>
            </tr>
          ))}
      </tbody>
    </table>
    </div>
  )
}
