// ============================================================
// 采集桥扩展层(3-a 所有, PLAN §3 扩展协议; 函数一律 Crawl 前缀防命名冲突)
//
// 语义权威: src/app/api/admin/tasks/go-callback/route.ts(722 行持久化契约) ——
// 本文件只承载「通用 DB 访问面」, 复杂编排(book/chapters/contents/cover 决策)
// 在 internal/crawl/bridge 内实现。所有时间写入显式 epoch-ms(主控口径)。
// ============================================================
package store

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
)

// statsKeyRe json_set 路径键白名单(Store 层防御深度; 正常键 booksCreated 等)。
var statsKeyRe = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]{0,63}$`)

// ---------------- Task 状态机(条件写) ----------------

// CrawlUpdateTaskStatusIfIn 条件状态迁移(白名单集合版): 仅当当前 status ∈ allowed 时写入。
// 对齐 go-callback status 行 [R53-2b] 条件写口径: 任一 status 回调仅允许覆写非终态集
// (pending/running/paused/interrupted), 终态↔终态互不覆写(迟到/重试回调乱序防护)。
// 返回是否实际落地(=0 落地失败时调用方跳过 autoRefresh 排定等后续动作)。
func (d *DB) CrawlUpdateTaskStatusIfIn(id, status string, allowed []string) (bool, error) {
	if len(allowed) == 0 {
		return false, fmt.Errorf("crawl: allowed status set empty")
	}
	ph := strings.Repeat("?,", len(allowed))
	// 占位符顺序 = SQL 中的出现序: status, updatedAt, id, allowed...
	// [R55-3a-fix] 修前 args 误拼为 (status, updatedAt, allowed..., id) —— id=? 吃到
	// 白名单字符串, 条件恒不匹配, 全部状态迁移静默 0 行(pending 永不迁移), E2E 实证。
	args := make([]any, 0, len(allowed)+3)
	args = append(args, status, NowMS(), id)
	for _, a := range allowed {
		args = append(args, a)
	}
	res, err := d.Exec(`UPDATE "Task" SET status=?, updatedAt=? WHERE id=? AND status IN (`+ph[:len(ph)-1]+`)`, args...)
	if err != nil {
		return false, err
	}
	n, _ := res.RowsAffected()
	return n == 1, nil
}

// CrawlMarkTaskStarted 启动受理状态迁移(对齐 TS _go-control.markGoStarted):
// 先终态条件原子重置 done/error/stopped→pending(防并发 start 读旧终态快照),
// 再就绪态→running。两段条件写, 并发 start/stop 竞态下不覆写他方表态。
func (d *DB) CrawlMarkTaskStarted(id string) error {
	if _, err := d.CrawlUpdateTaskStatusIfIn(id, "pending", []string{"done", "error", "stopped"}); err != nil {
		return err
	}
	_, err := d.CrawlUpdateTaskStatusIfIn(id, "running", []string{"pending", "paused", "interrupted"})
	return err
}

// ---------------- Task.progress/stats JSON 合并 ----------------

// CrawlMergeTaskJSONAtomically progress/stats 白名单合并(绝对值覆盖)。
// 对齐 route.ts mergeTaskJsonAtomically ①: json_patch 单语句原子合并(无读旧值窗口);
// json_patch 不可用/行不存在 → 降级 RMW 一次(与 TS 同款降级链)。
// 仅接受 progress/stats 两列(白名单防注入, 键名来自调用侧白名单常量)。
func (d *DB) CrawlMergeTaskJSONAtomically(id, col string, patch map[string]any) error {
	if col != "progress" && col != "stats" {
		return fmt.Errorf("crawl: unsupported merge column %q", col)
	}
	b, err := json.Marshal(patch)
	if err != nil {
		return err
	}
	_, err = d.Exec(`UPDATE "Task" SET `+col+`=json_patch(COALESCE(`+col+`, '{}'), ?), updatedAt=? WHERE id=?`, string(b), NowMS(), id)
	if err == nil {
		return nil
	}
	// 降级 RMW(json_patch 不可用的老 SQLite; 单连接下 RMW 窗口极窄, 与 TS 同口径兜底)
	return d.MergeTaskJSON(id, col, patch)
}

// CrawlMergeStatsDelta stats 增量累加(Next-owned 计数: booksCreated/booksUpdated/
// chaptersCreated/chaptersUpdated)。对齐 route.ts mergeStatsDelta ②: json_set 单语句
// 原子累加, 每键恰好出现一次基于原始列值取旧数; 降级 RMW 一次。
// 键名来自 STATS_KEYS 白名单(调用侧过滤), 数值经绑定参数传递。
// [R56-2b-fix] 键名拼进 json 路径前在本层再验一次字符白名单(防御深度: store 不应
// 信任调用侧过滤, 恶意键可把 json 路径拼成任意 SQL 片段)。
func (d *DB) CrawlMergeStatsDelta(id string, patch map[string]int64) error {
	if len(patch) == 0 {
		return nil
	}
	keys := make([]string, 0, len(patch))
	vals := make([]any, 0, len(patch))
	for k, v := range patch {
		if v == 0 {
			continue
		}
		if !statsKeyRe.MatchString(k) {
			return fmt.Errorf("crawl: invalid stats key %q", k)
		}
		keys = append(keys, k)
		vals = append(vals, v)
	}
	if len(keys) == 0 {
		return nil
	}
	expr := `COALESCE(stats, '{}')`
	params := make([]any, 0, len(vals)+2)
	params = append(params, vals...)
	for _, k := range keys {
		expr = fmt.Sprintf(`json_set(%s, '$.%s', COALESCE(json_extract(COALESCE(stats, '{}'), '$.%s'), 0) + ?)`, expr, k, k)
	}
	_, err := d.Exec(`UPDATE "Task" SET stats=`+expr+`, updatedAt=? WHERE id=?`, append(params, NowMS(), id)...)
	if err == nil {
		return nil
	}
	// 降级 RMW
	var cur string
	if err := d.QueryRow(`SELECT stats FROM "Task" WHERE id=?`, id).Scan(&cur); err != nil {
		return err
	}
	m := map[string]any{}
	if cur != "" {
		_ = json.Unmarshal([]byte(cur), &m)
	}
	for _, k := range keys {
		prev, _ := m[k].(float64)
		m[k] = int64(prev) + patch[k]
	}
	return d.CrawlMergeTaskJSONAtomically(id, "stats", m)
}

// ---------------- 书籍(回调 upsert 面) ----------------

// CrawlFindBookForCallback 回调建书幂等定位(对齐 runner [R28-4-L9]):
// sourceUrl 精确 或 同名同作者 跨源合并(存量设计语义保留)。not found → (nil, nil)。
func (d *DB) CrawlFindBookForCallback(sourceURL, name, author string) (*Book, error) {
	rows, err := d.QueryMaps(`SELECT id,num,name,author,categoryId,intro,cover,status,keywords,latestChapter,
wordCount,sourceUrl,sourceRuleId,storageMode,collectedAt,createdAt,updatedAt FROM "Book"
WHERE sourceUrl=? OR (name=? AND author=?) ORDER BY createdAt ASC LIMIT 1`, sourceURL, name, author)
	if err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, nil
	}
	return bookFromMap(rows[0]), nil
}

// CrawlBookUpdate 书籍字段更新集(桥构造; 指针字段 nil=该列不动)
type CrawlBookUpdate struct {
	Name          string
	Author        string
	CategoryID    *string
	Intro         string
	Status        string
	SourceURL     string
	SourceRuleID  sql.NullString
	StorageMode   string
	CollectedAt   *int64
	Cover         *string
	WordCount     *int64
	LatestChapter *string
}

// CrawlUpdateBookFromCallback 回调更新书(动态 SET, 恒带 updatedAt)。
// 增量/完全覆盖两路径的字段取舍由 bridge 决策(语义权威 route.ts handleBook), 本函数
// 只做「给什么写什么」的持久化执行。
func (d *DB) CrawlUpdateBookFromCallback(bookID string, u *CrawlBookUpdate) error {
	if u == nil {
		return fmt.Errorf("crawl: nil update")
	}
	sets := []string{}
	args := []any{}
	add := func(col string, v any) {
		sets = append(sets, col+"=?")
		args = append(args, v)
	}
	add("name", u.Name)
	add("author", u.Author)
	if u.CategoryID != nil {
		add("categoryId", *u.CategoryID)
	}
	add("intro", u.Intro)
	if u.Status != "" {
		add("status", u.Status)
	}
	add("sourceUrl", u.SourceURL)
	add("sourceRuleId", u.SourceRuleID)
	add("storageMode", u.StorageMode)
	if u.CollectedAt != nil {
		add("collectedAt", *u.CollectedAt)
	}
	if u.Cover != nil {
		add("cover", *u.Cover)
	}
	if u.WordCount != nil {
		add("wordCount", *u.WordCount)
	}
	if u.LatestChapter != nil {
		add("latestChapter", *u.LatestChapter)
	}
	add("updatedAt", NowMS())
	args = append(args, bookID)
	_, err := d.Exec(`UPDATE "Book" SET `+strings.Join(sets, ", ")+` WHERE id=?`, args...)
	return err
}

// CrawlUpsertCategory 同名分类 upsert(返回 id)。
// 单连接串行化下 SELECT→INSERT 窗口极窄; 撞唯一约束由调用方按错误重试(route.ts 3 次退避同语义)。
func (d *DB) CrawlUpsertCategory(name string) (string, error) {
	if m, ok, err := d.QueryMap(`SELECT id FROM "Category" WHERE name=?`, name); err != nil {
		return "", err
	} else if ok {
		return ToStr(m["id"]), nil
	}
	id := d.NewID()
	now := NowMS()
	if _, err := d.Exec(`INSERT INTO "Category" (id,name,sortOrder,createdAt) VALUES (?,?,0,?)`, id, name, now); err != nil {
		// 并发插入撞名: 回查一次(对齐 route.ts P2002 → 重查臂)
		if m, ok2, e2 := d.QueryMap(`SELECT id FROM "Category" WHERE name=?`, name); e2 == nil && ok2 {
			return ToStr(m["id"]), nil
		}
		return "", err
	}
	return id, nil
}

// CrawlUpdateBookStatus 智能完结终判回写(书状态单列)。
func (d *DB) CrawlUpdateBookStatus(bookID, status string) error {
	_, err := d.Exec(`UPDATE "Book" SET status=?, updatedAt=? WHERE id=?`, status, NowMS(), bookID)
	return err
}

// CrawlUpdateBookLatestChapter 末章回写(码点截断由调用方完成)。
func (d *DB) CrawlUpdateBookLatestChapter(bookID, latest string) error {
	_, err := d.Exec(`UPDATE "Book" SET latestChapter=?, updatedAt=? WHERE id=?`, latest, NowMS(), bookID)
	return err
}

// CrawlUpdateBookCover 封面路径回写(cover kind; covers/<file> 相对形态)。
func (d *DB) CrawlUpdateBookCover(bookID, cover string) error {
	_, err := d.Exec(`UPDATE "Book" SET cover=?, updatedAt=? WHERE id=?`, cover, NowMS(), bookID)
	return err
}

// CrawlUpdateBookWordCount 书籍字数聚合回写(contents 批后; SUM(wordCount) WHERE fetched=1)。
func (d *DB) CrawlUpdateBookWordCount(bookID string, wordCount int64) error {
	_, err := d.Exec(`UPDATE "Book" SET wordCount=?, updatedAt=? WHERE id=?`, wordCount, NowMS(), bookID)
	return err
}

// CrawlSumWordCount 书内已采正文字数聚合(contents 批后回写 Book.wordCount 用)。
func (d *DB) CrawlSumWordCount(bookID string) (int64, error) {
	var sum sql.NullInt64
	if err := d.QueryRow(`SELECT SUM(wordCount) FROM "Chapter" WHERE bookId=? AND fetched=1`, bookID).Scan(&sum); err != nil {
		return 0, err
	}
	if !sum.Valid {
		return 0, nil
	}
	return sum.Int64, nil
}

// ---------------- 章节(重排/建缺/落库面) ----------------

// CrawlExistChapter 既有章节行(chapters 回调装载; 对齐 route.ts ExistChapter 同构)
type CrawlExistChapter struct {
	ID      string
	URL     string
	Title   string
	Idx     int
	Volume  string
	Fetched bool
}

// CrawlLoadExistChapters 既有章节装载(runner R4-11/R5-1 同款: 10k 上限 + ≤50k 全量回退,
// 防 OOM 与唯一约束风暴)。>50k 时保留前 1 万行(TS 语义原样)。
func (d *DB) CrawlLoadExistChapters(bookID string) ([]CrawlExistChapter, error) {
	load := func(limit int) ([]map[string]any, error) {
		return d.QueryMaps(`SELECT id,url,title,idx,volume,fetched FROM "Chapter" WHERE bookId=?
ORDER BY idx ASC LIMIT `+fmt.Sprint(limit), bookID)
	}
	rows, err := load(10_000)
	if err != nil {
		return nil, err
	}
	if len(rows) == 10_000 {
		total, e := d.ChapterCount(bookID)
		if e != nil {
			return nil, e
		}
		if total <= 50_000 {
			rows, err = load(total)
			if err != nil {
				return nil, err
			}
		}
	}
	out := make([]CrawlExistChapter, 0, len(rows))
	for _, r := range rows {
		out = append(out, CrawlExistChapter{
			ID:      ToStr(r["id"]),
			URL:     ToStr(r["url"]),
			Title:   ToStr(r["title"]),
			Idx:     int(ToInt(r["idx"])),
			Volume:  ToStr(r["volume"]),
			Fetched: ToBool(r["fetched"]),
		})
	}
	return out, nil
}

// CrawlCreateChapter 建章(全量形态阶段C / 多段追加 / 缺章兜底共用)。
// content 为 nil 时建未采行(fetched=0); 非 nil 建带正文行(fetched=1)。
// storage 恒 db(单体内 v1 仅 db; chapters 全量形态允许 task.storageMode 传入)。
func (d *DB) CrawlCreateChapter(bookID string, idx int, title, volume, url, storage string, content *string, wordCount int) error {
	now := NowMS()
	// 列序: id,bookId,idx,title,volume,url,content,storage,filePath(NULL),wordCount,fetched,createdAt,updatedAt
	// [R55-3a-fix] 修前 VALUES 把 url 槽硬编码 NULL、content 槽错位吃 url 参数
	// (fetched 吃 wordCount/wordCount 恒 0), 章行 url 恒空 → needUrls/contents 定位全断。
	if content == nil {
		_, err := d.Exec(`INSERT INTO "Chapter" (id,bookId,idx,title,volume,url,content,storage,filePath,wordCount,fetched,createdAt,updatedAt)
VALUES (?,?,?,?,?,?,?,?,NULL,?,0,?,?)`, d.NewID(), bookID, idx, title, volume, url, nil, storage, wordCount, now, now)
		return err
	}
	_, err := d.Exec(`INSERT INTO "Chapter" (id,bookId,idx,title,volume,url,content,storage,filePath,wordCount,fetched,createdAt,updatedAt)
VALUES (?,?,?,?,?,?,?,?,NULL,?,1,?,?)`, d.NewID(), bookID, idx, title, volume, url, *content, storage, wordCount, now, now)
	return err
}

// CrawlUpdateChapterIdx 重排位写(阶段A 负位/阶段D 回填/阶段B 挪尾共用)。
func (d *DB) CrawlUpdateChapterIdx(chapterID string, idx int) error {
	_, err := d.Exec(`UPDATE "Chapter" SET idx=?, updatedAt=? WHERE id=?`, idx, NowMS(), chapterID)
	return err
}

// CrawlUpdateChapterVolume 分卷名回填(kk-a 只补空缺, 由调用方判空缺)。
func (d *DB) CrawlUpdateChapterVolume(chapterID, volume string) error {
	_, err := d.Exec(`UPDATE "Chapter" SET volume=?, updatedAt=? WHERE id=?`, volume, NowMS(), chapterID)
	return err
}

// CrawlDeleteStaleChapters 阶段E 目录外陈旧章清理(idx>minIdx 且 url 不在当前目录)。
// 返回删除行数(保守闸决策在 bridge, 本函数只执行)。
func (d *DB) CrawlDeleteStaleChapters(bookID string, minIdx int, currentURLs []string) (int64, error) {
	if len(currentURLs) == 0 {
		return 0, nil
	}
	ph := strings.Repeat("?,", len(currentURLs))
	args := []any{bookID, minIdx}
	for _, u := range currentURLs {
		args = append(args, u)
	}
	res, err := d.Exec(`DELETE FROM "Chapter" WHERE bookId=? AND idx>? AND url NOT IN (`+ph[:len(ph)-1]+`)`, args...)
	if err != nil {
		return 0, err
	}
	n, _ := res.RowsAffected()
	return n, nil
}

// CrawlStaleChaptersCount 阶段E 保守闸计数(与删除同 where)。
func (d *DB) CrawlStaleChaptersCount(bookID string, minIdx int, currentURLs []string) (int, error) {
	if len(currentURLs) == 0 {
		return 0, nil
	}
	ph := strings.Repeat("?,", len(currentURLs))
	args := []any{bookID, minIdx}
	for _, u := range currentURLs {
		args = append(args, u)
	}
	return d.Count(`SELECT count(*) FROM "Chapter" WHERE bookId=? AND idx>? AND url NOT IN (`+ph[:len(ph)-1]+`)`, args...)
}

// CrawlMaxChapterIdx 书内最大 idx(尾插分配; 空书返回 0)。
func (d *DB) CrawlMaxChapterIdx(bookID string) (int, error) {
	var mx sql.NullInt64
	if err := d.QueryRow(`SELECT MAX(idx) FROM "Chapter" WHERE bookId=?`, bookID).Scan(&mx); err != nil {
		return 0, err
	}
	if !mx.Valid {
		return 0, nil
	}
	return int(mx.Int64), nil
}

// CrawlChaptersByURLs 批量定位章节(bookId+url in; contents 回调幂等落库用)。
// 返回 url→id 映射(同 url 多行取首行, 理论上 @@unique([bookId,url]) 不存在但防御)。
func (d *DB) CrawlChaptersByURLs(bookID string, urls []string) (map[string]string, error) {
	out := make(map[string]string, len(urls))
	if len(urls) == 0 {
		return out, nil
	}
	// 分批防 SQLite 变量上限(999 默认; 每批 500 章足够 contents 批 ≤20 的量级冗余)
	const batch = 500
	for start := 0; start < len(urls); start += batch {
		end := start + batch
		if end > len(urls) {
			end = len(urls)
		}
		part := urls[start:end]
		ph := strings.Repeat("?,", len(part))
		args := []any{bookID}
		for _, u := range part {
			args = append(args, u)
		}
		rows, err := d.QueryMaps(`SELECT id,url FROM "Chapter" WHERE bookId=? AND url IN (`+ph[:len(ph)-1]+`)`, args...)
		if err != nil {
			return nil, err
		}
		for _, r := range rows {
			u := ToStr(r["url"])
			if _, dup := out[u]; !dup {
				out[u] = ToStr(r["id"])
			}
		}
	}
	return out, nil
}

// ---------------- 辅助(包内 JSON 小封装, 避免重复 import) ----------------

// bookFromMap QueryMaps 行 → Book 强类型(CrawlFindBookForCallback 内部装配)。
func bookFromMap(m map[string]any) *Book {
	b := &Book{
		ID:            ToStr(m["id"]),
		Name:          ToStr(m["name"]),
		Author:        ToStr(m["author"]),
		Intro:         ToStr(m["intro"]),
		Cover:         ToStr(m["cover"]),
		Status:        ToStr(m["status"]),
		Keywords:      ToStr(m["keywords"]),
		LatestChapter: ToStr(m["latestChapter"]),
		WordCount:     ToInt(m["wordCount"]),
		SourceURL:     ToStr(m["sourceUrl"]),
		StorageMode:   ToStr(m["storageMode"]),
	}
	if v, ok := m["num"]; ok && v != nil {
		b.Num = sql.NullInt64{Int64: ToInt(v), Valid: true}
	}
	if v, ok := m["categoryId"]; ok && v != nil {
		b.CategoryID = sql.NullString{String: ToStr(v), Valid: true}
	}
	if v, ok := m["sourceRuleId"]; ok && v != nil {
		b.SourceRuleID = sql.NullString{String: ToStr(v), Valid: true}
	}
	if v, ok := m["collectedAt"]; ok && v != nil {
		b.CollectedAt = sql.NullInt64{Int64: ToInt(v), Valid: true}
	}
	b.CreatedAt = ToInt(m["createdAt"])
	b.UpdatedAt = ToInt(m["updatedAt"])
	return b
}

// AliveProxyAddrs 取存活代理地址串("protocol://host:port", 健康分降序)。
// [R57 预铺] 供 crawl 引擎把 DB 代理池喂进 fetch Client 轮换(消除「池有数据采集不用」缺口)。
// limit<=0 → 64; 无存活行 → 空切片非 nil(消费方 len 判断即可)。
func (d *DB) AliveProxyAddrs(limit int) ([]string, error) {
	if limit <= 0 {
		limit = 64
	}
	maps, err := d.QueryMaps(`SELECT protocol, host, port FROM "FreeProxy"
                WHERE alive=1 AND healthScore>0 ORDER BY healthScore DESC, lastCheckedAt DESC LIMIT ?`, limit)
	if err != nil {
		return nil, err
	}
	out := make([]string, 0, len(maps))
	for _, m := range maps {
		proto := ToStr(m["protocol"])
		host := ToStr(m["host"])
		port := ToInt(m["port"])
		if proto == "" || host == "" || port <= 0 || port > 65535 {
			continue
		}
		if proto == "socks5h" {
			proto = "socks5" // fetch 层同口径归一
		}
		if proto != "http" && proto != "https" && proto != "socks4" && proto != "socks5" {
			continue
		}
		out = append(out, proto+"://"+host+":"+itoaStore(int(port)))
	}
	return out, nil
}

// itoaStore 轻量整数十进制(store 内避免引 strconv 的调用点已多, 独立小函数防重名)
func itoaStore(n int) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	var b [20]byte
	i := len(b)
	for n > 0 {
		i--
		b[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		b[i] = '-'
	}
	return string(b[i:])
}
