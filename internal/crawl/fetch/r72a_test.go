// ============================================================
// R72-a 回归测试 — fetch/proxy 逐行抓虫修复面 + 反反爬增强
//
//	①空载荷短路: Content-Encoding 头对 0 字节体(空限流页/204/304/回显 CE 的反代形态)
//	  修前被 gzip.NewReader 报「解压失败: EOF」硬错误 → 整次抓取计传输失败烧重试;
//	  修后空体原样上交既有语义链(空 HTML → 挑战壳判定; 3xx/4xx → 状态错误链)
//	②x-gzip 别名收编(RFC 9110 §8.4.1-2 与 gzip 同义): 修前落 default 臂把压缩
//	  字节原样当正文, 解析层得二进制乱码
//	③429/204 + 空体 + CE 头: 错误面诚实化(状态错误而非解压失败)
//	④jumpWafTargetRe jsl 边界收紧: 裸 "jsl" 子串误伤业务 /jslib/* 路径
//	  (长内容页 + 正常标题 + 业务 iframe 被整页判拦丢章)
//	⑤Imperva Incapsula 200 壳挑战强标记扩容(_incapsula_resource, 零正文碰撞)
//
// ============================================================
package fetch

import (
	"bytes"
	"compress/gzip"
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"mhgl/internal/crawl/rule"
)

// r72aBody 复原只读响应体
func r72aBody(b []byte) io.ReadCloser { return io.NopCloser(bytes.NewReader(b)) }

// TestR72aEmptyBodyContentEncoding ①空载荷 × 全 CE 形态: 修前 gzip 臂 EOF 硬错误 /
// deflate 臂 zlib 报错后 flate 报错 / br·zstd 臂报流异常; 修后恒空体无错
func TestR72aEmptyBodyContentEncoding(t *testing.T) {
	for _, ce := range []string{"gzip", "x-gzip", "deflate", "br", "zstd", "identity"} {
		resp := &http.Response{
			Header: http.Header{"Content-Encoding": []string{ce}},
			Body:   http.NoBody,
		}
		out, err := readBodyDecompressed(resp)
		if err != nil {
			t.Fatalf("空载荷 + CE %s 应原样返回不报错(修前解压硬错误): out=%d err=%v", ce, len(out), err)
		}
		if len(out) != 0 {
			t.Fatalf("空载荷 + CE %s 应返回 0 字节: got %d", ce, len(out))
		}
	}
	// 非空 gzip 常规路径不回归
	var buf bytes.Buffer
	zw := gzip.NewWriter(&buf)
	_, _ = zw.Write([]byte("<html>ok</html>"))
	_ = zw.Close()
	resp := &http.Response{
		Header: http.Header{"Content-Encoding": []string{"gzip"}},
		Body:   r72aBody(buf.Bytes()),
	}
	out, err := readBodyDecompressed(resp)
	if err != nil || string(out) != "<html>ok</html>" {
		t.Fatalf("非空 gzip 常规解压不回归: out=%q err=%v", out, err)
	}
}

// TestR72aXGzipAliasDecoded ②x-gzip 别名: 端到端解出原文(修前压缩字节透传成乱码正文)
func TestR72aXGzipAliasDecoded(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /page", func(w http.ResponseWriter, r *http.Request) {
		var buf bytes.Buffer
		zw := gzip.NewWriter(&buf)
		_, _ = zw.Write([]byte("<html><head><title>x-gzip 别名页</title></head><body>" +
			strings.Repeat("正文内容若干, 足够长不触发短页判拦。", 40) + "</body></html>"))
		_ = zw.Close()
		w.Header().Set("Content-Encoding", "x-gzip")
		_, _ = w.Write(buf.Bytes())
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()

	c := New(rule.FetchConfig{Engine: "http", Timeout: 3000, AllowLoopback: true, GlobalConcurrency: 2})
	defer c.Close()
	res, err := c.Fetch(context.Background(), srv.URL+"/page", "")
	if err != nil {
		t.Fatalf("x-gzip 响应抓取失败: %v", err)
	}
	if res.Blocked || !strings.Contains(res.HTML, "x-gzip 别名页") {
		t.Fatalf("x-gzip 应解出原文: blocked=%v head=%q", res.Blocked, res.HTML[:minStr(60, len(res.HTML))])
	}
}

func minStr(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// TestR72aEmptyBodyStatusHonest ③空体 + CE 头的错误面诚实化: 429(限流页空体)修前报
// 「gzip 解压失败: EOF」(传输失败语义, 烧重试/喂连败链), 修后按真实状态码走既有失败链
func TestR72aEmptyBodyStatusHonest(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Encoding", "gzip")
		w.WriteHeader(429)
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()

	c := New(rule.FetchConfig{Engine: "http", Timeout: 3000, AllowLoopback: true,
		GlobalConcurrency: 2, Retries: 0})
	defer c.Close()
	_, err := c.Fetch(context.Background(), srv.URL+"/", "")
	if err == nil {
		t.Fatal("429 空体应走状态错误链")
	}
	var se *httpStatusError
	if !errors.As(err, &se) || se.code != 429 {
		t.Fatalf("应返回 HTTP 429 状态错误(修前 gzip 解压失败硬错误): %v", err)
	}
	if strings.Contains(err.Error(), "解压") {
		t.Fatalf("错误面不应为解压失败: %v", err)
	}
}

// TestR72aEmptyBody2xxBlockedShell ①端到端空体 2xx(200 与 204)+ 回显 CE: 修前解压
// 硬错误计传输失败, 修后空 HTML 走挑战壳判定(Blocked), 与 R66-a 语义链衔接
func TestR72aEmptyBody2xxBlockedShell(t *testing.T) {
	for _, code := range []int{200, 204} {
		mux := http.NewServeMux()
		mux.HandleFunc("GET /", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Encoding", "gzip")
			w.WriteHeader(code)
		})
		srv := httptest.NewServer(mux)

		c := New(rule.FetchConfig{Engine: "http", Timeout: 3000, AllowLoopback: true,
			GlobalConcurrency: 2, Retries: 0})
		res, err := c.Fetch(context.Background(), srv.URL+"/", "")
		srv.Close()
		c.Close()
		if err != nil {
			t.Fatalf("%d 空体不应报错(修前 gzip EOF 硬错误): %v", code, err)
		}
		if !res.Blocked {
			t.Fatalf("%d 空体应判挑战壳(Blocked): %+v", code, res)
		}
	}
}

// TestR72aJslBoundaryJumpTarget ④jsl 边界收紧: 业务 /jslib/* 不再误拦;
// 加速乐挑战真实形态 /jsl/?h=… 与 __jsl* 仍判拦
func TestR72aJslBoundaryJumpTarget(t *testing.T) {
	longBody := "<p>" + strings.Repeat("万古神帝正文内容, 足够长触发长页豁免路径。", 60) + "</p>"
	wrap := func(inner string) string {
		return `<html><head><title>第九十一章 夜行</title></head><body>` + inner +
			`<div>` + longBody + `</div></body></html>`
	}
	// 误伤反例: 业务 iframe 引用 /jslib/ 库路径(修前 "jsl" 裸子串命中 → 整页判拦丢章)
	negatives := []string{
		`<iframe src="/jslib/jquery.min.js"></iframe>`,
		`<meta http-equiv="refresh" content="5;url=/jslib/paged.js">`,
	}
	for _, inner := range negatives {
		if looksBlocked(wrap(inner), 200, "") {
			t.Fatalf("业务 jslib 路径不应判拦(修前裸 jsl 子串误伤): %s", inner)
		}
	}
	// 正例: 加速乐挑战资源边界形态仍命中
	positives := []string{
		`<iframe src="/jsl/?h=abc123"></iframe>`,
		`<meta http-equiv="refresh" content="0;url=/__jsl/verify">`,
		`<meta content="0;url=//guard.example.com/jsl?h=x" http-equiv="refresh">`,
	}
	for _, inner := range positives {
		if !looksBlocked(wrap(inner), 200, "") {
			t.Fatalf("加速乐挑战跳转应判拦: %s", inner)
		}
	}
}

// TestR72aIncapsulaStrongMarker ⑤Imperva Incapsula 200 壳强标记: 长页+正常标题豁免
// 不适用(强标记恒判拦), 与 Server 头面(403/429/503 联合判定)互补覆盖 200 壳形态
func TestR72aIncapsulaStrongMarker(t *testing.T) {
	page := `<html><head><title>访问受限</title></head><body>` +
		`<script src="/_Incapsula_Resource?SWEGTFE=1"></script>` +
		strings.Repeat("占位内容。", 200) + `</body></html>`
	if !looksBlocked(page, 200, "") {
		t.Fatal("Incapsula 挑战壳(_Incapsula_Resource)应判拦")
	}
	// 零碰撞反例: 业务页无该技术指纹不误伤
	normal := `<html><head><title>第九十二章 突破</title></head><body>` +
		strings.Repeat("正文内容。", 200) + `</body></html>`
	if looksBlocked(normal, 200, "") {
		t.Fatal("正常内容页不应判拦")
	}
}
