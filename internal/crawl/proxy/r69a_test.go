// ============================================================
// R69-a 回归测试 — proxy 周期化负输入防御(间隔下限钳制)
//
//	①env 解析出的亚分钟值(PROXY_HARVEST_INTERVAL=1ms)钳到 PeriodicIntervalFloor,
//	  防误配置把收割循环变成对源站的持续轰炸
//	②显式 opts 小值同样受钳(双间隔)
//	③合法值如实透传(缺省/env 正常形态零回归)
//
// ============================================================
package proxy

import (
	"testing"
	"time"
)

func TestR69aPeriodicIntervalFloor(t *testing.T) {
	t.Run("env_亚分钟值钳下限", func(t *testing.T) {
		t.Setenv(EnvHarvestInterval, "1ms")
		o := resolvePeriodicOptions(PeriodicOptions{})
		if o.HarvestInterval != PeriodicIntervalFloor {
			t.Fatalf("env 1ms → %v, want 下限 %v(修前 1ms 收割循环直接轰炸源站)", o.HarvestInterval, PeriodicIntervalFloor)
		}
	})
	t.Run("显式opts小值同样受钳", func(t *testing.T) {
		t.Setenv(EnvHarvestInterval, "")
		o := resolvePeriodicOptions(PeriodicOptions{HarvestInterval: 500 * time.Millisecond, CheckInterval: time.Millisecond})
		if o.HarvestInterval != PeriodicIntervalFloor {
			t.Fatalf("显式 opts 500ms → %v, want 下限 %v", o.HarvestInterval, PeriodicIntervalFloor)
		}
		if o.CheckInterval != PeriodicIntervalFloor {
			t.Fatalf("显式 opts CheckInterval 1ms → %v, want 下限 %v", o.CheckInterval, PeriodicIntervalFloor)
		}
	})
	t.Run("合法值零回归", func(t *testing.T) {
		t.Setenv(EnvHarvestInterval, "")
		o := resolvePeriodicOptions(PeriodicOptions{HarvestInterval: 90 * time.Minute, CheckInterval: 5 * time.Minute})
		if o.HarvestInterval != 90*time.Minute || o.CheckInterval != 5*time.Minute {
			t.Fatalf("合法值应如实透传: %v / %v", o.HarvestInterval, o.CheckInterval)
		}
		// 缺省值(>下限)不受影响
		o2 := resolvePeriodicOptions(PeriodicOptions{})
		if o2.HarvestInterval != PeriodicHarvestDefault || o2.CheckInterval != PeriodicCheckDefault {
			t.Fatalf("缺省值应保持: %v / %v", o2.HarvestInterval, o2.CheckInterval)
		}
	})
	t.Run("env_正常分钟形态仍生效", func(t *testing.T) {
		t.Setenv(EnvHarvestInterval, "45")
		o := resolvePeriodicOptions(PeriodicOptions{})
		if o.HarvestInterval != 45*time.Minute {
			t.Fatalf("env 45 → %v, want 45m(既有口径零回归)", o.HarvestInterval)
		}
	})
}
