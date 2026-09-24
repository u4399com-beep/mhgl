// ============================================================
// 采集桥(目录/正文/封面段) —— route.ts handleChapters/handleContents/handleCover 移植
// 阶段A~E 的 DB 写入循环 + 智能完结终判 + 末章/字数回写 + 封面按 contentType 原格式落盘。
// ============================================================
package bridge

import (
	"context"
	"encoding/base64"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"unicode/utf8"

	"mhgl/internal/crawl/callback"
	"mhgl/internal/crawl/clean"
	"mhgl/internal/crawl/smart"
	"mhgl/internal/crawl/sorter"
	"mhgl/internal/store"
)

// ============================================================
// kind: chapters (目录重排 + 建缺章记录, 对齐 runner existUrlMap/阶段A~E)
// ============================================================

// Chapters kind=chapters: seq=1(首批/单次) 全量形态 reorderToc + 建缺 + 阶段A~E 重编号;
// seq≥2 后续片顺序增量追加(按 Go 给定序尾插建缺章, 不重排既有章, 同片内 URL 去重)。
// [R52-5 P1 off-by-one 语义已内置: Go sendChapters 固定从 seq=1 起发]
func (b *Bridge) Chapters(_ context.Context, p callback.ChaptersPayload) (callback.ChaptersDecision, error) {
	bookURL := asStr(p.BookURL, 2000)
	if bookURL == "" {
		return callback.ChaptersDecision{}, fmt.Errorf("bookUrl 必填")
	}
	if len(p.Items) == 0 {
		return callback.ChaptersDecision{NeedURLs: []string{}}, nil
	}
	ctx, err := b.loadCtx()
	if err != nil {
		return callback.ChaptersDecision{}, err
	}
	task := ctx.task

	// [R61-2c] 身份定位: BookID 直通优先(引擎回传 book 回调产出的书 id), 空则回落
	// sourceUrl —— 修「同名同作者跨源合并」下 A 源建书后按 URL 重查 miss 的误暂停链
	book := b.lookupBookForCallback(p.BookID, bookURL)
	if book == nil {
		b.taskLog("error", fmt.Sprintf("chapters 回调: 书籍不存在(sourceUrl=%s), 忽略本批目录", asStr(bookURL, 120)))
		return callback.ChaptersDecision{}, fmt.Errorf("书籍不存在(先发 book 回调建书)")
	}
	bookID := book.ID
	isFull := task.RecrawlMode == "full"
	existChapters, err := b.db.CrawlLoadExistChapters(bookID)
	if err != nil {
		return callback.ChaptersDecision{}, err
	}

	// 多段目录: seq>1 视为顺序增量追加(Go 按序切片, 不重排/不重编号)
	if p.Seq > 1 {
		need, err := b.appendChapterSlice(bookID, p.Items, existChapters, isFull, task.StorageMode)
		if err != nil {
			return callback.ChaptersDecision{}, err
		}
		return callback.ChaptersDecision{NeedURLs: need}, nil
	}

	// ---------- 全量形态: reorderToc + 匹配/建缺 + 阶段A~E 重编号(runner 语义对齐) ----------
	raw := make([]sorter.TocItem, 0, len(p.Items))
	for _, it := range p.Items {
		title, url := asStr(it.Title, 300), asStr(it.URL, 2000)
		if title == "" && url == "" {
			continue
		}
		raw = append(raw, sorter.TocItem{Title: title, URL: url, Volume: asStr(it.Volume, 150)})
	}
	tocItems := sorter.ReorderToc(raw)
	if len(tocItems) == 0 {
		return callback.ChaptersDecision{NeedURLs: []string{}}, nil
	}

	plan := planChapterSync(tocItems, existChapters, isFull, book.Name)

	// 阶段A: 冲突旧章 → 负数临时位(tt-c 动态基线: 压到全书最小 idx 之下)
	tempBase := chapterTempBase(existChapters, len(plan.moves))
	for mi, mv := range plan.moves {
		_ = b.db.CrawlUpdateChapterIdx(mv.ID, tempBase+mi) // TS .catch(()=>{}) 容错同款
	}
	// 阶段B: 占住新目标位/负位残留的陈旧章 → 挪尾(x-a: 目标位保留集含 moves)
	for _, tmv := range chapterTailMoves(existChapters, plan) {
		_ = b.db.CrawlUpdateChapterIdx(tmv.ID, tmv.TailID)
	}
	// 阶段C: 新章按最终 idx 建行(单行失败计错误不拖垮整本, runner Bug 5 同口径;
	// 唯一约束冲突容忍, 其余错误上抛 → 500 → Go 侧既有退避承担)
	createdCount := 0
	for _, q := range plan.creates {
		err := b.db.CrawlCreateChapter(bookID, q.Idx, q.Title, q.Volume, q.URL, task.StorageMode, nil, 0)
		if err != nil {
			b.taskLog("error", fmt.Sprintf("章节记录创建失败 %s: %s", asStr(q.Title, 60), asStr(err.Error(), 120)))
			if !isUniqueErr(err) {
				return callback.ChaptersDecision{}, err
			}
			continue
		}
		createdCount++
	}
	if createdCount > 0 {
		// 仅累加 chaptersCreated(Next-owned); errors 归 Go 累计计数(单一写者每键)
		if err := b.mergeStatsDelta(map[string]int64{"chaptersCreated": int64(createdCount)}); err != nil {
			return callback.ChaptersDecision{}, err
		}
	}
	// 阶段D: 旧章回填最终 idx + 分卷名回填(kk-a)
	for _, mv := range plan.moves {
		_ = b.db.CrawlUpdateChapterIdx(mv.ID, mv.To)
	}
	for _, vb := range plan.volumeBackfill {
		_ = b.db.CrawlUpdateChapterVolume(vb.ID, vb.Volume)
	}
	// 阶段E: 目录外陈旧章清理([R51-4] 统一保守闸: 量闸 stale>max(50,30%×既有章数) +
	// creates≤10%×tocLen 截断签名闸, 双命中才跳过删除保留数据 —— 宁可残留不可误删)
	currentURLs := make([]string, 0, len(tocItems))
	for _, it := range tocItems {
		if it.URL != "" {
			currentURLs = append(currentURLs, it.URL)
		}
	}
	// [R56-2a] 多段目录(>5000 章分片)防护: 阶段E 的 stale 判定基准=本批 tocItems,
	// seq=1 且 final=false 时后续分片尚未到达, 未到分片的章节(idx>本批条目数)会被
	// 误判「目录外」而删除(量闸+签名闸仅在部分场景兜底) —— 非 final 分片跳过阶段E;
	// 单分片(≤5000 章绝大多数形态)恒 final=true, 行为零变化。多段书的陈旧章清理让位
	// 于数据安全(宁可残留不可误删)
	if len(currentURLs) > 0 && p.Final {
		staleCount, err := b.db.CrawlStaleChaptersCount(bookID, len(tocItems), currentURLs)
		if err != nil {
			return callback.ChaptersDecision{}, err
		}
		if skip, threshold := staleTailGuard(staleCount, len(existChapters), len(plan.creates), len(tocItems)); skip {
			b.taskLog("warn", fmt.Sprintf("阶段E 已拦截: 待删目录外章节 %d 条超过保守阈值 %d, 疑似目录截断, 已保留全部数据", staleCount, threshold))
		} else if staleCount > 0 {
			n, err := b.db.CrawlDeleteStaleChapters(bookID, len(tocItems), currentURLs)
			if err != nil {
				return callback.ChaptersDecision{}, err
			}
			if n > 0 {
				b.taskLog("info", fmt.Sprintf("阶段E: 清理 %d 条目录外陈旧章(idx>%d)", n, len(tocItems)))
			}
		}
	}

	b.taskLog("success", fmt.Sprintf("目录解析完成: 《%s》%d 章(乱序重排+去重后)", book.Name, len(tocItems)))

	// 智能完结终判(runner 同款: 目录末章标题, 仅库里 unknown 时回填)
	if task.SmartComplete {
		if cur, err := b.db.GetBook(bookID); err == nil && cur != nil && cur.Status == "unknown" {
			det := smart.SmartCompleteDetect(smart.CompleteDetectInput{
				LastChapterTitle: tocItems[len(tocItems)-1].Title,
				BookName:         book.Name,
			})
			if det.Status != "unknown" {
				_ = b.db.CrawlUpdateBookStatus(bookID, det.Status)
				b.taskLog("info", fmt.Sprintf("智能完结终判: %s(%s)", det.Status, det.Reason))
			}
		}
	}

	// 末章回写(finishBookOk 同款: latestChapter=目录末章标题, 码点截断 100)
	_ = b.db.CrawlUpdateBookLatestChapter(bookID, sorter.SliceCodePoints(tocItems[len(tocItems)-1].Title, 100))

	// 增量决策(契约 §2 chapters 行): full=全部 url; incremental=新章 url + 未采旧章 url
	// (runner「已存在但未 fetched 的旧章节也进正文队列」语义对齐); 空 → Go 跳过该书正文阶段
	needSet := map[string]struct{}{}
	needURLs := make([]string, 0, len(tocItems))
	pushNeed := func(u string) {
		if u == "" {
			return
		}
		if _, dup := needSet[u]; dup {
			return
		}
		needSet[u] = struct{}{}
		needURLs = append(needURLs, u)
	}
	if isFull {
		for _, it := range tocItems {
			pushNeed(it.URL)
		}
	} else {
		for _, c := range plan.creates {
			pushNeed(c.URL)
		}
		for _, c := range existChapters {
			if !c.Fetched {
				pushNeed(c.URL)
			}
		}
	}
	mode := "增量更新"
	if isFull {
		mode = "完全覆盖"
	}
	b.taskLog("info", fmt.Sprintf("正文队列: 《%s》 %d/%d 章需要采集 (%s)", book.Name, len(needURLs), len(tocItems), mode))
	return callback.ChaptersDecision{NeedURLs: needURLs}, nil
}

// appendChapterSlice 多段目录追加(seq≥2): 按 Go 给定顺序尾插建缺章, 不重排既有章
// (顺序切片的前提是 Go 已按序切分); [R52-5 P3] 同片内重复 URL 只建/决策一次。
// [R57-2a 清理] storageMode 改由任务行传入(原硬编码 "db": 现行引擎 fail-closed 恒 db
// 行为等价, 但与 seq=1 全量路径的 task.StorageMode 口径不一致, 属埋伏式分歧点)
func (b *Bridge) appendChapterSlice(bookID string, items []callback.TocItemPayload, existChapters []store.CrawlExistChapter, isFull bool, storageMode string) ([]string, error) {
	existURLMap := map[string]store.CrawlExistChapter{}
	for _, c := range existChapters {
		if c.URL != "" {
			existURLMap[c.URL] = c
		}
	}
	sliceSeen := map[string]struct{}{}
	tailIdx := 0
	for _, c := range existChapters {
		if c.Idx > tailIdx {
			tailIdx = c.Idx
		}
	}
	var needURLs []string
	created := 0
	for _, it := range items {
		title := clean.CleanChapterTitle(asStr(it.Title, 300), "")
		url := asStr(it.URL, 2000)
		volume := sorter.SliceCodePoints(strings.TrimSpace(asStr(it.Volume, 150)), 120)
		if title == "" && url == "" {
			continue
		}
		if url != "" {
			if _, dup := sliceSeen[url]; dup {
				continue
			}
			sliceSeen[url] = struct{}{}
		}
		if old, ok := existURLMap[url]; url != "" && ok {
			if volume != "" && old.Volume == "" {
				_ = b.db.CrawlUpdateChapterVolume(old.ID, volume)
			}
			if isFull || !old.Fetched {
				needURLs = append(needURLs, url)
			}
			continue
		}
		if url == "" {
			continue
		}
		tailIdx++
		if title == "" {
			title = "未命名章节"
		}
		if err := b.db.CrawlCreateChapter(bookID, tailIdx, title, volume, url, storageMode, nil, 0); err != nil {
			b.taskLog("error", fmt.Sprintf("章节记录创建失败(多段) %s: %s", asStr(title, 60), asStr(err.Error(), 120)))
			continue
		}
		created++
		needURLs = append(needURLs, url)
	}
	if created > 0 {
		if err := b.mergeStatsDelta(map[string]int64{"chaptersCreated": int64(created)}); err != nil {
			return nil, err
		}
	}
	return needURLs, nil
}

// ============================================================
// kind: contents (清洗 + 正文落库, db 模式)
// ============================================================

// stripTagsLen 纯文本长度(cleaned.replace(/<[^>]+>/g,”).length 口径; UTF-16 长度以
// rune 计近似 —— BMP 等价, astral 字符差 1 倍, worklog R55-3a2 留档)
func stripTagsLen(s string) int {
	stripped := tagStripRe.ReplaceAllString(s, "")
	return len([]rune(stripped))
}

// Contents kind=contents: 清洗 + 落库(幂等按 url; 乱序/重发安全; >1.5MB 整章 skip)。
func (b *Bridge) Contents(_ context.Context, p callback.ContentsPayload) error {
	bookURL := asStr(p.BookURL, 2000)
	if bookURL == "" || len(p.Items) == 0 {
		return nil
	}
	ctx, err := b.loadCtx()
	if err != nil {
		return err
	}

	book := b.lookupBookForCallback(p.BookID, bookURL)
	if book == nil {
		b.taskLog("error", fmt.Sprintf("contents 回调: 书籍不存在(sourceUrl=%s), 忽略本批正文", asStr(bookURL, 120)))
		return fmt.Errorf("书籍不存在(先发 book 回调建书)")
	}

	// 批量定位章节(按 bookId+url, 幂等)
	urls := make([]string, 0, len(p.Items))
	for _, it := range p.Items {
		if u := asStr(it.URL, 2000); u != "" {
			urls = append(urls, u)
		}
	}
	chapByUrl, err := b.db.CrawlChaptersByURLs(book.ID, urls)
	if err != nil {
		return err
	}

	saved := 0
	for _, it := range p.Items {
		url := asStr(it.URL, 2000)
		rawHtml := it.ContentHTML
		if url == "" {
			continue
		}
		// [R51-3-b] 超长正文防静默截断: >1.5MB 整章 skip + taskLog warn(宁缺毋残),
		// 章节保持 fetched=false 由下轮增量重试承担
		// ([R59-2c-batch2] rune 计数改 utf8.RuneCountInString: 修前 len([]rune) 对
		// 兆级正文整份物化 []rune 切片(4 字节/码点)纯为计数, 内存放大无谓)
		if n := utf8.RuneCountInString(rawHtml); n > contentMaxRunes {
			b.taskLog("warn", fmt.Sprintf("章节正文超长(%d 字符 > 1.5MB 上限), 跳过本章防截断残文入库: %s", n, asStr(url, 120)))
			continue
		}
		if rawHtml == "" {
			continue
		}
		cleaned := clean.CleanContentHTML(rawHtml, ctx.clean)
		plainLen := stripTagsLen(cleaned)
		if chID, ok := chapByUrl[url]; ok {
			// oo-① 同款容错: 章节行被并发删除时降级建行兜底, 内容不丢失
			if err := b.db.UpdateChapterContent(chID, url, cleaned, plainLen); err != nil {
				b.createChapterWithContent(book.ID, it.Title, url, cleaned, plainLen)
			}
		} else {
			// 建章链缺章兜底(chapters 回调遗漏/乱序): 尾插建行直接带正文
			b.createChapterWithContent(book.ID, it.Title, url, cleaned, plainLen)
		}
		saved++
	}
	if saved > 0 {
		if err := b.mergeStatsDelta(map[string]int64{"chaptersUpdated": int64(saved)}); err != nil {
			return err
		}
		// 书籍字数聚合(finishBookOk 同款统计语义; latestChapter 由 chapters 回调维护)。
		// [R62-f] 优先级裁决: 聚合值 >0 才覆写(聚合值 = 实采正文和, 更准);
		// 聚合值为 0(目录采集中断/正文全空)时保留 book.fields.wordCount 声明初始值,
		// 不把有效声明字数冲成 0
		if agg, err := b.db.CrawlSumWordCount(book.ID); err == nil && agg > 0 {
			_ = b.db.CrawlUpdateBookWordCount(book.ID, agg)
		}
	}
	return nil
}

// createChapterWithContent 缺章兜底建行: idx 用尾插(maxIdx+1), 防 @@unique([bookId,idx])
// 冲突; 失败静默(下轮增量重试)。
func (b *Bridge) createChapterWithContent(bookID, rawTitle, url, cleaned string, plainLen int) {
	maxIdx, err := b.db.CrawlMaxChapterIdx(bookID)
	if err != nil {
		return
	}
	title := clean.CleanChapterTitle(asStr(rawTitle, 300), "")
	if title == "" {
		title = "未命名章节"
	}
	content := cleaned
	_ = b.db.CrawlCreateChapter(bookID, maxIdx+1, title, "", url, "db", &content, plainLen)
}

// ============================================================
// kind: cover (base64 → 按 contentType 原格式落盘 → 回写 Book.cover)
// ============================================================

// coverExtByType contentType → 扩展名(PLAN §7: 无 sharp, 按原格式存; 未知类型回落 .jpg)
func coverExtByType(ct string) string {
	ct = strings.ToLower(strings.TrimSpace(ct))
	switch {
	case strings.Contains(ct, "png"):
		return ".png"
	case strings.Contains(ct, "webp"):
		return ".webp"
	case strings.Contains(ct, "gif"):
		return ".gif"
	default:
		return ".jpg"
	}
}

// Cover kind=cover: b64 解码 ≤10MB(超限报错不截断, 对齐 TS RangeError 语义)→ 原格式
// 落盘 COVER_DIR(env 覆盖, 缺省 web/covers)→ 回写 Book.cover="covers/<file>"。
func (b *Bridge) Cover(_ context.Context, p callback.CoverPayload) error {
	bookURL := asStr(p.BookURL, 2000)
	b64 := p.B64
	if bookURL == "" || b64 == "" {
		return fmt.Errorf("bookUrl/b64 必填")
	}
	// 容错解码(Std → RawStd; 兼容换行/无 padding 形态)
	buf, err := base64.StdEncoding.DecodeString(b64)
	if err != nil {
		buf, err = base64.RawStdEncoding.DecodeString(strings.NewReplacer("\n", "", "\r", "").Replace(b64))
	}
	if err != nil {
		b.taskLog("warn", "封面回调 base64 解码失败, 跳过")
		return fmt.Errorf("封面数据非法(base64 解码失败)")
	}
	if len(buf) == 0 || len(buf) > coverMaxBytes {
		b.taskLog("warn", fmt.Sprintf("封面回调非法(解码后 %d 字节), 跳过", len(buf)))
		return fmt.Errorf("封面数据非法(解码后需 ≤10MB)")
	}
	coverPath, err := b.saveCoverFile(buf, p.ContentType)
	if err != nil {
		b.taskLog("warn", "封面转存失败, 保留原外链封面: "+asStr(err.Error(), 160))
		return nil // ok:true(存盘失败不阻断书的完成, 与 TS saveCoverWebp 失败同语义)
	}
	book := b.lookupBookForCallback(p.BookID, bookURL)
	if book != nil {
		if err := b.db.CrawlUpdateBookCover(book.ID, coverPath); err != nil {
			return err
		}
		// coversSaved 归 Go 累计计数(asyncStats 绝对值覆盖, 单一写者每键); 此处不重复累加
		b.taskLog("success", "封面已存盘: "+coverPath)
	}
	return nil
}

// saveCoverFile 封面文件落盘(返回 covers/<file> 相对形态; 物理目录=coverDir)
func (b *Bridge) saveCoverFile(buf []byte, contentType string) (string, error) {
	dir := b.coverDir
	if dir == "" {
		dir = "web/covers"
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	// [R63-c] os.CreateTemp 原子唯一命名: 修前 NowMS+rand(10000) 在并发封面落盘的
	// 同毫秒窗口可碰撞(1/10000), WriteFile 静默覆写 → 两本书指向同一封面文件
	f, err := os.CreateTemp(dir, fmt.Sprintf("book_%d_*.%s", store.NowMS(), coverExtByType(contentType)))
	if err != nil {
		return "", err
	}
	name := f.Name()
	if err := f.Close(); err != nil {
		return "", err
	}
	if err := os.WriteFile(name, buf, 0o644); err != nil {
		return "", err
	}
	return defaultCoverSubdir + "/" + filepath.Base(name), nil
}

// tagStripRe 纯文本长度计算用标签剥离(与 <[^>]+> 同构)
var tagStripRe = regexp.MustCompile(`<[^>]+>`)
