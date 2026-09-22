// ============================================================
// 鉴权端点(api/auth.go — 主控脚手架件, 3-b 可在此包扩展其余端点)
//
//	POST /api/auth/login  {password} → Set-Cookie(限流 5 次/60s/IP)
//	POST /api/auth/logout → 清 Cookie
//	GET  /api/auth/check  → {ok, authenticated}
//	GET  /api/auth/preview-hint → {password?} (仅 dev 且为公开缺省值时回显)
//
// ============================================================
package api

import (
	"encoding/json"
	"net/http"
	"strings"
)

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func clientIP(r *http.Request) string {
	// 沙箱/反代环境: x-forwarded-for 首段优先(与原 middleware 口径一致)
	if xf := r.Header.Get("x-forwarded-for"); xf != "" {
		if i := strings.IndexByte(xf, ','); i > 0 {
			return strings.TrimSpace(xf[:i])
		}
		return strings.TrimSpace(xf)
	}
	host := r.RemoteAddr
	if i := strings.LastIndexByte(host, ':'); i > 0 {
		host = host[:i]
	}
	return strings.Trim(host, "[]")
}

func (d Deps) handleLogin(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Password string `json:"password"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": "请求体非法"})
		return
	}
	ip := clientIP(r)
	if !d.Auth.ConsumeAttempt(ip) {
		w.Header().Set("Retry-After", itoa(d.Auth.RetryAfterSec(ip)))
		writeJSON(w, http.StatusTooManyRequests, map[string]any{"ok": false, "error": "尝试过于频繁, 请稍后再试"})
		return
	}
	if !d.Auth.VerifyPassword(body.Password) {
		writeJSON(w, http.StatusUnauthorized, map[string]any{"ok": false, "error": "密码错误"})
		return
	}
	d.Auth.ClearAttempts(ip)
	cookie, err := d.Auth.IssueSession()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"ok": false, "error": "会话签发失败"})
		return
	}
	w.Header().Add("Set-Cookie", cookie)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (d Deps) handleLogout(w http.ResponseWriter, r *http.Request) {
	w.Header().Add("Set-Cookie", d.Auth.ClearSession())
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (d Deps) handleCheck(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "authenticated": d.Auth.Check(r)})
}

func (d Deps) handlePreviewHint(w http.ResponseWriter, r *http.Request) {
	if d.IsProd {
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "password": nil})
		return
	}
	hint := d.Auth.PreviewHintPassword()
	if hint == "" {
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "password": nil})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "password": hint})
}

func itoa(n int) string {
	if n <= 0 {
		return "0"
	}
	var b [20]byte
	i := len(b)
	for n > 0 {
		i--
		b[i] = byte('0' + n%10)
		n /= 10
	}
	return string(b[i:])
}
