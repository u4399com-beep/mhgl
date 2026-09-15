// ============================================================
// [R26-2-30] 霹雳书屋 克隆书籍详情页 —— https://www.pilishuwu.com/{cat}/{id}/info.html
// (wmcms 作品页 works-* 形态; 样本 /tmp/sites/pilishuwu-book.html(《全球高考》) +
//  wmcms.page.works.css 全文实测)
//
// 真站 DOM(#special_bg padding-top 50px > .ui-wm 1200px):
//   .works-intro-wr(左 880px, 白底 1px #cec7bd 边, shadow 0 1px 1px rgba(0,0,0,.1)):
//     .works-cover(250×308, margin 34px 20px 0 20px): img 210×280 margin-left 20px +
//       label.works-intro-status 角标(absolute left 20px top 250px, 160×32, 16px/32px 白字,
//       橙 sprite -339px 0 → 实测 sprite 橙带 #f89157 系)
//     .works-intro-detail(574px): .works-intro-text(margin 34px 0 20px, pb 10px, 虚线 #999 底边)
//       h2.works-intro-title strong 32px/32px 微软雅黑 #555 normal + （作者：xx）
//       p.works-intro-short #999 height 130px line-height 180% overflow:auto
//       p.works-intro-tags「标签：」+ a.works-intro-tags-item(padding 0 10px, lh 18px #666,
//         1px #efddd3 边, radius 18px 圆片)
//       .works-intro-active: a.works-intro-view.ui-btn-orange(112×45, 18px/46px 微软雅黑,
//         #f89157 底/白字/1px #ec7d4d 边, hover #f59966, active #f1854b, radius 3px)
//         「开始阅读」+「章节目录」; 右侧 a.works-report #FF0000「留言反馈」
//     .works-vote(mt 11px, pt 16px, 虚线 #999 顶边): .works-status(636×104) 统计行
//       (真站 ul×3: 总点击/日/周/月…; 本侧数据口径 → 总字数/状态/分类/最新章/更新时间)
//   .ui-right(299px) 作者卡 .works-author-wr(sprite 米盒 299×298): face 93×93 圆角2px +
//     dt.works-author-name 16px/16px 微软雅黑 #555 + dd(22px 行高) + 作者公告
//     (.works-author-title 16px 白字 sprite 橙头条 + .works-author-notice 256px 96px lh24px)
//   .works-chapter-wr.ui-wm(章节区):
//     ul.words-xone-menu(52px, 底线 1px #dbd9d6): li a(53px/53px, 24px 微软雅黑 #555,
//       padding 0 25px, 右 1px #dbd9d6 边; li.active a 高 49px + 底 4px #ff9a6a 橙 tab)
//     .works-chapter-top: ul.works-chapter-log(16px 0 0 20px)「最新章：」+ a.works-ft-new
//       #cd1604 红 + 时间 .ui-text-gray6 #666
//     ol.chapter-page-new.works-chapter-list 四列网格: span.works-chapter-item(float 294px, pt 20px)
//       a 14px #333 省略号(hover #fa8729, :visited #A75646)
//     .chapter-page-pager: .chapter-page-btn(68×30, #f1f1f1 底 #666, active/hover #ff9a6a 白字)
//
// 降级说明: ①works-vote 鲜花/鸡蛋 sprite 圆钮无对应数据 → 统计行改书档字段(works-status DNA)。
// ②works-report「留言反馈」→ TXT 下载 <a>(契约唯一允许外链, ui-btn-pink 米色次按钮形态)。
// ③作者卡 dd 行真站为 等级/签约/上架(无数据) → 状态/字数/更新; 作者公告空时显示真站原文
//   「此作者暂时没有公告！」, 有关键词则展示关键词 chips。
// ============================================================
'use client'

import { ChevronLeft, ChevronRight, Download, Play } from 'lucide-react'
import type { SiteBookProps } from '../shared'
import { usePublic } from '../../ctx'
import { BookCover } from '../../BookCover'
import { ErrorState, Sk } from '../../bits'
import { fmtDate, formatWords, statusLabel } from '../../seo'

const PILI_ORANGE = '#fd8929'
const PILI_BTN_BG = '#f89157' // ui-btn-orange
const PILI_BTN_BORDER = '#ec7d4d'
const PILI_RED = '#cd1604' // works-ft-new 最新章红
const PILI_TITLE = '#555555'
const PILI_TEXT = '#333333'

/** [R26-2-31] 橙色大按钮(ui-btn-orange 112×45)与米色次按钮 */
function PiliOrangeBtn({ label, onClick, ariaLabel }: { label: string; onClick: () => void; ariaLabel?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel || label}
      className="inline-flex h-[45px] w-[112px] items-center justify-center gap-1 rounded-[3px] border text-lg transition-colors"
      style={{ background: PILI_BTN_BG, color: '#ffffff', borderColor: PILI_BTN_BORDER, boxShadow: 'inset 0 0 1px rgba(255,255,255,0.5)' }}
      onMouseEnter={(e) => { e.currentTarget.style.background = '#f59966' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = PILI_BTN_BG }}
    >
      {label}
    </button>
  )
}

export function PiliBook({ data, loading, error, tocPage, currentChapterId }: SiteBookProps) {
  const { navigate } = usePublic()
  const book = data?.book
  const chapters = data?.chapters || []
  const tags = data?.tags || []

  // 关键词兜底 chips(真站 tags-show; tags 为空时拆 keywords)
  const tagChips = tags.length
    ? tags.map((t) => t.tag)
    : (book?.keywords || '').split(/[,，、/|]+/).map((s) => s.trim()).filter(Boolean).slice(0, 6)

  const totalPages = data?.tocTotalPages || 1
  const goTocPage = (p: number) => book && navigate({ view: 'book', bookId: book.id, page: p })

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 pb-12 pt-6 sm:px-6" aria-hidden>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_299px]">
          <div className="border bg-white p-5" style={{ borderColor: '#cec7bd' }}>
            <div className="flex flex-col gap-6 sm:flex-row">
              <Sk className="h-[233px] w-[175px] shrink-0" />
              <div className="min-w-0 flex-1 space-y-3">
                <Sk className="h-8 w-2/3" />
                <Sk className="h-4 w-1/3" />
                <Sk className="h-[130px] w-full" />
                <div className="flex gap-2.5">
                  {Array.from({ length: 3 }).map((_, i) => <Sk key={i} className="h-6 w-16 rounded-full" />)}
                </div>
                <div className="flex gap-2.5 pt-2">
                  <Sk className="h-[45px] w-[112px] rounded-[3px]" />
                  <Sk className="h-[45px] w-[112px] rounded-[3px]" />
                </div>
              </div>
            </div>
          </div>
          <Sk className="hidden h-[298px] lg:block" />
        </div>
        <Sk className="mt-6 h-[52px] w-full" />
        <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 12 }).map((_, i) => <Sk key={i} className="h-4 w-full" />)}
        </div>
      </div>
    )
  }

  if (error || !book) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 pb-12 pt-10 sm:px-6">
        <ErrorState message={error ? '书籍信息加载失败' : '书籍不存在'} detail={error || undefined} />
      </div>
    )
  }

  return (
    <div className="w-full pb-12 pt-6" style={{ color: PILI_TEXT, background: 'transparent' }}>
      {/* ============ 书籍信息区(works-intro-wr + 作者卡) ============ */}
      <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_299px]">
        <div className="border bg-white pb-4" style={{ borderColor: '#cec7bd', boxShadow: '0 1px 1px rgba(0,0,0,0.1)' }}>
          <div className="flex flex-col gap-4 p-5 sm:flex-row sm:gap-0 sm:p-0">
            {/* 左封面 210×280(works-cover 250×308 内) + 完结角标(works-intro-status) */}
            <div className="relative mx-auto w-[175px] shrink-0 pt-6 sm:mx-0 sm:ml-5 sm:mr-5 sm:mt-[34px] sm:w-[210px]" style={{ height: 'fit-content' }}>
              <BookCover name={book.name} cover={book.cover} showAuthor={book.author} style={{ borderRadius: 0 }} className="h-[233px] w-[175px] sm:h-[280px] sm:w-[210px]" />
              <label
                className="absolute left-1/2 flex h-8 w-[140px] -translate-x-1/2 items-center pl-3 text-base text-white sm:left-5 sm:w-[160px] sm:-translate-x-0"
                style={{ bottom: 14, background: PILI_BTN_BG, boxShadow: 'inset 0 0 1px rgba(255,255,255,0.5)' }}
              >
                {statusLabel(book.status)}
              </label>
            </div>

            {/* 右信息列(works-intro-detail) */}
            <div className="min-w-0 flex-1 sm:pr-6">
              <div className="border-b border-dashed pb-2.5 sm:mb-0 sm:mt-[34px]" style={{ borderColor: '#999999' }}>
                {/* 书名 32px 微软雅黑 #555 + （作者：xx） */}
                <h1 className="pb-2.5 text-2xl font-normal leading-[32px] sm:text-[32px]" style={{ color: PILI_TITLE }}>
                  <strong className="font-normal">{book.name}</strong>
                  <span className="text-base">（作者：{book.author}）</span>
                </h1>
                {/* 简介(works-intro-short: #999 130px 高滚动 180% 行高) */}
                <p
                  className="mt-1 overflow-y-auto whitespace-pre-line text-[13px] leading-[1.8]"
                  style={{ color: '#999999', maxHeight: 130 }}
                >
                  {book.intro || '暂无简介'}
                </p>
              </div>

              {/* 标签行(works-intro-tags: 圆片 chips #efddd3 边) */}
              <p className="flex flex-wrap items-center gap-1.5 pt-4 text-sm" style={{ color: PILI_TEXT }}>
                <span>标签：</span>
                {book.category ? (
                  <button
                    type="button"
                    onClick={() => navigate({ view: 'category', cat: book.categoryId || undefined })}
                    aria-label={`浏览 ${book.category} 分类`}
                    className="rounded-full border px-2.5 leading-[18px] transition-colors hover:text-[#fa8729]"
                    style={{ color: '#666666', borderColor: '#efddd3' }}
                  >
                    {book.category}
                  </button>
                ) : null}
                {tagChips.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => navigate({ view: 'keyword', tag: t })}
                    aria-label={`查看「${t}」标签作品`}
                    className="rounded-full border px-2.5 leading-[18px] transition-colors hover:text-[#fa8729]"
                    style={{ color: '#666666', borderColor: '#efddd3' }}
                  >
                    {t}
                  </button>
                ))}
              </p>

              {/* 按钮组(works-intro-active: 开始阅读/章节目录 橙大钮 + TXT 下载米色次钮) */}
              <div className="flex flex-wrap items-center gap-2.5 pt-5">
                <PiliOrangeBtn
                  label="开始阅读"
                  ariaLabel={`开始阅读《${book.name}》第一章`}
                  onClick={() => chapters[0] && navigate({ view: 'read', chapterId: chapters[0].id })}
                />
                <PiliOrangeBtn
                  label="章节目录"
                  ariaLabel={`查看《${book.name}》完整目录`}
                  onClick={() => navigate({ view: 'toc', bookId: book.id, page: 1 })}
                />
                {/* TXT 下载(契约唯一允许 <a>) */}
                <a
                  href={`/api/public/download?book=${book.id}`}
                  aria-label={`下载《${book.name}》TXT 全本`}
                  className="inline-flex h-[45px] w-[112px] items-center justify-center gap-1 rounded-[3px] border text-base transition-colors"
                  style={{ color: '#b6724d', background: '#fffbf6', borderColor: '#e0cfb1' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#fcf1e1' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = '#fffbf6' }}
                >
                  <Download className="h-4 w-4" aria-hidden />
                  TXT
                </a>
                {/* 真站右侧 works-report 红字位 → 状态徽标文字(数据口径) */}
                <span className="ml-auto hidden text-sm text-[#ff0000] sm:inline">{statusLabel(book.status)}</span>
              </div>
            </div>
          </div>

          {/* 统计行(works-vote 虚线顶边 + works-status 行式统计; 真站鲜花/鸡蛋无数据源 → 书档字段) */}
          <div className="mx-5 mt-4 border-t border-dashed pt-4" style={{ borderColor: '#999999' }}>
            <ul className="flex flex-wrap gap-x-6 gap-y-1.5 text-[13px]" style={{ color: '#666666', listStyle: 'none' }}>
              <li>总字数：<span className="font-bold" style={{ color: PILI_TEXT }}>{formatWords(book.wordCount)}</span></li>
              <li>作品状态：<span style={{ color: PILI_TEXT }}>{statusLabel(book.status)}</span></li>
              <li>所属分类：
                <button
                  type="button"
                  onClick={() => navigate({ view: 'category', cat: book.categoryId || undefined })}
                  className="transition-colors hover:text-[#fa8729]"
                  style={{ color: PILI_TEXT }}
                  aria-label={`浏览 ${book.category} 分类`}
                >
                  {book.category || '未知'}
                </button>
              </li>
              <li className="min-w-0 max-w-full truncate">最新章节：<span style={{ color: PILI_RED }}>{book.latestChapter || '暂无'}</span></li>
              <li>更新时间：<span style={{ color: PILI_TEXT }}>{fmtDate(book.updatedAt) || '未知'}</span></li>
            </ul>
          </div>
        </div>

        {/* 右侧作者卡(works-author-wr 299×298 sprite 米盒 → 白卡复刻) */}
        <aside className="min-w-0 self-start border bg-white" style={{ borderColor: '#cec7bd', boxShadow: '0 1px 1px rgba(0,0,0,0.1)' }} aria-label="作者信息">
          <div className="flex h-10 items-center pl-6 text-base text-white" style={{ background: PILI_BTN_BG }}>
            作者信息
          </div>
          <div className="flex items-center gap-4 p-5">
            <span
              className="flex h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-[2px] text-2xl font-bold text-white"
              style={{ background: `linear-gradient(135deg, ${PILI_BTN_BG}, ${PILI_ORANGE})` }}
              aria-hidden
            >
              {(book.author || '?').slice(0, 1)}
            </span>
            <dl className="min-w-0">
              <dt className="truncate text-base" style={{ color: PILI_TITLE }}>{book.author}</dt>
              <dd className="mt-1 text-xs leading-[22px]" style={{ color: '#666666' }}>作品状态：{statusLabel(book.status)}</dd>
              <dd className="text-xs leading-[22px]" style={{ color: '#666666' }}>作品字数：{formatWords(book.wordCount)}</dd>
              <dd className="truncate text-xs leading-[22px]" style={{ color: '#666666' }}>最近更新:{fmtDate(book.updatedAt) || '未知'}</dd>
            </dl>
          </div>
          <div className="border-t px-5 pb-5" style={{ borderColor: '#f0ece6' }}>
            <h3 className="pt-3 text-sm font-bold" style={{ color: PILI_TEXT }}>作品标签</h3>
            <p className="mt-2 flex flex-wrap gap-1.5">
              {tagChips.length ? (
                tagChips.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => navigate({ view: 'keyword', tag: t })}
                    aria-label={`查看「${t}」标签作品`}
                    className="rounded-full border px-2 py-0.5 text-xs transition-colors hover:text-[#fa8729]"
                    style={{ color: '#666666', borderColor: '#efddd3' }}
                  >
                    {t}
                  </button>
                ))
              ) : (
                <span className="text-xs" style={{ color: '#999999' }}>此作品暂时没有标签！</span>
              )}
            </p>
          </div>
        </aside>
      </div>

      {/* ============ 章节预览区(works-chapter-wr: 橙 tab 头 + 四列网格 + 翻页) ============ */}
      <section className="mx-auto mt-5 w-full max-w-6xl px-4 sm:px-6" aria-label="章节列表预览">
        {/* tab 头(words-xone-menu: 52px + 4px #ff9a6a 橙 tab; 右侧「查看完整目录」转目录页) */}
        <div className="flex items-end justify-between border-b" style={{ borderColor: '#dbd9d6' }}>
          <ul className="flex" style={{ listStyle: 'none' }}>
            <li>
              <span
                className="inline-block border-b-4 px-[25px] pb-[5px] text-lg leading-[49px] sm:text-2xl"
                style={{ color: PILI_TITLE, borderColor: PILI_ORANGE_LIGHT }}
              >
                章节目录
              </span>
            </li>
          </ul>
          <button
            type="button"
            onClick={() => navigate({ view: 'toc', bookId: book.id, page: 1 })}
            aria-label={`查看《${book.name}》完整章节目录(共 ${data?.tocTotal ?? chapters.length} 章)`}
            className="inline-flex min-h-[44px] items-center gap-0.5 pb-1 text-sm transition-colors hover:text-[#fa8729] lg:min-h-0"
            style={{ color: '#666666' }}
          >
            查看完整目录(共 {data?.tocTotal ?? chapters.length} 章)
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </div>

        {/* 最新章行(works-chapter-log: 最新章 #cd1604 红 + 时间 #666) */}
        <p className="px-1 pt-4 text-[13px]" style={{ color: '#666666' }}>
          <span className="font-bold">最新章：</span>
          <span style={{ color: PILI_RED }}>{book.latestChapter || '暂无'}</span>
          <span className="pl-2.5">{fmtDate(book.updatedAt)}</span>
        </p>

        {/* 四列章节网格(works-chapter-list: item 294px × 4; currentChapterId 高亮) */}
        {chapters.length ? (
          <ol className="mt-2 grid grid-cols-1 gap-y-3 sm:grid-cols-2 lg:grid-cols-4" style={{ listStyle: 'none' }}>
            {chapters.map((c) => {
              const active = currentChapterId && c.id === currentChapterId
              return (
                <li key={c.id} className="min-w-0 pr-4 pt-2">
                  <button
                    type="button"
                    onClick={() => navigate({ view: 'read', chapterId: c.id })}
                    aria-label={active ? `正在阅读:${c.title}` : `阅读 ${c.title}`}
                    aria-current={active ? 'true' : undefined}
                    className="block max-w-full truncate text-left text-sm transition-colors hover:text-[#fa8729]"
                    style={{ color: active ? '#fa8729' : PILI_TEXT, fontWeight: active ? 700 : 400 }}
                  >
                    {active ? <Play className="mr-1 inline h-3 w-3" aria-hidden /> : null}
                    {c.title}
                  </button>
                </li>
              )
            })}
          </ol>
        ) : (
          <p className="py-10 text-center text-sm" style={{ color: '#999999' }}>暂无章节</p>
        )}

        {/* 翻页(chapter-page-pager: 68×30 #f1f1f1, active #ff9a6a) */}
        {totalPages > 1 ? (
          <nav className="mt-6 flex flex-wrap items-center justify-center gap-1" aria-label="目录翻页">
            <button
              type="button"
              disabled={tocPage <= 1}
              onClick={() => goTocPage(tocPage - 1)}
              className="inline-flex h-[30px] items-center justify-center gap-0.5 border-none px-3 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40"
              style={{ background: '#f1f1f1', color: '#666666' }}
              aria-label="上一页目录"
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
              上一页
            </button>
            {Array.from({ length: Math.min(totalPages, 7) }).map((_, i) => {
              let p = i + 1
              if (totalPages > 7 && tocPage > 4) p = Math.min(totalPages - 6 + i, totalPages)
              const active = p === tocPage
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => goTocPage(p)}
                  aria-label={`第 ${p} 页目录`}
                  aria-current={active ? 'page' : undefined}
                  className="inline-flex h-[30px] w-[34px] items-center justify-center border-none text-sm transition-colors"
                  style={active ? { background: PILI_ORANGE_LIGHT, color: '#ffffff' } : { background: '#f1f1f1', color: '#666666' }}
                >
                  {p}
                </button>
              )
            })}
            {totalPages > 7 ? <span className="px-1 text-sm" style={{ color: '#666666' }}>…共 {totalPages} 页</span> : null}
            <button
              type="button"
              disabled={tocPage >= totalPages}
              onClick={() => goTocPage(tocPage + 1)}
              className="inline-flex h-[30px] items-center justify-center gap-0.5 border-none px-3 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40"
              style={{ background: '#f1f1f1', color: '#666666' }}
              aria-label="下一页目录"
            >
              下一页
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            </button>
          </nav>
        ) : null}
      </section>
    </div>
  )
}
