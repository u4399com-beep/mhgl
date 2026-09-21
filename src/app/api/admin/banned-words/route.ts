// ============================================================
// [R22-1-b-7] 违禁词过滤配置 API(管理端)
// GET  读取当前配置(Setting.bannedWords, 未配置/非法 → 默认值兜底)
// PUT  消毒校验后保存(parseBannedWords: 词表去空/#注释/去重 + 上限 + mode 白名单)
// 鉴权: /api/admin/* 由 src/proxy.ts 统一做签名 Cookie 校验(失败 401), 路由内不重复实现;
//       与 settings/route.ts 等 admin 路由同一模式(withGuard + ok/fail 信封)
// 保存成功即失效 cleaner 的惰性缓存(invalidateBannedWordsCache), 下一章采集立即生效
// ============================================================
import { db } from '@/lib/db'
import { ok, fail, readBody } from '@/lib/api'
import { withGuard, isPlainObject } from '../../_lib/http'
import {
  BANNED_WORDS_SETTING_KEY,
  DEFAULT_BANNED_WORDS,
  parseBannedWords,
  type BannedWordsConfig,
} from '@/lib/banned-words'
import { invalidateBannedWordsCache, reloadBannedWordsCache } from '@/lib/crawl/cleaner'

/** 读取当前配置(行内兜底默认, 与 cleaner 惰性缓存读取同口径) */
async function readConfig(): Promise<BannedWordsConfig> {
  try {
    const row = await db.setting.findUnique({
      where: { key: BANNED_WORDS_SETTING_KEY },
      select: { value: true },
    })
    if (row?.value) {
      try {
        return parseBannedWords(JSON.parse(row.value))
      } catch {
        /* 非法 JSON → 默认 */
      }
    }
  } catch {
    /* 库异常 → 默认 */
  }
  return { ...DEFAULT_BANNED_WORDS, words: [] }
}

export async function GET() {
  return withGuard(async () => {
    return ok(await readConfig())
  })
}

export async function PUT(req: Request) {
  return withGuard(async () => {
    const body = await readBody<unknown>(req)
    if (!isPlainObject(body)) return fail('请求体必须是 JSON 对象')
    // 消毒解析: 词表去空白/#注释/去重(上限 2000 词、单词 ≤100 字)、mode 白名单、replacement 兜底
    const cfg = parseBannedWords(body)
    // 开启过滤但词表为空 = 无效配置(采集侧空表本就零处理), 明确报错防"以为生效了"
    if (cfg.enabled && cfg.words.length === 0) {
      return fail('词表为空：请至少填写一个违禁词，或先关闭过滤开关')
    }
    const serialized = JSON.stringify(cfg)
    await db.setting.upsert({
      where: { key: BANNED_WORDS_SETTING_KEY },
      create: { key: BANNED_WORDS_SETTING_KEY, value: serialized },
      update: { value: serialized },
    })
    // 保存即失效 cleaner 惰性缓存(60s TTL)并同步预载新配置 —— 采集/预览的下一章
    // 必按新策略处理(无 fail-open 窗口); 采集/测试等所有 cleanContentHtml 出口自动覆盖
    invalidateBannedWordsCache()
    await reloadBannedWordsCache()
    // 返回消毒后的生效配置(前端回显去重/上限裁剪结果)
    return ok(cfg)
  })
}
