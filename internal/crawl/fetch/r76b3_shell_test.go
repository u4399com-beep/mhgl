package fetch

// [R76-b3] decodeShellBody 回归 — base64 软壳站双形态还原(book4.cc 实证同构样本)

import (
	"strings"
	"testing"
)

// 合成样本(python 生成, 与 book4.cc 实测形态同构)
const htmlShellInner = "<!DOCTYPE html><html><head><title>AU文学</title></head><body><p>正文内容段落测试。正文内容段落测试。正文内容段落测试。正文内容段落测试。正文内容段落测试。正文内容段落测试。正文内容段落测试。正文内容段落测试。正文内容段落测试。正文内容段落测试。正文内容段落测试。正文内容段落测试。正文内容段落测试。正文内容段落测试。正文内容段落测试。正文内容段落测试。正文内容段落测试。正文内容段落测试。正文内容段落测试。正文内容段落测试。正文内容段落测试。正文内容段落测试。正文内容段落测试。正文内容段落测试。正文内容段落测试。正文内容段落测试。正文内容段落测试。正文内容段落测试。正文内容段落测试。正文内容段落测试。正文内容段落测试。正文内容段落测试。正文内容段落测试。正文内容段落测试。正文内容段落测试。正文内容段落测试。正文内容段落测试。正文内容段落测试。正文内容段落测试。正文内容段落测试。</p></body></html>"

const htmlShellB64 = "PCFET0NUWVBFIGh0bWw+PGh0bWw+PGhlYWQ+PHRpdGxlPkFV5paH5a2mPC90aXRsZT48L2hlYWQ+PGJvZHk+PHA+5q2j5paH5YaF5a655q616JC95rWL6K+V44CC5q2j5paH5YaF5a655q616JC95rWL6K+V44CC5q2j5paH5YaF5a655q616JC95rWL6K+V44CC5q2j5paH5YaF5a655q616JC95rWL6K+V44CC5q2j5paH5YaF5a655q616JC95rWL6K+V44CC5q2j5paH5YaF5a655q616JC95rWL6K+V44CC5q2j5paH5YaF5a655q616JC95rWL6K+V44CC5q2j5paH5YaF5a655q616JC95rWL6K+V44CC5q2j5paH5YaF5a655q616JC95rWL6K+V44CC5q2j5paH5YaF5a655q616JC95rWL6K+V44CC5q2j5paH5YaF5a655q616JC95rWL6K+V44CC5q2j5paH5YaF5a655q616JC95rWL6K+V44CC5q2j5paH5YaF5a655q616JC95rWL6K+V44CC5q2j5paH5YaF5a655q616JC95rWL6K+V44CC5q2j5paH5YaF5a655q616JC95rWL6K+V44CC5q2j5paH5YaF5a655q616JC95rWL6K+V44CC5q2j5paH5YaF5a655q616JC95rWL6K+V44CC5q2j5paH5YaF5a655q616JC95rWL6K+V44CC5q2j5paH5YaF5a655q616JC95rWL6K+V44CC5q2j5paH5YaF5a655q616JC95rWL6K+V44CC5q2j5paH5YaF5a655q616JC95rWL6K+V44CC5q2j5paH5YaF5a655q616JC95rWL6K+V44CC5q2j5paH5YaF5a655q616JC95rWL6K+V44CC5q2j5paH5YaF5a655q616JC95rWL6K+V44CC5q2j5paH5YaF5a655q616JC95rWL6K+V44CC5q2j5paH5YaF5a655q616JC95rWL6K+V44CC5q2j5paH5YaF5a655q616JC95rWL6K+V44CC5q2j5paH5YaF5a655q616JC95rWL6K+V44CC5q2j5paH5YaF5a655q616JC95rWL6K+V44CC5q2j5paH5YaF5a655q616JC95rWL6K+V44CC5q2j5paH5YaF5a655q616JC95rWL6K+V44CC5q2j5paH5YaF5a655q616JC95rWL6K+V44CC5q2j5paH5YaF5a655q616JC95rWL6K+V44CC5q2j5paH5YaF5a655q616JC95rWL6K+V44CC5q2j5paH5YaF5a655q616JC95rWL6K+V44CC5q2j5paH5YaF5a655q616JC95rWL6K+V44CC5q2j5paH5YaF5a655q616JC95rWL6K+V44CC5q2j5paH5YaF5a655q616JC95rWL6K+V44CC5q2j5paH5YaF5a655q616JC95rWL6K+V44CC5q2j5paH5YaF5a655q616JC95rWL6K+V44CCPC9wPjwvYm9keT48L2h0bWw+"

const jsonShellUEB64 = "JTdCJTIyYm9va19uYW1lJTIyJTNBJTIyJUU0JUJCJTk5JUU5JTgwJTg2JTIyJTJDJTIyYXV0aG9yJTIyJTNBJTIyJUU4JTgwJUIzJUU2JUEwJUI5JTIyJTJDJTIyY2hhcHRlcl9saXN0JTIyJTNBJTVCJTdCJTIyZmlsZV9uYW1lJTIyJTNBJTIyYWJjLmh0bWwlMjIlMkMlMjJuYW1lJTIyJTNBJTIyJUU3JUFDJUFDJUU0JUI4JTgwJUU3JUFCJUEwJTIyJTdEJTVEJTdE"

const jsonDirectB64 = "eyJib29rX25hbWUiOiLku5npgIYiLCJhdXRob3IiOiLogLPmoLkiLCJjaGFwdGVyX2xpc3QiOlt7ImZpbGVfbmFtZSI6ImFiYy5odG1sIiwibmFtZSI6IuesrOS4gOeroCJ9XX0="

const junkB64 = "anVzdCBzb21lIHJhbmRvbSB0ZXh0IHBheWxvYWQsIG5vdCBodG1sIG9yIGpzb24gYXQgYWxsLi4uLi4u"

func TestR76b3DecodeShellHTML(t *testing.T) {
	shell := "<!DOCTYPE html><html><head><script>window['user_ip']='';\nhtml_b=\"" + htmlShellB64 + "\";\ndecodedHtml=decodeURIComponent(escape(atob(html_b)));document.writeln(decodedHtml);</script></html>"
	got, ok := decodeShellBody([]byte(shell))
	if !ok {
		t.Fatal("HTML 壳未被识别还原")
	}
	if string(got) != htmlShellInner {
		t.Fatalf("HTML 还原内容不符: got %d bytes want %d", len(got), len(htmlShellInner))
	}
}

func TestR76b3DecodeShellJSONUrlEncoded(t *testing.T) {
	shell := "dstr=\"" + jsonShellUEB64 + "\""
	got, ok := decodeShellBody([]byte(shell))
	if !ok {
		t.Fatal("URL 编码 JSON 壳未被识别还原")
	}
	if got[0] != '{' {
		t.Fatalf("JSON 还原首字节异常: %q", got[0])
	}
	if !strings.Contains(string(got), `"book_name":"仙逆"`) {
		t.Fatalf("JSON 内容不符: %s", string(got)[:80])
	}
}

func TestR76b3DecodeShellJSONDirect(t *testing.T) {
	shell := "var dstr=\"" + jsonDirectB64 + "\";"
	got, ok := decodeShellBody([]byte(shell))
	if !ok || got[0] != '{' {
		t.Fatalf("直出 JSON 壳还原失败: ok=%v", ok)
	}
}

func TestR76b3DecodeShellConservative(t *testing.T) {
	// ①正常页面(无壳变量)零变化
	normal := "<html><head><title>正常页面</title></head><body>" + strings.Repeat("长页面正文内容,无任何壳变量。", 30) + "</body></html>"
	if _, ok := decodeShellBody([]byte(normal)); ok {
		t.Fatal("正常页面被误还原")
	}
	// ②b64 解码产物非 </{/[ 起始 → 原样返回(不采纳)
	shell := "var x=\"" + junkB64 + "\";more padding padding padding padding padding"
	if _, ok := decodeShellBody([]byte(shell)); ok {
		t.Fatal("非 HTML/JSON 产物壳被误采纳")
	}
	// ③短输入防御
	if _, ok := decodeShellBody([]byte("dstr=\"short\"")); ok {
		t.Fatal("短输入被处理")
	}
}
