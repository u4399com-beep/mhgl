// ============================================================
// [R70-c] 内容伪装出口接线 — 设置钩子 + 配置 TTL 缓存 + 页面上下文 + 分卷视图
//
//	render() 公共页出口(缓冲渲染后)调用 stealthConfigOf()/pageCtxOf() 驱动
//	internal/stealth 四开关管线; renderToc 经 volumeGroupsFor 提供分卷分组
//	数据(70-e 主题模板 {{if .VolumeGroups}} 契约消费)。
//
//	硬不变式: 全部开关缺省关闭 → 管线直通, 输出与管线接入前逐字节一致;
//	配置 5s TTL 微缓存(互斥锁保护, 与 R66 tagReCache 并发写 fatal 前科划清界限)。
//
// ============================================================
package web

import (
	"strings"
	"sync"
	"time"

	"mhgl/internal/stealth"
)

// stealthSettingGet 设置读取钩子(registerRoutes 启动期单次注入; 单写多读安全)。
var stealthSettingGet func(key string) string

// registerStealthSettings 注入设置读取(DB 缺键/读错 → 空串, 走代码内默认)。
func registerStealthSettings(get func(key string) string) {
	stealthSettingGet = get
}

// stealthSetting 安全读键(钩子未注册 → 空串: 单测环境默认全关)。
func stealthSetting(key string) string {
	if stealthSettingGet == nil {
		return ""
	}
	return stealthSettingGet(key)
}

// stealthTTL 配置微缓存窗口(管理端保存后最多 5s 全站生效, 与违禁词 60s 同口径的轻量版)。
const stealthTTL = 5 * time.Second

var (
	stealthMu     sync.Mutex
	stealthCached stealth.Config
	stealthExpire time.Time
)

// stealthConfigOf 当前生效伪装配置(5s TTL; 钩子未注册 → 全关)。
func stealthConfigOf() stealth.Config {
	stealthMu.Lock()
	defer stealthMu.Unlock()
	now := time.Now()
	if now.Before(stealthExpire) {
		return stealthCached
	}
	cfg := stealth.ConfigFromSettings(stealthSetting)
	stealthCached = cfg
	stealthExpire = now.Add(stealthTTL)
	return cfg
}

// pageCtxOf 从页面数据提取伪装上下文(Book/Chapter 键在 read/book/toc 页由
// public.go 组装; 缺省空 → 伪原创 request 种子仍可用 nonce 派生)。
func pageCtxOf(name string, data any) stealth.PageCtx {
	pc := stealth.PageCtx{Kind: name, Nonce: stealth.NewNonce()}
	if m, ok := data.(map[string]any); ok {
		if b, ok := m["Book"].(map[string]any); ok {
			pc.BookID = ToStrSafe(b["id"])
		}
		if c, ok := m["Chapter"].(map[string]any); ok {
			pc.ChapterID = ToStrSafe(c["id"])
		}
	}
	return pc
}

// VolumeGroupView 目录页分卷分组视图(跨 agent 契约, 70-e 主题模板消费):
//
//	{{if .VolumeGroups}}{{range .VolumeGroups}}<div class="vol">{{.Name}}</div>
//	  {{range .Chapters}}(与平面循环同款链接模板){{end}}{{end}}
//	{{else}}(原平面渲染零变化){{end}}
//
// Chapters 元素类型与 .Chapters 完全一致([]map[string]any), 链接模板可直接复用。
type VolumeGroupView struct {
	Name     string
	Chapters []map[string]any
}

// volumeGroupsFor 目录页分卷分组。
//   - book.volume.show != "1" → nil(平面渲染不变式);
//   - 卷名取 Chapter.volume 库值(采集侧回填后即生效), 空值回退标题前缀
//     stealth.SplitVolume(现网 volume 列全空, 回退为主路径);
//   - 开头无卷前缀归「正文」组; 相邻同名归并; 仅 1 组 → nil(单卷分列无意义)。
func volumeGroupsFor(chapters []map[string]any) []VolumeGroupView {
	if !stealth.BoolSetting(stealthSetting, "book.volume.show") {
		return nil
	}
	groups := make([]VolumeGroupView, 0, 4)
	for _, ch := range chapters {
		name := strings.TrimSpace(ToStrSafe(ch["volume"]))
		if name == "" {
			if v, _, ok := stealth.SplitVolume(ToStrSafe(ch["title"])); ok {
				name = v
			}
		}
		if name == "" {
			name = "正文"
		}
		if n := len(groups); n > 0 && groups[n-1].Name == name {
			groups[n-1].Chapters = append(groups[n-1].Chapters, ch)
			continue
		}
		groups = append(groups, VolumeGroupView{Name: name, Chapters: []map[string]any{ch}})
	}
	if len(groups) <= 1 {
		return nil
	}
	return groups
}
