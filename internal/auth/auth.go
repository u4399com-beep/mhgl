// ============================================================
// 后台管理员鉴权 — src/lib/auth.ts 逐语义移植(单管理员模型)
//
//	Cookie: heis_admin = base64url({exp,nonce}).base64url(HMAC_SHA256(payload, secret))
//	会话 12h; 校验 = 重算 HMAC + 等长短路 + constant-time 比较 + exp 检查
//	+ payload 仅允许 {exp,nonce} 两键 + nonce 必须 32 位 hex(R3-32 防御深度)
//	登录限流: 每 IP 60s 滑窗 5 次, Map 容量 1 万 FIFO 淘汰 + 5min 周期清扫(R3-31)
//	dev 缺省密码 audit-fix-2025 / secret heis-session-secret-fixed-2025(与原实现同源);
//	生产(GO_ENV=production)缺失一律 fail-closed。
//
// ============================================================
package auth

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"
)

const (
	CookieName       = "heis_admin"
	sessionMaxAge    = 12 * time.Hour
	maxLoginAttempts = 5
	loginWindow      = time.Minute
	maxLoginMap      = 10_000
	loginSweepEvery  = 5 * time.Minute
	// DefaultPassword 编译期缺省(仅 dev 生效; 与原 auth.ts 同源公开值)
	DefaultPassword = "audit-fix-2025"
	defaultSecret   = "heis-session-secret-fixed-2025"
)

var nonceRe = regexp.MustCompile(`^[0-9a-f]{32}$`)

// Service 鉴权服务(密码/密钥启动期固化; 生产缺失 → 恒拒绝)。
type Service struct {
	password string
	secret   string
	isProd   bool

	mu      sync.Mutex
	attempt map[string]*attemptEntry
}

type attemptEntry struct {
	count   int
	firstAt time.Time
}

func NewService(password, secret string, isProd bool) *Service {
	return &Service{
		password: password,
		secret:   secret,
		isProd:   isProd,
		attempt:  make(map[string]*attemptEntry),
	}
}

// PreviewHintPassword 仅 dev 且生效密码恰为公开缺省值时回显(对齐 preview-hint 通道)。
func (s *Service) PreviewHintPassword() string {
	if s.isProd || s.password == "" || s.password != DefaultPassword {
		return ""
	}
	return DefaultPassword
}

// VerifyPassword constant-time 密码校验。
func (s *Service) VerifyPassword(pw string) bool {
	if s.password == "" {
		return false // fail-closed
	}
	a := []byte(pw)
	b := []byte(s.password)
	if len(a) != len(b) {
		subtle.ConstantTimeCompare(a, a) // 等长消耗对齐
		return false
	}
	return subtle.ConstantTimeCompare(a, b) == 1
}

func (s *Service) sign(payload string) string {
	mac := hmac.New(sha256.New, []byte(s.secret))
	mac.Write([]byte(payload))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

// IssueSession 签发会话并写入 Set-Cookie; secret 缺失(生产)返回错误。
func (s *Service) IssueSession() (string, error) {
	if s.secret == "" {
		return "", fmt.Errorf("auth: SESSION_SECRET 未配置(fail-closed)")
	}
	nonce := make([]byte, 16)
	if _, err := rand.Read(nonce); err != nil {
		return "", err
	}
	payloadBytes, _ := json.Marshal(map[string]any{
		"exp":   time.Now().Add(sessionMaxAge).UnixMilli(),
		"nonce": fmt.Sprintf("%x", nonce),
	})
	payload := base64.RawURLEncoding.EncodeToString(payloadBytes)
	token := payload + "." + s.sign(payload)
	return cookieHeader(CookieName, token, int(sessionMaxAge.Seconds())), nil
}

// ClearSession 注销 Cookie(Expires+Max-Age 双保险, 对齐 R3-33)。
// [R56-2b-fix] 修前传 maxAge=0 —— Go http.Cookie 语义中 MaxAge==0 表示「不输出
// Max-Age 属性」, 实际 Set-Cookie 只有手动追加的 Expires; 改传 -1 显式产出
// Max-Age=0, 与 TS clearSessionCookie 的双保险口径逐字对齐。
func (s *Service) ClearSession() string {
	return cookieHeader(CookieName, "", -1) + "; Expires=Thu, 01 Jan 1970 00:00:00 GMT"
}

func cookieHeader(name, val string, maxAge int) string {
	h := &http.Cookie{
		Name:     name,
		Value:    val,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   maxAge,
	}
	if s := secureAttr; s != "" {
		return h.String() + "; " + s
	}
	return h.String()
}

// secureAttr 生产下追加 Secure(dev 保持与原实现一致不带)。
var secureAttr = ""

// VerifySession 校验 Cookie 值; 成功 true。
func (s *Service) VerifySession(cookieValue string) bool {
	if cookieValue == "" || s.secret == "" {
		return false
	}
	payload, mac, ok := strings.Cut(cookieValue, ".")
	if !ok || payload == "" || mac == "" {
		return false
	}
	expected := s.sign(payload)
	if subtle.ConstantTimeCompare([]byte(expected), []byte(mac)) != 1 {
		return false
	}
	raw, err := base64.RawURLEncoding.DecodeString(payload)
	if err != nil {
		return false
	}
	var parsed map[string]json.RawMessage
	if err := json.Unmarshal(raw, &parsed); err != nil || parsed == nil {
		return false
	}
	if len(parsed) != 2 {
		return false // 仅允许 {exp,nonce}
	}
	var exp int64
	if err := json.Unmarshal(parsed["exp"], &exp); err != nil || exp <= 0 {
		return false
	}
	if time.Now().UnixMilli() > exp {
		return false
	}
	var nonce string
	if err := json.Unmarshal(parsed["nonce"], &nonce); err != nil || !nonceRe.MatchString(nonce) {
		return false
	}
	return true
}

// Check 便捷判断请求是否携带有效会话。
func (s *Service) Check(r *http.Request) bool {
	c, err := r.Cookie(CookieName)
	if err != nil {
		return false
	}
	return s.VerifySession(c.Value)
}

// ---------------- 登录限流 ----------------

func (s *Service) ConsumeAttempt(ip string) bool {
	now := time.Now()
	s.mu.Lock()
	defer s.mu.Unlock()
	e, ok := s.attempt[ip]
	if !ok || now.Sub(e.firstAt) > loginWindow {
		if len(s.attempt) >= maxLoginMap { // FIFO 淘汰最旧
			var oldestKey string
			var oldest time.Time
			first := true
			for k, v := range s.attempt {
				if first || v.firstAt.Before(oldest) {
					oldestKey, oldest, first = k, v.firstAt, false
				}
			}
			delete(s.attempt, oldestKey)
		}
		s.attempt[ip] = &attemptEntry{count: 1, firstAt: now}
		return true
	}
	if e.count >= maxLoginAttempts {
		return false
	}
	e.count++
	return true
}

// RetryAfterSec 限流剩余秒数(Retry-After 头)。
func (s *Service) RetryAfterSec(ip string) int {
	s.mu.Lock()
	defer s.mu.Unlock()
	e, ok := s.attempt[ip]
	if !ok {
		return 0
	}
	rem := loginWindow - time.Since(e.firstAt)
	if rem <= 0 {
		return 0
	}
	return int(rem.Seconds()) + 1
}

// ClearAttempts 登录成功后清计数。
func (s *Service) ClearAttempts(ip string) {
	s.mu.Lock()
	delete(s.attempt, ip)
	s.mu.Unlock()
}

// StartSweeper 周期清扫过期限流条目(惰性: main 启动时挂载一次)。
func (s *Service) StartSweeper(stop <-chan struct{}) {
	go func() {
		t := time.NewTicker(loginSweepEvery)
		defer t.Stop()
		for {
			select {
			case <-stop:
				return
			case now := <-t.C:
				s.mu.Lock()
				for k, e := range s.attempt {
					if now.Sub(e.firstAt) > loginWindow {
						delete(s.attempt, k)
					}
				}
				s.mu.Unlock()
			}
		}
	}()
}
