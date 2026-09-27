// ============================================================
// 代理结果回写泵(R57-2a DB 代理池接线, R58-2a healthScore 增量记账, engine 装配点)
//
//	    fetch.Client.ProxyFeedback → 有界队列 → 单 worker 轻量 UPDATE:
//	      - 成功事实 → lastUsedAt/updatedAt 刷新 + healthScore=MIN(healthScore+1,100)
//	      - 连败≥3 事实 → alive=0 + healthScore=MAX(healthScore-5,0)
//	        (连败达 3 起每败报一次, 增量 -5 从第 3 连败起累计; 零星单败不报不扣分)
//	    异步防阻塞: 队列满即丢弃(best-effort); DB 失败静默(记账面不反噬采集)。
//	    仅按 "protocol://host:port" 定位行, 静态 cfg 代理不在 FreeProxy 表时 0 行受影响(无害)。
//
//	[R58-2a] healthScore 记账口径区分(勿混): 本泵是「使用事实增量语义」(采集流量
//	实证, ±小步): 成功 +1 钳 100 / 失败 -5 钳 0; proxy.Check 校验器是「探针全量语义」
//	(校验时刻读行重算 +15/×0.3, 连 alive/latency/匿名度整行覆写)。两者各自独立读写
//	DB 行, 无共享中间态; 回写泵把 alive=0 后的条目交给 stale 周期校验复活, 复活即
//	校验器全量重置分值 —— 两语义互斥不打架
//
// ============================================================
package crawl

import (
	"net/url"
	"strconv"
	"strings"

	"mhgl/internal/crawl/fetch"
	"mhgl/internal/store"
)

// countryAwareProxySource 同时满足基础源与国别过滤能力接口(编译期断言)
var (
	_ fetch.ProxyAddrSource            = countryAwareProxySource{}
	_ fetch.CountryFilteredProxySource = countryAwareProxySource{}
)

// proxyFeedbackQueueCap 回写队列容量(满即丢: 记账 best-effort, 宁丢不阻塞采集热路径)
const proxyFeedbackQueueCap = 512

type proxyFeedbackEvent struct {
	protocol string
	host     string
	port     string
	ok       bool
}

type proxyFeedbackSink struct {
	db *store.DB
	ch chan proxyFeedbackEvent
}

// newProxyFeedbackSink 构造回写泵并启动 worker, 返回可直接赋给
// task.Manager.SetProxyFeedback 的非阻塞钩子
func newProxyFeedbackSink(db *store.DB) func(addr string, ok bool) {
	s := &proxyFeedbackSink{db: db, ch: make(chan proxyFeedbackEvent, proxyFeedbackQueueCap)}
	go s.drain()
	return s.push
}

// push 解析代理串并入队(解析失败静默丢; 队列满静默丢)
func (s *proxyFeedbackSink) push(addr string, ok bool) {
	u, err := url.Parse(addr)
	if err != nil || u.Hostname() == "" || u.Port() == "" {
		return
	}
	proto := u.Scheme
	if proto == "socks5h" {
		proto = "socks5" // store 侧同口径归一
	}
	if proto != "http" && proto != "https" && proto != "socks4" && proto != "socks5" {
		return
	}
	ev := proxyFeedbackEvent{protocol: proto, host: u.Hostname(), port: u.Port(), ok: ok}
	select {
	case s.ch <- ev:
	default: // 队列满丢弃(防阻塞采集热路径)
	}
}

// drain worker: 逐事件轻量 UPDATE(成功刷时+健康分增, 失败枪毙+健康分减, 同一条 UPDATE;
// 失败静默)。MIN/MAX 在 SQL 层钳界(上限 100/下限 0), 不依赖读-改-写免竞态
func (s *proxyFeedbackSink) drain() {
	for ev := range s.ch {
		now := store.NowMS()
		var err error
		if ev.ok {
			// [R58-2a] 增量语义: 每次经代理成功 → healthScore+1(钳 100)
			_, err = s.db.Exec(`UPDATE "FreeProxy" SET lastUsedAt=?, updatedAt=?,
                                healthScore=MIN(healthScore+1, 100) WHERE protocol=? AND host=? AND port=?`,
				now, now, ev.protocol, ev.host, ev.port)
		} else {
			// [R58-2a] 增量语义: 连败≥3 报死 → alive=0 + healthScore-5(钳 0;
			// stale 周期校验复活时由校验器全量重置, 见文件头口径区分)
			_, err = s.db.Exec(`UPDATE "FreeProxy" SET alive=0, updatedAt=?,
                                healthScore=MAX(healthScore-5, 0) WHERE protocol=? AND host=? AND port=?`,
				now, ev.protocol, ev.host, ev.port)
		}
		_ = err // 失败静默(记账 best-effort; 下轮 stale 校验自愈)
	}
}

// ---------------- [R76-a] 国别过滤代理源适配器 ----------------

// countryAwareProxySource [R76-a] proxyCountries 活性化装配适配器: *store.DB 原生只
// 暴露 AliveProxyAddrs(fetch.ProxyAddrSource), 规则键 fetch.proxyCountries 需要按
// 国别过滤拉取 —— 本适配器经 store.QueryMaps(只读, 零 store 侧改动)补齐
// fetch.CountryFilteredProxySource 能力面。FreeProxy.country 为校验器 ip-api 实测
// 出口国别(收割源标国别仅在未校验行上作预填)。
// 装配点: engine.NewManager → mgr.SetProxySource(countryAwareProxySource{db})
type countryAwareProxySource struct {
	db *store.DB
}

// AliveProxyAddrs 基础接口透传(全量健康分降序, 未声明 proxyCountries 的任务走此臂)
func (s countryAwareProxySource) AliveProxyAddrs(limit int) ([]string, error) {
	return s.db.AliveProxyAddrs(limit)
}

// AliveProxyAddrsForCountries 国别过滤拉取([R76-a]): alive=1 AND healthScore>0
// (与 AliveProxyAddrs 同一存活门) AND country IN(...) 健康分降序。
// 国别码白名单消毒(2 字母大写; 占位符查询防注入); 全非法/空输入返回空切片(不过滤
// 语义由 task 侧 parseProxyCountries 保证不会走到这里)
func (s countryAwareProxySource) AliveProxyAddrsForCountries(limit int, countries []string) ([]string, error) {
	if limit <= 0 {
		limit = 64
	}
	ccs := make([]string, 0, len(countries))
	seen := map[string]struct{}{}
	for _, c := range countries {
		c = strings.ToUpper(strings.TrimSpace(c))
		if len(c) != 2 {
			continue
		}
		if _, dup := seen[c]; dup {
			continue
		}
		seen[c] = struct{}{}
		ccs = append(ccs, c)
		if len(ccs) >= 16 { // 国别集合有界(规则消毒 100 字符本就装不下 16 个)
			break
		}
	}
	if len(ccs) == 0 {
		return []string{}, nil
	}
	ph := strings.TrimSuffix(strings.Repeat("?,", len(ccs)), ",")
	args := make([]interface{}, 0, len(ccs)+1)
	for _, c := range ccs {
		args = append(args, c)
	}
	args = append(args, limit)
	maps, err := s.db.QueryMaps(`SELECT protocol, host, port FROM "FreeProxy"
                WHERE alive=1 AND healthScore>0 AND country IN (`+ph+`)
                ORDER BY healthScore DESC, lastCheckedAt DESC LIMIT ?`, args...)
	if err != nil {
		return nil, err
	}
	out := make([]string, 0, len(maps))
	for _, m := range maps {
		proto := store.ToStr(m["protocol"])
		host := store.ToStr(m["host"])
		port := store.ToInt(m["port"])
		if proto == "" || host == "" || port <= 0 || port > 65535 {
			continue
		}
		if proto == "socks5h" {
			proto = "socks5" // fetch 层同口径归一
		}
		if proto != "http" && proto != "https" && proto != "socks4" && proto != "socks5" {
			continue
		}
		out = append(out, proto+"://"+host+":"+strconv.FormatInt(int64(port), 10))
	}
	return out, nil
}
