// ============================================================
// [R71-c] web 层接缝回归 — TTL 快照(volume.show 并入) + 渲染出口豁免形态
// ============================================================
package web

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// resetStealthCacheForTest 强制 TTL 快照过期(设置钩子换装后立即可见, 生产语义不变)。
func resetStealthCacheForTest() {
	stealthMu.Lock()
	stealthExpire = time.Time{}
	stealthMu.Unlock()
}

// TestStealthSnapshot_VolumeShowCachedWithConfig 分卷开关与伪装 Config 同读一个
// TTL 快照: 钩子换装后需重置缓存才可见 —— 证明 book.volume.show 不再绕过缓存
// 直读 DB(修前每 toc 渲染一次 settings 查询)。
func TestStealthSnapshot_VolumeShowCachedWithConfig(t *testing.T) {
	registerStealthSettings(func(k string) string {
		if k == "book.volume.show" || k == "stealth.obfuscate" {
			return "1"
		}
		return ""
	})
	resetStealthCacheForTest()
	snap := stealthSnapshotOf()
	if !snap.volumeShow {
		t.Fatal("book.volume.show=1 应判真")
	}
	if !snap.cfg.Obfuscate {
		t.Fatal("stealth.obfuscate=1 应判真")
	}
	// TTL 窗口内换装钩子 → 快照仍持旧值(缓存生效的证明面)。
	registerStealthSettings(func(string) string { return "" })
	snap2 := stealthSnapshotOf()
	if !snap2.volumeShow || !snap2.cfg.Obfuscate {
		t.Fatal("TTL 窗口内应返回缓存快照(证明 volume.show 已并入缓存面)")
	}
	// 重置后立即可见。
	resetStealthCacheForTest()
	snap3 := stealthSnapshotOf()
	if snap3.volumeShow || snap3.cfg.Obfuscate {
		t.Fatal("缓存重置后应读到全关新值")
	}
	// 收尾: 全关快照(不影响其他测试)。
	resetStealthCacheForTest()
}

// TestVolumeGroupsFor_TTLGateOnOff 开关→分组→关→归空 的完整门控链(经 TTL 快照)。
func TestVolumeGroupsFor_TTLGateOnOff(t *testing.T) {
	chs := []map[string]any{
		{"id": "1", "title": "第一卷 起"},
		{"id": "2", "title": "第二卷 承"},
	}
	registerStealthSettings(func(k string) string {
		if k == "book.volume.show" {
			return "1"
		}
		return ""
	})
	resetStealthCacheForTest()
	if got := volumeGroupsFor(chs); got == nil || len(got) != 2 {
		t.Fatalf("开关开应分组: %+v", got)
	}
	registerStealthSettings(func(string) string { return "" })
	resetStealthCacheForTest()
	if got := volumeGroupsFor(chs); got != nil {
		t.Fatalf("开关关应归空(平面渲染不变式): %+v", got)
	}
}

// TestRender_PublicPathExemptionsShape 渲染出口豁免形态: robots/sitemap 不走
// 主题模板(恒纯文本/重定向), 伪装开启也不得改写其输出。
func TestRender_PublicPathExemptionsShape(t *testing.T) {
	registerStealthSettings(func(k string) string {
		if k == "stealth.obfuscate" || k == "stealth.transcode" || k == "stealth.interfere" || k == "stealth.pseudo" {
			return "1"
		}
		return ""
	})
	resetStealthCacheForTest()
	defer func() {
		registerStealthSettings(func(string) string { return "" })
		resetStealthCacheForTest()
	}()
	d := Deps{} // DB nil: robots 无 DB 依赖; sitemap 降级无 site 参数转发
	rw := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/robots.txt", nil)
	d.handleRobots(rw, req)
	body := rw.Body.String()
	if !strings.Contains(body, "User-agent: *") || !strings.Contains(body, "Disallow: /admin") {
		t.Fatalf("robots.txt 形态破坏: %q", body)
	}
	if strings.Contains(body, "sj-i") || strings.Contains(body, "<!--") {
		t.Fatal("robots.txt 不得进入伪装管线(豁免面)")
	}
}
