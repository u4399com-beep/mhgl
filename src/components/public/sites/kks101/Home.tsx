// ============================================================
// [R26-3-1] kks101(101看書) 首页克隆 —— 按 https://101kks.com/ 首页真站快照逐节还原
// (/tmp/r26/probe-101kks.com.html + kks101-style.css 实测, 2025 抓取)
//
// 真站 DOM(.main > .container > ul.row > li.col-xinindex > .mybox):
//   ├ .xinlogo                 站标(style.css: max-width 300px/35px/font-weight 550/margin 40px auto, 实站为图片 logo → 文字站名)
//   ├ .error-text.searchBox    大圆角搜索框(form max-width 600px; .searchinput 高 50px/圆角 25px/边 #eef0f4/
//   │                          阴影 0 4px 20px rgba(0,25,104,.05)/字 16px #444; 右侧透明按钮 20px 图标 #666)
//   ├ .indexdaohang            4 枚蓝色快捷入口(li 背景 #1f6cb2/宽 20%(移动 45%)/高 50px/圆角 10px/h3 1rem #f6f6f6 500)
//   ├ h3.mytitle 熱門書單推薦  .booklist-block > .booklist-grid > .booklist-card×12(block_booklist.css:
//   │                          白卡 128px 高/10px 圆角/阴影 0 2px 10px rgba(0,0,0,.08); 封面区渐变
//   │                          linear-gradient(135deg,#667eea 0%,#764ba2 100%) + 白卡扇形堆叠 + "+" 角标;
//   │                          信息区标题 2 行 + 3 meta(icon-chart 收藏数/icon-library 本数/icon-shoujihao 用户) + 简介 2 行)
//   └ .tag > h3.mytitle(空标题, 仅一条分隔线) + ul > a×~80
//                              标签(style.css .tag ul a: .8rem/line-height 1.8rem/padding 0 .725rem/
//                              边 1px #56a6c3/圆角 10px/margin .5rem/底 rgb(232,244,255)/字 #1f6cb2)
// 注: ①公告条(.headerad #fff2df 高 40px/16px 居中)与蓝导航已由 SiteHeader KksAnnounce/KksNav 承担, 不重复渲染
//    ②真站首页书单卡为"书单(收藏夹)"卡, 本模板无书单实体 → 以热门书(字数榜基因)喂同款卡形, 卡 meta 顺延为
//      排名/分类/作者, 简介钳 2 行(同真站 ellipsis 2 行)
//    ③"最新小說"行式板块取自同站 style.css .booklist li 家族样式(48×64 封面+14px 700 标题+#757575 文本行,
//      hover #f9f9f9 + 封面 scale 1.1), 用于消化 48 本 props 余量
// 色板出处(kks101-style.css): body #f2f3f4/#333/14px yahei · a #666 hover #06c · 主蓝 #1f6cb2 · 标签 #56a6c3
// ============================================================
'use client'

import { useEffect, useState } from 'react'
import { BarChart3, Library, Search, Smartphone } from 'lucide-react'
import type { SiteHomeProps } from '../shared'
import { usePublic } from '../../ctx'
import { fetchBooks, fetchSuggestTags } from '../data'
import type { BookItem } from '../../types'
import { BookCover } from '../BookCover'
import { Sk, bookNavProps } from '../bits'

/** [R26-3-1] 真站实测色值(kks101-style.css 频次统计+逐条规则) */
const BLUE = '#1f6cb2' // 主蓝(×32): 导航/按钮/标签字/快捷入口
const BLUE_HOVER = '#17508a' // 深蓝(hover, kks 渐变尾)
const TEXT_MAIN = '#333' // body 文字
const TEXT_MUTED = '#757575' // booklist .text 行
const CARD_LINE = '#eaeaea' // .booklist li 边线
const COVER_STACK_GRADIENT = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' // 真站书单卡封面区渐变

/** [R26-3-1] 热门书单卡(真站 .booklist-card: 封面堆叠区 + 信息区, 桌面 128px 高) */
function BooklistCard({ book, rank }: { book: BookItem; rank: number }) {
  const { navigate } = usePublic()
  return (
    <article
      {...bookNavProps(navigate, book.id)}
      aria-label={`查看《${book.name}》详情`}
      className="group flex h-[104px] cursor-pointer overflow-hidden rounded-[10px] border border-black/5 bg-white shadow-[0_2px_10px_rgba(0,0,0,0.08)] transition-all duration-300 hover:-translate-y-0.5 hover:border-black/10 hover:shadow-[0_6px_20px_rgba(0,0,0,0.12)] sm:h-[110px] md:h-[128px]"
    >
      {/* 封面堆叠区(.booklist-cover-section + .booklist-cover-stack) */}
      <div className="relative flex w-[86px] shrink-0 items-center justify-center sm:w-[100px] md:w-[120px]" style={{ background: COVER_STACK_GRADIENT }}>
        <div className="relative flex h-[90px] w-[70px] items-center justify-center sm:h-[100px] sm:w-[80px] md:h-[110px] md:w-[90px]">
          <span aria-hidden className="absolute left-[70%] top-[10px] z-[1] h-[40px] w-[30px] rotate-[5deg] rounded-[2px] bg-white/50 sm:h-[45px] sm:w-[34px] md:left-[75%] md:top-[14px] md:h-[52px] md:w-[38px]" />
          <span aria-hidden className="absolute left-[40%] top-[6px] z-[2] h-[46px] w-[34px] -rotate-3 rounded-[2px] bg-white/70 sm:left-[45%] sm:top-[7px] sm:h-[52px] sm:w-[39px] md:left-1/2 md:top-2 md:h-[58px] md:w-[44px]" />
          <span className="relative z-[3] block h-[55px] w-[40px] overflow-hidden rounded-[3px] shadow-[0_2px_8px_rgba(0,0,0,0.15)] sm:h-[65px] sm:w-[45px] md:h-[70px] md:w-[50px]">
            <BookCover name={book.name} cover={book.cover} showAuthor={book.author} style={{ borderRadius: 3 }} />
          </span>
          {/* .cover-count "+" 角标 */}
          <span className="absolute bottom-[6px] right-[6px] z-[4] rounded-[10px] bg-black/70 px-1.5 py-[2px] text-[10px] font-bold text-white backdrop-blur-[4px] md:bottom-2 md:right-2">+</span>
        </div>
      </div>
      {/* 信息区(.booklist-info-section): 标题 2 行/3 meta/简介 2 行 */}
      <div className="flex min-w-0 flex-1 flex-col justify-between px-2.5 py-1.5 sm:px-3.5 sm:py-2.5 md:px-4 md:py-3">
        <h3 className="mb-1 line-clamp-2 text-[12px] font-semibold leading-[1.3] text-[#2c3e50] sm:text-[13px] md:mb-2 md:text-sm">{book.name}</h3>
        <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[9px] text-[#7f8c8d] sm:gap-x-2.5 sm:text-[11px] md:mb-2 md:gap-x-3 md:text-xs">
          <span className="flex items-center gap-0.5" aria-label="热度排名">
            <BarChart3 className="h-3 w-3 opacity-70" aria-hidden />
            <span>{rank + 1}</span>
          </span>
          <span className="flex items-center gap-0.5" aria-label="分类">
            <Library className="h-3 w-3 opacity-70" aria-hidden />
            <span className="max-w-[72px] truncate">{book.category || '小說'}</span>
          </span>
          <span className="flex items-center gap-0.5" aria-label="作者">
            <Smartphone className="h-3 w-3 opacity-70" aria-hidden />
            <span className="max-w-[80px] truncate">{book.author}</span>
          </span>
        </div>
        <p className="line-clamp-2 flex-1 text-[10px] leading-[1.4] text-[#7f8c8d] md:text-[11px]">{book.intro || `${book.category} · ${book.author} · 連載中人氣作品`}</p>
      </div>
    </article>
  )
}

/** [R26-3-1] 书单卡骨架 */
function BooklistSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3" role="status" aria-label="书单加载中">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex h-[104px] overflow-hidden rounded-[10px] sm:h-[110px] md:h-[128px]">
          <Sk className="h-full w-[86px] shrink-0 rounded-none sm:w-[100px] md:w-[120px]" />
          <div className="flex-1 space-y-2 px-3 py-2.5">
            <Sk className="h-3.5 w-4/5" />
            <Sk className="h-2.5 w-3/5" />
            <Sk className="h-2.5 w-full" />
          </div>
        </div>
      ))}
      <span className="sr-only">加载中…</span>
    </div>
  )
}

export function Kks101Home({ books, loading }: SiteHomeProps) {
  const { site, navigate } = usePublic()

  // [R26-3-1] 维度一: 字数最多(真站点击榜基因)喂書單卡; 维度二: 下拉热词池喂标签云(对应真站 /newtag 标签墙)
  const [hot, setHot] = useState<BookItem[] | null>(null)
  const [tags, setTags] = useState<string[] | null>(null)
  useEffect(() => {
    let alive = true
    fetchBooks({ site: site.id, sort: 'words', page: 1, size: 18 })
      .then((d) => {
        if (alive) setHot(d.books || [])
      })
      .catch(() => {
        if (alive) setHot([]) // 失败静默: 回退 props.books
      })
    fetchSuggestTags()
      .then((d) => {
        if (alive) setTags(d && d.tags.length ? d.tags.slice(0, 48) : [])
      })
      .catch(() => {
        if (alive) setTags([])
      })
    return () => {
      alive = false
    }
  }, [site.id])

  // [R26-3-1] 48 本 props 切板块: 前 12 优先书单卡(热榜兜底), 其余进 .booklist 行式"最新小說"
  const hotList: BookItem[] = (hot && hot.length ? hot : books).slice(0, 12)
  const hotIds = new Set(hotList.map((b) => b.id))
  const latest = books.filter((b) => !hotIds.has(b.id)).slice(0, 36)

  // [R26-3-1] 真站 .error-text.searchBox 搜索(繁体占位对齐真站文案)
  const [kw, setKw] = useState('')
  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const t = kw.trim()
    if (!t) return
    navigate({ view: 'search', q: t })
  }

  // 真站 .indexdaohang 四入口: 我的書架/閱讀記錄→history, 排行榜/完本小說→全部分類(真站为 /novels/hot|full 列表页)
  const quickLinks: { label: string; go: () => void }[] = [
    { label: '我的書架', go: () => navigate({ view: 'history' }) },
    { label: '閱讀記錄', go: () => navigate({ view: 'history' }) },
    { label: '排行榜', go: () => navigate({ view: 'category', page: 1 }) },
    { label: '完本小說', go: () => navigate({ view: 'category', page: 1 }) },
  ]

  return (
    <div className="w-full pb-10" style={{ color: TEXT_MAIN }}>
      {/* ============ .xinlogo 大字站标(真站 35px/550/居中/margin 40px auto) ============ */}
      <h1 className="mx-auto mt-8 max-w-[300px] text-center text-[28px] leading-tight tracking-wide sm:mt-10 sm:text-[35px]" style={{ color: BLUE, fontWeight: 550 }} aria-label={site.name}>
        {site.name}
      </h1>

      {/* ============ .error-text.searchBox 大圆角搜索框(600px/50px 高/25px 圆角) ============ */}
      <form onSubmit={submitSearch} role="search" className="relative mx-auto mt-4 w-full max-w-[600px] px-4">
        <input
          value={kw}
          onChange={(e) => setKw(e.target.value)}
          type="text"
          placeholder="請輸入搜索內容！"
          aria-label="站内搜索"
          className="h-[50px] w-full rounded-[25px] border bg-white px-[17px] text-base outline-none placeholder:text-[#ababab]"
          style={{ borderColor: '#eef0f4', boxShadow: '0 4px 20px rgba(0,25,104,0.05)', color: '#444444', marginBottom: 30 }}
        />
        <button type="submit" aria-label="搜索" className="absolute right-4 top-[1px] flex h-12 w-14 items-center justify-center text-[#666666] transition-colors hover:text-[#1f6cb2]">
          <Search className="h-5 w-5" aria-hidden />
        </button>
      </form>

      {/* ============ .indexdaohang 四蓝色快捷入口(#1f6cb2/50px 高/10px 圆角) ============ */}
      <nav aria-label="快捷入口" className="mb-4 mt-2 flex flex-wrap justify-center px-4">
        {quickLinks.map((q) => (
          <button
            key={q.label}
            type="button"
            onClick={q.go}
            className="m-2 h-[50px] w-[45%] rounded-[10px] text-base font-medium transition-colors sm:w-[20%] sm:max-w-[220px]"
            style={{ background: BLUE, color: '#f6f6f6', fontWeight: 500 }}
            onMouseEnter={(e) => (e.currentTarget.style.background = BLUE_HOVER)}
            onMouseLeave={(e) => (e.currentTarget.style.background = BLUE)}
            aria-label={q.label}
          >
            {q.label}
          </button>
        ))}
      </nav>

      <div className="mx-auto w-full max-w-[1112px] px-4 sm:px-6">
        {/* ============ 熱門書單推薦(真站 h3.mytitle + .booklist-block/.booklist-grid) ============ */}
        <section>
          <h2 className="kks-mytitle">熱門書單推薦</h2>
          {loading && hot === null ? (
            <BooklistSkeleton />
          ) : hotList.length ? (
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3">
              {hotList.map((b, i) => (
                <BooklistCard key={b.id} book={b} rank={i} />
              ))}
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-[#999]">暫無熱門書籍</p>
          )}
        </section>

        {/* ============ 最新小說(.booklist li 行式: 48×64 封面 + 700 标题 + #757575 信息行) ============ */}
        <section>
          <h2 className="kks-mytitle mt-8">最新小說</h2>
          {loading && !books.length ? (
            <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-x-5" aria-hidden>
              {Array.from({ length: 12 }).map((_, i) => (
                <li key={i} className="flex rounded-[3px] border p-2.5" style={{ borderColor: CARD_LINE }}>
                  <Sk className="h-16 w-12 shrink-0 rounded-none" />
                  <div className="flex-1 space-y-2 pl-2.5 pt-0.5">
                    <Sk className="h-3.5 w-3/4" />
                    <Sk className="h-2.5 w-1/2" />
                  </div>
                </li>
              ))}
            </ul>
          ) : latest.length ? (
            <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-x-5">
              {latest.map((b) => (
                <li
                  key={b.id}
                  {...bookNavProps(navigate, b.id)}
                  aria-label={`查看《${b.name}》详情`}
                  className="kks-bookrow flex cursor-pointer overflow-hidden rounded-[3px] border p-2.5 transition-colors"
                  style={{ borderColor: CARD_LINE, boxShadow: '0 0 8px 0 rgb(0 0 0 / 10%)' }}
                >
                  <span className="block h-16 w-12 shrink-0 overflow-hidden" style={{ marginRight: 10 }}>
                    <BookCover name={b.name} cover={b.cover} className="h-full w-full" style={{ borderRadius: 0 }} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="kks-row-title block truncate text-[14px] font-bold leading-snug" style={{ color: TEXT_MAIN }}>
                      {b.name}
                    </span>
                    <span className="block pt-[5px] text-[13px]" style={{ color: TEXT_MUTED }}>
                      {b.category || '小說'} · {b.author}
                    </span>
                    <span className="block truncate pt-1 text-[13px]" style={{ color: TEXT_MUTED }}>
                      {b.latestChapter ? `最新：${b.latestChapter}` : b.intro}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-6 text-center text-sm text-[#999]">暫無書籍</p>
          )}
        </section>

        {/* ============ .tag 标签云(空 mytitle 分隔线 + .8rem 胶囊 #56a6c3 边 #e8f4ff 底) ============ */}
        <section className="mt-8">
          <h2 className="kks-mytitle" aria-hidden>
            {' '}
          </h2>
          {tags === null ? (
            <div className="flex flex-wrap justify-center" aria-hidden>
              {Array.from({ length: 14 }).map((_, i) => (
                <Sk key={i} className="m-1.5 h-7 w-16 rounded-[10px]" />
              ))}
            </div>
          ) : tags.length ? (
            <ul className="flex flex-wrap justify-center">
              {tags.map((t) => (
                <li key={t}>
                  <button
                    type="button"
                    onClick={() => navigate({ view: 'keyword', tag: t })}
                    aria-label={`浏览 ${t} 关键词书库`}
                    className="kks-tagbtn m-2 inline-block"
                  >
                    {t}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      </div>
    </div>
  )
}
