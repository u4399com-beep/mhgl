import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// [R9-cl-1] 整合: cleaner/DebugHtmlViewer 各有一份同款正则转义, 下沉共用
/** 转义正则元字符(把用户输入安全嵌入 new RegExp) */
export function escapeRegExp(s: string): string {
  return (s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// [R9-cl-1] 整合: "按码点截断"惯用法在 cleaner/storage/rules-test 等多处重复, 下沉共用
// (Array.from 迭代码点而非 UTF-16 单元, emoji 等 astral 字符代理对不斩半产出 U+FFFD)
/** 按码点截断到最多 max 个字符 */
export function sliceCodePoints(s: string, max: number): string {
  return Array.from(s).slice(0, max).join('')
}
