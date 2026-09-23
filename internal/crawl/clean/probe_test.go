package clean

import "testing"

func TestProbeBrSpacer(t *testing.T) {
	in := `<p>段落一内容。</p><br><p>段落二内容。</p>`
	out := CleanContentHTML(in, defaultConfig())
	t.Logf("out=%q", out)
}

func TestProbeMaskRestore(t *testing.T) {
	in := `正文段落。</p><p>http://www.xyetianlian.com/yt318/197650.html</p><p>请记住本书首发域名：</p>`
	out := CleanContentHTML(in, defaultConfig())
	t.Logf("out=%q", out)
}
