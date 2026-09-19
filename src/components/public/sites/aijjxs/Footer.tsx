// ============================================================
// [R41-A-1] aijjxs(久久小说下载网) 克隆页脚 —— 源站快照 /tmp/r41-snap/aijjxs.com.html 尾部
//   <footer class="foot"> 实抓: 6 站内导航链接行(「 · 」分隔) + Copyright 行 + 免责声明行, 文案逐字节对齐快照。
//   源站 CSS(/tmp/r41-css/aijjxs-main.css): .foot{margin-top:24px;padding-top:12px;
//   border-top:1px solid var(--line)=#e5dccd;font-size:13px;color:var(--muted)=#6b7280}, 版心随 .wrap(1220)。
//   导航 6 链接为站内无实义入口(R41 规格约定) → navigate home; 样式由 index.ts .ajx-ft 规则承载。
//   [R41-A-2] 挂载方式: index.ts Footer 槽 → PublicSite CloneFooter 统一渲染(替换通用 SiteFooter),
//   各页型不再内嵌页脚(旧 parts.tsx 页内版已摘除)。
// ============================================================
'use client'

import { usePublic, viewToUrl } from '../../ctx'

const FOOT_LINKS = ['网站简介', '网站帮助', '版权声明', '网站地图', '友情链接', '留言建议']

export function AijjxsFooter() {
  const { site, navigate } = usePublic()
  // [R41-A-3] 站内链接写法仿 Home.tsx: href 走 viewToUrl 保伪静态形态, onClick preventDefault 后 SPA 导航
  const homeUrl = viewToUrl({ view: 'home' }, site.id)
  return (
    <footer className="ajx-ft">
      <div>
        {FOOT_LINKS.map((label, i) => (
          <span key={label}>
            <a href={homeUrl} onClick={(e) => { e.preventDefault(); navigate({ view: 'home' }) }}>{label}</a>
            {i < FOOT_LINKS.length - 1 ? <span aria-hidden> · </span> : null}
          </span>
        ))}
      </div>
      <div>Copyright © 久久小说下载网 All Rights Reserved</div>
      <div>本站所有小说电子书均系网友上传，仅供书友之间免费下载预览！</div>
    </footer>
  )
}
