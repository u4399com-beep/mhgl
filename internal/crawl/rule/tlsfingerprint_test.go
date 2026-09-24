// ============================================================
// fetch.tlsFingerprint 配置解析/消毒单测 — R63-b
// ============================================================
package rule

import (
	"encoding/json"
	"testing"
)

// TestSanitizeFetchConfigTLSFingerprint 枚举白名单: 仅 chrome 开启;
// 空/none/未知值归零关闭(大小写/空白归一)
func TestSanitizeFetchConfigTLSFingerprint(t *testing.T) {
	cases := []struct{ in, want string }{
		{"", ""},
		{"none", ""},
		{"chrome", "chrome"},
		{" Chrome ", "chrome"},
		{"CHROME", "chrome"},
		{"firefox", ""},
		{"curl", ""},
		{"chrome\n", "chrome"}, // 尾随空白容忍归一(TrimSpace), 仍过白名单
		{"\tchrome", "chrome"},
	}
	for _, tc := range cases {
		rc := RuleConfig{Fetch: FetchConfig{Engine: "http", Timeout: 20000, TLSFingerprint: tc.in}}
		rc.Sanitize()
		if rc.Fetch.TLSFingerprint != tc.want {
			t.Fatalf("TLSFingerprint %q → %q, want %q", tc.in, rc.Fetch.TLSFingerprint, tc.want)
		}
	}
}

// TestTLSFingerprintJSONRoundTrip 全链流转形态: 规则 config JSON 反序列化 →
// Sanitize → 字段保留(任务启动 buildPayload 与 TestRule 同走该路径, 引擎/任务侧
// 整结构体传递零改动)
func TestTLSFingerprintJSONRoundTrip(t *testing.T) {
	const js = `{"list":{"enabled":true,"fields":{}},"book":{"fields":{}},"toc":{"fields":{}},"content":{"fields":{}},"fetch":{"engine":"http","timeout":20000,"tlsFingerprint":"chrome"},"clean":{}}`
	var rc RuleConfig
	if err := json.Unmarshal([]byte(js), &rc); err != nil {
		t.Fatalf("JSON 解析: %v", err)
	}
	rc.Sanitize()
	if rc.Fetch.TLSFingerprint != "chrome" {
		t.Fatalf("JSON 流转后 TLSFingerprint = %q, want chrome", rc.Fetch.TLSFingerprint)
	}
	// 未携带字段的旧规则 JSON: 零值 → 消毒后保持关闭(兼容回归)
	var rc2 RuleConfig
	if err := json.Unmarshal([]byte(`{"fetch":{"engine":"http","timeout":20000}}`), &rc2); err != nil {
		t.Fatalf("JSON 解析: %v", err)
	}
	rc2.Sanitize()
	if rc2.Fetch.TLSFingerprint != "" {
		t.Fatalf("旧规则缺字段 TLSFingerprint = %q, want 空", rc2.Fetch.TLSFingerprint)
	}
}
