// ============================================================
// 规则类型定义 + 深消毒 + capability 校验
// 语义权威: /home/z/my-project/src/lib/crawl/types.ts(逐字段对齐移植)
// 契约: /home/z/my-project/agent-ctx/go-engine/CONTRACT.md §3/§4
// ============================================================
package rule

import (
	"fmt"
	"regexp"
	"strings"
)

// FieldRule 字段提取规则(TS FieldRule 的 Go 子集: css/regex/json/const;
// xpath 不支持 —— capability 报告 + 引擎 fail-closed 不执行, R55 单体化后无 TS 引擎回退)
type FieldRule struct {
	Type        string `json:"type"`       // css|regex|json|const(xpath 不支持)
	Expression  string `json:"expression"` // 选择器/正则/JSON点路径/常量模板
	Attr        string `json:"attr,omitempty"`
	Flags       string `json:"flags,omitempty"` // regex 使用标志(缺省 gis)
	StripTags   bool   `json:"stripTags,omitempty"`
	ReplaceFrom string `json:"replaceFrom,omitempty"`
	ReplaceTo   string `json:"replaceTo,omitempty"`
	Index       *int   `json:"index,omitempty"` // 截取第 N 项(逗号分隔)
}

// Pagination 翻页规则(TS PageRule.pagination)
type Pagination struct {
	Enabled  bool       `json:"enabled"`
	NextLink *FieldRule `json:"nextLink,omitempty"`
	MaxPages int        `json:"maxPages"`
	JoinWith string     `json:"joinWith,omitempty"`
}

// PageRule 页面级规则(列表页/书籍页/目录页/内容页)
type PageRule struct {
	Enabled      bool                  `json:"enabled"`
	UrlTemplate  string                `json:"urlTemplate,omitempty"`
	ItemSelector *FieldRule            `json:"itemSelector,omitempty"`
	Fields       map[string]*FieldRule `json:"fields"`
	TocLink      *FieldRule            `json:"tocLink,omitempty"`
	Pagination   *Pagination           `json:"pagination,omitempty"`
}

// FetchConfig 反反爬抓取配置(Go 支持子集, 语义对齐 TS FetchConfig)
type FetchConfig struct {
	Engine            string            `json:"engine"` // auto|http|browser(browser 不支持)
	UaMode            string            `json:"uaMode"` // rotate|fixed|custom|mobile|desktop(mobile/desktop = 池子集筛选+头组仿真 v1, 已支持)
	CustomUa          string            `json:"customUa,omitempty"`
	Headers           map[string]string `json:"headers,omitempty"`
	Cookies           string            `json:"cookies,omitempty"`
	AutoCookie        *bool             `json:"autoCookie,omitempty"` // Go http.Client CookieJar 恒开(字段保留兼容)
	Referer           *bool             `json:"referer,omitempty"`
	RefererChain      *bool             `json:"refererChain,omitempty"`
	Timeout           int               `json:"timeout"` // ms
	Retries           int               `json:"retries"`
	WaitSelector      string            `json:"waitSelector,omitempty"`  // 不支持(capability)
	ClickSelector     string            `json:"clickSelector,omitempty"` // 不支持(capability)
	BrowserFallback   []int             `json:"browserFallbackStatus,omitempty"`
	HostGateLimit     int               `json:"hostGateLimit,omitempty"` // per-host 在飞闸, 缺省 3
	HostGateConcurren int               `json:"hostGateConcurrency,omitempty"`
	GlobalConcurrency int               `json:"globalConcurrency,omitempty"` // 全局在飞, 缺省 10
	PathJitter        bool              `json:"pathJitter,omitempty"`
	TokenURL          string            `json:"tokenUrl,omitempty"`
	TokenPattern      string            `json:"tokenPattern,omitempty"`
	TokenInjection    string            `json:"tokenInjection,omitempty"` // url|header
	TokenHeaderName   string            `json:"tokenHeaderName,omitempty"`
	ContentProxyURL   string            `json:"contentProxyUrl,omitempty"`
	AllowLoopback     bool              `json:"allowLoopback,omitempty"`
	ProxyURL          string            `json:"proxyUrl,omitempty"`      // 逗号分隔 http/https 代理池
	MirrorDomains     string            `json:"mirrorDomains,omitempty"` // 逗号分隔镜像组
	ProxyRotation     string            `json:"proxyRotationStrategy,omitempty"`
	JitterMs          int               `json:"jitterMs,omitempty"`
	FetchMode         string            `json:"fetchMode,omitempty"` // scrapling-* 不支持
	ScraplingBridge   string            `json:"scraplingBridgeUrl,omitempty"`
	CurlImpersonate   string            `json:"curlImpersonate,omitempty"` // 不支持(capability)
	TLSFingerprint    string            `json:"tlsFingerprint,omitempty"`  // ""|none(缺省关)|chrome(utls Chrome ClientHello 仿真, 仅 https 生效)
	NeedsProxy        bool              `json:"needsProxy,omitempty"`      // 不支持(capability)
	ProxyCountries    string            `json:"proxyCountries,omitempty"`
}

// CleanConfig 内容清洗配置 —— [R55 起单体化] Go 引擎已内置内容清洗(clean 包
// CleanContentHTML 消费本配置: bridge Contents/Book 与 engine TestRule 均经
// clean.FromRuleRaw 按规则原始 JSON 构建), 旧「clean 传回 TS 侧执行」口径已废;
// 本结构体保留用于 Sanitize/能力校验与字段形态对齐
type CleanConfig struct {
	RemoveSelectors []string `json:"removeSelectors"`
	AdPatterns      []string `json:"adPatterns"`
	Whitelist       []string `json:"whitelist"`
	Normalize       bool     `json:"normalize"`
	PlainText       bool     `json:"plainText"`
}

// RuleConfig 完整规则配置
type RuleConfig struct {
	List    PageRule    `json:"list"`
	Book    PageRule    `json:"book"`
	Toc     PageRule    `json:"toc"`
	Content PageRule    `json:"content"`
	Fetch   FetchConfig `json:"fetch"`
	Clean   CleanConfig `json:"clean"`
}

// TaskInfo 任务参数(契约 §3 TaskStartPayload.task)
type TaskInfo struct {
	ID          string   `json:"id"`
	Mode        string   `json:"mode"` // single|bookIds|range
	BookURL     string   `json:"bookUrl"`
	BookIds     []string `json:"bookIds"`
	BookIdFrom  string   `json:"bookIdFrom"`
	BookIdTo    string   `json:"bookIdTo"`
	ListURL     string   `json:"listUrl"`
	ListStart   int      `json:"listStart"`
	ListEnd     int      `json:"listEnd"`
	BookStart   int      `json:"bookStart"`
	BookEnd     int      `json:"bookEnd"`
	RecrawlMode string   `json:"recrawlMode"` // incremental|full
	StorageMode string   `json:"storageMode"` // v1 仅 db
	ThreadMin   int      `json:"threadMin"`
	ThreadMax   int      `json:"threadMax"`
	IntervalMin int      `json:"intervalMin"`
	IntervalMax int      `json:"intervalMax"`
}

// CallbackInfo 回调目标(契约 §3 TaskStartPayload.callback)
type CallbackInfo struct {
	BaseURL string `json:"baseUrl"`
	Secret  string `json:"secret"`
}

// TaskStartPayload POST /task/start 请求体
type TaskStartPayload struct {
	Task     TaskInfo     `json:"task"`
	Rule     RuleConfig   `json:"rule"`
	Callback CallbackInfo `json:"callback"`
}

// ---------- 消毒辅助(语义对齐 types.ts safeNum/safeBool/safeStr) ----------

// clampInt 数值钳制(R51-2-b #1 修复: 原第 4 参 def 全部被忽略 — 零值语义=字段缺失,
// 取 def 后再钳制。仅用于"0 非法"的字段: MaxPages/Timeout/HostGateLimit/
// GlobalConcurrency; Retries/Index/JitterMs 的 0 值合法, 走 clampZeroOK 勿套本函数)
func clampInt(v, min, max, def int) int {
	if v == 0 {
		v = def
	}
	if v < min {
		return min
	}
	if v > max {
		return max
	}
	return v
}

// clampZeroOK 零值合法钳制(0 为合法取值, 不套缺省语义)
func clampZeroOK(v, min, max int) int {
	if v < min {
		return min
	}
	if v > max {
		return max
	}
	return v
}

func sanitizeStr(v string, maxLen int) string {
	if len(v) > maxLen {
		// 按 rune 截断, 防多字节字符被腰斩
		r := []rune(v)
		if len(r) > maxLen {
			r = r[:maxLen]
		}
		v = string(r)
	}
	return v
}

// sanitizeSingleLine 剥除 CR/LF/NUL 等控制字符(HTTP 头注入防护, 对齐 TS safeSingleLine)
var ctrlRe = regexp.MustCompile(`[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]`)
var crlfRe = regexp.MustCompile(`\r\n?|\n`)

func sanitizeSingleLine(v string) string {
	v = ctrlRe.ReplaceAllString(v, "")
	return crlfRe.ReplaceAllString(v, " ")
}

// headerKeyDenylist 走私向量头/代理识别头(R4-22/R5-15 同口径)
var headerKeyDenylist = map[string]struct{}{
	"host": {}, "content-length": {}, "transfer-encoding": {}, "connection": {},
	"upgrade": {}, "te": {}, "trailer": {}, "expect": {}, "keep-alive": {},
	"proxy-connection": {}, "proxy-authorization": {}, "proxy-authenticate": {},
	"front-end-https": {}, "x-http-method-override": {},
	"via": {}, "forwarded": {},
	"x-forwarded-for": {}, "x-forwarded-host": {}, "x-forwarded-proto": {},
	"x-forwarded-port": {}, "x-forwarded-server": {}, "x-real-ip": {},
	"x-original-url": {}, "x-rewrite-url": {}, "x-cluster-client-ip": {},
}

var headerKeyRe = regexp.MustCompile(`[^!#$%&'*+\-.^_` + "`" + `|~0-9A-Za-z]`)

func sanitizeHeaderKey(v string) (string, bool) {
	s := headerKeyRe.ReplaceAllString(v, "")
	if s == "" {
		return "", false
	}
	if _, bad := headerKeyDenylist[strings.ToLower(s)]; bad {
		return "", false
	}
	return s, true
}

// Sanitize 规则深消毒: 数值钳制/字符串钳长/枚举白名单(对齐 types.ts sanitize* 系列)。
// 解析失败的形状一律回退零值/缺省, 不让脏 JSON 直通引擎。
func (r *RuleConfig) Sanitize() {
	sanitizePageRule(&r.List)
	sanitizePageRule(&r.Book)
	sanitizePageRule(&r.Toc)
	sanitizePageRule(&r.Content)
	sanitizeFetchConfig(&r.Fetch)
}

func sanitizePageRule(p *PageRule) {
	p.UrlTemplate = sanitizeStr(p.UrlTemplate, 1000)
	if p.ItemSelector != nil && !sanitizeFieldRule(p.ItemSelector) {
		p.ItemSelector = nil
	}
	if p.TocLink != nil && !sanitizeFieldRule(p.TocLink) {
		p.TocLink = nil
	}
	if p.Fields == nil {
		p.Fields = map[string]*FieldRule{}
	}
	cleaned := make(map[string]*FieldRule, len(p.Fields))
	n := 0
	for k, fr := range p.Fields {
		if n >= 16 { // 字段数上限(对齐 TS: 正常规则 ≤8 字段)
			break
		}
		if fr == nil || !sanitizeFieldRule(fr) {
			continue
		}
		cleaned[sanitizeStr(k, 40)] = fr
		n++
	}
	p.Fields = cleaned
	if p.Pagination != nil {
		if p.Pagination.NextLink != nil && !sanitizeFieldRule(p.Pagination.NextLink) {
			p.Pagination.NextLink = nil
		}
		p.Pagination.MaxPages = clampInt(p.Pagination.MaxPages, 1, 500, 20)
		p.Pagination.JoinWith = sanitizeStr(p.Pagination.JoinWith, 200)
	}
}

// sanitizeFieldRule 字段规则消毒: type 白名单 + 表达式非空 + 各后处理参数钳制。
// 返回 false 表示整条规则丢弃。
func sanitizeFieldRule(fr *FieldRule) bool {
	switch fr.Type {
	case "css", "regex", "json", "const":
		// 支持
	case "xpath":
		// 保留形状供 capability 报告(消毒不移除, 引擎侧不执行)
	default:
		return false
	}
	fr.Expression = sanitizeStr(fr.Expression, 1000)
	if strings.TrimSpace(fr.Expression) == "" {
		return false
	}
	fr.Attr = sanitizeStr(fr.Attr, 100)
	fr.Flags = sanitizeStr(fr.Flags, 10)
	fr.ReplaceFrom = sanitizeStr(fr.ReplaceFrom, 1000)
	fr.ReplaceTo = sanitizeStr(fr.ReplaceTo, 1000)
	if fr.Index != nil {
		*fr.Index = clampZeroOK(*fr.Index, 0, 100) // 0 值合法(首项), 勿套缺省
	}
	return true
}

func sanitizeFetchConfig(f *FetchConfig) {
	if f.Engine != "auto" && f.Engine != "http" && f.Engine != "browser" {
		f.Engine = "auto"
	}
	switch f.UaMode {
	case "rotate", "fixed", "custom", "mobile", "desktop":
	default:
		f.UaMode = "rotate"
	}
	f.CustomUa = sanitizeSingleLine(sanitizeStr(f.CustomUa, 300))
	if len(f.Headers) > 0 {
		h := make(map[string]string, len(f.Headers))
		n := 0
		for k, v := range f.Headers {
			if n >= 30 {
				break
			}
			key, ok := sanitizeHeaderKey(sanitizeStr(k, 100))
			val := sanitizeSingleLine(sanitizeStr(v, 1000))
			if ok && val != "" {
				h[key] = val
				n++
			}
		}
		f.Headers = h
	}
	f.Cookies = sanitizeSingleLine(sanitizeStr(f.Cookies, 4000))
	f.Timeout = clampInt(f.Timeout, 1000, 120000, 20000) // 缺失(0) → 20000(TS ?? 20000)
	f.Retries = clampZeroOK(f.Retries, 0, 5)             // 0 次重试合法, 勿套缺省
	f.WaitSelector = sanitizeStr(f.WaitSelector, 300)
	f.ClickSelector = sanitizeStr(f.ClickSelector, 300)
	if len(f.BrowserFallback) > 10 {
		f.BrowserFallback = f.BrowserFallback[:10]
	}
	// effectiveHostGateLimit: hostGateConcurrency 优先, 缺失回退 hostGateLimit(TS 同口径)
	if f.HostGateConcurren > 0 {
		f.HostGateLimit = f.HostGateConcurren
	}
	f.HostGateLimit = clampInt(f.HostGateLimit, 1, 10, 3)
	f.GlobalConcurrency = clampInt(f.GlobalConcurrency, 1, 50, 10)
	f.TokenURL = sanitizeStr(f.TokenURL, 1000)
	f.TokenPattern = sanitizeStr(f.TokenPattern, 300)
	if f.TokenInjection != "url" && f.TokenInjection != "header" {
		f.TokenInjection = "url"
	}
	f.TokenHeaderName = sanitizeStr(f.TokenHeaderName, 100)
	f.ContentProxyURL = sanitizeSingleLine(sanitizeStr(f.ContentProxyURL, 500))
	f.ProxyURL = sanitizeStr(f.ProxyURL, 2000)
	f.MirrorDomains = sanitizeStr(f.MirrorDomains, 2000)
	f.JitterMs = clampZeroOK(f.JitterMs, 0, 30000) // 0 = 不抖动, 合法
	f.ScraplingBridge = sanitizeSingleLine(sanitizeStr(f.ScraplingBridge, 300))
	f.CurlImpersonate = sanitizeSingleLine(sanitizeStr(f.CurlImpersonate, 40))
	// tlsFingerprint 枚举白名单(R63-b): 仅 "chrome" 开启(utls Chrome 规格仿真);
	// 空/none/未知值一律归零关闭(脏值直通引擎会让未知指纹形态静默生效)
	if strings.ToLower(strings.TrimSpace(f.TLSFingerprint)) == "chrome" {
		f.TLSFingerprint = "chrome"
	} else {
		f.TLSFingerprint = ""
	}
	f.ProxyCountries = sanitizeStr(f.ProxyCountries, 100)
	// [R63-c] 轮换形态归一: 缺省("")保留 —— 引擎侧 pickProxy 缺省=加权随机(R58-2a,
	// 成功计数为权; TS 语义权威 undefined/缺省=随机形态)。修前 "" 被强改 "round-robin",
	// 使加权缺省在所有经 Sanitize 的生产路径(任务启动/TestRule)永不生效, 纯轮换劫持缺省。
	// "roundrobin" 别名归一; least-used/sticky-host 形状保留(现行由加权缺省承接);
	// 其余未知显式值回退历史纯轮换
	switch f.ProxyRotation {
	case "roundrobin":
		f.ProxyRotation = "round-robin"
	case "", "round-robin", "random", "least-used", "sticky-host":
	default:
		f.ProxyRotation = "round-robin"
	}
}

// SanitizePayload 任务载荷消毒: 任务参数钳制 + 规则深消毒
func (p *TaskStartPayload) Sanitize() {
	t := &p.Task
	t.ID = sanitizeStr(strings.TrimSpace(t.ID), 100)
	t.Mode = strings.TrimSpace(t.Mode)
	t.BookURL = sanitizeStr(strings.TrimSpace(t.BookURL), 2000)
	if len(t.BookIds) > 100000 {
		t.BookIds = t.BookIds[:100000]
	}
	for i := range t.BookIds {
		t.BookIds[i] = sanitizeStr(strings.TrimSpace(t.BookIds[i]), 200)
	}
	t.BookIdFrom = sanitizeStr(strings.TrimSpace(t.BookIdFrom), 20)
	t.BookIdTo = sanitizeStr(strings.TrimSpace(t.BookIdTo), 20)
	t.ListURL = sanitizeStr(strings.TrimSpace(t.ListURL), 2000)
	if t.ListStart <= 0 {
		t.ListStart = 1
	}
	if t.ListEnd < t.ListStart {
		t.ListEnd = t.ListStart
	}
	if t.ListEnd-t.ListStart > 100000 { // 与 TS listStart/listEnd 允许配置上限同量级
		t.ListEnd = t.ListStart + 100000
	}
	t.RecrawlMode = strings.TrimSpace(t.RecrawlMode)
	if t.RecrawlMode != "full" {
		t.RecrawlMode = "incremental" // 缺省增量(与 TS 任务缺省一致)
	}
	t.StorageMode = strings.TrimSpace(t.StorageMode)
	if t.StorageMode != "db" {
		t.StorageMode = "db"
	}
	if t.ThreadMin <= 0 {
		t.ThreadMin = 1
	}
	if t.ThreadMin > 20 {
		t.ThreadMin = 20 // 批上限 20(契约 §2 contents 批 ≤20 章; R51-2-b #7)
	}
	t.ThreadMax = clampInt(t.ThreadMax, t.ThreadMin, 50, t.ThreadMin)
	if t.IntervalMin < 0 {
		t.IntervalMin = 0
	}
	if t.IntervalMax < t.IntervalMin {
		t.IntervalMax = t.IntervalMin
	}
	if t.IntervalMax > 600000 {
		t.IntervalMax = 600000
	}
	p.Rule.Sanitize()
	cb := &p.Callback
	cb.BaseURL = sanitizeSingleLine(sanitizeStr(strings.TrimSpace(cb.BaseURL), 300))
	cb.Secret = sanitizeStr(cb.Secret, 200)
}

// ---------- capability 校验(契约 §4 不支持清单) ----------

// TS DEFAULT_FETCH_CONFIG.browserFallbackStatus 缺省值: 与之相同的列表视为
// "模板缺省携带"而非操作员显式要求浏览器回退 —— 否则全部规则都会被误报 unsupported。
var tsDefaultBrowserFallback = []int{403, 412, 429, 503}

func intSliceEq(a, b []int) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

// Unsupported 返回规则中 Go 引擎不支持的能力清单; 非空时任务 fail-closed 拒绝启动
// (engine.go buildPayload; R55 单体化后无 TS 引擎回退, capability 仅作报告面)。
// 判定口径(契约 §4):
//   - 任意字段/容器/tocLink/nextLink 使用 xpath
//   - fetch.engine='browser' / waitSelector / clickSelector / 自定义 browserFallbackStatus(需无头浏览器)
//   - fetchMode='scrapling-*'
//   - curlImpersonate 非空
//   - needsProxy=true(自动免费代理池)
//
// 注: uaMode='mobile'/'desktop' 自 R51-3-a 头组仿真 v1 落地后已支持
// (UA 池含移动端条目 → 池子集筛选 + 指纹头组按 UA 家族自洽), 不再报 unsupported
func (r *RuleConfig) Unsupported() []string {
	seen := map[string]bool{}
	var out []string
	add := func(s string) {
		if !seen[s] {
			seen[s] = true
			out = append(out, s)
		}
	}
	checkField := func(fr *FieldRule, where string) {
		if fr == nil {
			return
		}
		if fr.Type == "xpath" {
			add("xpath")
		}
	}
	checkPage := func(p *PageRule) {
		for _, fr := range p.Fields {
			checkField(fr, "fields")
		}
		checkField(p.ItemSelector, "itemSelector")
		checkField(p.TocLink, "tocLink")
		if p.Pagination != nil {
			checkField(p.Pagination.NextLink, "pagination.nextLink")
		}
	}
	checkPage(&r.List)
	checkPage(&r.Book)
	checkPage(&r.Toc)
	checkPage(&r.Content)
	f := &r.Fetch
	if f.Engine == "browser" {
		add("fetch.engine=browser")
	}
	if strings.TrimSpace(f.WaitSelector) != "" {
		add("fetch.waitSelector")
	}
	if strings.TrimSpace(f.ClickSelector) != "" {
		add("fetch.clickSelector")
	}
	// browserFallbackStatus: TS 缺省恒带 [403,412,429,503], 仅"显式自定义"才视为
	// 需要浏览器回退语义(否则缺省规则全军覆没, 违背 Go 引擎可用性目标)
	if len(f.BrowserFallback) > 0 && !intSliceEq(f.BrowserFallback, tsDefaultBrowserFallback) {
		add("fetch.browserFallbackStatus")
	}
	if strings.HasPrefix(f.FetchMode, "scrapling-") {
		add("fetch.fetchMode=scrapling-*")
	}
	if strings.TrimSpace(f.CurlImpersonate) != "" {
		add("fetch.curlImpersonate")
	}
	if f.NeedsProxy {
		add("fetch.needsProxy")
	}
	return out
}

// parseBookIDNum 书号串转 int64(非数字 → false; 越界恒收敛 1<<62)。
// [R60-2c] 与 task.parseIDInt(R59-2c-batch2) 同款回绕修复: 修前仅乘加后判 n > 1<<62,
// 20 位数字串在高位乘 10 时越过 int64 上限回绕为负("10000000000000000000" →
// -8446744073709551616), 负值不触发钳制且 Validate 的 to<from 交换后双负跨度可为小值
// (10^20 与 10^20+1 回绕后跨度=2)绕过 BookIDMaxSpan fail-closed; 修后乘 10 前预判
// (n > clamp/10)与乘加后双闸, 任何越界路径恒收敛 1<<62
func parseBookIDNum(s string) (int64, bool) {
	const clamp = int64(1) << 62
	if s == "" {
		return 0, false
	}
	var n int64
	for _, c := range s {
		if c < '0' || c > '9' {
			return 0, false
		}
		if n > clamp/10 { // 乘 10 前预判: 防回绕为负绕过越界检查
			return clamp, true
		}
		n = n*10 + int64(c-'0')
		if n > clamp {
			return clamp, true
		}
	}
	return n, true
}

// Validate 启动前置校验: 不合法时返回错误文案(引擎侧兜底, 正常路径由 API 层拦截)
func (p *TaskStartPayload) Validate() error {
	if p.Task.ID == "" {
		return fmt.Errorf("task.id 不能为空")
	}
	switch p.Task.Mode {
	case "single":
		if p.Task.BookURL == "" {
			return fmt.Errorf("single 模式必须提供 task.bookUrl")
		}
	case "bookIds":
		if len(p.Task.BookIds) == 0 && (p.Task.BookIdFrom == "" || p.Task.BookIdTo == "") {
			return fmt.Errorf("bookIds 模式必须提供 bookIds 列表或 bookIdFrom/bookIdTo 范围")
		}
		if len(p.Task.BookIds) == 0 && !strings.Contains(p.Task.BookURL, "{bookId}") {
			return fmt.Errorf("bookIds 模式 bookUrl 模板缺少 {bookId} 占位符")
		}
		// 范围形态跨度校验(R51-2-b P1-4: parseIDInt 溢出钳 1<<62 后无上限展开 = OOM
		// 崩溃环; fail-closed 拒绝, 错误信息说明上限; 口径同契约 §7 书号 10 万级)
		if len(p.Task.BookIds) == 0 {
			from, ok1 := parseBookIDNum(p.Task.BookIdFrom)
			to, ok2 := parseBookIDNum(p.Task.BookIdTo)
			if ok1 && ok2 {
				if to < from {
					from, to = to, from
				}
				if to-from+1 > BookIDMaxSpan {
					return fmt.Errorf("bookId 范围跨度过大(to-from+1=%d > 上限 %d), 请分批任务(书号范围 fail-closed 拒绝)", to-from+1, int64(BookIDMaxSpan))
				}
			}
		}
	case "range":
		if p.Task.ListURL == "" && p.Rule.List.UrlTemplate == "" {
			return fmt.Errorf("range 模式必须提供 task.listUrl 或 rule.list.urlTemplate")
		}
	default:
		return fmt.Errorf("不支持的 task.mode: %s", p.Task.Mode)
	}
	if p.Callback.BaseURL == "" {
		return fmt.Errorf("callback.baseUrl 不能为空")
	}
	if p.Task.StorageMode != "db" {
		return fmt.Errorf("go 引擎 v1 仅支持 storageMode=db")
	}
	return nil
}
