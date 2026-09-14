/**
 * bqg713(笔趣阁 www.bqg713.cc) AES-token 外置转换代理
 * ============================================================
 * 背景(逆向结论, 2026-cc-d, 已真网验证 200):
 *   - 站点为 SPA 壳(www.bqg713.cc) + 纯 JSON API; 章节正文接口的真实 API 域名
 *     是站点 JS 内置的 site[] 三域名轮换: apibi.cc / apiqu.cc / apige.cc
 *     (www.bqg713.cc/api/chapter 本身就被 CF WAF 403, 属规则侧历史误配)。
 *   - 章节请求形态: GET https://apibi.cc/api/chapter?token=<urlencoded base64>
 *     (携带明文 id/chapterid 参数亦可, 只要 token 合法; 纯明文参数 → 403)。
 *   - token = enaes(JSON.stringify({id, chapterid})):
 *       算法      AES-128-CBC + PKCS7, 密文 Base64(toString() 形态, 无 OpenSSL 盐头)
 *       密钥派生  code = MD5('book@token.html').toString()  // 32 位 hex, 静态
 *                 iv  = Utf8(code[0..16))  = '394c2c3202da6270'
 *                 key = Utf8(code[16..32)) = 'a3dc22cf70418a51'
 *       明文结构  {"id":<number>,"chapterid":<number>}  (键序 id 在前, 必须数字类型)
 *   - 逆向方法: 站点 /js/read.js 混淆段(jsjiami v7)在 bun 中原生执行,
 *     以 CryptoJS.MD5 spy 捕获 enaes 内部真实 seed 输入; 直接调用其混淆字符串
 *     解码器 dec(0x1cb,'0d[v]') 会得到诱饵串('ª²qé)'), 不能作为 seed 来源 ——
 *     行为捕获 + 真网 200 双重验证为准(详见 worklog cc-d)。
 *
 * 对接面(采集引擎 tokenUrl {url} 占位符形态, bb-d 交付):
 *   FetchConfig.tokenUrl     = http://127.0.0.1:3010/rewrite?url={url}
 *   FetchConfig.tokenPattern = token            (本服务返回 JSON 的 token 字段)
 *   FetchConfig.tokenInjection = url            (引擎追加 &token=<enc> 或替换 {token})
 *
 * ============================================================
 * R21-b 增补逆向(2026-09-14 真网实证): 诱饵正文根因与 /unlock 真实内容链
 * ------------------------------------------------------------
 * 用户确诊"章节 API 的 txt 字段就是诱饵(成人文本)", 勘察结论(证据优先, 推翻此前"RC4+/api/hm
 * 浏览器解锁"假说 —— 该假说与混淆 JS 静态特征吻合但被行为实验否定):
 *   1) 域名轮换: www.bqg713.cc 已整体 301 → www.bqg413.cc(站点家族换域), 全部 /api/* 在
 *      bqg413 直连可用(index/book/booklist/chapter, 明文参数即可, 仅 chapter 必须 token)。
 *   2) 章节镜像现状: apibi.cc 恒 403(已死) → 引擎 mirrorDomains 切到 apiqu.cc;
 *      apige.cc 与 www.bqg413.cc 恒 200。
 *   3) 诱饵根因 = 镜像污染: 诱饵是【按章节粒度】投毒的镜像 DB 记录, 非站点级加密。
 *      实证: 2530/1 在 apiqu.cc 恒返回成人诱饵(3/3 次同 md5=641f9e36…, 正文内嵌
 *      'biquio点cc' 水印×63 + 尾部 'srsp.cc看更多'), 同章在 apige.cc/www.bqg413.cc 恒
 *      返回真实正文(3/3 次同 md5=8716905f…, 5367 字与章名匹配); 而抽扫 2530 其余 29 章
 *      + 1152/189311/5727 等书, 三域名 md5 全一致(apiqu 仅个别章节被投毒, 本样本 1/30)。
 *      旧链路(主域 apibi 死 403 → 镜像切 apiqu)恰把流量送进被投毒镜像 → 拿到诱饵。
 *   4) RC4 不存在: 内容层无 RC4(全站 JS 唯一 RC4 在 jsjiami v7 混淆器的字符串解码器内部,
 *      与正文无关); 真实正文 = 明文 txt 字段, 无需任何解密。
 *   5) /api/hm 形态与实效: GET <gethost()>/api/hm?hash=MD5('<id>/<chapterid+1>') → 恒
 *      200 空 body(0 字节); 仅当 localStorage.ck==1 且 章节JSON.ck==MD5('<id>|<chapterid>')
 *      时由 get_cache() 发出(read.js 混淆段行为本体捕获)。当前全部章节响应 ck=null →
 *      真实浏览器也从不发出该请求; 带 Cookie 实验证明 hm 调用前后 apiqu 诱饵不变 ——
 *      纯遥测信标, 无解锁状态。BQG713_HM_BEACON=1 时 /unlock 按 ck 完整性校验复刻此信标
 *      (缺省关闭, 避免逐章多一跳无实效出网请求)。
 *   6) 真实内容获取路径: token(enaes AES-CBC, 与 cc-d 逆向一致未变) → 健康主机取 JSON
 *      → txt 即真实正文(诱饵镜像靠内容校验剔除)。
 *
 * /unlock 端点(R21-b-1, 对齐引擎 FetchConfig.contentProxyUrl 契约 deqixs/xjp/qidian 同款):
 *   GET /unlock?url=<urlenc 章节URL(含明文 id/chapterid)>
 *     → 200 {ok:true, id, chapterid, host, title, chaptername, md5, len, content}
 *       content=真实正文纯文本(\n 分段); 引擎 {ok, content} 契约字段为 ok/content
 *     → 404 非章节形态 URL(引擎 contentProxyUrl 探测的双包裹形态在此快速拒绝,
 *       走 deqixs "degrade-native 契约": 探测失败 → 引擎静默降级直连本端点成功)
 *     → 502 {ok:false, error} 全部主机失败/诱饵(引擎降级原 URL 直连)
 *   主机池: www.bqg413.cc → apige.cc(已验证真实), probe 目标 host 属站点家族
 *   (bqg\d+|api*.cc)则追加池尾 —— 每个主机响应过诱饵水印校验后才采纳, 池序即优先级。
 *
 * 启动: cd mini-services/bqg713-proxy && bun run dev   (bun --hot 热更, 端口固定 3010)
 */
import { createCipheriv, createHash } from 'node:crypto'
import { createBridgeServer, getRes, json } from '../_shared/server'

const PORT = Number(process.env.PORT || 3010)

// ---------- enaes 逆向产物 ----------
/** enaes 种子串: 'book' + '@' + 'token' + '.' + 'html'(站点混淆串拼接的有效等价形态) */
const ENAES_SEED = 'book@token.html'
/** code = MD5(seed) hex; 前 16 字符作 IV、后 16 字符作 KEY(均按 UTF-8 字节) —— 静态密钥 */
const CODE_HEX = createHash('md5').update(ENAES_SEED, 'utf8').digest('hex')
const IV = Buffer.from(CODE_HEX.slice(0, 16), 'utf8')
const KEY = Buffer.from(CODE_HEX.slice(16), 'utf8')

/** 与站点 enaes 等价: AES-128-CBC/PKCS7 → Base64 */
export function enaesToken(id: number, chapterid: number): string {
  const plaintext = JSON.stringify({ id, chapterid })
  const cipher = createCipheriv('aes-128-cbc', KEY, IV)
  return Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]).toString('base64')
}

// 启动自检: 与真网 200 验证过的测试向量比对, 不符则大声告警(密钥派生被站点更换时首知于此)
const SELF_TEST_VECTOR = 'b+vXnT3wjuXQsxBmZh033ZjqwezLEinKfOakcVaiDx0='
function selfTest(): boolean {
  return enaesToken(2530, 1) === SELF_TEST_VECTOR
}
const selfTestOk = selfTest()
// ss-d2⑦: 启动日志不打印 token/iv/key 明文(站点公开常量, 但日志会被 docker logs 存档, 无谓扩散面)
console.log(`[bqg713-proxy] self-test(id=2530,chapterid=1): ${selfTestOk ? 'PASS' : 'FAIL'}`)

/** 从目标 URL 解析 id/chapterid(必须为正整数), 返回 null 表示不可用 */
function parseTarget(raw: string): { target: URL; id: number; chapterid: number } | null {
  let target: URL
  try {
    target = new URL(raw)
  } catch {
    return null
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') return null
  const id = Number(target.searchParams.get('id'))
  const chapterid = Number(target.searchParams.get('chapterid'))
  if (!Number.isSafeInteger(id) || id <= 0) return null
  if (!Number.isSafeInteger(chapterid) || chapterid <= 0) return null
  return { target, id, chapterid }
}

// ==================== R21-b-1: /unlock 真实内容链(诱饵镜像剔除) ====================
// 根因(R21-b 真网实证): 站点已 301 迁域 www.bqg413.cc; 镜像 apibi.cc 已死(恒403),
// apiqu.cc 按章节粒度被投毒(水印 'biquio点cc'×N + 尾部 'srsp.cc看更多', 成人诱饵文本);
// www.bqg413.cc 与 apige.cc 恒返回真实正文。txt 即明文正文, 无 RC4, /api/hm 为纯遥测信标。
// 引擎对接 = deqixs degrade-native 契约(同款): fetch.contentProxyUrl=…/unlock?url={url}
// 为 SSRF loopback 豁免键; 探测自指双包裹形态 → 404 → 引擎降级直连 toc 合成的本端点 URL
// (url 参数裸形态 & 切分, id/chapterid 内外层合并解析) → JSON {ok,content} 被
// parseContent json 字段直接消费。

const UNLOCK_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const UNLOCK_TIMEOUT_MS = 12000
/** 诱饵水印签名(R21-b 真网实证: 诱饵正文内嵌 'biquio点cc' 水印×63 + 尾部 'srsp.cc看更多') */
const DECOY_MARKERS = ['biquio', 'srsp.cc']
/** 真实正文长度下限(诱饵样本 >2k 字, 本阈值拦空壳/广告壳, 真章样本 5367 字) */
const MIN_CONTENT_LEN = 200
/** 主机池(池序=优先级): 真网实证恒 200 真实正文的两台 */
const HOST_POOL = ['www.bqg413.cc', 'apige.cc']
/** 站点家族主机形态: www.bqgNNN.cc / api*.cc(动态学习池只收家族主机, 防滥用) */
const FAMILY_RE = /^(?:www\.bqg\d+\.cc|api[a-z0-9]*\.cc)$/
/** 动态学习主机(进程内, 重启清零): 探测目标属家族且不在池中时追加池尾 */
const dynamicHosts: string[] = []

function looksDecoy(txt: string): boolean {
  if (txt.length < MIN_CONTENT_LEN) return true
  const low = txt.toLowerCase()
  return DECOY_MARKERS.some((m) => low.includes(m))
}

/** 单主机取章 JSON: enaes 签名 → GET /api/chapter?token=… → {txt,chaptername} 全态(null=失败) */
async function fetchChapterFromHost(
  host: string,
  id: number,
  chapterid: number,
): Promise<{ txt: string; chaptername: string; ck: string | null } | null> {
  const url = `https://${host}/api/chapter?token=${encodeURIComponent(enaesToken(id, chapterid))}`
  const r = await getRes(
    url,
    {
      'user-agent': UNLOCK_UA,
      accept: 'application/json,text/plain;q=0.9,*/*;q=0.8',
      referer: 'https://www.bqg413.cc/',
    },
    UNLOCK_TIMEOUT_MS,
  )
  if (!r.ok || r.status !== 200) return null
  try {
    const j = JSON.parse(new TextDecoder().decode(r.buf)) as {
      txt?: unknown
      chaptername?: unknown
      ck?: unknown
    }
    if (typeof j.txt !== 'string' || !j.txt) return null
    return {
      txt: j.txt,
      chaptername: typeof j.chaptername === 'string' ? j.chaptername : '',
      ck: typeof j.ck === 'string' ? j.ck : null,
    }
  } catch {
    return null
  }
}

/**
 * 可选 hm 遥测信标复刻(BQG713_HM_BEACON=1 时生效, 缺省关): 站点 read.js 仅当
 * localStorage.ck==1 且 章节 JSON.ck==MD5('<id>|<chapterid>') 时由 get_cache() 发出
 * GET /api/hm?hash=MD5('<id>/<chapterid+1>')。当前全章节 ck=null → 真实浏览器从不发出;
 * 本复刻仅为协议完整性与站点侧行为观测保留, 不影响解锁(纯遥测, 无状态)。
 */
async function maybeHmBeacon(host: string, id: number, chapterid: number, ck: string | null): Promise<void> {
  if (process.env.BQG713_HM_BEACON !== '1' || !ck) return
  const expected = createHash('md5').update(`${id}|${chapterid}`, 'utf8').digest('hex')
  if (ck !== expected) return
  const hash = createHash('md5').update(`${id}/${chapterid + 1}`, 'utf8').digest('hex')
  void getRes(`https://${host}/api/hm?hash=${hash}`, { 'user-agent': UNLOCK_UA }, 5000).catch(() => undefined)
}

/**
 * GET /unlock?url=<章节URL(含 id/chapterid)>
 *   → 200 {ok:true,id,chapterid,host,title,chaptername,md5,len,content} content=真实正文(\n 分段)
 *   → 404 非章节形态/引擎探测自指双包裹(degrade-native 契约: 引擎静默降级直连本端点)
 *   → 502 全部主机失败/诱饵(引擎降级原 URL 直连)
 */
async function handleUnlock(u: URL): Promise<Response> {
  const raw = u.searchParams.get('url')
  if (!raw) return json({ ok: false, error: 'missing ?url=' }, 400)
  let inner: URL | null = null
  try {
    inner = new URL(raw)
  } catch {
    inner = null
  }
  // 引擎 contentProxyUrl 探测形态: {url}=enc(本端点合成URL) → 自指双包裹 → 404 降级(deqixs 契约)
  if (
    inner &&
    (inner.hostname === '127.0.0.1' || inner.hostname === 'localhost') &&
    inner.pathname === '/unlock'
  ) {
    return json({ ok: false, error: 'probe-self-reference → degrade-native', url: raw }, 404)
  }
  // id/chapterid 解析: 引擎直连形态 url 参数被 & 裸切分(id 在 url 值内层, chapterid 落外层) ——
  // 内外层合并解析, 内层优先; 纯编码形态(直接 curl 测试)内层即完整
  const num = (...cands: (string | null)[]): number => {
    for (const c of cands) {
      const n = Number(c)
      if (Number.isSafeInteger(n) && n > 0) return n
    }
    return 0
  }
  const innerId = inner?.searchParams.get('id') ?? null
  const innerCh = inner?.searchParams.get('chapterid') ?? null
  const id = num(innerId, u.searchParams.get('id'))
  const chapterid = num(innerCh, u.searchParams.get('chapterid'))
  if (!id || !chapterid) {
    return json({ ok: false, error: '目标 URL 缺少可用的 id/chapterid 查询参数(需正整数)', target: raw }, 404)
  }
  // 家族主机学习: 探测目标 host 属站点家族且不在池中 → 追加池尾(防滥用: 仅家族形态)
  const innerHost = inner?.hostname.toLowerCase() ?? ''
  if (innerHost && FAMILY_RE.test(innerHost) && !HOST_POOL.includes(innerHost) && !dynamicHosts.includes(innerHost)) {
    dynamicHosts.push(innerHost)
    console.log(`[bqg713-proxy] unlock host-learned: ${innerHost}`)
  }
  const pool = [...HOST_POOL, ...dynamicHosts.filter((h) => !HOST_POOL.includes(h))]
  const failures: string[] = []
  for (const host of pool) {
    const j = await fetchChapterFromHost(host, id, chapterid)
    if (!j) {
      failures.push(`${host}:unreachable`)
      continue
    }
    if (looksDecoy(j.txt)) {
      failures.push(`${host}:decoy(len=${j.txt.length})`)
      continue
    }
    void maybeHmBeacon(host, id, chapterid, j.ck)
    const md5 = createHash('md5').update(j.txt, 'utf8').digest('hex')
    console.log(`[bqg713-proxy] unlock id=${id} chapterid=${chapterid} host=${host} len=${j.txt.length} md5=${md5.slice(0, 12)}…`)
    return json({
      ok: true,
      id,
      chapterid,
      host,
      title: j.chaptername,
      chaptername: j.chaptername,
      md5,
      len: j.txt.length,
      content: j.txt,
    })
  }
  console.log(`[bqg713-proxy] unlock id=${id} chapterid=${chapterid} ALL-FAILED: ${failures.join(', ').slice(0, 300)}`)
  return json({ ok: false, error: `全部主机失败或诱饵: ${failures.join(', ')}`, id, chapterid }, 502)
}

createBridgeServer({
  name: 'bqg713-proxy',
  port: PORT,
  idleTimeoutS: 30,
  selfTest,
  async fetch(req): Promise<Response> {
    const u = new URL(req.url)

    if (u.pathname === '/rewrite' || u.pathname === '/token') {
      const raw = u.searchParams.get('url')
      if (!raw) return json({ ok: false, error: 'missing ?url=<urlencoded 目标URL>' }, 400)
      const parsed = parseTarget(raw)
      if (!parsed) {
        // 引擎侧语义: 预取失败 → 静默降级直连, 故非章节形态 URL(如 list/book 段)回 404 即可
        return json({ ok: false, error: '目标 URL 缺少可用的 id/chapterid 查询参数(需正整数)', target: raw }, 404)
      }
      const { target, id, chapterid } = parsed
      const token = enaesToken(id, chapterid)
      // 站点真实请求形态: 仅 token 一个查询参数(base64 经 encodeURIComponent)
      const finalUrl = `${target.origin}${target.pathname}?token=${encodeURIComponent(token)}`
      console.log(`[bqg713-proxy] rewrite id=${id} chapterid=${chapterid} token=${token.slice(0, 12)}...`)
      if (u.pathname === '/token') {
        return new Response(token, { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8' } })
      }
      return json({
        ok: true,
        id,
        chapterid,
        plaintext: JSON.stringify({ id, chapterid }),
        token,
        url: finalUrl,
        target: raw,
      })
    }

    if (u.pathname === '/unlock') {
      return handleUnlock(u)
    }

    return json({ ok: false, error: 'not found', endpoints: ['/health', '/rewrite?url=', '/token?url=', '/unlock?url='] }, 404)
  },
})
