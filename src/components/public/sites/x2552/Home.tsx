// ============================================================
// [R28-2d-x1] x2552(吾爱文学网) 首页克隆 —— 黑冰模板 Wayback 实测 1:1
// 素材: /tmp/r28-2d/x2552/x2-home.html(20231204171725 快照) + heibing/css/style.css(11.3KB 全量)
//
// 真站 DOM(.main 960px; m_head/m_menu 由 SiteHeader 承担):
//   ① 红字公告条(内联样式实测: border 1px #E4E4E4/color:red/960px/line-height 25px/margin 5px auto)
//   ② .main.board: .bdtop(2px #33CCFF 边+#D9EDFF 底) + .bdsub > dl#s_dl(dt 30px 蓝渐变标题条
//      「吾爱文学网排行榜」+ dd×6 封面卡: img 120×150 边框+5px 白边, 书名 13px 居中)
//   ③ 中心区: #centeri(760px) block「吾爱小说最近更新」(blocktitle 橙图标 12×16) ul.update
//      (li 底 dotted #E4E4E4 右对齐 12px; p.ul1 250px [分类]《书名》/ p.ul2 340px 最新章节 /
//      作者+日期) + #right(190px) 双 block: 「吾爱网友推荐榜」ultop×15(li>p 计数右上角) +
//      「吾爱热门小说」ultop×20(带「更多...」)
//   ④ .main.links 友情链接(块+blockmore) → 由全局 SiteFooter 承担; .footer 渐变条同
// 降级: ①榜单计数为推荐票数(无数据契约) → 字数替代(声明) ②board JS 轮播圆点 p#s_dt 为空壳不渲染
//      ③「更多...」死链(/top/* 2020/2023 实测 404) → 站内排行榜视图 navigate(声明)
// ============================================================
'use client'

import { useEffect, useState } from 'react'
import type { SiteHomeProps } from '../shared'
import { usePublic } from '../../ctx'
import { fetchBooks } from '../../data'
import { BookCover } from '../../BookCover'
import { bookNavProps } from '../../bits'
import type { BookItem } from '../../types'
import { BdSub, BdTop, Block, C, UlTopRows, shortWords, useBookNav, yymmdd } from './_kit'

/** [R28-2d-x1] 公告条(真站内联样式逐字还原) */
function Announce() {
  const { site } = usePublic()
  return (
    <div style={{ border: `1px solid ${C.border}`, color: 'red', lineHeight: '25px', margin: '5px 0', padding: 0, textAlign: 'left' }}>
      &#160;&#160;&#160;&#160;1、{site.name}全站广告 Less，欢迎长期前来阅读。
      <br />
      &#160;&#160;&#160;&#160;2、感谢书友支持：{site.name} 无敌的小说阅读站
    </div>
  )
}

export function X2552Home({ books, loading }: SiteHomeProps) {
  const { site, navigate } = usePublic()
  const { goBook, goCat, goRanking } = useBookNav()

  // 榜单池(字数热榜基因; 失败回退 props)
  const [pool, setPool] = useState<BookItem[] | null>(null)
  useEffect(() => {
    let alive = true
    fetchBooks({ site: site.id, sort: 'words', page: 1, size: 60 })
      .then((d) => {
        if (alive) setPool(d.books || [])
      })
      .catch(() => {
        if (alive) setPool([])
      })
    return () => {
      alive = false
    }
  }, [site.id])

  const boardBooks = (pool && pool.length ? pool : books).slice(0, 6)
  const recommend = (pool && pool.length ? pool : books).slice(0, 15)
  const updateRows = books.slice(0, 20)
  const hotBooks = books.slice(20, 40)

  return (
    <div style={{ width: '100%', maxWidth: 960, margin: '0 auto', padding: '0 8px' }}>
      {/* ① 红字公告条 */}
      <Announce />

      {/* ② .board 排行榜横条(6 封面卡) */}
      <div style={{ marginTop: 8 }}>
        <BdTop />
        <BdSub>
          <dl style={{ background: 'linear-gradient(180deg,#fdfefe 0%,#eef2f8 100%)', margin: 0 }}>
            <dt style={{ height: 30, lineHeight: '30px', paddingLeft: 35, fontSize: 14, borderBottom: `1px solid ${C.border}`, color: C.text }}>吾爱文学网排行榜</dt>
            <div className="x2-board-dds" style={{ display: 'flex', flexWrap: 'wrap', padding: '12px 0 8px' }}>
              {loading && !boardBooks.length
                ? Array.from({ length: 6 }).map((_, i) => <div key={i} className="x2-bd-skel h-[180px] w-[132px] animate-pulse" style={{ background: 'rgba(228,228,228,0.5)', margin: '0 0 0 14px' }} />)
                : boardBooks.map((b) => (
                    <div key={b.id} {...bookNavProps(navigate, b.id)} className="x2-board-item cursor-pointer" style={{ width: 135, padding: '0 0 8px 14px', fontSize: 13, textAlign: 'center' }}>
                      <div style={{ border: `1px solid ${C.border}`, padding: 5, background: '#fff' }}>
                        <BookCover name={b.name} cover={b.cover} className="h-[150px] w-[120px]" />
                      </div>
                      <button type="button" className="x2-a mt-1 block w-full truncate" title={b.name} onClick={() => goBook(b.id)}>
                        {b.name}
                      </button>
                    </div>
                  ))}
            </div>
          </dl>
        </BdSub>
      </div>

      {/* ③ 中心区: #centeri 更新列表 + #right 双榜 */}
      <div className="x2-center" style={{ display: 'flex', flexWrap: 'wrap', gap: 0, alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 0%', minWidth: 0, width: '100%', maxWidth: 760 }}>
          <Block title="吾爱小说最近更新" withIcon>
            <ul className="x2-update" style={{ lineHeight: '30px', padding: 10 }}>
              {loading && !updateRows.length
                ? Array.from({ length: 12 }).map((_, i) => (
                    <li key={i} className="h-[30px] animate-pulse" style={{ borderBottom: `1px dotted ${C.border}` }} />
                  ))
                : updateRows.map((b) => (
                    <li key={b.id} style={{ borderBottom: `1px dotted ${C.border}`, padding: '0 4px', textAlign: 'right', fontSize: 12 }}>
                      <span style={{ float: 'left', display: 'inline', width: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }}>
                        <button type="button" className="x2-a" onClick={() => goCat(undefined)} style={{ marginRight: 4 }}>
                          [{b.category || '小说'}]
                        </button>
                        《
                        <button type="button" className="x2-a" onClick={() => goBook(b.id)}>
                          {b.name}
                        </button>
                        》
                      </span>
                      <span style={{ float: 'left', display: 'inline', width: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }}>
                        <button
                          type="button"
                          className="x2-a"
                          onClick={() => (b.latestChapter ? goBook(b.id) : goBook(b.id))}
                          disabled={!b.latestChapter}
                          title={b.latestChapter || '暂无章节'}
                        >
                          {b.latestChapter || '暂无章节'}
                        </button>
                      </span>
                      <span style={{ marginRight: 8 }}>{b.author}</span>
                      {yymmdd(b.updatedAt)}
                    </li>
                  ))}
            </ul>
          </Block>
        </div>
        <div style={{ width: 190, flexShrink: 0, marginLeft: 'auto' }}>
          <Block title="吾爱网友推荐榜" label>
            {/* 计数列真站为推荐票数 → 字数替代(声明) */}
            <UlTopRows rows={recommend.map((b) => ({ id: b.id, name: b.name, meta: shortWords(b.wordCount), onClick: () => goBook(b.id) }))} />
          </Block>
          <Block title="吾爱热门小说" label more={{ text: '更多...', onClick: goRanking }}>
            <UlTopRows rows={hotBooks.map((b) => ({ id: b.id, name: b.name, onClick: () => goBook(b.id) }))} />
          </Block>
        </div>
      </div>
    </div>
  )
}
