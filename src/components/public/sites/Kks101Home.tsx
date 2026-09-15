// ============================================================
// [R24-6-c] 101看書 克隆首页 —— 按 https://101kks.com/ 首页真站结构 1:1 还原。
// 真站结构(样本 /tmp/sites/101kks-home.html + 101kks-style0.css + block_booklist.css):
//   .main > .container
//     ├ .xinlogo                 大字站标(35px/居中/#1f6cb2 基因)
//     ├ .error-text.searchBox    大圆角搜索框(600px/25px 圆角/右侧透明按钮)
//     ├ .indexdaohang            4 枚蓝色方形快捷入口(50px 高/10px 圆角/#1f6cb2)
//     ├ h3.mytitle 热门书单推荐  .booklist-block > .booklist-grid > .booklist-card×N
//     │                          卡=封面堆叠区(#667eea→#764ba2 渐变底 + 白卡扇形叠放
//     │                          + "+"角标) + 信息区(标题 2 行/3 meta/简介 2 行)
//     └ .tag                     热门标签云(0.8rem/1.8rem/10px 圆角/#56a6c3 边/#e8f4ff 底)
// 真站页脚公告条(.headerad #fff2df)已由 SiteHeader 的 KksAnnounce 分支承担, 此处不重复。
// 数据口径: props.books=最新 48 本兜底; 另拉 字数最多(点击榜基因) 喂书单卡 + 拉热词池喂标签云。
// 颜色均为真站 CSS 实测硬编码; 文案由繁转简, 结构照搬。
// ============================================================
'use client'

import { useEffect, useState } from 'react'
import { BarChart3, Library, Search, Smartphone } from 'lucide-react'
import type { SiteHomeProps } from './shared'
import { usePublic } from '../ctx'
import { fetchBooks, fetchSuggestTags } from '../data'
import type { BookItem } from '../types'
import { BookCover } from '../BookCover'
import { Sk, bookNavProps } from '../bits'

/** [R24-6-c-1] 真站实测色值常量(101kks /css/style.css + block_booklist.css) */
const KKS_BLUE = '#1f6cb2'
const KKS_BLUE_HOVER = '#17508a'
const KKS_ACCENT = '#56a6c3' // 标签描边/辅色
const KKS_TAG_BG = '#e8f4ff' // 真站 rgb(232,244,255)
const KKS_COVER_STACK_GRADIENT = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' // 书单卡封面区真站渐变

/** [R24-6-c-2] 真站 booklist-card —— 横向小卡: 封面堆叠(单封面+两张白卡扇形)+标题+3 meta+简介 */
function KksBooklistCard({ book, rank }: { book: BookItem; rank: number }) {
  const { navigate } = usePublic()
  return (
    <article
      {...bookNavProps(navigate, book.id)}
      aria-label={`查看《${book.name}》详情`}
      className="group flex h-[104px] cursor-pointer overflow-hidden rounded-[10px] border border-black/5 bg-white shadow-[0_2px_10px_rgba(0,0,0,0.08)] transition-all duration-300 hover:-translate-y-0.5 hover:border-black/10 hover:shadow-[0_6px_20px_rgba(0,0,0,0.12)] sm:h-[110px] sm:gap-0 md:h-[128px]"
    >
      {/* 封面区(真站 .booklist-cover-section) */}
      <div
        className="relative flex w-[86px] shrink-0 items-center justify-center sm:w-[100px] md:w-[120px]"
        style={{ background: KKS_COVER_STACK_GRADIENT }}
      >
        {/* 封面堆叠(.booklist-cover-stack): 后位白卡 → 前位真封面 */}
        <div className="relative flex h-[90px] w-[70px] items-center justify-center sm:h-[100px] sm:w-[80px] md:h-[110px] md:w-[90px]">
          <span aria-hidden className="absolute left-[70%] top-[10px] z-[1] h-[40px] w-[30px] rotate-[5deg] rounded-[2px] bg-white/50 sm:h-[45px] sm:w-[34px] md:left-[75%] md:top-[14px] md:h-[52px] md:w-[38px]" />
          <span aria-hidden className="absolute left-[40%] top-[6px] z-[2] h-[46px] w-[34px] -rotate-3 rounded-[2px] bg-white/70 sm:left-[45%] sm:top-[7px] sm:h-[52px] sm:w-[39px] md:left-1/2 md:top-2 md:h-[58px] md:w-[44px]" />
          <span className="relative z-[3] block h-[55px] w-[40px] overflow-hidden rounded-[3px] shadow-[0_2px_8px_rgba(0,0,0,0.15)] sm:h-[65px] sm:w-[45px] md:h-[70px] md:w-[50px]">
            <BookCover name={book.name} cover={book.cover} showAuthor={book.author} style={{ borderRadius: 3 }} />
          </span>
          {/* 真站 .cover-count 角标: 固定 "+" 字 */}
          <span className="absolute bottom-[6px] right-[6px] z-[4] rounded-[10px] bg-black/70 px-1.5 py-[2px] text-[10px] font-bold text-white backdrop-blur-[4px] md:bottom-2 md:right-2">
            +
          </span>
        </div>
      </div>
      {/* 信息区(.booklist-info-section): 标题 2 行 / meta ×3 / 简介 2 行 */}
      <div className="flex min-w-0 flex-1 flex-col justify-between px-2.5 py-1.5 sm:px-3.5 sm:py-2.5 md:px-4 md:py-3">
        <h3 className="mb-1 line-clamp-2 text-[12px] font-semibold leading-[1.3] text-[#2c3e50] sm:text-[13px] md:mb-2 md:text-sm">
          {book.name}
        </h3>
        <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[9px] text-[#7f8c8d] sm:gap-x-2.5 sm:text-[11px] md:mb-2 md:gap-x-3 md:text-xs">
          <span className="flex items-center gap-0.5" aria-label="字数">
            <BarChart3 className="h-3 w-3 opacity-70" aria-hidden />
            <span>{rank + 1}</span>
          </span>
          <span className="flex items-center gap-0.5" aria-label="分类">
            <Library className="h-3 w-3 opacity-70" aria-hidden />
            <span className="max-w-[72px] truncate">{book.category || '小说'}</span>
          </span>
          <span className="flex items-center gap-0.5" aria-label="作者">
            <Smartphone className="h-3 w-3 opacity-70" aria-hidden />
            <span className="max-w-[80px] truncate">{book.author}</span>
          </span>
        </div>
        <p className="line-clamp-2 flex-1 text-[10px] leading-[1.4] text-[#7f8c8d] md:text-[11px]">
          {book.intro || `${book.category} · ${book.author} · 连载中作品`}
        </p>
      </div>
    </article>
  )
}

/** [R24-6-c-3] 书单卡加载骨架(真站卡形等比占位) */
function KksBooklistSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" role="status" aria-label="书单加载中">
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

  // [R24-6-c-4] 维度一: 字数最多(点击榜基因)喂「热门书单推荐」; 维度二: 热词池喂标签云。
  // alive 旗标防竞态(换站重挂载由 HomeView key 重置, 仍保守处理)。
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
    fetchSuggestTags().then((d) => {
      if (alive) setTags(d && d.tags.length ? d.tags.slice(0, 48) : [])
    })
    return () => {
      alive = false
    }
  }, [site.id])

  const hotList: BookItem[] = hot && hot.length ? hot : books.slice(0, 12)

  // [R24-6-c-5] 搜索表单(真站 .error-text.searchBox 大圆角搜索)
  const [kw, setKw] = useState('')
  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const t = kw.trim()
    if (!t) return
    navigate({ view: 'search', q: t })
  }

  // 真站 .indexdaohang 四入口: 书架/记录归 history 视图, 排行/完本归全部作品分类页
  const quickLinks: { label: string; go: () => void }[] = [
    { label: '我的书架', go: () => navigate({ view: 'history' }) },
    { label: '阅读记录', go: () => navigate({ view: 'history' }) },
    { label: '排行榜', go: () => navigate({ view: 'category' }) },
    { label: '完本小说', go: () => navigate({ view: 'category' }) },
  ]

  return (
    <div className="w-full pb-12" style={{ color: '#333' }}>
      {/* ============ xinlogo 大字站标(真站 35px/居中) ============ */}
      <h1
        className="mx-auto mt-10 max-w-[300px] text-center text-[30px] font-semibold leading-tight tracking-wide sm:text-[35px]"
        style={{ color: KKS_BLUE, fontWeight: 550 }}
      >
        {site.name}
      </h1>

      {/* ============ 大圆角搜索框(真站 600px/25px 圆角/浅投影) ============ */}
      <form onSubmit={submitSearch} role="search" className="relative mx-auto mt-4 w-full max-w-[600px] px-4">
        <input
          value={kw}
          onChange={(e) => setKw(e.target.value)}
          type="text"
          placeholder="输入书名 / 作者名"
          aria-label="站内搜索"
          className="h-[50px] w-full rounded-[25px] border bg-white px-[17px] text-base text-[#444444] outline-none placeholder:text-[#ababab]"
          style={{ borderColor: '#eef0f4', boxShadow: '0 4px 20px rgba(0,25,104,0.05)' }}
        />
        <button
          type="submit"
          aria-label="搜索"
          className="absolute right-4 top-[1px] flex h-12 w-14 items-center justify-center rounded-r-[25px] text-[#666666] transition-colors hover:text-[#1f6cb2]"
        >
          <Search className="h-5 w-5" aria-hidden />
        </button>
      </form>

      {/* ============ indexdaohang 四蓝色快捷入口(真站 50px/10px 圆角) ============ */}
      <nav aria-label="快捷入口" className="mb-2 mt-6 flex flex-wrap justify-center gap-2 px-4">
        {quickLinks.map((q) => (
          <button
            key={q.label}
            type="button"
            onClick={q.go}
            className="h-[50px] flex-1 basis-[45%] rounded-[10px] text-base font-medium text-[#f6f6f6] transition-colors hover:text-white sm:basis-[20%] sm:max-w-[220px]"
            style={{ background: KKS_BLUE }}
            onMouseEnter={(e) => (e.currentTarget.style.background = KKS_BLUE_HOVER)}
            onMouseLeave={(e) => (e.currentTarget.style.background = KKS_BLUE)}
          >
            {q.label}
          </button>
        ))}
      </nav>

      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        {/* ============ 热门书单推荐(真站 h3.mytitle + booklist-grid) ============ */}
        <section className="mt-6">
          <h2
            className="mb-2.5 border-b pb-1.5 text-base font-normal"
            style={{ borderColor: 'rgba(150,150,150,0.2)' }}
          >
            热门书单推荐
          </h2>
          {loading && hot === null ? (
            <KksBooklistSkeleton />
          ) : (
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3">
              {hotList.map((b, i) => (
                <KksBooklistCard key={b.id} book={b} rank={i} />
              ))}
            </div>
          )}
        </section>

        {/* ============ 热门标签云(真站 .tag: #56a6c3 描边 + #e8f4ff 底 + 10px 圆角) ============ */}
        <section className="mt-10">
          <h2 className="mb-2.5 border-b pb-1.5 text-base font-normal" style={{ borderColor: 'rgba(150,150,150,0.2)' }}>
            热门标签
          </h2>
          {tags === null ? (
            <div className="flex flex-wrap justify-center" aria-hidden>
              {Array.from({ length: 14 }).map((_, i) => (
                <Sk key={i} className="m-1.5 h-7 w-16 rounded-[10px]" />
              ))}
            </div>
          ) : tags.length ? (
            <ul className="flex flex-wrap justify-center" style={{ listStyle: 'none' }}>
              {tags.map((t) => (
                <li key={t}>
                  <button
                    type="button"
                    onClick={() => navigate({ view: 'keyword', tag: t })}
                    aria-label={`浏览 ${t} 关键词书库`}
                    className="m-1.5 inline-block rounded-[10px] px-3 py-2 text-[13px] leading-none transition-opacity hover:opacity-80 md:py-1"
                    style={{ border: `1px solid ${KKS_ACCENT}`, background: KKS_TAG_BG, color: KKS_BLUE, lineHeight: '1.8rem' }}
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
