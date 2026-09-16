// [R31-7] 拆分自 SiteHeader.tsx（纯机械搬移）—— 仿站头部注册表(ImitationHeaderProps / IMITATION_HEADERS / HEADER_BOTTOM_BORDER)
'use client'

import type { ComponentType } from 'react'
import type { SiteCloneId } from '@/lib/crawl/themes'
import type { CategoryItem } from '../types'
import { AijjxsHeader } from './aijjxs'
import { PiliHeader } from './pili'
import { KksHeader } from './kks101'
import { QbHeader } from './qb23'
import { DdyueshuHeader } from './ddyueshu'
import { X2552Header } from './x2552'
import { HuangjinwuHeader } from './huangjinwu'
import { Ggd66Header } from './ggd66'
import { ShipsayHeader } from './shipsay'
import { TrxswHeader } from './trxsw'

// ============================================================
// [R24-6-a-14] 5 个新克隆头部(替换 R24-5 占位 CloneHeaderShell/CloneNavBtn, 已删)——
// 逐站依据 /tmp/sites/{name}-home.html + 对应 CSS 实测还原结构/配色/字重/间距/边线。
// 色值全部硬编码为真站实测值; 交互态(hover/active)按真站 CSS 对应规则还原。
// ============================================================

/** 仿站头部分支统一 props(分类数据由主组件 useCategories 单点拉取后下发) */
interface ImitationHeaderProps {
  cats: CategoryItem[]
  pending: boolean
}

// ============================================================
// [R24-5] 9 站克隆头部 + [R25-4] trxsw 第 10 分支 —— headerStyle(=SiteCloneId) → 各站专属头部子组件。
//   aijjxs/pili/kks101(原 kks)/qb23(原 qb) 为既有真站实测头部, 视觉行为不变;
//   ddyueshu/x2552/huangjinwu/ggd66/shipsay 为 [R24-6] 新增克隆头部(通用样式分支已删);
//   trxsw 为 [R25-4] 新增(杰奇 CMS 经典默认模板, b.css 无存档配色按杰奇默认模板规范还原)。
// ============================================================
const IMITATION_HEADERS: Record<SiteCloneId, ComponentType<ImitationHeaderProps>> = {
  aijjxs: AijjxsHeader,
  pili: PiliHeader,
  kks101: KksHeader,
  qb23: QbHeader,
  ddyueshu: DdyueshuHeader,
  x2552: X2552Header,
  huangjinwu: HuangjinwuHeader,
  ggd66: Ggd66Header,
  shipsay: ShipsayHeader,
  trxsw: TrxswHeader, // [R25-4-7]
}

// [R24-5] 外层底边线特例: aijjxs 真站头部带 1px 边线, 其余站头部自绘边线/无外层边线
const HEADER_BOTTOM_BORDER: Partial<Record<SiteCloneId, 'site-border'>> = { aijjxs: 'site-border' }

export { IMITATION_HEADERS, HEADER_BOTTOM_BORDER }
export type { ImitationHeaderProps }
