// ============================================================
// 回调客户端测试 — [R54-2a](R53 遗留②) lastError "%!w(<nil>)" 格式瑕疵回归
//
//	根因: send() 重试循环内 `lastErr = err` 读到 if 作用域外层 json.Marshal 的
//	err(恒 nil) → 重试耗尽后 %w(nil) 产出 %!w(<nil>), 真实失败原因丢失。
//	回归锚: ①重试耗尽错误消息必须携带真实末次失败原因(不得含 %!w 格式串)
//	        ②先败后成的重试成功路径返回 nil(与既有重试语义一致)
//	        ③4xx(除 429) 快速失败路径消息同样真实
//
// ============================================================
package callback

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

// withFastRetries 重试退避压缩到毫秒级(测试提速; retryDelays 为包级 var, 用后还原)
func withFastRetries(t *testing.T) {
	t.Helper()
	old := retryDelays
	retryDelays = []time.Duration{time.Millisecond, time.Millisecond, time.Millisecond}
	t.Cleanup(func() { retryDelays = old })
}

// TestSendRetryExhaustedKeepsRealError 重试耗尽路径: 错误消息必须携带真实末次失败
// 原因("HTTP 500: ..."), 修前为 "回调失败(kind=contents, 已重试 3 次): %!w(<nil>)"
// (lastError 残留该串, 真实原因丢失)
func TestSendRetryExhaustedKeepsRealError(t *testing.T) {
	withFastRetries(t)
	var hits atomic.Int64
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		http.Error(w, "boom-timeout-simulation", http.StatusInternalServerError)
	}))
	t.Cleanup(srv.Close)

	c := New("t-cb", srv.URL, DefaultSecret)
	err := c.Send(context.Background(), KindContents, map[string]string{"probe": "x"})
	if err == nil {
		t.Fatal("重试耗尽应返回错误")
	}
	if hits.Load() != int64(len(retryDelays)+1) {
		t.Fatalf("应尝试 %d 次, 实际 %d", len(retryDelays)+1, hits.Load())
	}
	msg := err.Error()
	if strings.Contains(msg, "%!w(") || strings.Contains(msg, "%!v(") {
		t.Fatalf("错误消息不得含格式瑕疵串(修前 %%!w(<nil>) 复现点): %q", msg)
	}
	if !strings.Contains(msg, "HTTP 500") || !strings.Contains(msg, "boom-timeout-simulation") {
		t.Fatalf("错误消息应携带真实末次失败原因(HTTP 500 + 响应体摘要): %q", msg)
	}
	if !strings.Contains(msg, "已重试 3 次") {
		t.Fatalf("错误消息应保留重试次数语义: %q", msg)
	}
}

// TestSendRetrySuccessReturnsNil 先败后成(超时/5xx 后重试成功): Send 必须返回 nil
// (不触发调用方 pauseAuto); 回归 R53 生产「contents 回调偶发超时重试成功」路径
func TestSendRetrySuccessReturnsNil(t *testing.T) {
	withFastRetries(t)
	var hits atomic.Int64
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if hits.Add(1) <= 2 {
			http.Error(w, "transient 5xx", http.StatusInternalServerError)
			return
		}
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	t.Cleanup(srv.Close)

	c := New("t-cb", srv.URL, DefaultSecret)
	if err := c.Send(context.Background(), KindContents, map[string]string{"probe": "x"}); err != nil {
		t.Fatalf("第 3 次重试成功应返回 nil: %v", err)
	}
	if hits.Load() != 3 {
		t.Fatalf("应尝试 3 次(2 败 1 成), 实际 %d", hits.Load())
	}
}

// TestSendPermanent4xxFastFail 4xx(除 429) 确定性失败: 首个响应即快速失败不再退避,
// 错误消息携带真实状态码与响应体(不得含格式瑕疵串)
func TestSendPermanent4xxFastFail(t *testing.T) {
	withFastRetries(t)
	var hits atomic.Int64
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		http.Error(w, "secret mismatch", http.StatusForbidden)
	}))
	t.Cleanup(srv.Close)

	c := New("t-cb", srv.URL, "wrong-secret")
	start := time.Now()
	err := c.Send(context.Background(), KindContents, map[string]string{"probe": "x"})
	if err == nil {
		t.Fatal("403 确定性失败应返回错误")
	}
	if el := time.Since(start); el > 500*time.Millisecond {
		t.Fatalf("4xx 应快速失败(不退避重试), 耗时 %v", el)
	}
	if hits.Load() != 1 {
		t.Fatalf("4xx 不可重试应仅 1 次请求, 实际 %d", hits.Load())
	}
	msg := err.Error()
	if strings.Contains(msg, "%!w(") || strings.Contains(msg, "%!v(") {
		t.Fatalf("错误消息不得含格式瑕疵串: %q", msg)
	}
	if !strings.Contains(msg, "HTTP 403") || !strings.Contains(msg, "不可重试") {
		t.Fatalf("错误消息应携带真实状态与不可重试语义: %q", msg)
	}
}

// TestSendWithDecisionExhaustedKeepsRealError SendWithDecision(book/chapters 决策回调)
// 重试耗尽路径同口径: 消息携带真实末次失败原因(该函数修前无遮蔽缺陷, 回归锚防再引入)
func TestSendWithDecisionExhaustedKeepsRealError(t *testing.T) {
	withFastRetries(t)
	var hits atomic.Int64
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		http.Error(w, "decision-callback-down", http.StatusBadGateway)
	}))
	t.Cleanup(srv.Close)

	c := New("t-cb", srv.URL, DefaultSecret)
	if _, err := c.SendWithDecision(context.Background(), KindChapters, map[string]interface{}{}); err == nil {
		t.Fatal("重试耗尽应返回错误")
	} else {
		msg := err.Error()
		if strings.Contains(msg, "%!w(") || strings.Contains(msg, "%!v(") {
			t.Fatalf("错误消息不得含格式瑕疵串: %q", msg)
		}
		if !strings.Contains(msg, "HTTP 502") || !strings.Contains(msg, "decision-callback-down") {
			t.Fatalf("错误消息应携带真实末次失败原因: %q", msg)
		}
	}
	if hits.Load() != int64(len(retryDelays)+1) {
		t.Fatalf("应尝试 %d 次, 实际 %d", len(retryDelays)+1, hits.Load())
	}
}
