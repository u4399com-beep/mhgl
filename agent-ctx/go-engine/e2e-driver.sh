#!/bin/bash
# [R50-1] Go 引擎联合 E2E 驱动: 登录→灌规则→建 fixture 规则→建 go 任务→启动→轮询→核库
set -e
BASE=http://127.0.0.1:3000
JAR=/tmp/go-e2e-cookies.txt
PW='audit-fix-2025'

echo "== 1. 登录 =="
curl -s -c $JAR -X POST $BASE/api/auth/login -H 'content-type: application/json' \
  -d "{\"password\":\"$PW\"}" | head -c 200; echo

echo "== 2. 内置规则全量导入 =="
curl -s -b $JAR -X POST $BASE/api/admin/rules/import-builtin -H 'content-type: application/json' \
  -d '{"all":true}' | python3 -c "import json,sys; d=json.load(sys.stdin); r=d.get('data') or d; print('imported:', len(r.get('results',[])) if isinstance(r,dict) else 'ok')" || true

echo "== 3. 建 fixture 规则 =="
RULE_CFG='{
  "list": {"enabled": true, "urlTemplate": "http://127.0.0.1:3099/list/{page}.html", "itemSelector": {"type":"css","expression":".booklist li"}, "fields": {"url": {"type":"css","expression":"a.t","attr":"href"}}},
  "book": {"enabled": true, "fields": {"name": {"type":"css","expression":"h1.bt"}, "author": {"type":"css","expression":"span.ba"}, "intro": {"type":"css","expression":"#intro","stripTags":true}, "cover": {"type":"css","expression":"img.cover","attr":"src"}}},
  "toc": {"enabled": true, "itemSelector": {"type":"css","expression":".toc li"}, "fields": {"title": {"type":"css","expression":"a"}, "url": {"type":"css","expression":"a","attr":"href"}}},
  "content": {"enabled": true, "fields": {"content": {"type":"css","expression":"#content","attr":"html"}}},
  "fetch": {"engine":"http","uaMode":"fixed","timeout":8000,"retries":1,"allowLoopback":true},
  "clean": {"removeSelectors":[],"adPatterns":[],"whitelist":[],"normalize":true,"plainText":false}
}'
RULE_ID=$(curl -s -b $JAR -X POST $BASE/api/admin/rules -H 'content-type: application/json' \
  -d "{\"name\":\"go-engine-fixture\",\"description\":\"R50-1 联合 E2E fixture\",\"config\":$RULE_CFG}" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print((d.get('data') or {}).get('id',''))")
echo "RULE_ID=$RULE_ID"

echo "== 4. 建 go 引擎任务(书号范围 1..2) =="
TASK_ID=$(curl -s -b $JAR -X POST $BASE/api/admin/tasks -H 'content-type: application/json' \
  -d "{\"ruleId\":\"$RULE_ID\",\"name\":\"go-engine-e2e\",\"mode\":\"bookIds\",\"bookUrl\":\"http://127.0.0.1:3099/book/{bookId}.html\",\"bookIdFrom\":\"1\",\"bookIdTo\":\"2\",\"engine\":\"go\",\"threadMin\":1,\"threadMax\":2,\"intervalMin\":100,\"intervalMax\":200,\"recrawlMode\":\"incremental\",\"storageMode\":\"db\"}" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print((d.get('data') or {}).get('id',''))")
echo "TASK_ID=$TASK_ID"

echo "== 5. 启动任务 =="
curl -s -b $JAR -X POST $BASE/api/admin/tasks/$TASK_ID/control -H 'content-type: application/json' \
  -d '{"action":"start"}' | head -c 300; echo

echo "== 6. 轮询任务状态(最长 120s) =="
for i in $(seq 1 60); do
  sleep 2
  S=$(curl -s -b $JAR $BASE/api/admin/tasks/$TASK_ID | python3 -c "
import json,sys
d=json.load(sys.stdin)
t=(d.get('data') or {})
p=t.get('progress') or {}
if isinstance(p,str):
  try: p=json.loads(p or '{}')
  except Exception: p={}
st=t.get('stats') or ''
if isinstance(st,str):
  try: st=json.loads(st or '{}')
  except Exception: st={}
print(t.get('status',''), '| phase=', p.get('phase',''), '| books=', p.get('booksDone'), '/', p.get('booksTotal'), '| content=', p.get('contentDone'), '/', p.get('contentTotal'), '| stats=', json.dumps(st, ensure_ascii=False), '| note=', (p.get('phaseNote') or '')[:40])
")
  echo "[$i] $S"
  ST=$(echo "$S" | cut -d'|' -f1 | xargs)
  if [ "$ST" = "done" ] || [ "$ST" = "error" ] || [ "$ST" = "paused" ] || [ "$ST" = "stopped" ]; then break; fi
done

echo "== 7. 核库 =="
cd /home/z/my-project
bun -e "
import { db } from './src/lib/db';
const books = await db.book.findMany({ where: { name: { startsWith: '测试书' } }, select: { id: true, name: true, author: true, cover: true, sourceUrl: true } });
console.log('Books:', books.length, JSON.stringify(books.map(b=>b.name)));
for (const b of books) {
  const chs = await db.chapter.findMany({ where: { bookId: b.id }, select: { id: true, title: true, content: true, fetched: true } });
  const withContent = chs.filter(c => (c.content||'').includes('正文内容')).length;
  console.log(' ', b.name, '章节数:', chs.length, '含正文:', withContent, '封面:', b.cover ? 'YES' : 'NO');
}
const logs = await db.taskLog.findMany({ where: { taskId: '$TASK_ID' }, orderBy: { createdAt: 'asc' }, select: { level: true, message: true }, take: 60 });
console.log('TaskLogs:', logs.length);
for (const l of logs.slice(-12)) console.log('  [' + l.level + ']', l.message.slice(0, 110));
process.exit(0);
"
echo "TASK_ID=$TASK_ID" > /tmp/go-e2e-last-task.txt
echo "== 完成 =="
