// ============================================================
// [R28-2b-3] 霹雳书屋 克隆书籍详情页 —— https://www.pilishuwu.com/{cat}/{id}/info.html
//            (wmcms.page.works.css)
//
// 真站快照: /tmp/r28-2b/pili/book.html(2026-09-16 实抓 56K, 《第一剑仙退休后》)
// CSS 存档: /tmp/r28-2b/pili/wmcms.page.works.css(90K) 实测
//
// 真站 DOM(#special_bg > .ui-wm):
//   .works-intro: .works-cover(210×280 封面 + .works-intro-status 状态标 160×32
//                 16px/32px 白字 左 20px 底部) + .works-intro-detail:
//     h2.works-intro-title strong(32px/32px 微软雅黑 normal #555)「书名」（作者：xx）
//     .works-intro-short(#999 灰字 h 130px lh 180% overflow auto)
//     .works-intro-tags 标签 chips + .works-intro-active 开始阅读/章节目录
//     (.ui-btn-orange 底 #f89157 边 1px #ec7d4d inset 高光 hover #f59966, 圆角 3px)
//   .works-vote: 鲜花/鸡蛋计数 + #novel_data.works-status ul li(160px 列 14px/35px)
//   右 .works-author-wr: .works-author-face 头像 + dl(作者等级/签约状态/是否上架)
//   .works-chapter-wr.works-stack: ul.works-chapter-menu(active tab「查看完整章节目录」)
//     + .works-chapter-top「最新章：」(红 #cd1604) + ol.chapter-page-new.works-chapter-list
//     (.works-chapter-item a 14px #333, :visited #A75646, :hover #fa8729, 宽 294px 列)
//
// 降级: ①鲜花/鸡蛋/总点击/收藏/推荐计数无契约 → 数据行以 字数/分类/更新时间 复刻
// works-status 栅格 ②作者卡(作者等级/签约状态/是否上架) → 分类/状态/字数 ③作品轮播图
// (works-slider-ad bx-carousel)无推荐书数据契约 → 不渲染 ④最新章行取当前目录页尾部
// (多页书=最早页尾部, 与真站站方最新章可能不同页)。
// ============================================================
'use client'

import { BookOpen, ListTree } from 'lucide-react'
import type { SiteBookProps } from '../shared'
import { usePublic } from '../../ctx'
import { BookCover } from '../../BookCover'
import { ErrorState, Sk } from '../../bits'
import { fmtDate, formatWords, statusLabel } from '../../seo'

const ORANGE = '#fd8929'
const TITLE = '#555555'
const TEXT = '#333333'
const MUTED = '#999999'

export function PiliBook({ data, loading, error, currentChapterId }: SiteBookProps) {
  const { site, navigate } = usePublic()
  const book = data?.book
  const chapters = data?.chapters || []
  // 真站书页章节列表为「最新在前」倒序(第63章→第50章)
  const latestFirst = [...chapters].reverse()
  const latestCh = latestFirst[0]
  const firstCh = chapters[0]

  if (error) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        <ErrorState message="书籍信息加载失败" detail={error} />
      </div>
    )
  }

  return (
    <div className="min-h-[50vh] bg-white pb-10 text-[#333333]">
      <div className="mx-auto w-full max-w-6xl px-4 pt-6 sm:px-6">
        {loading || !book ? (
          <div className="grid gap-6 lg:grid-cols-[210px_1fr_250px]" aria-hidden>
            <Sk className="h-[280px] rounded-[3px]" />
            <Sk className="h-[280px] rounded-[3px]" />
            <Sk className="h-[280px] rounded-[3px]" />
          </div>
        ) : (
          <>
            <div className="grid gap-6 lg:grid-cols-[210px_1fr_250px]">
              {/* 封面 + 状态标(works-cover 210×280 + works-intro-status) */}
              <div className="relative mx-auto h-[280px] w-[210px] overflow-hidden rounded-[3px] lg:mx-0">
                <BookCover name={book.name} cover={book.cover} showAuthor={book.author} style={{ borderRadius: 3 }} className="absolute inset-0" />
                <span
                  className="absolute bottom-0 left-0 z-10 w-[160px] truncate pl-3.5 text-base text-white"
                  style={{ background: 'rgba(0,0,0,0.55)', height: 32, lineHeight: '32px' }}
                >
                  {statusLabel(book.status)}
                </span>
              </div>

              {/* 信息区(works-intro-detail) */}
              <div className="min-w-0">
                <h1 className="text-2xl font-normal leading-8 sm:text-[32px] sm:leading-8" style={{ color: TITLE }}>
                  {book.name}
                  <span className="ml-1 text-base sm:text-xl">（作者：{book.author}）</span>
                </h1>
                <div className="mt-3 max-h-[130px] overflow-y-auto text-sm leading-[1.8]" style={{ color: MUTED }}>
                  {book.intro ? book.intro.split(/\n+/).map((p, i) => <p key={i}>{p}</p>) : <p>暂无简介</p>}
                </div>
                {/* 标签 chips(works-intro-tags-item → 站内搜索) */}
                {data?.tags?.length ? (
                  <p className="mt-3 flex flex-wrap items-center gap-1.5 text-sm">
                    <span style={{ color: '#666666' }}>标签：</span>
                    {data.tags.slice(0, 8).map((t) => (
                      <button
                        key={t.tag}
                        type="button"
                        onClick={() => navigate({ view: 'search', q: t.tag })}
                        className="rounded-[3px] px-2 py-0.5 text-xs transition-colors hover:text-[#fa8729]"
                        style={{ background: '#f7f7f7', color: '#666666', border: '1px solid #e8e8e8' }}
                        aria-label={`搜索标签 ${t.tag}`}
                      >
                        {t.tag}
                      </button>
                    ))}
                  </p>
                ) : null}
                {/* 按钮组(ui-btn-orange 圆角3) */}
                <div className="mt-4 flex flex-wrap gap-2.5">
                  <button
                    type="button"
                    onClick={() => firstCh && navigate({ view: 'read', chapterId: firstCh.id })}
                    disabled={!firstCh}
                    className="inline-flex h-9 items-center gap-1.5 rounded-[3px] px-4 text-sm text-white transition-colors hover:bg-[#f59966] active:bg-[#f1854b]"
                    style={{ background: '#f89157', border: '1px solid #ec7d4d', boxShadow: 'inset 0 0 1px rgba(255,255,255,0.5)' }}
                    aria-label="开始阅读"
                  >
                    <BookOpen className="h-3.5 w-3.5" aria-hidden />
                    开始阅读
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate({ view: 'toc', bookId: book.id, page: 1 })}
                    className="inline-flex h-9 items-center gap-1.5 rounded-[3px] px-4 text-sm text-white transition-colors hover:bg-[#f59966] active:bg-[#f1854b]"
                    style={{ background: '#f89157', border: '1px solid #ec7d4d', boxShadow: 'inset 0 0 1px rgba(255,255,255,0.5)' }}
                    aria-label="章节目录"
                  >
                    <ListTree className="h-3.5 w-3.5" aria-hidden />
                    章节目录
                  </button>
                  {/* TXT 下载: 全站唯一允许的 <a href>(契约出口) */}
                  <a
                    href={`/api/public/download?book=${encodeURIComponent(book.id)}`}
                    className="inline-flex h-9 items-center rounded-[3px] px-4 text-sm text-[#5a4b32] transition-colors hover:bg-[#faead0]"
                    style={{ background: 'linear-gradient(180deg, #fffdf9, #fef8f0)', border: '1px solid #e0cfb1' }}
                  >
                    TXT 下载
                  </a>
                </div>
                {/* works-status 数据栅格(真站 总点击/收藏/推荐 → 字数/分类/更新时间, 降级①) */}
                <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm" style={{ color: '#666666', listStyle: 'none' }}>
                  <li>字数:{formatWords(book.wordCount)}</li>
                  <li>分类:{book.category}</li>
                  <li>状态:{statusLabel(book.status)}</li>
                  <li>更新:{fmtDate(book.updatedAt)}</li>
                </ul>
              </div>

              {/* 作者卡(works-author-wr; 等级/签约字段降级②) */}
              <aside className="rounded-[3px] border border-[#f0f0f0] p-4">
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden
                    className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full text-lg text-white"
                    style={{ background: `linear-gradient(135deg, ${ORANGE}, #ff9a6a)` }}
                  >
                    {book.author.slice(0, 1)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-base font-bold" style={{ color: TEXT }}>{book.author}</p>
                    <p className="text-xs" style={{ color: MUTED }}>作者</p>
                  </div>
                </div>
                <dl className="mt-3 space-y-1 text-[13px]" style={{ color: '#666666' }}>
                  <dd>分类：{book.category}</dd>
                  <dd>状态:{statusLabel(book.status)}</dd>
                  <dd>字数:{formatWords(book.wordCount)}</dd>
                </dl>
                <button
                  type="button"
                  onClick={() => navigate({ view: 'category', cat: book.categoryId || undefined })}
                  className="mt-3 w-full rounded-[3px] py-1.5 text-xs text-white transition-colors hover:bg-[#f59966]"
                  style={{ background: '#f89157', border: '1px solid #ec7d4d' }}
                  aria-label={`查看${book.category}分类`}
                >
                  更多{book.category}
                </button>
              </aside>
            </div>

            {/* 章节区(works-chapter-wr.works-stack) */}
            <section className="mt-8" aria-label="章节列表">
              {/* works-chapter-menu active 橙 tab(2px #ff9a6a 底线) */}
              <ul className="flex gap-1 border-b-2" style={{ borderColor: '#ff9a6a', listStyle: 'none' }}>
                <li>
                  <button
                    type="button"
                    onClick={() => navigate({ view: 'toc', bookId: book.id, page: 1 })}
                    className="block bg-white px-4 py-2 text-sm font-bold text-[#fa8729]"
                    aria-label="查看完整章节目录"
                  >
                    查看完整章节目录
                  </button>
                </li>
                <li className="ml-auto hidden items-center sm:flex">
                  <span className="text-xs" style={{ color: MUTED }}>共 {data?.tocTotal ?? chapters.length} 章</span>
                </li>
              </ul>
              {/* works-chapter-top 最新章行(降级④: 当前目录页尾部) */}
              <div className="flex flex-wrap items-center gap-2 border-b border-dashed border-[#e5e5e5] py-3 text-sm">
                <span className="font-bold" style={{ color: TEXT }}>最新章：</span>
                {latestCh ? (
                  <button
                    type="button"
                    onClick={() => navigate({ view: 'read', chapterId: latestCh.id })}
                    className="font-bold transition-colors hover:text-[#fa8729]"
                    style={{ color: '#cd1604' }}
                    aria-label={`阅读最新章 ${latestCh.title}`}
                  >
                    {latestCh.title}
                  </button>
                ) : (
                  <span style={{ color: MUTED }}>暂无章节</span>
                )}
                <span className="text-xs" style={{ color: MUTED }}>{fmtDate(book.updatedAt)}</span>
              </div>
              {/* 章节网格(works-chapter-item 294px 列; visited #A75646 在 index.css) */}
              <ol className="grid grid-cols-1 gap-y-3 pt-4 sm:grid-cols-2 lg:grid-cols-4" style={{ listStyle: 'none' }}>
                {latestFirst.slice(0, 50).map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => navigate({ view: 'read', chapterId: c.id })}
                      className="block max-w-full truncate text-left text-sm transition-colors hover:text-[#fa8729]"
                      style={{ color: c.id === currentChapterId ? '#fa8729' : TEXT }}
                      aria-label={`阅读 ${c.title}`}
                    >
                      {c.title}
                    </button>
                  </li>
                ))}
              </ol>
              {chapters.length >= 100 && (
                <p className="pt-4 text-center text-xs" style={{ color: MUTED }}>
                  <button
                    type="button"
                    onClick={() => navigate({ view: 'toc', bookId: book.id, page: data?.tocTotalPages || 1 })}
                    className="underline transition-colors hover:text-[#fa8729]"
                    style={{ color: ORANGE }}
                    aria-label="查看全部章节"
                  >
                    …更多章节请看完整目录
                  </button>
                </p>
              )}
            </section>
          </>
        )}
      </div>
      <p className="pt-6 text-center text-xs" style={{ color: MUTED }}>{site.name} · 章节数据随采集更新</p>
    </div>
  )
}
