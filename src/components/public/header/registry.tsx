// [R39-1] 拆分自 SiteHeader.tsx —— 仿站头部注册表(ImitationHeaderProps / IMITATION_HEADERS / HEADER_BOTTOM_BORDER)
// R39 用户指令「彻底删除→重克隆」执行中: R28 轮 10 站头部已删, 逐站重写后回填注册。
// Partial 化: 重建期间未完成的站回退 aijjxs(首个完成站), 前台不崩。
'use client'

import type { ComponentType } from 'react'
import type { SiteCloneId } from '@/lib/crawl/themes'
import type { CategoryItem } from '../types'
import { AijjxsHeader } from './aijjxs'
import { DdyueshuHeader } from './ddyueshu'
import { Ggd66Header } from './ggd66'
import { X2552Header } from './x2552'
import { QbHeader } from './qb23'
import { HuangjinwuHeader } from './huangjinwu'
import { KksHeader } from './kks101'
import { PiliHeader } from './pili'
import { ShipsayHeader } from './shipsay'
import { TrxswHeader } from './trxsw'
import { X33yqHeader } from './x33yq' // [R43-2] 第 12 主题: 33言情

/** 仿站头部分支统一 props(分类数据由主组件 useCategories 单点拉取后下发) */
export interface ImitationHeaderProps {
  cats: CategoryItem[]
  pending: boolean
}

const IMITATION_HEADERS: Partial<Record<SiteCloneId, ComponentType<ImitationHeaderProps>>> = {
  aijjxs: AijjxsHeader, // [R39-2a] 重克隆挂载
  ddyueshu: DdyueshuHeader, // [R39-2d] 重克隆挂载
  ggd66: Ggd66Header, // [R39-2e] 重克隆挂载
  pili: PiliHeader, // [R39-2j] 重克隆挂载
  kks101: KksHeader, // [R39-2i] 重克隆挂载
  huangjinwu: HuangjinwuHeader, // [R39-2h] 重克隆挂载
  qb23: QbHeader, // [R39-2g] 重克隆挂载
  x2552: X2552Header, // [R39-2f] legacy 恢复挂载
  shipsay: ShipsayHeader, // [R39-2c] legacy 恢复挂载
  trxsw: TrxswHeader, // [R39-2c] legacy 恢复挂载
  x33yq: X33yqHeader, // [R43-2] 重克隆挂载
}

/** 外层底边线特例(如 aijjxs 真站头部带 1px 边线) */
const HEADER_BOTTOM_BORDER: Partial<Record<SiteCloneId, 'site-border'>> = {
  aijjxs: 'site-border', // [R39-2a] 真站 header.top 带 1px 边线(style.css .top border 实测)
}

export { IMITATION_HEADERS, HEADER_BOTTOM_BORDER }
