// ============================================================
// DB 代理池接线(R57-2a) — 任务级动态代理刷新循环
//
//	启动即拉一次(消除「池有代理、采集不用」缺口: 静态 cfg.ProxyURL 为空时任务
//	也能即刻用上 DB 池), 运行期每 proxyRefreshEvery 重拉一次; 任务 ctx 取消即退出。
//	只增不减: pullDynamicProxies → fetch.Client.SetDynamicProxies 合并去重,
//	空结果/查询失败不清空现有池(防抖, DB 侧抖动不应导致采集裸奔直连)
//
// ============================================================
package task

import (
	"time"
)

const (
	// proxyPullLimit 单次拉取的存活代理条数上限(store.AliveProxyAddrs 健康分降序取头;
	// 免费代理实际可用率低, 64 条轮换足够摊薄单点故障, 无需整池注入)
	proxyPullLimit = 64
	// proxyRefreshEvery 运行期重拉周期(任务书 ~30min 口径)
	proxyRefreshEvery = 30 * time.Minute
)

// dynamicProxyLoop 动态代理刷新循环(任务启动时由 newTask 派生; ctx 取消即退出)。
// 立即首拉 + Ticker 周期拉; pause 不取消 ctx, 暂停期间仍保持刷新(恢复即用新池)
func (t *Task) dynamicProxyLoop() {
	t.pullDynamicProxies()
	ticker := time.NewTicker(proxyRefreshEvery)
	defer ticker.Stop()
	for {
		select {
		case <-t.ctx.Done():
			return
		case <-ticker.C:
			t.pullDynamicProxies()
		}
	}
}

// pullDynamicProxies 单次拉取+合并注入(错误静默留痕不中断任务; 空结果 no-op)
func (t *Task) pullDynamicProxies() {
	if t.proxySource == nil || t.fetcher == nil {
		return
	}
	addrs, err := t.proxySource.AliveProxyAddrs(proxyPullLimit)
	if err != nil {
		t.logf("warn", "动态代理池拉取失败(沿用现有池): %v", err)
		return
	}
	if len(addrs) == 0 {
		return // 空结果不清空现有池(只增不减防抖)
	}
	if n := t.fetcher.SetDynamicProxies(addrs); n > 0 {
		t.logf("info", "代理池注入 %d 条动态代理(池内现 %d 条)", n, t.fetcher.ProxyCount())
	}
}
