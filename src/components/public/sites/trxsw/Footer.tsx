// ============================================================
// [R46-2b-1] trxsw(唐人小说网) 源站 1:1 仿制页脚 —— 2026-09-19 真站实抓重校准版
// 素材出处(本轮实抓, 取代 R41-C Wayback 版): CN 代理(池内 120.232.115.57:17981)直抓
//   /tmp/r46-theme/trxsw-home.html 69.9KB + /tmp/r46-theme/trxsw-33yq.css 20KB
//   (真站现挂 /tpl/default/style/33yq.css —— 与 x33yq 同属 520xs 模板家族, 非 2019 杰奇默认模板)。
// 真站页脚结构(首页尾部实抓):
//   <div class="footer"><div class="footer_cont">
//     <p>唐人小说网所有免费小说阅读网络小说为转载作品，转载至唐人小说网只是为了宣传本书让更多读者欣赏。</p>
//     <p>Copyright © 唐人小说网 <a href="https://beian.miit.gov.cn/" target="_blank">苏ICP备2024118507号-1</a></p>
//   </div></div>
// 真站 CSS 逐条实测(33yq.css): .footer{margin:auto;width:980px;text-align:center} +
//   .footer_cont{margin:10px auto auto} + .footer_cont p{color:#302b35;line-height:20px} ——
//   无底色/无边线(透出 body #e9faff, 见 themes.ts vars.bg [R46-2b-3]); 旧 Wayback 版的
//   #f5f5f5 底 + 1px #e5e5e5 顶线 + #999 字为 2019 杰奇家族推定值, 与真站实测不符, 全部弃用。
// 备案链接: 真站真实外链 https://beian.miit.gov.cn/ → safeHref 白名单 + target _blank。
// 站名硬编码「唐人小说网」: 真站页脚为字面站名(qb23「铅笔小说」同口径), 非动态 site.name
//   —— 真站已由 2019「同人小说网」品牌升级为「唐人小说网」, 见 themes.ts [R46-2b-3]。
// 版心适配: 真站 width:980px 固定 → max-width:980 + width:100% + box-sizing(ddyueshu 先例),
//   375px 无横滚。
// ============================================================
'use client'

import { safeHref } from '../../safe-href'

export function TrxswFooter() {
  return (
    <footer className="trx-footer">
      <div className="trx-footer-cont">
        <p>唐人小说网所有免费小说阅读网络小说为转载作品，转载至唐人小说网只是为了宣传本书让更多读者欣赏。</p>
        <p>
          Copyright © 唐人小说网{' '}
          <a href={safeHref('https://beian.miit.gov.cn/')} target="_blank" rel="noopener noreferrer">
            苏ICP备2024118507号-1
          </a>
        </p>
      </div>
    </footer>
  )
}
