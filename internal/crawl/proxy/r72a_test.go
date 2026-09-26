// ============================================================
// R72-a 回归测试 — proxy 周期化 timer.Reset 语义修复
//
//	resetTimerDrained: 单循环 case 体内消费本轮 tick 后, 若 case 体耗时超过间隔,
//	下一轮 tick 已先行入 channel —— 修前裸 Reset 不清除 stale tick, 循环下一轮
//	select 立即收到旧 tick → 收割/校验背靠背连跑(「越慢越加倍轰炸」);
//	修后 Stop+非阻塞排干再 Reset, 下一轮恒按完整间隔等待
//
// ============================================================
package proxy

import (
	"testing"
	"time"
)

// TestR72aPeriodicTimerDrainAfterOverrun 一轮耗时超过间隔(overrun)后的 stale tick
// 必须被排干: 修后下一次触发 ≈ 完整间隔; 修前 stale tick 立即到达(近 0ms)
func TestR72aPeriodicTimerDrainAfterOverrun(t *testing.T) {
	const interval = 30 * time.Millisecond
	tm := time.NewTimer(interval)
	defer tm.Stop()

	// 模拟 select 消费本轮 tick → 进入 case 体
	<-tm.C
	// 模拟 case 体耗时 60ms > 30ms 间隔: 下一轮 tick 已先行入 channel(未消费)
	time.Sleep(60 * time.Millisecond)

	start := time.Now()
	resetTimerDrained(tm, 80*time.Millisecond)
	select {
	case <-tm.C:
		el := time.Since(start)
		if el < 60*time.Millisecond {
			t.Fatalf("stale tick 未排干(修前裸 Reset 残留旧 tick): 过早触发 %v", el)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("排干后 Reset 应使 timer 在 80ms 正常触发")
	}
}

// TestR72aPeriodicTimerDrainNormalPath 常规路径(未 overrun, tick 已被消费)不回归:
// Stop 返回 true 无 stale tick, 排干为 no-op, Reset 正常生效
func TestR72aPeriodicTimerDrainNormalPath(t *testing.T) {
	tm := time.NewTimer(20 * time.Millisecond)
	defer tm.Stop()
	<-tm.C // 消费本轮 tick(无 overrun, channel 已空)

	start := time.Now()
	resetTimerDrained(tm, 50*time.Millisecond)
	select {
	case <-tm.C:
		if el := time.Since(start); el < 40*time.Millisecond {
			t.Fatalf("常规路径 Reset 后应等完整间隔: %v", el)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("常规路径 Reset 应正常触发")
	}
}
