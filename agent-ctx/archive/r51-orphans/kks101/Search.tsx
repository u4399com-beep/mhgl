// ============================================================
// [R28-2f] kks101 克隆搜索结果页 —— 复刻真站 /search/{kw}/{page}.html
//   快照: /tmp/r28-2b/kks101/search2.html(709 行, 查询词「火影」实证; search.html 空,
//   为入口表单 action=/search 的 post 目标, 结果列表以 search2 实测)。
//
//   真站结构(container > .mybox, search2.html L94-642):
//     ① h3.mytitle「搜索關鍵詞「<b.hottext>火影</b>」，共有<b.hottext> 100 </b>條結果」
//        (hottext 红 #c60f13, style.css L2445-2447)
//     ② .newbox > ul#article_list_content 行式结果(作者/分類/連載 三标签,
//        书名内查询词命中以 .hottext 红字高亮, L108-115)
//     ③ .pages > .pagelink 数字分页(L642)
//   入口: header .search 表单(action=/search POST searchkey, home.html L58-66)
//   + 首页 .searchBox 大搜索框(L100-111) → 本页顶部以同款 pill 搜索框承接 re-query
//
//   降级/推断说明:
//   ① 真站结果总数/分页(共 100 條, 5 页)契约 SearchData 无 total/page 字段 →
//      头条仅显示当前返回条数, 分页不渲染
//   ② 书名命中高亮按 q 的字面子串标红(真站为服务端分词高亮, 近似)
//   ③ 相關標籤块: SearchData.relatedTags 为本站数据面特有(真站为 /newtag/ 标签页)
//      → 以書頁同款 .tagul 胶囊渲染, 点击跳 keyword 视图
//   ④ 行尾「加入書架」→「章節目錄」出口(同 parts.NewBoxRow 统一降级)
// ============================================================
'use client'

import { useState } from 'react'
import type { ReactNode } from 'react'
import type { SiteSearchProps } from '../shared'
import { usePublic } from '../../ctx'
import { ErrorState, EmptyState, Sk } from '../../bits'
import { K, KContainer, cardStyle, MyTitle, NewBoxRow } from './parts'

/** [R28-2f-26] 书名查询词红字高亮(真站 .hottext, search2.html L110; 纯字面包含近似, 见说明②) */
function HotName({ name, q }: { name: string; q: string }): ReactNode {
  const kw = q.trim()
  if (!kw || !name.includes(kw)) return name
  const parts = name.split(kw)
  return (
    <>
      {parts.map((p, i) => (
        <span key={i}>
          {p}
          {i < parts.length - 1 ? <span className="kkx-hottext" style={{ color: K.hot }}>{kw}</span> : null}
        </span>
      ))}
    </>
  )
}

export function Kks101Search({ q, data, loading, error }: SiteSearchProps) {
  const { navigate } = usePublic()
  const [kw, setKw] = useState('')
  const books = data?.books ?? []
  const related = data?.relatedTags ?? []

  const submit = () => {
    const t = kw.trim()
    if (t) navigate({ view: 'search', q: t })
  }

  return (
    <KContainer>
      <div className="kkx-mybox" style={cardStyle}>
        {/* 入口搜索框(home .searchBox 同款 pill 形态) */}
        <form
          className="kkx-searchbox"
          style={{ position: 'relative', maxWidth: 600, margin: '0 auto 18px' }}
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <input
            value={kw}
            onChange={(e) => setKw(e.target.value)}
            aria-label="搜索小說"
            placeholder={q ? `搜索：${q}` : '請輸入搜索內容！'}
            className="kkx-searchinput"
            style={{
              border: '1px solid #eef0f4',
              color: '#444444',
              padding: '0 48px 0 17px',
              height: 50,
              lineHeight: '50px',
              width: '100%',
              borderRadius: 25,
              outline: 'none',
              fontSize: 16,
              background: '#ffffff',
              boxShadow: '0 4px 20px rgba(0,25,104,.05)',
            }}
          />
          <button
            type="submit"
            aria-label="搜索"
            className="kkx-searchbtn"
            style={{ position: 'absolute', right: 0, top: 0, width: 48, height: 48, background: 'transparent', border: 'none', color: '#666666', cursor: 'pointer', fontSize: 18 }}
          >
            ⌕
          </button>
        </form>

        {/* ① 结果头条 */}
        <MyTitle>
          <span>
            搜索關鍵詞「<b className="kkx-hottext" style={{ color: K.hot }}>{q || '…'}</b>」，共有
            <b className="kkx-hottext" style={{ color: K.hot }}> {loading ? '…' : books.length} </b>
            條結果
          </span>
        </MyTitle>

        {/* ② 行式结果 */}
        {error ? (
          <ErrorState message="搜索失敗" detail={error} />
        ) : loading ? (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }} role="status" aria-label="搜索結果加載中">
            {Array.from({ length: 4 }).map((_, i) => (
              <li key={i} style={{ borderBottom: `1px solid ${K.line}`, padding: '20px 0' }}>
                <Sk className="h-32 w-full" style={{ borderRadius: 3 }} />
              </li>
            ))}
          </ul>
        ) : books.length === 0 ? (
          <EmptyState text={`沒有找到與「${q}」相關的書籍`} hint="換個關鍵詞試試，或從熱門標籤逛逛" />
        ) : (
          <ul className="kkx-newbox" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {books.map((b) => (
              <NewBoxRow key={b.id} book={b} navigate={navigate} showCat titleNode={<HotName name={b.name} q={q} />} />
            ))}
          </ul>
        )}

        {/* ③ 相關標籤 */}
        {!loading && related.length > 0 ? (
          <div className="kkx-infotag" style={{ borderTop: `1px solid ${K.line}`, paddingTop: 10 }}>
            <h3 className="kkx-tagtitle" style={{ margin: '10px 5px', fontSize: 16 }}>相關標籤</h3>
            <ul className="kkx-tagul" style={{ listStyle: 'none', margin: 0, padding: 0, overflow: 'hidden' }}>
              {related.slice(0, 12).map((r) => (
                <li key={`${r.tag}-${r.bookId}`} style={{ display: 'inline-block' }}>
                  <button
                    type="button"
                    onClick={() => navigate({ view: 'keyword', tag: r.tag })}
                    className="kkx-taga"
                    style={{ fontSize: '0.8rem', lineHeight: '1.8rem', display: 'inline-block', padding: '0 0.5rem', border: `1px solid ${K.chipLine}`, borderRadius: 10, margin: '0.3rem', background: K.chipBg, color: K.chipText, cursor: 'pointer' }}
                  >
                    {r.tag}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </KContainer>
  )
}

