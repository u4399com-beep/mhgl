// ============================================================
// R60-2b — 书籍入库钩子(智能 PSEO 自动生成的消费缝)
//
// pseoAutoGenerate 设置的 Go 侧消费点: 书籍入库(InsertBook 成功)后异步回调,
// api 层在 Register 时经 SetBookCreatedHook 注入生成逻辑(读 Setting 决定是否生成)。
// store 层不 import api/不认识 PseoPage 语义, 只负责"书已入库"这一事件的广播。
// ============================================================
package store

import (
	"log"
	"sync"
)

// bookCreatedHook 包级钩子(单进程一装; 重复注入后者覆盖)。
// [R70-c] R69-C 移交收口: 包级变量加读写锁(生产时序本安全, 加锁防未来热插拔面)。
var (
	bookCreatedHookMu sync.RWMutex
	bookCreatedHook   func(db *DB, bookID string)
)

// SetBookCreatedHook 注入书籍入库钩子(nil = 卸载)。并发安全; 回调闭包并发自理。
func SetBookCreatedHook(fn func(db *DB, bookID string)) {
	bookCreatedHookMu.Lock()
	bookCreatedHook = fn
	bookCreatedHookMu.Unlock()
}

// notifyBookCreated 入库成功后触发(异步 goroutine + recover 兜底:
// 采集热路径不受钩子 panic 拖累; 书入库低频, 每书一 goroutine 成本可忽略)。
func (d *DB) notifyBookCreated(bookID string) {
	bookCreatedHookMu.RLock()
	fn := bookCreatedHook
	bookCreatedHookMu.RUnlock()
	if fn == nil || bookID == "" {
		return
	}
	go func() {
		defer func() {
			if r := recover(); r != nil {
				log.Printf("[store] bookCreatedHook panic (bookID=%s): %v", bookID, r)
			}
		}()
		fn(d, bookID)
	}()
}
