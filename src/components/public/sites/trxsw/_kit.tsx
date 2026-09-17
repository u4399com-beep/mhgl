// ============================================================
// [R34-2c-4] trxsw(天下书屋) 杰奇 CMS 家族共享小件 —— 原 JqH2(简洁版)×3(Search/Fulltext/
// Ranking)与 Pager×2(Fulltext/Category)为逐字节复制, 收敛为单处定义。
// [R36-2d-11] JqH2Slot(右插槽版, 原 Home/Category 各持一份本地件)同款收敛; 简版与插槽版
// className 差 justify-between gap-2(单子元素时无视觉差), 两形态并存防既有 DOM 类串漂移。
// ============================================================
'use client'

import type { ReactNode } from 'react'

/** 杰奇默认 h2: 浅色渐变底纹 + 左 4px 深蓝竖条 + 下边线(真站 h2 为底纹图 → CSS 渐变等价) */
export function JqH2({ children }: { children: ReactNode }) {
  const C = {
    navBlue: '#1C5087',
    text: '#333333',
    border: '#dddddd',
  } as const
  return (
    <h2
      className="flex items-center overflow-hidden"
      style={{
        background: 'linear-gradient(180deg, #fafbfc 0%, #e9eef5 100%)',
        borderBottom: `1px solid ${C.border}`,
        borderLeft: `4px solid ${C.navBlue}`,
        color: C.text,
        fontSize: 14,
        fontWeight: 700,
        lineHeight: '32px',
        minHeight: 32,
        margin: 0,
        paddingLeft: 8,
        paddingRight: 8,
      }}
    >
      {children}
    </h2>
  )
}

/**
 * [R36-2d-11] 杰奇默认 h2·右插槽版 —— 原 Home.tsx 本地件(带 right 插槽)与 Category.tsx 本地件
 * (无插槽; 原零调用的 more 参数已削)逐字节同 JSX 收敛。className 含 justify-between gap-2,
 * 与简版 JqH2 不同, 勿混用。
 */
export function JqH2Slot({ children, right }: { children: ReactNode; right?: ReactNode }) {
  const C = {
    navBlue: '#1C5087',
    text: '#333333',
    border: '#dddddd',
  } as const
  return (
    <h2
      className="flex items-center justify-between gap-2 overflow-hidden"
      style={{
        background: 'linear-gradient(180deg, #fafbfc 0%, #e9eef5 100%)',
        borderBottom: `1px solid ${C.border}`,
        borderLeft: `4px solid ${C.navBlue}`,
        color: C.text,
        fontSize: 14,
        fontWeight: 700,
        lineHeight: '32px',
        minHeight: 32,
        margin: 0,
        paddingLeft: 8,
        paddingRight: 8,
      }}
    >
      {children}
      {right}
    </h2>
  )
}

/** [R28-2g-4] 杰奇家族方块分页(白底灰边, hover/当前页深蓝白字) */
export function Pager({ page, totalPages, onGo }: { page: number; totalPages: number; onGo: (p: number) => void }) {
  if (totalPages <= 1) return null
  const start = Math.max(1, Math.min(page - 4, totalPages - 9))
  const nums = Array.from({ length: Math.min(10, totalPages) }, (_, i) => start + i)
  const cell = 'tx-pg m-[2px] inline-flex h-[30px] min-w-[30px] items-center justify-center border px-1 text-[13px]'
  const C = { navBlue: '#1C5087' } as const
  return (
    <nav aria-label="分页" className="tx-pages flex flex-wrap items-center justify-center py-3">
      {page > 1 && (
        <button type="button" onClick={() => onGo(page - 1)} className={cell} aria-label="上一页">
          上一页
        </button>
      )}
      {nums.map((n) =>
        n === page ? (
          <strong key={n} className={cell} style={{ background: C.navBlue, borderColor: C.navBlue, color: '#fff' }} aria-current="page">
            {n}
          </strong>
        ) : (
          <button key={n} type="button" onClick={() => onGo(n)} className={cell} aria-label={`第 ${n} 页`}>
            {n}
          </button>
        ),
      )}
      {page < totalPages && (
        <button type="button" onClick={() => onGo(page + 1)} className={cell} aria-label="下一页">
          下一页
        </button>
      )}
    </nav>
  )
}
