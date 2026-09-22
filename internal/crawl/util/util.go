// ============================================================
// 跨包小工具 — R51-3-a 清理收敛
// truncate×4(fetch/rule/task/callback) 与 sleepCtx×3(fetch/task/callback)
// 原为四份/三份逐字重复实现, 收敛为单一实现(单一事实源)
// ============================================================
package util

import (
	"context"
	"time"
)

// Truncate 按 rune 截断(无省略号; 超限直接斩断, 多字节字符防腰斩)
func Truncate(s string, n int) string {
	r := []rune(s)
	if len(r) > n {
		return string(r[:n])
	}
	return s
}

// TruncateLog 日志截断: 超限时追加省略号(原 task.truncateURL/callback.truncateStr 语义)
func TruncateLog(s string, n int) string {
	r := []rune(s)
	if len(r) > n {
		return string(r[:n]) + "…"
	}
	return s
}

// SleepCtx 可中断 sleep(ctx 取消时提前返回 ctx.Err(); d<=0 立即返回)
func SleepCtx(ctx context.Context, d time.Duration) error {
	if d <= 0 {
		if err := ctx.Err(); err != nil {
			return err
		}
		return nil
	}
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-t.C:
		return nil
	}
}
