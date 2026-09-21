// 扫 src/lib 非crawl 文件导出的符号在 src 全库的引用
import { readFileSync } from 'fs'
import { execSync } from 'child_process'
const files = [
  'src/lib/api.ts','src/lib/auth.ts','src/lib/backup.ts','src/lib/banned-words-server.ts','src/lib/banned-words.ts',
  'src/lib/book-ids.ts','src/lib/links.ts','src/lib/logger.ts','src/lib/pseo-server.ts','src/lib/pseo.ts',
  'src/lib/pseudostatic-server.ts','src/lib/pseudostatic.ts','src/lib/seo-presets.ts','src/lib/seo-tpl-server.ts',
  'src/lib/seo-tpl.ts','src/lib/theme-overrides.ts','src/lib/utils.ts','src/lib/db.ts',
]
for (const f of files) {
  const src = readFileSync(f, 'utf-8')
  const re = /export\s+(?:default\s+)?(?:async\s+)?(?:function|const|class|interface|type|enum)\s+([A-Za-z0-9_]+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    const s = m[1]
    let out: string[] = []
    try { out = execSync(`rg -l "\\b${s}\\b" src scripts --glob '!**/node_modules/**'`, { encoding: 'utf-8' }).trim().split('\n').filter(Boolean) } catch {}
    const others = out.filter((x) => x !== f)
    if (others.length === 0) console.log(`DEAD\t${f}\t${s}`)
    else if (others.every((x) => x.startsWith('scripts/'))) console.log(`ONLY-SCRIPTS\t${f}\t${s}\t${others.join(',')}`)
  }
}
console.log('DONE')
