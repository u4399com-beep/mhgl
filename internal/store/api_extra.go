// ============================================================
// R55-3b — store 扩展(API 前缀协议, PLAN §3): 供 internal/api 各处理器
// 共用的取数/写库助手。只增不改主控文件。
// ============================================================
package store

import (
	"database/sql"
	"errors"
	"fmt"
	"strings"
)

// APIPseudoPreset 当前伪静态预设 id(Setting.pseudostatic JSON {preset}; 非法/缺失 → 'query')。
func (d *DB) APIPseudoPreset() string {
	var raw string
	if err := d.QueryRow(`SELECT value FROM "Setting" WHERE key='pseudostatic'`).Scan(&raw); err != nil {
		return "query"
	}
	raw = strings.TrimSpace(raw)
	raw = strings.TrimPrefix(raw, "{\"preset\":")
	raw = strings.TrimSuffix(raw, "}")
	raw = strings.Trim(raw, `"' `)
	switch raw {
	case "numeric", "alnum", "directory", "restful", "compact":
		return raw
	}
	return "query"
}

// APICategoryMaxSortOrder 当前最大分类排序(空表 0)。
func (d *DB) APICategoryMaxSortOrder() int {
	var max sql.NullInt64
	_ = d.QueryRow(`SELECT MAX(sortOrder) FROM "Category"`).Scan(&max)
	if !max.Valid || max.Int64 < 0 {
		return 0
	}
	return int(max.Int64)
}

// APIUpsertCategoryByName 按名幂等建分类(Prisma upsert by unique name 口径); 返回 id。
func (d *DB) APIUpsertCategoryByName(name string, sortOrder int) (string, error) {
	var id string
	err := d.QueryRow(`SELECT id FROM "Category" WHERE name=?`, name).Scan(&id)
	if err == nil {
		return id, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return "", err
	}
	id = d.NewID()
	_, err = d.Exec(`INSERT INTO "Category" (id,name,sortOrder,createdAt) VALUES (?,?,?,?)`,
		id, name, sortOrder, NowMS())
	if err != nil {
		return "", fmt.Errorf("category insert: %w", err)
	}
	return id, nil
}

// APIRuleExists 规则存在性(id 直查)。
func (d *DB) APIRuleExists(id string) (bool, error) {
	var n int
	if err := d.QueryRow(`SELECT count(*) FROM "Rule" WHERE id=?`, id).Scan(&n); err != nil {
		return false, err
	}
	return n > 0, nil
}

// APIDeleteTaskRow 删除任务行(级联清 TaskLog 由 DDL 承担); 返回是否实际删除。
func (d *DB) APIDeleteTaskRow(id string) (bool, error) {
	res, err := d.Exec(`DELETE FROM "Task" WHERE id=?`, id)
	if err != nil {
		return false, err
	}
	n, _ := res.RowsAffected()
	return n == 1, nil
}

// APITaskLogPruneTask 单任务 30 天前日志清理(R31-7: 读取路径顺手清理)。
func (d *DB) APITaskLogPruneTask(taskID string, beforeMS int64) {
	_, _ = d.Exec(`DELETE FROM "TaskLog" WHERE taskId=? AND createdAt<?`, taskID, beforeMS)
}

// APITaskLogPruneAll 全局 30 天前日志清理(仪表盘兜底, 覆盖已删任务孤儿日志)。
func (d *DB) APITaskLogPruneAll(beforeMS int64) {
	_, _ = d.Exec(`DELETE FROM "TaskLog" WHERE createdAt<?`, beforeMS)
}

// APIFreeProxyPrune 死代理清理(alive=0 且失败≥2 且 3 天未成功; 对齐 TS pruneDeadProxies)。
func (d *DB) APIFreeProxyPrune() (int64, error) {
	res, err := d.Exec(`DELETE FROM "FreeProxy" WHERE alive=0 AND failCount>=2
AND (lastSuccessAt IS NULL OR lastSuccessAt < ?)`, NowMS()-3*24*3600*1000)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}
