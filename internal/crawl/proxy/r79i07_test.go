// ============================================================
// [R79-i07] proxy 质检与淘汰深审回归 — 记分牌跨轮语义钉死:
//
//	① stale 模式 NULLs-first 入选序(未验积压优先于活代理复验 —— 设计语义钉死,
//	  防未来无意识漂移; 饥饿面审读留痕: 39k 未验积压 @150/30min ≈ 5.4 天排干,
//	  期间 alive 行复验延迟由 fetch 回写泵补偿, 见 i07 审读结论)
//	② 成功续命钳顶: healthScore+15 上限 100(修前无回归覆盖 >85 分复验形态)
//	③ 失败记账衰减: healthScore×0.3 下取整 + failCount 累加
//
// ============================================================
package proxy

import (
	"context"
	"net"
	"testing"
	"time"
)

func TestR79i07_ScoreboardAcrossStaleRounds(t *testing.T) {
	db := openTestDB(t)
	fake := newFakeHTTPProxy(t)
	fake2 := newFakeHTTPProxy(t)
	// 死端口: 监听后立即关闭(TestCheckHTTPProxyAliveAndDead 同款)
	ln, _ := net.Listen("tcp", "127.0.0.1:0")
	deadHost, deadPort := hostOf(ln.Addr().String()), portOf(ln.Addr().String())
	_ = ln.Close()

	now := time.Now().UnixMilli()
	// A: 活代理 95 分(钳顶形态) / B: 死代理 10 分(衰减形态) / C: 未验行(NULLs-first 形态)
	seed := func(q string, args ...interface{}) {
		t.Helper()
		if _, err := db.Exec(q, args...); err != nil {
			t.Fatalf("seed: %v", err)
		}
	}
	seed(`INSERT INTO "FreeProxy" (id, protocol, host, port, alive, healthScore, successCount, lastCheckedAt, lastSuccessAt, createdAt, updatedAt)
		VALUES ('c-a', 'http', ?, ?, 1, 95, 3, ?, ?, ?, ?)`,
		hostOf(fake.URL), portOf(fake.URL), now-2*3600e3, now-3600e3, now, now)
	seed(`INSERT INTO "FreeProxy" (id, protocol, host, port, alive, healthScore, failCount, lastCheckedAt, lastError, createdAt, updatedAt)
		VALUES ('c-b', 'http', ?, ?, 0, 10, 1, ?, 'old-err', ?, ?)`,
		deadHost, deadPort, now-3600e3, now, now)
	seed(`INSERT INTO "FreeProxy" (id, protocol, host, port, createdAt, updatedAt)
		VALUES ('c-c', 'http', ?, ?, ?, ?)`,
		hostOf(fake2.URL), portOf(fake2.URL), now, now)

	h := NewHarvester(db)
	h.probeURL = "http://ip-api.com/json/"

	// ① stale limit=1: NULLs-first —— 未验行 C 必然先于已验 A/B 入选
	res1, err := h.Check(context.Background(), CheckOptions{Mode: "stale", Limit: 1})
	if err != nil {
		t.Fatalf("check1: %v", err)
	}
	if res1.Checked != 1 {
		t.Fatalf("res1.checked = %d, want 1", res1.Checked)
	}
	var cSucc int
	if err := db.QueryRow(`SELECT successCount FROM "FreeProxy" WHERE id='c-c'`).Scan(&cSucc); err != nil {
		t.Fatalf("scan c: %v", err)
	}
	if cSucc != 1 {
		t.Fatalf("stale NULLs-first 失效: C(successCount=%d) 未被首选, 入选了已验行", cSucc)
	}

	// ②③ 全量 stale 复验: A 钳顶 100(非 110) / B 衰减 3(10×0.3) 且 failCount=2
	if _, err := h.Check(context.Background(), CheckOptions{Mode: "stale", Limit: 10, Concurrency: 4}); err != nil {
		t.Fatalf("check2: %v", err)
	}
	var aScore, aSucc int
	if err := db.QueryRow(`SELECT healthScore, successCount FROM "FreeProxy" WHERE id='c-a'`).Scan(&aScore, &aSucc); err != nil {
		t.Fatalf("scan a: %v", err)
	}
	if aScore != 100 || aSucc != 4 {
		t.Fatalf("A 钳顶失效: score=%d(want 100) success=%d(want 4)", aScore, aSucc)
	}
	var bScore, bFail, bAlive int
	if err := db.QueryRow(`SELECT healthScore, failCount, alive FROM "FreeProxy" WHERE id='c-b'`).Scan(&bScore, &bFail, &bAlive); err != nil {
		t.Fatalf("scan b: %v", err)
	}
	if bScore != 3 || bFail != 2 || bAlive != 0 {
		t.Fatalf("B 衰减失效: score=%d(want 3) fail=%d(want 2) alive=%d(want 0)", bScore, bFail, bAlive)
	}
}
