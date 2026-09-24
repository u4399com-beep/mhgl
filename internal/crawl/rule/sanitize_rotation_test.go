// ============================================================
// [R63-c] Sanitize 轮换形态归一单测
//
//	修前 "" 被强改 "round-robin", 使 fetch.pickProxy 文档声明的缺省加权随机
//	(R58-2a, 成功计数为权; TS 语义权威 undefined/缺省=随机形态)在所有经
//	Sanitize 的生产路径(任务启动/TestRule)永不生效 —— 纯轮换劫持缺省。
//	修后缺省("")保留, 别名归一, 未知显式值回退历史纯轮换。
//
// ============================================================
package rule

import "testing"

func TestSanitizeProxyRotationDefault(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		{"", ""},                       // 缺省保留 → 引擎侧加权随机(R58-2a 缺省形态)
		{"random", "random"},           // 显式均匀随机保留
		{"roundrobin", "round-robin"},  // 无横线别名归一
		{"round-robin", "round-robin"}, // 历史纯轮换保留
		{"least-used", "least-used"},   // 形状保留(现行由加权缺省承接)
		{"sticky-host", "sticky-host"}, // 形状保留(现行由加权缺省承接)
		{"fifo", "round-robin"},        // 未知显式值 → 历史纯轮换
		{"RANDOM", "round-robin"},      // 大小写敏感白名单 → 未知值回退(与修前口径一致)
	}
	for _, c := range cases {
		rc := RuleConfig{Fetch: FetchConfig{ProxyRotation: c.in, Timeout: 5000}}
		rc.Sanitize()
		if got := rc.Fetch.ProxyRotation; got != c.want {
			t.Errorf("ProxyRotation %q → %q, want %q", c.in, got, c.want)
		}
	}
}
