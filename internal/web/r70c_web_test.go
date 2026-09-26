// ============================================================
// [R70-c] web 层伪装接线回归 — 分卷分组契约 + 页面上下文提取
// (Apply 管线自身的不变式测试在 internal/stealth 包; 此处锁 web 侧接缝)
// ============================================================
package web

import (
	"testing"
)

func TestVolumeGroupsFor_OffAlwaysNil(t *testing.T) {
	registerStealthSettings(func(string) string { return "" })
	resetStealthCacheForTest()
	chs := []map[string]any{
		{"id": "a", "title": "第一卷 起"},
		{"id": "b", "title": "第二卷 承"},
	}
	if got := volumeGroupsFor(chs); got != nil {
		t.Fatalf("开关关应恒 nil(平面渲染不变式), got %+v", got)
	}
	// JSON 引号形态的 "0" 同样判关(设置值经 json.Marshal 落库带引号)。
	registerStealthSettings(func(k string) string {
		if k == "book.volume.show" {
			return `"0"`
		}
		return ""
	})
	resetStealthCacheForTest()
	if got := volumeGroupsFor(chs); got != nil {
		t.Fatalf(`引号 "0" 应判关, got %+v`, got)
	}
}

func TestVolumeGroupsFor_TitleFallbackGrouping(t *testing.T) {
	registerStealthSettings(func(k string) string {
		if k == "book.volume.show" {
			return "1"
		}
		return ""
	})
	resetStealthCacheForTest()
	chs := []map[string]any{
		{"id": "1", "title": "第一卷 起"},
		{"id": "2", "title": "第一卷 承"},
		{"id": "3", "title": "第二卷 转"},
		{"id": "4", "title": "番外"},
	}
	got := volumeGroupsFor(chs)
	// 相邻同名归并: 第一卷×2 / 第二卷 / 正文(番外无前缀) → 3 组。
	if len(got) != 3 || got[0].Name != "第一卷" || len(got[0].Chapters) != 2 ||
		got[1].Name != "第二卷" || got[2].Name != "正文" {
		t.Fatalf("标题回退分组形态不符: %+v", got)
	}
	// 契约: Chapters 元素与 .Chapters 同源(同 map 指针)。
	if got[0].Chapters[0]["id"] != "1" {
		t.Fatalf("组内元素应与平面列表同源: %+v", got[0].Chapters[0])
	}
}

func TestVolumeGroupsFor_SingleGroupCollapses(t *testing.T) {
	registerStealthSettings(func(k string) string {
		if k == "book.volume.show" {
			return "1"
		}
		return ""
	})
	resetStealthCacheForTest()
	chs := []map[string]any{
		{"id": "1", "title": "第一章 起"},
		{"id": "2", "title": "第二章 承"},
	}
	if got := volumeGroupsFor(chs); got != nil {
		t.Fatalf("仅 1 组应归空保持平面: %+v", got)
	}
}

func TestVolumeGroupsFor_VolumeColumnPreferred(t *testing.T) {
	registerStealthSettings(func(k string) string {
		if k == "book.volume.show" {
			return "1"
		}
		return ""
	})
	resetStealthCacheForTest()
	chs := []map[string]any{
		{"id": "1", "volume": "卷A", "title": "第一卷 别名干扰"},
		{"id": "2", "volume": "卷A", "title": "第二章"},
		{"id": "3", "volume": "卷B", "title": "第三章"},
	}
	got := volumeGroupsFor(chs)
	if len(got) != 2 || got[0].Name != "卷A" || got[1].Name != "卷B" {
		t.Fatalf("库 volume 字段应优先于标题回退: %+v", got)
	}
}

func TestPageCtxOf_ExtractsBookChapter(t *testing.T) {
	data := map[string]any{
		"Book":    map[string]any{"id": "bk1"},
		"Chapter": map[string]any{"id": "ch9"},
	}
	pc := pageCtxOf("read", data)
	if pc.Kind != "read" || pc.BookID != "bk1" || pc.ChapterID != "ch9" {
		t.Fatalf("read 页上下文提取不符: %+v", pc)
	}
	pc2 := pageCtxOf("home", map[string]any{})
	if pc2.Kind != "home" || pc2.BookID != "" || pc2.ChapterID != "" {
		t.Fatalf("home 页上下文应为空 Book/Chapter: %+v", pc2)
	}
}

func TestStealthConfigOf_HookUnregisteredAllOff(t *testing.T) {
	// 钩子未注册(独立单测环境) → 全关直通, 保证既有渲染路径零变化。
	saved := stealthSettingGet
	stealthSettingGet = nil
	defer func() { stealthSettingGet = saved }()
	// 强制过期绕过 TTL 缓存。
	resetStealthCacheForTest()
	if cfg := stealthConfigOf(); !cfg.AllOff() {
		t.Fatalf("钩子未注册应全关: %+v", cfg)
	}
}
