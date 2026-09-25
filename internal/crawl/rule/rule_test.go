// ============================================================
// 规则解析层单测 — 契约 §4/§8
// 覆盖: constTemplate 算术后缀(含 {q.id|/1000}/除零/缺变量整体置空)、
//
//	json 点路径(数组下标)、css attr/stripTags/replaceFrom、GBK 解码、
//	书号队列(列表/范围展开去重)、列表 URL 展开({page}/{offset:N})、capability 校验
//
// ============================================================
package rule

import (
	"strings"
	"testing"

	"github.com/PuerkitoBio/goquery"
	"golang.org/x/text/encoding/simplifiedchinese"
)

func field(t *testing.T, typ, expr string) *FieldRule {
	t.Helper()
	return &FieldRule{Type: typ, Expression: expr}
}

// ---- constTemplate 算术后缀(R49-9 bqg713 封面规律的 Go 侧等价实现) ----

func TestConstTemplateArithmetic(t *testing.T) {
	cases := []struct {
		name string
		expr string
		vars map[string]string
		want string
	}{
		{"floor除法-bqg713封面", "https://www.bqg616.cc/bookimg/{q.id|/1000}/{q.id}.jpg",
			map[string]string{"q.id": "4321"}, "https://www.bqg616.cc/bookimg/4/4321.jpg"},
		{"floor除法-边界1000", "{v|/1000}", map[string]string{"v": "1000"}, "1"},
		{"加法", "{v|+100}", map[string]string{"v": "50"}, "150"},
		{"减法", "{v|-10}", map[string]string{"v": "50"}, "40"},
		{"普通占位符", "hello-{name}", map[string]string{"name": "世界"}, "hello-世界"},
		{"除零整体置空", "{v|/0}", map[string]string{"v": "10"}, ""},
		{"缺变量整体置空", "https://x/{q.id|/1000}/{q.id}.jpg", map[string]string{"other": "1"}, ""},
		{"非数值算术整体置空", "{v|/10}", map[string]string{"v": "abc"}, ""},
		{"未知算子整体置空", "{v|*2}", map[string]string{"v": "10"}, ""},
		{"未闭合算术整体置空", "{v|/1000", map[string]string{"v": "10"}, ""},
		{"普通占位符缺失置空该占位", "a{missing}b", map[string]string{"v": "1"}, "ab"},
		// [R52-5 P2 对齐] 空后缀 {v|}: 与残缺同口径整体置空(TS 预检2 同语义; 修前渲染原值)
		{"空后缀整体置空", "https://x/img/{v|}.jpg", map[string]string{"v": "42"}, ""},
		// [R52-5 P2 对齐] Infinity: Go ParseFloat 接受但 TS Number.isFinite 拒绝 → 整体置空
		{"Infinity整体置空", "https://x/img/{v|/1000}/a.jpg", map[string]string{"v": "Infinity"}, ""},
		{"加Infinity整体置空", "{v|+5}", map[string]string{"v": "+Inf"}, ""},
		// [R52-5 P2 对齐] NaN: 同上整体置空
		{"NaN整体置空", "https://x/img/{v|/1000}/a.jpg", map[string]string{"v": "NaN"}, ""},
		{"负NaN整体置空", "{v|-1}", map[string]string{"v": "-NaN"}, ""},
		// [R52-5 P2 对齐] N 上限 1~6 位(对齐 TS \d{1,6}): 7 位 N 预检即整体置空
		{"7位N整体置空", "{v|/1234567}", map[string]string{"v": "1234567"}, ""},
		// 6 位 N 仍合法(上限内)
		{"6位N合法", "{v|/123456}", map[string]string{"v": "123456"}, "1"},
		// [R52-5 P3 对齐] 算术臂值 trim(" 42 " → 42, TS String(raw).trim 同口径; 纯 {var} 不 trim)
		{"算术臂值trim", "{v|/1000}", map[string]string{"v": " 42 "}, "0"},
		// [R52-5 P3 对齐] ≥1e21 大数: JS String(number) 科学计数形态(TS String(result) 同口径)
		{"1e21大数科学计数", "{v|+0}", map[string]string{"v": "1e21"}, "1e+21"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			fr := field(t, "const", c.expr)
			got := extractField("", nil, nil, fr, &extractCtx{Vars: c.vars})
			if got != c.want {
				t.Fatalf("constTemplate(%q) = %q, want %q", c.expr, got, c.want)
			}
		})
	}
}

// ---- json 点路径(含数组下标, bqg713 API 型规则核心) ----

func TestJSONDotPath(t *testing.T) {
	body := `{"data":{"list":[{"id":1,"name":"第一本"},{"id":2,"name":"第二本"}],"total":2}}`
	ctx := &extractCtx{JSON: parseJsonBody(body)}
	cases := []struct {
		path string
		want string
	}{
		{"data.list.0.name", "第一本"},
		{"data.list.1.id", "2"},
		{"data.total", "2"},
		{"data.list.9.name", ""}, // 越界 → 空
		{"data.nope", ""},        // 缺失 → 空
	}
	for _, c := range cases {
		fr := field(t, "json", c.path)
		if got := extractField("", nil, nil, fr, ctx); got != c.want {
			t.Fatalf("jsonGet(%q) = %q, want %q", c.path, got, c.want)
		}
	}
	// 根为数组形态: TS jsonGet 语义 —— 数组根 + 字段名段 → undefined(数组必须经
	// itemSelector=json 定位后逐元素作用域提取, ParseList JSON 模式即此形态)
	arrRoot := &extractCtx{JSON: parseJsonBody(`[{"n":"a"},{"n":"b"}]`)}
	fr := field(t, "json", "n")
	if got := extractField("", nil, nil, fr, arrRoot); got != "" {
		t.Fatalf("json 数组根+字段名应返回空(TS 口径), got %q", got)
	}
	// 正确形态: itemSelector 定位数组 → 逐元素为作用域 → 字段提取
	arr := parseJsonBody(`[{"n":"a"},{"n":"b"}]`).([]interface{})
	if got := extractField("", nil, nil, fr, &extractCtx{JSON: arr[1]}); got != "b" {
		t.Fatalf("json 元素作用域取值 = %q, want %q", got, "b")
	}
}

// ---- css 提取: attr/text/stripTags/replaceFrom(正则)/index ----

const cssFixtureHTML = `<html><body>
<div class="item"><a class="t" href="/book/42.html">斗破苍穹</a><span class="a">天蚕土豆</span></div>
<div id="intro"><p>第一段<b>加粗</b></p><p>第二段</p></div>
<div id="meta">字数: 3,456,789 字</div>
</body></html>`

func TestCSSExtract(t *testing.T) {
	doc, err := goquery.NewDocumentFromReader(strings.NewReader(cssFixtureHTML))
	if err != nil {
		t.Fatal(err)
	}
	// attr href
	got := extractField("", doc, nil, &FieldRule{Type: "css", Expression: "a.t", Attr: "href"}, nil)
	if got != "/book/42.html" {
		t.Fatalf("css href = %q", got)
	}
	// text
	got = extractField("", doc, nil, &FieldRule{Type: "css", Expression: "span.a"}, nil)
	if got != "天蚕土豆" {
		t.Fatalf("css text = %q", got)
	}
	// stripTags(取 html 后剥标签)
	got = extractField("", doc, nil, &FieldRule{Type: "css", Expression: "#intro", Attr: "html", StripTags: true}, nil)
	if strings.Contains(got, "<") || !strings.Contains(got, "第一段加粗") {
		t.Fatalf("css stripTags = %q", got)
	}
	// replaceFrom 正则替换(剥"字数: ... 字"壳)
	got = extractField("", doc, nil, &FieldRule{Type: "css", Expression: "#meta",
		ReplaceFrom: "字数:\\s*([0-9,]+)\\s*字", ReplaceTo: "$1"}, nil)
	if got != "3,456,789" {
		t.Fatalf("css replaceFrom = %q", got)
	}
	// index 逗号分段
	got = extractField("", doc, nil, &FieldRule{Type: "css", Expression: "#meta",
		ReplaceFrom: "字数:\\s*", ReplaceTo: "", Index: intPtr(2)}, nil)
	if got != "789 字" {
		t.Fatalf("css index = %q", got)
	}
}

func intPtr(i int) *int { return &i }

// ---- regex 提取(捕获组序号) ----

func TestRegexExtract(t *testing.T) {
	htmlStr := `<a href="/novel/1234/">书</a>`
	got := extractField(htmlStr, nil, nil, &FieldRule{Type: "regex", Expression: `href="([^"]+)"`, Flags: ""}, nil)
	if got != "/novel/1234/" {
		t.Fatalf("regex group1 = %q", got)
	}
}

// ---- GBK 解码(Content-Type + meta 双探测) ----

func TestGBKDecode(t *testing.T) {
	src := "<html><head><title>玄幻小说</title></head><body>天蚕土豆作品</body></html>"
	gbk, err := simplifiedchinese.GBK.NewEncoder().Bytes([]byte(src))
	if err != nil {
		t.Fatal(err)
	}
	// Content-Type 声明 gbk
	cs := SniffCharset([]byte("text/html; charset=gbk"), gbk)
	got := DecodeBody(gbk, cs)
	if !strings.Contains(got, "玄幻小说") || !strings.Contains(got, "天蚕土豆作品") {
		t.Fatalf("gbk(content-type) 解码失真: %q", got)
	}
	// 无 Content-Type → meta 探测(gbk 编码下 meta charset 标签同为 GBK 字节)
	raw := "<html><head><meta charset=\"gbk\"><title>玄幻小说</title></head></html>"
	gbk2, _ := simplifiedchinese.GBK.NewEncoder().Bytes([]byte(raw))
	cs2 := SniffCharset(nil, gbk2)
	got2 := DecodeBody(gbk2, cs2)
	if !strings.Contains(got2, "玄幻小说") {
		t.Fatalf("gbk(meta) 解码失真: cs=%q got=%q", cs2, got2)
	}
}

// ---- 书号队列(列表/范围: 渲染+去重保序, 10 万级纯串操作) ----

func TestBuildBookIdQueue(t *testing.T) {
	// 列表形态: 渲染 + 渲染后去重保序
	q := BuildBookIdQueue([]string{"3", "1", "3", "2"}, "https://x/book/{bookId}.html")
	want := []string{"https://x/book/3.html", "https://x/book/1.html", "https://x/book/2.html"}
	if len(q) != len(want) {
		t.Fatalf("queue len = %d, want %d: %v", len(q), len(want), q)
	}
	for i := range want {
		if q[i] != want[i] {
			t.Fatalf("queue[%d] = %q, want %q", i, q[i], want[i])
		}
	}
	// 范围形态: 1..3 展开
	q2 := BuildBookIdQueueFromRange(1, 3, "https://x/book/{bookId}.html")
	if len(q2) != 3 || q2[0] != "https://x/book/1.html" || q2[2] != "https://x/book/3.html" {
		t.Fatalf("range queue = %v", q2)
	}
	// encodeURIComponent 语义(特殊字符编码)
	q3 := BuildBookIdQueue([]string{"a b"}, "https://x/{bookId}.html")
	if q3[0] != "https://x/a%20b.html" {
		t.Fatalf("encodeURIComponent = %q", q3[0])
	}
	// 10 万级平稳性(纯串操作, 断言仅长度与首尾)
	q4 := BuildBookIdQueueFromRange(1, 100000, "https://x/{bookId}.html")
	if len(q4) != 100000 || q4[0] != "https://x/1.html" || q4[99999] != "https://x/100000.html" {
		t.Fatalf("10万级范围队列异常: len=%d", len(q4))
	}
}

// TestBuildBookIdQueueFromRangeInverted [R54-2a] 倒置范围 panic-safe:
// 修前 from>to 直调使 make(…, 0, to-from+1) 收到负 cap 直接 panic(makeslice),
// fail-closed 二次防线自身不可崩; 修后归一交换, 与调用方 buildBookIdsQueue
// (Validate 同口径先行归一)语义一致
func TestBuildBookIdQueueFromRangeInverted(t *testing.T) {
	// 倒置入参: 归一为 3..7 展开(修前此处 panic)
	got := BuildBookIdQueueFromRange(7, 3, "https://x/book/{bookId}.html")
	if len(got) != 5 || got[0] != "https://x/book/3.html" || got[4] != "https://x/book/7.html" {
		t.Fatalf("倒置范围应归一展开 3..7: %v", got)
	}
	// 相等边界: from==to 单元素
	one := BuildBookIdQueueFromRange(42, 42, "https://x/{bookId}")
	if len(one) != 1 || one[0] != "https://x/42" {
		t.Fatalf("单元素范围异常: %v", one)
	}
	// 跨度截断兜底语义保持: 超上限截至 from..from+span-1
	big := BuildBookIdQueueFromRange(10, BookIDMaxSpan+50, "https://x/{bookId}")
	if len(big) != BookIDMaxSpan || big[0] != "https://x/10" {
		t.Fatalf("超限范围应截断至 %d 条: len=%d first=%s", BookIDMaxSpan, len(big), big[0])
	}
}

// ---- 启动校验(书号范围跨度 fail-closed, R51-2-b P1-4) ----

func TestValidateBookIdSpan(t *testing.T) {
	// 超大范围 → 拒绝(parseIDInt 溢出钳 1<<62 后无上限展开 = OOM 崩溃环)
	big := &TaskStartPayload{Task: TaskInfo{ID: "t1", Mode: "bookIds",
		BookURL: "https://x/book/{bookId}.html", BookIdFrom: "1", BookIdTo: "999999999999", StorageMode: "db"},
		Callback: CallbackInfo{BaseURL: "http://127.0.0.1:3000"}}
	if err := big.Validate(); err == nil {
		t.Fatal("超大 bookIdTo 应被 Validate 拒绝(fail-closed)")
	}
	// 溢出钳制值直灌 → 同样拒绝
	ovf := &TaskStartPayload{Task: TaskInfo{ID: "t2", Mode: "bookIds",
		BookURL: "https://x/book/{bookId}.html", BookIdFrom: "1", BookIdTo: "999999999999999999999999999999", StorageMode: "db"},
		Callback: CallbackInfo{BaseURL: "http://127.0.0.1:3000"}}
	if err := ovf.Validate(); err == nil {
		t.Fatal("溢出级 bookIdTo 应被 Validate 拒绝")
	}
	// 合法范围(上限内) → 通过
	ok := &TaskStartPayload{Task: TaskInfo{ID: "t3", Mode: "bookIds",
		BookURL: "https://x/book/{bookId}.html", BookIdFrom: "1", BookIdTo: "100000", StorageMode: "db"},
		Callback: CallbackInfo{BaseURL: "http://127.0.0.1:3000"}}
	if err := ok.Validate(); err != nil {
		t.Fatalf("上限内范围应通过: %v", err)
	}
}

// ---- 列表 URL 展开({page}/{offset:N}) ----

func TestExpandListURL(t *testing.T) {
	if got := ExpandListURL("https://x/list/{page}.html", 3); got != "https://x/list/3.html" {
		t.Fatalf("{page} = %q", got)
	}
	if got := ExpandListURL("https://x/api?page={offset:10}", 3); got != "https://x/api?page=20" {
		t.Fatalf("{offset:10} p3 = %q", got) // (3-1)*10=20
	}
	if got := ExpandListURL("https://x/api?page={offset:10}", 1); got != "https://x/api?page=0" {
		t.Fatalf("{offset:10} p1 = %q", got)
	}
	if !HasUnrecognizedPlaceholder("https://x/{unknown}") {
		t.Fatalf("未知占位符应被识别")
	}
	if HasUnrecognizedPlaceholder("https://x/list/{page}.html") {
		t.Fatalf("{page} 不应判为未知占位符")
	}
}

// ---- capability 校验(契约 §4: 不支持特性 → unsupported 非空) ----

func TestUnsupportedCapability(t *testing.T) {
	// 干净规则 → 空
	clean := &RuleConfig{}
	clean.List = PageRule{Enabled: true, Fields: map[string]*FieldRule{"name": {Type: "css", Expression: "h1"}}}
	clean.Book = PageRule{Enabled: true, Fields: map[string]*FieldRule{"name": {Type: "css", Expression: "h1"}}}
	clean.Toc = PageRule{Enabled: true, Fields: map[string]*FieldRule{"title": {Type: "css", Expression: "a"}}}
	clean.Content = PageRule{Enabled: true, Fields: map[string]*FieldRule{"content": {Type: "css", Expression: "#c"}}}
	clean.Fetch = FetchConfig{Engine: "http", UaMode: "fixed", Timeout: 20000}
	if u := clean.Unsupported(); len(u) != 0 {
		t.Fatalf("干净规则不应有 unsupported: %v", u)
	}
	// xpath 字段 → unsupported
	xp := &RuleConfig{}
	xp.Content = PageRule{Enabled: true, Fields: map[string]*FieldRule{"content": {Type: "xpath", Expression: "//div"}}}
	if u := xp.Unsupported(); len(u) == 0 {
		t.Fatalf("xpath 应报 unsupported")
	}
	// browser 引擎 → unsupported
	bw := &RuleConfig{}
	bw.Content = PageRule{Enabled: true, Fields: map[string]*FieldRule{"content": {Type: "css", Expression: "#c"}}}
	bw.Fetch = FetchConfig{Engine: "browser", Timeout: 20000}
	if u := bw.Unsupported(); len(u) == 0 {
		t.Fatalf("browser 引擎应报 unsupported")
	}
	// scrapling 模式 → unsupported
	sc := &RuleConfig{}
	sc.Content = PageRule{Enabled: true, Fields: map[string]*FieldRule{"content": {Type: "css", Expression: "#c"}}}
	sc.Fetch = FetchConfig{Engine: "http", UaMode: "fixed", Timeout: 20000, FetchMode: "scrapling-stealthy"}
	if u := sc.Unsupported(); len(u) == 0 {
		t.Fatalf("scrapling fetchMode 应报 unsupported")
	}
}

// ---- [R58-2a] safeReplaceAll 零宽匹配 × $& 占位符(修前 nil groups panic) ----

func TestSafeReplaceAllZeroWidthMatchPlaceholders(t *testing.T) {
	// a* 在 "bcd" 上产生 4 个零宽匹配(位置 0/1/2/3): 替换串含 $& 时修前对 nil groups
	// 索引 panic(RE2 零宽匹配常见于 a*/a? 形态替换); 修后 $& 在零宽匹配下展开为空串,
	// 与 TS String.replace 语义一致
	got := safeReplaceAll("bcd", "a*", "<$&>")
	want := "<>b<>c<>d<>"
	if got != want {
		t.Fatalf("zero-width $& = %q, want %q", got, want)
	}
	// 非零宽形态回归: $&/$1/组交换正常展开
	if got := safeReplaceAll("abc", "b", "<$&>"); got != "a<b>c" {
		t.Fatalf("plain $& = %q", got)
	}
	if got := safeReplaceAll("abc", "(a)(b)", "$2$1"); got != "bac" {
		t.Fatalf("group swap = %q", got)
	}
}

// ---- [R58-2a] regexExtractAll 匹配上限(修前 -1 无界预分配内存放大) ----

func TestRegexExtractAllCapped(t *testing.T) {
	body := strings.Repeat("x", 20000) // 2 万个单字符匹配点
	got := regexExtractAll(body, &FieldRule{Type: "regex", Expression: `x`, Flags: ""})
	if len(got) != 5000 {
		t.Fatalf("cap = %d, want 5000", len(got))
	}
}

// ---- [R60-2c] parseBookIDNum 溢出回绕为负(与 task.parseIDInt R59-2c-batch2 同款) ----

func TestParseBookIDNumOverflowClamp(t *testing.T) {
	const clamp = int64(1) << 62
	cases := []struct {
		in   string
		want int64
		ok   bool
	}{
		{"123", 123, true},
		{"", 0, false},
		{"12a", 0, false},
		{"-5", 0, false},
		{"4611686018427387903", clamp - 1, true}, // 恰在界下(1<<62-1)
		{"4611686018427387904", clamp, true},     // 恰在界(1<<62)
		{"4611686018427387905", clamp, true},     // 界上 1
		{"99999999999999999999", clamp, true},    // 20 位: 修后在高位乘 10 前预判钳制
		{"10000000000000000000", clamp, true},    // 20 位回绕形态: 修前 → -8446744073709551616
		{"10000000000000000001", clamp, true},    // 20 位回绕+1: 修前与上一条跨度=2 绕过跨度校验
	}
	for _, c := range cases {
		got, ok := parseBookIDNum(c.in)
		if got != c.want || ok != c.ok {
			t.Errorf("parseBookIDNum(%q) = (%d, %v), want (%d, %v)", c.in, got, ok, c.want, c.ok)
		}
	}
}

// ---- [R60-2c] expandReplaceTo TS GetSubstitution 对齐: $0 字面量/未参与组空串 ----

func TestExpandReplaceToGroupSemantics(t *testing.T) {
	// $0 恒为字面量(JS 特殊替换仅认 $1~$9/$01~$99; 修前误展为全匹配)
	if got := safeReplaceAll("abc", "b", "[$0]"); got != "a[$0]c" {
		t.Fatalf("$0 = %q, want a[$0]c", got)
	}
	// 组存在但未参与匹配 → 空串(TS: n≤m 且 capture undefined → empty; 修前字面 "$1" 泄漏)
	if got := safeReplaceAll("abc", "(x)?b", "<$1>"); got != "a<>c" {
		t.Fatalf("unset group $1 = %q, want a<>c", got)
	}
	// 两位组号未参与 → 空串(TS: nn≤m 且 undefined → empty; 修前回退 $1+字面);
	// 匹配外尾字 "c" 原样保留(替换面仅匹配区段)
	if got := safeReplaceAll("abc", "(a)(x)?b", "$1$2"); got != "ac" {
		t.Fatalf("two-digit unset group = %q, want ac", got)
	}
	// 组号超出模式组数 → 字面量保留(既有语义回归)
	if got := safeReplaceAll("abc", "b", "$9"); got != "a$9c" {
		t.Fatalf("out-of-range group = %q, want a$9c", got)
	}
	// 参与组回归: 既有 $&/$1/组交换语义不变
	if got := safeReplaceAll("abc", "(a)(b)", "$2$1"); got != "bac" {
		t.Fatalf("group swap regression = %q", got)
	}
}

// ---- [R60-2c] regexExtract/regexExtractAll TS m[group] ?? m[0] 语义: 参与空串组 → 空串 ----

func TestRegexExtractParticipatingEmptyGroup(t *testing.T) {
	// 参与且空串: 修前 m[group]=="" 与"未参与"不可分 → 回退 m[0] 把整匹配当字段值注入;
	// 修后与 TS 一致返回空串(字段缺失, 由调用方跳过)
	rule := &FieldRule{Type: "regex", Expression: `首发(?:于)?([a-z.]*)`}
	if got := regexExtract("首发于", rule); got != "" {
		t.Fatalf("participating-empty group = %q, want \"\"", got)
	}
	// 同形态非空匹配回归: 正常取组 1
	if got := regexExtract("首发于abc.com", rule); got != "abc.com" {
		t.Fatalf("normal group = %q, want abc.com", got)
	}
	// 未参与组(可选组未命中) → m[0](TS m[1]=undefined → m[0]; m[0]=整正则匹配 "作者：")
	rule2 := &FieldRule{Type: "regex", Expression: `作者[：:](?:([^<]+)<[^>]+>)?`}
	if got := regexExtract("作者：张三", rule2); got != "作者：" {
		t.Fatalf("unset group fallback m[0] = %q, want 作者：", got)
	}
	// regexExtractAll 同语义: 参与空串 → ""(位置仍在, 保序)
	all := regexExtractAll("首发于1首发于abc.com", &FieldRule{Type: "regex", Expression: `首发(?:于)?([a-z.]*)`, Flags: "g"})
	if len(all) != 2 || all[0] != "" || all[1] != "abc.com" {
		t.Fatalf("regexExtractAll = %v, want [\"\" abc.com]", all)
	}
	// attr=组号且该组未参与 → m[0] 兜底(既有语义回归; "ac": (a) 命中, (x)? 空, c 命中)
	rule3 := &FieldRule{Type: "regex", Expression: `(a)(x)?c`, Attr: "2"}
	if got := regexExtract("ac", rule3); got != "ac" {
		t.Fatalf("attr unset group = %q, want ac", got)
	}
}

// TestR68bCollapseSpaceUnicodeFieldValues [R68-b] 字段值空白折叠 unicode 补全回归:
// 修前 collapseSpaceRe 裸 \s+ 不含 U+00A0/U+3000/U+2005/U+FEFF 等 unicode 空白
// (注释宣称"含全角空格族"与实现相悖) —— "连载\xa0中"类 status/keywords 值把
// nbsp/全角空格原样带入字段。
func TestR68bCollapseSpaceUnicodeFieldValues(t *testing.T) {
	cases := []struct{ in, want string }{
		{"连载\u00a0中", "连载 中"},
		{"\u3000仙侠\u3000", "仙侠"},
		{"\ufeff玄幻推荐", "玄幻推荐"},
		{"a\u2005b", "a b"},
		{"连载\u2028中", "连载 中"},
		{"普通\t空白\n折叠", "普通 空白 折叠"},
	}
	for _, c := range cases {
		if got := cleanTextFieldMinimal(c.in, 0); got != c.want {
			t.Fatalf("cleanTextFieldMinimal(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}
