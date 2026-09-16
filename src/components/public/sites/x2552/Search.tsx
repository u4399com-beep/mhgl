// ============================================================
// [R28-2d-x10] x2552(吾爱文学网) 搜索结果页克隆 —— 黑冰模板 家族标准
// 素材: 搜索表单 Wayback 实测(每页 m_head: form POST /modules/article/search.php,
//   searchtype=articlename + searchkey 输入框 + .so_book 精灵图提交钮);
//   结果页本体无存档 → 按站内六列表格家族标准布局(推断级)。
// 降级: ①真站 POST 搜索 → 契约 GET fetchSearch 等价 ②.so_book 雪碧图钮 → GRAY_BTN
//   渐变钮等价 ③结果页列结构沿用分类表(书名/最新章节/作者/大小/更新/状态)
// ============================================================
'use client'

import { useState } from 'react'
import type { SiteSearchProps } from '../shared'
import { usePublic } from '../../ctx'
import { BdSub, BdTop, BookTable, C, GRAY_BTN } from './_kit'

export function X2552Search({ q, data, loading, error }: SiteSearchProps) {
  const { navigate } = usePublic()
  const [input, setInput] = useState(q)
  const books = data?.books || []

  return (
    <div style={{ width: '100%', maxWidth: 960, margin: '0 auto', padding: '0 8px' }}>
      <div style={{ height: 8 }} />
      {/* 搜索框(真站 m_head searchbox 形态: 输入格 + 提交钮) */}
      <form
        role="search"
        style={{ display: 'flex', justifyContent: 'center', margin: '6px 0' }}
        onSubmit={(e) => {
          e.preventDefault()
          const kw = input.trim()
          if (kw) navigate({ view: 'search', q: kw })
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="输入书名关键词"
          aria-label="搜索关键词"
          style={{
            width: 320,
            maxWidth: '70vw',
            height: 28,
            lineHeight: '26px',
            border: `1px solid ${C.border}`,
            borderRight: 0,
            padding: '0 8px',
            fontSize: 12,
            color: C.text,
            background: '#fff',
            outline: 'none',
          }}
        />
        <button
          type="submit"
          style={{
            height: 28,
            lineHeight: '26px',
            padding: '0 14px',
            fontSize: 12,
            background: GRAY_BTN,
            border: `1px solid ${C.border}`,
            color: C.text,
            cursor: 'pointer',
          }}
        >
          搜索
        </button>
      </form>
      <BdTop />
      <BdSub>
        <dl style={{ margin: 0, padding: '4px 8px 8px' }}>
          <dt style={{ lineHeight: '30px', fontSize: 14, color: C.text }}>
            搜索「{q}」 - 结果列表{data ? `(共 ${books.length} 条)` : ''}
          </dt>
          <dd style={{ margin: 0 }}>
            {error ? (
              <p style={{ padding: '18px 0', textAlign: 'center', color: 'red', fontSize: 12 }}>搜索失败：{error}</p>
            ) : (
              <BookTable books={books} loading={loading && !data} empty={!loading && !books.length} />
            )}
          </dd>
        </dl>
      </BdSub>
    </div>
  )
}
