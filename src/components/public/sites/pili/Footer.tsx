// ============================================================
// [R41-C-1] pili(霹雳书屋) 源站 1:1 仿制页脚 —— wmcms 模板 mod-footer 族
// 素材出处: /tmp/r41-snap/pilishuwu.com.html(cloak 实抓, 5278-5288 行 footer 块) +
//   /tmp/r41-css/pili-global.css(1388-1427 行 .mod-footer-* / .ui-wm 逐条实测)
// 源站结构:
//   .mod-footer-wr(position:relative; padding-top:34px; background:#f69057)
//     └ .mod-footer-main-wr(height:64px; 背景图 ac_footer_bg.jpg)
//         └ .mod-footer-main.ui-wm(1200px 版心) > .mod-footer-info(白字/22px 行/居中)
//   .mod-footer-border(absolute top:-10px 高 10px 精灵图装饰条 ac_global.png 0 -703px)
// 不可复刻项降级声明:
//   ①.mod-footer-border 精灵图切图 → 等高 10px 白色系细条纹近似; 位置由源站负 top
//     (叠压上方正文 10px)改为页脚内顶(top:0), 视觉等价(亮色分隔带)且不在任意底色正文上
//     叠半透明条 ②.mod-footer-main-wr 背景图 → 省略, 保持 64px 高
// 替换说明: 原 R39 页内版 PiliFooter(parts.tsx 深棕底, 随 8 个页型渲染)已删除, 本组件经
//   index.ts Footer 挂载后为全站唯一页脚(PublicSite CloneFooter 出口)。
// ============================================================
'use client'

export function PiliFooter() {
  return (
    <footer style={{ position: 'relative', paddingTop: 34, backgroundColor: '#f69057' }}>
      {/* [R41-C-1] .mod-footer-border 装饰条(源站精灵图) → 等高白色系细条纹近似 */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: 10,
          background: 'repeating-linear-gradient(90deg, rgba(255,255,255,.7) 0 12px, rgba(255,255,255,.3) 12px 24px)',
        }}
      />
      {/* .mod-footer-main-wr(height:64px, 背景图省略) > .ui-wm 1200px 版心(max-width 响应式) */}
      <div style={{ height: 64 }}>
        <div style={{ maxWidth: 1200, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
          {/* .mod-footer-main .mod-footer-info: line-height 22px/text-align center/color #fff/margin 0 5px */}
          <div style={{ lineHeight: '22px', textAlign: 'center', color: '#fff', margin: '0 5px' }}>
            本站所有小说为完本转载作品，所有内容版权归版权方或原作者所有。
          </div>
        </div>
      </div>
    </footer>
  )
}
