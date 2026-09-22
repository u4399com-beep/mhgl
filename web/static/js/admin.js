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
  function ruleFormHTML(r) {
    r = r || {};
    return fld('规则名称', '<input class="adm-input" id="rf-name" value="' + esc(r.name || '') + '" required>') +
      fld('描述', '<input class="adm-input" id="rf-desc" value="' + esc(r.description || '') + '">') +
      chk('rf-enabled', '启用', r.enabled === undefined ? true : !!r.enabled) +
      fld('规则配置(JSON)', '<textarea class="adm-input" id="rf-config" style="min-height:220px;font-family:ui-monospace,Menlo,monospace">' + esc(r.config || '{}') + '</textarea>');
  }
  function initRules() {
    loadRules();
    $('rule-refresh').addEventListener('click', loadRules);
    $('rule-import').addEventListener('click', function () {
      admConfirm('导入内置规则库(与现有同名规则保 id 覆盖)?').then(function (yes) {
        if (!yes) return;
        POST('/api/admin/rules/import-builtin').then(function (r) { toast('导入完成: ' + ((r && (r.imported || r.count)) || 'OK')); loadRules(); })
          .catch(function (e) { toast(errText(e), true); });
      });
    });
    $('rule-new').addEventListener('click', function () {
      openDialog('新建规则', ruleFormHTML(null), function (form, close) {
        var config;
        try { config = JSON.parse($('rf-config').value); } catch (e) { throw new Error('规则配置不是合法 JSON: ' + e.message); }
        return POST('/api/admin/rules', { name: $('rf-name').value.trim(), description: $('rf-desc').value.trim(), enabled: $('rf-enabled').checked, config: config })
          .then(function () { close(); toast('规则已创建'); loadRules(); });
      });
    });
    $('rule-test-run').addEventListener('click', function () {
      var id = $('rule-test-id').value, url = $('rule-test-url').value.trim();
      var out = $('rule-test-result');
      if (!id || !url) { out.textContent = '请先选择规则并填写目标 URL。'; return; }
      out.textContent = '测试中…';
      POST('/api/admin/rules/test', { ruleId: id, url: url }).then(function (r) {
        out.textContent = JSON.stringify(r, null, 2);
      }).catch(function (e) { out.textContent = '测试失败: ' + errText(e); });
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
          openDialog('编辑规则', ruleFormHTML(r), function (form, close) {
            var config;
            try { config = JSON.parse($('rf-config').value); } catch (e) { throw new Error('规则配置不是合法 JSON: ' + e.message); }
            return PUT('/api/admin/rules/' + encodeURIComponent(id), { name: $('rf-name').value.trim(), description: $('rf-desc').value.trim(), enabled: $('rf-enabled').checked, config: config })
              .then(function () { close(); toast('规则已保存'); loadRules(); });
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
          '<td><div class="adm-actions">' + (j.filePath ? '<a class="adm-btn is-tiny" href="/api/public/download?file=' + encodeURIComponent(j.filePath) + '">下载</a>' : '') +
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

  /* ---------------- 系统设置 ---------------- */
  function renderSettings(obj) {
    var el = $('set-list');
    el.className = '';
    var keys = Object.keys(obj || {}).sort();
    if (!keys.length) { el.innerHTML = '<div class="adm-empty">暂无自定义设置(代码内默认值生效)。</div>'; return; }
    el.innerHTML = keys.map(function (k) {
      var v = obj[k];
      var text = (typeof v === 'string') ? v : JSON.stringify(v, null, 2);
      return '<div style="margin-bottom:12px">' + fld(k, '<textarea class="adm-input" data-setkey="' + esc(k) + '" style="min-height:64px;font-family:ui-monospace,Menlo,monospace">' + esc(text) + '</textarea>') + '</div>';
    }).join('');
  }
  function loadSettings() {
    stateMsg('set-list', '加载中…');
    GET('/api/admin/settings').then(function (d) { renderSettings(d.settings || d || {}); })
      .catch(function (e) { stateMsg('set-list', '加载失败: ' + errText(e), true); });
  }
  function initSettings() {
    loadSettings();
    $('set-reload').addEventListener('click', loadSettings);
    $('set-add').addEventListener('click', function () {
      var k = $('set-new-key').value.trim();
      if (!k) { toast('请输入键名', true); return; }
      PUT('/api/admin/settings', { key: k, value: '' }).then(function () { toast('键已添加'); $('set-new-key').value = ''; loadSettings(); }).catch(function (e) { toast(errText(e), true); });
    });
    $('set-save').addEventListener('click', function () {
      var boxes = document.querySelectorAll('[data-setkey]');
      var seq = Promise.resolve();
      boxes.forEach(function (b) {
        var k = b.getAttribute('data-setkey'), raw = b.value.trim();
        var v;
        if (raw === '') { seq = seq.then(function () { return PUT('/api/admin/settings', { key: k, value: '' }); }); return; }
        try { v = JSON.parse(raw); } catch (e) { v = raw; }
        (function (kk, vv) {
          seq = seq.then(function () { return PUT('/api/admin/settings', { key: kk, value: vv }); });
        })(k, v);
      });
      seq.then(function () { toast('设置已保存'); loadSettings(); }).catch(function (e) { toast(errText(e), true); });
    });
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
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
