"use client"

import * as React from "react"
import { useState } from "react"
import { Loader2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

/**
 * 管理端通用确认对话框 — 封装 AlertDialog 确认弹窗样板（rr 轮 cleanup-report 整合机会① 的落地）。
 *
 * 形态基线：迁移自管理端 17 处受控 AlertDialog 确认弹窗，骨架全等：
 * Content(zinc-900 底/zinc-800 描边) + Title(zinc-100) + Description(zinc-400)
 * + Cancel(zinc 描边钮"取消") + Action(色调确认钮)。
 *
 * 行为契约（与既有用例零差异）：
 * - onConfirm 直传 AlertDialogAction 的 onClick：Radix Action 点击即自动关闭（先回调后关闭），
 *   关闭经 onOpenChange(false) 通知调用方清状态；Escape / 点遮罩 / 取消钮走同一通道。
 * - 回调返回 Promise 时不拦截关闭（与既有 fire-and-forget 形态一致），
 *   异步错误处理沿用项目惯例（回调内 try/catch + toast）。
 * - loading=true 时确认钮禁用并显示 spinner（对应批量操作运行中防重复点击形态）。
 */

const CONFIRM_TONE_CLASS = {
  /** 删除类（红） */
  danger: "bg-red-600 text-white hover:bg-red-700",
  /** 重操作类（琥珀：繁转简 / 章节标记未采） */
  amber: "bg-amber-600 text-white hover:bg-amber-700",
  /** 增量任务类（青：重采-增量更新） */
  teal: "bg-teal-600 text-white hover:bg-teal-700",
} as const

type ConfirmTone = keyof typeof CONFIRM_TONE_CLASS

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: React.ReactNode
  description: React.ReactNode
  /** 确认钮文案，默认"确认" */
  confirmText?: React.ReactNode
  /** 取消钮文案，默认"取消" */
  cancelText?: React.ReactNode
  /** 确认钮色调，默认 danger */
  tone?: ConfirmTone
  /** 确认回调，可为异步；点击后对话框照常关闭，错误处理归回调 */
  onConfirm?: () => void | Promise<void>
  /** 置真时确认钮禁用 + spinner（由调用方状态驱动，如批量运行中） */
  loading?: boolean
  /** 仅禁用确认钮（无 spinner） */
  confirmDisabled?: boolean
  /** [R15-d2-3] 输入确认门槛：设置后必须在此输入框精确键入该文本确认钮才可用 ——
   *  用于批量删除等不可恢复大操作，防误点链路（单击确认 + 陈旧引用误击）直接落地 */
  requireTextInput?: string
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText = "确认",
  cancelText = "取消",
  tone = "danger",
  onConfirm,
  loading = false,
  confirmDisabled = false,
  requireTextInput,
}: ConfirmDialogProps) {
  // [R15-d2-3] 输入确认状态：关闭时重置(Radix 关闭路径统一走 onOpenChange(false),
  // 含 Esc/遮罩/取消), 下次打开必然从空串开始; 避免在 effect 内同步 setState
  const [typed, setTyped] = useState("")
  const handleOpenChange = (o: boolean) => {
    if (!o) setTyped("")
    onOpenChange(o)
  }
  const gated = requireTextInput !== undefined && typed !== requireTextInput
  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent className="border-zinc-800 bg-zinc-900">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-zinc-100">{title}</AlertDialogTitle>
          <AlertDialogDescription className="text-zinc-400">{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {requireTextInput !== undefined ? (
          <Input
            aria-label={`输入 ${requireTextInput} 以确认`}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={`输入「${requireTextInput}」以确认`}
            maxLength={20}
            className="h-9 border-zinc-700 bg-zinc-950 text-sm"
          />
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel className="border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800">
            {cancelText}
          </AlertDialogCancel>
          <AlertDialogAction
            className={CONFIRM_TONE_CLASS[tone]}
            onClick={onConfirm}
            disabled={loading || confirmDisabled || gated}
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
