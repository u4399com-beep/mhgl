// qimao-proxy — 七猫官方 API 签名+AES 外置转换代理(R76 Go 复刻版)
// ============================================================
// 背景(Legado 书源 yckceo 7698.json「⭐七猫[官方]v3.1✨」反译, R62-f bun 版真网验证;
// R76 依 git 历史 4854abe 版逐行复刻为 Go, 「彻底放弃 TS」口径下 mini-service 归 Go):
//   - 官方 API 双域名: api-bc.wtzw.com(search/detail/leader-board) + api-ks.wtzw.com(toc/content)
//   - 全部端点强制验签:
//     params.sign  = MD5(按键名排序 k=v 顺序拼接 + sign_key)   —— 逐请求变化
//     headers.sign = MD5(头组按键名排序 k=v 拼接 + sign_key)   —— 头组静态, 值固定
//     sign_key = 'd3dGiJc651gSQ8w1' (书源明文内置)
//   - 正文加密: content API data.content = Base64( IV[16B] + AES-128-CBC/PKCS5Padding 密文 ),
//     静态密钥 key='242ccb8230d709e1'(16字节 ASCII), IV=密文前16字节随包
//   - 出版书(磨铁等 source 非空)正文解出 EPUB ZIP(PK 魔头), 网文书解出纯文本
//     —— 本代理对 PK 魔头如实返回 ok=false, 规则侧该章 content 为空(诚实留痕)
//
// 与采集引擎的对接面(规则六段全部指向本代理, 纯 JSON):
//
//	list.urlTemplate   = http://127.0.0.1:3013/rank?rank_type=hot_list&tab_type=1
//	list.bookUrl(const)= /detail?bid={id}
//	book/toc/content   = /detail?bid= / /toc?bid= / /content?bid=&cid=
//
// 接口:
//
//	GET /health                  → {ok,service,selfTestOk,apiReachable,upstream}
//	GET /search?wd=&page=        → {ok,total,page,books:[...]}
//	GET /rank?rank_type=&tab_type= → 同 /search 形态(leader-board 单页50本)
//	GET /detail?bid=             → {ok,book:{...}}
//	GET /toc?bid=                → {ok,total,chapters:[{cid,title,words}]}
//	GET /content?bid=&cid=       → {ok,cid,content}  (content=解密后纯文本 \n 分段)
//
// 启动: cd mini-services/qimao-proxy && go build -o qimao-proxy . && ( setsid nohup ./qimao-proxy > /tmp/qimao-proxy.log 2>&1 < /dev/null & )
// 仅绑 127.0.0.1(防滥用); 端口固定 3013。
// ============================================================
package main

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/md5"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	port            = 3013
	signKey         = "d3dGiJc651gSQ8w1"
	aesKeyStr       = "242ccb8230d709e1" // 16 字节 ASCII = AES-128
	apiBC           = "https://api-bc.wtzw.com"
	apiKS           = "https://api-ks.wtzw.com"
	imeiIP          = "2937357107" // 书源内置固定设备参数
	upstreamUA      = "okhttp/3.12.0"
	upstreamTimeout = 15 * time.Second
)

// 头组两套: search 用 channel=qm-xiaomi_If, detail/toc/content 用 channel=unknown(书源原文)
var headersUnk = map[string]string{
	"app-version": "80400", "platform": "android", "reg": "0", "AUTHORIZATION": "",
	"application-id": "com.kmxs.reader", "net-env": "1", "channel": "unknown", "qm-params": "",
}

func headersSearch() map[string]string {
	h := make(map[string]string, len(headersUnk)+1)
	for k, v := range headersUnk {
		h[k] = v
	}
	h["channel"] = "qm-xiaomi_If"
	return h
}

func md5hex(s string) string { sum := md5.Sum([]byte(s)); return hex.EncodeToString(sum[:]) }

// signHeaders 头组签名: 按键名排序(书源 Object.keys().sort() 字典序语义) k=v 拼接 + key
func signHeaders(h map[string]string) map[string]string {
	keys := make([]string, 0, len(h))
	for k := range h {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	var b strings.Builder
	for _, k := range keys {
		b.WriteString(k)
		b.WriteString("=")
		b.WriteString(h[k])
	}
	b.WriteString(signKey)
	out := make(map[string]string, len(h)+1)
	for k, v := range h {
		out[k] = v
	}
	out["sign"] = md5hex(b.String())
	return out
}

// signParams 参数签名: 按键名排序 k=v 拼接 + key
func signParams(p map[string]string) string {
	keys := make([]string, 0, len(p))
	for k := range p {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	var b strings.Builder
	for _, k := range keys {
		b.WriteString(k)
		b.WriteString("=")
		b.WriteString(p[k])
	}
	b.WriteString(signKey)
	return md5hex(b.String())
}

func qs(p map[string]string) string {
	keys := make([]string, 0, len(p))
	for k := range p {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	parts := make([]string, 0, len(keys))
	for _, k := range keys {
		parts = append(parts, k+"="+url.QueryEscape(p[k]))
	}
	return strings.Join(parts, "&")
}

var aesKey = []byte(aesKeyStr)

// aesDecrypt 正文解密: Base64( IV[16B] + AES-128-CBC/PKCS5 密文 )
func aesDecrypt(b64 string) (string, bool) {
	blob, err := base64.StdEncoding.DecodeString(b64)
	if err != nil || len(blob) <= 16 {
		return "", false
	}
	iv := blob[:16]
	block, err := aes.NewCipher(aesKey)
	if err != nil {
		return "", false
	}
	mode := cipher.NewCBCDecrypter(block, iv)
	ct := blob[16:]
	if len(ct)%aes.BlockSize != 0 {
		return "", false
	}
	pt := make([]byte, len(ct))
	mode.CryptBlocks(pt, ct)
	// PKCS5 去填
	if n := len(pt); n > 0 {
		pad := int(pt[n-1])
		if pad > 0 && pad <= aes.BlockSize && pad <= n {
			pt = pt[:n-pad]
		}
	}
	return string(pt), true
}

// aesRoundtripSelfTest 启动自检: AES 加解密回环(离线确定性, 验证 crypto 接线)
func aesRoundtripSelfTest() bool {
	iv := []byte("1234567890abcdef")
	block, err := aes.NewCipher(aesKey)
	if err != nil {
		return false
	}
	pt := []byte("七猫代理自检-七猫代理自检")
	pad := aes.BlockSize - len(pt)%aes.BlockSize
	buf := make([]byte, len(pt)+pad)
	copy(buf, pt)
	for i := len(pt); i < len(buf); i++ {
		buf[i] = byte(pad)
	}
	mode := cipher.NewCBCEncrypter(block, iv)
	mode.CryptBlocks(buf, buf)
	blob := append(append([]byte{}, iv...), buf...)
	text, ok := aesDecrypt(base64.StdEncoding.EncodeToString(blob))
	return ok && text == "七猫代理自检-七猫代理自检"
}

var upClient = &http.Client{
	Timeout:   upstreamTimeout,
	Transport: &http.Transport{MaxIdleConnsPerHost: 2, IdleConnTimeout: 60 * time.Second},
}

// upstreamJSON 上游请求 + JSON 解析 + 错误信封归一
func upstreamJSON(target string, hdrs map[string]string) (bool, int, map[string]any, string) {
	req, err := http.NewRequest(http.MethodGet, target, nil)
	if err != nil {
		return false, -1, nil, "上游请求构造失败: " + err.Error()
	}
	for k, v := range hdrs {
		req.Header.Set(k, v)
	}
	req.Header.Set("User-Agent", upstreamUA)
	resp, err := upClient.Do(req)
	if err != nil {
		return false, -1, nil, "上游网络错误: " + err.Error()
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		return false, resp.StatusCode, nil, "上游读取失败: " + err.Error()
	}
	var j map[string]any
	if err := json.Unmarshal(body, &j); err != nil {
		return false, resp.StatusCode, nil, fmt.Sprintf("非JSON响应(%dB): %.80s", len(body), string(body))
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return false, resp.StatusCode, j, fmt.Sprintf("上游 %d: %s", resp.StatusCode, truncate(fmt.Sprintf("%v", j["errors"]), 120))
	}
	return true, resp.StatusCode, j, ""
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}

// normBook 响应归一化(leader-board 项缺 author/intro/words_num 时从 sub_title 折出)
func normBook(b map[string]any) map[string]any {
	id := fmt.Sprintf("%v", b["id"])
	if !regexp.MustCompile(`^\d+$`).MatchString(id) {
		return nil
	}
	tags := ""
	if pt, ok := b["ptags"].([]any); ok {
		var ss []string
		for _, x := range pt {
			ss = append(ss, fmt.Sprintf("%v", x))
		}
		tags = strings.Join(ss, ",")
	}
	rankTags := ""
	if bl, ok := b["book_tag_list"].([]any); ok {
		var ss []string
		for _, x := range bl {
			if m, ok := x.(map[string]any); ok {
				ss = append(ss, fmt.Sprintf("%v", m["title"]))
			} else {
				ss = append(ss, fmt.Sprintf("%v", x))
			}
		}
		rankTags = strings.Join(ss, ",")
	}
	sub := fmt.Sprintf("%v", b["sub_title"])
	wordsFromSub := ""
	if m := regexp.MustCompile(`[\d.]+万?字`).FindString(sub); m != "" {
		wordsFromSub = m
	}
	statusFromSub := ""
	if strings.Contains(sub, "完结") {
		statusFromSub = "完结"
	} else if strings.Contains(sub, "连载") {
		statusFromSub = "连载中"
	}
	name := orStr(b["original_title"], b["title"])
	author := orStr(b["original_author"], b["author"])
	category := orStr(b["category_over_words"], b["category"])
	if category == "" {
		category = orStr(tags, rankTags)
	}
	isOver := fmt.Sprintf("%v", b["is_over"])
	status := statusFromSub
	if isOver == "1" {
		status = "完结"
	} else if isOver == "0" {
		status = "连载中"
	}
	words := orStr(b["words_num"], b["words"])
	if words == "" {
		words = wordsFromSub
	}
	return map[string]any{
		"id": id, "name": strings.TrimSpace(name), "author": strings.TrimSpace(author),
		"intro": strings.TrimSpace(fmt.Sprintf("%v", b["intro"])), "cover": fmt.Sprintf("%v", b["image_link"]),
		"category": strings.TrimSpace(category), "words": words, "status": status,
		"heat": fmt.Sprintf("%v", b["heat_number"]),
	}
}

func orStr(vals ...any) string {
	for _, v := range vals {
		if s := strings.TrimSpace(fmt.Sprintf("%v", v)); s != "" && s != "<nil>" {
			return s
		}
	}
	return ""
}

func normBooks(list any) []map[string]any {
	arr, _ := list.([]any)
	out := []map[string]any{}
	for _, x := range arr {
		if m, ok := x.(map[string]any); ok {
			if nb := normBook(m); nb != nil {
				out = append(out, nb)
			}
		}
	}
	return out
}

// mapBooks data 载荷安全取(map 或 nil)
func mapBooks(j map[string]any) map[string]any {
	if j == nil {
		return nil
	}
	m, _ := j["data"].(map[string]any)
	return m
}

// strParam any→string(JSON 反序列化数字为 float64)
func strParam(v any) string {
	switch t := v.(type) {
	case string:
		return t
	case float64:
		return strconv.FormatInt(int64(t), 10)
	default:
		return fmt.Sprintf("%v", v)
	}
}

// apiReachableThrottle /health 上游探针 60s 缓存
var (
	healthMu     sync.Mutex
	apiReachable = false
	apiUpstream  = -1
	apiLastCheck time.Time
)

func healthPayload() map[string]any {
	healthMu.Lock()
	need := time.Since(apiLastCheck) > 60*time.Second
	healthMu.Unlock()
	if need {
		sp := map[string]string{"gender": "3", "imei_ip": imeiIP, "page": "1", "wd": "七猫"}
		ok, st, j, _ := upstreamJSON(apiBC+"/search/v1/words?"+qs(withSign(sp)), signHeaders(headersSearch()))
		healthMu.Lock()
		apiReachable = ok && mapBooks(j)["books"] != nil
		apiUpstream = st
		apiLastCheck = time.Now()
		healthMu.Unlock()
	}
	healthMu.Lock()
	defer healthMu.Unlock()
	return map[string]any{"ok": true, "service": "qimao-proxy", "selfTestOk": selfTestOk,
		"apiReachable": apiReachable, "upstream": apiUpstream}
}

var selfTestOk = aesRoundtripSelfTest()

// withSign 参数签名注入
func withSign(p map[string]string) map[string]string {
	out := make(map[string]string, len(p)+1)
	for k, v := range p {
		out[k] = v
	}
	out["sign"] = signParams(p)
	return out
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func handler(w http.ResponseWriter, r *http.Request) {
	defer func() {
		if e := recover(); e != nil {
			writeJSON(w, 500, map[string]any{"ok": false, "error": fmt.Sprintf("代理内部错误: %v", e)})
		}
	}()
	u := r.URL
	switch u.Path {
	case "/health", "/healthz":
		writeJSON(w, 200, healthPayload())
		return
	}

	switch u.Path {
	case "/search":
		wd := u.Query().Get("wd")
		if len(wd) > 60 {
			wd = wd[:60]
		}
		if wd == "" {
			writeJSON(w, 400, map[string]any{"ok": false, "error": "缺 wd 参数"})
			return
		}
		page := 1
		if n, err := strconv.Atoi(u.Query().Get("page")); err == nil && n >= 1 && n <= 100 {
			page = n
		}
		sp := map[string]string{"gender": "3", "imei_ip": imeiIP, "page": strconv.Itoa(page), "wd": wd}
		ok, _, j, e := upstreamJSON(apiBC+"/search/v1/words?"+qs(withSign(sp)), signHeaders(headersSearch()))
		if !ok {
			writeJSON(w, 502, map[string]any{"ok": false, "error": e})
			return
		}
		books := normBooks(mapBooks(j)["books"])
		writeJSON(w, 200, map[string]any{"ok": true, "total": len(books), "page": page, "books": books})

	case "/rank":
		rankType := u.Query().Get("rank_type")
		if rankType == "" {
			rankType = "hot_list"
		}
		tabType := 1
		if n, err := strconv.Atoi(u.Query().Get("tab_type")); err == nil && n > 0 {
			tabType = n
		}
		rp := map[string]string{"rank_type": rankType, "category_id": "0", "tab_type": strconv.Itoa(tabType),
			"category_type": "0", "imei_ip": imeiIP, "book_privacy": "1", "read_preference": "0"}
		ok, _, j, e := upstreamJSON(apiBC+"/api/v1/leader-board?"+qs(withSign(rp)), signHeaders(headersUnk))
		if !ok {
			writeJSON(w, 502, map[string]any{"ok": false, "error": e})
			return
		}
		books := normBooks(mapBooks(j)["books"])
		writeJSON(w, 200, map[string]any{"ok": true, "total": len(books), "books": books})

	case "/detail":
		bid := u.Query().Get("bid")
		if !regexp.MustCompile(`^\d+$`).MatchString(bid) {
			writeJSON(w, 400, map[string]any{"ok": false, "error": "bid 必须为数字"})
			return
		}
		dp := map[string]string{"id": bid, "imei_ip": imeiIP, "teeny_mode": "0"}
		ok, _, j, e := upstreamJSON(apiBC+"/api/v4/book/detail?"+qs(withSign(dp)), signHeaders(headersUnk))
		if !ok {
			writeJSON(w, 502, map[string]any{"ok": false, "error": e})
			return
		}
		data, _ := j["data"].(map[string]any)
		b, _ := data["book"].(map[string]any)
		if b == nil {
			writeJSON(w, 502, map[string]any{"ok": false, "error": "上游 data.book 为空"})
			return
		}
		tags := ""
		if bl, ok2 := b["book_tag_list"].([]any); ok2 {
			var ss []string
			for _, x := range bl {
				if m, ok3 := x.(map[string]any); ok3 {
					ss = append(ss, fmt.Sprintf("%v", m["title"]))
				} else {
					ss = append(ss, fmt.Sprintf("%v", x))
				}
			}
			tags = strings.Join(ss, ",")
		}
		isOver := fmt.Sprintf("%v", b["is_over"])
		status := ""
		if isOver == "1" {
			status = "完结"
		} else if isOver == "0" {
			status = "连载中"
		}
		writeJSON(w, 200, map[string]any{"ok": true, "book": map[string]any{
			"id": orStr(b["id"], bid), "name": strings.TrimSpace(fmt.Sprintf("%v", b["title"])),
			"author": strings.TrimSpace(fmt.Sprintf("%v", b["author"])), "intro": strings.TrimSpace(fmt.Sprintf("%v", b["intro"])),
			"cover": fmt.Sprintf("%v", b["image_link"]), "category": strings.TrimSpace(fmt.Sprintf("%v", b["category1_name"])),
			"category2": strings.TrimSpace(fmt.Sprintf("%v", b["category2_name"])), "keywords": tags,
			"words": fmt.Sprintf("%v", b["words_num"]), "latestChapter": strings.TrimSpace(fmt.Sprintf("%v", b["latest_chapter_title"])),
			"isOver": isOver, "status": status,
		}})

	case "/toc":
		bid := u.Query().Get("bid")
		if !regexp.MustCompile(`^\d+$`).MatchString(bid) {
			writeJSON(w, 400, map[string]any{"ok": false, "error": "bid 必须为数字"})
			return
		}
		tp := map[string]string{"id": bid}
		ok, _, j, e := upstreamJSON(apiKS+"/api/v1/chapter/chapter-list?"+qs(withSign(tp)), signHeaders(headersUnk))
		if !ok {
			writeJSON(w, 502, map[string]any{"ok": false, "error": e})
			return
		}
		data, _ := j["data"].(map[string]any)
		list, _ := data["chapter_lists"].([]any)
		if list == nil {
			writeJSON(w, 502, map[string]any{"ok": false, "error": "上游 data.chapter_lists 非数组"})
			return
		}
		chapters := []map[string]any{}
		for _, x := range list {
			c, ok2 := x.(map[string]any)
			if !ok2 {
				continue
			}
			cid := strParam(c["id"])
			title := strings.TrimSpace(fmt.Sprintf("%v", c["title"]))
			if cid == "" || title == "" {
				continue
			}
			chapters = append(chapters, map[string]any{"cid": cid, "title": title, "words": fmt.Sprintf("%v", c["words"])})
		}
		writeJSON(w, 200, map[string]any{"ok": true, "total": len(chapters), "chapters": chapters})

	case "/content":
		bid, cid := u.Query().Get("bid"), u.Query().Get("cid")
		if !regexp.MustCompile(`^\d+$`).MatchString(bid) || !regexp.MustCompile(`^\d+$`).MatchString(cid) {
			writeJSON(w, 400, map[string]any{"ok": false, "error": "bid/cid 必须为数字"})
			return
		}
		cp := map[string]string{"id": bid, "chapterId": cid}
		ok, _, j, e := upstreamJSON(apiKS+"/api/v1/chapter/content?"+qs(withSign(cp)), signHeaders(headersUnk))
		if !ok {
			writeJSON(w, 502, map[string]any{"ok": false, "error": e})
			return
		}
		data, _ := j["data"].(map[string]any)
		content, _ := data["content"].(string)
		if content == "" {
			writeJSON(w, 502, map[string]any{"ok": false, "error": "上游 data.content 为空"})
			return
		}
		dec, ok2 := aesDecrypt(content)
		if !ok2 {
			writeJSON(w, 502, map[string]any{"ok": false, "error": "AES 解密失败"})
			return
		}
		if strings.HasPrefix(dec, "PK") {
			writeJSON(w, 200, map[string]any{"ok": false, "error": "出版书正文为 EPUB 包, 不支持文本提取", "cid": cid})
			return
		}
		writeJSON(w, 200, map[string]any{"ok": true, "cid": cid, "content": dec})

	default:
		writeJSON(w, 404, map[string]any{"ok": false, "error": "未知路径 " + u.Path})
	}
}

func main() {
	log.Printf("[qimao-proxy] self-test(AES-128-CBC 回环): %t port=%d", selfTestOk, port)
	log.Printf("[qimao-proxy] upstream: %s / %s", apiBC, apiKS)
	srv := &http.Server{
		Addr:              fmt.Sprintf("127.0.0.1:%d", port),
		Handler:           http.HandlerFunc(handler),
		ReadHeaderTimeout: 10 * time.Second,
	}
	log.Fatal(srv.ListenAndServe())
}
