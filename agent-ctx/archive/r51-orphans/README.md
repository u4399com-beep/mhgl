# r51-orphans — R51-4 未接线孤儿件归档（23 个文件，2026-09）

来源：R51-3-c 报告的「可编译待接线」孤儿消费者（registry `index.ts` 走另一组现役文件），R51-4 逐个 rg 证实**零 import / 零引用**（含跨站引用与动态 import 模式）后按「只移不删、保留字节」归档于此。恢复方式：`mv` 回原路径即可（文件为 untracked 状态归档，路径见下表）；若主控后续裁决「接线孤儿换代」，恢复后与 `src/` 现役共享模块（kks101/huangjinwu 的 `parts.tsx`、`Home.tsx`、`Book.tsx`）直接兼容（补齐件均按同代原版，接线即视觉复原）。

| 原路径 | 文件 | 说明 |
| --- | --- | --- |
| src/components/public/sites/kks101/ | Category.tsx / Fulltext.tsx / Ranking.tsx / Read.tsx / Search.tsx / Toc.tsx | R28-2f 页型（registry index.ts 走 pages.tsx/Book.tsx R39 组）；六者共同 import 的 `kks101/parts.tsx` 留在原位未归档（接线恢复件） |
| src/components/public/sites/huangjinwu/ | Category.tsx / Ranking.tsx / Read.tsx / Search.tsx / Toc.tsx | R28-2d 页型（Home.tsx/Book.tsx 为 R51-3-c 补齐过的现役文件，未动）；其中 Search/Category import `./Home`、Toc import `./Book`（现役文件留在原位） |
| src/components/public/layouts/ | HomeBiquge / HomeDashboard / HomeGrid / HomeList / HomeMagazine / HomeMasonry / HomeMinimal / HomeNewspaper / HomePili / HomeShelf / HomeTheater / HomeTimeline（12 个） | R23/R28 代次未接线首页布局件（theme-matrix.ts 已于 R51-3-c-7 删除，不会再引用它们）；归档后 `src/components/public/layouts/` 目录已空并移除 |
| src/components/public/ | CategoryShowcase.tsx | R28 首页分类图文卡组件（零 JSX 消费点；其数据源 `fetchShowcaseCategories`/`ShowcaseCategory` 留在 `data.ts` 现役面） |

注：①`huangjinwu/parts.tsx` 与 `kks101/parts.tsx` 为零 import 的共享件但**非页型**，按任务边界未归档，留待主控对「接线 vs 清理」裁决时一并处置；②归档前全库 rg 交叉核查（`src/`、`app/`、`scripts/`、package.json）零功能性引用，仅注释提及（注释未改动，历史轮次 worklog 已留档）。
