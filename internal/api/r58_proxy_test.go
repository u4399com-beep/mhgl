// ============================================================
// R58-2c — 代理池可观测性 + 定向清理 + 索引覆盖回归
//
//	① proxy-pool GET stats 面板扩展: aliveRate / protocols 分组 / topCountries
//	  top10 / stale(24h 未复检) 存量
//	② DELETE /api/admin/proxy-pool?action=clean 两段式: 无 confirm 仅 COUNT 回报,
//	  confirm=true 才真删(dead 7 天未复检 + neverChecked 3 天未检)。
//	③ store.Open ensureProxyIndexes: 四索引在位 + AliveProxyAddrs 查询形状命中索引。
//
// ============================================================
package api

import (
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"

	"mhgl/internal/auth"
	"mhgl/internal/store"
)

// seedProxyRows 直插代理行(id 唯一由调用方保证); 简化: 只带测试关注列。
func seedProxyRows(t *testing.T, db *store.DB, rows []map[string]any) {
	t.Helper()
	now := store.NowMS()
	for i, r := range rows {
		id, _ := r["id"].(string)
		if id == "" {
			id = "c-r58-" + r["protocol"].(string) + "-" + string(rune('a'+i))
		}
		alive := int64(0)
		if v, ok := r["alive"].(int64); ok {
			alive = v
		}
		hs := int64(0)
		if v, ok := r["healthScore"].(int64); ok {
			hs = v
		}
		lat := any(nil)
		if v, ok := r["latencyMs"].(int64); ok {
			lat = v
		}
		checked := any(nil)
		if v, ok := r["lastCheckedAt"].(int64); ok {
			checked = v
		}
		created := now
		if v, ok := r["createdAt"].(int64); ok {
			created = v
		}
		if _, err := db.Exec(`INSERT INTO "FreeProxy" (id,protocol,host,port,country,alive,healthScore,latencyMs,lastCheckedAt,createdAt,updatedAt)
VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
			id, r["protocol"], "10.0.0."+string(rune('1'+i)), 8080+i, r["country"], alive, hs, lat, checked, created, now); err != nil {
			t.Fatalf("seed proxy row %d: %v", i, err)
		}
	}
}

func getProxyPool(t *testing.T, d Deps, query string) map[string]any {
	t.Helper()
	req := httptest.NewRequest("GET", "/api/admin/proxy-pool"+query, nil)
	rec := httptest.NewRecorder()
	d.adminProxyPool(rec, req)
	if rec.Code != 200 {
		t.Fatalf("proxy-pool status=%d body=%s", rec.Code, rec.Body.String())
	}
	var env struct {
		OK   bool           `json:"ok"`
		Data map[string]any `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &env); err != nil || !env.OK {
		t.Fatalf("proxy-pool envelope: %v %s", err, rec.Body.String())
	}
	return env.Data
}

func TestProxyPoolStatsPanel(t *testing.T) {
	db := newTestDB(t)
	d := Deps{DB: db, Auth: auth.NewService("pw", "s", false)}
	now := store.NowMS()
	h1, h2 := now-3600_000, now-2*3600_000
	day1, day2 := now-25*3600_000, now-48*3600_000
	day8 := now - 8*24*3600*1000
	d10 := now - 10*24*3600*1000
	dayF := now - 1*24*3600*1000
	seedProxyRows(t, db, []map[string]any{
		{"id": "p1", "protocol": "http", "country": "US", "alive": int64(1), "healthScore": int64(90), "latencyMs": int64(500), "lastCheckedAt": h1},
		{"id": "p2", "protocol": "http", "country": "US", "alive": int64(1), "healthScore": int64(80), "latencyMs": int64(700), "lastCheckedAt": h2},
		{"id": "p3", "protocol": "http", "country": "DE", "healthScore": int64(0), "lastCheckedAt": day2},
		{"id": "p4", "protocol": "socks5", "country": "JP", "healthScore": int64(-2), "lastCheckedAt": day1},
		{"id": "p5", "protocol": "socks5", "country": "US", "createdAt": d10}, // 从未校验+超3天
		{"id": "p6", "protocol": "socks4", "country": "", "createdAt": dayF},  // 从未校验+新鲜
		{"id": "p7", "protocol": "http", "country": "GB", "healthScore": int64(5), "lastCheckedAt": day1},
		{"id": "p8", "protocol": "http", "country": "US", "healthScore": int64(-1), "lastCheckedAt": day8},
	})

	data := getProxyPool(t, d, "")
	stats, _ := data["stats"].(map[string]any)
	if stats == nil {
		t.Fatalf("stats missing: %v", data)
	}
	if got, _ := stats["total"].(float64); got != 8 {
		t.Errorf("total=%v want 8", stats["total"])
	}
	if got, _ := stats["alive"].(float64); got != 2 {
		t.Errorf("alive=%v want 2", stats["alive"])
	}
	if got, _ := stats["aliveRate"].(float64); got != 0.25 {
		t.Errorf("aliveRate=%v want 0.25", stats["aliveRate"])
	}
	// stale: 已检且 lastCheckedAt 超过 24h → p3/p4/p7/p8 = 4 (p5/p6 从未检不算)
	if got, _ := stats["stale"].(float64); got != 4 {
		t.Errorf("stale=%v want 4", stats["stale"])
	}
	// protocol 分组: http 5 / socks5 2 / socks4 1, 计数降序
	protos, _ := stats["protocols"].([]any)
	wantProto := []struct {
		name  string
		count float64
	}{{"http", 5}, {"socks5", 2}, {"socks4", 1}}
	if len(protos) != len(wantProto) {
		t.Fatalf("protocols=%v want %d groups", protos, len(wantProto))
	}
	for i, p := range protos {
		m, _ := p.(map[string]any)
		if m["protocol"] != wantProto[i].name {
			t.Errorf("protocols[%d].protocol=%v want %s", i, m["protocol"], wantProto[i].name)
		}
		if c, _ := m["count"].(float64); c != wantProto[i].count {
			t.Errorf("protocols[%d].count=%v want %v", i, m["count"], wantProto[i].count)
		}
	}
	// 国家 top10: 空国别行排除; US 4 居首
	tops, _ := stats["topCountries"].([]any)
	if len(tops) != 4 {
		t.Fatalf("topCountries=%v want 4 (空国别行排除)", tops)
	}
	first, _ := tops[0].(map[string]any)
	if first["country"] != "US" {
		t.Errorf("topCountries[0]=%v want US", first)
	}
	if c, _ := first["count"].(float64); c != 4 {
		t.Errorf("US count=%v want 4", first["count"])
	}
	// 过滤面不回归: alive=true 列表只剩存活行
	data = getProxyPool(t, d, "?alive=true")
	if list, _ := data["list"].([]any); len(list) != 2 {
		t.Errorf("alive=true list=%d want 2", len(list))
	}
}

func doProxyDelete(t *testing.T, d Deps, query string) (int, map[string]any) {
	t.Helper()
	req := httptest.NewRequest("DELETE", "/api/admin/proxy-pool"+query, nil)
	rec := httptest.NewRecorder()
	d.adminProxyPoolDelete(rec, req)
	var env struct {
		OK   bool           `json:"ok"`
		Data map[string]any `json:"data"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &env)
	return rec.Code, env.Data
}

func countProxies(t *testing.T, db *store.DB) int {
	t.Helper()
	n, err := db.Count(`SELECT count(*) FROM "FreeProxy"`)
	if err != nil {
		t.Fatalf("count: %v", err)
	}
	return n
}

func TestProxyPoolCleanTwoStep(t *testing.T) {
	db := newTestDB(t)
	d := Deps{DB: db, Auth: auth.NewService("pw", "s", false)}
	now := store.NowMS()
	day8 := now - 8*24*3600*1000
	day6 := now - 6*24*3600*1000
	d10 := now - 10*24*3600*1000
	d1 := now - 1*24*3600*1000
	seedProxyRows(t, db, []map[string]any{
		{"id": "hit-dead", "protocol": "http", "country": "US", "healthScore": int64(0), "lastCheckedAt": day8},                       // dead 规则命中
		{"id": "keep-fresh-dead", "protocol": "http", "country": "US", "healthScore": int64(0), "lastCheckedAt": day6},                // 6 天未复检 → 保留
		{"id": "keep-alive", "protocol": "http", "country": "DE", "alive": int64(1), "healthScore": int64(50), "lastCheckedAt": day8}, // 存活 → 保留
		{"id": "keep-scored", "protocol": "http", "country": "DE", "healthScore": int64(3), "lastCheckedAt": day8},                    // 健康分>0 → 保留
		{"id": "hit-never", "protocol": "socks5", "country": "JP", "createdAt": d10},                                                  // 从未校验+超3天 → 命中
		{"id": "keep-fresh-never", "protocol": "socks4", "country": "JP", "createdAt": d1},                                            // 从未校验+新鲜 → 保留
	})
	if got := countProxies(t, db); got != 6 {
		t.Fatalf("seed rows=%d want 6", got)
	}

	// ---- 预览: 无 confirm 只回报计数, 不删 ----
	code, data := doProxyDelete(t, d, "?action=clean")
	if code != 200 {
		t.Fatalf("preview status=%d body=%v", code, data)
	}
	if v, _ := data["confirmRequired"].(bool); !v {
		t.Errorf("preview must set confirmRequired=true, got %v", data)
	}
	if got, _ := data["dead"].(float64); got != 1 {
		t.Errorf("preview dead=%v want 1", data["dead"])
	}
	if got, _ := data["neverChecked"].(float64); got != 1 {
		t.Errorf("preview neverChecked=%v want 1", data["neverChecked"])
	}
	if got, _ := data["total"].(float64); got != 2 {
		t.Errorf("preview total=%v want 2", data["total"])
	}
	if got := countProxies(t, db); got != 6 {
		t.Fatalf("preview must not delete, rows=%d want 6", got)
	}

	// ---- confirm=true 执行删除, 返回删除计数 ----
	code, data = doProxyDelete(t, d, "?action=clean&confirm=true")
	if code != 200 {
		t.Fatalf("clean status=%d body=%v", code, data)
	}
	del, _ := data["deleted"].(map[string]any)
	if del == nil {
		t.Fatalf("clean must return deleted map, got %v", data)
	}
	if got, _ := del["dead"].(float64); got != 1 {
		t.Errorf("deleted.dead=%v want 1", del["dead"])
	}
	if got, _ := del["neverChecked"].(float64); got != 1 {
		t.Errorf("deleted.neverChecked=%v want 1", del["neverChecked"])
	}
	if got := countProxies(t, db); got != 4 {
		t.Fatalf("after clean rows=%d want 4", got)
	}
	for _, kept := range []string{"keep-fresh-dead", "keep-alive", "keep-scored", "keep-fresh-never"} {
		if _, ok, _ := db.QueryMap(`SELECT id FROM "FreeProxy" WHERE id=?`, kept); !ok {
			t.Errorf("row %s must survive clean", kept)
		}
	}

	// ---- 防误删与既有契约: 无 confirm 清空拒绝 / 未知 action 拒绝 / confirm=true 清空 ----
	if code, _ := doProxyDelete(t, d, ""); code != 400 {
		t.Errorf("wipe without confirm must 400, got %d", code)
	}
	if code, _ := doProxyDelete(t, d, "?action=bogus"); code != 400 {
		t.Errorf("unknown action must 400, got %d", code)
	}
	if code, data := doProxyDelete(t, d, "?confirm=true"); code != 200 {
		t.Errorf("legacy wipe with confirm must 200, got %d (%v)", code, data)
	} else if got, _ := data["deleted"].(float64); got != 4 {
		t.Errorf("legacy wipe deleted=%v want 4", data["deleted"])
	}
	if got := countProxies(t, db); got != 0 {
		t.Errorf("after wipe rows=%d want 0", got)
	}
}

// explainPlan EXPLAIN QUERY PLAN 明细拼接(EXPLAIN 输出 4 列, 取 detail 列汇总)。
func explainPlan(t *testing.T, db *store.DB, q string) string {
	t.Helper()
	rows, err := db.Query(`EXPLAIN QUERY PLAN ` + q)
	if err != nil {
		t.Fatalf("explain: %v", err)
	}
	defer rows.Close()
	var sb strings.Builder
	for rows.Next() {
		var id, parent, notused int64
		var detail string
		if err := rows.Scan(&id, &parent, &notused, &detail); err != nil {
			t.Fatalf("explain scan: %v", err)
		}
		sb.WriteString(detail + "; ")
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("explain rows: %v", err)
	}
	return sb.String()
}

func TestFreeProxyIndexesCoverQueryShapes(t *testing.T) {
	db := newTestDB(t) // store.Open → ensureProxyIndexes
	// 四索引在位
	for _, idx := range []string{
		"idx_freeproxy_alive_health", "idx_freeproxy_checked", "idx_freeproxy_protocol", "idx_freeproxy_country",
	} {
		var n int
		if err := db.QueryRow(`SELECT count(*) FROM sqlite_master WHERE type='index' AND name=?`, idx).Scan(&n); err != nil || n != 1 {
			t.Errorf("index %s missing (err=%v n=%d)", idx, err, n)
		}
	}
	// 采集主链路 AliveProxyAddrs 查询形状必须命中 alive_health 索引(避免 3 万行全表排序)
	q := `SELECT protocol, host, port FROM "FreeProxy"
WHERE alive=1 AND healthScore>0 ORDER BY healthScore DESC, lastCheckedAt DESC LIMIT 64`
	if plan := explainPlan(t, db, q); !strings.Contains(plan, "idx_freeproxy_alive_health") {
		t.Errorf("AliveProxyAddrs shape must use idx_freeproxy_alive_health, plan=%s", plan)
	}
	// check 校验器 stale 排序形状命中 checked 索引
	staleQ := `SELECT id FROM "FreeProxy" ORDER BY lastCheckedAt ASC, createdAt ASC LIMIT 150`
	if plan := explainPlan(t, db, staleQ); !strings.Contains(plan, "idx_freeproxy_checked") {
		t.Errorf("stale check shape must use idx_freeproxy_checked, plan=%s", plan)
	}
	// AliveProxyAddrs 本体回归(索引改造不得改变语义)
	if _, err := db.Exec(`INSERT INTO "FreeProxy" (id,protocol,host,port,alive,healthScore,lastCheckedAt,createdAt,updatedAt)
VALUES ('c-a1','socks5','10.1.1.1',1080,1,42,100,100,100), ('c-a2','http','10.1.1.2',8080,1,42,200,200,200)`); err != nil {
		t.Fatalf("insert: %v", err)
	}
	addrs, err := db.AliveProxyAddrs(64)
	if err != nil || len(addrs) != 2 || addrs[0] != "http://10.1.1.2:8080" || addrs[1] != "socks5://10.1.1.1:1080" {
		t.Errorf("AliveProxyAddrs=%v err=%v (healthScore 同分时 lastCheckedAt 降序)", addrs, err)
	}
}
