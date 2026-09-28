// ============================================================
// [R79-i09] blockcheck 判定树深审回归 — R78 活体回归矩阵形态钉死:
//
//	① pilishuwu 形态: CF 托管挑战壳 403 + challenge-platform/cf_chl 指纹(1436B 量级)
//	  —— Server 头有/无两臂均判拦(强标记臂兜底)
//	② daweixs 形态: 裸 403 + nginx 默认短页(127B 量级, 无 WAF 指纹)—— 极短臂判拦
//	③ 良性形态双向验证: JSON 信封含 captcha 词(豁免臂)/meta-refresh 分页长内容页
//	  (跳转臂不误伤)/cuoceng precursor 内容页豁免(r76main_test 已钉, 此处不重复)
//
// 既有覆盖互证: r74a iframe 业务 captcha 收敛 / r70a+r71a WAF 指纹扩容 / r72a jsl
// 边界+Incapsula / r76main precursor 豁免
// ============================================================
package fetch

import (
	"strings"
	"testing"
)

// pilishuwuCFChallenge CF 托管挑战壳形态(填充至 1436 字节对齐 R78 实测体量)
func pilishuwuCFChallenge() string {
	head := `<!DOCTYPE html><html lang="en-US"><head><title>Just a moment...</title>
<script>window._cf_chl_opt={cRay:'8f2a',cZone:'www.pilishuwu.com',cType:'managed'}</script>
<script src="/cdn-cgi/challenge-platform/h/g/orchestrate/managed/v1"></script></head>
<body class="no-js"><div id="challenge-form" class="main-wrapper">`
	tail := `</div><div class="footer">Verifying you are human. This is a CF managed challenge page.</div></body></html>`
	pad := 1436 - len(head) - len(tail)
	if pad < 0 {
		pad = 0
	}
	return head + strings.Repeat("x", pad) + tail
}

// daweixsBare403 裸 403 短页形态(nginx 默认页量级 ~127B, 无 WAF Server 指纹)
func daweixsBare403() string {
	return "<html>\r\n<head><title>403 Forbidden</title></head>\r\n" +
		"<body>\r\n<center><h1>403 Forbidden</h1></center>\r\n</body>\r\n</html>\r\n"
}

func TestR79i09_R78MatrixBlockForms(t *testing.T) {
	cf := pilishuwuCFChallenge()
	if len(cf) != 1436 {
		t.Fatalf("pilishuwu 形态体量漂移: %d( want 1436)", len(cf))
	}
	if !looksBlocked(cf, 403, "cloudflare") {
		t.Fatalf("CF 挑战壳 403+cloudflare 未判拦(状态×Server 联合臂失效)")
	}
	// Server 头缺失/伪装形态: 强标记臂兜底(cf_chl_/challenge-platform/just a moment)
	if !looksBlocked(cf, 403, "") {
		t.Fatalf("CF 挑战壳 403 无 Server 头未判拦(强标记兜底臂失效)")
	}
	if !looksBlocked(cf, 200, "") {
		t.Fatalf("CF 挑战壳 200 壳形态未判拦(强标记臂应无条件命中)")
	}
	bare := daweixsBare403()
	if len(bare) >= 200 {
		t.Fatalf("daweixs 形态应 <200B: %d", len(bare))
	}
	if !looksBlocked(bare, 403, "nginx") {
		t.Fatalf("裸 403 短页未判拦(nginx Server 不入 wafServerRe, 极短臂应兜底)")
	}
	if !looksBlocked(bare, 403, "") {
		t.Fatalf("裸 403 短页(无 Server 头)未判拦(极短臂失效)")
	}
}

func TestR79i09_BenignFormsNotBlocked(t *testing.T) {
	// JSON 信封含 captcha/验证 词: 合法 JSON 整体豁免臂(API 站错误信封非盾页)
	env := `{"error":"invalid captcha","code":400,"message":"请完成验证后重试"}`
	if looksBlocked(env, 200, "") {
		t.Fatalf("JSON 信封含 captcha 词被误拦(豁免臂失效)")
	}
	// meta-refresh 分页跳转长内容页: 跳转目标无 WAF 关键词不误伤(R70-a 收敛语义)
	var b strings.Builder
	b.WriteString(`<!doctype html><html><head><meta http-equiv="refresh" content="5; url=/list/2.html"><title>玄幻小说列表_第1页</title></head><body><ul>`)
	for _, n := range []string{"斗破苍穹", "凡人修仙传", "遮天", "完美世界", "仙逆", "大道朝天", "雪中悍刀行", "剑来"} {
		b.WriteString("<li>" + n + " 最新章节列表</li>")
	}
	b.WriteString(strings.Repeat("<p>小说频道推荐榜周榜月榜新书榜完本榜人气票推荐票追更</p>", 40))
	b.WriteString("</ul></body></html>")
	page := b.String()
	if len([]rune(page)) < 1200 {
		t.Fatalf("fixture 应 ≥1200 码点: %d", len([]rune(page)))
	}
	if looksBlocked(page, 200, "") {
		t.Fatalf("meta-refresh 分页长内容页被误拦(跳转臂/弱标记臂误伤)")
	}
}

// TestR79i09_TitleBlacklistWordBoundary 标题黑名单整词判定双向:
// "第403章" 章节号形态不作 403 状态页判(标题豁免不被内容碰撞剥夺);
// 真 403/404 状态页标题仍被拒绝豁免
func TestR79i09_TitleBlacklistWordBoundary(t *testing.T) {
	if !hasNormalTitle("<title>第403章 大战爆发_小说范文页</title>") {
		t.Fatalf("章节号标题(第403章)被误判 403 状态页(词边界失效)")
	}
	if !hasNormalTitle("<title>第404章 落幕_小说范文页</title>") {
		t.Fatalf("章节号标题(第404章)被误判 404 状态页(词边界失效)")
	}
	if hasNormalTitle("<title>403 Forbidden</title>") {
		t.Fatalf("403 状态页标题应拒绝豁免")
	}
	if hasNormalTitle("<title>404 Not Found</title>") {
		t.Fatalf("404 状态页标题应拒绝豁免")
	}
	if hasNormalTitle("<title>Just a moment...</title>") {
		t.Fatalf("盾页标题应拒绝豁免")
	}
	if hasNormalTitle("<title>安全验证</title>") {
		t.Fatalf("验证类盾页标题应拒绝豁免")
	}
}
