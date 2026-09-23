// ============================================================
// R60-2b — 用户反馈模块(api 面)
//
//	公开:  GET  /feedback                          独立轻量反馈页(API 直出 HTML, 不进主题集)
//	       POST /api/public/feedback               提交(feedback.enabled 开关 + 同 IP 5条/h 限频 + 长度钳 1..2000)
//	       GET  /api/public/feedback               405(不允许列表)
//	管理:  GET    /api/admin/feedback              分页列表(status/type/q 筛选 + 统计)
//	       GET    /api/admin/feedback/{id}         详情
//	       PUT/PATCH /api/admin/feedback/{id}      局部更新(status/adminNote)
//	       POST   /api/admin/feedback/{id}/process 标记已处理(status→resolved)
//	       DELETE /api/admin/feedback/{id}         删除
//
// SQL 全部走 store 层 CRUD(store/feedback.go); 本文件只做校验/鉴权/编排。
// 历史口径保留: 反垃圾(URL ≤3/全大写拒绝)与状态/类型枚举自 R56-2b。
// ============================================================
package api

import (
	"net/http"
	"regexp"
	"strings"

	"mhgl/internal/store"
)

var feedbackStatuses = map[string]bool{"new": true, "read": true, "resolved": true, "ignored": true}
var feedbackTypes = map[string]bool{"bug": true, "suggestion": true, "praise": true, "other": true}

// feedbackEnabledLenMax 反馈正文长度上限(任务口径 1..2000 字)。
const feedbackContentMax = 2000

// feedbackEnabled 反馈开关(Setting.feedback JSON {"enabled":bool}; 缺省 on)。
// 读脏 JSON/缺键一律回落缺省开, 关闭必须显式写 enabled=false。
func (d Deps) feedbackEnabled() bool {
	var m struct {
		Enabled *bool `json:"enabled"`
	}
	if ok, _ := d.DB.SettingJSON("feedback", &m); ok && m.Enabled != nil {
		return *m.Enabled
	}
	return true
}

// ---------------- 公开面 ----------------

// (d Deps) publicFeedbackPage GET /feedback — 独立轻量反馈页。
//
// 不进主题模板集(tpl/themes/** 归主题代理): 本页 API 直出最小 HTML, 样式内联,
// 提交走同源 fetch → POST /api/public/feedback(无需登录)。开关关闭时渲染
// 关闭态文案(POST 侧同样 403 兜底, 双保险)。
func (d Deps) publicFeedbackPage(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Cache-Control", "no-store")
	if !d.feedbackEnabled() {
		_, _ = w.Write([]byte(feedbackPageShell("反馈功能未开启", `<p class="tip">站点当前未开放反馈入口, 请稍后再来。</p>`)))
		return
	}
	_, _ = w.Write([]byte(feedbackPageShell("意见反馈", `
<form id="fb-form">
  <label for="fb-type">反馈类型</label>
  <select id="fb-type" name="type">
    <option value="suggestion">建议</option>
    <option value="bug">问题反馈</option>
    <option value="praise">表扬</option>
    <option value="other">其他</option>
  </select>
  <label for="fb-contact">联系方式(选填, 邮箱/QQ)</label>
  <input id="fb-contact" name="contact" type="text" maxlength="100" autocomplete="off" placeholder="方便我们回访">
  <label for="fb-content">反馈内容(1-2000 字)</label>
  <textarea id="fb-content" name="content" rows="6" maxlength="2000" required placeholder="请描述您遇到的问题或建议…"></textarea>
  <input type="hidden" id="fb-url" name="url" value="">
  <button id="fb-submit" type="submit">提交反馈</button>
  <p id="fb-msg" class="tip" role="status"></p>
</form>
<script>
(function () {
  var f = document.getElementById('fb-form');
  document.getElementById('fb-url').value = window.location.href;
  f.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var msg = document.getElementById('fb-msg');
    var btn = document.getElementById('fb-submit');
    btn.disabled = true;
    msg.textContent = '提交中…';
    fetch('/api/public/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: document.getElementById('fb-type').value,
        contact: document.getElementById('fb-contact').value,
        content: document.getElementById('fb-content').value,
        url: document.getElementById('fb-url').value
      })
    }).then(function (res) {
      return res.json().then(function (j) { return { ok: res.ok, j: j }; });
    }).then(function (r) {
      // 信封: 成功 {ok:true,data} / 失败 {ok:false,error}
      if (r.ok) {
        msg.textContent = '提交成功, 感谢您的反馈!';
        f.reset();
      } else {
        msg.textContent = (r.j && r.j.error) || '提交失败, 请稍后再试。';
      }
    }).catch(function () {
      msg.textContent = '网络异常, 请稍后再试。';
    }).finally(function () { btn.disabled = false; });
  });
})();
</script>`)))
}

// feedbackPageShell 反馈页壳(内联样式, 自包含, 无外部资源依赖)。
func feedbackPageShell(title, body string) string {
	return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<title>` + title + `</title>
<style>
*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;
background:#f5f6f8;color:#222;line-height:1.6}
.wrap{max-width:560px;margin:0 auto;padding:24px 16px 48px}
h1{font-size:20px;margin:0 0 16px}
form,.card{background:#fff;border:1px solid #e3e6ea;border-radius:10px;padding:20px}
label{display:block;font-size:13px;color:#555;margin:14px 0 4px}
input,select,textarea{width:100%;padding:9px 10px;border:1px solid #d6dae0;border-radius:8px;font-size:14px;font-family:inherit;background:#fff;color:#222}
textarea{resize:vertical}
button{margin-top:18px;width:100%;padding:11px 0;border:0;border-radius:8px;background:#2b5b84;color:#fff;font-size:15px;cursor:pointer}
button:disabled{opacity:.6;cursor:default}
.tip{font-size:13px;color:#777;margin:12px 0 0}
</style>
</head>
<body><div class="wrap"><h1>` + title + `</h1>` + body + `</div></body>
</html>`
}

// (d Deps) publicFeedbackPost POST /api/public/feedback
//
// 开关(Setting.feedback.enabled, 缺省 on)关闭 → 403; 同 IP 每小时 ≤5 条 → 429;
// 正文去标签钳制 1..2000 字; 反垃圾: 链接 ≤3 / 全大写拒绝。
func (d Deps) publicFeedbackPost(w http.ResponseWriter, r *http.Request) {
	if !d.feedbackEnabled() {
		apiErr(w, http.StatusForbidden, "反馈功能已关闭")
		return
	}
	siteID := strings.TrimSpace(strOf(r.URL.Query().Get("site"), 64))
	body := readBodyMap(w, r, 100*1024)
	if !bodyOK(body) {
		return
	}
	typ := strings.TrimSpace(strOf(body["type"], 20))
	if !feedbackTypes[typ] {
		apiErr(w, http.StatusBadRequest, "反馈类型不合法")
		return
	}
	// strOf 按字节钳(码点安全回退): 2000 字上限需按 4 字节/码点放宽字节窗, 再由
	// truncateRunes 做码点级 2000 收口(纯 CJK 2500 字也完整进入钳制管道)
	rawContent := strings.TrimSpace(strOf(body["content"], feedbackContentMax*4+512))
	content := strings.TrimSpace(stripHTML(rawContent))
	content = truncateRunes(content, feedbackContentMax)
	if len([]rune(content)) < 1 {
		apiErr(w, http.StatusBadRequest, "反馈内容不能为空")
		return
	}
	contact := strings.TrimSpace(strOf(body["contact"], 100))
	feedbackURL := strings.TrimSpace(strOf(body["url"], 2000))

	// 反垃圾: URL 数量 / 全大写(既有口径保留)
	if len(feedbackURLRe.FindAllString(content, -1)) > 3 {
		apiErr(w, http.StatusBadRequest, "反馈内容包含过多链接, 请精简后重试")
		return
	}
	if isAllCaps(content) {
		apiErr(w, http.StatusBadRequest, "反馈内容请勿全部大写")
		return
	}
	ip := clientIP(r)
	userAgent := strOf(r.Header.Get("User-Agent"), 500)
	if ip != "" {
		cnt, err := d.DB.FeedbackCountByIPSince(ip, store.NowMS()-3600_000)
		if err == nil && cnt >= 5 {
			apiErr(w, http.StatusTooManyRequests, "提交过于频繁, 请稍后再试")
			return
		}
	}
	fbID, err := d.DB.FeedbackInsert(store.FeedbackInput{
		Type: typ, Contact: contact, Content: content, URL: feedbackURL,
		SiteID: siteID, UserAgent: userAgent, IP: ip,
	})
	if err != nil {
		apiErr(w, http.StatusInternalServerError, "服务器内部错误")
		return
	}
	apiOK(w, map[string]any{"id": fbID})
}

// feedbackURLRe 反垃圾链接计数([R56-2b] 修前每请求编译一次, 上提到包级)。
var feedbackURLRe = regexp.MustCompile(`https?://\S+`)

// (d Deps) publicFeedbackGet GET /api/public/feedback — 不允许列表。
func (d Deps) publicFeedbackGet(w http.ResponseWriter, r *http.Request) {
	apiErr(w, http.StatusMethodNotAllowed, "Method Not Allowed")
}

// isAllCaps 含字母且全大写 → shouting。
func isAllCaps(s string) bool {
	letters := 0
	upper := 0
	for _, r := range s {
		if r >= 'A' && r <= 'Z' {
			letters++
			upper++
		} else if r >= 'a' && r <= 'z' {
			letters++
		}
	}
	return letters >= 6 && letters == upper
}

// ---------------- 管理面 ----------------

// (d Deps) adminFeedbackList GET /api/admin/feedback
func (d Deps) adminFeedbackList(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	page0, size := pageClamp(q, 1, 20, 100)
	status := strOf(q.Get("status"), 20)
	typ := strOf(q.Get("type"), 20)
	qLike := likeSafe(q.Get("q"), 100)
	if !feedbackStatuses[status] {
		status = "" // 非法值不过滤(防注入面: 仅白名单进 SQL 参数)
	}
	if !feedbackTypes[typ] {
		typ = ""
	}
	rows, total, stats, err := d.DB.FeedbackList(store.FeedbackListOpts{
		Status: status, Type: typ, Q: qLike, Page: page0, Size: size,
	})
	if err != nil {
		apiErr(w, http.StatusInternalServerError, "服务器内部错误")
		return
	}
	page := minInt(page0, lastPage(total, size))
	apiOK(w, map[string]any{
		"rows": rows, "total": total, "page": page, "size": size,
		"pages": maxInt(1, lastPage(total, size)),
		"stats": stats,
	})
}

// (d Deps) adminFeedbackDetail GET /api/admin/feedback/{id}
func (d Deps) adminFeedbackDetail(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	row, ok, err := d.DB.FeedbackGet(id)
	if err != nil {
		apiErr(w, http.StatusInternalServerError, "服务器内部错误")
		return
	}
	if !ok {
		apiErr(w, http.StatusNotFound, "反馈不存在")
		return
	}
	apiOK(w, row)
}

// (d Deps) adminFeedbackUpdate PUT/PATCH /api/admin/feedback/{id}
func (d Deps) adminFeedbackUpdate(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	body := readBodyMap(w, r, 0)
	if !bodyOK(body) {
		return
	}
	if ok, _ := d.DB.FeedbackExists(id); !ok {
		apiErr(w, http.StatusNotFound, "反馈不存在")
		return
	}
	var statusPtr, notePtr *string
	if v, has := body["status"]; has {
		st := strings.TrimSpace(strOf(v, 20))
		if !feedbackStatuses[st] {
			apiErr(w, http.StatusBadRequest, "状态值不合法")
			return
		}
		statusPtr = &st
	}
	if v, has := body["adminNote"]; has {
		// R5-17: 剥 HTML 标签; 空串 → NULL(保持既有契约)
		note := strings.TrimSpace(stripHTML(strOf(v, 1000)))
		notePtr = &note
	}
	if statusPtr == nil && notePtr == nil {
		apiErr(w, http.StatusBadRequest, "没有可更新字段")
		return
	}
	if err := d.DB.FeedbackUpdate(id, statusPtr, notePtr); err != nil {
		apiErr(w, http.StatusInternalServerError, "服务器内部错误")
		return
	}
	row, _, _ := d.DB.FeedbackGet(id)
	apiOK(w, row)
}

// (d Deps) adminFeedbackProcess POST /api/admin/feedback/{id}/process
//
// 标记已处理(status → resolved); body 可选 {"adminNote":"..."} 附处理备注。
func (d Deps) adminFeedbackProcess(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if ok, _ := d.DB.FeedbackExists(id); !ok {
		apiErr(w, http.StatusNotFound, "反馈不存在")
		return
	}
	note := ""
	if body := readBodyMap(w, r, 0); bodyOK(body) {
		if v, has := body["adminNote"]; has {
			note = strings.TrimSpace(stripHTML(strOf(v, 1000)))
		}
	}
	if err := d.DB.FeedbackMarkProcessed(id, note); err != nil {
		apiErr(w, http.StatusInternalServerError, "服务器内部错误")
		return
	}
	row, _, _ := d.DB.FeedbackGet(id)
	apiOK(w, row)
}

// (d Deps) adminFeedbackDelete DELETE /api/admin/feedback/{id}
func (d Deps) adminFeedbackDelete(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if ok, _ := d.DB.FeedbackExists(id); !ok {
		apiErr(w, http.StatusNotFound, "反馈不存在")
		return
	}
	if err := d.DB.FeedbackDelete(id); err != nil {
		apiErr(w, http.StatusInternalServerError, "服务器内部错误")
		return
	}
	apiOK(w, nil)
}
