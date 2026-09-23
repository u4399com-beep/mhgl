// ============================================================
// Feedback(用户反馈) store 层 — ensure 建表 + CRUD(R60-2b)
//
// 表结构对齐 prisma/schema.prisma model Feedback 与线上存量表(逐列逐索引同形,
// 索引名沿用 Prisma 默认命名 → 线上库 IF NOT EXISTS 全部空转, 零重复索引)。
// 建表挂在 pingAndSeed(ensureFeedbackTable, 幂等), Go 侧全新库亦可自举。
//
// 处理态: status ∈ new|read|resolved|ignored(处理完成即 resolved, 不另设
// processed/isDel 列 —— 按需最小化, 硬删除由 FeedbackDelete 承担)。
// ============================================================
package store

import (
	"fmt"
	"strings"
)

// ensureFeedbackTable Feedback 表 + 三索引(IF NOT EXISTS 幂等, 每次 Open 自检)。
// 表已存在(Prisma 历史/既有库)时全部空转; 失败静默不阻断启动(与 ensureProxyIndexes 同口径)。
func (d *DB) ensureFeedbackTable() {
	for _, stmt := range []string{
		`CREATE TABLE IF NOT EXISTS "Feedback" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "contact" TEXT,
    "content" TEXT NOT NULL,
    "url" TEXT,
    "siteId" TEXT,
    "userAgent" TEXT,
    "ip" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "adminNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
)`,
		`CREATE INDEX IF NOT EXISTS "Feedback_status_createdAt_idx" ON "Feedback"("status", "createdAt")`,
		`CREATE INDEX IF NOT EXISTS "Feedback_type_idx" ON "Feedback"("type")`,
		`CREATE INDEX IF NOT EXISTS "Feedback_ip_createdAt_idx" ON "Feedback"("ip", "createdAt")`,
	} {
		if _, err := d.Exec(stmt); err != nil {
			return // 极旧库缺列等异常: 静默跳过, 反馈面降级为既有库表驱动
		}
	}
}

// FeedbackInput 新建反馈入参(字段与 prisma model Feedback 对齐)。
type FeedbackInput struct {
	Type      string // bug | suggestion | praise | other
	Contact   string // 可选联系方式
	Content   string // 反馈正文
	URL       string // 提交时所在页地址
	SiteID    string
	UserAgent string
	IP        string
}

// FeedbackInsert 新增反馈(status 固定 'new', 时间显式 epoch-ms)。
func (d *DB) FeedbackInsert(in FeedbackInput) (string, error) {
	id := d.NewID()
	now := NowMS()
	_, err := d.Exec(`INSERT INTO "Feedback" (id,type,contact,content,url,siteId,userAgent,ip,status,createdAt,updatedAt)
VALUES (?,?,?,?,?,?,?,?, 'new', ?, ?)`,
		id, in.Type, nullStrOr(in.Contact), in.Content, nullStrOr(in.URL), nullStrOr(in.SiteID),
		nullStrOr(in.UserAgent), nullStrOr(in.IP), now, now)
	if err != nil {
		return "", fmt.Errorf("store: feedback insert: %w", err)
	}
	return id, nil
}

// FeedbackListOpts 列表筛选(空值 = 不过滤)。
type FeedbackListOpts struct {
	Status string // new|read|resolved|ignored
	Type   string // bug|suggestion|praise|other
	Q      string // content LIKE(已由调用方 likeSafe 消毒)
	Page   int    // 1 基
	Size   int
}

// FeedbackList 分页列表 + 命中总数 + 全库统计(total/new/resolved)。
func (d *DB) FeedbackList(o FeedbackListOpts) (rows []map[string]any, total int, stats map[string]int, err error) {
	where := []string{"1=1"}
	var args []any
	if o.Status != "" {
		where = append(where, `status=?`)
		args = append(args, o.Status)
	}
	if o.Type != "" {
		where = append(where, `type=?`)
		args = append(args, o.Type)
	}
	if o.Q != "" {
		where = append(where, `content LIKE ?`)
		args = append(args, "%"+o.Q+"%")
	}
	whereSQL := strings.Join(where, " AND ")

	total, err = d.Count(`SELECT count(*) FROM "Feedback" WHERE `+whereSQL, args...)
	if err != nil {
		return nil, 0, nil, fmt.Errorf("store: feedback count: %w", err)
	}
	if o.Page < 1 {
		o.Page = 1
	}
	if o.Size < 1 {
		o.Size = 20
	}
	rows, err = d.QueryMaps(`SELECT * FROM "Feedback" WHERE `+whereSQL+
		` ORDER BY createdAt DESC LIMIT ? OFFSET ?`, append(args, o.Size, (o.Page-1)*o.Size)...)
	if err != nil {
		return nil, 0, nil, fmt.Errorf("store: feedback list: %w", err)
	}
	all, _ := d.Count(`SELECT count(*) FROM "Feedback"`)
	newCnt, _ := d.Count(`SELECT count(*) FROM "Feedback" WHERE status='new'`)
	resolved, _ := d.Count(`SELECT count(*) FROM "Feedback" WHERE status='resolved'`)
	stats = map[string]int{"total": all, "new": newCnt, "resolved": resolved}
	return rows, total, stats, nil
}

// FeedbackGet 单条(不存在 → ok=false)。
func (d *DB) FeedbackGet(id string) (map[string]any, bool, error) {
	return d.QueryMap(`SELECT * FROM "Feedback" WHERE id=?`, id)
}

// FeedbackExists 存在性(更新/删除前快查)。
func (d *DB) FeedbackExists(id string) (bool, error) {
	n, err := d.Count(`SELECT count(*) FROM "Feedback" WHERE id=?`, id)
	if err != nil {
		return false, err
	}
	return n > 0, nil
}

// FeedbackUpdate 局部更新(nil 字段不触碰; adminNote 指向空串 → 置 NULL, 保持既有契约)。
func (d *DB) FeedbackUpdate(id string, status, adminNote *string) error {
	sets := []string{"updatedAt=?"}
	args := []any{NowMS()}
	if status != nil {
		sets = append(sets, "status=?")
		args = append(args, *status)
	}
	if adminNote != nil {
		sets = append(sets, "adminNote=?")
		if *adminNote == "" {
			args = append(args, nil)
		} else {
			args = append(args, *adminNote)
		}
	}
	args = append(args, id)
	if _, err := d.Exec(`UPDATE "Feedback" SET `+strings.Join(sets, ", ")+` WHERE id=?`, args...); err != nil {
		return fmt.Errorf("store: feedback update: %w", err)
	}
	return nil
}

// FeedbackMarkProcessed 标记已处理(status → 'resolved'; note 可选覆盖处理备注)。
func (d *DB) FeedbackMarkProcessed(id, note string) error {
	sets := []string{"status=?", "updatedAt=?"}
	args := []any{"resolved", NowMS()}
	if note != "" {
		sets = append(sets, "adminNote=?")
		args = append(args, note)
	}
	args = append(args, id)
	if _, err := d.Exec(`UPDATE "Feedback" SET `+strings.Join(sets, ", ")+` WHERE id=?`, args...); err != nil {
		return fmt.Errorf("store: feedback mark processed: %w", err)
	}
	return nil
}

// FeedbackDelete 硬删除。
func (d *DB) FeedbackDelete(id string) error {
	if _, err := d.Exec(`DELETE FROM "Feedback" WHERE id=?`, id); err != nil {
		return fmt.Errorf("store: feedback delete: %w", err)
	}
	return nil
}

// FeedbackCountByIPSince 同 IP 时间窗计数(公开提交限频: 同 IP 每小时 ≤5 条)。
// 索引 Feedback_ip_createdAt_idx 精确命中(prisma [R11-c-2] 反滥用限流索引)。
func (d *DB) FeedbackCountByIPSince(ip string, sinceMS int64) (int, error) {
	return d.Count(`SELECT count(*) FROM "Feedback" WHERE ip=? AND createdAt>=?`, ip, sinceMS)
}

// nullStrOr 空串 → NULL(与既有 api 层 nilIfEmpty 同语义, 收敛到 store 口径)。
func nullStrOr(s string) any {
	if s == "" {
		return nil
	}
	return s
}
