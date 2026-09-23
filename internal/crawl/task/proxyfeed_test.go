// ============================================================
// DB 代理池接线单测(R57-2a) — task 侧动态代理刷新
//
//	① 注入: 源返回地址 → fetch 池增长 ② 空结果不清空 ③ 源错误不清空沿用现有池
//	④ 合并去重(重复拉取零增长) ⑤ 刷新循环随任务 ctx 取消退出
//
// ============================================================
package task

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"mhgl/internal/crawl/callback"
	"mhgl/internal/crawl/fetch"
	"mhgl/internal/crawl/rule"
)

// fakeProxySource 假动态代理源(可编程返回值/调用计数)
type fakeProxySource struct {
	mu     sync.Mutex
	addrs  []string
	err    error
	called int
}

func (f *fakeProxySource) AliveProxyAddrs(int) ([]string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.called++
	if f.err != nil {
		return nil, f.err
	}
	return f.addrs, nil
}

func (f *fakeProxySource) set(addrs []string, err error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.addrs, f.err = addrs, err
}

// noopSink 静默回调面(pullDynamicProxies 的 logf 需要非 nil cb)
type noopSink struct{}

func (noopSink) Log(context.Context, string, string) error             { return nil }
func (noopSink) Status(context.Context, string, string) error          { return nil }
func (noopSink) Stats(context.Context, callback.StatsPayload) error    { return nil }
func (noopSink) SendProgress(context.Context, interface{}, bool) error { return nil }
func (noopSink) Book(context.Context, callback.BookPayload) (callback.BookDecision, error) {
	return callback.BookDecision{}, nil
}
func (noopSink) Chapters(context.Context, callback.ChaptersPayload) (callback.ChaptersDecision, error) {
	return callback.ChaptersDecision{NeedURLs: []string{}}, nil
}
func (noopSink) Contents(context.Context, callback.ContentsPayload) error { return nil }
func (noopSink) Cover(context.Context, callback.CoverPayload) error       { return nil }

// newProxyFeedTask 构造带假源的最小 Task(不走 Manager.Start 全链)
func newProxyFeedTask(t *testing.T, src fetch.ProxyAddrSource) *Task {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	tk := &Task{
		ID:          "t-proxyfeed",
		mgr:         NewManager(),
		ctx:         ctx,
		cancel:      cancel,
		exitCh:      make(chan struct{}),
		fetcher:     fetch.New(rule.FetchConfig{Engine: "http", Timeout: 1000}),
		cb:          noopSink{},
		proxySource: src,
	}
	return tk
}

func TestPullDynamicProxiesInjectAndNoClear(t *testing.T) {
	src := &fakeProxySource{}
	tk := newProxyFeedTask(t, src)

	// ① 注入
	src.set([]string{"http://10.0.0.1:8080", "socks5://10.0.0.2:1080", "10.0.0.3:3128"}, nil)
	tk.pullDynamicProxies()
	if got := tk.fetcher.ProxyCount(); got != 3 {
		t.Fatalf("注入后池=%d, want 3", got)
	}
	// ② 空结果不清空(只增不减防抖)
	src.set(nil, nil)
	tk.pullDynamicProxies()
	if got := tk.fetcher.ProxyCount(); got != 3 {
		t.Fatalf("空结果后池=%d, want 3(空池不清空)", got)
	}
	// ③ 源错误不清空沿用现有池
	src.set(nil, errors.New("db busy"))
	tk.pullDynamicProxies()
	if got := tk.fetcher.ProxyCount(); got != 3 {
		t.Fatalf("源错误后池=%d, want 3", got)
	}
	// ④ 合并去重: 增 1 新条目
	src.set([]string{"http://10.0.0.1:8080", "http://10.0.0.9:9999"}, nil)
	tk.pullDynamicProxies()
	if got := tk.fetcher.ProxyCount(); got != 4 {
		t.Fatalf("合并去重后池=%d, want 4", got)
	}
}

func TestDynamicProxyLoopExitsOnCtxCancel(t *testing.T) {
	src := &fakeProxySource{}
	src.set([]string{"http://10.0.0.1:8080"}, nil)
	tk := newProxyFeedTask(t, src)
	done := make(chan struct{})
	go func() {
		tk.dynamicProxyLoop()
		close(done)
	}()
	// 首拉完成(调用计数 ≥1)后取消 ctx, 循环必须退出
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		src.mu.Lock()
		n := src.called
		src.mu.Unlock()
		if n >= 1 {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	tk.cancel()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatalf("dynamicProxyLoop 未随任务 ctx 取消退出(协程泄漏)")
	}
}
