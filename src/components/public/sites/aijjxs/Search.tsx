// ============================================================
// [R28-2a] aijjxs 克隆搜索结果页(Search 视图) —— 按真站搜索交互与全站面板风格复刻
//
//   真站考据: 首页/书页 header 均有 form.search(action=/e/search/index.php POST,
//   placeholder「请输入书名或作者关键字」, 按钮「搜索全站」); 结果页为帝国 CMS POST
//   流程无 GET 直达地址(POST 探测仅返回「提示信息」通用壳, /tmp/r28-2a/aijjxs/
//   aijjxs-search-post.html 实测) → 结果列表无真站实拍可对照。
//
//   降级/推断说明(整页 推断级):
//   ① 搜索框形态按真站 form.search 实测复刻(input 44px/radius 10/边 var(--line)/
//      bg var(--paper) + 「搜索全站」按钮 128px 网格列)
//   ② 结果列表按真站全站 .panel + ul.lines(.cat 胶囊+书名+作者+日期)风格复刻
//   ③ 真站无 tag/分类聚合卡 → data.relatedTags 以 .tags 胶囊呈现(站内关键词)
// ============================================================
'use client'

import { useState } from 'react'
import type { FormEvent } from 'react'
import type { SiteSearchProps } from '../shared'
import { usePublic } from '../../ctx'
import { EmptyState, ErrorState, Sk } from '../../bits'
import { fmtDate } from '../../seo'

const C = {
  bg: '#f3efe7',
  paper: '#fffdf8',
  ink: '#1f2937',
  muted: '#6b7280',
  line: '#e5dccd',
  brand: '#0f766e',
  brandDark: '#115e59',
  radius: '14px',
  shadow: '0 10px 30px rgba(17, 24, 39, 0.08)',
} as const

export function AijjxsSearch({ q, data, loading, error }: SiteSearchProps) {
  const { navigate } = usePublic()
  const [input, setInput] = useState(q || '')

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const word = input.trim()
    if (word) navigate({ view: 'search', q: word })
  }

  const books = data?.books || []

  return (
    <div className="ajx-search" style={{ background: C.bg, padding: '0 0 24px', minHeight: '50vh' }}>
      <div className="mx-auto w-full" style={{ maxWidth: 1220, padding: '18px 14px 0' }}>
        {/* 真站 form.search: grid 1fr 128px + 「搜索全站」 */}
        <form className="ajx-search-form" role="search" onSubmit={onSubmit} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 128px', gap: 10, maxWidth: 720 }}>
          <input
            type="text"
            name="keyboard"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="请输入书名或作者关键字"
            aria-label="搜索关键词"
            style={{
              height: 44,
              borderRadius: 10,
              border: `1px solid ${C.line}`,
              padding: '0 13px',
              fontSize: 15,
              background: C.paper,
              color: C.ink,
              outline: 'none',
              minWidth: 0,
            }}
          />
          <button
            type="submit"
            className="ajx-search-btn"
            style={{
              height: 44,
              borderRadius: 10,
              border: `1px solid ${C.brandDark}`,
              background: C.brandDark,
              color: '#fff',
              fontSize: 15,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            搜索全站
          </button>
        </form>

        {/* 结果面板(推断级, 按全站 .panel + .lines 风格) */}
        <article style={{ border: `1px solid ${C.line}`, borderRadius: C.radius, background: C.paper, boxShadow: C.shadow, overflow: 'hidden', marginTop: 14 }}>
          <h3
            style={{
              position: 'relative',
              margin: 0,
              padding: '12px 12px 12px 20px',
              fontSize: 18,
              fontWeight: 700,
              color: '#1f3f3a',
              borderBottom: '1px solid rgba(255, 214, 224, 0.28)',
            }}
          >
            <span aria-hidden style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 4, height: 18, borderRadius: 3, background: 'linear-gradient(180deg, #0f766e, #b45309)' }} />
            “{q}” 的搜索结果
            {!loading && data && <small style={{ fontSize: 13, color: C.muted, marginLeft: 8 }}>共 {books.length} 本</small>}
          </h3>

          <div style={{ padding: '4px 12px 12px' }}>
            {error ? (
              <ErrorState message="搜索失败" detail={error} />
            ) : loading ? (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }} role="status" aria-label="搜索中">
                {Array.from({ length: 8 }).map((_, i) => (
                  <li key={i} style={{ borderBottom: `1px dashed ${C.line}`, padding: '9px 0' }}>
                    <Sk className="h-6 w-full" style={{ borderRadius: 6, background: 'rgba(232,247,244,0.7)' }} />
                  </li>
                ))}
              </ul>
            ) : books.length === 0 ? (
              <EmptyState text={`没有找到与“${q}”相关的书籍`} hint="换个书名或作者关键字试试" />
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {books.map((b) => (
                  <li key={b.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', minHeight: 40, padding: '9px 0', borderBottom: `1px dashed ${C.line}` }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
                      <span style={{ flex: '0 0 auto', fontSize: 11, lineHeight: 1, color: C.brand, background: '#e8f7f4', border: '1px solid #b9e3dc', borderRadius: 999, padding: '4px 8px', whiteSpace: 'nowrap' }}>
                        {b.category || '小说'}
                      </span>
                      <button
                        type="button"
                        onClick={() => navigate({ view: 'book', bookId: b.id })}
                        className="ajx-a"
                        style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', color: C.brandDark, fontSize: 14, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }}
                      >
                        {b.name}
                      </button>
                      <span style={{ flex: '0 0 auto', fontSize: 12, color: '#64748b' }}>{b.author}</span>
                    </span>
                    <span style={{ color: C.muted, fontSize: 12, whiteSpace: 'nowrap' }}>{fmtDate(b.updatedAt) || '--'}</span>
                  </li>
                ))}
              </ul>
            )}

            {/* 相关搜索词(契约 relatedTags, 真站无对应板块 → tags 胶囊, 推断级) */}
            {!loading && data && data.relatedTags.length > 0 && (
              <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <span style={{ fontSize: 13, color: C.muted, alignSelf: 'center' }}>相关搜索：</span>
                {data.relatedTags.slice(0, 10).map((t) => (
                  <button
                    key={`${t.tag}-${t.bookId}`}
                    type="button"
                    onClick={() => navigate({ view: 'keyword', tag: t.tag })}
                    className="ajx-cat-pill"
                    style={{ border: '1px solid #cae8e3', background: '#eef9f7', padding: '4px 10px', borderRadius: 999, fontSize: 13, color: C.brandDark, cursor: 'pointer' }}
                  >
                    {t.tag}
                  </button>
                ))}
              </div>
            )}
          </div>
        </article>
      </div>
    </div>
  )
}

