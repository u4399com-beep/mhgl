// ============================================================
// API 注册点(主控所有: agent 3-b 在本包新增自有 handler 文件, 不改本文件)
// TaskController 由 main 装配(实现= internal/crawl 管理器适配)。
// ============================================================
package api

import (
	"net/http"

	"mhgl/internal/auth"
	"mhgl/internal/store"
)

// TaskController 任务生命周期控制面(api 层与采集管理器的边界)。
// 实现方: internal/crawl(3-a); 错误信息直接面向后台展示。
type TaskController interface {
	// Start 启动/续跑任务(幂等: 同 id 在跑返回错误)
	Start(taskID string) error
	// Control pause|resume|stop → 迁移后状态
	Control(taskID, action string) (string, error)
	// Status 引擎侧任务态(exists/running/phase)
	Status(taskID string) (exists, running bool, phase string)
	// StopAll 收割全部在跑任务(进程优雅退出用)
	StopAll()
}

// Deps API 层依赖集。
type Deps struct {
	DB           *store.DB
	Auth         *auth.Service
	Tasks        TaskController
	IsProd       bool
	CookieSecure bool // 会话 Cookie Secure 属性显式开关(config.COOKIE_SECURE; 请求经 https 时自动叠加, 见 auth.SecureFromRequest)
}

// Register 挂载全部 API 路由。
// 健康检查独立于鉴权(探活)。
func Register(mux *http.ServeMux, d Deps) {
	// R60-2b: pseoAutoGenerate 消费缝(书籍入库钩子; 开关关闭时零行为)
	d.initPseoAutoGenerate()

	// ---- 鉴权(公开) ----
	mux.HandleFunc("POST /api/auth/login", d.handleLogin)
	mux.HandleFunc("POST /api/auth/logout", d.handleLogout)
	mux.HandleFunc("GET /api/auth/check", d.handleCheck)
	mux.HandleFunc("GET /api/auth/preview-hint", d.handlePreviewHint)

	// ---- admin: 任务 ----
	admin := func(h http.HandlerFunc) http.HandlerFunc { return requireAdmin(d, h) }
	mux.HandleFunc("GET /api/admin/tasks", admin(d.adminTasksList))
	mux.HandleFunc("POST /api/admin/tasks", admin(d.adminTasksCreate))
	mux.HandleFunc("POST /api/admin/tasks/batch", admin(d.adminTasksBatch))
	mux.HandleFunc("GET /api/admin/tasks/{id}", admin(d.adminTaskDetail))
	mux.HandleFunc("PUT /api/admin/tasks/{id}", admin(d.adminTaskUpdate))
	mux.HandleFunc("DELETE /api/admin/tasks/{id}", admin(d.adminTaskDelete))
	mux.HandleFunc("POST /api/admin/tasks/{id}/control", admin(d.adminTaskControl))
	mux.HandleFunc("GET /api/admin/tasks/{id}/logs", admin(d.adminTaskLogs))

	// ---- admin: 书籍 ----
	mux.HandleFunc("GET /api/admin/books", admin(d.adminBooksList))
	mux.HandleFunc("POST /api/admin/books", admin(d.adminBooksCreate))
	mux.HandleFunc("POST /api/admin/books/batch", admin(d.adminBooksBatch))
	mux.HandleFunc("GET /api/admin/books/{id}", admin(d.adminBookDetail))
	mux.HandleFunc("PUT /api/admin/books/{id}", admin(d.adminBookUpdate))
	mux.HandleFunc("DELETE /api/admin/books/{id}", admin(d.adminBookDelete))
	mux.HandleFunc("GET /api/admin/books/{id}/toc", admin(d.adminBookToc))
	mux.HandleFunc("POST /api/admin/books/{id}/recrawl", admin(d.adminBookRecrawl))
	mux.HandleFunc("POST /api/admin/books/{id}/reclean", admin(d.adminBookReclean))
	mux.HandleFunc("GET /api/admin/books/{id}/keywords", admin(d.adminBookKeywords))
	mux.HandleFunc("POST /api/admin/books/{id}/keywords", admin(d.adminBookKeywordsPost))
	mux.HandleFunc("DELETE /api/admin/books/{id}/keywords", admin(d.adminBookKeywordsDelete))

	// ---- admin: 规则 ----
	mux.HandleFunc("GET /api/admin/rules", admin(d.adminRulesList))
	mux.HandleFunc("POST /api/admin/rules", admin(d.adminRulesCreate))
	mux.HandleFunc("POST /api/admin/rules/batch", admin(d.adminRulesBatch))
	mux.HandleFunc("POST /api/admin/rules/test", admin(d.adminRulesTest))
	mux.HandleFunc("GET /api/admin/rules/builtin", admin(d.adminRulesBuiltin))
	mux.HandleFunc("POST /api/admin/rules/import-builtin", admin(d.adminRulesImportBuiltin))
	mux.HandleFunc("GET /api/admin/rules/{id}", admin(d.adminRuleDetail))
	mux.HandleFunc("PUT /api/admin/rules/{id}", admin(d.adminRuleUpdate))
	mux.HandleFunc("DELETE /api/admin/rules/{id}", admin(d.adminRuleDelete))

	// ---- admin: 仪表盘/健康/设置 ----
	mux.HandleFunc("GET /api/admin/stats", admin(d.adminStats))
	mux.HandleFunc("GET /api/admin/health", admin(d.adminHealth))
	mux.HandleFunc("GET /api/admin/settings", admin(d.adminSettingsGet))
	mux.HandleFunc("PUT /api/admin/settings", admin(d.adminSettingsPut))

	// ---- admin: 分类 ----
	mux.HandleFunc("GET /api/admin/categories", admin(d.adminCategoriesList))
	mux.HandleFunc("POST /api/admin/categories", admin(d.adminCategoriesCreate))
	mux.HandleFunc("POST /api/admin/categories/batch", admin(d.adminCategoriesBatch))
	mux.HandleFunc("POST /api/admin/categories/consolidate", admin(d.adminCategoriesConsolidate))
	mux.HandleFunc("PUT /api/admin/categories/{id}", admin(d.adminCategoryUpdate))
	mux.HandleFunc("DELETE /api/admin/categories/{id}", admin(d.adminCategoryDelete))

	// ---- admin: 站点 ----
	mux.HandleFunc("GET /api/admin/sites", admin(d.adminSitesList))
	mux.HandleFunc("POST /api/admin/sites", admin(d.adminSitesCreate))
	mux.HandleFunc("POST /api/admin/sites/batch", admin(d.adminSitesBatch))
	mux.HandleFunc("POST /api/admin/sites/auto-tdk", admin(d.adminSitesAutoTdk))
	mux.HandleFunc("PUT /api/admin/sites/{id}", admin(d.adminSiteUpdate))
	mux.HandleFunc("DELETE /api/admin/sites/{id}", admin(d.adminSiteDelete))
	mux.HandleFunc("GET /api/admin/sites/{id}/tdk", admin(d.adminSiteTdkGet)) // [R65-b] 智能 TDK 配置读(18 套预设+示例)
	mux.HandleFunc("PUT /api/admin/sites/{id}/tdk", admin(d.adminSiteTdkPut)) // [R65-b] 智能 TDK 配置写(消毒后存 Site.smartTdk)

	// ---- admin: 友链 ----
	mux.HandleFunc("GET /api/admin/links", admin(d.adminLinksList))
	mux.HandleFunc("POST /api/admin/links", admin(d.adminLinksCreate))
	mux.HandleFunc("PUT /api/admin/links", admin(d.adminLinksUpdate))
	mux.HandleFunc("DELETE /api/admin/links", admin(d.adminLinksDelete))
	mux.HandleFunc("POST /api/admin/links/batch", admin(d.adminLinksBatch))

	// ---- admin: 反馈管理 ----
	mux.HandleFunc("GET /api/admin/feedback", admin(d.adminFeedbackList))
	mux.HandleFunc("GET /api/admin/feedback/{id}", admin(d.adminFeedbackDetail))
	mux.HandleFunc("PUT /api/admin/feedback/{id}", admin(d.adminFeedbackUpdate))
	mux.HandleFunc("PATCH /api/admin/feedback/{id}", admin(d.adminFeedbackUpdate))
	mux.HandleFunc("POST /api/admin/feedback/{id}/process", admin(d.adminFeedbackProcess)) // R60-2b 标记已处理
	mux.HandleFunc("DELETE /api/admin/feedback/{id}", admin(d.adminFeedbackDelete))

	// ---- admin: 下载 ----
	mux.HandleFunc("GET /api/admin/downloads", admin(d.adminDownloadsList))
	mux.HandleFunc("POST /api/admin/downloads", admin(d.adminDownloadsCreate))
	mux.HandleFunc("POST /api/admin/downloads/batch", admin(d.adminDownloadsBatch))
	mux.HandleFunc("GET /api/admin/downloads/{id}", admin(d.adminDownloadDetail))
	mux.HandleFunc("DELETE /api/admin/downloads/{id}", admin(d.adminDownloadDelete))

	// ---- admin: 代理池 ----
	mux.HandleFunc("GET /api/admin/proxy-pool", admin(d.adminProxyPool))
	mux.HandleFunc("PATCH /api/admin/proxy-pool", admin(d.adminProxyPoolPatch))
	mux.HandleFunc("DELETE /api/admin/proxy-pool", admin(d.adminProxyPoolDelete))
	mux.HandleFunc("POST /api/admin/proxy-pool/harvest", admin(d.adminProxyHarvest))
	mux.HandleFunc("POST /api/admin/proxy-pool/check", admin(d.adminProxyCheck))
	mux.HandleFunc("POST /api/admin/proxy-pool/prune", admin(d.adminProxyPrune))

	// ---- admin: 备份 ----
	mux.HandleFunc("GET /api/admin/backup", admin(d.adminBackup))
	mux.HandleFunc("POST /api/admin/backup/restore", admin(d.adminBackupRestore))

	// ---- admin: PSEO / 违禁词 / SEO 模板 / 主题 / SEO 审计 ----
	mux.HandleFunc("GET /api/admin/pseo", admin(d.adminPseoList))
	mux.HandleFunc("POST /api/admin/pseo", admin(d.adminPseoGenerate))
	mux.HandleFunc("DELETE /api/admin/pseo", admin(d.adminPseoWipe))
	mux.HandleFunc("PUT /api/admin/pseo/{id}", admin(d.adminPseoUpdate))
	mux.HandleFunc("DELETE /api/admin/pseo/{id}", admin(d.adminPseoDelete))
	mux.HandleFunc("GET /api/admin/banned-words", admin(d.adminBannedWordsGet))
	mux.HandleFunc("PUT /api/admin/banned-words", admin(d.adminBannedWordsPut))
	mux.HandleFunc("GET /api/admin/seo-templates", admin(d.adminSeoTemplatesGet))
	mux.HandleFunc("PUT /api/admin/seo-templates", admin(d.adminSeoTemplatesPut))
	mux.HandleFunc("GET /api/admin/themes", admin(d.adminThemesList))
	mux.HandleFunc("GET /api/admin/themes/override", admin(d.adminThemesOverrideGet))
	mux.HandleFunc("PUT /api/admin/themes/override", admin(d.adminThemesOverridePut))
	mux.HandleFunc("GET /api/admin/seo-audit", admin(d.adminSeoAudit))
	mux.HandleFunc("POST /api/admin/seo-audit", admin(d.adminSeoAudit))

	// ---- public: 数据面 ----
	mux.HandleFunc("GET /api/public/books", d.publicBooks)
	mux.HandleFunc("GET /api/public/book", d.publicBook)
	mux.HandleFunc("GET /api/public/chapter", d.publicChapter)
	mux.HandleFunc("GET /api/public/search", d.publicSearch)
	mux.HandleFunc("GET /api/public/categories", d.publicCategories)
	mux.HandleFunc("GET /api/public/tags", d.publicTags)
	mux.HandleFunc("GET /api/public/related", d.publicRelated)
	mux.HandleFunc("GET /api/public/keyword", d.publicKeyword)
	mux.HandleFunc("GET /api/public/links", d.publicLinks)
	mux.HandleFunc("GET /api/public/sites", d.publicSites)
	mux.HandleFunc("GET /api/public/resolve", d.publicResolve)

	// ---- public: 文件/写入面 ----
	mux.HandleFunc("GET /api/public/cover", d.publicCover)
	mux.HandleFunc("GET /api/public/download", d.publicDownload)
	mux.HandleFunc("POST /api/public/feedback", d.publicFeedbackPost)
	mux.HandleFunc("GET /api/public/feedback", d.publicFeedbackGet)
	mux.HandleFunc("GET /api/public/sitemap", d.publicSitemap)

	// ---- public: 独立反馈页(R60-2b, API 直出最小 HTML, 不进主题模板集; 字面路由优先级高于 web 层兜底 404) ----
	mux.HandleFunc("GET /feedback", d.publicFeedbackPage)
}
