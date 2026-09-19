// ============================================================
// [R39-2i] kks101 克隆首页 —— 快照 home.html(2026-09-18 cloak 实抓 40.9KB, 繁体站)
//   真站结构: .adbanner(域名提示条) + 「熱門書單推薦」(booklist-card: cover-stack 三层叠封面 +
//     booklist-title + meta 收藏数/书数/作者) + .tag 标签云(/newtag/ 链接 40+) + 书籍列表 + .foot
//   降级: 真站书单为站方数据 → 以「熱門小說」书籍卡近似书单卡(封面叠放复刻 cover-stack 形态, 推断级);
//     标签云以 keywords/分类近似(fetchSuggestTags 词池)
// ============================================================
'use client'

import { useEffect, useState } from 'react'
import type { SiteHomeProps } from '../shared'
import { usePublic, viewToUrl } from '../../ctx'
import { fetchSuggestTags } from '../../data'
import { BookCover } from '../../BookCover'
import { ErrorState, Sk } from '../../bits'
import { formatWords } from '../../seo'
import type { BookItem } from '../../types'
import { KksFooter } from './parts'

function KksBookCard({ b, rank }: { b: BookItem; rank?: number }) {
  const { site, navigate } = usePublic()
  return (
    <div className="kks-bookbox">
      <a
        className="kks-bookimg"
        href={viewToUrl({ view: 'book', bookId: b.id }, site.id)}
        onClick={(e) => { e.preventDefault(); navigate({ view: 'book', bookId: b.id }) }}
        aria-label={b.name}
      >
        <BookCover cover={b.cover} name={b.name}  />
        {rank !== undefined && rank < 3 && <span className={`kks-rank kks-rank-${rank + 1}`}>{rank + 1}</span>}
      </a>
      <div className="kks-bookinfo">
        <h3>
          <a href={viewToUrl({ view: 'book', bookId: b.id }, site.id)} onClick={(e) => { e.preventDefault(); navigate({ view: 'book', bookId: b.id }) }}>{b.name}</a>
        </h3>
        <p className="kks-author"><span>{b.author}</span></p>
        <p className="kks-intro">{(b.intro || '暫無簡介').slice(0, 52)}…</p>
        <p className="kks-meta"><span>{b.category || '小說'}</span><span>{formatWords(b.wordCount)}</span></p>
      </div>
      <div className="kks-clear" />
    </div>
  )
}

export function Kks101Home({ books, loading }: SiteHomeProps) {
  const { site, navigate } = usePublic()
  // [R40-c-1] 熱門標籤「載入中…」卡死修复: tri-state(null=載入中)。根因: fetchSuggestTags 失败/空词池
  //   静默返回 null 或 tags=[], 旧版 then 内 `if (alive && e)` 不落值 → tags 恒为 [] →
  //   `tags.length===0 && 載入中…` 永真不退场。现改为完成必落值: 空数据整块隐藏(真站无空态呈现), 载入中才显示 loading
  const [tags, setTags] = useState<string[] | null>(null)
  useEffect(() => {
    let alive = true
    fetchSuggestTags().then((e) => { if (alive) setTags(e ? e.tags.slice(0, 32) : []) }).catch(() => { if (alive) setTags([]) })
    return () => { alive = false }
  }, [])
  const hot = [...books].sort((a, b) => (b.wordCount || 0) - (a.wordCount || 0)).slice(0, 8)
  const newest = books.slice(0, 10)

  return (
    <div className="kks-home">
      <div className="kks-main">
        <div className="kks-container">
          <div className="kks-adbanner kks-mybox">請支持我們的域名：{site.name}</div>
          {/* 熱門書單推薦(书单卡以热门书三连封面叠放复刻, 推断级) */}
          <h3 className="kks-mytitle">熱門書單推薦</h3>
          <div className="kks-booklist-grid">
            {loading
              ? Array.from({ length: 4 }).map((_, i) => <Sk key={i} style={{ height: 120, borderRadius: 8 }} />)
              : hot.slice(0, 4).map((b) => (
                <div className="kks-booklist-card" key={b.id}>
                  <a
                    className="kks-booklist-card-link"
                    href={viewToUrl({ view: 'book', bookId: b.id }, site.id)}
                    onClick={(e) => { e.preventDefault(); navigate({ view: 'book', bookId: b.id }) }}
                  >
                    <div className="kks-booklist-card-content">
                      <div className="kks-cover-section">
                        <div className="kks-cover-stack">
                          <div className="kks-cover-main"><BookCover cover={b.cover} name={b.name}  /></div>
                        </div>
                      </div>
                      <div className="kks-info-section">
                        <h3 className="kks-booklist-title">{b.name}</h3>
                        <div className="kks-booklist-meta">
                          <div className="kks-meta-item"><span>{b.category || '小說'}</span></div>
                          <div className="kks-meta-item"><span>{formatWords(b.wordCount)}</span></div>
                          <div className="kks-meta-item"><span>{b.author}</span></div>
                        </div>
                        <div className="kks-booklist-desc"><p>{(b.intro || '暫無簡介').slice(0, 40)}…</p></div>
                      </div>
                    </div>
                  </a>
                </div>
              ))}
          </div>
          {/* 标签云 [R40-c-1] 载入中显示占位; 加载完成且为空 → 整块隐藏(渲染空态而非永久 loading) */}
          {(tags === null || tags.length > 0) && (
            <div className="kks-tag">
              <h3 className="kks-mytitle">熱門標籤</h3>
              <ul>
                {tags === null ? (
                  <span className="kks-meta-empty">載入中…</span>
                ) : (
                  tags.map((t) => (
                    <a key={t} href={viewToUrl({ view: 'search', q: t }, site.id)} onClick={(e) => { e.preventDefault(); navigate({ view: 'search', q: t }) }}>{t}</a>
                  ))
                )}
              </ul>
            </div>
          )}
          {/* 排行榜 */}
          <h3 className="kks-mytitle">熱門小說排行</h3>
          {loading ? (
            <div className="kks-mybox">{Array.from({ length: 4 }).map((_, i) => <Sk key={i} style={{ height: 110, borderRadius: 8 }} />)}</div>
          ) : hot.length === 0 ? (
            <ErrorState message="暫無數據" />
          ) : (
            <div className="kks-mybox">
              {hot.map((b, i) => <KksBookCard key={b.id} b={b} rank={i} />)}
            </div>
          )}
          {/* 最新更新 */}
          <h3 className="kks-mytitle kks-mytitle2">最新更新</h3>
          <div className="kks-mybox">
            {newest.map((b) => <KksBookCard key={b.id} b={b} />)}
          </div>
        </div>
      </div>
      <KksFooter />
    </div>
  )
}
