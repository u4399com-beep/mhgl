// ============================================================
// [R24-6] 吾爱文学网(www.x2552.com) 克隆首页 —— 黑冰模板(heibing/css/style.css)一模一样还原。
//   真站样本: /tmp/sites/x2552-home.html + style.css 实测:
//   body 12px/120% 微软雅黑,宋体 · 文字 #666 · 链接 #2f468f · hover #FF6600(位移 1px)
//   块面 #F2F2F2 / 边线 #E4E4E4 / 点线分隔 dotted / 橙强调 #FF6600 · 板块条为 wamcc.png 精灵图
//   → 按任务书用纯 CSS 渐变条等价复刻(blocktitle/board 标题条/灰色小按钮位)。
//
//   板块还原清单(自上而下, 与真站 <div class="main"> 一致):
//   ① 红字公告条(border #E4E4E4, line-height 25px, 两行)
//   ② .board 排行榜横条: bdtop(2px #33CCFF 边+#D9EDFF 底) + bdsub(白底 1px 边)
//      + 标题条「xx排行榜」 + 6 个封面位(120×150 带 5px 白边+边框 + 书名 13px 居中)
//   ③ 中心区: #centeri(1fr)「xx小说网最近更新」update 列表(ul1 [分类]《书名》 / ul2 最新章节 / 作者+日期右对齐)
//      + #right(190px)「总推荐榜」15 行(序号+书名+右侧数值) 与 「最新小说」20 行(序号+书名+右侧日期)
//   (真站「友情链接」块与 .footer 由全局 SiteFooter 承担避免双友链/双页脚; 头部由 X2552Header 承担;
//    真站 ul 末尾「更多...」行指向站外榜单页, 本站无对应榜单视图 → 不渲染)
//
//   数据口径: 榜单/封面位用 fetchBooks(sort:'words') 字数最多当推荐榜(项目口径, 真站为推荐票数
//   无对应数据源, 右侧数值列显示字数); 更新列表/最新小说用 props.books(最新 48)。
//   站内跳转全部 navigate()。 [R24-6-b] 克隆首页 B 组实现 —— 桩实现升级为全结构还原。
// ============================================================
'use client'

import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import type { SiteHomeProps } from './shared'
import { usePublic } from '../ctx'
import { fetchBooks } from '../data'
import { BookCover } from '../BookCover'
import { Sk, bookNavProps } from '../bits'
import { fmtDate } from '../seo'
import type { BookItem } from '../types'

// [R24-6-b-28] 黑冰模板实测色值(硬编码)
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

// [R24-6-b-29] 精灵图(wamcc.png)标题条 → 纯 CSS 等价: 浅蓝灰渐变条(blocktitle/board 标题)
const TITLE_BAR = 'linear-gradient(180deg, #fbfcfe 0%, #e9eef5 100%)'
// [R24-6-b-30] blocktitle span 灰色小按钮位(sprite 0 -384px) → 纯 CSS 等价
const GRAY_BTN = 'linear-gradient(180deg, #ffffff 0%, #e5e5e5 100%)'

/** [R24-6-b-31] 链接行为(真站 style.css): #2f468f, hover 变橙并整体位移 1px —— inline 压不住 :hover → 局部 style 作用域类 */
const LINK_CSS = `
.x2-home a.x2-a{color:${C.link};text-decoration:none}
.x2-home a.x2-a:visited{color:${C.link}}
.x2-home a.x2-a:hover{color:${C.hover};position:relative;left:1px;top:1px}
`

/** [R24-6-b-32] YY-MM-DD(真站 update 列日期形态 26-09-15) / MM-DD(最新小说列表形态) */
function yymmdd(b: BookItem): string {
  const d = fmtDate(b.updatedAt)
  return d ? d.slice(2) : '--'
}
function mmdd(b: BookItem): string {
  const d = fmtDate(b.updatedAt)
  return d ? d.slice(5) : '--'
}

/** [R24-6-b-33] 字数短格式(右侧数值列, 口径=字数替代真站推荐票数): >=1万 显示 X万 */
function shortWords(n?: number | null): string {
  if (!n || n <= 0) return '0'
  if (n >= 10000) return `${Math.round(n / 10000)}万`
  return String(n)
}

/** [R24-6-b-34] .block 块容器(1px 边线 + 标题条) */
function blockStyle(): CSSProperties {
  return { border: `1px solid ${C.border}`, marginTop: 8 }
}

/** [R24-6-b-35] blocktitle 两种形态: withIcon=中央区(橙图标+14px 文字) / label=右栏(灰色小按钮位 80×30) */
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

  // [R24-6-b-36] 榜单维度: 字数最多 24 本当推荐榜(6 封面位 + 15 行榜单)
  const [hot, setHot] = useState<BookItem[]>([])
  const [hotDone, setHotDone] = useState(false) // 结束标志(含失败), 避免失败后骨架屏永久态

  useEffect(() => {
    let alive = true
    // [R24-6-修] effect 起始同步 setState 会触发级联渲染(react-hooks/set-state-in-effect), 移除; 站点切换由 HomeView key 重挂载兜底
    fetchBooks({ site: site.id, sort: 'words', page: 1, size: 24 })
      .then((d) => {
        if (alive) {
          setHot(d.books || [])
          setHotDone(true)
        }
      })
      .catch(() => {
        if (alive) {
          setHot([]) // 失败静默
          setHotDone(true)
        }
      })
    return () => {
      alive = false
    }
  }, [site.id])

  // [R24-6-b-37] 板块切片: 排行榜封面位 = 前 6 本带封面(不足时以无封面书兜底); 总推荐榜 15 行; 更新列表 34 行; 最新小说 20 行
  const boardBooks = (hot.filter((b) => b.cover).length >= 6 ? hot.filter((b) => b.cover) : hot).slice(0, 6)
  const rankRows = hot.slice(0, 15)
  const updateRows = books.slice(0, 34)
  const newestRows = books.slice(0, 20)

  return (
    <div className="x2-home" style={{ padding: '0 8px 16px', color: C.text, fontSize: 12, lineHeight: 1.2 }}>
      <style>{LINK_CSS}</style>
      <div className="mx-auto w-full max-w-[960px]">
        {/* ============ ① 红字公告条(真站内联样式块) ============ */}
        <div
          style={{
            border: `1px solid ${C.border}`,
            color: 'red',
            lineHeight: '25px',
            margin: '5px 0',
            padding: '2px 0',
            textAlign: 'left',
          }}
        >
          {/* [R24-6-b-38] 真站公告文案为站方编辑内容, 此处按真站版式以站点名生成等价文案(不假冒第三方数据) */}
          <p style={{ margin: 0, padding: '0 0 0 12px' }}>
            1、{site.name}全面升级，<b>手机版</b>同时上线 欢迎新老书友前来阅读。
          </p>
          <p style={{ margin: 0, padding: '0 0 0 12px' }}>2、感谢大家多年支持，{site.name} 坚持无弹窗广告阅读</p>
        </div>

        {/* ============ ② .board 排行榜横条 ============ */}
        <div style={{ marginTop: 8 }}>
          <div aria-hidden style={{ height: 2, border: `1px solid ${C.blueTop}`, background: C.blueBg, fontSize: 0 }} />
          <div style={{ padding: 1, background: '#FFFFFF', border: `1px solid ${C.border}` }}>
            <div style={{ position: 'relative', overflow: 'hidden' }}>
              <div
                style={{
                  height: 30,
                  lineHeight: '30px',
                  paddingLeft: 35,
                  fontSize: 14,
                  borderBottom: `1px solid ${C.border}`,
                  background: TITLE_BAR,
                }}
              >
                {site.name}排行榜
              </div>
              {/* 移动端横向滚动(真站桌面 6×135px 等宽排布) */}
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
                      <a
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
                      </a>
                      <br />
                      <a
                        className="x2-a"
                        style={{ display: 'inline-block', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
                        title={b.name}
                        {...bookNavProps(navigate, b.id)}
                      >
                        {b.name}
                      </a>
                    </div>
                  ))
                ) : (
                  // [R24-6-b-42] 失败/空数据静默文案(避免空白板永久态)
                  <p style={{ padding: '30px 0 20px 21px', color: C.text }}>暂无榜单数据</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ============ ③ 中心区: #centeri + #right ============ */}
        <div className="grid grid-cols-1 gap-2 min-[900px]:grid-cols-[minmax(0,1fr)_190px]">
          {/* #centeri: 最近更新 */}
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
                    : updateRows.map((b) => (
                        <li
                          key={b.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            borderBottom: `1px dotted ${C.border}`,
                            padding: '0 10px',
                            minHeight: 40,
                            textAlign: 'right',
                            fontSize: 12,
                          }}
                        >
                          <p
                            style={{
                              margin: 0,
                              flex: '0 1 250px',
                              minWidth: 0,
                              textAlign: 'left',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            <a
                              className="x2-a"
                              style={{ cursor: 'pointer' }}
                              onClick={() => b.categoryId && navigate({ view: 'category', cat: b.categoryId })}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(e) => {
                                if ((e.key === 'Enter' || e.key === ' ') && b.categoryId) {
                                  e.preventDefault()
                                  navigate({ view: 'category', cat: b.categoryId })
                                }
                              }}
                            >
                              [{b.category}]
                            </a>
                            《
                            <a
                              className="x2-a"
                              style={{ cursor: 'pointer' }}
                              title={b.name}
                              {...bookNavProps(navigate, b.id)}
                            >
                              {b.name}
                            </a>
                            》
                          </p>
                          {/* 真站 ul2 为章节链接; 列表数据无章节 id → 链到书籍页 */}
                          <p
                            className="hidden min-[640px]:block"
                            style={{
                              margin: 0,
                              flex: '0 1 340px',
                              minWidth: 0,
                              textAlign: 'left',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            <a
                              className="x2-a"
                              style={{ cursor: 'pointer' }}
                              title={b.latestChapter || b.name}
                              {...bookNavProps(navigate, b.id)}
                            >
                              {b.latestChapter || b.name}
                            </a>
                          </p>
                          <span style={{ marginLeft: 'auto', flex: '0 0 auto' }}>
                            {b.author}&nbsp;&nbsp;{yymmdd(b)}
                          </span>
                        </li>
                      ))}
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
                        <li
                          key={b.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            borderBottom: `1px dotted ${C.dot}`,
                            padding: '0 3px',
                            minHeight: 40,
                            fontSize: 11,
                          }}
                        >
                          {/* 真站 .ultop li 带 list-style decimal 序号 + p 数值绝对定位右侧 */}
                          <span style={{ flex: '0 0 auto', color: C.text }}>{i + 1}.</span>
                          <a
                            className="x2-a"
                            style={{ fontSize: 12, flex: '1 1 0', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
                            title={b.name}
                            {...bookNavProps(navigate, b.id)}
                          >
                            {b.name}
                          </a>
                          {/* 口径注释: 真站此列为推荐票数(无对应数据源) → 显示字数(shortWords) */}
                          <span style={{ flex: '0 0 auto', color: C.text }}>{shortWords(b.wordCount)}</span>
                        </li>
                      ))
                    : hotDone
                      ? // [R24-6-b-43] 失败/空数据静默文案
                        <li style={{ padding: 5, color: C.text }}>暂无榜单数据</li>
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
                    : newestRows.map((b, i) => (
                        <li
                          key={b.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            borderBottom: `1px dotted ${C.dot}`,
                            padding: '0 3px',
                            minHeight: 40,
                            fontSize: 11,
                          }}
                        >
                          {/* 真站 .ultop li 带 list-style decimal 序号 + p 日期绝对定位右侧 */}
                          <span style={{ flex: '0 0 auto', color: C.text }}>{i + 1}.</span>
                          <a
                            className="x2-a"
                            style={{ fontSize: 12, flex: '1 1 0', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
                            title={b.name}
                            {...bookNavProps(navigate, b.id)}
                          >
                            {b.name}
                          </a>
                          <span style={{ flex: '0 0 auto', color: C.text }}>{mmdd(b)}</span>
                        </li>
                      ))}
                </ul>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
