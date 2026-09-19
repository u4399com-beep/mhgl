// ============================================================
// [R43-2] x33yq(33言情) 克隆首页 —— 快照 /tmp/r43-snap/home.html(www.x33yq.org 直连实抓)
//   源站结构(520xs/笔趣阁近亲模板): #main > #hotcontent(.l 6 张封面推荐卡 120×150, 无 .r 侧栏) +
//     .novelslist > .GARAN(单块「新书排行榜(*^__^*)」33 张 .top 图文卡 67×82, 3 列流式) +
//     #newscontent(.l 最近更新小说列表 s1-s5 含[目]链/最新章/作者/日期 + .r 最新上架小说 s1/s2/s5) +
//     #firendlink + .footer(页脚已迁 Footer.tsx 模板槽)
//   色值(style.css/common.css 实测): body #E9FAFF / .l 边 2px #C3DFEA 底 #FEF9EF / novelslist 边 #A6D3E8 /
//     newscontent 底 #F7FBFD h2 底 #88C6E5 / 链接 #6F78A7 / 弱字 #B3B3B3
//   降级声明: 源站「新书排行榜」为站方票数榜 → 契约按最新书列表近似; s3 最新章契约仅有标题串 → 纯文本。
// ============================================================
'use client'

import type { SiteHomeProps } from '../shared'
import { usePublic, viewToUrl } from '../../ctx'
import { BookCover } from '../../BookCover'
import { ErrorState, Sk } from '../../bits'
import { fmtDate } from '../../seo'
import type { BookItem } from '../../types'

export function X33yqHome({ books, loading }: SiteHomeProps) {
  const { site, navigate } = usePublic()
  const hot6 = books.slice(0, 6) // 真站 #hotcontent .l 恒 6 卡(3 列×2 行)
  const garan = books.slice(0, 33) // 真站 GARAN 新书排行榜 33 卡(3 列×11 行)

  const go = (b: BookItem) => navigate({ view: 'book', bookId: b.id })
  const link = (b: BookItem) => viewToUrl({ view: 'book', bookId: b.id }, site.id)
  const tocLink = (b: BookItem) => viewToUrl({ view: 'toc', bookId: b.id }, site.id)

  return (
    <div className="xq-home">
      <div id="xq-main">
        {/* 热点区(真站 #hotcontent .l: 6 张封面卡) */}
        <div id="xq-hotcontent">
          <div className="xq-l">
            {loading
              ? Array.from({ length: 6 }).map((_, i) => <Sk key={i} style={{ height: 160, margin: 10, borderRadius: 0 }} />)
              : hot6.map((b) => (
                <div className="xq-item" key={b.id}>
                  <button className="xq-image" onClick={() => go(b)} aria-label={b.name}>
                    <BookCover cover={b.cover} name={b.name} />
                  </button>
                  <dl>
                    <dt>
                      <span>{b.author}</span>
                      <a href={link(b)} onClick={(e) => { e.preventDefault(); go(b) }}>{b.name}</a>
                    </dt>
                    <dd>{(b.intro || '暂无简介').slice(0, 80)}</dd>
                  </dl>
                  <div className="xq-clear" />
                </div>
              ))}
            {!loading && hot6.length === 0 && <ErrorState message="暂无推荐书籍" />}
            <div className="xq-clear" />
          </div>
        </div>
        {/* 新书排行榜(真站 .novelslist > .GARAN 单块 3 列图文卡; 空数据整块隐藏不渲染空壳) */}
        {!loading && garan.length > 0 && (
          <div className="xq-novelslist">
            <div className="xq-GARAN">
              <h2>新书排行榜(*^__^*)</h2>
              {garan.map((b) => (
                <div className="xq-top" key={b.id}>
                  <button className="xq-image" onClick={() => go(b)} aria-label={b.name}>
                    <BookCover cover={b.cover} name={b.name} />
                  </button>
                  <dl>
                    <dt><a href={link(b)} onClick={(e) => { e.preventDefault(); go(b) }}>{b.name}</a> / 著：{b.author}</dt>
                    <dd>{(b.intro || '暂无简介').slice(0, 60)}</dd>
                  </dl>
                  <div className="xq-clear" />
                </div>
              ))}
              <div className="xq-clear" />
            </div>
          </div>
        )}
        {loading && <Sk style={{ height: 240, margin: '10px auto', borderRadius: 10 }} />}
        {/* 最近更新 + 最新上架(真站 #newscontent .l/.r; [目] 链接指向目录视图) */}
        {!loading && books.length > 0 && (
          <div id="xq-newscontent">
            <div className="xq-nc-l">
              <h2>最近更新小说列表</h2>
              <ul>
                {books.slice(0, 30).map((b) => (
                  <li key={b.id}>
                    <span className="s1">[{b.category || '小说'}]</span>
                    <span className="s2">
                      <a href={tocLink(b)} onClick={(e) => { e.preventDefault(); navigate({ view: 'toc', bookId: b.id }) }} aria-label={`${b.name}目录`}>[目]</a>
                      <a href={link(b)} onClick={(e) => { e.preventDefault(); go(b) }}>{b.name}</a>
                    </span>
                    <span className="s3">{b.latestChapter || ''}</span>
                    <span className="s4">{b.author}</span>
                    <span className="s5">{fmtDate(b.updatedAt)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="xq-nc-r">
              <h2>最新上架小说</h2>
              <ul>
                {books.slice(0, 24).map((b) => (
                  <li key={b.id}>
                    <span className="s1">[{b.category || '小说'}]</span>
                    <span className="s2">
                      <a href={tocLink(b)} onClick={(e) => { e.preventDefault(); navigate({ view: 'toc', bookId: b.id }) }} aria-label={`${b.name}目录`}>[目]</a>
                      <a href={link(b)} onClick={(e) => { e.preventDefault(); go(b) }}>{b.name}</a>/{b.author}
                    </span>
                    <span className="s5">{fmtDate(b.updatedAt)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="xq-clear" />
          </div>
        )}
      </div>
    </div>
  )
}
