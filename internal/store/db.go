// ============================================================
// R55 Go 单体 — SQLite 数据层核心(主控所有, agent 只许新增自有文件见 PLAN §3)
//
// 实证口径(Prisma 落库格式, 2025-09-22 以 bun:sqlite 逐表核对):
//   - 主键 TEXT(cuid 25ch 'c' 前缀)
//   - DateTime 列实际存 INTEGER 毫秒时间戳(如 1790083748380)
//     → 写入必须显式给 epoch-ms, 绝不能依赖列 DEFAULT CURRENT_TIMESTAMP(会写进字符串)
//   - Boolean 列实际存 INTEGER 0/1
//   - JSON 字段 = TEXT 存 JSON 字符串
//
// 连接策略: SetMaxOpenConns(1) 单写者串行化, 根绝 SQLITE_BUSY(PLAN §1 决策, 不得私改)。
// ============================================================
package store

import (
	"database/sql"
	"fmt"
	"log"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

type DB struct {
	*sql.DB
	path string
}

// Open 打开既有 SQLite 文件(零迁移: 表结构与数据由 Prisma 历史轮次建好)。
//
// [R56-2b-fix] 修前 path 被无条件追加 "?"(url.Values{}.Encode() 恒空串), DSN 变成
// "file:db??" 双问号 —— modernc 驱动按首个 "?" 切 query, 首个键名解析为 "?_pragma",
// 导致排头的 busy_timeout(10000) 静默失效(实测 PRAGMA busy_timeout=0)。去掉该分支,
// pragma 链路完整生效(/tmp 探针实证: wal + busy_timeout=10000 + foreign_keys=1)。
func Open(path string) (*DB, error) {
	// busy_timeout 先行; WAL 提升读写并发(fail-safe: 已是 WAL 或不支持时忽略错误)
	dsn := fmt.Sprintf("file:%s?_pragma=busy_timeout(10000)&_pragma=journal_mode(WAL)&_pragma=synchronous(NORMAL)&_pragma=foreign_keys(1)", path)
	sdb, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("store: open %s: %w", path, err)
	}
	// 单写者串行化(PLAN §1)
	sdb.SetMaxOpenConns(1)
	sdb.SetMaxIdleConns(1)
	sdb.SetConnMaxLifetime(0)
	d := &DB{DB: sdb, path: path}
	if err := d.pingAndSeed(); err != nil {
		_ = sdb.Close()
		return nil, err
	}
	return d, nil
}

func (d *DB) pingAndSeed() error {
	if err := d.Ping(); err != nil {
		return fmt.Errorf("store: ping: %w", err)
	}
	// 自检 + 暖机: 关键表可查
	for _, t := range []string{"Task", "Book", "Chapter", "Rule", "Setting", "Site"} {
		var n int
		if err := d.QueryRow(`SELECT count(*) FROM "` + t + `"`).Scan(&n); err != nil {
			return fmt.Errorf("store: table %s missing/incompatible: %w", t, err)
		}
	}
	d.ensureProxyIndexes()
	d.ensureFeedbackTable() // R60-2b: Feedback 表自举(已存在则空转, 幂等)
	log.Printf("[store] opened %s (mode=wal, maxConns=1)", d.path)
	return nil
}

// ensureProxyIndexes FreeProxy 查询路径索引(R58-2c, IF NOT EXISTS 幂等, 每次 Open 自检):
//
//   - idx_freeproxy_alive_health: 采集主链路 AliveProxyAddrs(WHERE alive=1 AND healthScore>0
//     ORDER BY healthScore DESC, lastCheckedAt DESC LIMIT 64 —— 不动其签名与语义, 只补索引)
//     与管理列表 alive 过滤、定向清理 dead 规则(alive=0 AND healthScore<=0 AND lastCheckedAt<?);
//   - idx_freeproxy_checked: check 校验器 stale/unchecked 选取(ORDER BY lastCheckedAt ASC /
//     lastCheckedAt IS NULL)与定向清理 never 规则(lastCheckedAt IS NULL AND createdAt<?);
//   - idx_freeproxy_protocol / idx_freeproxy_country: 管理列表等值过滤 + protocol 分组/国家
//     top10 聚合。
//
// 表不存在(极简测试库)整段跳过; 极旧最小 schema 缺列时单条失败静默跳过, 不阻断启动
// (生产库列集齐备, 建索引为一次性毫秒级成本)。
func (d *DB) ensureProxyIndexes() {
	var n int
	if err := d.QueryRow(`SELECT count(*) FROM sqlite_master WHERE type='table' AND name='FreeProxy'`).Scan(&n); err != nil || n == 0 {
		return
	}
	for _, stmt := range []string{
		`CREATE INDEX IF NOT EXISTS idx_freeproxy_alive_health ON "FreeProxy"(alive, healthScore, lastCheckedAt)`,
		`CREATE INDEX IF NOT EXISTS idx_freeproxy_checked ON "FreeProxy"(lastCheckedAt, createdAt)`,
		`CREATE INDEX IF NOT EXISTS idx_freeproxy_protocol ON "FreeProxy"(protocol)`,
		`CREATE INDEX IF NOT EXISTS idx_freeproxy_country ON "FreeProxy"(country)`,
	} {
		_, _ = d.Exec(stmt)
	}
}

// ---------------- 通用取数 ----------------

// QueryMaps 执行查询返回 map 切片(map[string]any):
// INTEGER→int64 / FLOAT→float64 / TEXT→string / NULL→nil。
// 供 JSON API 直接序列化与列表端点使用。
func (d *DB) QueryMaps(query string, args ...any) ([]map[string]any, error) {
	rows, err := d.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	cols, err := rows.Columns()
	if err != nil {
		return nil, err
	}
	out := make([]map[string]any, 0, 64)
	buf := make([]any, len(cols))
	ptr := make([]any, len(cols))
	for i := range buf {
		ptr[i] = &buf[i]
	}
	for rows.Next() {
		if err := rows.Scan(ptr...); err != nil {
			return nil, err
		}
		m := make(map[string]any, len(cols))
		for i, c := range cols {
			v := buf[i]
			if b, ok := v.([]byte); ok {
				v = string(b)
			}
			m[c] = v
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// QueryMap 单行版本; 无行返回 (nil, false, nil)。
func (d *DB) QueryMap(query string, args ...any) (map[string]any, bool, error) {
	rows, err := d.Query(query, args...)
	if err != nil {
		return nil, false, err
	}
	defer rows.Close()
	cols, err := rows.Columns()
	if err != nil {
		return nil, false, err
	}
	if !rows.Next() {
		return nil, false, rows.Err()
	}
	buf := make([]any, len(cols))
	ptr := make([]any, len(cols))
	for i := range buf {
		ptr[i] = &buf[i]
	}
	if err := rows.Scan(ptr...); err != nil {
		return nil, false, err
	}
	m := make(map[string]any, len(cols))
	for i, c := range cols {
		v := buf[i]
		if b, ok := v.([]byte); ok {
			v = string(b)
		}
		m[c] = v
	}
	return m, true, rows.Err()
}

// Count 快捷计数。
func (d *DB) Count(query string, args ...any) (int, error) {
	var n int
	if err := d.QueryRow(query, args...).Scan(&n); err != nil {
		return 0, err
	}
	return n, nil
}

// ---------------- 值转换助手 ----------------

// ToMS 把任意 SQLite 标量转 epoch-ms int64(int64/float64 直取; 字符串尝试解析; 0=未知)。
func ToMS(v any) int64 {
	switch x := v.(type) {
	case int64:
		return x
	case int:
		return int64(x)
	case float64:
		return int64(x)
	case []byte:
		return ToMS(string(x))
	case string:
		s := strings.TrimSpace(x)
		if s == "" {
			return 0
		}
		// 纯数字 → 毫秒(10 位视为秒)
		if isAllDigits(s) {
			n := parseIntSafe(s)
			if n > 1e12 {
				return n
			}
			if n > 1e9 {
				return n * 1000
			}
			return 0
		}
		for _, layout := range []string{time.RFC3339Nano, time.RFC3339, "2006-01-02 15:04:05.000", "2006-01-02 15:04:05"} {
			if t, err := time.Parse(layout, s); err == nil {
				return t.UnixMilli()
			}
		}
		return 0
	case time.Time:
		return x.UnixMilli()
	case nil:
		return 0
	default:
		return 0
	}
}

// ToBool 把 SQLite 标量转 bool(0/1 整数口径; 字符串 "1"/"true" 为真)。
func ToBool(v any) bool {
	switch x := v.(type) {
	case int64:
		return x != 0
	case int:
		return x != 0
	case float64:
		return x != 0
	case bool:
		return x
	case []byte:
		return ToBool(string(x))
	case string:
		return x == "1" || strings.EqualFold(x, "true")
	case nil:
		return false
	default:
		return false
	}
}

func ToInt(v any) int64 { return ToMS(v) } // 同为整数化口径

// ToStr nil 安全字符串化。
func ToStr(v any) string {
	switch x := v.(type) {
	case string:
		return x
	case []byte:
		return string(x)
	case nil:
		return ""
	default:
		return fmt.Sprint(x)
	}
}

func isAllDigits(s string) bool {
	if s == "" {
		return false
	}
	for _, r := range s {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}

func parseIntSafe(s string) int64 {
	var n int64
	for _, r := range s {
		n = n*10 + int64(r-'0')
		if n > 1e15 {
			return 1e15
		}
	}
	return n
}
