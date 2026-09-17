// ============================================================
// [R36-2d-10] 后台管理共享 hooks —— StrictMode 安全的 alive 竞态守卫。
// 原 BooksSection/DownloadsSection/TasksSection/TestPanel/BookDetail/FieldRuleEditor
// 六处逐字节重复的「useRef(true) + 挂载复位/卸载置否 effect」收敛为单处定义。
// 语义与原内联实现一致: 挂载(含 StrictMode dev 卸载→重挂载)复位 true, 卸载置 false,
// 异步回调消费方经 aliveRef.current 丢弃过期结果。
// ============================================================
'use client'

import { useEffect, useRef } from 'react'

export function useAliveRef() {
  const aliveRef = useRef(true)
  // 挂载/重挂载时复位 aliveRef(StrictMode dev 下会 卸载→重挂载, 旧实现只设 false 不复位 → 卡 loading)
  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
    }
  }, [])
  return aliveRef
}
