// ============================================================
// [R27-6b-1] x2552(吾爱文学网) 首页克隆 —— 黑冰模板(heibing/css/style.css) 1:1 还原
// 素材等级: Wayback 实测 —— /tmp/r27-f2/x2552-home.html(2023 快照, DOM 逐节核对) +
// R24 轮真站直连实测 style.css 色板(现站已死, 色值以下表为准)。
//
// 真站 DOM(.main 960px):
//   ① 红字公告条(border #E4E4E4/line-height 25px/两行, 真站 960px 居中)
//   ② .board 排行榜横条: .bdtop(2px #33CCFF 边+#D9EDFF 底) + .bdsub(白底 1px 边)
//      + 标题条「xx排行榜」 + 6 封面位(120×150/5px 白边+边框/书名 13px 居中)
//   ③ 中心区: #centeri(1fr)「xx小说网最近更新」ul.update(ul1 [分类]《书名》/ ul2 最新章节 /
//      作者+日期右对齐, li 底 dotted) + #right(190px)「总推荐榜」15 行 + 「最新小说」20 行
// 注: ①真站 .main.m_head 报头与 .m_menu 导航由 SiteHeader X2552 头部承担, 本组件从公告条起渲染
//    ②真站「友情链接」与 .footer 由全局 SiteFooter 承担; 「更多...」行指向站外榜单页不渲染
//    ③真站榜单为推荐票数(无数据源) → 字数热榜替代, 数值列显示字数(口径声明)
// ============================================================
'use client'

import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import type { SiteHomeProps } from '../shared'
import { usePublic } from '../../ctx'
import { fetchBooks } from '../../data'
import { BookCover } from '../../BookCover'
import { Sk, bookNavProps } from '../../bits'
import { fmtDate } from '../../seo'
import type { BookItem } from '../../types'

/** [R27-6b-1] 黑冰模板实测色值(R24 style.css 直测 + 2023 Wayback DOM 佐证) */
const C = {
  text: '#666666',
  link: '#2f468f',
  hover: '#FF6600',
  border: '#E4E4E4',
  dot: '#F2F2F2',
  face: '#F2F2F2',
  blueTop: '#33CCFF',
  blueBg: '#D9EDFF',
} as const

/** [R27-6b-1] 精灵图(wamcc.png)标题条 → 纯 CSS 渐变等价(家族标准替代, 注释声明) */
const TITLE_BAR = 'linear-gradient(180deg, #fbfcfe 0%, #e9eef5 100%)'
const GRAY_BTN = 'linear-gradient(180deg, #ffffff 0%, #e5e5e5 100%)'

/** [R27-6b-1] YY-MM-DD(真站 update 列 26-09-15 形态) / MM-DD(最新小说列表形态) */
function yymmdd(b: BookItem): string {
  const d = fmtDate(b.updatedAt)
  return d ? d.slice(2) : '--'
}
function mmdd(b: BookItem): string {
  const d = fmtDate(b.updatedAt)
  return d ? d.slice(5) : '--'
}

/** [R27-6b-1] 字数短格式(右侧数值列; 真站为推荐票数 → 字数替代口径) */
function shortWords(n?: number | null): string {
  if (!n || n <= 0) return '0'
  if (n >= 10000) return `${Math.round(n / 10000)}万`
  return String(n)
}

/** [R27-6b-1] .block 块容器(1px 边线) */
function blockStyle(): CSSProperties {
  return { border: `1px solid ${C.border}`, marginTop: 8 }
}

/** [R27-6b-1] blocktitle 两形态: withIcon=中央区(橙图标) / label=右栏(灰按钮位 80×30) */
function BlockTitle({ title, withIcon }: { title: string; withIcon?: boolean }) {
  return (
    <div style={{ height: 40, lineHeight: '40px', fontSize: 14, background: TITLE_BAR, overflow: 'hidden' }}>
      {withIcon ? (
        <>
          <i
            aria-hidden
            style={{ display: 'inline-block', width: 12, height: 16, background: C.hover, borderRadius: 2, margin: '12px 10px 0 15px', verticalAlign: 'top' }}
          />
          {title}
        </>
      ) : (
        <span
          style={{
            display: 'inline-block',
            width: 80,
            height: 30,
            lineHeight: '30px',
            margin: '5px 0 0 10px',
            textAlign: 'center',
            fontSize: 12,
            color: C.text,
            background: GRAY_BTN,
            verticalAlign: 'top',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
          }}
        >
          {title}
        </span>
      )}
    </div>
  )
}

export function X2552Home({ books, loading }: SiteHomeProps) {
  const { site, navigate } = usePublic()

  // [R27-6b-1] 榜单维度: 字数最多 24 本(6 封面位 + 15 行榜单)
  const [hot, setHot] = useState<BookItem[]>([])
  const [hotDone, setHotDone] = useState(false)
  useEffect(() => {
    let alive = true
    fetchBooks({ site: site.id, sort: 'words', page: 1, size: 24 })
      .then((d) => {
        if (alive) {
          setHot(d.books || [])
          setHotDone(true)
        }
      })
      .catch(() => {
        if (alive) {
          setHot([])
          setHotDone(true)
        }
      })
    return () => {
      alive = false
    }
  }, [site.id])

  const boardBooks = (hot.filter((b) => b.cover).length >= 6 ? hot.filter((b) => b.cover) : hot).slice(0, 6)
  const rankRows = hot.slice(0, 15)
  const updateRows = books.slice(0, 34)
  const newestRows = books.slice(0, 20)

  return (
    <div className="x2-home w-full px-2 pb-4" style={{ color: C.text, fontSize: 12, lineHeight: 1.2 }}>
      <div className="mx-auto w-full max-w-[960px]">
        {/* ============ ① 红字公告条(2023 Wayback 快照实测: width 960/line-height 25px/red/边 #E4E4E4) ============ */}
        <div style={{ border: `1px solid ${C.border}`, color: 'red', lineHeight: '25px', margin: '5px 0', padding: '2px 0', textAlign: 'left' }}>
          <p style={{ margin: 0, padding: '0 0 0 12px' }}>
            1、{site.name}全面升级，<b>手机版</b>同时上线 欢迎新老书友前来阅读。
          </p>
          <p style={{ margin: 0, padding: '0 0 0 12px' }}>2、感谢大家多年支持，{site.name} 坚持无弹窗广告阅读</p>
        </div>

        {/* ============ ② .board 排行榜横条(bdtop 2px #33CCFF + bdsub 白底) ============ */}
        <div style={{ marginTop: 8 }}>
          <div aria-hidden style={{ height: 2, border: `1px solid ${C.blueTop}`, background: C.blueBg, fontSize: 0 }} />
          <div style={{ padding: 1, background: '#FFFFFF', border: `1px solid ${C.border}` }}>
            <div style={{ position: 'relative', overflow: 'hidden' }}>
              <div style={{ height: 30, lineHeight: '30px', paddingLeft: 35, fontSize: 14, borderBottom: `1px solid ${C.border}`, background: TITLE_BAR }}>
                {site.name}排行榜
              </div>
              <div className="flex overflow-x-auto" style={{ minHeight: 225 }}>
                {loading ? (
                  [0, 1, 2, 3, 4, 5].map((i) => (
                    <div key={i} style={{ padding: '20px 0 8px 21px', width: 135, flex: '0 0 auto' }}>
                      <Sk className="h-[150px] w-[120px]" style={{ borderRadius: 0 }} />
                      <Sk className="mx-auto mt-2 h-3.5 w-20" />
                    </div>
                  ))
                ) : boardBooks.length ? (
                  boardBooks.map((b) => (
                    <div key={b.id} style={{ padding: '20px 0 8px 21px', width: 135, flex: '0 0 auto', fontSize: 13, textAlign: 'center' }}>
                      <button type="button"
                        className="x2-a"
                        style={{ display: 'inline-block', lineHeight: 0, cursor: 'pointer' }}
                        {...bookNavProps(navigate, b.id)}
                        aria-label={`查看《${b.name}》详情`}
                      >
                        <BookCover
                          name={b.name}
                          cover={b.cover}
                          style={{ width: 120, height: 150, borderRadius: 0, border: `1px solid ${C.border}`, padding: 5, background: '#fff' }}
                        />
                      </button>
                      <br />
                      <button type="button"
                        className="x2-a"
                        style={{ display: 'inline-block', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
                        title={b.name}
                        {...bookNavProps(navigate, b.id)}
                      >
                        {b.name}
                      </button>
                    </div>
                  ))
                ) : (
                  <p style={{ padding: '30px 0 20px 21px', color: C.text }}>暂无榜单数据</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ============ ③ 中心区: #centeri 最近更新 + #right 双榜 ============ */}
        <div className="grid grid-cols-1 gap-2 min-[900px]:grid-cols-[minmax(0,1fr)_190px]">
          <div className="min-w-0">
            <div style={blockStyle()}>
              <BlockTitle title="吾爱小说网最近更新" withIcon />
              <div style={{ padding: 10 }}>
                <ul className="list-none" style={{ margin: 0, padding: 0, lineHeight: '30px' }}>
                  {loading
                    ? [0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                        <li key={i} style={{ borderBottom: `1px dotted ${C.border}`, padding: '0 10px', minHeight: 40, display: 'flex', alignItems: 'center' }}>
                          <Sk className="h-4 w-full" />
                        </li>
                      ))
                    : updateRows.length
                      ? updateRows.map((b) => (
                          <li
                            key={b.id}
                            style={{ display: 'flex', alignItems: 'center', gap: 8, borderBottom: `1px dotted ${C.border}`, padding: '0 10px', minHeight: 40, textAlign: 'right', fontSize: 12 }}
                          >
                            <p style={{ margin: 0, flex: '0 1 250px', minWidth: 0, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              <button type="button"
                                className="x2-a"
                                style={{ cursor: 'pointer' }}
                                role="button"
                                tabIndex={0}
                                onClick={() => b.categoryId && navigate({ view: 'category', cat: b.categoryId })}
                                onKeyDown={(e) => {
                                  if ((e.key === 'Enter' || e.key === ' ') && b.categoryId) {
                                    e.preventDefault()
                                    navigate({ view: 'category', cat: b.categoryId })
                                  }
                                }}
                              >
                                [{b.category}]
                              </button>
                              《
                              <button type="button" className="x2-a" style={{ cursor: 'pointer' }} title={b.name} {...bookNavProps(navigate, b.id)}>
                                {b.name}
                              </button>
                              》
                            </p>
                            {/* 真站 ul2 为章节链接; 列表数据无 chapterId → 链到书籍页(声明) */}
                            <p className="hidden min-[640px]:block" style={{ margin: 0, flex: '0 1 340px', minWidth: 0, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              <button type="button" className="x2-a" style={{ cursor: 'pointer' }} title={b.latestChapter || b.name} {...bookNavProps(navigate, b.id)}>
                                {b.latestChapter || b.name}
                              </button>
                            </p>
                            <span style={{ marginLeft: 'auto', flex: '0 0 auto' }}>
                              {b.author}&nbsp;&nbsp;{yymmdd(b)}
                            </span>
                          </li>
                        ))
                      : (
                          <li style={{ padding: 10, color: C.text }}>暂无更新</li>
                        )}
                </ul>
              </div>
            </div>
          </div>

          {/* #right: 总推荐榜 + 最新小说 */}
          <aside className="min-w-0">
            <div style={blockStyle()}>
              <BlockTitle title="吾爱总推荐榜" />
              <div>
                <ul className="list-none" style={{ margin: 0, padding: 5, lineHeight: '25px' }}>
                  {rankRows.length
                    ? rankRows.map((b, i) => (
                        <li key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 4, borderBottom: `1px dotted ${C.dot}`, padding: '0 3px', minHeight: 40, fontSize: 11 }}>
                          <span style={{ flex: '0 0 auto', color: C.text }}>{i + 1}.</span>
                          <button type="button"
                            className="x2-a"
                            style={{ fontSize: 12, flex: '1 1 0', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
                            title={b.name}
                            {...bookNavProps(navigate, b.id)}
                          >
                            {b.name}
                          </button>
                          {/* 真站此列为推荐票数(无数据源) → 字数替代(声明) */}
                          <span style={{ flex: '0 0 auto', color: C.text }}>{shortWords(b.wordCount)}</span>
                        </li>
                      ))
                    : hotDone
                      ? <li style={{ padding: 5, color: C.text }}>暂无榜单数据</li>
                      : [0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                          <li key={i} style={{ padding: '0 3px', minHeight: 40, display: 'flex', alignItems: 'center' }}>
                            <Sk className="h-4 w-full" />
                          </li>
                        ))}
                </ul>
              </div>
            </div>

            <div style={blockStyle()}>
              <BlockTitle title="吾爱最新小说" />
              <div>
                <ul className="list-none" style={{ margin: 0, padding: 5, lineHeight: '25px' }}>
                  {loading
                    ? [0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                        <li key={i} style={{ padding: '0 3px', minHeight: 40, display: 'flex', alignItems: 'center' }}>
                          <Sk className="h-4 w-full" />
                        </li>
                      ))
                    : newestRows.length
                      ? newestRows.map((b, i) => (
                          <li key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 4, borderBottom: `1px dotted ${C.dot}`, padding: '0 3px', minHeight: 40, fontSize: 11 }}>
                            <span style={{ flex: '0 0 auto', color: C.text }}>{i + 1}.</span>
                            <button type="button"
                              className="x2-a"
                              style={{ fontSize: 12, flex: '1 1 0', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
                              title={b.name}
                              {...bookNavProps(navigate, b.id)}
                            >
                              {b.name}
                            </button>
                            <span style={{ flex: '0 0 auto', color: C.text }}>{mmdd(b)}</span>
                          </li>
                        ))
                      : <li style={{ padding: 5, color: C.text }}>暂无书籍</li>}
                </ul>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
