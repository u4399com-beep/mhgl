/* ============================================================
   后台管理台(admin.js — 原生 JS, 零依赖)
   fetch 封装(信封 {ok,data|error} / 401 跳登录) + 三态渲染 + 二次确认弹层
   分区: dashboard/tasks/rules/proxy/books/categories/sites/links/downloads/settings/feedback/backup
   契约: internal/api/router.go(3-b); 端点未就绪时页面容错显示空态/错误态, 不白屏
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- fetch 封装 ---------------- */
  async function api(path, opts) {
    opts = opts || {};
    var init = {
      method: opts.method || 'GET',
      credentials: 'same-origin',
      headers: {}
    };
    if (opts.body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(opts.body);
    }
    var res;
    try {
      res = await fetch(path, init);
    } catch (e) {
      throw new Error('网络错误: ' + (e && e.message ? e.message : e));
    }
    if (res.status === 401) {
      location.href = '/admin/login';
      throw new Error('登录已过期, 请重新登录');
    }
    var j = null;
    try { j = await res.json(); } catch (e) { /* 非 JSON */ }
    if (!res.ok || !j || j.ok !== true) {
      throw new Error((j && j.error) ? j.error : ('请求失败 HTTP ' + res.status));
    }
    return j.data;
  }
  function GET(p) { return api(p); }
  function POST(p, body) { return api(p, { method: 'POST', body: body === undefined ? {} : body }); }
  function PUT(p, body) { return api(p, { method: 'PUT', body: body }); }
  function PATCH(p, body) { return api(p, { method: 'PATCH', body: body }); }
  function DEL(p) { return api(p, { method: 'DELETE' }); }

  /* ---------------- 小工具 ---------------- */
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function safeParse(v) {
    if (v === null || v === undefined) return {};
    if (typeof v === 'object') return v;
    try { var o = JSON.parse(v); return (o && typeof o === 'object') ? o : {}; } catch (e) { return {}; }
  }
  function fmtNum(n) {
    n = Number(n) || 0;
    if (n >= 1e8) return (n / 1e8).toFixed(2) + ' 亿';
    if (n >= 1e4) return (n / 1e4).toFixed(1) + ' 万';
    return String(n);
  }
  function fmtBytes(n) {
    n = Number(n) || 0;
    if (n >= 1073741824) return (n / 1073741824).toFixed(2) + ' GB';
    if (n >= 1048576) return (n / 1048576).toFixed(1) + ' MB';
    if (n >= 1024) return (n / 1024).toFixed(1) + ' KB';
    return n + ' B';
  }
  function fmtTime(ms) {
    ms = Number(ms) || 0;
    if (!ms) return '-';
    var d = new Date(ms);
    var p = function (x) { return (x < 10 ? '0' : '') + x; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function fmtDur(sec) {
    sec = Math.max(0, Number(sec) || 0);
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
    return (h ? h + 'h ' : '') + m + 'm';
  }
  /* [R55-3c3] completed/ongoing 为书籍状态(与 TS BooksSection 文案对齐), 其余为任务状态 */
  var STATUS_LABEL = { running: '运行中', paused: '已暂停', pending: '等待中', done: '已完成', error: '错误', stopped: '已停止', completed: '已完结', ongoing: '连载中' };
  function badge(status) {
    var s = String(status || 'pending');
    return '<span class="adm-badge is-' + esc(s) + '">' + esc(STATUS_LABEL[s] || s) + '</span>';
  }
  function progressOf(row) {
    var p = safeParse(row.progress);
    function pct(a, b) { b = Number(b) || 0; return b > 0 ? Math.min(100, Math.round((Number(a) || 0) / b * 100)) : 0; }
    var pc = pct(p.contentDone, p.contentTotal);
    var pb = pct(p.bookDone, p.bookTotal);
    var v = Math.max(pc, pb);
    var txt = '';
    if (p.contentTotal) txt = '正文 ' + (p.contentDone || 0) + '/' + p.contentTotal;
    else if (p.bookTotal) txt = '书籍 ' + (p.bookDone || 0) + '/' + p.bookTotal;
    else if (p.phase) txt = String(p.phase);
    else if (row.status === 'done') { v = 100; txt = '已完成'; }
    return { pct: v, txt: txt };
  }
  function progressCell(row) {
    var pr = progressOf(row);
    return '<div class="adm-progress-row"><div class="adm-progress" role="progressbar" aria-valuenow="' + pr.pct + '" aria-valuemin="0" aria-valuemax="100"><span style="width:' + pr.pct + '%"></span></div><span class="adm-progress-txt">' + esc(pr.txt) + '</span></div>';
  }
  function stateMsg(el, msg, isError) {
    if (typeof el === 'string') el = $(el);
    if (el) el.innerHTML = '<div class="adm-state' + (isError ? ' is-error' : '') + '">' + esc(msg) + '</div>';
  }
  function errText(e) { return (e && e.message) ? e.message : String(e); }

  /* ---------------- toast / 确认弹层 ---------------- */
  var toastTimer = null;
  function toast(msg, isError) {
    var t = $('adm-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'adm-toast';
      t.style.cssText = 'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:9999;padding:10px 18px;border-radius:10px;font-size:13px;color:#fff;background:#3f3f46;box-shadow:0 10px 30px rgba(0,0,0,.5);max-width:86vw;';
      document.body.appendChild(t);
    }
    t.style.background = isError ? '#7f1d1d' : '#1c2b22';
    t.style.border = '1px solid ' + (isError ? '#ef4444' : '#10b981');
    t.textContent = msg;
    t.style.display = 'block';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.style.display = 'none'; }, 3200);
  }
  var dlg = null;
  function dialogEl() { return dlg || ($('adm-dialog') || null); }
  function closeDialog() {
    var d = dialogEl();
    if (d && d.open) d.close();
  }
  /** 打开弹层: html 内含 <form id="adm-dlg-form">; onsubmit(form, close) */
  function openDialog(title, bodyHTML, onsubmit) {
    var d = dialogEl();
    if (!d) return;
    d.innerHTML = '<h3>' + esc(title) + '</h3><form class="adm-dialog-form" id="adm-dlg-form" method="dialog">' + bodyHTML +
      '<div class="adm-form-error" id="adm-dlg-error" style="display:none"></div>' +
      '<div class="adm-dialog-foot"><button type="button" class="adm-btn" id="adm-dlg-cancel">取消</button>' +
      '<button type="submit" class="adm-btn is-primary" id="adm-dlg-ok">确 定</button></div></form>';
    $('adm-dlg-cancel').addEventListener('click', function () { d.close(); });
    d.querySelector('#adm-dlg-form').addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (onsubmit) {
        Promise.resolve(onsubmit(d.querySelector('#adm-dlg-form'), closeDialog)).catch(function (e) {
          var box = $('adm-dlg-error');
          if (box) { box.style.display = ''; box.textContent = errText(e); }
        });
      }
    });
    if (typeof d.showModal === 'function') d.showModal();
  }
  /** 二次确认(删除/危险操作) */
  function admConfirm(message, danger) {
    return new Promise(function (resolve) {
      var d = dialogEl();
      if (!d) { resolve(window.confirm(message)); return; }
      d.innerHTML = '<h3>请确认</h3><p style="margin:0 0 16px;color:#a1a1aa">' + esc(message) + '</p>' +
        '<div class="adm-dialog-foot"><button type="button" class="adm-btn" id="adm-cf-no">取消</button>' +
        '<button type="button" class="adm-btn ' + (danger ? 'is-danger' : 'is-primary') + '" id="adm-cf-yes">确 认</button></div>';
      var done = false;
      function fin(v) { if (!done) { done = true; d.close(); resolve(v); } }
      $('adm-cf-no').addEventListener('click', function () { fin(false); });
      $('adm-cf-yes').addEventListener('click', function () { fin(true); });
      d.addEventListener('close', function () { fin(false); }, { once: true });
      if (typeof d.showModal === 'function') d.showModal(); else fin(false);
    });
  }

  /* ---------------- 表单小件 ---------------- */
  function fld(label, inner) { return '<label class="adm-label">' + esc(label) + inner + '</label>'; }
  function sel(id, options, val) {
    var h = '<select class="adm-input" id="' + id + '">';
    options.forEach(function (o) {
      h += '<option value="' + esc(o[0]) + '"' + (String(val) === String(o[0]) ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
    });
    return h + '</select>';
  }
  function chk(id, label, on) {
    return '<label class="adm-label is-check"><input type="checkbox" id="' + id + '"' + (on ? ' checked' : '') + '> ' + esc(label) + '</label>';
  }

  /* ---------------- 登录页 ---------------- */
  function initLogin() {
    var form = $('adm-login-form');
    if (!form) return;
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var btn = $('adm-login-btn'), err = $('adm-login-error'), pwd = $('adm-login-pwd');
      err.style.display = 'none';
      btn.disabled = true; btn.textContent = '登录中…';
      POST('/api/auth/login', { password: pwd.value }).then(function () {
        location.href = '/admin';
      }).catch(function (e) {
        err.style.display = ''; err.textContent = errText(e);
        btn.disabled = false; btn.textContent = '登 录';
      });
    });
    var pwd = $('adm-login-pwd');
    if (pwd) pwd.focus();
  }

  /* ---------------- 布局: 退出登录 ---------------- */
  function initLogout() {
    var b = $('adm-logout');
    if (!b) return;
    b.addEventListener('click', function () {
      POST('/api/auth/logout').catch(function () { }).then(function () { location.href = '/admin/login'; });
    });
  }

  /* ---------------- 仪表盘 ---------------- */
  var dashTimer = null;
  function initDashboard() {
    var stop = false;
    function pull() {
      if (stop) return;
      Promise.all([GET('/api/admin/stats'), GET('/api/admin/health')]).then(function (rs) {
        renderDashStats(rs[0]); renderDashHealth(rs[1]);
        return rs[0];
      }).then(function (stats) {
        if (stats && stats.recentTasks && stats.recentTasks.length) {
          return GET('/api/admin/tasks/' + encodeURIComponent(stats.recentTasks[0].id) + '/logs').then(function (logs) {
            var el = $('dash-logs');
            if (!el) return;
            $('dash-log-task').textContent = '任务: ' + (stats.recentTasks[0].name || stats.recentTasks[0].id);
            var tail = (logs || []).slice(-30);
            el.innerHTML = tail.length ? tail.map(function (l) {
              return '<div class="adm-logline is-' + esc(l.level || 'info') + '">[' + fmtTime(l.createdAt) + '] ' + esc(l.message) + '</div>';
            }).join('') : '<div class="adm-state">该任务暂无日志</div>';
          }).catch(function () { });
        }
      }).catch(function (e) {
        stateMsg('dash-stats', '加载失败: ' + errText(e), true);
        stateMsg('dash-health', '加载失败', true);
      });
    }
    function loop() {
      pull();
      clearTimeout(dashTimer);
      dashTimer = setTimeout(function () {
        if ($('dash-log-auto') && $('dash-log-auto').checked) loop();
      }, 10000);
    }
    var rf = $('dash-refresh');
    if (rf) rf.addEventListener('click', pull);
    var au = $('dash-log-auto');
    if (au) au.addEventListener('change', function () {
      clearTimeout(dashTimer);
      if (au.checked) loop();
    });
    loop();
    window.addEventListener('beforeunload', function () { stop = true; clearTimeout(dashTimer); });
  }
  function renderDashStats(s) {
    var el = $('dash-stats');
    if (!el) return;
    var cards = [
      ['书籍', fmtNum(s.books)], ['章节', fmtNum(s.chapters)], ['总字数', fmtNum(s.totalWords)],
      ['标签', fmtNum(s.tags)], ['规则', fmtNum(s.rules)], ['任务', fmtNum(s.tasks) + ' (活动 ' + (s.runningTasks || 0) + ')'], /* [R55-3c3] runningTasks 口径=running+paused, 标签改「活动」 */
      ['站点', fmtNum(s.sites)], ['下载任务', fmtNum(s.downloads)]
    ];
    el.className = 'adm-kv-list';
    el.innerHTML = cards.map(function (c) { return '<div class="adm-stat"><b>' + esc(c[1]) + '</b><span>' + esc(c[0]) + '</span></div>'; }).join('');
    var tl = $('dash-tasks');
    if (tl) {
      var rows = s.recentTasks || [];
      tl.className = 'adm-table-wrap';
      tl.innerHTML = rows.length ?
        '<table class="adm-table"><thead><tr><th>任务</th><th>状态</th><th>进度</th><th>更新时间</th></tr></thead><tbody>' +
        rows.map(function (t) {
          return '<tr><td>' + esc(t.name || t.id) + '</td><td>' + badge(t.status) + '</td><td>' + progressCell(t) + '</td><td class="adm-muted">' + fmtTime(t.updatedAt) + '</td></tr>';
        }).join('') + '</tbody></table>' : '<div class="adm-empty">暂无任务, 去「采集任务」新建。</div>';
    }
    var up = $('dash-updated');
    if (up) up.textContent = '更新于 ' + new Date().toLocaleTimeString();
  }
  function renderDashHealth(h) {
    var el = $('dash-health');
    if (!el) return;
    var ok = h.status === 'healthy';
    var rows = [
      ['状态', ok ? '<span class="adm-badge is-running">healthy</span>' : '<span class="adm-badge is-error">unhealthy</span>'],
      ['数据库', h.db === 'ok' ? '<span class="adm-badge is-running">ok</span>' : '<span class="adm-badge is-error">fail</span>'],
      ['运行/暂停任务', (h.runner && (h.runner.running || 0)) + ' / ' + ((h.runner && h.runner.paused) || 0)],
      ['内存 RSS', fmtBytes(h.memory && h.memory.rss)],
      ['堆使用', fmtBytes(h.memory && h.memory.heapUsed)],
      ['DB 大小', fmtBytes(h.dbSizeBytes)],
      ['运行时长', fmtDur(h.uptime)],
      ['GC 次数', (h.gc && h.gc.numGC) || 0]
    ];
    el.className = 'adm-kv-list';
    el.innerHTML = rows.map(function (r) { return '<div class="adm-stat"><b>' + r[1] + '</b><span>' + esc(r[0]) + '</span></div>'; }).join('');
  }

  /* ---------------- 采集任务 ---------------- */
  var taskTimer = null, logTimer = null, logTaskId = '';
  /* [R55-3c3] 任务列表规则名列: TS 原件展示 rule?.name; Go 列表接口未带 ruleName/rule 对象,
     客户端拉一次规则表建映射(失败或未命中回落 ruleId 前 8 位) */
  var ruleNameMap = {};
  function prefetchRuleNames() {
    GET('/api/admin/rules?size=200').then(function (d) {
      var rows = d.rules || d || [];
      ruleNameMap = {};
      rows.forEach(function (r) { ruleNameMap[r.id] = r.name; });
      if ($('task-list')) loadTasks();
    }).catch(function () { });
  }
  function ruleNameOf(t) {
    if (!t) return '-';
    if (t.rule && t.rule.name) return t.rule.name;
    if (t.ruleName) return t.ruleName;
    return ruleNameMap[t.ruleId] || (t.ruleId || '').slice(0, 8) || '-';
  }
  function taskActions(t) {
    var btns = [];
    var st = t.status;
    if (st === 'running') btns.push(['pause', '暂停', '']);
    if (st === 'paused') btns.push(['resume', '续跑', ''], ['start', '启动', '']);
    if (st === 'pending' || st === 'stopped' || st === 'error' || st === 'done') btns.push(['start', '启动', '']);
    if (st === 'running' || st === 'paused') btns.push(['stop', '停止', 'is-danger']);
    return btns.map(function (b) {
      return '<button class="adm-btn is-tiny ' + b[2] + '" data-act="control" data-id="' + esc(t.id) + '" data-action="' + b[0] + '">' + b[1] + '</button>';
    }).join('') +
      '<button class="adm-btn is-tiny" data-act="logs" data-id="' + esc(t.id) + '" data-name="' + esc(t.name || t.id) + '">日志</button>' +
      '<button class="adm-btn is-tiny" data-act="edit" data-id="' + esc(t.id) + '">编辑</button>' +
      '<button class="adm-btn is-tiny is-danger" data-act="del" data-id="' + esc(t.id) + '" data-name="' + esc(t.name || t.id) + '">删除</button>';
  }
  function renderTasks(rows) {
    var el = $('task-list');
    if (!el) return;
    el.className = 'adm-table-wrap';
    if (!rows || !rows.length) { el.innerHTML = '<div class="adm-empty">暂无任务, 点击右上角「＋ 新建任务」。</div>'; return; }
    el.innerHTML = '<table class="adm-table"><thead><tr><th>任务</th><th>模式</th><th>状态</th><th>进度</th><th>更新</th><th>操作</th></tr></thead><tbody>' +
      rows.map(function (t) {
        return '<tr><td>' + esc(t.name || t.id) + '<div class="adm-muted">规则 ' + esc(ruleNameOf(t)) + (t.engine === 'go' ? ' · Go' : ' · TS') + '</div></td>' +
          '<td class="adm-muted">' + esc(t.mode || '-') + '</td><td>' + badge(t.status) + '</td><td>' + progressCell(t) + '</td>' +
          '<td class="adm-muted">' + fmtTime(t.updatedAt) + '</td><td><div class="adm-actions">' + taskActions(t) + '</div></td></tr>';
      }).join('') + '</tbody></table>';
  }
  function loadTasks() {
    var st = $('task-filter-status') ? $('task-filter-status').value : '';
    stateMsg('task-list', '加载中…');
    GET('/api/admin/tasks' + (st ? '?status=' + encodeURIComponent(st) : '')).then(renderTasks)
      .catch(function (e) { stateMsg('task-list', '加载失败: ' + errText(e), true); });
  }
  function taskFormHTML(rules, t) {
    t = t || {};
    var p = safeParse(t.progress);
    var modeOpts = [['single', '单本 (书籍页 URL)'], ['range', '范围 (列表页 URL + 起止页)'], ['bookIds', '书号 (URL 模板 + 书号列表)']];
    return fld('任务名称', '<input class="adm-input" id="tf-name" value="' + esc(t.name || '') + '" required>') +
      fld('采集规则', sel('tf-rule', rules.map(function (r) { return [r.id, r.name + (r.enabled ? '' : ' (停用)')]; }), t.ruleId)) +
      fld('采集模式', sel('tf-mode', modeOpts, t.mode || 'range')) +
      fld('书籍页 URL(single/bookIds; bookIds 需含 {id} 占位符)', '<input class="adm-input" id="tf-bookurl" value="' + esc(t.bookUrl || '') + '" placeholder="https://…/book/{id}.html">') +
      fld('列表页 URL(range; 支持 {page}/{offset:N} 占位)', '<input class="adm-input" id="tf-listurl" value="' + esc(t.listUrl || '') + '" placeholder="https://…/list/{page}.html">') +
      '<div class="adm-form-grid">' +
      fld('列表起始页', '<input class="adm-input" id="tf-liststart" type="number" min="0" value="' + esc(t.listStart || 0) + '">') +
      fld('列表结束页', '<input class="adm-input" id="tf-listend" type="number" min="0" value="' + esc(t.listEnd || 0) + '">') +
      '</div>' +
      fld('书号列表(bookIds 模式, 每行一个或逗号分隔; 与范围二选一)', '<textarea class="adm-input" id="tf-bookids" placeholder="1001&#10;1002">' + esc(t.bookIds || '') + '</textarea>') +
      '<div class="adm-form-grid">' +
      fld('书号起(范围二选一)', '<input class="adm-input" id="tf-bookfrom" value="' + esc(t.bookIdFrom || '') + '">') +
      fld('书号止', '<input class="adm-input" id="tf-bookto" value="' + esc(t.bookIdTo || '') + '">') +
      '</div>' +
      '<div class="adm-form-grid">' +
      fld('增量模式', sel('tf-recrawl', [['incremental', '增量(仅缺失)'], ['full', '全量重采']], t.recrawlMode || 'incremental')) +
      fld('存储方式', sel('tf-storage', [['db', '数据库'], ['txt', 'TXT 文件']], t.storageMode || 'db')) +
      '</div>' +
      '<div class="adm-form-grid">' +
      fld('线程下限', '<input class="adm-input" id="tf-thmin" type="number" min="1" value="' + esc(t.threadMin || 1) + '">') +
      fld('线程上限', '<input class="adm-input" id="tf-thmax" type="number" min="1" value="' + esc(t.threadMax || 2) + '">') +
      fld('间隔下限 ms', '<input class="adm-input" id="tf-ivmin" type="number" min="0" value="' + esc(t.intervalMin || 800) + '">') +
      fld('间隔上限 ms', '<input class="adm-input" id="tf-ivmax" type="number" min="0" value="' + esc(t.intervalMax || 1800) + '">') +
      '</div>' +
      '<div class="adm-form-grid">' +
      chk('tf-smartcat', '智能分类', t.smartCategory === undefined ? true : !!t.smartCategory) +
      chk('tf-smartdone', '智能完结检测', t.smartComplete === undefined ? true : !!t.smartComplete) +
      chk('tf-autorefresh', '完成后定时续采', !!t.autoRefresh) +
      fld('续采间隔(分钟, 5~1440)', '<input class="adm-input" id="tf-refmin" type="number" min="5" max="1440" value="' + esc(t.refreshIntervalMin || 30) + '">') +
      '</div>';
  }
  function taskFormBody(t) {
    return {
      name: $('tf-name').value.trim(),
      ruleId: $('tf-rule').value,
      mode: $('tf-mode').value,
      bookUrl: $('tf-bookurl').value.trim(),
      listUrl: $('tf-listurl').value.trim(),
      listStart: Number($('tf-liststart').value) || 0,
      listEnd: Number($('tf-listend').value) || 0,
      bookIds: $('tf-bookids').value.trim(),
      bookIdFrom: $('tf-bookfrom').value.trim(),
      bookIdTo: $('tf-bookto').value.trim(),
      recrawlMode: $('tf-recrawl').value,
      storageMode: $('tf-storage').value,
      threadMin: Number($('tf-thmin').value) || 1,
      threadMax: Number($('tf-thmax').value) || 1,
      intervalMin: Number($('tf-ivmin').value) || 0,
      intervalMax: Number($('tf-ivmax').value) || 0,
      smartCategory: $('tf-smartcat').checked,
      smartComplete: $('tf-smartdone').checked,
      autoRefresh: $('tf-autorefresh').checked,
      refreshIntervalMin: Number($('tf-refmin').value) || 30
    };
  }
  function openTaskDialog(t) {
    GET('/api/admin/rules?size=200').then(function (rules) {
      rules = rules.rules || rules || [];
      openDialog(t ? '编辑任务' : '新建任务', taskFormHTML(rules, t), function (form, close) {
        var body = taskFormBody(t);
        var p = t ? PUT('/api/admin/tasks/' + encodeURIComponent(t.id), body) : POST('/api/admin/tasks', body);
        return p.then(function () { close(); toast(t ? '任务已保存' : '任务已创建'); loadTasks(); });
      });
    }).catch(function (e) { toast('规则列表加载失败: ' + errText(e), true); });
  }
  function openLogs(id, name) {
    logTaskId = id;
    $('task-log-card').style.display = '';
    $('task-log-title').textContent = '任务日志 — ' + (name || id);
    var auto = $('task-log-auto');
    pullLogs();
    clearInterval(logTimer);
    clearInterval(taskTimer);
    logTimer = setInterval(function () { if (auto && auto.checked) pullLogs(); }, 5000);
  }
  function pullLogs() {
    if (!logTaskId) return;
    GET('/api/admin/tasks/' + encodeURIComponent(logTaskId) + '/logs').then(function (logs) {
      var el = $('task-log-view');
      var tail = (logs || []).slice(-200);
      el.innerHTML = tail.length ? tail.map(function (l) {
        return '<div class="adm-logline is-' + esc(l.level || 'info') + '">[' + fmtTime(l.createdAt) + '][' + esc(l.level || 'info') + '] ' + esc(l.message) + '</div>';
      }).join('') : '<div class="adm-state">暂无日志</div>';
      el.scrollTop = el.scrollHeight;
    }).catch(function (e) { stateMsg('task-log-view', '日志加载失败: ' + errText(e), true); });
  }
  function initTasks() {
    loadTasks();
    prefetchRuleNames(); /* [R55-3c3] 规则名映射就绪后重渲染任务表 */
    $('task-refresh').addEventListener('click', loadTasks);
    $('task-filter-status').addEventListener('change', loadTasks);
    $('task-new').addEventListener('click', function () { openTaskDialog(null); });
    $('task-log-close').addEventListener('click', function () {
      $('task-log-card').style.display = 'none'; logTaskId = '';
      clearInterval(logTimer); clearInterval(taskTimer);
      taskTimer = setInterval(loadTasks, 15000);
    });
    var list = $('task-list');
    list.addEventListener('click', function (ev) {
      var btn = ev.target.closest('button[data-act]');
      if (!btn) return;
      var id = btn.getAttribute('data-id'), act = btn.getAttribute('data-act');
      if (act === 'control') {
        var action = btn.getAttribute('data-action');
        btn.disabled = true;
        POST('/api/admin/tasks/' + encodeURIComponent(id) + '/control', { action: action })
          .then(function () { toast('操作成功: ' + action); loadTasks(); })
          .catch(function (e) { toast(errText(e), true); btn.disabled = false; });
      } else if (act === 'del') {
        admConfirm('确定删除任务「' + (btn.getAttribute('data-name') || id) + '」? 该操作不可恢复。', true).then(function (yes) {
          if (!yes) return;
          DEL('/api/admin/tasks/' + encodeURIComponent(id)).then(function () { toast('任务已删除'); loadTasks(); })
            .catch(function (e) { toast(errText(e), true); });
        });
      } else if (act === 'logs') {
        openLogs(id, btn.getAttribute('data-name'));
      } else if (act === 'edit') {
        GET('/api/admin/tasks/' + encodeURIComponent(id)).then(function (t) { openTaskDialog(t); })
          .catch(function (e) { toast(errText(e), true); });
      }
    });
    taskTimer = setInterval(loadTasks, 15000);
    window.addEventListener('beforeunload', function () { clearInterval(taskTimer); clearInterval(logTimer); });
  }

  /* ---------------- 采集规则 ---------------- */
  function renderRules(rows) {
    var el = $('rule-list');
    if (!el) return;
    el.className = 'adm-table-wrap';
    if (!rows || !rows.length) { el.innerHTML = '<div class="adm-empty">暂无规则, 可点击「导入内置规则」。</div>'; return; }
    el.innerHTML = '<table class="adm-table"><thead><tr><th>规则</th><th>状态</th><th>更新</th><th>操作</th></tr></thead><tbody>' +
      rows.map(function (r) {
        return '<tr><td>' + esc(r.name || r.id) + '<div class="adm-muted">' + esc(r.description || '') + '</div></td>' +
          '<td>' + (r.enabled ? '<span class="adm-badge is-running">启用</span>' : '<span class="adm-badge is-paused">停用</span>') + '</td>' +
          '<td class="adm-muted">' + fmtTime(r.updatedAt) + '</td>' +
          '<td><div class="adm-actions">' +
          '<button class="adm-btn is-tiny" data-act="toggle" data-id="' + esc(r.id) + '" data-on="' + (r.enabled ? 0 : 1) + '">' + (r.enabled ? '停用' : '启用') + '</button>' +
          '<button class="adm-btn is-tiny" data-act="edit" data-id="' + esc(r.id) + '">编辑</button>' +
          '<button class="adm-btn is-tiny is-danger" data-act="del" data-id="' + esc(r.id) + '" data-name="' + esc(r.name || r.id) + '">删除</button>' +
          '</div></td></tr>';
      }).join('') + '</tbody></table>';
    var selEl = $('rule-test-id');
    if (selEl) {
      selEl.innerHTML = rows.map(function (r) { return '<option value="' + esc(r.id) + '">' + esc(r.name || r.id) + '</option>'; }).join('');
    }
  }
  function loadRules() {
    stateMsg('rule-list', '加载中…');
    GET('/api/admin/rules?size=200').then(function (d) { renderRules(d.rules || d || []); })
      .catch(function (e) { stateMsg('rule-list', '加载失败: ' + errText(e), true); });
  }
  /* ================= 规则结构化表单(R65-a) =================
     需求: 站长不懂 JSON —— 原 rf-config 220px JSON textarea 改为分区中文表单。
     零丢失口径: 表单只「覆盖」明确列出的路径; 其余字段(未知/高级子参数)在打开时
     收纳进「高级 JSON」兜底 textarea, 保存时原样合并回主对象(35 条存量规则零损失)。
     纯逻辑 rfSplit/rfBuild 在 Node 环境导出(文件尾 guard)做往返深比对单测。 */
  var rfState = null; /* 当前弹层的 {v:表单值映射, stash:自动保留参数, notes, leftover} */
  var RF_TYPE_OPTS = [['css', 'CSS 选择器'], ['json', 'JSON 点路径'], ['regex', '正则表达式'], ['const', '固定值']];
  var RF_PAGES = [['list', 'list'], ['book', 'book'], ['toc', 'toc'], ['content', 'content']];
  /* 各页段表单覆盖的字段: [键, 中文label, attr占位]; 未列出的字段名走高级 JSON 兜底 */
  var RF_FIELDS = {
    list: [['name', '书名', 'text'], ['author', '作者', 'text'], ['bookUrl', '书籍链接', 'href'], ['cover', '封面图', 'src'], ['intro', '简介', 'html'], ['category', '分类', 'text'], ['status', '状态', 'text'], ['latestChapter', '最新章节', 'text'], ['wordCount', '字数', 'text'], ['updateTime', '更新时间', 'text']],
    book: [['name', '书名', 'text'], ['author', '作者', 'text'], ['cover', '封面图', 'src'], ['intro', '简介', 'html'], ['category', '分类', 'text'], ['status', '状态', 'text'], ['latestChapter', '最新章节', 'text'], ['wordCount', '字数', 'text'], ['keywords', '关键词', 'text']],
    toc: [['title', '章节标题', 'text'], ['url', '章节链接', 'href']],
    content: [['title', '章节标题', 'text'], ['content', '正文内容', 'html']]
  };
  var RF_STR = ['list.urlTemplate', 'fetch.customUa', 'fetch.cookies', 'fetch.contentProxyUrl', 'fetch.proxyUrl', 'fetch.mirrorDomains', 'fetch.proxyCountries'];
  var RF_NUM = ['fetch.timeout', 'fetch.retries', 'fetch.waitMs', 'fetch.hostGateLimit', 'fetch.hostGateConcurrency', 'fetch.globalConcurrency'];
  /* [路径, 空值回退] —— 引擎侧缺省等价(sanitize 强制同值), 写回无语义漂移 */
  var RF_SEL = [['fetch.engine', 'auto'], ['fetch.uaMode', 'rotate']];
  /* 布尔三态: v=显式 true/false; null=原配置缺失 → 展示引擎缺省, 未被用户改动则保存时维持缺失 */
  var RF_BOOL = [['fetch.autoCookie', true], ['fetch.referer', true], ['fetch.refererChain', false], ['fetch.allowLoopback', false], ['fetch.needsProxy', false], ['clean.normalize', true], ['clean.plainText', false]];
  /* 数组类: 每行一条; 留空/清空 = 移除该键 = 引擎缺省(空数组与缺失同语义, 见 clean.FromRuleRaw safeStrArr) */
  var RF_LINES = ['clean.removeSelectors', 'clean.adPatterns', 'clean.whitelist'];
  var RF_CSV = ['fetch.browserFallbackStatus'];
  var RF_HEADERS = ['fetch.headers'];
  var RF_SELROWS = ['list.itemSelector', 'toc.itemSelector', 'toc.tocLink'];
  var RF_PAGS = ['list', 'toc', 'content'];
  /* 新建规则预填(镜像 API defaultRuleConfigJSON, 缺省布尔不物化的保持缺失) */
  var RF_NEW_SEED = {
    clean: {
      removeSelectors: ['script', 'style', 'iframe', 'ins', 'noscript', '.adsbygoogle', '.ad', '#ad'],
      adPatterns: ['(www\\.)?[a-z0-9-]+\\.(com|net|cc|org|info|top|xyz|vip|site)(\\/\\S*)?', '本章未完.*?点击下一页继续阅读', '请记住本书.*?域名', '最新章节请到.*?查看', '[（(]?完?本[网站站][）)]?', '一秒记住.*?免费读'],
      whitelist: ['p', 'br', 'b', 'strong', 'em', 'i', 'u', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']
    }
  };

  function rfIsObj(x) { return x !== null && x !== undefined && typeof x === 'object' && !Array.isArray(x); }
  function rfClone(x) { return JSON.parse(JSON.stringify(x)); }
  function rfGet(root, path) {
    var seg = path.split('.'), o = root;
    for (var i = 0; i < seg.length; i++) {
      if (!rfIsObj(o)) return undefined;
      o = o[seg[i]];
    }
    return o;
  }
  function rfDelPath(root, path) {
    var seg = path.split('.'), o = root;
    for (var i = 0; i < seg.length; i++) {
      if (!rfIsObj(o)) return;
      if (i === seg.length - 1) delete o[seg[i]];
      else o = o[seg[i]];
    }
  }
  function rfSetPath(root, path, val) {
    var seg = path.split('.');
    var parent = seg.length > 1 ? rfEnsurePath(root, seg.slice(0, -1).join('.')) : root;
    parent[seg[seg.length - 1]] = val;
  }
  function rfEnsurePath(root, path) {
    var seg = path.split('.'), o = root;
    for (var i = 0; i < seg.length; i++) {
      if (!rfIsObj(o[seg[i]])) o[seg[i]] = {};
      o = o[seg[i]];
    }
    return o;
  }
  /* 语义深比对(键序无关) —— 保存后回读校验用 */
  function rfJsonEq(a, b) {
    if (a === b) return true;
    if (a === null || b === null || typeof a !== typeof b) return false;
    if (Array.isArray(a) || Array.isArray(b)) {
      if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
      for (var i = 0; i < a.length; i++) if (!rfJsonEq(a[i], b[i])) return false;
      return true;
    }
    if (typeof a === 'object') {
      var ka = Object.keys(a), kb = Object.keys(b);
      if (ka.length !== kb.length) return false;
      for (var j = 0; j < ka.length; j++) {
        if (!Object.prototype.hasOwnProperty.call(b, ka[j]) || !rfJsonEq(a[ka[j]], b[ka[j]])) return false;
      }
      return true;
    }
    return false;
  }

  /* rfSplit: 配置对象 → {v, stash, notes, leftover}
     v: 扁平表单值(键=点路径); stash: 高级子参数原件(replaceFrom/flags/pagination 未知键等);
     notes: 人读的「已自动保留」清单; leftover: 未覆盖字段(rest 原地弹出后剩余)。 */
  function rfSplit(cfg0) {
    var rest = rfIsObj(cfg0) ? rfClone(cfg0) : {};
    var v = {}, stash = {}, notes = [];
    function popVal(path) {
      var seg = path.split('.'), o = rest;
      for (var i = 0; i < seg.length; i++) {
        if (!rfIsObj(o)) return undefined;
        if (i === seg.length - 1) { var val = o[seg[i]]; delete o[seg[i]]; return val; }
        o = o[seg[i]];
      }
      return undefined;
    }
    function popObj(path) { var x = rfGet(rest, path); if (rfIsObj(x)) { popVal(path); return x; } return null; }
    function s(x) { return (x === undefined || x === null) ? '' : String(x); }
    function takeSel(path, src) {
      v[path + '.type'] = src && src.type !== undefined && src.type !== null && src.type !== '' ? String(src.type) : 'css';
      v[path + '.expression'] = src ? String(src.expression || '') : '';
      v[path + '.attr'] = (src && src.attr !== undefined && src.attr !== null) ? String(src.attr) : '';
    }
    function takeSelRow(path) {
      var obj = popObj(path);
      takeSel(path, obj);
      if (rfIsObj(obj)) {
        var ex = rfClone(obj);
        delete ex.type; delete ex.expression; delete ex.attr;
        var ks = Object.keys(ex);
        if (ks.length) { stash['sel:' + path] = ex; notes.push(path + ' 的 ' + ks.join('/')); }
      }
    }
    RF_STR.forEach(function (p) { v[p] = s(popVal(p)); });
    RF_NUM.forEach(function (p) { v[p] = s(popVal(p)); });
    RF_SEL.forEach(function (p) { v[p[0]] = s(popVal(p[0])); });
    RF_BOOL.forEach(function (b) { var x = popVal(b[0]); v[b[0]] = (x === undefined || x === null) ? null : !!x; v[b[0] + '#def'] = b[1]; });
    RF_LINES.forEach(function (p) { var x = popVal(p); v[p] = Array.isArray(x) ? x.map(String).join('\n') : s(x); });
    RF_CSV.forEach(function (p) { var x = popVal(p); v[p] = Array.isArray(x) ? x.map(String).join(',') : s(x); });
    RF_HEADERS.forEach(function (p) {
      var x = popVal(p), lines = [];
      if (rfIsObj(x)) Object.keys(x).forEach(function (k) { lines.push(k + ': ' + String(x[k])); });
      v[p] = lines.join('\n');
    });
    RF_PAGES.forEach(function (pg) {
      var p = pg[0], en = popVal(p + '.enabled');
      v[p + '.enabled'] = (en === undefined || en === null) ? null : !!en;
      /* R65-a 修: list.urlTemplate 已在 RF_STR 收取, 此处重复 popVal 得 undefined 会
         把已收值清空(保存即删 list.urlTemplate → 采集断链), 往返单测 35/35 实证 */
    });
    RF_SELROWS.forEach(takeSelRow);
    RF_PAGES.forEach(function (pg) {
      var p = pg[0];
      RF_FIELDS[p].forEach(function (fd) {
        var path = p + '.fields.' + fd[0];
        var obj = popObj(path);
        takeSel(path, obj);
        if (rfIsObj(obj)) {
          var ex = rfClone(obj);
          delete ex.type; delete ex.expression; delete ex.attr;
          var ks = Object.keys(ex);
          if (ks.length) { stash['fld:' + path] = ex; notes.push(path + ' 的 ' + ks.join('/')); }
        }
      });
    });
    RF_PAGS.forEach(function (p) {
      var pg = popObj(p + '.pagination');
      if (pg) {
        v[p + '.pagination.enabled'] = (pg.enabled === undefined || pg.enabled === null) ? null : !!pg.enabled;
        v[p + '.pagination.maxPages'] = s(pg.maxPages);
        v[p + '.pagination.joinWith'] = s(pg.joinWith);
        takeSel(p + '.pagination.nextLink', rfIsObj(pg.nextLink) ? pg.nextLink : null);
        stash['pag:' + p] = rfClone(pg); /* 原件兜底(保 nextLink 未知子键等) */
        var extra = Object.keys(pg).filter(function (k) { return ['enabled', 'maxPages', 'joinWith', 'nextLink'].indexOf(k) < 0; });
        if (extra.length) notes.push(p + '.pagination 的 ' + extra.join('/'));
      } else {
        v[p + '.pagination.enabled'] = null;
        v[p + '.pagination.maxPages'] = '';
        v[p + '.pagination.joinWith'] = '';
        takeSel(p + '.pagination.nextLink', null);
      }
    });
    return { v: v, stash: stash, notes: notes, leftover: rest };
  }

  function rfSeedNew(v) {
    ['list', 'book', 'toc', 'content'].forEach(function (p) { if (v[p + '.enabled'] === null) v[p + '.enabled'] = true; });
    if (!v['fetch.engine']) v['fetch.engine'] = 'auto';
    if (!v['fetch.uaMode']) v['fetch.uaMode'] = 'rotate';
    ['timeout:20000', 'retries:2', 'waitMs:800', 'hostGateLimit:3', 'hostGateConcurrency:3', 'globalConcurrency:10'].forEach(function (kv) {
      var a = kv.split(':');
      if (!String(v['fetch.' + a[0]] || '').trim()) v['fetch.' + a[0]] = a[1];
    });
    if (!String(v['fetch.browserFallbackStatus'] || '').trim()) v['fetch.browserFallbackStatus'] = '403,412,429,503';
    v['fetch.autoCookie'] = true; v['fetch.referer'] = true; v['clean.normalize'] = true; v['clean.plainText'] = false;
    RF_LINES.forEach(function (p) {
      if (String(v[p] || '').trim() !== '') return;
      var k = p.split('.')[1];
      if (RF_NEW_SEED.clean[k]) v[p] = RF_NEW_SEED.clean[k].join('\n');
    });
    if (!String(v['toc.pagination.maxPages'] || '').trim()) v['toc.pagination.maxPages'] = '20';
    if (!String(v['content.pagination.maxPages'] || '').trim()) v['content.pagination.maxPages'] = '10';
    if (!String(v['content.pagination.joinWith'] || '').trim()) v['content.pagination.joinWith'] = '<br/>';
  }

  function rfLinesArr(t) {
    return String(t || '').split('\n').map(function (x) { return x.trim(); }).filter(function (x) { return x !== ''; });
  }
  function rfHeaderObj(t) {
    var out = {};
    String(t || '').split('\n').forEach(function (ln) {
      ln = ln.trim();
      var i = ln.indexOf(':');
      if (i <= 0) return;
      var k = ln.slice(0, i).trim(), val = ln.slice(i + 1).trim();
      if (k && val) out[k] = val;
    });
    return out;
  }
  function rfWriteSelRow(base, v, extras, path) {
    var expr = String(v[path + '.expression'] || '').trim();
    if (expr === '') { rfDelPath(base, path); return; } /* 清空=移除(原本缺失则无操作) */
    var obj = rfIsObj(extras) ? rfClone(extras) : {};
    obj.type = String(v[path + '.type'] || 'css');
    obj.expression = expr;
    var at = String(v[path + '.attr'] === undefined || v[path + '.attr'] === null ? '' : v[path + '.attr']).trim();
    if (at !== '') obj.attr = at; else delete obj.attr;
    rfSetPath(base, path, obj);
  }

  /* rfBuild: 表单值 + 自动保留参数 + 高级JSON 文本 → 完整规则配置对象。
     高级 JSON 非法时 throw(由调用方 try/catch → toast, 弹层保持打开不写坏规则)。 */
  function rfBuild(v, stash, advText) {
    var base;
    var t = String(advText || '').trim();
    if (t === '') base = {};
    else {
      base = JSON.parse(t);
      if (!rfIsObj(base)) throw new Error('高级 JSON 必须是 {…} 对象');
    }
    RF_STR.forEach(function (p) {
      var x = String(v[p] === undefined || v[p] === null ? '' : v[p]).trim();
      if (x === '') rfDelPath(base, p); else rfSetPath(base, p, x);
    });
    RF_NUM.forEach(function (p) {
      var x = String(v[p] === undefined || v[p] === null ? '' : v[p]).trim();
      if (x === '' || !isFinite(Number(x))) rfDelPath(base, p);
      else rfSetPath(base, p, Math.round(Number(x)));
    });
    RF_SEL.forEach(function (p) { rfSetPath(base, p[0], String(v[p[0]] || '').trim() || p[1]); });
    RF_BOOL.forEach(function (b) {
      var val = v[b[0]];
      if (val === null || val === undefined) rfDelPath(base, b[0]); /* 原缺失且未动 → 维持缺失 */
      else rfSetPath(base, b[0], !!val);
    });
    RF_LINES.forEach(function (p) {
      var arr = rfLinesArr(v[p]);
      if (arr.length) rfSetPath(base, p, arr); else rfDelPath(base, p);
    });
    RF_CSV.forEach(function (p) {
      var arr = rfLinesArr(String(v[p] || '').replace(/,/g, '\n')).map(Number);
      if (arr.length && arr.every(function (n) { return isFinite(n); })) rfSetPath(base, p, arr);
      else rfDelPath(base, p);
    });
    RF_HEADERS.forEach(function (p) {
      var h = rfHeaderObj(v[p]);
      if (Object.keys(h).length) rfSetPath(base, p, h); else rfDelPath(base, p);
    });
    RF_PAGES.forEach(function (pg) {
      var p = pg[0], en = v[p + '.enabled'];
      if (en === null || en === undefined) rfDelPath(base, p + '.enabled');
      else rfSetPath(base, p + '.enabled', !!en);
    });
    RF_SELROWS.forEach(function (path) { rfWriteSelRow(base, v, stash['sel:' + path] || null, path); });
    RF_PAGES.forEach(function (pg) {
      var p = pg[0];
      RF_FIELDS[p].forEach(function (fd) {
        var path = p + '.fields.' + fd[0];
        rfWriteSelRow(base, v, stash['fld:' + path] || null, path);
      });
    });
    RF_PAGS.forEach(function (p) {
      var en = v[p + '.pagination.enabled'];
      var mx = String(v[p + '.pagination.maxPages'] || '').trim();
      var jw = String(v[p + '.pagination.joinWith'] || '').trim();
      var nxExpr = String(v[p + '.pagination.nextLink.expression'] || '').trim();
      var raw = stash['pag:' + p] || null;
      var mxOk = mx !== '' && isFinite(Number(mx)) && Number(mx) > 0;
      var meaningful = !!raw || en === true || mxOk || nxExpr !== '' || jw !== '';
      if (!meaningful) { rfDelPath(base, p + '.pagination'); return; }
      var obj = rfIsObj(raw) ? rfClone(raw) : {};
      rfSetPath(base, p + '.pagination', obj);
      obj.enabled = (en === null || en === undefined) ? !!(raw && raw.enabled) : !!en;
      if (mxOk) obj.maxPages = Math.round(Number(mx)); else delete obj.maxPages;
      if (jw !== '') obj.joinWith = jw; else delete obj.joinWith;
      if (nxExpr === '') delete obj.nextLink;
      else {
        var nl = rfIsObj(obj.nextLink) ? obj.nextLink : {};
        nl.type = String(v[p + '.pagination.nextLink.type'] || 'css');
        nl.expression = nxExpr;
        var at = String(v[p + '.pagination.nextLink.attr'] === undefined || v[p + '.pagination.nextLink.attr'] === null ? '' : v[p + '.pagination.nextLink.attr']).trim();
        if (at !== '') nl.attr = at; else delete nl.attr;
        obj.nextLink = nl;
      }
    });
    return base;
  }

  /* ---------- 表单 HTML 组装 ---------- */
  function rfLabeled(label, inner, hint) {
    return '<label class="adm-label"><span class="rf-lab">' + esc(label) + '</span>' + inner +
      (hint ? '<span class="adm-hint">' + esc(hint) + '</span>' : '') + '</label>';
  }
  function rfInput(path, val, ph, type) {
    return '<input class="adm-input" data-rf="' + path + '" type="' + (type || 'text') + '" value="' +
      esc(val === undefined || val === null ? '' : val) + '"' + (ph ? ' placeholder="' + esc(ph) + '"' : '') + '>';
  }
  function rfSel(path, options, val) {
    var h = '<select class="adm-input" data-rf="' + path + '">';
    options.forEach(function (o) {
      h += '<option value="' + esc(o[0]) + '"' + (String(val) === String(o[0]) ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
    });
    return h + '</select>';
  }
  function rfChk(path, label, checked, hint) {
    return '<label class="adm-label is-check" style="min-height:32px"><input type="checkbox" data-rf="' + path + '"' + (checked ? ' checked' : '') + '> <span>' + esc(label) + '</span></label>' +
      (hint ? '<span class="adm-hint">' + esc(hint) + '</span>' : '');
  }
  /* 选择器三件套行: [类型 select][表达式][attr 取值方式] */
  function rfRow(path, label, attrPh, exprPh) {
    var v = rfState.v;
    return rfLabeled(label,
      '<div class="rf-row">' + rfSel(path + '.type', RF_TYPE_OPTS, v[path + '.type'] || 'css') +
      '<input class="adm-input rf-grow" data-rf="' + path + '.expression" value="' + esc(v[path + '.expression'] || '') + '"' + (exprPh ? ' placeholder="' + esc(exprPh) + '"' : '') + '>' +
      '<input class="adm-input rf-attr" data-rf="' + path + '.attr" value="' + esc(v[path + '.attr'] || '') + '" placeholder="' + esc(attrPh || 'text') + '" title="取值方式: text/html/href/src/content 或正则组号">' +
      '</div>');
  }
  function rfBoolChecked(path) {
    var x = rfState.v[path];
    return (x === null || x === undefined) ? !!rfState.v[path + '#def'] : !!x;
  }
  function rfPagBlock(p, withJoin) {
    var v = rfState.v;
    var h = rfLabeled('翻页设置',
      '<div class="rf-row"><label class="adm-label is-check" style="min-height:32px"><input type="checkbox" data-rf="' + p + '.pagination.enabled"' + (rfBoolChecked(p + '.pagination.enabled') ? ' checked' : '') + '> <span>启用翻页</span></label>' +
      '<input class="adm-input rf-attr" data-rf="' + p + '.pagination.maxPages" type="number" min="1" max="500" value="' + esc(v[p + '.pagination.maxPages'] || '') + '" placeholder="最多页数"></div>',
      '启用后按「下一页」链接继续抓下一页; 不启用则只抓一页');
    h += rfRow(p + '.pagination.nextLink', '「下一页」链接选择器', 'href', '如 a.next, 留空=不用下一页链接');
    if (withJoin) h += rfLabeled('分页拼接符', rfInput(p + '.pagination.joinWith', v[p + '.pagination.joinWith'], '<br/>'), '同章分页内容拼接时插入的 HTML, 正文常用 <br/>');
    return h;
  }
  function rfFieldsBlock(p, note) {
    var h = '<div class="rf-lab" style="margin-top:2px">字段提取</div>';
    RF_FIELDS[p].forEach(function (fd) { h += rfRow(p + '.fields.' + fd[0], fd[1], fd[2]); });
    h += '<div class="adm-hint">' + esc(note || '取值方式(attr): text=文字 / html=含标签 / href=链接 / src=图片地址 / content=meta 值; 正则取捕获组填数字(如 1); 留空=默认') + '</div>';
    return h;
  }
  function rfSec(title, open, body) {
    return '<details class="adm-rf-sec"' + (open ? ' open' : '') + '><summary>' + esc(title) + '</summary><div class="rf-body">' + body + '</div></details>';
  }
  function ruleFormHTML(r) {
    var rObj = r || {};
    rfState = rfSplit(safeParse(rObj.config));
    var v = rfState.v;
    if (!r) rfSeedNew(v);
    var h = '<div class="adm-hint" style="margin:-2px 0 10px">按分区填写即可; 不懂的字段保持原样, 保存不会破坏已有配置, 未展示的高级参数自动保留。</div>';
    h += fld('规则名称', '<input class="adm-input" id="rf-name" value="' + esc(rObj.name || '') + '" required>');
    h += fld('描述', '<input class="adm-input" id="rf-desc" value="' + esc(rObj.description || '') + '" placeholder="一句话说明这个源站, 可留空">');
    h += chk('rf-enabled', '启用该规则(停用后不可被任务选用)', rObj.enabled === undefined ? true : !!rObj.enabled);
    /* ① 列表页 */
    h += rfSec('① 列表页(找书)', true,
      rfChk('list.enabled', '启用列表页', rfBoolChecked('list.enabled'), '列表页=从分类/排行等列表找书; 只采单本可不启用') +
      rfLabeled('列表页 URL 模板', rfInput('list.urlTemplate', v['list.urlTemplate'], 'https://…/list/{page}.html, {page}=页码'), '支持 {page} 页码与 {offset:N} 偏移占位; 也可不填, 由采集任务的列表 URL 提供') +
      rfRow('list.itemSelector', '列表条目选择器(每本书那一块)', 'text', '如 div#articlelist ul li') +
      '<div class="adm-hint">一条选择器要能同时选中页面上所有书的卡片/行</div>' +
      rfPagBlock('list', false) +
      rfFieldsBlock('list'));
    /* ② 书籍详情页 */
    h += rfSec('② 书籍详情页(书名/作者/简介)', true,
      rfChk('book.enabled', '启用书籍详情页', rfBoolChecked('book.enabled')) +
      rfFieldsBlock('book'));
    /* ③ 目录页 */
    h += rfSec('③ 目录页(章节列表)', false,
      rfChk('toc.enabled', '启用目录页', rfBoolChecked('toc.enabled')) +
      rfRow('toc.itemSelector', '目录条目选择器(每章那一块)', 'text', '如 div.zjbox dd a') +
      '<div class="adm-hint">要能同时选中全部章节链接所在元素</div>' +
      rfRow('toc.tocLink', '章节链接补充选择器(多数留空)', 'href', '目录翻页/二级链接时才需要') +
      rfPagBlock('toc', false) +
      rfFieldsBlock('toc', '章节字段一般固定为 标题(text) + 链接(href); 其余章节字段名(如 itemId)会收进高级 JSON'));
    /* ④ 正文页 */
    h += rfSec('④ 正文页(章节内容)', true,
      rfChk('content.enabled', '启用正文页', rfBoolChecked('content.enabled')) +
      rfFieldsBlock('content', '正文取值方式(attr)建议 html(保留段落标签), 纯文字化在「内容清洗」设置; 广告文字由广告清理正则删除') +
      rfPagBlock('content', true));
    /* ⑤ 抓取设置 */
    h += rfSec('⑤ 抓取设置(请求头/UA/代理)', false,
      '<div class="rf-grid">' +
      rfLabeled('请求引擎', rfSel('fetch.engine', [['auto', '自动(推荐)'], ['http', '仅 HTTP 直连'], ['browser', '无头浏览器(不支持)']], v['fetch.engine'] || 'auto'), '选「无头浏览器」会被引擎拒绝启动') +
      rfLabeled('UA 模式', rfSel('fetch.uaMode', [['rotate', '随机轮换(推荐)'], ['desktop', '桌面仿真'], ['mobile', '手机仿真'], ['custom', '自定义 UA(下方)'], ['fixed', '引擎默认']], v['fetch.uaMode'] || 'rotate')) +
      rfLabeled('自定义 UA', rfInput('fetch.customUa', v['fetch.customUa'], 'Mozilla/5.0 … 完整 UA 串'), 'UA 模式选「自定义」时生效') +
      rfLabeled('超时(毫秒)', rfInput('fetch.timeout', v['fetch.timeout'], '20000', 'number'), '单次请求最长等待') +
      rfLabeled('重试次数', rfInput('fetch.retries', v['fetch.retries'], '2', 'number'), '失败后重试 0~5 次') +
      rfLabeled('等待(毫秒)', rfInput('fetch.waitMs', v['fetch.waitMs'], '800', 'number'), '旧版遗留字段, 一般不动') +
      rfLabeled('每站点并发', rfInput('fetch.hostGateLimit', v['fetch.hostGateLimit'], '3', 'number'), '同一站点同时在飞的请求数') +
      rfLabeled('并发闸(覆盖上限)', rfInput('fetch.hostGateConcurrency', v['fetch.hostGateConcurrency'], '3', 'number'), '填写后覆盖「每站点并发」') +
      rfLabeled('全局并发', rfInput('fetch.globalConcurrency', v['fetch.globalConcurrency'], '10', 'number'), '全部站点合计在飞请求数') +
      '</div>' +
      rfLabeled('自定义请求头(每行一条, 格式 Key: Value)', '<textarea class="adm-input rf-mono" data-rf="fetch.headers" rows="3" placeholder="Accept: application/json&#10;X-Site-Token: abc123">' + esc(v['fetch.headers'] || '') + '</textarea>', '站点需要特殊请求头时才填; Cookie 请填下方专用栏') +
      rfLabeled('Cookie 字符串', rfInput('fetch.cookies', v['fetch.cookies'], 'k1=v1; k2=v2'), '单行, 多个用分号分隔') +
      '<div class="rf-grid" style="margin-top:10px">' +
      rfChk('fetch.referer', '自动 Referer', rfBoolChecked('fetch.referer')) +
      rfChk('fetch.refererChain', 'Referer 链', rfBoolChecked('fetch.refererChain')) +
      rfChk('fetch.autoCookie', '自动记 Cookie', rfBoolChecked('fetch.autoCookie')) +
      rfChk('fetch.allowLoopback', '允许本机地址', rfBoolChecked('fetch.allowLoopback')) +
      rfChk('fetch.needsProxy', '需免费代理池', rfBoolChecked('fetch.needsProxy')) +
      '</div>' +
      '<div class="adm-hint">⚠「需免费代理池」当前引擎不支持: 勾选会导致采集任务拒绝启动; 「允许本机地址」仅调试用, 生产勿开</div>' +
      rfLabeled('正文代理 URL', rfInput('fetch.contentProxyUrl', v['fetch.contentProxyUrl'], 'http://127.0.0.1:3010/unlock?url={url}'), '正文/图片经此代理转发, {url} 会替换为目标地址') +
      rfLabeled('代理池', rfInput('fetch.proxyUrl', v['fetch.proxyUrl'], 'http://ip:port, socks5h://ip:port'), '逗号分隔; 需国内 IP 出口的站点在此配代理') +
      rfLabeled('镜像域名', rfInput('fetch.mirrorDomains', v['fetch.mirrorDomains'], 'a.com, b.org'), '逗号分隔; 主域失败时轮换尝试') +
      rfLabeled('代理地区', rfInput('fetch.proxyCountries', v['fetch.proxyCountries'], 'CN'), '一般留空') +
      rfLabeled('浏览器回退状态码', rfInput('fetch.browserFallbackStatus', v['fetch.browserFallbackStatus'], '403,412,429,503'), '逗号分隔; 默认 403,412,429,503 视为未自定义(与缺省相同则等效于关)'));
    /* ⑥ 内容清洗 */
    h += rfSec('⑥ 内容清洗(广告/正文净化)', false,
      rfLabeled('移除元素(每行一个 CSS 选择器, 这些元素整块删除)', '<textarea class="adm-input rf-mono" data-rf="clean.removeSelectors" rows="4" placeholder="script&#10;style&#10;.adsbygoogle">' + esc(v['clean.removeSelectors'] || '') + '</textarea>', '如 script、style、iframe、.ad; 留空用默认') +
      rfLabeled('广告清理正则(每行一条, 命中的文字会被删除)', '<textarea class="adm-input rf-mono" data-rf="clean.adPatterns" rows="5" placeholder="请记住本书.*?域名&#10;(www\\.)?[a-z0-9-]+\\.com(/\\S*)?">' + esc(v['clean.adPatterns'] || '') + '</textarea>', '删「本章未完」「最新网址」等水印文字; 留空用默认') +
      rfLabeled('白名单标签(每行一个, 正文仅保留这些标签)', '<textarea class="adm-input rf-mono" data-rf="clean.whitelist" rows="4" placeholder="p&#10;br&#10;strong">' + esc(v['clean.whitelist'] || '') + '</textarea>', '留空用默认(p/br/b/strong/em/i/u 与标题族)') +
      '<div class="rf-grid" style="margin-top:10px">' +
      rfChk('clean.normalize', '段落规范化', rfBoolChecked('clean.normalize')) +
      rfChk('clean.plainText', '只保留纯文本', rfBoolChecked('clean.plainText')) +
      '</div>' +
      '<div class="adm-hint">「只保留纯文本」会去掉正文全部 HTML 标签, 仅留文字</div>');
    /* ⑦ 高级 JSON 兜底(零丢失保证) */
    var advBody = (rfState.notes.length ? '<div class="adm-hint" style="color:var(--amber)">以下参数不在表单展示范围, 保存时自动原样保留: ' + esc(rfState.notes.join('；')) + '</div>' : '') +
      rfLabeled('高级 JSON(表单未覆盖的字段, 保存时原样合并回规则)', '<textarea class="adm-input rf-mono" id="rf-adv" style="min-height:150px" placeholder="本规则暂无表单外字段">' + esc(Object.keys(rfState.leftover).length ? JSON.stringify(rfState.leftover, null, 2) : '') + '</textarea>', '不懂 JSON 请勿修改此处; 同名字段以表单为准');
    h += rfSec('⑦ 高级 JSON(专家用, 选填)', false, advBody);
    return h;
  }
  /* [R65-a] 布尔勾选在 change 时物化到 v(区分「原本缺失=未动」与「显式值」; 文本/下拉在收集时读取) */
  function wireRfCheckboxes(form) {
    if (!form) return;
    Array.prototype.forEach.call(form.querySelectorAll('input[type=checkbox][data-rf]'), function (el) {
      el.addEventListener('change', function () { if (rfState) rfState.v[el.getAttribute('data-rf')] = el.checked; });
    });
  }
  /* [R65-a] 组装保存体: 读表单 → rfBuild; 组装/序列化任何一步失败都 throw(调用方 toast, 弹层不关不写库) */
  function rfCollect() {
    if (!rfState) throw new Error('表单未初始化, 请关闭弹层重试');
    var form = $('adm-dlg-form');
    Array.prototype.forEach.call(form.querySelectorAll('[data-rf]'), function (el) {
      if (el.type === 'checkbox') return;
      rfState.v[el.getAttribute('data-rf')] = el.value;
    });
    var adv = $('rf-adv') ? $('rf-adv').value : '';
    var cfg;
    try { cfg = rfBuild(rfState.v, rfState.stash, adv); }
    catch (e) { throw new Error('高级 JSON 不是合法对象: ' + ((e && e.message) || e)); }
    try { return JSON.parse(JSON.stringify(cfg)); }
    catch (e2) { throw new Error('规则配置序列化失败: ' + ((e2 && e2.message) || e2)); }
  }
  /* [R65-a] 新建/编辑共用弹层; onSave(sent, close) 收到组装好的保存体 */
  function openRuleDialog(title, r, onSave) {
    openDialog(title, ruleFormHTML(r), function (form, close) {
      var sent;
      try { sent = { name: $('rf-name').value.trim(), description: $('rf-desc').value.trim(), enabled: $('rf-enabled').checked, config: rfCollect() }; }
      catch (e) { toast(errText(e), true); throw e; }
      return onSave(sent, close);
    });
    wireRfCheckboxes($('adm-dlg-form'));
  }
  /* [R65-a] 测试面板段落选择(模板静态供给后自动跳过注入; 兼容未部署的旧模板) */
  function ensureTestSectionSel() {
    if ($('rule-test-section')) return;
    var anchor = $('rule-test-url');
    if (!anchor || !anchor.parentNode) return;
    var d = document.createElement('select');
    d.className = 'adm-input is-select';
    d.id = 'rule-test-section';
    d.setAttribute('aria-label', '测试段落');
    d.innerHTML = '<option value="list">列表页</option><option value="book">详情页</option><option value="toc">目录页</option><option value="content">正文页</option>';
    anchor.parentNode.insertBefore(d, anchor);
  }
  function initRules() {
    loadRules();
    ensureTestSectionSel();
    $('rule-refresh').addEventListener('click', loadRules);
    $('rule-import').addEventListener('click', function () {
      admConfirm('导入内置规则库(与现有同名规则保 id 覆盖)?').then(function (yes) {
        if (!yes) return;
        POST('/api/admin/rules/import-builtin').then(function (r) { toast('导入完成: ' + ((r && (r.imported || r.count)) || 'OK')); loadRules(); })
          .catch(function (e) { toast(errText(e), true); });
      });
    });
    $('rule-new').addEventListener('click', function () {
      openRuleDialog('新建规则', null, function (sent, close) {
        return POST('/api/admin/rules', sent)
          .then(function () { close(); toast('规则已创建'); loadRules(); });
      });
    });
    /* [R65-a] 修前只发 {ruleId,url} → 端点缺 section 恒 400; 改为取规则配置按段试采(对齐 adminRulesTest 契约) */
    $('rule-test-run').addEventListener('click', function () {
      var id = $('rule-test-id').value, url = $('rule-test-url').value.trim();
      var out = $('rule-test-result');
      var sec = $('rule-test-section') ? $('rule-test-section').value : 'list';
      if (!id || !url) { out.textContent = '请先选择规则并填写目标 URL。'; return; }
      out.textContent = '测试中…(' + sec + ' 段)';
      GET('/api/admin/rules/' + encodeURIComponent(id)).then(function (r) {
        var cfg = safeParse(r.config);
        return POST('/api/admin/rules/test', { section: sec, url: url, rule: cfg[sec] || {}, fetch: cfg.fetch || {}, clean: cfg.clean || {} });
      }).then(function (res) { out.textContent = JSON.stringify(res, null, 2); })
        .catch(function (e) { out.textContent = '测试失败: ' + errText(e); });
    });
    var list = $('rule-list');
    list.addEventListener('click', function (ev) {
      var btn = ev.target.closest('button[data-act]');
      if (!btn) return;
      var id = btn.getAttribute('data-id'), act = btn.getAttribute('data-act');
      if (act === 'toggle') {
        GET('/api/admin/rules/' + encodeURIComponent(id)).then(function (r) {
          return PUT('/api/admin/rules/' + encodeURIComponent(id), { name: r.name, description: r.description, enabled: btn.getAttribute('data-on') === '1', config: safeParse(r.config) });
        }).then(function () { toast('已更新'); loadRules(); }).catch(function (e) { toast(errText(e), true); });
      } else if (act === 'del') {
        admConfirm('确定删除规则「' + (btn.getAttribute('data-name') || id) + '」?', true).then(function (yes) {
          if (!yes) return;
          DEL('/api/admin/rules/' + encodeURIComponent(id)).then(function () { toast('规则已删除'); loadRules(); }).catch(function (e) { toast(errText(e), true); });
        });
      } else if (act === 'edit') {
        GET('/api/admin/rules/' + encodeURIComponent(id)).then(function (r) {
          openRuleDialog('编辑规则', r, function (sent, close) {
            return PUT('/api/admin/rules/' + encodeURIComponent(id), sent).then(function () {
              /* [R65-a] 保存后回读校验: 与保存意图逐字段比对, 不一致立即提示 */
              return GET('/api/admin/rules/' + encodeURIComponent(id)).then(function (back) {
                var same = rfJsonEq(safeParse(back.config), sent.config);
                close(); loadRules();
                toast(same ? '规则已保存, 回读校验一致' : '规则已保存, 但回读配置与表单不一致, 请重新打开核对', !same);
              });
            });
          });
        }).catch(function (e) { toast(errText(e), true); });
      }
    });
  }

  /* ---------------- 代理池 ---------------- */
  function renderProxy(rows) {
    var el = $('proxy-list');
    if (!el) return;
    el.className = 'adm-table-wrap';
    if (!rows || !rows.length) { el.innerHTML = '<div class="adm-empty">代理池为空, 可点击「触发采集」从免费源抓取。</div>'; return; }
    el.innerHTML = '<table class="adm-table"><thead><tr><th>代理</th><th>状态</th><th>成功率</th><th>延迟</th><th>最近失败</th></tr></thead><tbody>' +
      rows.map(function (p) {
        return '<tr><td>' + esc(p.server || p.host || p.id) + '</td><td>' + (p.alive ? '<span class="adm-badge is-running">可用</span>' : '<span class="adm-badge is-paused">冷却/失效</span>') + '</td>' +
          '<td>' + esc(p.successRate !== undefined ? p.successRate : '-') + '</td><td>' + esc(p.latencyMs !== undefined ? p.latencyMs : '-') + '</td>' +
          '<td class="adm-muted">' + fmtTime(p.failedUntil || p.updatedAt) + '</td></tr>';
      }).join('') + '</tbody></table>';
    var st = $('proxy-stats');
    st.className = 'adm-kv-list';
    st.innerHTML = '<div class="adm-stat"><b>' + rows.length + '</b><span>代理总数</span></div>' +
      '<div class="adm-stat"><b>' + rows.filter(function (p) { return p.alive; }).length + '</b><span>可用</span></div>';
  }
  function loadProxy() {
    stateMsg('proxy-list', '加载中…'); stateMsg('proxy-stats', '加载中…');
    GET('/api/admin/proxy-pool').then(function (d) { renderProxy(d.proxies || d.list || d || []); })
      .catch(function (e) { stateMsg('proxy-list', '加载失败: ' + errText(e), true); stateMsg('proxy-stats', '-', true); });
  }
  function initProxy() {
    loadProxy();
    $('proxy-refresh').addEventListener('click', loadProxy);
    $('proxy-harvest').addEventListener('click', function () {
      POST('/api/admin/proxy-pool/harvest').then(function () { toast('采集触发成功'); setTimeout(loadProxy, 1500); }).catch(function (e) { toast(errText(e), true); });
    });
    $('proxy-check').addEventListener('click', function () {
      POST('/api/admin/proxy-pool/check').then(function () { toast('检测已触发'); setTimeout(loadProxy, 1500); }).catch(function (e) { toast(errText(e), true); });
    });
    $('proxy-prune').addEventListener('click', function () {
      admConfirm('清理全部失效代理?').then(function (yes) {
        if (!yes) return;
        POST('/api/admin/proxy-pool/prune').then(function () { toast('已清理'); loadProxy(); }).catch(function (e) { toast(errText(e), true); });
      });
    });
  }

  /* ---------------- 书籍管理 ---------------- */
  var bookPage = 1, bookTotalPages = 1;
  function loadBookCats() {
    return GET('/api/admin/categories?size=500').then(function (d) {
      var cats = d.categories || d || [];
      var selEl = $('book-cat');
      selEl.innerHTML = '<option value="">全部分类</option>' + cats.map(function (c) {
        return '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>';
      }).join('');
    }).catch(function () { });
  }
  function renderBooks(d) {
    var rows = d.books || d.list || [];
    var el = $('book-list');
    el.className = 'adm-table-wrap';
    bookTotalPages = Math.max(1, Math.ceil((d.total || rows.length) / 50));
    $('book-pageinfo').textContent = '第 ' + bookPage + ' / ' + bookTotalPages + ' 页 · 共 ' + (d.total !== undefined ? d.total : rows.length) + ' 本';
    if (!rows.length) { el.innerHTML = '<div class="adm-empty">没有符合条件的书籍。</div>'; return; }
    el.innerHTML = '<table class="adm-table"><thead><tr><th>书籍</th><th>分类</th><th>章节/字数</th><th>状态</th><th>更新</th><th>操作</th></tr></thead><tbody>' +
      rows.map(function (b) {
        return '<tr><td>' + esc(b.name) + '<div class="adm-muted">' + esc(b.author || '-') + (b.num ? ' · 书号 ' + esc(b.num) : '') + '</div></td>' +
          '<td class="adm-muted">' + esc((b.category && b.category.name) || b.categoryName || '-') + '</td>' +
          '<td class="adm-muted">' + (b.chapterCount !== undefined ? b.chapterCount : (b._count && b._count.chapters) || 0) + ' 章 / ' + fmtNum(b.wordCount) + '</td>' + /* [R55-3c3] 兼容 _count.chapters(3-b API 形态) */
          '<td>' + badge(b.status) + '</td><td class="adm-muted">' + fmtTime(b.updatedAt) + '</td>' +
          '<td><div class="adm-actions">' +
          '<button class="adm-btn is-tiny" data-act="detail" data-id="' + esc(b.id) + '">详情</button>' +
          '<button class="adm-btn is-tiny" data-act="toc" data-id="' + esc(b.id) + '" data-name="' + esc(b.name) + '">目录</button>' +
          '<button class="adm-btn is-tiny is-danger" data-act="del" data-id="' + esc(b.id) + '" data-name="' + esc(b.name) + '">删除</button>' +
          '</div></td></tr>';
      }).join('') + '</tbody></table>';
  }
  function loadBooks() {
    stateMsg('book-list', '加载中…');
    var q = encodeURIComponent(($('book-q').value || '').trim());
    var cat = encodeURIComponent($('book-cat').value || '');
    GET('/api/admin/books?page=' + bookPage + '&size=50' + (q ? '&q=' + q : '') + (cat ? '&categoryId=' + cat : ''))
      .then(renderBooks).catch(function (e) { stateMsg('book-list', '加载失败: ' + errText(e), true); });
  }
  function initBooks() {
    loadBookCats().then(loadBooks);
    $('book-search').addEventListener('click', function () { bookPage = 1; loadBooks(); });
    $('book-q').addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { bookPage = 1; loadBooks(); } });
    $('book-cat').addEventListener('change', function () { bookPage = 1; loadBooks(); });
    $('book-prev').addEventListener('click', function () { if (bookPage > 1) { bookPage--; loadBooks(); } });
    $('book-next').addEventListener('click', function () { if (bookPage < bookTotalPages) { bookPage++; loadBooks(); } });
    $('book-new').addEventListener('click', function () {
      openDialog('新建书籍', fld('书名', '<input class="adm-input" id="bf-name" required>') +
        fld('作者', '<input class="adm-input" id="bf-author">') +
        fld('简介', '<textarea class="adm-input" id="bf-intro"></textarea>') +
        fld('来源 URL', '<input class="adm-input" id="bf-src" placeholder="https://…">'),
        function (form, close) {
          return POST('/api/admin/books', { name: $('bf-name').value.trim(), author: $('bf-author').value.trim(), intro: $('bf-intro').value, sourceUrl: $('bf-src').value.trim() })
            .then(function () { close(); toast('书籍已创建'); loadBooks(); });
        });
    });
    $('book-list').addEventListener('click', function (ev) {
      var btn = ev.target.closest('button[data-act]');
      if (!btn) return;
      var id = btn.getAttribute('data-id'), act = btn.getAttribute('data-act');
      if (act === 'del') {
        admConfirm('确定删除书籍「' + btn.getAttribute('data-name') + '」? 其章节将一并删除, 不可恢复。', true).then(function (yes) {
          if (!yes) return;
          DEL('/api/admin/books/' + encodeURIComponent(id)).then(function () { toast('书籍已删除'); loadBooks(); }).catch(function (e) { toast(errText(e), true); });
        });
      } else if (act === 'detail') {
        Promise.all([GET('/api/admin/books/' + encodeURIComponent(id)), GET('/api/admin/books/' + encodeURIComponent(id) + '/keywords')]).then(function (rs) {
          var b = rs[0], kws = rs[1];
          openDialog('书籍详情', '<div class="adm-kv-list" style="margin-bottom:12px">' +
            '<div class="adm-stat"><b>' + esc(b.name || '-') + '</b><span>书名</span></div>' +
            '<div class="adm-stat"><b>' + esc(b.author || '-') + '</b><span>作者</span></div>' +
            '<div class="adm-stat"><b>' + fmtNum(b.wordCount) + '</b><span>字数</span></div>' +
            '<div class="adm-stat"><b>' + esc((b.category && b.category.name) || '-') + '</b><span>分类</span></div></div>' +
            '<p class="adm-muted">最新章节: ' + esc(b.latestChapter || '-') + '</p>' +
            '<p class="adm-muted">来源: ' + esc(b.sourceUrl || '-') + '</p>' +
            fld('关键词(逗号分隔)', '<input class="adm-input" id="bf-kws" value="' + esc(Array.isArray(kws) ? kws.map(function (k) { return k.tag || k; }).join(',') : '') + '">'),
            function (form, close) {
              return POST('/api/admin/books/' + encodeURIComponent(id) + '/keywords', { keywords: $('bf-kws').value })
                .then(function () { close(); toast('关键词已保存'); });
            });
        }).catch(function (e) { toast(errText(e), true); });
      } else if (act === 'toc') {
        GET('/api/admin/books/' + encodeURIComponent(id) + '/toc?page=1&size=100').then(function (d) {
          var rows = d.chapters || d.list || d || [];
          openDialog('章节目录 — ' + btn.getAttribute('data-name'), '<div class="adm-logview" style="max-height:380px">' +
            (rows.length ? rows.map(function (c) { return '<div class="adm-logline">' + esc(c.idx) + '. ' + esc(c.title) + '</div>'; }).join('') : '<div class="adm-state">目录为空</div>') + '</div>',
            null);
        }).catch(function (e) { toast(errText(e), true); });
      }
    });
  }

  /* ---------------- 分类 ---------------- */
  function renderCats(rows) {
    var el = $('cat-list');
    el.className = 'adm-table-wrap';
    if (!rows || !rows.length) { el.innerHTML = '<div class="adm-empty">暂无分类。</div>'; return; }
    el.innerHTML = '<table class="adm-table"><thead><tr><th>分类</th><th>书籍数</th><th>排序</th><th>操作</th></tr></thead><tbody>' +
      rows.map(function (c) {
        return '<tr><td>' + esc(c.name) + '</td><td>' + (c.bookCount !== undefined ? c.bookCount : (c._count && c._count.books) || 0) + '</td><td>' + esc(c.sortOrder || 0) + '</td>' + /* [R55-3c3] 兼容 _count.books */
          '<td><div class="adm-actions">' +
          '<button class="adm-btn is-tiny" data-act="edit" data-id="' + esc(c.id) + '" data-name="' + esc(c.name) + '">改名</button>' +
          '<button class="adm-btn is-tiny is-danger" data-act="del" data-id="' + esc(c.id) + '" data-name="' + esc(c.name) + '">删除</button></div></td></tr>';
      }).join('') + '</tbody></table>';
  }
  function loadCats() {
    stateMsg('cat-list', '加载中…');
    GET('/api/admin/categories?size=500').then(function (d) { renderCats(d.categories || d || []); })
      .catch(function (e) { stateMsg('cat-list', '加载失败: ' + errText(e), true); });
  }
  function initCategories() {
    loadCats();
    $('cat-refresh').addEventListener('click', loadCats);
    $('cat-new').addEventListener('click', function () {
      openDialog('新建分类', fld('分类名', '<input class="adm-input" id="cf-name" required>') + fld('排序', '<input class="adm-input" id="cf-sort" type="number" value="0">'), function (form, close) {
        return POST('/api/admin/categories', { name: $('cf-name').value.trim(), sortOrder: Number($('cf-sort').value) || 0 })
          .then(function () { close(); toast('分类已创建'); loadCats(); });
      });
    });
    $('cat-consolidate').addEventListener('click', function () {
      admConfirm('合并全部同名分类?').then(function (yes) {
        if (!yes) return;
        POST('/api/admin/categories/consolidate').then(function () { toast('合并完成'); loadCats(); }).catch(function (e) { toast(errText(e), true); });
      });
    });
    $('cat-list').addEventListener('click', function (ev) {
      var btn = ev.target.closest('button[data-act]');
      if (!btn) return;
      var id = btn.getAttribute('data-id');
      if (btn.getAttribute('data-act') === 'edit') {
        openDialog('分类改名', fld('新名称', '<input class="adm-input" id="cf-name2" value="' + esc(btn.getAttribute('data-name')) + '">'), function (form, close) {
          return PUT('/api/admin/categories/' + encodeURIComponent(id), { name: $('cf-name2').value.trim() })
            .then(function () { close(); toast('已保存'); loadCats(); });
        });
      } else if (btn.getAttribute('data-act') === 'del') {
        admConfirm('确定删除分类「' + btn.getAttribute('data-name') + '」? 关联书籍将变为未分类。', true).then(function (yes) {
          if (!yes) return;
          DEL('/api/admin/categories/' + encodeURIComponent(id)).then(function () { toast('分类已删除'); loadCats(); }).catch(function (e) { toast(errText(e), true); });
        });
      }
    });
  }

  /* ---------------- 站群 ---------------- */
  function renderSites(rows) {
    var el = $('site-list');
    el.className = 'adm-table-wrap';
    if (!rows || !rows.length) { el.innerHTML = '<div class="adm-empty">暂无站点。</div>'; return; }
    el.innerHTML = '<table class="adm-table"><thead><tr><th>站点</th><th>域名</th><th>主题</th><th>状态</th><th>操作</th></tr></thead><tbody>' +
      rows.map(function (s) {
        return '<tr><td>' + esc(s.name) + (Number(s.isDefault) ? ' <span class="adm-badge is-engine">默认</span>' : '') + '<div class="adm-muted">' + esc(s.title || '') + '</div></td>' +
          '<td class="adm-muted">' + esc(s.domain || '-') + '</td><td class="adm-muted">' + esc(s.themeId || '-') + '</td>' +
          '<td>' + (Number(s.status) ? '<span class="adm-badge is-running">启用</span>' : '<span class="adm-badge is-paused">停用</span>') + '</td>' +
          '<td><div class="adm-actions">' +
          '<a class="adm-btn is-tiny" href="/?site=' + encodeURIComponent(s.id) + '" target="_blank" rel="noopener">预览</a>' +
          '<button class="adm-btn is-tiny" data-act="edit" data-id="' + esc(s.id) + '">编辑</button>' +
          '<button class="adm-btn is-tiny is-danger" data-act="del" data-id="' + esc(s.id) + '" data-name="' + esc(s.name) + '">删除</button></div></td></tr>';
      }).join('') + '</tbody></table>';
  }
  function loadSites() {
    stateMsg('site-list', '加载中…');
    GET('/api/admin/sites').then(function (d) { renderSites(d.sites || d || []); }).catch(function (e) { stateMsg('site-list', '加载失败: ' + errText(e), true); });
  }
  function siteFormHTML(s) {
    s = s || {};
    return fld('站名', '<input class="adm-input" id="sf-name" value="' + esc(s.name || '') + '" required>') +
      fld('域名', '<input class="adm-input" id="sf-domain" value="' + esc(s.domain || '') + '" placeholder="example.com">') +
      fld('SEO 标题', '<input class="adm-input" id="sf-title" value="' + esc(s.title || '') + '">') +
      fld('SEO 描述', '<textarea class="adm-input" id="sf-desc">' + esc(s.description || '') + '</textarea>') +
      fld('SEO 关键词(逗号分隔)', '<input class="adm-input" id="sf-kw" value="' + esc(s.keywords || '') + '">') +
      fld('主题(themeId)', '<input class="adm-input" id="sf-theme" value="' + esc(s.themeId || 'aijjxs') + '">') +
      chk('sf-status', '启用', s.status === undefined ? true : !!Number(s.status)) +
      chk('sf-default', '设为默认站', !!Number(s.isDefault));
  }
  function siteFormBody() {
    return {
      name: $('sf-name').value.trim(), domain: $('sf-domain').value.trim(),
      title: $('sf-title').value.trim(), description: $('sf-desc').value.trim(),
      keywords: $('sf-kw').value.trim(), themeId: $('sf-theme').value.trim() || 'aijjxs',
      status: $('sf-status').checked ? 1 : 0, isDefault: $('sf-default').checked ? 1 : 0
    };
  }
  function initSites() {
    loadSites();
    initSitesTDK(); // [R65-b] 智能 TDK 配置卡片(18 套预设勾选+页类型策略)
    $('site-refresh').addEventListener('click', loadSites);
    $('site-new').addEventListener('click', function () {
      openDialog('新建站点', siteFormHTML(null), function (form, close) {
        return POST('/api/admin/sites', siteFormBody()).then(function () { close(); toast('站点已创建'); loadSites(); });
      });
    });
    $('site-list').addEventListener('click', function (ev) {
      var btn = ev.target.closest('button[data-act]');
      if (!btn) return;
      var id = btn.getAttribute('data-id');
      if (btn.getAttribute('data-act') === 'edit') {
        GET('/api/admin/sites').then(function (d) {
          var rows = d.sites || d || [];
          var s = rows.filter(function (x) { return x.id === id; })[0];
          if (!s) throw new Error('站点不存在');
          openDialog('编辑站点', siteFormHTML(s), function (form, close) {
            return PUT('/api/admin/sites/' + encodeURIComponent(id), siteFormBody()).then(function () { close(); toast('站点已保存'); loadSites(); });
          });
        }).catch(function (e) { toast(errText(e), true); });
      } else if (btn.getAttribute('data-act') === 'del') {
        admConfirm('确定删除站点「' + btn.getAttribute('data-name') + '」?', true).then(function (yes) {
          if (!yes) return;
          DEL('/api/admin/sites/' + encodeURIComponent(id)).then(function () { toast('站点已删除'); loadSites(); }).catch(function (e) { toast(errText(e), true); });
        });
      }
    });
  }

  /* ---------------- 智能 TDK(R65-b: 18 套预设勾选+页类型策略, 数据源 GET/PUT /api/admin/sites/{id}/tdk) ---------------- */
  var stdkPages = [['home', '首页'], ['book', '书籍页'], ['toc', '目录页'], ['read', '阅读页'], ['category', '分类页']];
  var stdkPageNames = { home: '首页', book: '书籍页', toc: '目录页', read: '阅读页', category: '分类页' };

  function initSitesTDK() {
    $('stdk-refresh').addEventListener('click', loadSitesTDK);
    loadSitesTDK();
  }

  function loadSitesTDK() {
    stateMsg('stdk-body', '加载中…');
    GET('/api/admin/sites').then(function (d) {
      var rows = d.sites || d || [];
      if (!rows.length) { stateMsg('stdk-body', '暂无站点，请先在上方创建站点。'); return; }
      GET('/api/admin/sites/' + encodeURIComponent(rows[0].id) + '/tdk').then(function (td) {
        renderSitesTDK(rows, td);
      }).catch(function (e) { stateMsg('stdk-body', '加载失败: ' + errText(e), true); });
    }).catch(function (e) { stateMsg('stdk-body', '加载失败: ' + errText(e), true); });
  }

  function renderSitesTDK(sites, td) {
    var cfg = td.config || {};
    var presets = td.presets || [];
    var pages = cfg.pages || {};
    var setOn = {};
    (cfg.sets || []).forEach(function (n) { setOn[n] = true; });
    var h = '<div style="display:flex;flex-wrap:wrap;gap:14px;align-items:center;margin-bottom:10px">' +
      '<label class="adm-label">选择站点 ' + sel('stdk-site', sites.map(function (s) { return [s.id, s.name + '（' + (s.domain || '-') + '）']; }), td.siteId) + '</label>' +
      chk('stdk-enabled', '启用智能 TDK（开启后，下方勾选的页类型走随机组合填充）', !!cfg.enabled) +
      '</div>';
    h += '<div style="font-weight:600;margin:6px 0">18 套预设模板（勾选启用若干套，每次渲染随机抽一套）</div>';
    h += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:8px">';
    presets.forEach(function (p) {
      var pg = (p.pages || []).map(function (x) { return stdkPageNames[x] || x; }).join(' / ');
      h += '<label style="border:1px solid rgba(127,127,127,.35);border-radius:6px;padding:8px;display:block;cursor:pointer">' +
        '<div style="display:flex;gap:6px;align-items:center">' +
        '<input type="checkbox" class="stdk-set" value="' + esc(p.id) + '"' + (setOn[p.id] ? ' checked' : '') + '> ' +
        '<b>' + esc(p.id) + '. ' + esc(p.name) + '</b></div>' +
        '<div class="adm-muted" style="margin-top:4px">适用页：' + esc(pg) + '</div>' +
        '<div class="adm-muted" style="margin-top:4px">标题示例：' + esc(p.exampleTitle) + '</div>' +
        '<div class="adm-muted" style="margin-top:2px">描述示例：' + esc(p.exampleDesc) + '</div>' +
        '</label>';
    });
    h += '</div>';
    h += '<div style="font-weight:600;margin:12px 0 6px">页类型策略</div>';
    h += '<div style="display:flex;flex-wrap:wrap;gap:12px">';
    stdkPages.forEach(function (kv) {
      h += '<label class="adm-label">' + kv[1] + ' ' +
        '<select class="adm-input stdk-page" data-page="' + kv[0] + '">' +
        '<option value="off"' + (pages[kv[0]] === 'smart' ? '' : ' selected') + '>关闭（用原逻辑）</option>' +
        '<option value="smart"' + (pages[kv[0]] === 'smart' ? ' selected' : '') + '>智能随机填充</option>' +
        '</select></label>';
    });
    h += '</div>';
    h += '<div style="margin-top:12px;display:flex;align-items:center;gap:10px">' +
      '<button class="adm-btn is-primary" id="stdk-save" type="button">保存智能 TDK 配置</button>' +
      '<span class="adm-muted">未开启的页类型保持原有 TDK 逻辑，存量页面零影响。</span></div>';
    var el = $('stdk-body');
    el.className = '';
    el.innerHTML = h;
    $('stdk-site').addEventListener('change', function () {
      GET('/api/admin/sites/' + encodeURIComponent($('stdk-site').value) + '/tdk').then(function (td2) {
        renderSitesTDK(sites, td2);
      }).catch(function (e) { toast(errText(e), true); });
    });
    $('stdk-save').addEventListener('click', saveSitesTDK);
  }

  function saveSitesTDK() {
    var sets = [];
    document.querySelectorAll('#stdk-body .stdk-set:checked').forEach(function (cb) { sets.push(Number(cb.value)); });
    var pages = {};
    document.querySelectorAll('#stdk-body .stdk-page').forEach(function (sl) { pages[sl.getAttribute('data-page')] = sl.value; });
    var enabled = $('stdk-enabled').checked;
    if (enabled && !sets.length) { toast('开启智能 TDK 前请至少勾选一套预设模板', true); return; }
    PUT('/api/admin/sites/' + encodeURIComponent($('stdk-site').value) + '/tdk', { enabled: enabled, sets: sets, pages: pages })
      .then(function () { toast('智能 TDK 配置已保存'); })
      .catch(function (e) { toast(errText(e), true); });
  }

  /* ---------------- 友链 ---------------- */
  function renderLinks(rows) {
    var el = $('link-list');
    el.className = 'adm-table-wrap';
    if (!rows || !rows.length) { el.innerHTML = '<div class="adm-empty">暂无友链。</div>'; return; }
    el.innerHTML = '<table class="adm-table"><thead><tr><th>名称</th><th>URL</th><th>状态</th><th>操作</th></tr></thead><tbody>' +
      rows.map(function (l) {
        return '<tr><td>' + esc(l.name) + '</td><td class="adm-muted">' + esc(l.url) + '</td>' +
          '<td>' + (Number(l.enabled) ? '<span class="adm-badge is-running">启用</span>' : '<span class="adm-badge is-paused">停用</span>') + '</td>' +
          '<td><div class="adm-actions">' +
          '<button class="adm-btn is-tiny" data-act="toggle" data-id="' + esc(l.id) + '" data-on="' + (Number(l.enabled) ? 0 : 1) + '">' + (Number(l.enabled) ? '停用' : '启用') + '</button>' +
          '<button class="adm-btn is-tiny is-danger" data-act="del" data-id="' + esc(l.id) + '" data-name="' + esc(l.name) + '">删除</button></div></td></tr>';
      }).join('') + '</tbody></table>';
  }
  function loadLinks() {
    stateMsg('link-list', '加载中…');
    GET('/api/admin/links').then(function (d) { renderLinks(d.links || d || []); }).catch(function (e) { stateMsg('link-list', '加载失败: ' + errText(e), true); });
  }
  function initLinks() {
    loadLinks();
    $('link-refresh').addEventListener('click', loadLinks);
    $('link-new').addEventListener('click', function () {
      openDialog('新增友链', fld('名称', '<input class="adm-input" id="lf-name" required>') +
        fld('URL', '<input class="adm-input" id="lf-url" type="url" placeholder="https://" required>'), function (form, close) {
          return POST('/api/admin/links', { name: $('lf-name').value.trim(), url: $('lf-url').value.trim(), enabled: 1 })
            .then(function () { close(); toast('友链已添加'); loadLinks(); });
        });
    });
    $('link-list').addEventListener('click', function (ev) {
      var btn = ev.target.closest('button[data-act]');
      if (!btn) return;
      var id = btn.getAttribute('data-id');
      if (btn.getAttribute('data-act') === 'toggle') {
        PUT('/api/admin/links', { id: id, enabled: Number(btn.getAttribute('data-on')) }).then(function () { toast('已更新'); loadLinks(); }).catch(function (e) { toast(errText(e), true); });
      } else if (btn.getAttribute('data-act') === 'del') {
        admConfirm('确定删除友链「' + btn.getAttribute('data-name') + '」?', true).then(function (yes) {
          if (!yes) return;
          DEL('/api/admin/links?id=' + encodeURIComponent(id)).then(function () { toast('友链已删除'); loadLinks(); }).catch(function (e) { toast(errText(e), true); });
        });
      }
    });
  }

  /* ---------------- TXT 下载 ---------------- */
  function renderDownloads(rows) {
    var el = $('dl-list');
    el.className = 'adm-table-wrap';
    if (!rows || !rows.length) { el.innerHTML = '<div class="adm-empty">暂无下载任务。</div>'; return; }
    el.innerHTML = '<table class="adm-table"><thead><tr><th>书籍</th><th>状态</th><th>文件</th><th>大小</th><th>创建</th><th>操作</th></tr></thead><tbody>' +
      rows.map(function (j) {
        return '<tr><td>' + esc(j.bookName || j.bookId) + '</td><td>' + badge(j.status === 'success' ? 'done' : (j.status === 'failed' ? 'error' : j.status)) + '</td>' +
          '<td class="adm-muted">' + esc(j.filePath || '-') + '</td><td class="adm-muted">' + (j.size ? fmtBytes(j.size) : '-') + '</td>' +
          '<td class="adm-muted">' + fmtTime(j.createdAt) + '</td>' +
          '<td><div class="adm-actions">' + (j.bookId ? '<a class="adm-btn is-tiny" href="/api/public/download?book=' + encodeURIComponent(j.bookId) + '">下载</a>' : '') +
          '<button class="adm-btn is-tiny is-danger" data-act="del" data-id="' + esc(j.id) + '">删除</button></div></td></tr>';
      }).join('') + '</tbody></table>';
  }
  function loadDownloads() {
    stateMsg('dl-list', '加载中…');
    GET('/api/admin/downloads').then(function (d) { renderDownloads(d.jobs || d.list || d || []); }).catch(function (e) { stateMsg('dl-list', '加载失败: ' + errText(e), true); });
  }
  function initDownloads() {
    loadDownloads();
    $('dl-refresh').addEventListener('click', loadDownloads);
    $('dl-new').addEventListener('click', function () {
      GET('/api/admin/books?size=100').then(function (d) {
        var rows = d.books || d.list || [];
        openDialog('新建 TXT 下载', fld('选择书籍', '<select class="adm-input" id="df-book">' +
          rows.map(function (b) { return '<option value="' + esc(b.id) + '">' + esc(b.name) + '</option>'; }).join('') + '</select>'),
          function (form, close) {
            return POST('/api/admin/downloads', { bookId: $('df-book').value, options: { format: 'txt' } })
              .then(function () { close(); toast('下载任务已创建'); loadDownloads(); });
          });
      }).catch(function (e) { toast(errText(e), true); });
    });
    $('dl-list').addEventListener('click', function (ev) {
      var btn = ev.target.closest('button[data-act="del"]');
      if (!btn) return;
      admConfirm('确定删除该下载任务?', true).then(function (yes) {
        if (!yes) return;
        DEL('/api/admin/downloads/' + encodeURIComponent(btn.getAttribute('data-id'))).then(function () { toast('已删除'); loadDownloads(); }).catch(function (e) { toast(errText(e), true); });
      });
    });
  }

  /* ---------------- 系统设置 ----------------
   * [R67-c] 双头消歧: SETTING_LINKED 标注「该键另有语义化编辑入口」的联动关系
   * (bannedWords=本页上方卡片 / proxyPool=代理池分区 / feedback=用户反馈分区);
   * SETTING_PROTECTED 与后端 admin_dash.go protectedSettingKeys 同源(核心键不可删)。
   */
  var SETTING_LINKED = {
    bannedWords: '与本页「违禁词过滤」卡片联动',
    proxyPool: '与「代理池」分区联动',
    feedback: '与「用户反馈」分区的反馈开关联动'
  };
  var SETTING_PROTECTED = ['bannedWords', 'seoTemplates', 'theme_overrides', 'linkwheel', 'feedback', 'pseoAutoGenerate', 'proxyPool', 'download', 'pseudostatic'];
  function isProtectedKey(k) { return SETTING_PROTECTED.indexOf(k) >= 0; }
  function renderSettings(obj) {
    var el = $('set-list');
    el.className = '';
    var keys = Object.keys(obj || {}).sort();
    if (!keys.length) { el.innerHTML = '<div class="adm-empty">暂无自定义设置(代码内默认值生效)。</div>'; return; }
    el.innerHTML = keys.map(function (k) {
      var v = obj[k];
      var text = (typeof v === 'string') ? v : JSON.stringify(v, null, 2);
      var note = SETTING_LINKED[k] ? '<div class="adm-muted" style="font-weight:400">⚠ ' + esc(SETTING_LINKED[k]) + ', 建议只在一处修改</div>' : '';
      var del = isProtectedKey(k)
        ? '<span class="adm-muted">核心键(代码内读取)不可删除</span>'
        : '<button class="adm-btn is-tiny is-danger" data-delkey="' + esc(k) + '" type="button">删除</button>';
      return '<div style="margin-bottom:12px">' + fld(k, '<textarea class="adm-input" data-setkey="' + esc(k) + '" style="min-height:64px;font-family:ui-monospace,Menlo,monospace">' + esc(text) + '</textarea>') + note +
        '<div style="margin-top:4px">' + del + '</div></div>';
    }).join('');
  }
  function loadSettings() {
    stateMsg('set-list', '加载中…');
    GET('/api/admin/settings').then(function (d) { renderSettings(d.settings || d || {}); })
      .catch(function (e) { stateMsg('set-list', '加载失败: ' + errText(e), true); });
  }
  function initSettings() {
    loadBannedWords();
    loadSettings();
    $('set-reload').addEventListener('click', loadSettings);
    $('bw-save').addEventListener('click', saveBannedWords);
    // [R67-c] 设置键删除(非核心键; 后端核心键白名单兜底)
    $('set-list').addEventListener('click', function (ev) {
      var btn = ev.target.closest('button[data-delkey]');
      if (!btn) return;
      var k = btn.getAttribute('data-delkey');
      admConfirm('确定删除设置键「' + k + '」? 删除后读侧回落代码内默认值。', true).then(function (yes) {
        if (!yes) return;
        DEL('/api/admin/settings/' + encodeURIComponent(k)).then(function () { toast('设置键已删除'); loadSettings(); }).catch(function (e) { toast(errText(e), true); });
      });
    });
    $('set-add').addEventListener('click', function () {
      var k = $('set-new-key').value.trim();
      if (!k) { toast('请输入键名', true); return; }
      // [R66-c] 修前 PUT({key:k, value:''}) —— 后端把 body 整体当「键→值映射」逐条入库,
      // 实际写出名为 key/value 的垃圾行, 目标键从未创建。改发映射形态 {键: 值}。
      var addBody = {};
      addBody[k] = '';
      PUT('/api/admin/settings', addBody).then(function () { toast('键已添加'); $('set-new-key').value = ''; loadSettings(); }).catch(function (e) { toast(errText(e), true); });
    });
    $('set-save').addEventListener('click', function () {
      var boxes = document.querySelectorAll('[data-setkey]');
      var seq = Promise.resolve();
      boxes.forEach(function (b) {
        var k = b.getAttribute('data-setkey'), raw = b.value.trim();
        var v;
        if (raw === '') { v = ''; } else { try { v = JSON.parse(raw); } catch (e) { v = raw; } }
        // [R66-c] 修前 PUT({key:k, value:v}) 与后端 adminSettingsPut 的「body=键值映射」
        // 契约错位: 实际写入 Setting 表 key/value 两个垃圾键, 目标设置永远保存不上。
        // 改发 {设置键: 值} 映射形态(与 feedback.html 开关写入同款契约)。
        (function (kk, vv) {
          var body = {};
          body[kk] = vv;
          seq = seq.then(function () { return PUT('/api/admin/settings', body); });
        })(k, v);
      });
      seq.then(function () { toast('设置已保存'); loadSettings(); }).catch(function (e) { toast(errText(e), true); });
    });
  }

  /* ---------------- 违禁词过滤(Setting bannedWords 结构化编辑; API: GET/PUT /api/admin/banned-words) ---------------- */
  function splitLines(t) {
    return String(t || '').split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);
  }
  function loadBannedWords() {
    stateMsg('bw-state', '加载中…');
    GET('/api/admin/banned-words').then(function (c) {
      var words = c.words || [];
      $('bw-enabled').checked = !!c.enabled;
      $('bw-mode').value = c.mode === 'remove' ? 'remove' : 'mask';
      $('bw-words').value = words.join('\n');
      var el = $('bw-state');
      el.className = '';
      el.innerHTML = '<span class="adm-muted">当前 ' + words.length + ' 个违禁词, 过滤' + (c.enabled ? '已启用' : '未启用') + '</span>';
    }).catch(function (e) { stateMsg('bw-state', '加载失败: ' + errText(e), true); });
  }
  function saveBannedWords() {
    var words = splitLines($('bw-words').value);
    var enabled = $('bw-enabled').checked;
    if (enabled && !words.length) { toast('词表为空：请至少填写一个违禁词，或先关闭过滤开关', true); return; }
    PUT('/api/admin/banned-words', { enabled: enabled, mode: $('bw-mode').value, words: words })
      .then(function () {
        toast('违禁词已保存');
        loadBannedWords();
        loadSettings(); // [R67-c] 双头消歧: 语义侧保存后刷新原始 KV 列表
      })
      .catch(function (e) { toast(errText(e), true); });
  }

  /* ---------------- 反馈 ---------------- */
  function renderFeedback(rows) {
    var el = $('fb-list');
    el.className = 'adm-table-wrap';
    if (!rows || !rows.length) { el.innerHTML = '<div class="adm-empty">暂无反馈。</div>'; return; }
    el.innerHTML = '<table class="adm-table"><thead><tr><th>类型</th><th>内容</th><th>联系</th><th>状态</th><th>时间</th><th>操作</th></tr></thead><tbody>' +
      rows.map(function (f) {
        return '<tr><td>' + esc(f.type || '-') + '</td><td style="max-width:340px;word-break:break-all">' + esc(f.content || '') + (f.url ? '<div class="adm-muted">' + esc(f.url) + '</div>' : '') + '</td>' +
          '<td class="adm-muted">' + esc(f.contact || '-') + '</td>' +
          '<td>' + (f.status === 'resolved' ? '<span class="adm-badge is-done">已处理</span>' : '<span class="adm-badge is-paused">待处理</span>') + '</td>' +
          '<td class="adm-muted">' + fmtTime(f.createdAt) + '</td>' +
          '<td><div class="adm-actions">' +
          '<button class="adm-btn is-tiny" data-act="resolve" data-id="' + esc(f.id) + '">标记已处理</button>' +
          '<button class="adm-btn is-tiny is-danger" data-act="del" data-id="' + esc(f.id) + '">删除</button></div></td></tr>';
      }).join('') + '</tbody></table>';
  }
  function loadFeedback() {
    stateMsg('fb-list', '加载中…');
    var st = $('fb-filter').value;
    GET('/api/admin/feedback' + (st ? '?status=' + encodeURIComponent(st) : '')).then(function (d) { renderFeedback(d.feedback || d.list || d || []); })
      .catch(function (e) { stateMsg('fb-list', '加载失败: ' + errText(e), true); });
  }
  function initFeedback() {
    loadFeedback();
    $('fb-refresh').addEventListener('click', loadFeedback);
    $('fb-filter').addEventListener('change', loadFeedback);
    $('fb-list').addEventListener('click', function (ev) {
      var btn = ev.target.closest('button[data-act]');
      if (!btn) return;
      var id = btn.getAttribute('data-id');
      if (btn.getAttribute('data-act') === 'resolve') {
        PATCH('/api/admin/feedback/' + encodeURIComponent(id), { status: 'resolved' }).then(function () { toast('已标记'); loadFeedback(); }).catch(function (e) { toast(errText(e), true); });
      } else if (btn.getAttribute('data-act') === 'del') {
        admConfirm('确定删除该反馈?', true).then(function (yes) {
          if (!yes) return;
          DEL('/api/admin/feedback/' + encodeURIComponent(id)).then(function () { toast('已删除'); loadFeedback(); }).catch(function (e) { toast(errText(e), true); });
        });
      }
    });
  }

  /* ---------------- 备份 ---------------- */
  var RESTORE_TABLE_LABEL = { Setting: '设置', Category: '分类', Site: '站点', FriendLink: '友链', Rule: '规则', Book: '书籍', Chapter: '章节', BookTag: '标签', Task: '任务', DownloadJob: '下载任务' };
  function fmtRestoreMap(m) {
    return Object.keys(m || {}).map(function (k) { return (RESTORE_TABLE_LABEL[k] || k) + ' ' + m[k]; }).join(' / ') || '无';
  }
  function loadBackup() {
    stateMsg('bk-stats', '加载中…');
    GET('/api/admin/stats').then(function (s) {
      var el = $('bk-stats');
      el.className = 'adm-kv-list';
      el.innerHTML = ['书籍 ' + s.books, '章节 ' + s.chapters, '规则 ' + s.rules, '任务 ' + s.tasks, '站点 ' + s.sites, '标签 ' + s.tags].map(function (x) {
        var p = x.split(' ');
        return '<div class="adm-stat"><b>' + esc(p[1]) + '</b><span>' + esc(p[0]) + '</span></div>';
      }).join('');
    }).catch(function (e) { stateMsg('bk-stats', '加载失败: ' + errText(e), true); });
  }
  function initBackup() {
    loadBackup();
    $('bk-refresh').addEventListener('click', loadBackup);
    $('bk-download').addEventListener('click', function () { toast('备份开始下载'); });
    // [R67-c] 恢复入口(POST /api/admin/backup/restore?strategy=skip|overwrite, R56-2b 端点)
    $('bk-restore').addEventListener('click', function () {
      var fi = $('bk-restore-file');
      var f = fi && fi.files && fi.files[0];
      if (!f) { toast('请先选择备份 JSON 文件', true); return; }
      var strategy = $('bk-restore-strategy').value === 'skip' ? 'skip' : 'overwrite';
      var hint = strategy === 'overwrite' ? '同主键行将被备份内容覆盖。' : '已存在的同主键行将保留现库内容。';
      admConfirm('确定从「' + f.name + '」恢复? ' + hint, true).then(function (yes) {
        if (!yes) return;
        stateMsg('bk-restore-state', '恢复中…(文件越大耗时越长, 请勿关闭页面)');
        var reader = new FileReader();
        reader.onerror = function () { stateMsg('bk-restore-state', '读取文件失败', true); };
        reader.onload = function () {
          fetch('/api/admin/backup/restore?strategy=' + strategy, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: String(reader.result)
          }).then(function (res) {
            if (res.status === 401) { location.href = '/admin/login'; throw new Error('登录已过期, 请重新登录'); }
            return res.json().then(function (j) {
              return { ok: res.ok && j && j.ok === true, data: j && j.data, error: j && j.error };
            });
          }).then(function (r) {
            if (!r.ok) throw new Error(r.error || ('请求失败'));
            var d = r.data || {};
            var html = '<div class="adm-state" style="color:#10b981">恢复完成(策略: ' + (d.strategy === 'skip' ? '保留现库' : '备份为准') + ')' +
              '<div>恢复: ' + esc(fmtRestoreMap(d.restored)) + '</div>' +
              '<div>跳过: ' + esc(fmtRestoreMap(d.skipped)) + '</div>' +
              '<div>失败: ' + Number(d.failedTotal || 0) + ' 条' + (d.failed && d.failed.length ? '(前 ' + d.failed.length + ' 条: ' + esc(d.failed.map(function (x) { return (RESTORE_TABLE_LABEL[x.table] || x.table) + '#' + (x.id || '-') + ' ' + (x.error || ''); }).join('；')) + ')' : '') + '</div></div>';
            var el = $('bk-restore-state');
            el.className = '';
            el.innerHTML = html;
            loadBackup();
          }).catch(function (e) { stateMsg('bk-restore-state', '恢复失败: ' + errText(e), true); });
        };
        reader.readAsText(f);
      });
    });
  }

  /* ---------------- 启动 ---------------- */
  var INIT = {
    dashboard: initDashboard, tasks: initTasks, rules: initRules, proxy: initProxy,
    books: initBooks, categories: initCategories, sites: initSites, links: initLinks,
    downloads: initDownloads, settings: initSettings, feedback: initFeedback, backup: initBackup
  };

  function boot() {
    initLogin();
    initLogout();
    var main = $('adm-main');
    if (main) {
      var sec = main.getAttribute('data-section') || '';
      if (INIT[sec]) { try { INIT[sec](); } catch (e) { toast('初始化失败: ' + errText(e), true); } }
    }
  }
  if (typeof document === 'undefined') {
    /* [R65-a] Node(非浏览器)环境: 仅导出规则表单纯逻辑供零损失往返单测, 不做任何 DOM 初始化 */
    if (typeof module !== 'undefined' && module.exports) {
      module.exports = { rfSplit: rfSplit, rfBuild: rfBuild, rfSeedNew: rfSeedNew, rfJsonEq: rfJsonEq, RF_FIELDS: RF_FIELDS };
    }
  } else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
