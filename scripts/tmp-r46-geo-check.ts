// [R46-2c-2] 地理匹配准确性抽查: 取存活代理, curl -x 过 ip-api 实测出口国别 vs DB country
import { PrismaClient } from '@prisma/client'
import { execFile } from 'child_process'
const db = new PrismaClient()
const main = async () => {
  const rows = await db.freeProxy.findMany({ where: { alive: true }, orderBy: { healthScore: 'desc' }, take: 6 })
  for (const r of rows) {
    const proxyUrl = `${r.protocol}://${r.host}:${r.port}`
    const out = await new Promise<string>((resolve) => {
      execFile('curl', ['-sS', '--max-time', '12', '-x', proxyUrl, 'http://ip-api.com/json/?fields=countryCode,query'], { timeout: 15000 }, (err, stdout) => {
        resolve(err ? 'ERR ' + String(err.message).split('\n')[0].slice(0, 60) : stdout.trim())
      })
    })
    let live = 'ERR'
    try { const j = JSON.parse(out); live = `${j.countryCode}/${j.query}` } catch { /* 保持 ERR */ }
    console.log(`db=${r.country || '??'} live=${live} ${proxyUrl}`)
  }
  await db.$disconnect()
}
main()
