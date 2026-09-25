/* ============================================================
   前台阅读交互(site.js — 原生 JS)
   阅读页工具条: 背景/字号/字体/字色 (localStorage 记忆)
   键盘 ←/→ 翻章 · 双击滚屏 · 回到顶部 · 阅读历史页渲染
   ============================================================ */
(function () {
  'use strict';
  var LS_KEY = 'ajx_reader_prefs_v1';
  var READPOS_PREFIX = 'heis_readpos_'; // 与原 React 版 reading-memory.ts 同键位

  function loadPrefs() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {}; } catch (e) { return {}; }
  }
  function savePrefs(p) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(p)); } catch (e) { /* 隐私模式忽略 */ }
  }

  /* ---------- 阅读页工具条 ---------- */
  var txt = document.getElementById('view_content_txt');
  if (txt) {
    var prefs = loadPrefs();
    // [R67] aijjxs 阅读页默认底色与页面整体底色一致: 无记忆偏好时不涂色(透明), 页面米黄渐变透出;
    // 其余主题维持 #f8f8f8 记忆纸色不变。判据 = aijjxs 专属正文卡 .ajx-view-content 存在;
    // 用户显式选过背景(prefs.bg 非空)则任何主题都始终优先用户选择。
    var ajxPageBg = !!document.querySelector('.ajx-view-content');
    var bg = prefs.bg || (ajxPageBg ? '' : '#f8f8f8');
    var fs = prefs.fs || '17';
    var ink = prefs.ink || '#27231f';
    var ff = prefs.ff || '';

    function apply() {
      txt.style.background = bg;
      txt.style.color = ink;
      txt.style.fontSize = fs + 'px';
      txt.style.fontFamily = ff || '';
      // [R67] 默认态: 正文玻璃卡同步让位(仅留边框阴影), 页面底色完整透出; 选定背景后恢复玻璃卡
      var card = document.querySelector('.ajx-view-content');
      if (card) card.classList.toggle('is-pagebg', !bg);
      document.querySelectorAll('.ajx-c').forEach(function (el) {
        el.classList.toggle('is-active', el.getAttribute('data-bg') === bg);
      });
      document.querySelectorAll('.ajx-s').forEach(function (el) {
        el.classList.toggle('is-active', el.getAttribute('data-fs') === String(fs));
      });
      document.querySelectorAll('.ajx-ys a').forEach(function (el) {
        el.classList.toggle('is-active', el.getAttribute('data-ink') === ink);
      });
      var sel = document.getElementById('ajx-ffamily');
      if (sel) sel.value = ff;
    }
    apply();

    document.querySelectorAll('.ajx-c').forEach(function (el) {
      el.addEventListener('click', function () { bg = el.getAttribute('data-bg'); prefs.bg = bg; savePrefs(prefs); apply(); });
    });
    document.querySelectorAll('.ajx-s').forEach(function (el) {
      el.addEventListener('click', function () { fs = el.getAttribute('data-fs'); prefs.fs = fs; savePrefs(prefs); apply(); });
    });
    document.querySelectorAll('.ajx-ys a').forEach(function (el) {
      el.addEventListener('click', function () { ink = el.getAttribute('data-ink'); prefs.ink = ink; savePrefs(prefs); apply(); });
    });
    var sel = document.getElementById('ajx-ffamily');
    if (sel) sel.addEventListener('change', function () { ff = sel.value; prefs.ff = ff; savePrefs(prefs); apply(); });

    /* 键盘 ←/→ 翻章(输入态守卫对齐通用 ReadView) */
    document.addEventListener('keydown', function (e) {
      var t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.key === 'ArrowLeft') { var p = document.getElementById('ajx-prev'); if (p) p.click(); }
      if (e.key === 'ArrowRight') { var n = document.getElementById('ajx-next'); if (n) n.click(); }
    });

    /* 双击滚屏(再次双击停止) */
    var scrollTimer = null;
    txt.addEventListener('dblclick', function () {
      if (scrollTimer) { clearInterval(scrollTimer); scrollTimer = null; return; }
      scrollTimer = setInterval(function () { window.scrollBy(0, 2); }, 30);
    });

    /* 阅读位置记忆(heis_readpos_<bookId>, 与原版键位兼容) */
    var page = document.querySelector('[data-page="read"]');
    var bookId = page ? (page.getAttribute('data-book-id') || '') : '';
    var chTitle = page ? (page.getAttribute('data-chapter-title') || '') : '';
    var chId = page ? (page.getAttribute('data-chapter-id') || '') : '';
    if (bookId) {
      window.addEventListener('scroll', throttle(function () {
        var h = document.documentElement.scrollHeight - window.innerHeight;
        var ratio = h > 0 ? Math.min(1, Math.max(0, window.scrollY / h)) : 0;
        try {
          localStorage.setItem(READPOS_PREFIX + bookId, JSON.stringify({
            chapterId: chId, scrollRatio: ratio, title: chTitle, ts: Date.now()
          }));
        } catch (e) { /* ignore */ }
      }, 1000));
    }
  }

  /* ---------- 阅读历史页 ---------- */
  var histList = document.getElementById('ajx-history-list');
  if (histList) {
    var entries = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!k || k.indexOf(READPOS_PREFIX) !== 0) continue;
        try {
          var v = JSON.parse(localStorage.getItem(k) || '');
          if (v && v.ts) entries.push({ bookId: k.slice(READPOS_PREFIX.length), pos: v });
        } catch (e) { /* ignore */ }
      }
    } catch (e) { /* ignore */ }
    entries.sort(function (a, b) { return (b.pos.ts || 0) - (a.pos.ts || 0); });
    var empty = document.getElementById('ajx-history-empty');
    if (!entries.length) {
      if (empty) empty.style.display = '';
    } else {
      if (empty) empty.style.display = 'none';
      entries.slice(0, 50).forEach(function (en) {
        var li = document.createElement('li');
        li.className = 'ajx-line';
        var d = new Date(en.pos.ts);
        var pad = function (n) { return (n < 10 ? '0' : '') + n; };
        li.innerHTML = '<span class="ajx-line-main"><span class="ajx-cat">继续读</span>' +
          '<a href="/?view=read&chapter=' + encodeURIComponent(en.pos.chapterId || '') + '">' +
          escapeHTML(en.pos.title || '上次阅读') + '</a></span>' +
          '<span class="ajx-date"><span>' + d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + '</span></span>';
        histList.appendChild(li);
      });
    }
  }

  /* ---------- 回到顶部 ---------- */
  var top = document.createElement('button');
  top.id = 'ajx-backtop';
  top.type = 'button';
  top.textContent = '顶部';
  top.setAttribute('aria-label', '回到顶部');
  document.body.appendChild(top);
  window.addEventListener('scroll', throttle(function () {
    top.classList.toggle('is-show', window.scrollY > 600);
  }, 300));
  top.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });

  /* ---------- utils ---------- */
  function throttle(fn, ms) {
    var last = 0, timer = null;
    return function () {
      var now = Date.now();
      if (now - last >= ms) { last = now; fn(); }
      else if (!timer) {
        timer = setTimeout(function () { timer = null; last = Date.now(); fn(); }, ms - (now - last));
      }
    };
  }
  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
})();
