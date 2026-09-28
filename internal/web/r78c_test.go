// ============================================================
// [R78-c] 精简回归钉子
//
// ToStrSafe 历史上与 store.ToStr 是两份逐 case 等价的标量字符串化实现
// (nil→""/string·[]byte 直取/数值与其他类型 fmt.Sprint 同输出)。R78-c
// 收敛为委托单一实现(web/render.go ToStrSafe → store.ToStr)。
// 本测试把「两函数逐值等价」钉成显式契约: 未来任一侧单独改口径
// (例如 float 格式化/[]byte 语义分叉)立即红, 防双实现漂移复发。
// ============================================================
package web

import (
	"testing"
	"time"

	"mhgl/internal/store"
)

func TestR78c_ToStrSafeDelegatesToStr(t *testing.T) {
	now := time.Unix(1700000000, 0).UTC()
	corpus := []any{
		nil, "", "plain", "中文", []byte("bytes"),
		0, 7, int64(-42), int64(1 << 62), 3.5,
		true, false, now, struct{ A string }{"x"},
	}
	for _, v := range corpus {
		if got, want := ToStrSafe(v), store.ToStr(v); got != want {
			t.Fatalf("ToStrSafe(%#v)=%q != store.ToStr(%#v)=%q", v, got, v, want)
		}
	}
}
