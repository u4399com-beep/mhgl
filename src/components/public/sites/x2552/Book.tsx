// ============================================================
// [R28-2d-x7] x2552(吾爱文学网) 书页克隆 —— 黑冰模板 Wayback 实测 1:1
// 素材: /tmp/r28-2d/x2552/x2-bookdetail.html(2023-12-04 /book/1326.html 快照)
// 真站 DOM: #left(双 block) + #centerm > .bdtop+.bdsub > dl#content:
//   dd h1「{书名}全文阅读」 + dd(.fl img 120×150 padding7 边#E4E4E4 + .fl 550px:
//     table#at 元数据行(4行 th/td×3, cellspacing1 bg#E4E4E4, th bg 默认) + p.btnlinks 按钮组)
//   + dd(p.pl bg#F2F2F2 b 内容简介: + 正文段)
// 降级: ①收藏数/点击数/推荐数行无数据契约 → 未渲染(真站 4 行元数据 → 本站 2 行)
//       ②加入书架/推荐本书(登录态 ajax)与手机阅读(无契约) → 未渲染; btnlinks 保留
//         全文阅读(→站内目录视图, 真站即 /html/{x}/{id}/ 目录页)+TXT下载
//       ③a.read 精灵图钮 → GRAY_BTN 渐变等价(推断级)
// ============================================================
'use client'

import type { SiteBookProps } from '../shared'
import { usePublic } from '../../ctx'
import { BookCover } from '../../BookCover'
import { BdSub, BdTop, C, GRAY_BTN, LeftRail, shortWords, statusText, yymmdd } from './_kit'

export function X2552Book({ data, loading, error }: SiteBookProps) {
  const { navigate } = usePublic()
  const book = data?.book ?? null

  return (
    <div style={{ width: '100%', maxWidth: 960, margin: '0 auto', padding: '0 8px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ width: 190, flexShrink: 0, maxWidth: '100%' }}>
          <LeftRail />
        </div>
        <div style={{ flex: '1 1 0%', minWidth: 0, paddingLeft: 10, width: '100%' }} className="x2-centerm">
          <div style={{ height: 8 }} />
          <BdTop />
          <BdSub>
            <dl style={{ margin: 0, padding: '4px 8px 10px' }}>
              {error ? (
                <dd style={{ margin: 0, padding: '30px 0', textAlign: 'center', color: 'red', fontSize: 13 }}>书籍不存在或加载失败：{error}</dd>
              ) : loading && !book ? (
                <>
                  <dd style={{ margin: '6px 0' }}>
                    <span className="block h-[26px] w-2/3 animate-pulse" style={{ background: C.face }} />
                  </dd>
                  <dd style={{ margin: 0 }}>
                    <span className="block h-[180px] w-full animate-pulse" style={{ background: C.face }} />
                  </dd>
                </>
              ) : book ? (
                <>
                  <dd style={{ margin: 0 }}>
                    <h1 style={{ fontSize: 20, lineHeight: '32px', color: C.text, fontWeight: 'bold', margin: '4px 0' }}>
                      {book.name}全文阅读
                    </h1>
                  </dd>
                  <dd style={{ margin: 0 }}>
                    {/* .fl 封面 + .fl 550px 元数据(实测布局) */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                      <div style={{ flexShrink: 0 }}>
                        <button
                          type="button"
                          className="x2-hst"
                          title={`${book.name}最新章节列表`}
                          onClick={() => navigate({ view: 'toc', bookId: book.id })}
                          style={{ display: 'block', margin: '0 25px 0 15px', cursor: 'pointer', padding: 0, background: 'none', border: 0 }}
                        >
                          <span style={{ display: 'block', padding: 7, border: `1px solid ${C.border}`, background: '#fff' }}>
                            <BookCover name={book.name} cover={book.cover} className="h-[150px] w-[120px]" />
                          </span>
                        </button>
                      </div>
                      <div style={{ flex: '1 1 320px', minWidth: 0 }}>
                        {/* table#at 元数据(真站 4 行 → 契约 2 行, 降级声明) */}
                        <table
                          cellPadding={0}
                          cellSpacing={0}
                          className="x2-tbl x2-at"
                          style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 1, background: C.border, fontSize: 12, color: C.text }}
                        >
                          <tbody>
                            <tr>
                              <th style={{ background: C.face, fontWeight: 'normal', padding: '3px 6px', whiteSpace: 'nowrap' }}>小说类别</th>
                              <td style={{ background: '#fff', padding: '3px 6px' }}>&#160;{book.category || '--'}</td>
                              <th style={{ background: C.face, fontWeight: 'normal', padding: '3px 6px', whiteSpace: 'nowrap' }}>小说作者</th>
                              <td style={{ background: '#fff', padding: '3px 6px' }}>&#160;{book.author || '--'}</td>
                              <th style={{ background: C.face, fontWeight: 'normal', padding: '3px 6px', whiteSpace: 'nowrap' }}>小说状态</th>
                              <td style={{ background: '#fff', padding: '3px 6px' }}>&#160;{statusText(book.status)}</td>
                            </tr>
                            <tr>
                              <th style={{ background: C.face, fontWeight: 'normal', padding: '3px 6px', whiteSpace: 'nowrap' }}>全文长度</th>
                              <td style={{ background: '#fff', padding: '3px 6px' }}>&#160;{shortWords(book.wordCount)}字</td>
                              <th style={{ background: C.face, fontWeight: 'normal', padding: '3px 6px', whiteSpace: 'nowrap' }}>最后更新</th>
                              <td style={{ background: '#fff', padding: '3px 6px' }}>&#160;{yymmdd(book.updatedAt)}</td>
                              <th style={{ background: C.face, fontWeight: 'normal', padding: '3px 6px', whiteSpace: 'nowrap' }}>最新章节</th>
                              <td style={{ background: '#fff', padding: '3px 6px', overflow: 'hidden', maxWidth: 0 }}>
                                &#160;<span className="block max-w-full truncate">{book.latestChapter || '--'}</span>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                        {/* p.btnlinks 按钮组(真站: 全文阅读/加入书架/推荐本书/TXT下载/手机阅读) */}
                        <p className="x2-btnlinks" style={{ margin: '10px 0 0', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          <button
                            type="button"
                            className="x2-a"
                            style={{
                              height: 26,
                              lineHeight: '24px',
                              padding: '0 14px',
                              fontSize: 12,
                              background: GRAY_BTN,
                              border: `1px solid ${C.border}`,
                              color: C.link,
                              cursor: 'pointer',
                            }}
                            onClick={() => navigate({ view: 'toc', bookId: book.id })}
                          >
                            全文阅读
                          </button>
                          {/* TXT 下载: 全站唯一 <a href> 出口(与真站 txtarticle.php 对应) */}
                          <a
                            href={`/api/public/download?book=${encodeURIComponent(book.id)}`}
                            target="_blank"
                            rel="noreferrer"
                            className="x2-a"
                            style={{
                              height: 26,
                              lineHeight: '24px',
                              padding: '0 14px',
                              fontSize: 12,
                              background: GRAY_BTN,
                              border: `1px solid ${C.border}`,
                              display: 'inline-block',
                            }}
                          >
                            TXT下载
                          </a>
                        </p>
                      </div>
                    </div>
                  </dd>
                  <div style={{ clear: 'both' }} />
                  {/* 内容简介(p.pl 实测) */}
                  <dd style={{ margin: 0, padding: '10px 30px 0 25px' }}>
                    <p style={{ background: C.face, paddingLeft: 10, lineHeight: '24px', fontSize: 12, color: C.text, margin: 0 }}>
                      <b>内容简介：</b>
                    </p>
                    <div style={{ padding: '8px 2px', fontSize: 13, lineHeight: '22px', color: C.text }}>
                      {book.intro || '暂无简介'}
                    </div>
                  </dd>
                </>
              ) : null}
            </dl>
          </BdSub>
        </div>
      </div>
    </div>
  )
}
