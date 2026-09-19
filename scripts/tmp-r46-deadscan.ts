// 死导出扫描: 提取所有权文件的导出符号, 全库引用计数
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'
import { execSync } from 'child_process'

const ROOT = '/home/z/my-project'
const targets = [
  'src/lib/crawl/sorter.ts','src/lib/crawl/cleaner.ts','src/lib/crawl/smart.ts','src/lib/crawl/suggest.ts',
  'src/lib/crawl/rule-templates.ts','src/lib/crawl/calibrate.ts','src/lib/crawl/downloader.ts',
  'src/lib/crawl/proxy-pool.ts','src/lib/storage.ts' /* placeholder */,
  'src/lib/api.ts','src/lib/backup.ts','src/lib/banned-words-server.ts','src/lib/banned-words.ts',
  'src/lib/book-ids.ts','src/lib/links.ts','src/lib/logger.ts','src/lib/pseo-server.ts','src/lib/pseo.ts',
  'src/lib/pseudostatic-server.ts','src/lib/pseudostatic.ts','src/lib/seo-presets.ts','src/lib/seo-tpl-server.ts',
  'src/lib/seo-tpl.ts','src/lib/theme-overrides.ts','src/lib/utils.ts',
]
const files: string[] = []
for (const t of targets) { try { statSync(join(ROOT, t)); files.push(t) } catch { /* skip */ } }
// api routes
const walk = (dir: string) => {
  for (const e of readdirSync(join(ROOT, dir))) {
    const p = join(dir, e)
    if (statSync(join(ROOT, p)).isDirectory()) walk(p)
    else if (p.endsWith('.ts') || p.endsWith('.tsx')) files.push(p)
  }
}
walk('src/app/api')
for (const f of files) {
  const src = readFileSync(join(ROOT, f), 'utf-8')
  const re = /export\s+(?:async\s+)?(?:function|const|class|interface|type|enum)\s+([A-Za-z0-9_]+)/g
  let m: RegExpExecArray | null
  const syms: string[] = []
  while ((m = re.exec(src))) syms.push(m[1])
  for (const s of syms) {
    try {
      const out = execSync(`rg -l "\\b${s}\\b" src --glob '!**/node_modules/**'`, { cwd: ROOT, encoding: 'utf-8' }).trim().split('\n').filter(Boolean)
      const others = out.filter((x) => relative(join(ROOT, x), join(ROOT, f)) !== 'x' && x !== f)
      if (others.length === 0) console.log(`DEAD-EXPORT\t${f}\t${s}`)
    } catch { console.log(`DEAD-EXPORT\t${f}\t${s}`) }
  }
}
console.log('SCAN_DONE', files.length, 'files')
