// ============================================================
// DB 代理池接线(R57-2a) — 任务级动态代理刷新循环
//
//	启动即拉一次(消除「池有代理、采集不用」缺口: 静态 cfg.ProxyURL 为空时任务
//	也能即刻用上 DB 池), 运行期每 proxyRefreshEvery 重拉一次; 任务 ctx 取消即退出。
//	只增不减: pullDynamicProxies → fetch.Client.SetDynamicProxies 合并去重,
//	空结果/查询失败不清空现有池(防抖, DB 侧抖动不应导致采集裸奔直连)
//
//	[R76-a] 规则键 fetch.proxyCountries 活性化(修前死键: 解析后零消费点):
//	规则声明国别时按国别过滤拉取(源实现 fetch.CountryFilteredProxySource 能力接口,
//	engine 装配 countryAwareProxySource 适配器); 过滤后空池不回退全量(非目标国
//	代理对「需国内 IP」类站点无效且白烧重试链), 维持直连并 warn 留痕。
//	[R76-a] 失败降级接线: fetch.Client.ProxyPoolExhausted(直连网络层失败, fetch
//	侧节流) → pullDynamicProxies 即时重拉, 重试链下一 attempt 经 pickProxy 切代理
//
// ============================================================
package task

import (
	"strings"
	"time"
	"unicode"

	"mhgl/internal/crawl/fetch"
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

// pullDynamicProxies 单次拉取+合并注入(错误静默留痕不中断任务; 空结果 no-op)。
// [R76-a] 规则声明 proxyCountries 时优先走国别过滤拉取(源支持能力接口时)
func (t *Task) pullDynamicProxies() {
	if t.proxySource == nil || t.fetcher == nil {
		return
	}
	countries := parseProxyCountries(t.ruleC.Fetch.ProxyCountries)
	var (
		addrs    []string
		err      error
		filtered bool
	)
	if len(countries) > 0 {
		if cs, ok := t.proxySource.(fetch.CountryFilteredProxySource); ok {
			filtered = true
			addrs, err = cs.AliveProxyAddrsForCountries(proxyPullLimit, countries)
		} else {
			// 源不支持国别过滤(测试假源/未升级装配方): 单次 warn 后回退全量拉取
			// (配置不静默失效; 生产装配 countryAwareProxySource 恒走过滤臂)
			if t.pcWarned.CompareAndSwap(false, true) {
				t.logf("warn", "fetch.proxyCountries=%s 已配置但代理源不支持国别过滤, 回退全量拉取(请核查引擎装配)", strings.Join(countries, ","))
			}
			addrs, err = t.proxySource.AliveProxyAddrs(proxyPullLimit)
		}
	} else {
		addrs, err = t.proxySource.AliveProxyAddrs(proxyPullLimit)
	}
	if err != nil {
		t.logf("warn", "动态代理池拉取失败(沿用现有池): %v", err)
		return
	}
	// [R76-a] 国别过滤后空池: 不回退全量 —— 非目标国代理对声明国别的规则无效
	// (需国内 IP 站点走境外代理恒 EOF/403), 注入只会白烧重试链与代理健康分;
	// 维持直连(缺省保守)并留痕供操作员知情(免费池 CN 存量实测≈0, 常态即此臂)
	if filtered && len(addrs) == 0 {
		if t.pcEmptyWarned.CompareAndSwap(false, true) {
			t.logf("warn", "proxyCountries=%s 过滤后代理池为空(可用目标国代理不足), 本轮维持直连", strings.Join(countries, ","))
		}
		return
	}
	if len(addrs) == 0 {
		return // 空结果不清空现有池(只增不减防抖)
	}
	if n := t.fetcher.SetDynamicProxies(addrs); n > 0 {
		if filtered {
			t.logf("info", "代理池注入 %d 条动态代理(国别=%s, 池内现 %d 条)", n, strings.Join(countries, ","), t.fetcher.ProxyCount())
		} else {
			t.logf("info", "代理池注入 %d 条动态代理(池内现 %d 条)", n, t.fetcher.ProxyCount())
		}
	}
}

// parseProxyCountries 规则 proxyCountries 串 → 国别码清单([R76-a] 消费点):
// 逗号/分号/空白分隔, 大写归一, 仅收 2 字母 ISO alpha-2 码, 去重保序;
// 空串/全非法 → nil(不过滤, 全量拉取)
func parseProxyCountries(s string) []string {
	fields := strings.FieldsFunc(s, func(r rune) bool { return r == ',' || r == ';' || unicode.IsSpace(r) })
	out := make([]string, 0, len(fields))
	seen := map[string]struct{}{}
	for _, f := range fields {
		cc := strings.ToUpper(strings.TrimSpace(f))
		if len(cc) != 2 || cc[0] < 'A' || cc[0] > 'Z' || cc[1] < 'A' || cc[1] > 'Z' {
			continue
		}
		if _, dup := seen[cc]; dup {
			continue
		}
		seen[cc] = struct{}{}
		out = append(out, cc)
	}
	if len(out) == 0 {
		return nil
	}
	return out
}
