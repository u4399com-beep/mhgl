// ============================================================
// R62-f — 登录会话 Cookie Secure 属性接线回归(api 层合成逻辑)
//
//	secure = Deps.CookieSecure(显式 COOKIE_SECURE=1) || 请求经 https(TLS 直连/
//	反代 X-Forwarded-Proto); 缺省 false 保 http 沙箱预览可用(auth.go 全谱钉之外
//	的装配面回归)。
//
// ============================================================
package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"mhgl/internal/auth"
)

func r62fLoginReq(t *testing.T, d Deps, header http.Header) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest("POST", "/api/auth/login", strings.NewReader(`{"password":"pw"}`))
	req.Header.Set("Content-Type", "application/json")
	for k, vs := range header {
		for _, v := range vs {
			req.Header.Add(k, v)
		}
	}
	rec := httptest.NewRecorder()
	d.handleLogin(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("login status=%d body=%s", rec.Code, rec.Body.String())
	}
	return rec
}

// 缺省(无 COOKIE_SECURE/非 https 请求): Set-Cookie 不得带 Secure(http 沙箱预览可用性)。
func TestLoginCookieSecureDefaultOff(t *testing.T) {
	d := Deps{DB: newTestDB(t), Auth: auth.NewService("pw", "s", false)}
	rec := r62fLoginReq(t, d, nil)
	sc := rec.Header().Get("Set-Cookie")
	if !strings.Contains(sc, auth.CookieName+"=") {
		t.Fatalf("Set-Cookie missing session: %q", sc)
	}
	if strings.Contains(sc, "Secure") {
		t.Errorf("default http login must NOT emit Secure, got %q", sc)
	}
}

// 显式 Deps.CookieSecure=true(生产 COOKIE_SECURE=1): 登录/注销报文都带 Secure。
func TestLoginCookieSecureExplicitOn(t *testing.T) {
	d := Deps{DB: newTestDB(t), Auth: auth.NewService("pw", "s", false), CookieSecure: true}
	rec := r62fLoginReq(t, d, nil)
	if sc := rec.Header().Get("Set-Cookie"); !strings.Contains(sc, "Secure") {
		t.Errorf("COOKIE_SECURE=1 login must emit Secure, got %q", sc)
	}
	lg := httptest.NewRecorder()
	d.handleLogout(lg, httptest.NewRequest("POST", "/api/auth/logout", nil))
	if sc := lg.Header().Get("Set-Cookie"); !strings.Contains(sc, "Secure") || !strings.Contains(sc, "Max-Age=0") {
		t.Errorf("logout under secure must carry Secure+Max-Age=0, got %q", sc)
	}
}

// 反代 X-Forwarded-Proto: https(即使显式开关未开)→ 自动叠加 Secure; http → 不叠加。
func TestLoginCookieSecureFromForwardedProto(t *testing.T) {
	d := Deps{DB: newTestDB(t), Auth: auth.NewService("pw", "s", false)}
	rec := r62fLoginReq(t, d, http.Header{"X-Forwarded-Proto": []string{"https"}})
	if sc := rec.Header().Get("Set-Cookie"); !strings.Contains(sc, "Secure") {
		t.Errorf("XFP=https login must emit Secure, got %q", sc)
	}
	rec2 := r62fLoginReq(t, d, http.Header{"X-Forwarded-Proto": []string{"http"}})
	if sc := rec2.Header().Get("Set-Cookie"); strings.Contains(sc, "Secure") {
		t.Errorf("XFP=http login must NOT emit Secure, got %q", sc)
	}
}
