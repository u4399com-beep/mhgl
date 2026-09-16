// ============================================================
// [R26-3-2] kks101(101看書) 分类页克隆 —— 按 https://101kks.com/novels/class/3_1.html 真站快照逐节还原
// (/tmp/r26/kks101-cat3.html + kks101-style.css 实测)
//
// 真站 DOM(.container > .mybox 单大白盒):
//   ├ h3.mytitle 小說分類
//   ├ .weekl_yrank > ul.droplist   分类筛选条(边 1px #56a6c3/底 rgb(232,244,255)/圆角 5px/padding 15px/居中;
//   │                              li inline-block 14px; li.active a: #404040/15px/700; 链接为 .tag 家族蓝 #1f6cb2)
//   ├ .newnovels.newnovels2        「{分類名}小說推薦」封面网格(li 宽 14.285%=7 列/padding 9px 10px;
//   │                              .imgbox 125×180/阴影 0 1px 3px rgb(0 0 0/30%)/hover 图 scale 1.1;
//   │                              h3 14px #222; h4 12px #666)
//   ├ ul.row > li.col-88           h3.mytitle 點擊排行 + .newbox > ul#article_list_content:
//   │                              li flex/border-b #eee/padding 20px 0/序号计数;
//   │                              .imgbox 100×140; .newnav h3 a 18px #000(hover #1f6cb2);
//   │                              .labelbox label(右边线 1px #ddd/#999/14px) 作者|分類|狀態;
//   │                              ol.ellipsis_2 #777/line-height 150%; .zxzj 13px #999(「最近章節」框字);
//   │                              .newright 140px: .piaos 圆号(26px/前3 红#f00·橙rgb(255,111,0)·黄rgb(222,204,1));
//   │                              .btn-tp 點擊閱讀(红底白字/line-height 30px) + .btn-jrsj 加入書架(白底边 #ddd #666)
//   └ .pages > .pagelink           分页(a: 底 #f1f1f1/字 #7a7a7a/min-width 45px/高 35px/圆角 3px, hover 白底;
//                                   strong 当前页: 底 #caf1ff/字 #1f6cb2/700; << prev 数字 next >>)
// 响应式(真站): ≤990px col 全宽; ≤767px .imgbox 80×115、newnovels li 23%(4 列)。
// 注: 真站本页无面包屑, 页头即「小說分類」标题; 列表行右列按钮移动端隐藏(空间不足)。
// ============================================================
'use client'

import { useEffect, useState } from 'react'
import type { SiteCategoryProps } from '../shared'
import { usePublic } from '../../ctx'
import { fetchCategories } from '../../data'
import type { CategoryItem } from '../../types'
import { BookCover } from '../../BookCover'
import { ErrorState, Sk, bookNavProps } from '../../bits'
import { fmtDate, formatWords } from '../../seo'

/** [R26-3-2] 真站实测色值(kks101-style.css) */
const BLUE = '#1f6cb2'
const TAG_BORDER = '#56a6c3'
const TAG_BG = '#e8f4ff'
const RANK_GOLD = ['#f00', 'rgb(255,111,0)', 'rgb(222,204,1)'] // .newbox/.ranking 前 3 序号徽章
const LINE = '#eee'

/** 繁体状态文案(真站 status0=連載/status1=完本, 简转繁对齐真站用词) */
function twStatus(s?: string | null): string {
  if (s === 'completed') return '完本'
  if (s === 'ongoing') return '連載'
  return '未知'
}

/** [R26-3-2] .pages/.pagelink 分页(真站双类嵌套: a 底 #f1f1f1 字 #7a7a7a; strong 当前 #caf1ff/#1f6cb2) */
function KksPagelink({ page, totalPages, onGo }: { page: number; totalPages: number; onGo: (p: number) => void }) {
  if (totalPages <= 1) return null
  const start = Math.max(1, Math.min(page - 4, totalPages - 9))
  const nums = Array.from({ length: Math.min(10, totalPages) }, (_, i) => start + i)
  return (
    <nav aria-label="分頁" className="flex flex-wrap items-center justify-center py-[21px] text-center">
      {page > 1 && (
        <button type="button" onClick={() => onGo(1)} className="kks-pg" aria-label="第一頁">
          &lt;&lt;
        </button>
      )}
      {page > 1 && (
        <button type="button" onClick={() => onGo(page - 1)} className="kks-pg" aria-label="上一頁">
          &lt;
        </button>
      )}
      {nums.map((n) =>
        n === page ? (
          <strong key={n} className="kks-pg kks-pg-cur">
            {n}
          </strong>
        ) : (
          <button key={n} type="button" onClick={() => onGo(n)} className="kks-pg" aria-label={`第 ${n} 頁`}>
            {n}
          </button>
        ),
      )}
      {page < totalPages && (
        <button type="button" onClick={() => onGo(page + 1)} className="kks-pg" aria-label="下一頁">
          &gt;
        </button>
      )}
      {page < totalPages && (
        <button type="button" onClick={() => onGo(totalPages)} className="kks-pg" aria-label="最後一頁">
          &gt;&gt;
        </button>
      )}
    </nav>
  )
}

export function Kks101Category({ data, loading, error, catName, cat, page }: SiteCategoryProps) {
  const { navigate } = usePublic()

  // [R26-3-2] 分类筛选条数据(droplist: 全部分類 + 各分类; 真站为站内全分类 0~10)
  const [cats, setCats] = useState<CategoryItem[] | null>(null)
  useEffect(() => {
    let alive = true
    fetchCategories()
      .then((d) => {
        if (alive) setCats(d || [])
      })
      .catch(() => {
        if (alive) setCats([])
      })
    return () => {
      alive = false
    }
  }, [])

  const bs = data?.books || []
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.size)) : 1
  const grid = bs.slice(0, 12) // 「{分類名}小說推薦」封面网格(真站 12 个)
  const rows = bs.slice(12) // 「點擊排行」列表行(真站 20 个, props 余量)

  if (error) {
    return (
      <div className="mx-auto w-full max-w-[1112px] px-4 py-10 sm:px-6">
        <ErrorState message="分類載入失敗" detail={error} />
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-[1112px] px-4 pb-10 sm:px-6" style={{ color: '#333' }}>
      {/* ===== 面包屑(真站分類页无 .bread, 按同族书页/目录页规格补齐页头路径) ===== */}
      <div className="kks-bread pt-3 text-[14px] font-normal">
        <button type="button" onClick={() => navigate({ view: 'home' })} className="text-[14px] transition-colors hover:underline" style={{ color: BLUE }} aria-label="返回首頁">
          首頁
        </button>
        <span className="mx-1 text-[#999]">&gt;</span>
        <span className="text-[#333]">{catName}</span>
      </div>
      <div className="kks-mybox">
        {/* ===== h3.mytitle 小說分類 ===== */}
        <h1 className="kks-mytitle">小說分類</h1>

        {/* ===== .weekl_yrank 分类筛选条 ===== */}
        <div className="mb-[15px] rounded-[5px] p-[15px] text-center" style={{ border: `1px solid ${TAG_BORDER}`, background: TAG_BG }} role="navigation" aria-label="分類篩選">
          <ul className="flex flex-wrap items-center justify-center gap-x-1 gap-y-2">
            <li>
              <button
                type="button"
                onClick={() => navigate({ view: 'category', page: 1 })}
                className={`px-2 text-[14px] transition-colors hover:opacity-75 ${!cat ? 'text-[15px] font-bold text-[#404040]' : 'text-[#1f6cb2]'}`}
                aria-current={!cat ? 'page' : undefined}
              >
                全部分類
              </button>
            </li>
            {(cats || []).map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => navigate({ view: 'category', cat: c.id, page: 1 })}
                  className={`px-2 text-[14px] transition-colors hover:opacity-75 ${cat === c.id ? 'text-[15px] font-bold text-[#404040]' : 'text-[#1f6cb2]'}`}
                  aria-current={cat === c.id ? 'page' : undefined}
                >
                  {c.name}
                </button>
              </li>
            ))}
            {cats === null && (
              <li className="flex items-center gap-2" aria-hidden>
                {Array.from({ length: 6 }).map((_, i) => (
                  <Sk key={i} className="h-4 w-14" />
                ))}
              </li>
            )}
          </ul>
        </div>

        {/* ===== .newnovels.newnovels2 封面网格(桌面 7 列/平板 4 列/移动 3 列) ===== */}
        <section>
          <h2 className="kks-mytitle">{catName}小說推薦</h2>
          {loading && !data ? (
            <ul className="grid grid-cols-3 gap-y-3 sm:grid-cols-4 lg:grid-cols-7" aria-hidden>
              {Array.from({ length: 7 }).map((_, i) => (
                <li key={i} className="px-2.5 py-2">
                  <Sk className="aspect-[125/180] w-full" />
                  <Sk className="mt-1.5 h-3.5 w-4/5" />
                  <Sk className="mt-1 h-3 w-1/2" />
                </li>
              ))}
            </ul>
          ) : grid.length ? (
            <ul className="grid grid-cols-3 gap-y-3 sm:grid-cols-4 lg:grid-cols-7">
              {grid.map((b) => (
                <li key={b.id} {...bookNavProps(navigate, b.id)} aria-label={`查看《${b.name}》详情`} className="kks-cell cursor-pointer px-2.5 py-2 text-center">
                  <span className="relative mx-auto block w-full overflow-hidden sm:max-w-[125px]" style={{ aspectRatio: '125 / 180', boxShadow: '0 1px 3px rgb(0 0 0 / 30%)' }}>
                    <BookCover name={b.name} cover={b.cover} className="absolute inset-0 h-full w-full" style={{ borderRadius: 0 }} />
                  </span>
                  <h3 className="mt-1.5 truncate text-[13px] text-[#222] sm:text-[14px]" title={b.name}>
                    {b.name}
                  </h3>
                  <h4 className="truncate pt-px text-[12px] text-[#666]">{b.author}</h4>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-6 text-center text-sm text-[#999]">暫無書籍</p>
          )}
        </section>

        {/* ===== 點擊排行(.newbox 列表行: 封面+标题+label 行+2 行简介+最近章節) · 页头带共 N 本 ===== */}
        <section className="mt-6">
          <h2 className="kks-mytitle">點擊排行（共 {data?.total || 0} 本）</h2>
          {loading && !data ? (
            <ul aria-hidden>
              {Array.from({ length: 4 }).map((_, i) => (
                <li key={i} className="flex border-b py-5" style={{ borderColor: LINE }}>
                  <Sk className="hidden aspect-[5/7] w-20 shrink-0 rounded-none sm:block" />
                  <div className="min-w-0 flex-1 space-y-2 sm:px-[15px]">
                    <Sk className="h-4 w-2/3" />
                    <Sk className="h-3 w-1/2" />
                    <Sk className="h-3 w-full" />
                    <Sk className="h-3 w-5/6" />
                  </div>
                </li>
              ))}
            </ul>
          ) : rows.length ? (
            <ul>
              {rows.map((b, i) => (
                <li key={b.id} className="flex justify-between border-b py-5" style={{ borderColor: LINE }}>
                  {/* .imgbox 100×140(移动 80 宽, 真站 ≤767px) */}
                  <button
                    type="button"
                    onClick={() => navigate({ view: 'book', bookId: b.id })}
                    aria-label={`查看《${b.name}》详情`}
                    className="kks-cell relative hidden w-20 shrink-0 overflow-hidden sm:block"
                    style={{ aspectRatio: '5 / 7', boxShadow: '0 1px 3px rgb(0 0 0 / 30%)' }}
                  >
                    <BookCover name={b.name} cover={b.cover} className="absolute inset-0 h-full w-full" style={{ borderRadius: 0 }} />
                  </button>
                  {/* .newnav */}
                  <div className="min-w-0 flex-1 sm:px-[15px]">
                    <h3>
                      <button
                        type="button"
                        onClick={() => navigate({ view: 'book', bookId: b.id })}
                        className="kks-newtitle block max-w-full truncate text-left text-[16px] text-black transition-colors sm:text-[18px]"
                        aria-label={`查看《${b.name}》详情`}
                      >
                        {b.name}
                      </button>
                    </h3>
                    <div className="flex flex-wrap items-center py-2.5 text-[13px] text-[#999] sm:text-[14px]">
                      <span className="kks-labelbox-item">{b.author}</span>
                      <span className="kks-labelbox-item">{b.category || '小說'}</span>
                      <span className="kks-labelbox-item">{twStatus(b.status)}</span>
                      {b.wordCount > 0 && <span className="kks-labelbox-item">{formatWords(b.wordCount)}</span>}
                    </div>
                    {b.intro && (
                      <p className="mb-[15px] line-clamp-2 leading-[1.5] text-[#777]">{b.intro}</p>
                    )}
                    <div className="flex items-center justify-between text-[13px] text-[#999]">
                      <p className="min-w-0 truncate">
                        <span className="mr-[5px] inline-block px-[5px]" style={{ border: `1px solid ${LINE}` }}>
                          最近章節
                        </span>
                        {b.latestChapter || '—'}
                      </p>
                      <span className="ml-3 shrink-0">{b.updatedAt ? fmtDate(b.updatedAt) : ''}</span>
                    </div>
                  </div>
                  {/* .newright: 圆号 + 双按钮(移动端隐藏) */}
                  <div className="hidden w-[140px] shrink-0 pl-3 lg:block">
                    <div className="flex justify-end pb-[30px]">
                      <span
                        className="flex h-[26px] w-[26px] items-center justify-center rounded-full text-[13px]"
                        style={{ background: i < 3 ? RANK_GOLD[i] : '#eee', color: i < 3 ? '#fff' : '#777' }}
                        aria-label={`排名第 ${i + 1}`}
                      >
                        {i + 1}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => navigate({ view: 'book', bookId: b.id })}
                      className="kks-btn mb-2.5 block w-full text-[15px]"
                      style={{ background: '#f00' }}
                      aria-label={`閱讀《${b.name}》`}
                    >
                      點擊閱讀
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate({ view: 'book', bookId: b.id })}
                      className="block w-full rounded-[4px] text-[15px] leading-[30px] transition-shadow hover:shadow-[0_0_10px_rgba(0,0,0,0.2)]"
                      style={{ background: '#fff', border: '1px solid #ddd', color: '#666' }}
                      aria-label={`查看《${b.name}》書頁加入書架`}
                    >
                      加入書架
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-6 text-center text-sm text-[#999]">本分類暫無更多書籍</p>
          )}
        </section>

        {/* ===== .pages > .pagelink 分页 ===== */}
        <KksPagelink page={page} totalPages={totalPages} onGo={(p) => navigate({ view: 'category', cat, page: p })} />
      </div>
    </div>
  )
}
