// ============================================================
// 类型模型(仅承载业务逻辑需要的强类型面; 列表/JSON 端点走 QueryMaps)
// 字段口径与 Prisma schema 一一对应; 时间一律 epoch-ms int64。
// ============================================================
package store

import (
	"database/sql"
	"encoding/json"
	"fmt"
)

// Task 采集任务(Task 表)
type Task struct {
	ID                       string
	Name                     string
	RuleID                   string
	Mode                     string // single|range|bookIds
	BookURL                  string
	BookIDs                  string
	BookIDFrom               string
	BookIDTo                 string
	ListURL                  string
	ListStart                int
	ListEnd                  int
	BookStart                int
	BookEnd                  int
	RecrawlMode              string // full|incremental
	StorageMode              string // db|txt
	Engine                   string // 'go'|'ts'(历史字段; 单体内一律 Go 引擎执行, 仅展示)
	FetchConfig              string
	ThreadMin, ThreadMax     int
	IntervalMin, IntervalMax int
	SmartCategory            bool
	SmartComplete            bool
	AutoSuggest              bool
	AutoRefresh              bool
	RefreshIntervalMin       int
	Status                   string
	Progress                 string // JSON
	Stats                    string // JSON
	CreatedAt                int64
	UpdatedAt                int64
}

const taskCols = `id,name,ruleId,mode,bookUrl,bookIds,bookIdFrom,bookIdTo,listUrl,listStart,listEnd,bookStart,bookEnd,
recrawlMode,storageMode,engine,fetchConfig,threadMin,threadMax,intervalMin,intervalMax,
smartCategory,smartComplete,autoSuggest,autoRefresh,refreshIntervalMin,status,progress,stats,createdAt,updatedAt`

// GetTask 单任务; not found → (nil, nil)。
func (d *DB) GetTask(id string) (*Task, error) {
	t := &Task{}
	var sc, sp, as, ar int64
	err := d.QueryRow(`SELECT `+taskCols+` FROM "Task" WHERE id=?`, id).Scan(
		&t.ID, &t.Name, &t.RuleID, &t.Mode, &t.BookURL, &t.BookIDs, &t.BookIDFrom, &t.BookIDTo,
		&t.ListURL, &t.ListStart, &t.ListEnd, &t.BookStart, &t.BookEnd,
		&t.RecrawlMode, &t.StorageMode, &t.Engine, &t.FetchConfig, &t.ThreadMin, &t.ThreadMax, &t.IntervalMin, &t.IntervalMax,
		&sc, &sp, &as, &ar, &t.RefreshIntervalMin, &t.Status, &t.Progress, &t.Stats, &t.CreatedAt, &t.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	t.SmartCategory, t.SmartComplete, t.AutoSuggest, t.AutoRefresh = ToBool(sc), ToBool(sp), ToBool(as), ToBool(ar)
	return t, nil
}

// ListTasksByStatus 按状态取任务(空串=全部)。
func (d *DB) ListTasksByStatus(status string) ([]*Task, error) {
	q := `SELECT ` + taskCols + ` FROM "Task"`
	var args []any
	if status != "" {
		q += ` WHERE status=?`
		args = append(args, status)
	}
	q += ` ORDER BY createdAt DESC`
	rows, err := d.Query(q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*Task
	for rows.Next() {
		t := &Task{}
		var sc, sp, as, ar int64
		if err := rows.Scan(
			&t.ID, &t.Name, &t.RuleID, &t.Mode, &t.BookURL, &t.BookIDs, &t.BookIDFrom, &t.BookIDTo,
			&t.ListURL, &t.ListStart, &t.ListEnd, &t.BookStart, &t.BookEnd,
			&t.RecrawlMode, &t.StorageMode, &t.Engine, &t.FetchConfig, &t.ThreadMin, &t.ThreadMax, &t.IntervalMin, &t.IntervalMax,
			&sc, &sp, &as, &ar, &t.RefreshIntervalMin, &t.Status, &t.Progress, &t.Stats, &t.CreatedAt, &t.UpdatedAt,
		); err != nil {
			return nil, err
		}
		t.SmartCategory, t.SmartComplete, t.AutoSuggest, t.AutoRefresh = ToBool(sc), ToBool(sp), ToBool(as), ToBool(ar)
		out = append(out, t)
	}
	return out, rows.Err()
}

// GetRuleConfig 取规则配置 JSON(任务启动装载用)。
func (d *DB) GetRuleConfig(ruleID string) (name string, config string, err error) {
	err = d.QueryRow(`SELECT name, config FROM "Rule" WHERE id=?`, ruleID).Scan(&name, &config)
	if err == sql.ErrNoRows {
		return "", "", fmt.Errorf("rule %s not found", ruleID)
	}
	return name, config, err
}

// UpdateTaskStatus 状态迁移(恒带 updatedAt)。
func (d *DB) UpdateTaskStatus(id, status string) error {
	_, err := d.Exec(`UPDATE "Task" SET status=?, updatedAt=? WHERE id=?`, status, NowMS(), id)
	return err
}

// UpdateTaskStatusIf 条件状态迁移(防并发双写, 对齐 R54 清扫器条件写收口); 返回是否实际更新。
func (d *DB) UpdateTaskStatusIf(id, status, expectFrom string) (bool, error) {
	res, err := d.Exec(`UPDATE "Task" SET status=?, updatedAt=? WHERE id=? AND status=?`, status, NowMS(), id, expectFrom)
	if err != nil {
		return false, err
	}
	n, _ := res.RowsAffected()
	return n == 1, nil
}

// MergeTaskJSON 对 Task.progress / Task.stats 做「只覆盖出现的键」合并
// (go-callback progress/stats 语义); 主路径 CrawlMergeTaskJSONAtomically 走
// json_patch 单语句原子合并, 本函数为其降级兜底 —— [R56-2b-fix] 修前 RMW 两语句
// 非事务: maxConns=1 下两条语句间仍可被其他 goroutine 的合并插入(读A读B写A写B
// 丢更新), 现包进事务让「读-改-写」对其他合并方原子。
func (d *DB) MergeTaskJSON(id, col string, patch map[string]any) error {
	if col != "progress" && col != "stats" {
		return fmt.Errorf("merge: unsupported column %q", col)
	}
	tx, err := d.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var cur string
	if err := tx.QueryRow(`SELECT `+col+` FROM "Task" WHERE id=?`, id).Scan(&cur); err != nil {
		return err
	}
	m := map[string]any{}
	if cur != "" {
		_ = json.Unmarshal([]byte(cur), &m) // 脏 JSON → 空对象重写
	}
	for k, v := range patch {
		m[k] = v
	}
	b, err := json.Marshal(m)
	if err != nil {
		return err
	}
	if _, err := tx.Exec(`UPDATE "Task" SET `+col+`=?, updatedAt=? WHERE id=?`, string(b), NowMS(), id); err != nil {
		return err
	}
	return tx.Commit()
}

// AppendTaskLog 追加任务日志(cap 由读取端裁剪, 对齐 task-log.ts 消费形态)。
func (d *DB) AppendTaskLog(taskID, level, message string) error {
	_, err := d.Exec(`INSERT INTO "TaskLog" (id,taskId,level,message,createdAt) VALUES (?,?,?,?,?)`,
		d.NewID(), taskID, level, message, NowMS())
	return err
}

// Book 书籍(Book 表)
type Book struct {
	ID            string
	Num           sql.NullInt64
	Name          string
	Author        string
	CategoryID    sql.NullString
	Intro         string
	Cover         string
	Status        string
	Keywords      string
	LatestChapter string
	WordCount     int64
	SourceURL     string
	SourceRuleID  sql.NullString
	StorageMode   string
	CollectedAt   sql.NullInt64
	CreatedAt     int64
	UpdatedAt     int64
}

// GetBook 按 id; not found → (nil, nil)。
func (d *DB) GetBook(id string) (*Book, error) {
	b := &Book{}
	err := d.QueryRow(`SELECT id,num,name,author,categoryId,intro,cover,status,keywords,latestChapter,wordCount,
sourceUrl,sourceRuleId,storageMode,collectedAt,createdAt,updatedAt FROM "Book" WHERE id=?`, id).
		Scan(&b.ID, &b.Num, &b.Name, &b.Author, &b.CategoryID, &b.Intro, &b.Cover, &b.Status, &b.Keywords,
			&b.LatestChapter, &b.WordCount, &b.SourceURL, &b.SourceRuleID, &b.StorageMode, &b.CollectedAt, &b.CreatedAt, &b.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return b, nil
}

// GetBookByNum 按伪静态书号; not found → (nil, nil)。
func (d *DB) GetBookByNum(num int64) (*Book, error) {
	b := &Book{}
	err := d.QueryRow(`SELECT id,num,name,author,categoryId,intro,cover,status,keywords,latestChapter,wordCount,
sourceUrl,sourceRuleId,storageMode,collectedAt,createdAt,updatedAt FROM "Book" WHERE num=?`, num).
		Scan(&b.ID, &b.Num, &b.Name, &b.Author, &b.CategoryID, &b.Intro, &b.Cover, &b.Status, &b.Keywords,
			&b.LatestChapter, &b.WordCount, &b.SourceURL, &b.SourceRuleID, &b.StorageMode, &b.CollectedAt, &b.CreatedAt, &b.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return b, nil
}

// FindBookBySourceURL 按源地址幂等定位(回调建书入口)。
func (d *DB) FindBookBySourceURL(u string) (*Book, error) {
	b := &Book{}
	err := d.QueryRow(`SELECT id,num,name,author,categoryId,intro,cover,status,keywords,latestChapter,wordCount,
sourceUrl,sourceRuleId,storageMode,collectedAt,createdAt,updatedAt FROM "Book" WHERE sourceUrl=? ORDER BY createdAt ASC LIMIT 1`, u).
		Scan(&b.ID, &b.Num, &b.Name, &b.Author, &b.CategoryID, &b.Intro, &b.Cover, &b.Status, &b.Keywords,
			&b.LatestChapter, &b.WordCount, &b.SourceURL, &b.SourceRuleID, &b.StorageMode, &b.CollectedAt, &b.CreatedAt, &b.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return b, nil
}

// NextBookNum 伪静态书号分配(max+1, 应用层口径对齐 Prisma 时代)。
func (d *DB) NextBookNum() (int64, error) {
	var max sql.NullInt64
	if err := d.QueryRow(`SELECT MAX(num) FROM "Book"`).Scan(&max); err != nil {
		return 0, err
	}
	if !max.Valid || max.Int64 < 0 {
		return 1, nil
	}
	return max.Int64 + 1, nil
}

// InsertBook 建书(显式全列, 时间显式 epoch-ms)。
func (d *DB) InsertBook(b *Book) error {
	now := NowMS()
	b.CreatedAt, b.UpdatedAt = now, now
	if !b.Num.Valid {
		n, err := d.NextBookNum()
		if err != nil {
			return err
		}
		b.Num = sql.NullInt64{Int64: n, Valid: true}
	}
	if b.StorageMode == "" {
		b.StorageMode = "db"
	}
	if b.Author == "" {
		b.Author = "佚名"
	}
	_, err := d.Exec(`INSERT INTO "Book" (id,num,name,author,categoryId,intro,cover,status,keywords,latestChapter,
wordCount,sourceUrl,sourceRuleId,storageMode,collectedAt,createdAt,updatedAt)
VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
		b.ID, b.Num, b.Name, b.Author, b.CategoryID, b.Intro, b.Cover, b.Status, b.Keywords, b.LatestChapter,
		b.WordCount, b.SourceURL, b.SourceRuleID, b.StorageMode, b.CollectedAt, b.CreatedAt, b.UpdatedAt)
	return err
}
