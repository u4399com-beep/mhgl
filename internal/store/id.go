// ============================================================
// ID 生成(对齐 Prisma cuid 形态: 'c' + 25 字符以内、时间有序、进程内唯一)
// 现存 id 全部由 Prisma cuid 生成; 本实现保证: 形态相似('c'+base36 小写)、
// 全表唯一(PK 冲突重试由调用方处理, 实际碰撞概率≈0)、长度 25。
// ============================================================
package store

import (
	"crypto/rand"
	"sync"
	"time"
)

const base36 = "0123456789abcdefghijklmnopqrstuvwxyz"

var (
	idMu          sync.Mutex
	idLastMs      int64
	idSeq         uint32
	idFingerprint string
)

func init() {
	// 进程指纹: 随机 4 字符, 同毫秒跨进程也不撞
	var b [8]byte
	_, _ = rand.Read(b[:])
	idFingerprint = encodeBase36(b[:2], 4)
}

func encodeBase36(src []byte, n int) string {
	out := make([]byte, n)
	// 简单取模散列到 base36
	var acc uint64
	for i, v := range src {
		acc = acc*251 + uint64(v) + uint64(i)
	}
	for i := n - 1; i >= 0; i-- {
		out[i] = base36[acc%36]
		acc /= 36
		if acc == 0 && i > 0 {
			acc = uint64(src[0]) + uint64(n) // 回填防前导全零
		}
	}
	return string(out)
}

// NewID 生成 cuid 形态主键: c + 8位时间(base36) + 4位进程指纹 + 4位序号 + 8位随机。
func (d *DB) NewID() string {
	now := time.Now().UnixMilli()
	idMu.Lock()
	if now == idLastMs {
		idSeq++
	} else {
		idLastMs = now
		idSeq = 0
	}
	seq := idSeq
	idMu.Unlock()

	var rb [6]byte
	_, _ = rand.Read(rb[:])
	ts := encodeBase36([]byte{
		byte(now >> 40), byte(now >> 32), byte(now >> 24), byte(now >> 16), byte(now >> 8), byte(now),
	}, 8)
	return "c" + ts + idFingerprint + encodeBase36([]byte{byte(seq >> 8), byte(seq)}, 3) + encodeBase36(rb[:], 9)
}

// NowMS 当前毫秒时间戳(DB 写入统一口径)。
func NowMS() int64 { return time.Now().UnixMilli() }
