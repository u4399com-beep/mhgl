// ============================================================
// [R28-2a] ddyueshu(顶点小说 www.ddyueshu.cc) 克隆首页 —— 经典笔趣阁老式模板(第 2 站)
//
//   真站快照(2026-09-16 直连 200, GB18030 → UTF-8 转码存档):
//   /tmp/r28-2a/ddyueshu/ddyueshu-home-utf8.html(25.9KB) + biquge.css(21.3KB 全量实抓)。
//   biquge.css 实测: body bg #E9FAFF · color #555 · 宋体 12px · a #6F78A7;
//   .nav bg #88C6E5 h40 · #hotcontent .l bg #FEF9EF 边 3px #C3DFEA w695 ·
//   .item dl dt 边下 dotted #A6D3E8 · .r h2 bg #E1ECED h30 · novelslist 边 3px #A6D3E8
//
//   板块还原(与真站 <div #wrapper> 逐块一致, 类名注释对应真站):
//     .header(logo 文字「顶点小说」250×60 位)
//     .nav ul li(首页/我的书架/玄幻/修真/都市/穿越/网游/科幻/排行榜单/全部小说)
//     #main #content:
//       #hotcontent .l(4 张 .item 封面卡: .image 120px + dl dt 书名 + dd 简介 indent 2em)
//       #hotcontent .r(h2「上期强推」 + ul li: .s1 [分类] .s2 书名 .s5 作者)
//       .novelslist 双列 .content(h2 分类名 + .top 封面 67×82 + dl dt/dd 简介
//         + ul li 12 行 书名/作者, .content 右点线 #A6D3E8)
//     .footer(站方页脚 — PublicSite 统一渲染, 不重复)
//
//   降级/推断说明:
//   ① 真站顶部两条广告链(《雪中悍刀行》电视剧等)为站方广告 → 不渲染不造假
//   ② 「我的书架」真站为登录书架 PHP → 本站映射到阅读历史视图(view:'history')
//   ③ 「上期强推」右栏契约无运营位数据 → 字数榜切片近似(推断级)
//   ④ .novelslist 双列分类块真站为站方固定 6 类 → 契约数据按分类频次取前 2 组近似
//   ⑤ 真站封面为站方 UploadPic 图 → 契约 cover 缺图时 BookCover 渐变占位(通用壳同源)
//   ⑥ 真站书名/作者混排行(如「万道龙皇陆鸣/牧童听竹」) → 契约 name/author 分字段正常呈现
// ============================================================
'use client'

import { useEffect, useMemo, useState } from 'react'
import type { SiteHomeProps } from '../shared'
import { usePublic } from '../../ctx'
import { fetchBooks } from '../../data'
import { BookCover } from '../../BookCover'
import { Sk, bookNavProps } from '../../bits'
import type { BookItem } from '../../types'

// [R28-2a-28] 真站 biquge.css 实测色值(硬编码, 注释锚定)
const C = {
  page: '#E9FAFF', // biquge.css L2 body background-color
  ink: '#555', // body color
  link: '#6F78A7', // a
  nav: '#88C6E5', // .nav background
  navHover: '#68ACFA', // style.css .nav li a:hover
  box: '#FEF9EF', // #hotcontent .l / .novelslist / .r 背景
  border: '#C3DFEA', // .l/.r 3px 边
  border2: '#A6D3E8', // novelslist 边/点线
  head: '#E1ECED', // h2 底
  dotted: '#A6D3E8', // dt border-bottom dotted
  gray: '#B3B3B3', // dt span/dd/#newscontent .s2
  author: '#9E9E9E', // dd color
} as const

type Nav = ReturnType<typeof usePublic>['navigate']

/** [R28-2a-29] #hotcontent .l .item 封面推荐卡(图 120 + dt/dl) */
function HotItem({ book, navigate }: { book: BookItem; navigate: Nav }) {
  return (
    <div className="dy-hot-item" style={{ float: 'left', width: 315, padding: '10px 0 0 10px', boxSizing: 'border-box' }}>
      <div style={{ overflow: 'hidden' }}>
        <button
          type="button"
          {...bookNavProps(navigate, book.id)}
          style={{ float: 'left', width: 120, padding: 0, border: 0, background: 'none', cursor: 'pointer' }}
          aria-label={`查看 ${book.name}`}
        >
          <BookCover name={book.name} cover={book.cover} style={{ width: 120, height: 150, borderRadius: 0, border: '1px solid #DDD', padding: 1, background: '#fff', boxSizing: 'border-box' }} />
        </button>
        <dl style={{ margin: 0, float: 'right', width: 180, padding: '0 5px 0 0' }}>
          <dt style={{ borderBottom: `1px dotted ${C.dotted}`, fontSize: 14, fontWeight: 700, height: 25, lineHeight: '25px', overflow: 'hidden' }}>
            <button
              type="button"
              onClick={() => navigate({ view: 'book', bookId: book.id })}
              className="dy-a"
              style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', color: C.link, fontSize: 14, fontWeight: 700, display: 'block', width: '100%', textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {book.name}
            </button>
          </dt>
          <dd style={{ margin: 0, height: 120, lineHeight: '20px', overflow: 'hidden', textIndent: '2em', padding: '7px 0 0', color: C.author, fontSize: 12 }}>
            {book.intro || '暂无简介'}
          </dd>
        </dl>
        <div style={{ clear: 'both' }} />
      </div>
    </div>
  )
}

export function DdyueshuHome({ books, loading }: SiteHomeProps) {
  const { site, navigate } = usePublic()

  // [R28-2a-30] 上期强推右栏(契约外数据, 降级声明③): 字数榜切片
  const [hot, setHot] = useState<BookItem[] | null>(null)
  useEffect(() => {
    let alive = true
    fetchBooks({ site: site.id, sort: 'words', page: 1, size: 8 })
      .then((d) => {
        if (alive) setHot(d.books)
      })
      .catch(() => {
        if (alive) setHot([])
      })
    return () => {
      alive = false
    }
  }, [site.id])

  // [R28-2a-31] .novelslist 双列分类块(降级声明④): 按分类频次取前 2 组, 各 1 封面头条+12 行
  const groups = useMemo(() => {
    const freq = new Map<string, number>()
    for (const b of books) freq.set(b.category, (freq.get(b.category) || 0) + 1)
    const top2 = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([cat]) => cat)
    return top2.map((cat) => {
      const items = books.filter((b) => b.category === cat)
      return { cat, top: items[0], rest: items.slice(1, 13) }
    }).filter((g) => g.top)
  }, [books])

  const cover4 = books.filter((b) => b.cover).slice(0, 4)

  if (loading && !books.length) {
    return (
      <div className="dy-page" style={{ background: C.page, color: C.ink, minHeight: '50vh', padding: 12 }} role="status" aria-label="首页加载中">
        <div className="mx-auto w-full" style={{ maxWidth: 980 }}>
          <Sk className="h-24 w-full" style={{ borderRadius: 0, background: 'rgba(255,255,255,0.75)' }} />
          <Sk className="mt-2.5 h-80 w-full" style={{ borderRadius: 0, background: 'rgba(254,249,239,0.9)' }} />
        </div>
      </div>
    )
  }

  return (
    <div className="dy-page" style={{ background: C.page, color: C.ink, fontFamily: '宋体, SimSun, serif', fontSize: 12, padding: '0 0 16px' }}>
      <div id="wrapper" className="mx-auto w-full" style={{ maxWidth: 980, padding: '0 10px' }}>
        {/* .header logo 位(真站 250×60 图标位, 文字呈现) */}
        <div className="dy-header" style={{ height: 61, display: 'flex', alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => navigate({ view: 'home' })}
            style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', color: '#333', fontSize: 26, fontWeight: 700, fontFamily: '黑体, SimHei, sans-serif', letterSpacing: 2 }}
          >
            顶点小说
          </button>
        </div>

        {/* .nav */}
        <nav className="dy-nav" aria-label="站点导航" style={{ background: C.nav, height: 40, overflow: 'hidden' }}>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexWrap: 'nowrap', overflowX: 'auto' }}>
            {[
              { label: '首页', act: () => navigate({ view: 'home' }) },
              { label: '我的书架', act: () => navigate({ view: 'history' }) },
              { label: '排行榜单', act: () => navigate({ view: 'ranking' }) },
              { label: '全部小说', act: () => navigate({ view: 'fulltext' }) },
              { label: '搜索', act: () => navigate({ view: 'search' }) },
            ].map((item) => (
              <li key={item.label} style={{ lineHeight: '44px' }}>
                <button
                  type="button"
                  onClick={item.act}
                  className="dy-nav-a"
                  style={{ background: 'none', border: 0, cursor: 'pointer', color: '#fff', fontSize: 15, fontWeight: 700, padding: '0 14px', whiteSpace: 'nowrap' }}
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* #main #content */}
        <div id="main" style={{ width: '100%' }}>
          <div style={{ padding: '10px 0 0', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 265px', gap: 10, alignItems: 'start' }} className="dy-hot">
            {/* #hotcontent .l */}
            <div className="dy-hot-l" style={{ background: C.box, border: `3px solid ${C.border}`, overflow: 'hidden', minWidth: 0 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', paddingBottom: 10 }}>
                {cover4.length === 0 ? (
                  <p style={{ margin: 0, padding: 12, color: C.author }}>暂无推荐书籍</p>
                ) : (
                  cover4.map((b) => <HotItem key={b.id} book={b} navigate={navigate} />)
                )}
              </div>
            </div>
            {/* #hotcontent .r 上期强推(降级声明③) */}
            <div className="dy-hot-r" style={{ border: `3px solid ${C.border}`, background: C.box, minWidth: 0 }}>
              <h2 style={{ background: C.head, borderBottom: '1px solid #DDD', fontSize: 14, fontWeight: 700, height: 30, lineHeight: '30px', margin: 0, padding: '0 0 0 10px' }}>上期强推</h2>
              <ul style={{ listStyle: 'none', margin: 0, padding: 10 }}>
                {hot === null ? (
                  <Sk className="h-48 w-full" style={{ borderRadius: 0, background: 'rgba(255,255,255,0.7)' }} />
                ) : hot.length === 0 ? (
                  <li style={{ color: C.gray }}>暂无数据</li>
                ) : (
                  hot.map((b) => (
                    <li key={b.id} style={{ borderBottom: '1px solid #DDD', height: 28, lineHeight: '28px', overflow: 'hidden', padding: '5px 0 0', whiteSpace: 'nowrap' }}>
                      <span style={{ display: 'inline-block', width: 44, color: C.gray }}>[{b.category.slice(0, 2) || '其他'}]</span>
                      <button
                        type="button"
                        onClick={() => navigate({ view: 'book', bookId: b.id })}
                        className="dy-a"
                        style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', color: C.link, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 110, verticalAlign: 'top' }}
                      >
                        {b.name}
                      </button>
                      <span style={{ float: 'right', textAlign: 'right', color: C.gray, maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.author}</span>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>

          {/* .novelslist 双列分类块(降级声明④) */}
          {groups.length > 0 && (
            <div className="dy-novelslist" style={{ margin: '2px 0', border: `3px solid ${C.border2}`, padding: 3, background: C.box, display: 'flex', flexWrap: 'wrap' }}>
              {groups.map((g, gi) => (
                <div key={g.cat} className="dy-cell" style={{ borderRight: gi === 0 ? `1px dotted ${C.border2}` : 'none', padding: '0 3px', width: 315, minWidth: 0, flex: '1 1 315px', boxSizing: 'border-box' }}>
                  <h2 style={{ borderBottom: `1px solid ${C.border2}`, fontSize: 14, fontWeight: 700, padding: 0, lineHeight: '25px', height: 25, overflow: 'hidden', margin: 0, paddingLeft: 5 }}>
                    {g.cat}小说
                    <button
                      type="button"
                      onClick={() => navigate({ view: 'fulltext' })}
                      className="dy-a"
                      style={{ float: 'right', background: 'none', border: 0, cursor: 'pointer', color: C.gray, fontSize: 12, lineHeight: '25px', padding: '0 5px' }}
                    >
                      更多&gt;&gt;
                    </button>
                  </h2>
                  <div style={{ overflow: 'hidden' }}>
                    <div style={{ padding: '10px 0 0 5px', float: 'left', width: 71 }}>
                      <button
                        type="button"
                        onClick={() => navigate({ view: 'book', bookId: g.top.id })}
                        style={{ padding: 0, border: 0, background: 'none', cursor: 'pointer' }}
                        aria-label={`查看 ${g.top.name}`}
                      >
                        <BookCover name={g.top.name} cover={g.top.cover} style={{ width: 67, height: 82, borderRadius: 0, border: '1px solid #DDD', padding: 1, background: '#fff', boxSizing: 'border-box' }} />
                      </button>
                    </div>
                    <dl style={{ margin: 0, padding: '10px 0 0 0', float: 'right', width: 219, maxWidth: 'calc(100% - 76px)', boxSizing: 'border-box' }}>
                      <dt style={{ height: 25, lineHeight: '25px', overflow: 'hidden', fontWeight: 700 }}>
                        <button
                          type="button"
                          onClick={() => navigate({ view: 'book', bookId: g.top.id })}
                          className="dy-a"
                          style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', color: C.link, fontSize: 13, fontWeight: 700, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}
                        >
                          {g.top.name}
                        </button>
                      </dt>
                      <dd style={{ margin: 0, lineHeight: '20px', height: 60, overflow: 'hidden', color: C.author, fontSize: 12 }}>{g.top.intro || '暂无简介'}</dd>
                    </dl>
                    <div style={{ clear: 'both' }} />
                  </div>
                  <ul style={{ padding: '10px 0 0', listStyle: 'none', margin: 0 }}>
                    {g.rest.map((b) => (
                      <li key={b.id} style={{ color: C.gray, height: 20, lineHeight: '20px', fontSize: 12, overflow: 'hidden', float: 'left', width: 155, whiteSpace: 'nowrap' }}>
                        <button
                          type="button"
                          onClick={() => navigate({ view: 'book', bookId: b.id })}
                          className="dy-a"
                          style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', color: C.link, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 110, verticalAlign: 'top' }}
                        >
                          {b.name}
                        </button>
                        /{b.author}
                      </li>
                    ))}
                    <li style={{ clear: 'both', border: 0, height: 0 }} />
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

