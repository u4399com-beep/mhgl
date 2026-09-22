// ============================================================
// R55-3b — API 统一件: 鉴权包装 / 信封 / 入参消毒 / 分页钳制
//
// 信封契约(主控裁定, 与 src/lib/api.ts 的 {ok:false,message} 有差):
//
//	成功 {ok:true, data:...} / 失败 {ok:false, error:"..."}
//
// TS 原件 message→error 的键名偏差已记入 PARITY(worklog R55-3b)。
//
// requireAdmin: 无有效会话 → 401 {ok:false,error:"未登录"};
// 对全部 /api/admin/** 用包装器(登录限流已在 auth 四端点内置)。
// CORS 不需要(同源部署)。
// ============================================================
package api

import (
	"encoding/json"
	"io"
	"math"
	"net/http"
	"regexp"
	"strconv"
	"strings"

	"mhgl/internal/store"
)

// apiOK 统一成功信封。
func apiOK(w http.ResponseWriter, data any) {
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "data": data})
}

// apiErr 统一失败信封。
func apiErr(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]any{"ok": false, "error": msg})
}

// requireAdmin 管理面鉴权包装。
func requireAdmin(d Deps, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !d.Auth.Check(r) {
			apiErr(w, http.StatusUnauthorized, "未登录")
			return
		}
		next(w, r)
	}
}

// ---------------- 请求体 ----------------

const defaultBodyMax = 5 << 20 // 5MB(对齐 readBody 缺省)

// readBodyMap 读 JSON body 进 map(超限 413; 解析失败返回空 map, 对齐 readBody 语义)。
func readBodyMap(w http.ResponseWriter, r *http.Request, maxBytes int64) map[string]any {
	if maxBytes <= 0 {
		maxBytes = defaultBodyMax
	}
	raw, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxBytes))
	if err != nil {
		// MaxBytesReader 超限时 ErrTooLarge 类错误 → 413
		if strings.Contains(err.Error(), "request body too large") {
			apiErr(w, http.StatusRequestEntityTooLarge, "请求体过大(超过上限)")
		} else {
			apiErr(w, http.StatusBadRequest, "请求体非法")
		}
		return nil
	}
	if len(strings.TrimSpace(string(raw))) == 0 {
		return map[string]any{}
	}
	var m map[string]any
	if err := json.Unmarshal(raw, &m); err != nil || m == nil {
		return map[string]any{}
	}
	return m
}

// isPlainObj 对应 TS isPlainObject(非数组/非 null 的对象)。
func isPlainObj(v any) bool {
	if v == nil {
		return false
	}
	if _, ok := v.(map[string]any); ok {
		return true
	}
	// JSON 数字/字符串/布尔/数组一律非 plain object
	return false
}

// bodyOK: body 解析失败(readBodyMap 返回 nil)时已写响应, 调用方直接 return。
func bodyOK(m map[string]any) bool { return m != nil }

// ---------------- 标量消毒(对齐 _lib/http.ts) ----------------

// strOf 非字符串→” / 超长截断。
func strOf(v any, maxLen int) string {
	s, ok := v.(string)
	if !ok {
		if v == nil {
			return ""
		}
		s = store.ToStr(v)
	}
	if maxLen > 0 && len(s) > maxLen {
		s = s[:maxLen]
	}
	return s
}

// clampIntOf 整数钳制: 缺失(nil/空串)→默认; NaN/越界→边界。
func clampIntOf(v any, def, min, max int) int {
	if v == nil {
		return def
	}
	var n float64
	switch x := v.(type) {
	case float64:
		n = x
	case string:
		if strings.TrimSpace(x) == "" {
			return def
		}
		f, err := strconv.ParseFloat(strings.TrimSpace(x), 64)
		if err != nil {
			return def
		}
		n = f
	case int64:
		n = float64(x)
	case int:
		n = float64(x)
	case bool:
		if x {
			return 1
		}
		return 0
	default:
		return def
	}
	if math.IsNaN(n) || math.IsInf(n, 0) {
		return def
	}
	iv := int64(n)
	if iv < int64(min) {
		return min
	}
	if iv > int64(max) {
		return max
	}
	return int(iv)
}

// likeSafe 搜索词清洗: trim + LIKE 通配符替换为空格 + 截断。
func likeSafe(v any, maxLen int) string {
	s := strOf(v, maxLen)
	s = strings.TrimSpace(s)
	s = strings.ReplaceAll(s, "%", " ")
	s = strings.ReplaceAll(s, "_", " ")
	s = strings.ReplaceAll(s, "\\", " ")
	return s
}

var placeholderRe = regexp.MustCompile(`%7B|%7D`)

// httpUrlOf 校验 http(s) URL; 规范化后还原 { } 字面(占位符模板口径)。
// 非法返回 ""。
func httpUrlOf(v any, maxLen int) string {
	s := strings.TrimSpace(strOf(v, maxLen))
	if s == "" {
		return ""
	}
	// 仅允许 http/https
	low := strings.ToLower(s)
	if !strings.HasPrefix(low, "http://") && !strings.HasPrefix(low, "https://") {
		return ""
	}
	// 基本结构校验: scheme://host(至少一个非分隔字符)
	rest := s[len("http://"):]
	if strings.HasPrefix(low, "https://") {
		rest = s[len("https://"):]
	}
	if rest == "" || strings.ContainsAny(rest, " \t\r\n\"<>\\") {
		return ""
	}
	// 还原 %7B/%7D → { }(R12-a-1 口径)
	return placeholderRe.ReplaceAllStringFunc(s, func(m string) string {
		if strings.EqualFold(m, "%7B") {
			return "{"
		}
		return "}"
	})
}

// ---------------- 分页 ----------------

// pageClamp 分页参数钳制(page 1..1e6 / size 1..maxSize; 越界页由调用方按 total 收口)。
func pageClamp(q pageQuery, defPage, defSize, maxSize int) (page, size int) {
	page = clampIntOf(q.Get("page"), defPage, 1, 1_000_000)
	size = clampIntOf(q.Get("size"), defSize, 1, maxSize)
	return page, size
}

// pageQuery 兼容 r.URL.Query() 的极小接口(便于测试替身; 生产直传 url.Values)。
type pageQuery interface{ Get(key string) string }

// lastPage 越界页钳到末页(ceil(total/size), 空表=1)。
func lastPage(total, size int) int {
	if size <= 0 {
		return 1
	}
	p := (total + size - 1) / size
	if p < 1 {
		return 1
	}
	return p
}

// ---------------- 任务进度瘦身(R9-d-6 口径) ----------------

const (
	progressSlimThreshold = 64 * 1024
	progressSlimKeep      = 200
)

// slimProgress 对 task.progress 做瘦身: 超 64KB 时截断 4 个续采集合到 200 条。
// 返回 (新串, 是否截断); 非 JSON/未超阈值原样返回。
func slimProgress(raw any) (any, bool) {
	s, ok := raw.(string)
	if !ok || len(s) <= progressSlimThreshold {
		return raw, false
	}
	var obj map[string]json.RawMessage
	if err := json.Unmarshal([]byte(s), &obj); err != nil || obj == nil {
		return raw, false
	}
	truncated := false
	for _, key := range []string{"discoveredBookUrls", "completedBookUrls", "ongoingBookUrls"} {
		var arr []json.RawMessage
		if v, ok := obj[key]; ok && json.Unmarshal(v, &arr) == nil && len(arr) > progressSlimKeep {
			keep, _ := json.Marshal(arr[:progressSlimKeep])
			obj[key] = keep
			truncated = true
		}
	}
	var blc map[string]json.RawMessage
	if v, ok := obj["bookLastChapters"]; ok && json.Unmarshal(v, &blc) == nil && len(blc) > progressSlimKeep {
		out := make(map[string]json.RawMessage, progressSlimKeep)
		i := 0
		for k, mv := range blc {
			out[k] = mv
			i++
			if i >= progressSlimKeep {
				break
			}
		}
		keep, _ := json.Marshal(out)
		obj["bookLastChapters"] = keep
		truncated = true
	}
	if !truncated {
		return raw, false
	}
	b, err := json.Marshal(obj)
	if err != nil {
		return raw, false
	}
	return string(b), true
}

// slimRowMap 对行 map 的 progress 字段原位瘦身, 截断时附 progressTruncated 标记。
func slimRowMap(row map[string]any) map[string]any {
	if v, ok := row["progress"]; ok {
		if ns, trunc := slimProgress(v); trunc {
			row["progress"] = ns
			row["progressTruncated"] = true
		}
	}
	return row
}
