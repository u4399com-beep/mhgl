// ============================================================
// 代理结果回写泵(R57-2a DB 代理池接线, engine 装配点)
//
//	fetch.Client.ProxyFeedback → 有界队列 → 单 worker 轻量 UPDATE:
//	  - 成功事实 → lastUsedAt/updatedAt 刷新(健康度面留给收割器的 Check 记账)
//	  - 连败≥3 事实 → alive=0(采集流量证死比探针更快; stale 周期校验可复活)
//	异步防阻塞: 队列满即丢弃(best-effort); DB 失败静默(记账面不反噬采集)。
//	仅按 "protocol://host:port" 定位行, 静态 cfg 代理不在 FreeProxy 表时 0 行受影响(无害)。
//
// ============================================================
package crawl

import (
	"net/url"

	"mhgl/internal/store"
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

// drain worker: 逐事件轻量 UPDATE(两字段最小版; 失败静默)
func (s *proxyFeedbackSink) drain() {
	for ev := range s.ch {
		now := store.NowMS()
		var err error
		if ev.ok {
			_, err = s.db.Exec(`UPDATE "FreeProxy" SET lastUsedAt=?, updatedAt=? WHERE protocol=? AND host=? AND port=?`,
				now, now, ev.protocol, ev.host, ev.port)
		} else {
			_, err = s.db.Exec(`UPDATE "FreeProxy" SET alive=0, updatedAt=? WHERE protocol=? AND host=? AND port=?`,
				now, ev.protocol, ev.host, ev.port)
		}
		_ = err // 失败静默(记账 best-effort; 下轮 stale 校验自愈)
	}
}
