// bqg-unlock — 笔趣阁 bqg713 家族内容 API token 桥(R76-b3)。
//
// 背景: bqg713.cc 家族(list/book/booklist 明文 query 形态在主域 200 可采)的正文
// 端点 /api/chapter 对明文 query 形态(id=&chapterid=)一律 403(apige.cc/apibi.cc/
// apiqu.cc 三个内容域同形态)。前端 read.js(jsjiami v7 混淆)逆向结果:
//
//	get_api('chapter', {id, chapterid})
//	  = gethost() + '/api/chapter?token=' + encodeURIComponent(enaes(JSON.stringify(params)))
//	enaes: code = MD5('book@token.html').hexdigest()
//	       iv  = Utf8.parse(code[0:16]); key = Utf8.parse(code[16:32])   // AES-128
//	       CryptoJS.AES.encrypt(pt, key, {iv, mode: CBC, padding: Pkcs7}).toString()
//	site = ['apibi.cc','apiqu.cc','apige.cc'](read.js 混淆字符串表实测解码)
//
// 即: token = base64(AES-128-CBC-PKCS7(JSON.stringify(params)))。明文 JSON 与
// JS JSON.stringify 逐字节对齐(struct 字段序 id→chapterid, 数字无引号, 无空格)。
//
// 服务契约(与 fetch.FetchContentRef/fetchViaContentRef 消费端对齐):
//
//	GET /unlock?url=<encodeURIComponent(原始章节URL)>
//	  → 200 {"ok":true,"content":"<正文纯文本>"}   (content 引擎侧 wrapLinesToParagraphs)
//	  → 502 {"ok":false,"error":"..."}             (引擎降级直连原 URL)
//	GET /healthz → "ok"
//
// 仅绑 127.0.0.1; host 白名单防滥用; 同 host 请求 ≥600ms 节流。
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
	"strings"
	"sync"
	"time"
)

// aesKey/aesIV 依据逆向常量 'book@token.html' 的 MD5 hex 派生(启动时算一次)。
var (
	aesKey []byte // hex 串后 16 字节(UTF-8 of hex[16:32])
	aesIV  []byte // hex 串前 16 字节(UTF-8 of hex[0:16])
)

func init() {
	sum := md5.Sum([]byte("book@token.html"))
	h := hex.EncodeToString(sum[:])
	aesIV = []byte(h[:16])
	aesKey = []byte(h[16:])
}

// hostAllowlist 内容 API 域白名单(read.js site 数组实测解码 + 主域家族成员)。
var hostAllowlist = map[string]bool{
	"apibi.cc":      true,
	"apiqu.cc":      true,
	"apige.cc":      true,
	"www.bqg713.cc": true,
	"www.bqg616.cc": true,
	"www.bqg413.cc": true,
}

// tokenParams 对齐 JS JSON.stringify({id, chapterid}): 字段序固定 id→chapterid,
// 数字无引号, 无空白(Go struct 序列化保字段序, 与 JS 对象字面量键序一致)。
type tokenParams struct {
	ID        int `json:"id"`
	ChapterID int `json:"chapterid"`
}

func makeToken(p tokenParams) (string, error) {
	pt, err := json.Marshal(p)
	if err != nil {
		return "", err
	}
	block, err := aes.NewCipher(aesKey)
	if err != nil {
		return "", err
	}
	pad := aes.BlockSize - len(pt)%aes.BlockSize
	buf := make([]byte, len(pt)+pad)
	copy(buf, pt)
	for i := len(pt); i < len(buf); i++ {
		buf[i] = byte(pad)
	}
	mode := cipher.NewCBCEncrypter(block, aesIV)
	mode.CryptBlocks(buf, buf)
	return base64.StdEncoding.EncodeToString(buf), nil
}

// --- 同 host 节流(≥600ms 间隔, 同站探测纪律) ---
var (
	throttleMu sync.Mutex
	lastHit    = map[string]time.Time{}
)

func throttled(host string) {
	const minGap = 600 * time.Millisecond
	throttleMu.Lock()
	last, ok := lastHit[host]
	now := time.Now()
	var wait time.Duration
	if ok {
		if d := minGap - now.Sub(last); d > 0 {
			wait = d
		}
	}
	lastHit[host] = now.Add(wait)
	throttleMu.Unlock()
	if wait > 0 {
		time.Sleep(wait)
	}
}

var client = &http.Client{
	Timeout: 20 * time.Second,
	Transport: &http.Transport{
		MaxIdleConnsPerHost: 2,
		IdleConnTimeout:     60 * time.Second,
	},
}

// upstreamChapters 源站响应字段(chaptername/txt 为消费面; cs/ck 留诊断)。
type upstreamChapters struct {
	ID          int    `json:"id"`
	ChapterID   int    `json:"chapterid"`
	ChapterName string `json:"chaptername"`
	CS          int    `json:"cs"`
	TXT         string `json:"txt"`
}

func handler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	raw := strings.TrimSpace(r.URL.Query().Get("url"))
	if raw == "" {
		writeErr(w, http.StatusBadRequest, "missing url param")
		return
	}
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" {
		writeErr(w, http.StatusBadRequest, "bad url")
		return
	}
	if !hostAllowlist[strings.ToLower(u.Hostname())] {
		writeErr(w, http.StatusForbidden, "host not allowed")
		return
	}
	q := u.Query()
	idStr, chStr := q.Get("id"), q.Get("chapterid")
	if idStr == "" || chStr == "" {
		writeErr(w, http.StatusBadRequest, "url lacks id/chapterid query")
		return
	}
	var id, ch int
	if _, err := fmt.Sscanf(idStr, "%d", &id); err != nil {
		writeErr(w, http.StatusBadRequest, "bad id")
		return
	}
	if _, err := fmt.Sscanf(chStr, "%d", &ch); err != nil {
		writeErr(w, http.StatusBadRequest, "bad chapterid")
		return
	}

	token, err := makeToken(tokenParams{ID: id, ChapterID: ch})
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "token gen failed")
		return
	}
	target := fmt.Sprintf("%s://%s/api/chapter?token=%s", u.Scheme, u.Host, url.QueryEscape(token))
	throttled(strings.ToLower(u.Hostname()))

	req, _ := http.NewRequestWithContext(r.Context(), http.MethodGet, target, nil)
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "application/json, text/plain, */*")
	req.Header.Set("Referer", "https://www.bqg616.cc/")
	resp, err := client.Do(req)
	if err != nil {
		w.WriteHeader(http.StatusBadGateway)
		fmt.Fprintf(w, `{"ok":false,"error":"upstream: %s"}`, sanitizeErr(err))
		return
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil || resp.StatusCode != http.StatusOK {
		w.WriteHeader(http.StatusBadGateway)
		fmt.Fprintf(w, `{"ok":false,"error":"upstream status %d"}`, resp.StatusCode)
		return
	}
	var up upstreamChapters
	if err := json.Unmarshal(body, &up); err != nil {
		w.WriteHeader(http.StatusBadGateway)
		fmt.Fprintf(w, `{"ok":false,"error":"upstream not json: %s"}`, sanitizeErr(err))
		return
	}
	if strings.TrimSpace(up.TXT) == "" {
		w.WriteHeader(http.StatusBadGateway)
		fmt.Fprintf(w, `{"ok":false,"error":"upstream empty txt"}`)
		return
	}
	// 引擎消费契约: {"ok":true,"content": "<纯文本>"} → wrapLinesToParagraphs → <p> 段落
	fmt.Fprintf(w, `{"ok":true,"content":%s}`, mustJSON(up.TXT))
}

func mustJSON(s string) string {
	b, err := json.Marshal(s)
	if err != nil {
		return `""`
	}
	return string(b)
}

func writeErr(w http.ResponseWriter, code int, msg string) {
	w.WriteHeader(code)
	fmt.Fprintf(w, `{"ok":false,"error":%s}`, mustJSON(msg))
}

func sanitizeErr(err error) string {
	s := err.Error()
	s = strings.ReplaceAll(s, `\`, `\\`)
	s = strings.ReplaceAll(s, `"`, `\'`)
	return s
}

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("/unlock", handler)
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		fmt.Fprintln(w, "ok")
	})
	srv := &http.Server{
		Addr:              "127.0.0.1:3010",
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
	}
	log.Println("bqg-unlock listening on 127.0.0.1:3010")
	log.Fatal(srv.ListenAndServe())
}
