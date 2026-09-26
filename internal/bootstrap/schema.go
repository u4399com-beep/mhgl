// ============================================================
// [R69-a] Go 原生建库自举 — 彻底替代外部 `bunx prisma db push`
//
// 背景: R55 Go 单体化后 store.Open 仍是「零迁移」设计(表结构由 Prisma 历史轮次
// 建好), 导致全新部署/沙箱重置必须依赖 Node 生态(bunx prisma + bootstrap-db.ts)
// 才能起服务。本文件把 Prisma schema(prisma/schema.prisma) 逐表翻译为幂等 DDL,
// 服务启动前自动执行(IF NOT EXISTS, 既有库全部空转, 毫秒级), 从此:
//   - 全新空库: 服务直接可启动(单二进制零外部依赖);
//   - 既有库(Prisma 历史形态): 空转不改动, 零风险。
//
// 列型口径(与 internal/store/db.go 头注一致):
//   - 主键 TEXT(cuid 形态, 应用层 store.NewID 生成);
//   - DateTime 列存 INTEGER 毫秒时间戳(Go 写入恒显式给 epoch-ms,
//     绝不依赖 DEFAULT CURRENT_TIMESTAMP —— 那会写入字符串);
//   - Boolean 列存 INTEGER 0/1; JSON 字段 = TEXT。
//
// 外键: 与 Prisma 同构(onDelete cascade/setNull), 服务 DSN 已开 foreign_keys=1。
// ============================================================
package bootstrap

import (
	"database/sql"
	"fmt"

	_ "modernc.org/sqlite"
)

// schemaDDL 全量幂等 DDL(表 14 + 索引)。顺序: 被引用表先行。
var schemaDDL = []string{
	`CREATE TABLE IF NOT EXISTS "Category" (
	"id" TEXT NOT NULL PRIMARY KEY,
	"name" TEXT NOT NULL,
	"sortOrder" INTEGER NOT NULL DEFAULT 0,
	"createdAt" INTEGER NOT NULL DEFAULT 0
)`,
	`CREATE UNIQUE INDEX IF NOT EXISTS "Category_name_key" ON "Category"("name")`,

	`CREATE TABLE IF NOT EXISTS "Setting" (
	"key" TEXT NOT NULL PRIMARY KEY,
	"value" TEXT NOT NULL DEFAULT '{}'
)`,

	`CREATE TABLE IF NOT EXISTS "Rule" (
	"id" TEXT NOT NULL PRIMARY KEY,
	"name" TEXT NOT NULL,
	"description" TEXT,
	"config" TEXT NOT NULL DEFAULT '{}',
	"enabled" INTEGER NOT NULL DEFAULT 1,
	"createdAt" INTEGER NOT NULL DEFAULT 0,
	"updatedAt" INTEGER NOT NULL DEFAULT 0
)`,

	`CREATE TABLE IF NOT EXISTS "Book" (
	"id" TEXT NOT NULL PRIMARY KEY,
	"num" INTEGER,
	"name" TEXT NOT NULL,
	"author" TEXT NOT NULL DEFAULT '佚名',
	"categoryId" TEXT,
	"intro" TEXT NOT NULL DEFAULT '',
	"cover" TEXT NOT NULL DEFAULT '',
	"status" TEXT NOT NULL DEFAULT 'unknown',
	"keywords" TEXT NOT NULL DEFAULT '',
	"latestChapter" TEXT NOT NULL DEFAULT '',
	"wordCount" INTEGER NOT NULL DEFAULT 0,
	"sourceUrl" TEXT NOT NULL DEFAULT '',
	"sourceRuleId" TEXT,
	"storageMode" TEXT NOT NULL DEFAULT 'db',
	"collectedAt" INTEGER,
	"createdAt" INTEGER NOT NULL DEFAULT 0,
	"updatedAt" INTEGER NOT NULL DEFAULT 0,
	CONSTRAINT "Book_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE
)`,
	`CREATE UNIQUE INDEX IF NOT EXISTS "Book_num_key" ON "Book"("num")`,
	`CREATE INDEX IF NOT EXISTS "Book_categoryId_idx" ON "Book"("categoryId")`,
	`CREATE INDEX IF NOT EXISTS "Book_updatedAt_idx" ON "Book"("updatedAt")`,
	`CREATE INDEX IF NOT EXISTS "Book_wordCount_idx" ON "Book"("wordCount")`,

	`CREATE TABLE IF NOT EXISTS "Chapter" (
	"id" TEXT NOT NULL PRIMARY KEY,
	"bookId" TEXT NOT NULL,
	"idx" INTEGER NOT NULL,
	"title" TEXT NOT NULL,
	"volume" TEXT NOT NULL DEFAULT '',
	"url" TEXT NOT NULL DEFAULT '',
	"content" TEXT,
	"storage" TEXT NOT NULL DEFAULT 'db',
	"filePath" TEXT,
	"wordCount" INTEGER NOT NULL DEFAULT 0,
	"fetched" INTEGER NOT NULL DEFAULT 0,
	"createdAt" INTEGER NOT NULL DEFAULT 0,
	"updatedAt" INTEGER NOT NULL DEFAULT 0,
	CONSTRAINT "Chapter_bookId_idx_key" UNIQUE ("bookId", "idx"),
	CONSTRAINT "Chapter_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book" ("id") ON DELETE CASCADE ON UPDATE CASCADE
)`,
	`CREATE INDEX IF NOT EXISTS "Chapter_bookId_url_idx" ON "Chapter"("bookId", "url")`,
	`CREATE INDEX IF NOT EXISTS "Chapter_updatedAt_idx" ON "Chapter"("updatedAt")`,
	`CREATE INDEX IF NOT EXISTS "Chapter_createdAt_idx" ON "Chapter"("createdAt")`,

	`CREATE TABLE IF NOT EXISTS "BookTag" (
	"id" TEXT NOT NULL PRIMARY KEY,
	"bookId" TEXT NOT NULL,
	"tag" TEXT NOT NULL,
	"source" TEXT NOT NULL DEFAULT 'suggest',
	"hits" INTEGER NOT NULL DEFAULT 0,
	CONSTRAINT "BookTag_bookId_tag_key" UNIQUE ("bookId", "tag"),
	CONSTRAINT "BookTag_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book" ("id") ON DELETE CASCADE ON UPDATE CASCADE
)`,
	`CREATE INDEX IF NOT EXISTS "BookTag_tag_idx" ON "BookTag"("tag")`,

	`CREATE TABLE IF NOT EXISTS "Task" (
	"id" TEXT NOT NULL PRIMARY KEY,
	"name" TEXT NOT NULL,
	"ruleId" TEXT NOT NULL,
	"mode" TEXT NOT NULL DEFAULT 'single',
	"bookUrl" TEXT NOT NULL DEFAULT '',
	"bookIds" TEXT NOT NULL DEFAULT '',
	"bookIdFrom" TEXT NOT NULL DEFAULT '',
	"bookIdTo" TEXT NOT NULL DEFAULT '',
	"listUrl" TEXT NOT NULL DEFAULT '',
	"listStart" INTEGER NOT NULL DEFAULT 1,
	"listEnd" INTEGER NOT NULL DEFAULT 1,
	"bookStart" INTEGER NOT NULL DEFAULT 0,
	"bookEnd" INTEGER NOT NULL DEFAULT 0,
	"recrawlMode" TEXT NOT NULL DEFAULT 'incremental',
	"storageMode" TEXT NOT NULL DEFAULT 'db',
	"engine" TEXT NOT NULL DEFAULT 'ts',
	"fetchConfig" TEXT NOT NULL DEFAULT '{}',
	"threadMin" INTEGER NOT NULL DEFAULT 1,
	"threadMax" INTEGER NOT NULL DEFAULT 3,
	"intervalMin" INTEGER NOT NULL DEFAULT 500,
	"intervalMax" INTEGER NOT NULL DEFAULT 2000,
	"smartCategory" INTEGER NOT NULL DEFAULT 1,
	"smartComplete" INTEGER NOT NULL DEFAULT 1,
	"autoSuggest" INTEGER NOT NULL DEFAULT 1,
	"autoRefresh" INTEGER NOT NULL DEFAULT 0,
	"refreshIntervalMin" INTEGER NOT NULL DEFAULT 30,
	"status" TEXT NOT NULL DEFAULT 'pending',
	"progress" TEXT NOT NULL DEFAULT '{}',
	"stats" TEXT NOT NULL DEFAULT '{}',
	"createdAt" INTEGER NOT NULL DEFAULT 0,
	"updatedAt" INTEGER NOT NULL DEFAULT 0,
	CONSTRAINT "Task_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "Rule" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
)`,
	`CREATE INDEX IF NOT EXISTS "Task_status_idx" ON "Task"("status")`,

	`CREATE TABLE IF NOT EXISTS "TaskLog" (
	"id" TEXT NOT NULL PRIMARY KEY,
	"taskId" TEXT NOT NULL,
	"level" TEXT NOT NULL DEFAULT 'info',
	"message" TEXT NOT NULL,
	"createdAt" INTEGER NOT NULL DEFAULT 0,
	CONSTRAINT "TaskLog_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE
)`,
	`CREATE INDEX IF NOT EXISTS "TaskLog_taskId_id_idx" ON "TaskLog"("taskId", "id")`,
	`CREATE INDEX IF NOT EXISTS "TaskLog_createdAt_idx" ON "TaskLog"("createdAt")`,

	`CREATE TABLE IF NOT EXISTS "Site" (
	"id" TEXT NOT NULL PRIMARY KEY,
	"name" TEXT NOT NULL,
	"domain" TEXT NOT NULL,
	"themeId" TEXT NOT NULL DEFAULT 'aurora',
	"title" TEXT NOT NULL DEFAULT '',
	"description" TEXT NOT NULL DEFAULT '',
	"keywords" TEXT NOT NULL DEFAULT '',
	"icbm" TEXT NOT NULL DEFAULT '35.86166,104.195397',
	"geoRegion" TEXT NOT NULL DEFAULT 'CN',
	"geoPlacename" TEXT NOT NULL DEFAULT '中国',
	"offset" INTEGER NOT NULL DEFAULT 0,
	"isDefault" INTEGER NOT NULL DEFAULT 0,
	"status" INTEGER NOT NULL DEFAULT 1,
	"inLinkWheel" INTEGER NOT NULL DEFAULT 1,
	"createdAt" INTEGER NOT NULL DEFAULT 0,
	"updatedAt" INTEGER NOT NULL DEFAULT 0
)`,
	`CREATE UNIQUE INDEX IF NOT EXISTS "Site_domain_key" ON "Site"("domain")`,

	`CREATE TABLE IF NOT EXISTS "DownloadJob" (
	"id" TEXT NOT NULL PRIMARY KEY,
	"bookId" TEXT NOT NULL,
	"options" TEXT NOT NULL DEFAULT '{}',
	"status" TEXT NOT NULL DEFAULT 'pending',
	"filePath" TEXT,
	"error" TEXT,
	"size" INTEGER NOT NULL DEFAULT 0,
	"createdAt" INTEGER NOT NULL DEFAULT 0,
	CONSTRAINT "DownloadJob_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book" ("id") ON DELETE CASCADE ON UPDATE CASCADE
)`,
	`CREATE INDEX IF NOT EXISTS "DownloadJob_bookId_status_createdAt_idx" ON "DownloadJob"("bookId", "status", "createdAt")`,
	`CREATE INDEX IF NOT EXISTS "DownloadJob_status_createdAt_idx" ON "DownloadJob"("status", "createdAt")`,

	`CREATE TABLE IF NOT EXISTS "FreeProxy" (
	"id" TEXT NOT NULL PRIMARY KEY,
	"protocol" TEXT NOT NULL,
	"host" TEXT NOT NULL,
	"port" INTEGER NOT NULL,
	"anonymity" TEXT NOT NULL DEFAULT '',
	"country" TEXT NOT NULL DEFAULT '',
	"countryName" TEXT NOT NULL DEFAULT '',
	"exitIp" TEXT NOT NULL DEFAULT '',
	"latencyMs" INTEGER,
	"alive" INTEGER NOT NULL DEFAULT 0,
	"successCount" INTEGER NOT NULL DEFAULT 0,
	"failCount" INTEGER NOT NULL DEFAULT 0,
	"healthScore" INTEGER NOT NULL DEFAULT 0,
	"lastError" TEXT NOT NULL DEFAULT '',
	"source" TEXT NOT NULL DEFAULT '',
	"lastCheckedAt" INTEGER,
	"lastSuccessAt" INTEGER,
	"lastUsedAt" INTEGER,
	"createdAt" INTEGER NOT NULL DEFAULT 0,
	"updatedAt" INTEGER NOT NULL DEFAULT 0,
	CONSTRAINT "FreeProxy_protocol_host_port_key" UNIQUE ("protocol", "host", "port")
)`,
	`CREATE INDEX IF NOT EXISTS "FreeProxy_alive_healthScore_idx" ON "FreeProxy"("alive", "healthScore")`,
	`CREATE INDEX IF NOT EXISTS "FreeProxy_country_alive_idx" ON "FreeProxy"("country", "alive")`,
	`CREATE INDEX IF NOT EXISTS "FreeProxy_lastCheckedAt_idx" ON "FreeProxy"("lastCheckedAt")`,

	`CREATE TABLE IF NOT EXISTS "PseoPage" (
	"id" TEXT NOT NULL PRIMARY KEY,
	"siteId" TEXT,
	"keyword" TEXT NOT NULL,
	"slug" TEXT NOT NULL,
	"title" TEXT NOT NULL DEFAULT '',
	"description" TEXT NOT NULL DEFAULT '',
	"keywords" TEXT NOT NULL DEFAULT '',
	"primaryBookId" TEXT,
	"matchedBookIds" TEXT NOT NULL DEFAULT '[]',
	"status" TEXT NOT NULL DEFAULT 'active',
	"source" TEXT NOT NULL DEFAULT 'suggest',
	"createdAt" INTEGER NOT NULL DEFAULT 0,
	"updatedAt" INTEGER NOT NULL DEFAULT 0,
	CONSTRAINT "PseoPage_keyword_key" UNIQUE ("keyword"),
	CONSTRAINT "PseoPage_slug_key" UNIQUE ("slug"),
	CONSTRAINT "PseoPage_primaryBookId_fkey" FOREIGN KEY ("primaryBookId") REFERENCES "Book" ("id") ON DELETE SET NULL ON UPDATE CASCADE
)`,
	`CREATE INDEX IF NOT EXISTS "PseoPage_status_updatedAt_idx" ON "PseoPage"("status", "updatedAt")`,
	`CREATE INDEX IF NOT EXISTS "PseoPage_primaryBookId_idx" ON "PseoPage"("primaryBookId")`,

	`CREATE TABLE IF NOT EXISTS "FriendLink" (
	"id" TEXT NOT NULL PRIMARY KEY,
	"name" TEXT NOT NULL,
	"url" TEXT NOT NULL,
	"logo" TEXT NOT NULL DEFAULT '',
	"sortOrder" INTEGER NOT NULL DEFAULT 0,
	"enabled" INTEGER NOT NULL DEFAULT 1,
	"createdAt" INTEGER NOT NULL DEFAULT 0,
	"updatedAt" INTEGER NOT NULL DEFAULT 0
)`,
	`CREATE INDEX IF NOT EXISTS "FriendLink_enabled_sortOrder_idx" ON "FriendLink"("enabled", "sortOrder")`,

	// Feedback 与 store.ensureFeedbackTable 同构(既有库由 store 侧建过, 此处保证
	// 全新库在 Open 前就有完整形态; 双侧均 IF NOT EXISTS 幂等, 互不冲突)。
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
	"createdAt" INTEGER NOT NULL DEFAULT 0,
	"updatedAt" INTEGER NOT NULL DEFAULT 0
)`,
	`CREATE INDEX IF NOT EXISTS "Feedback_status_createdAt_idx" ON "Feedback"("status", "createdAt")`,
	`CREATE INDEX IF NOT EXISTS "Feedback_type_idx" ON "Feedback"("type")`,
	`CREATE INDEX IF NOT EXISTS "Feedback_ip_createdAt_idx" ON "Feedback"("ip", "createdAt")`,
}

// EnsureSchemaDB 在已打开的连接上执行幂等 DDL(全部 IF NOT EXISTS: 既有库空转)。
func EnsureSchemaDB(db *sql.DB) error {
	for _, stmt := range schemaDDL {
		if _, err := db.Exec(stmt); err != nil {
			return fmt.Errorf("bootstrap: schema: %w", err)
		}
	}
	return nil
}

// EnsureSchema 打开 path 指向的 SQLite 文件, 幂等补全表结构后关闭。
// 服务每次启动前调用(毫秒级), 全新空库由此获得完整 schema —— 单二进制
// 零外部依赖起库, 彻底移除 `bunx prisma db push` 外部依赖。
func EnsureSchema(path string) error {
	// 只补 DDL, 不复用 store.Open(WAL/busy_timeout 等 pragma 由正式 Open 负责);
	// 此处最小 DSN 即可, busy_timeout 防 DDL 窗口偶发锁冲突。
	db, err := sql.Open("sqlite", fmt.Sprintf("file:%s?_pragma=busy_timeout(10000)", path))
	if err != nil {
		return fmt.Errorf("bootstrap: open %s: %w", path, err)
	}
	defer db.Close()
	if err := db.Ping(); err != nil {
		return fmt.Errorf("bootstrap: ping %s: %w", path, err)
	}
	return EnsureSchemaDB(db)
}
