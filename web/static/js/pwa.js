/* ============================================================
   PWA 注册脚本(site.js 独立伴随件 — 所有前台主题 layout 引用)
   仅 https/localhost 生效; 失败静默(不影响正常浏览)。
   ============================================================ */
(function () {
  'use strict';
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:' && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) return;
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js').catch(function () { /* 注册失败静默 */ });
  });
})();
