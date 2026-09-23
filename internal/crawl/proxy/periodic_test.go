// ============================================================
// 收割周期化单测(R57-2a) — 周期选项解析 + 防重入(不真等周期/不触网)
//
//	① resolvePeriodicOptions: 缺省值 / env duration 形态 / env 纯数字(分钟) /
//	  env 非法回退 / 显式 opts 优先 ② StartPeriodic: db=nil 拒绝; 防重入标志
//	  占位-拒绝-复位全链(Ready 钩子同步, 复用 openTestDB 内存库, 零网络)
//
// ============================================================
package proxy

import (
	"context"
	"testing"
	"time"
)

func TestResolvePeriodicOptions(t *testing.T) {
	t.Run("缺省值", func(t *testing.T) {
		t.Setenv(EnvHarvestInterval, "")
		o := resolvePeriodicOptions(PeriodicOptions{})
		if o.HarvestInterval != PeriodicHarvestDefault {
			t.Fatalf("HarvestInterval=%v, want %v", o.HarvestInterval, PeriodicHarvestDefault)
		}
		if o.CheckInterval != PeriodicCheckDefault {
			t.Fatalf("CheckInterval=%v, want %v", o.CheckInterval, PeriodicCheckDefault)
		}
		if o.CheckLimit != PeriodicCheckLimitDefault {
			t.Fatalf("CheckLimit=%d, want %d", o.CheckLimit, PeriodicCheckLimitDefault)
		}
		if o.Logf == nil {
			t.Fatalf("Logf 缺省出口未注入")
		}
	})
	t.Run("env_duration_形态", func(t *testing.T) {
		t.Setenv(EnvHarvestInterval, "90m")
		o := resolvePeriodicOptions(PeriodicOptions{})
		if o.HarvestInterval != 90*time.Minute {
			t.Fatalf("env 90m → %v, want 90m", o.HarvestInterval)
		}
	})
	t.Run("env_纯数字_按分钟", func(t *testing.T) {
		t.Setenv(EnvHarvestInterval, "45")
		o := resolvePeriodicOptions(PeriodicOptions{})
		if o.HarvestInterval != 45*time.Minute {
			t.Fatalf("env 45 → %v, want 45m", o.HarvestInterval)
		}
	})
	t.Run("env_非法_回退缺省", func(t *testing.T) {
		t.Setenv(EnvHarvestInterval, "soon")
		o := resolvePeriodicOptions(PeriodicOptions{})
		if o.HarvestInterval != PeriodicHarvestDefault {
			t.Fatalf("非法 env → %v, want 缺省 %v", o.HarvestInterval, PeriodicHarvestDefault)
		}
	})
	t.Run("显式_opts_优先", func(t *testing.T) {
		t.Setenv(EnvHarvestInterval, "45")
		o := resolvePeriodicOptions(PeriodicOptions{HarvestInterval: time.Hour, CheckLimit: 77})
		if o.HarvestInterval != time.Hour {
			t.Fatalf("显式 opts 被 env 覆盖: %v", o.HarvestInterval)
		}
		if o.CheckLimit != 77 {
			t.Fatalf("CheckLimit=%d, want 77", o.CheckLimit)
		}
	})
}

func TestStartPeriodicReentry(t *testing.T) {
	t.Run("db_nil_拒绝", func(t *testing.T) {
		if StartPeriodic(context.Background(), nil, PeriodicOptions{}) {
			t.Fatalf("db=nil 应直接拒绝返回 false")
		}
	})
	t.Run("防重入_占位_拒绝_复位", func(t *testing.T) {
		if !periodicRunning.CompareAndSwap(false, true) {
			t.Fatalf("前置标志应空闲")
		}
		// 标志已被占: 第二实例必须被拒(此刻标志由测试手动占位)
		if StartPeriodic(context.Background(), openTestDB(t), PeriodicOptions{}) {
			t.Fatalf("防重入失败: 标志已占仍启动了第二实例")
		}
		periodicRunning.Store(false) // 复位(模拟前实例退出)

		// 正常启动: Ready 同步钩子关闭即标志已占位, 并发第二调用必须被拒
		ready := make(chan struct{})
		ctx, cancel := context.WithCancel(context.Background())
		done := make(chan bool, 1)
		go func() {
			done <- StartPeriodic(ctx, openTestDB(t), PeriodicOptions{
				HarvestInterval: time.Hour, CheckInterval: time.Hour,
				Logf: func(f string, a ...interface{}) {}, Ready: ready,
			})
		}()
		select {
		case <-ready:
		case <-time.After(5 * time.Second):
			t.Fatalf("首实例未就绪(Ready 未关闭)")
		}
		if StartPeriodic(context.Background(), openTestDB(t), PeriodicOptions{Logf: func(f string, a ...interface{}) {}}) {
			cancel()
			<-done
			t.Fatalf("防重入失败: 实例运行中第二调用未拒绝")
		}
		// 取消首实例 → 退出 true → 标志复位 → 第三实例可再启动
		cancel()
		if !<-done {
			t.Fatalf("首实例退出返回 false, want true")
		}
		ready2 := make(chan struct{})
		ctx2, cancel2 := context.WithCancel(context.Background())
		defer cancel2()
		done2 := make(chan bool, 1)
		go func() {
			done2 <- StartPeriodic(ctx2, openTestDB(t), PeriodicOptions{
				HarvestInterval: time.Hour, CheckInterval: time.Hour,
				Logf: func(f string, a ...interface{}) {}, Ready: ready2,
			})
		}()
		select {
		case <-ready2:
		case <-time.After(5 * time.Second):
			t.Fatalf("复位后第三实例未能启动(标志未复位)")
		}
		cancel2()
		<-done2
	})
}
