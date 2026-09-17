// ============================================================
// [R30-1-2] 自动 TDK SEO 预设矩阵 —— 18 套风格差异化预设 + 随机组合引擎(纯函数, 客户端/服务端同构)
// 用户指令: 「自动TDK SEO，做至少18套预设矩阵，点击刷新按钮可以随机组合生成。」
//   · 每套预设 = 完整 SeoTplSet(book T/D/K + toc T/D + chapter T/D/K), 风格差异化:
//     悬念/疑问/数字/权威/长尾词/情感/工具/急迫感/信任/场景/榜单/完结/追更/简洁/推荐/沉浸/口碑/亮点
//   · 只使用 seo-tpl.ts 已文档化变量: {bookname}{author}{category}{sitename}{chaptername}
//     {chapterno}{chapterCount}{statusText}{intro}{excerpt} —— 未知变量会被引擎整段丢弃, 故不越界
//   · 模板不写死超长: title 句式按渲染后 ≤40 码点设计, description ≤160, keywords ≤200
//     (与 DEFAULT_SEO_TEMPLATES 同安全线; compose* 出口仍有码点截断兜底)
//   · 每条模板必含 '{'(至少一个变量占位符) → sanitizeSeoTpl「含 { 才采纳」的安全语义天然成立
//   · statusText 可能为空(未知连载状态): 句式均已按引擎的标点折叠/修剪规则设计, 空值不留脏字
// ============================================================
import type { SeoTplSet, SeoTplVars } from './seo-tpl'

/** 单套预设 = 完整三页型模板集 + 元信息(id/展示名/风格标签) */
interface SeoPreset extends SeoTplSet {
  /** 预设 id(来源追溯用, 如 'suspense') */
  id: string
  /** 展示名(如 '悬念型·隐藏结局'), 后台来源徽章用 */
  name: string
  /** 风格标签(如 '悬念型') */
  style: string
}

/** [R30-1-2] 18 套完整预设 —— 标题句式/卖点角度/关键词策略逐套互异(参考真实书站长尾词形态:
 *  免费阅读/无弹窗/全本/最新章节/TXT下载/在线阅读/完整版/经典/必读/高分/排行榜/完结大全/连载中) */
export const SEO_TPL_PRESETS: SeoPreset[] = [
  {
    id: 'suspense', name: '悬念型·隐藏结局', style: '悬念型',
    book: {
      title: '{bookname}大结局隐藏真相全文阅读 - {sitename}',
      description:
        '《{bookname}》大结局究竟如何？{author}埋下的伏笔在{chapterCount}章后逐一揭晓。{sitename}收录全书无删减版本，隐藏结局与番外一次看全，读完你会发现前文每一处细节都是铺垫。',
      keywords: '{bookname}大结局,{bookname}结局解析,{bookname}隐藏结局,{bookname}无删减,{bookname}番外,{author}小说结局',
    },
    toc: {
      title: '{bookname}全部章节目录（含大结局） - {sitename}',
      description: '《{bookname}》{statusText}，全书{chapterCount}章。目录完整收录所有章节与番外，最后一章的隐藏结局等你揭开，{sitename}持续更新第一时间放送。',
    },
    chapter: {
      title: '{bookname}关键剧情：{chaptername} - {sitename}',
      description: '{chaptername}——这一章埋着《{bookname}》全书最大的伏笔。{excerpt}……{sitename}无弹窗沉浸阅读，读完本章即可一路追到大结局。',
      keywords: '{bookname}{chaptername},{bookname}伏笔,{bookname}大结局,{bookname}章节解析,{author}',
    },
  },
  {
    id: 'question', name: '疑问型·追读问答', style: '疑问型',
    book: {
      title: '{bookname}好看吗？值不值得追？ - {sitename}',
      description:
        '{bookname}好看吗？{author}的这部{category}小说值不值得入坑？{chapterCount}章口碑见分晓：{intro}在{sitename}免注册即可开读，追完记得回来对答案。',
      keywords: '{bookname}好看吗,{bookname}怎么样,{bookname}值得看吗,{bookname}评价,{bookname}评分,{author},{category}小说推荐',
    },
    toc: {
      title: '{bookname}章节目录一览（共{chapterCount}章） - {sitename}',
      description: '《{bookname}》全书共{chapterCount}章，哪一章最精彩？{statusText}。完整目录在此，{sitename}帮你快速定位高能章节，新书连载每日更新不掉队。',
    },
    chapter: {
      title: '读到{chaptername}了吗？{bookname} - {sitename}',
      description: '{chaptername}讲了什么？点开本章三分钟读完全部剧情：《{bookname}》{excerpt}……更多章节解析与全文阅读尽在{sitename}。',
      keywords: '{bookname}{chaptername}讲了什么,{bookname}章节列表,{bookname}剧情解析,{chaptername},{bookname}',
    },
  },
  {
    id: 'numeric', name: '数字型·数据说话', style: '数字型',
    book: {
      title: '{bookname}全{chapterCount}章完整版阅读 - {sitename}',
      description: '《{bookname}》累计更新{chapterCount}章，{statusText}。{intro}{sitename}数据看板：更新稳定、章节齐全、阅读流畅，数字不会说谎。',
      keywords: '{bookname}全本,{bookname}共几章,{bookname}多少章,{bookname}完整版,{bookname}字数,{author}作品集,{category}小说',
    },
    toc: {
      title: '{bookname}目录（第1-{chapterCount}章） - {sitename}',
      description: '{bookname}已更新至{chapterCount}章：{sitename}目录页按序号精排，第1章到最新章一键直达，漏章自动补全，追更从这里开始。',
    },
    chapter: {
      title: '{bookname}第{chapterno}章阅读：{chaptername} - {sitename}',
      description: '第{chapterno}章{chaptername}——《{bookname}》{statusText}的第{chapterno}话。{excerpt}……{sitename}自动保存阅读进度，读完一键续读下一章。',
      keywords: '{bookname}第{chapterno}章,{bookname}{chaptername},{bookname}章节页,{bookname}下一章,{bookname}阅读进度',
    },
  },
  {
    id: 'authority', name: '权威型·经典必读', style: '权威型',
    book: {
      title: '{bookname}｜{author}经典{category}小说 - {sitename}',
      description: '《{bookname}》——{author}代表作之一，公认的经典{category}小说。{intro}{sitename}提供权威完整版本，从第一章到大结局原貌呈现，经典值得从头细读。',
      keywords: '{bookname},{bookname}经典,{bookname}必读,{bookname}代表作,{author}代表作,{category}经典小说,{category}必读书单',
    },
    toc: {
      title: '{bookname}完整目录·经典全本 - {sitename}',
      description: '《{bookname}》共{chapterCount}章，{statusText}。{sitename}按出版体例整理全书目录，卷章分明、序号准确，读经典就从这份目录开始。',
    },
    chapter: {
      title: '{bookname}·{chaptername}原文 - {sitename}',
      description: '《{bookname}》{chaptername}原文呈现，未经删改。{excerpt}……{sitename}致力于还原{author}笔下每一处细节，读经典就要读全本。',
      keywords: '{bookname}原文,{bookname}经典段落,{bookname}{chaptername},{bookname}全本,{author}原文作品',
    },
  },
  {
    id: 'longtail', name: '长尾词型·搜索全覆盖', style: '长尾词型',
    book: {
      title: '{bookname}免费阅读_无弹窗_全本TXT下载 - {sitename}',
      description:
        '{bookname}免费阅读无弹窗，《{bookname}》是{author}创作的{category}小说，{statusText}共{chapterCount}章。{sitename}支持在线阅读与全本TXT下载，手机电脑双端适配。',
      keywords: '{bookname}免费阅读,{bookname}无弹窗,{bookname}TXT下载,{bookname}全本阅读,{bookname}在线阅读,{bookname}完整版,{category}小说免费',
    },
    toc: {
      title: '{bookname}最新章节目录列表_免费阅读 - {sitename}',
      description: '{bookname}最新章节列表：{sitename}整理《{bookname}》全部{chapterCount}章目录，{statusText}持续更新，支持免费在线阅读与全本TXT打包下载。',
    },
    chapter: {
      title: '{bookname}无弹窗阅读_{chaptername} - {sitename}',
      description: '{bookname}最新章节{chaptername}免费无弹窗阅读：{excerpt}……《{bookname}》{statusText}，{sitename}全站绿色阅读环境，正文即开即读。',
      keywords: '{bookname}最新章节,{bookname}无弹窗,{bookname}免费阅读,{bookname}TXT,{bookname}{chaptername},{category}小说',
    },
  },
  {
    id: 'emotion', name: '情感型·意难平共鸣', style: '情感型',
    book: {
      title: '熬夜也要看完的{bookname} - {sitename}',
      description: '如果你正书荒，请把《{bookname}》留给今晚。{author}用{chapterCount}章写尽{category}世界的悲欢。{intro}多少读者读到最后一个字仍意难平——{sitename}陪你读完它。',
      keywords: '{bookname}意难平,{bookname}泪点,{bookname}书荒必看,{bookname}熬夜追完,{bookname}后劲很大,{author},{category}催泪小说',
    },
    toc: {
      title: '{bookname}完整章节单（慢慢读不着急） - {sitename}',
      description: '《{bookname}》{statusText}，全书{chapterCount}章目录都在这里。不必赶进度，{sitename}为你存好每一章，想它的任何时候都能翻开。',
    },
    chapter: {
      title: '{bookname}·{chaptername}（深夜请自备纸巾） - {sitename}',
      description: '{chaptername}：《{bookname}》读到这里，故事开始收线。{excerpt}……{sitename}安静无打扰的阅读页，留给属于你和{bookname}的深夜。',
      keywords: '{bookname}{chaptername},{bookname}泪目章节,{bookname}意难平,{bookname}书荒,{author}小说',
    },
  },
  {
    id: 'utility', name: '工具型·效率阅读', style: '工具型',
    book: {
      title: '{bookname}在线阅读器｜书架·进度·夜间模式 - {sitename}',
      description: '《{bookname}》{category}小说在线阅读工具页：加入书架、云端进度、字号调节、夜间模式一应俱全。{intro}{sitename}让{chapterCount}章长篇阅读更省心。',
      keywords: '{bookname}在线阅读,{bookname}加入书架,{bookname}阅读进度,{bookname}夜间模式,{bookname}字号调节,{category}阅读工具',
    },
    toc: {
      title: '{bookname}目录速查表（支持倒序翻页） - {sitename}',
      description: '{bookname}目录速查：{chapterCount}章按更新顺序编号，支持正序/倒序切换与页码直达，{sitename}目录工具帮你三秒定位任意章节。',
    },
    chapter: {
      title: '{bookname}阅读页：{chaptername} - {sitename}',
      description: '《{bookname}》{chaptername}阅读中。{excerpt}……本页支持字号/背景/翻页快捷键设置，{sitename}工具条已就绪，读完自动记录进度。',
      keywords: '{bookname}阅读,{bookname}{chaptername},{bookname}阅读器,{bookname}翻页,{bookname}进度保存',
    },
  },
  {
    id: 'urgency', name: '急迫感型·抢先追更', style: '急迫感型',
    book: {
      title: '立即开读{bookname}：{chapterCount}章已就位 - {sitename}',
      description: '《{bookname}》{statusText}，最新章节第一时间上架！{intro}现在点开{sitename}，{chapterCount}章内容即刻直达，比别人先读到关键剧情。',
      keywords: '{bookname}抢先读,{bookname}最新更新,{bookname}第一时间,{bookname}立刻阅读,{bookname}更新公告,{author}新书',
    },
    toc: {
      title: '{bookname}最新目录｜今天更新的章节 - {sitename}',
      description: '{bookname}今日已更新！《{bookname}》{chapterCount}章最新目录实时刷新，{statusText}，{sitename}更新零时差，先睹为快就是现在。',
    },
    chapter: {
      title: '刚更新：{bookname}{chaptername} - {sitename}',
      description: '《{bookname}》刚刚更新：{chaptername}。{excerpt}……追更通道已打开，{sitename}在章节上架的第一时间为你送达，快来抢先阅读。',
      keywords: '{bookname}最新章节,{bookname}刚更新,{bookname}{chaptername},{bookname}追更,{bookname}抢先看',
    },
  },
  {
    id: 'trust', name: '信任型·安心阅读', style: '信任型',
    book: {
      title: '{bookname}绿色安全阅读版 - {sitename}',
      description: '《{bookname}》{author}著，{statusText}共{chapterCount}章。{sitename}承诺：正文无弹窗、无诱导、无捆绑跳转。{intro}把干扰降到最低，只留故事本身。',
      keywords: '{bookname}安全阅读,{bookname}无广告,{bookname}无弹窗,{bookname}绿色阅读,{bookname}纯净版,{author},{category}小说',
    },
    toc: {
      title: '{bookname}章节总目（无广告干扰版） - {sitename}',
      description: '《{bookname}》{statusText}，全部{chapterCount}章目录，页面无弹窗无浮层。{sitename}以干净目录呈现{author}作品全貌，放心逐章点读。',
    },
    chapter: {
      title: '{bookname}正文：{chaptername} - {sitename}',
      description: '《{bookname}》{chaptername}正文纯净呈现：{excerpt}……{sitename}本章页面零弹窗、零跳转，安心读完这一章。',
      keywords: '{bookname}正文,{bookname}无弹窗章节,{bookname}{chaptername},{bookname}安全下载,{author}作品',
    },
  },
  {
    id: 'scene', name: '场景型·随时随地', style: '场景型',
    book: {
      title: '通勤路上读{bookname}刚刚好 - {sitename}',
      description: '地铁上、睡前、排队时——《{bookname}》的{chapterCount}章刚好填满碎片时间。{intro}{sitename}移动端专属排版，单手也能舒适读完每一章。',
      keywords: '{bookname}手机阅读,{bookname}通勤读物,{bookname}睡前故事,{bookname}碎片时间阅读,{bookname}移动端,{category}小说',
    },
    toc: {
      title: '{bookname}章节清单（通勤随手翻） - {sitename}',
      description: '《{bookname}》{statusText}，{chapterCount}章章节清单。通勤十分钟一章刚好，{sitename}目录随手点开随手读，进度自动跟手。',
    },
    chapter: {
      title: '{bookname}碎片阅读：{chaptername} - {sitename}',
      description: '《{bookname}》{chaptername}：一节车厢的时间正好读完。{excerpt}……{sitename}竖屏单栏排版，指尖轻点即达下一章。',
      keywords: '{bookname}手机在线阅读,{bookname}{chaptername},{bookname}碎片阅读,{bookname}地铁读物,{author}小说',
    },
  },
  {
    id: 'ranking', name: '榜单型·高分热门', style: '榜单型',
    book: {
      title: '{bookname}：{category}榜高分之作 - {sitename}',
      description: '《{bookname}》稳居{sitename}{category}小说热门榜前列：{chapterCount}章追读人数持续攀升。{intro}高分作品自有高分的道理，点开亲自验证。',
      keywords: '{bookname}排行榜,{bookname}评分,{bookname}热门小说,{bookname}高分作品,{category}小说榜,{author}排名',
    },
    toc: {
      title: '{bookname}全书目录（热门榜同款） - {sitename}',
      description: '上榜作品《{bookname}》{chapterCount}章完整目录，{statusText}。{sitename}榜单同源数据，目录与更新进度实时一致，追榜追更两不误。',
    },
    chapter: {
      title: '热门榜之选：{bookname}{chaptername} - {sitename}',
      description: '《{bookname}》{chaptername}——榜上读者正在追的一章。{excerpt}……{sitename}实时同步{author}更新，跟上热门榜的阅读节奏。',
      keywords: '{bookname}热门,{bookname}高分,{bookname}{chaptername},{category}热门小说,{bookname}榜单',
    },
  },
  {
    id: 'completed', name: '完结型·一次看个够', style: '完结型',
    book: {
      title: '{bookname}全本一次看个够 - {sitename}',
      description: '《{bookname}》{statusText}，全本{chapterCount}章一气呵成。{intro}不用追更等待，{sitename}从第一章到最终话完整收录，一口气读完才痛快。',
      keywords: '{bookname}完结,{bookname}全本,{bookname}完结大全,{bookname}一次看完,{bookname}大结局,{author}完结作品,{category}完结小说',
    },
    toc: {
      title: '{bookname}全本目录·一次看个够 - {sitename}',
      description: '《{bookname}》{statusText}，全书{chapterCount}章目录完整收录，章节序号清晰稳定。{sitename}存好这份全本单页，随时从任意一章读起。',
    },
    chapter: {
      title: '{bookname}全本阅读：{chaptername} - {sitename}',
      description: '《{bookname}》全本{chaptername}：{excerpt}……章节之间无断点，读到停不下来。{sitename}下一章立即接上，一口气看到底。',
      keywords: '{bookname}完结版,{bookname}全本阅读,{bookname}{chaptername},{bookname}完整章节,{author}完结小说',
    },
  },
  {
    id: 'updating', name: '追更型·最新章节', style: '追更型',
    book: {
      title: '{bookname}最新章节更新列表 - {sitename}',
      description: '《{bookname}》{statusText}，最新章节持续更新中。{intro}{sitename}追更页实时同步{author}的每一次更新，新章节上架即刻可读。',
      keywords: '{bookname}最新章节,{bookname}更新列表,{bookname}连载,{bookname}追更,{bookname}什么时候更新,{author}新作,{category}连载小说',
    },
    toc: {
      title: '{bookname}目录·更新到第{chapterCount}章 - {sitename}',
      description: '{bookname}已更新至第{chapterCount}章，{statusText}。{sitename}目录页置顶最新章节，每次进站都能直接从上次更新的地方接着追。',
    },
    chapter: {
      title: '{bookname}最新章：{chaptername} - {sitename}',
      description: '《{bookname}》最新章节{chaptername}已上线：{excerpt}……{sitename}同步{author}更新节奏，读完本章即可一键追到下一话。',
      keywords: '{bookname}最新章节,{bookname}更新,{bookname}{chaptername},{bookname}连载中,{bookname}追更',
    },
  },
  {
    id: 'minimal', name: '简洁型·极简直给', style: '简洁型',
    book: {
      title: '{bookname} - {author} - {sitename}',
      description: '《{bookname}》，{author}著，{category}小说，{statusText}，共{chapterCount}章。{sitename}提供全文在线阅读。',
      keywords: '{bookname},{bookname}小说,{author},{category}小说,{bookname}在线阅读',
    },
    toc: {
      title: '{bookname}目录 - {sitename}',
      description: '《{bookname}》全{chapterCount}章目录，{statusText}。{sitename}章节列表，点开即读。',
    },
    chapter: {
      title: '{bookname} {chaptername} - {sitename}',
      description: '{bookname}{chaptername}在线阅读：{excerpt}……{sitename}，干净利落读完这一章。',
      keywords: '{bookname},{chaptername},{bookname}最新章节,{author}',
    },
  },
  {
    id: 'recommend', name: '推荐型·书单精选', style: '推荐型',
    book: {
      title: '编辑推荐：{bookname}值得一读 - {sitename}',
      description: '本期书单推荐《{bookname}》：{author}的{category}佳作，{chapterCount}章结构完整。{intro}编辑按：无论剧情还是文笔都经得起重读，{sitename}收录全本。',
      keywords: '{bookname}推荐,{bookname}书单,{bookname}精选,{bookname}值得一读,{category}书单推荐,{author}佳作',
    },
    toc: {
      title: '{bookname}收录目录（书单精选版） - {sitename}',
      description: '书单精选《{bookname}》{chapterCount}章完整目录，{statusText}。{sitename}编辑逐卷校对章节顺序，按这份目录读即是最佳路线。',
    },
    chapter: {
      title: '书单精选：{bookname}·{chaptername} - {sitename}',
      description: '《{bookname}》{chaptername}——书单里最常被划线的一章。{excerpt}……{sitename}精选版正文排版清爽，适合细读。',
      keywords: '{bookname}精选章节,{bookname}{chaptername},{bookname}书单,{bookname}划线最多,{author}精选',
    },
  },
  {
    id: 'immersive', name: '沉浸型·剧情氛围', style: '沉浸型',
    book: {
      title: '走进《{bookname}》的{category}世界 - {sitename}',
      description: '推开书页即是另一个世界：《{bookname}》——{author}以{chapterCount}章铺陈的{category}长卷。{intro}{sitename}极简阅读界面，让你一头扎进故事里不被打扰。',
      keywords: '{bookname}世界观,{bookname}剧情,{bookname}沉浸阅读,{bookname}小说世界,{author}笔下的世界,{category}小说',
    },
    toc: {
      title: '《{bookname}》旅程地图·全书目录 - {sitename}',
      description: '《{bookname}》{chapterCount}章即{chapterCount}段旅程，{statusText}。{sitename}目录按故事推进排布，从启程篇到最终章，每一章都是下一段风景。',
    },
    chapter: {
      title: '{bookname}场景：{chaptername} - {sitename}',
      description: '{chaptername}。此刻故事来到《{bookname}》的关键一幕：{excerpt}……{sitename}无干扰阅读页，灯光已备好，请入戏。',
      keywords: '{bookname}{chaptername},{bookname}剧情,{bookname}名场面,{bookname}沉浸阅读,{author}',
    },
  },
  {
    id: 'wordofmouth', name: '口碑型·读者之选', style: '口碑型',
    book: {
      title: '读者停不下来的{bookname} - {sitename}',
      description: '《{bookname}》读者口碑：追完的人都说停不下来。{author}的{category}叙事加上{chapterCount}章的节奏打磨。{intro}被读者一遍遍安利的作品，值得你自己验证。',
      keywords: '{bookname}口碑,{bookname}读者评价,{bookname}安利,{bookname}停不下来,{bookname}回读率,{category}口碑小说',
    },
    toc: {
      title: '{bookname}全章目录·读者之选 - {sitename}',
      description: '《{bookname}》{chapterCount}章目录，被读者反复回读的章节都在这里。{statusText}，{sitename}目录随更新同步，口碑作品全本呈现。',
    },
    chapter: {
      title: '回读率最高：{bookname}{chaptername} - {sitename}',
      description: '《{bookname}》{chaptername}——读者回读率最高的一章。{excerpt}……{sitename}本章页已备好，看看是不是你心中的那一章。',
      keywords: '{bookname}回读,{bookname}{chaptername},{bookname}口碑章节,{bookname}读者推荐,{author}',
    },
  },
  {
    id: 'highlight', name: '亮点型·卖点直击', style: '亮点型',
    book: {
      title: '{bookname}三大看点：爽点·反转·名场面 - {sitename}',
      description: '《{bookname}》三大看点：①{category}设定耳目一新；②{author}反转不断；③{chapterCount}章节奏在线。{intro}每一卷都有记忆点，{sitename}全书备好等你开卷。',
      keywords: '{bookname}看点,{bookname}爽点,{bookname}反转,{bookname}名场面,{bookname}亮点解析,{category}爽文,{author}风格',
    },
    toc: {
      title: '{bookname}分卷目录（看点标注版） - {sitename}',
      description: '《{bookname}》{statusText}，{chapterCount}章分卷目录：名场面、反转点依次排开，{sitename}带你按图索骥，直奔高光章节。',
    },
    chapter: {
      title: '名场面预警：{bookname}{chaptername} - {sitename}',
      description: '《{bookname}》{chaptername}是本书高光段落之一：{excerpt}……{sitename}亮点章节一路标注，读起来绝不迷路。',
      keywords: '{bookname}名场面,{bookname}{chaptername},{bookname}高光,{bookname}爽点章节,{category}亮点小说',
    },
  },
]

// ============================================================
// [R30-1-3] 矩阵随机组合 —— 8 字段(book T/D/K + toc T/D + chapter T/D/K)独立抽取,
// 每个字段可来自 18 套预设中任意一套(跨预设混搭), 组合空间 18^8 ≈ 110 亿。
// 纯函数无副作用; 结果整体与 prev 不同(不同则重抽, 有界尝试防死循环)。
// ============================================================

/** 随机组合的单字段来源信息(供后台 UI 展示「title←悬念型·隐藏结局」徽章) */
export interface SeoRandomFieldSource {
  /** 字段路径键, 如 'book.title' */
  key: string
  /** 来源预设 id */
  presetId: string
  /** 来源预设展示名 */
  presetName: string
  /** 字段名(title/description/keywords) */
  field: string
}

interface RandomSeoTplResult {
  /** 随机组合出的完整模板集(8 字段全部有值且必含 '{', 可直接进 sanitizeSeoTpl/PUT) */
  set: SeoTplSet
  /** 来源追溯: 三页型概览串(去重预设名) + 8 字段逐一来源 */
  sources: {
    book: string
    toc: string
    chapter: string
    fields: SeoRandomFieldSource[]
  }
}

/** 8 个可独立抽取字段: 键路径 + 字段名 + 取值器(严格类型下跨页型字段访问的安全出口) */
const FIELD_PLAN: { key: string; field: string; get: (p: SeoPreset) => string }[] = [
  { key: 'book.title', field: 'title', get: (p) => p.book.title },
  { key: 'book.description', field: 'description', get: (p) => p.book.description },
  { key: 'book.keywords', field: 'keywords', get: (p) => p.book.keywords },
  { key: 'toc.title', field: 'title', get: (p) => p.toc.title },
  { key: 'toc.description', field: 'description', get: (p) => p.toc.description },
  { key: 'chapter.title', field: 'title', get: (p) => p.chapter.title },
  { key: 'chapter.description', field: 'description', get: (p) => p.chapter.description },
  { key: 'chapter.keywords', field: 'keywords', get: (p) => p.chapter.keywords },
]

/** 按 8 个抽取下标组装完整 SeoTplSet(picks 顺序与 FIELD_PLAN 一一对应) */
function assembleSet(picks: number[]): SeoTplSet {
  const g = (i: number) => FIELD_PLAN[i].get(SEO_TPL_PRESETS[picks[i]])
  return {
    book: { title: g(0), description: g(1), keywords: g(2) },
    toc: { title: g(3), description: g(4) },
    chapter: { title: g(5), description: g(6), keywords: g(7) },
  }
}

/** 由抽取下标构建来源追溯(页型概览 = 该页各字段来源预设名去重串; fields = 8 字段明细) */
function buildSources(picks: number[]): RandomSeoTplResult['sources'] {
  const fields: SeoRandomFieldSource[] = picks.map((pi, i) => {
    const preset = SEO_TPL_PRESETS[pi]
    return { key: FIELD_PLAN[i].key, presetId: preset.id, presetName: preset.name, field: FIELD_PLAN[i].field }
  })
  const summary = (prefix: string): string => {
    const names: string[] = []
    for (const f of fields) {
      if (!f.key.startsWith(prefix)) continue
      if (!names.includes(f.presetName)) names.push(f.presetName)
    }
    return names.join('、')
  }
  return { book: summary('book.'), toc: summary('toc.'), chapter: summary('chapter.'), fields }
}

/** 稳定序列化(按 8 字段固定顺序, 免受键序差异影响; 仅用于组合去重比对) */
function stableJson(s: SeoTplSet): string {
  return JSON.stringify([
    s.book.title, s.book.description, s.book.keywords,
    s.toc.title, s.toc.description,
    s.chapter.title, s.chapter.description, s.chapter.keywords,
  ])
}

/** 重抽上界: 18^8 组合空间下连撞 64 次概率≈0, 有界防死循环 */
const MAX_RANDOM_ATTEMPTS = 64

/** [R30-1-3] 矩阵随机组合: 8 字段独立从 18 套预设池抽取(可来自不同预设), 整体结果必与 prev 不同;
 *  产物每字段必含 '{' → sanitizeSeoTpl「含 { 才采纳」语义天然成立, 可直接填入后台编辑器/PUT 保存 */
export function randomSeoTplSet(prev?: SeoTplSet): RandomSeoTplResult {
  const n = SEO_TPL_PRESETS.length
  const prevJson = prev ? stableJson(prev) : null
  let picks: number[] = []
  for (let attempt = 0; attempt < MAX_RANDOM_ATTEMPTS; attempt++) {
    picks = FIELD_PLAN.map(() => Math.floor(Math.random() * n))
    if (!prevJson || stableJson(assembleSet(picks)) !== prevJson) {
      return { set: assembleSet(picks), sources: buildSources(picks) }
    }
  }
  // 兜底保证「与 prev 不同」: 强制把 book.title 换成与 prev 不同的预设
  // (18 套预设 title 句式互异, 必存在差异项; 极端情形回落最后一次组合)
  const diffIdx = SEO_TPL_PRESETS.findIndex((p) => prev == null || p.book.title !== prev.book.title)
  if (diffIdx >= 0) {
    picks = [diffIdx, ...picks.slice(1)]
  }
  return { set: assembleSet(picks), sources: buildSources(picks) }
}

/** [R30-1-4] 预览样本变量(后台实时预览 + 冒烟验证共用): 覆盖全部已文档化变量 */
export const sampleSeoVars: Required<SeoTplVars> = {
  bookname: '凡人修仙传',
  author: '忘语',
  category: '仙侠',
  sitename: '青枫书屋',
  chaptername: '第一千零二十三章 雷劫降临',
  chapterno: 1023,
  chapterCount: 2446,
  status: 'ongoing',
  intro: '一个普通的山村穷小子，偶然之下踏入江湖，凭一枚神秘小瓶与过人心智，在弱肉强食的修仙界步步为营，最终问鼎大道。',
  excerpt: '韩立盘膝坐于洞府之中，掌心托着那枚古朴的青色小瓶，瓶身微烫，一道纯净灵气正自瓶口缓缓溢出，殿外雷云翻涌不定……',
  siteKeywords: '免费小说,网络小说,完结小说',
}
