// ============================================================
// R56-2b — internal/auth 逐行深审回归测试
// 覆盖: 会话签发/校验/篡改/过期/额外键拒绝、ClearSession Max-Age=0、
//
//	登录限流窗口(5次/60s)、preview-hint 语义、XFF 信任收紧(api 侧)。
//
// ============================================================
package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"strings"
	"testing"
	"time"
)

func newTestService() *Service {
	return NewService(DefaultPassword, "test-secret", false)
}

func TestIssueVerifyRoundtrip(t *testing.T) {
	s := newTestService()
	cookie, err := s.IssueSession()
	if err != nil {
		t.Fatalf("IssueSession: %v", err)
	}
	if !strings.Contains(cookie, CookieName+"=") {
		t.Fatalf("cookie header missing name: %q", cookie)
	}
	val := strings.TrimPrefix(strings.Split(cookie, ";")[0], CookieName+"=")
	if !s.VerifySession(val) {
		t.Fatalf("fresh session must verify")
	}
}

func craftToken(t *testing.T, secret string, payloadObj map[string]any) string {
	t.Helper()
	raw, _ := json.Marshal(payloadObj)
	payload := base64.RawURLEncoding.EncodeToString(raw)
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(payload))
	return payload + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func TestVerifySessionRejects(t *testing.T) {
	s := newTestService()
	cases := []struct {
		name  string
		token string
	}{
		{"empty", ""},
		{"no-dot", "abc"},
		{"bad-mac", craftToken(t, "wrong-secret", map[string]any{"exp": time.Now().Add(time.Hour).UnixMilli(), "nonce": strings.Repeat("a", 32)})},
		{"expired", craftToken(t, "test-secret", map[string]any{"exp": time.Now().Add(-time.Minute).UnixMilli(), "nonce": strings.Repeat("a", 32)})},
		{"extra-key", craftToken(t, "test-secret", map[string]any{"exp": time.Now().Add(time.Hour).UnixMilli(), "nonce": strings.Repeat("a", 32), "admin": true})},
		{"bad-nonce", craftToken(t, "test-secret", map[string]any{"exp": time.Now().Add(time.Hour).UnixMilli(), "nonce": "zz"})},
		{"missing-nonce", craftToken(t, "test-secret", map[string]any{"exp": time.Now().Add(time.Hour).UnixMilli()})},
		{"exp-not-number", craftToken(t, "test-secret", map[string]any{"exp": "soon", "nonce": strings.Repeat("a", 32)})},
	}
	for _, c := range cases {
		if s.VerifySession(c.token) {
			t.Errorf("%s: must be rejected", c.name)
		}
	}
	// 结构被篡改(取合法会话改 mac)
	good, _ := s.IssueSession()
	val := strings.TrimPrefix(strings.Split(good, ";")[0], CookieName+"=")
	if s.VerifySession(val + "x") {
		t.Errorf("tampered mac must be rejected")
	}
}

func TestClearSessionEmitsMaxAgeZero(t *testing.T) {
	// [R56-2b-fix] 修前 MaxAge=0 被 net/http 语义吞掉(不输出 Max-Age 属性)
	s := newTestService()
	h := s.ClearSession()
	if !strings.Contains(h, "Max-Age=0") {
		t.Errorf("clear cookie must carry Max-Age=0, got %q", h)
	}
	if !strings.Contains(h, "Expires=Thu, 01 Jan 1970 00:00:00 GMT") {
		t.Errorf("clear cookie must carry epoch Expires, got %q", h)
	}
}

func TestLoginRateLimitWindow(t *testing.T) {
	s := newTestService()
	ip := "1.2.3.4"
	for i := 0; i < maxLoginAttempts; i++ {
		if !s.ConsumeAttempt(ip) {
			t.Fatalf("attempt %d must be allowed", i+1)
		}
	}
	if s.ConsumeAttempt(ip) {
		t.Errorf("attempt beyond %d must be blocked", maxLoginAttempts)
	}
	if s.RetryAfterSec(ip) <= 0 {
		t.Errorf("RetryAfterSec must be positive while limited")
	}
	s.ClearAttempts(ip)
	if !s.ConsumeAttempt(ip) {
		t.Errorf("after ClearAttempts must be allowed again")
	}
	// 独立 IP 互不影响
	if !s.ConsumeAttempt("5.6.7.8") {
		t.Errorf("other ip must be unaffected")
	}
}

func TestPreviewHintSemantics(t *testing.T) {
	dev := NewService(DefaultPassword, "s", false)
	if dev.PreviewHintPassword() != DefaultPassword {
		t.Errorf("dev default password must be hinted")
	}
	custom := NewService("my-secret-pw", "s", false)
	if custom.PreviewHintPassword() != "" {
		t.Errorf("custom password must never be hinted")
	}
	prod := NewService("", "s", true)
	if prod.PreviewHintPassword() != "" {
		t.Errorf("prod must never hint")
	}
	if prod.VerifyPassword(DefaultPassword) {
		t.Errorf("prod empty-password fail-closed: verify must fail")
	}
}

func TestVerifyPasswordEmpty(t *testing.T) {
	s := NewService("", "s", false) // fail-closed 口径
	if s.VerifyPassword("") || s.VerifyPassword("x") {
		t.Errorf("empty configured password must fail-closed")
	}
}
