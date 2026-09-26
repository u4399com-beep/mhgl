// ============================================================
// 代理池周期化(R57-2a) — 收割+校验后台循环(R56 遗留项: 收割此前仅手动端点触发)
//
//	StartPeriodic(ctx, db, opts): 单协程双 timer 循环
//	  - 每 HarvestInterval(缺省 6h, env PROXY_HARVEST_INTERVAL 覆盖)收割一轮
//	  - 每 CheckInterval(缺省 30min)对 stale 代理校验一轮(limit 150, 最旧优先,
//	    可复活死代理)
//	防重入: 包级原子标志 —— 双装配(主控+测试/误调用)第二个调用直接拒绝返回 false;
//	收割/校验在单循环内串行, 同类操作天然不重叠(收割慢于间隔时校验顺延, 不并发轰炸源)。
//	首拉延后一个周期(装配即收割会拖累进程启动带宽; DB 池已有存量+手动端点兜底首充)。
//
// ============================================================
package proxy

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"strconv"
	"strings"
	"sync/atomic"
	"time"
)

// 周期化缺省(任务书口径)
const (
	// PeriodicHarvestDefault 收割间隔缺省 6h
	PeriodicHarvestDefault = 6 * time.Hour
	// PeriodicCheckDefault stale 校验轮间隔缺省 30min
	PeriodicCheckDefault = 30 * time.Minute
	// PeriodicCheckLimitDefault 每轮校验条数缺省 150
	PeriodicCheckLimitDefault = 150
	// PeriodicIntervalFloor 间隔下限([R69-a] 负输入防御): env/opts 过小时钳到此值,
	// 防 PROXY_HARVEST_INTERVAL=1ms 之类误配置把收割循环变成对源站的持续轰炸
	PeriodicIntervalFloor = time.Minute
	// EnvHarvestInterval 收割间隔环境变量(PROXY_HARVEST_INTERVAL;
	// 支持 Go duration 形态 "6h"/"90m" 或纯数字按分钟 "45")
	EnvHarvestInterval = "PROXY_HARVEST_INTERVAL"
)

// periodicRunning 周期化实例防重入标志(包级: 一个进程至多一个循环)
var periodicRunning atomic.Bool

// PeriodicOptions 周期化选项(零值字段取缺省)
type PeriodicOptions struct {
	// HarvestInterval 收割间隔(≤0 时取 env EnvHarvestInterval, 再退缺省 6h)
	HarvestInterval time.Duration
	// CheckInterval stale 校验轮间隔(缺省 30min)
	CheckInterval time.Duration
	// CheckLimit 每轮校验条数(缺省 150)
	CheckLimit int
	// Logf 日志钩子(缺省 stdout; 测试注入)
	Logf func(format string, args ...interface{})
	// Ready 测试同步钩子(非 nil 时在防重入标志占位成功后关闭; 生产传 nil)
	Ready chan struct{}
}

// resolvePeriodicOptions 选项归一(纯函数, env 读取集中于此供单测):
// 收割间隔优先级 显式 opts > env > 缺省; 非法形态一律退缺省;
// [R69-a] 双间隔一律钳 PeriodicIntervalFloor(负输入防御, 显式 opts 同样受钳)
func resolvePeriodicOptions(opts PeriodicOptions) PeriodicOptions {
	if opts.HarvestInterval <= 0 {
		opts.HarvestInterval = PeriodicHarvestDefault
		if raw := strings.TrimSpace(os.Getenv(EnvHarvestInterval)); raw != "" {
			if d, err := time.ParseDuration(raw); err == nil && d > 0 {
				opts.HarvestInterval = d
			} else if n, err := strconv.Atoi(raw); err == nil && n > 0 {
				opts.HarvestInterval = time.Duration(n) * time.Minute // 纯数字按分钟
			}
		}
	}
	if opts.CheckInterval <= 0 {
		opts.CheckInterval = PeriodicCheckDefault
	}
	if opts.CheckLimit <= 0 {
		opts.CheckLimit = PeriodicCheckLimitDefault
	}
	// [R69-a] 间隔下限防御(含 env 解析出的亚分钟值与显式 opts 小值)
	if opts.HarvestInterval < PeriodicIntervalFloor {
		opts.HarvestInterval = PeriodicIntervalFloor
	}
	if opts.CheckInterval < PeriodicIntervalFloor {
		opts.CheckInterval = PeriodicIntervalFloor
	}
	if opts.Logf == nil {
		opts.Logf = func(format string, args ...interface{}) {
			fmt.Printf("[proxy-periodic] "+format+"\n", args...)
		}
	}
	return opts
}

// resetTimerDrained 排干后重置([R72-a] timer.Reset 语义修复): 单循环在 case 体内
// 消费了本轮 tick, 但若 case 体耗时超过间隔, 下一轮 tick 已先行入 channel —— 裸
// Reset 不清除该 stale tick(docs: Reset 只应作用于已 Stop 且 channel 已排干的 Timer),
// 循环下一轮 select 立即收到旧 tick → 收割/校验背靠背连跑(间隔下限 1m 后, 一轮耗时
// 超 1m 的慢源/DB 争用场景即触发「越慢越加倍轰炸」)。修后 Stop(false=已触发)+非阻塞
// 排干再 Reset, 下一轮恒按完整间隔等待
func resetTimerDrained(t *time.Timer, d time.Duration) {
	if !t.Stop() {
		select {
		case <-t.C:
		default:
		}
	}
	t.Reset(d)
}

// StartPeriodic 启动周期化循环(阻塞直至 ctx 取消; 装配点 go proxy.StartPeriodic(...))。
// 返回 false = 已有实例在跑(防重入), 本次未启动; true = 本次循环已随 ctx 退出。
// db 为 nil 时直接拒绝(防装配失误静默空转)
func StartPeriodic(ctx context.Context, db *sql.DB, opts PeriodicOptions) bool {
	if db == nil {
		return false
	}
	if !periodicRunning.CompareAndSwap(false, true) {
		// 防重入: 已有实例在跑, 本调用拒绝(日志走缺省出口, 此刻 opts 可能未归一)
		fmt.Printf("[proxy-periodic] 已有周期化实例在运行, 拒绝重复启动\n")
		return false
	}
	defer periodicRunning.Store(false)
	o := resolvePeriodicOptions(opts)
	if o.Ready != nil {
		close(o.Ready)
	}
	h := NewHarvester(db)
	o.Logf("周期化启动: 收割间隔 %s / stale 校验间隔 %s(每轮 limit %d)",
		o.HarvestInterval, o.CheckInterval, o.CheckLimit)

	harvestT := time.NewTimer(o.HarvestInterval)
	defer harvestT.Stop()
	checkT := time.NewTimer(o.CheckInterval)
	defer checkT.Stop()
	for {
		select {
		case <-ctx.Done():
			o.Logf("周期化退出: %v", ctx.Err())
			return true
		case <-harvestT.C:
			r := h.Harvest(ctx)
			o.Logf("收割完成: 解析 %d / 新增 %d 条(耗时 %dms; %d 源)",
				r.Parsed, r.Added, r.ElapsedMs, len(r.PerSource))
			resetTimerDrained(harvestT, o.HarvestInterval)
		case <-checkT.C:
			cr, err := h.Check(ctx, CheckOptions{Mode: "stale", Limit: o.CheckLimit, Concurrency: CheckConcurrencyDefault})
			if err != nil {
				o.Logf("stale 校验轮失败(下轮重试): %v", err)
			} else {
				o.Logf("stale 校验完成: 验 %d / 活 %d / 死 %d(耗时 %dms)",
					cr.Checked, cr.Alive, cr.Dead, cr.ElapsedMs)
			}
			resetTimerDrained(checkT, o.CheckInterval)
		}
	}
}
