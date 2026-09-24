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
	"net"
	"net/http"
	"strconv"
	"strings"

	"mhgl/internal/auth"
)

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func clientIP(r *http.Request) string {
	host := r.RemoteAddr
	if i := strings.LastIndexByte(host, ':'); i > 0 {
		host = host[:i]
	}
	host = strings.Trim(host, "[]")
	// [R56-2b-fix] XFF 信任收紧: 仅当直连对端是回环/私网(即处于本机反代之后)才采信
	// x-forwarded-for; 公网直连一律用对端地址 —— 修前任意客户端可伪造 XFF 轮换身份,
	// 绕过登录爆破限流与反馈频控(每 IP 5 次/窗口)。沙箱/反代部署形态不受影响。
	if ip := net.ParseIP(host); ip != nil && !ip.IsLoopback() && !ip.IsPrivate() {
		return host
	}
	if xf := r.Header.Get("x-forwarded-for"); xf != "" {
		if i := strings.IndexByte(xf, ','); i > 0 {
			return strings.TrimSpace(xf[:i])
		}
		return strings.TrimSpace(xf)
	}
	return host
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
		w.Header().Set("Retry-After", strconv.Itoa(d.Auth.RetryAfterSec(ip)))
		writeJSON(w, http.StatusTooManyRequests, map[string]any{"ok": false, "error": "尝试过于频繁, 请稍后再试"})
		return
	}
	if !d.Auth.VerifyPassword(body.Password) {
		writeJSON(w, http.StatusUnauthorized, map[string]any{"ok": false, "error": "密码错误"})
		return
	}
	d.Auth.ClearAttempts(ip)
	// [R62-f] Secure 跟随部署形态: 显式 COOKIE_SECURE=1 或请求经 https(TLS 直连/
	// 反代 X-Forwarded-Proto)时附加 Secure 属性; 缺省 false 保 http 沙箱预览可用
	secure := d.CookieSecure || auth.SecureFromRequest(r)
	cookie, err := d.Auth.IssueSession(secure)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"ok": false, "error": "会话签发失败"})
		return
	}
	w.Header().Add("Set-Cookie", cookie)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (d Deps) handleLogout(w http.ResponseWriter, r *http.Request) {
	// 注销报文 Secure 属性与签发时保持同一判定口径(属性对齐防残留)
	w.Header().Add("Set-Cookie", d.Auth.ClearSession(d.CookieSecure || auth.SecureFromRequest(r)))
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
