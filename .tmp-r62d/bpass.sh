#!/bin/bash
# R62-d browser pass: theme × page @390px overflow/imgs + screenshots
SID=ckws7sgp39zyf333nhz88n01n
B1=ckws7tjsf9zyf333oi7jlus2a
C1=ckws7tk6i9zyf331cjkqfa4aa
THEMES="aijjxs pili shipsay x2552 kks101 trxsw ddyueshu ggd66 huangjinwu qb23 x33yq"
BASE=http://127.0.0.1:3000
agent-browser set viewport 390 844 >/dev/null
OUT=/tmp/r62d-shots/browser.tsv
echo -e "theme\tpage\tsw\tcw\tbroken\tnotes" > $OUT
for t in $THEMES; do
  curl -s -b /tmp/r62d-jar -X PUT $BASE/api/admin/sites/$SID -H 'Content-Type: application/json' -d "{\"themeId\":\"$t\"}" >/dev/null
  sleep 0.15
  declare -A PAGES=(
    [book]="$BASE/book/$B1.html"
    [toc]="$BASE/read/$B1/"
    [read]="$BASE/read/$B1/$C1.html"
    [search]="$BASE/?view=search&q=%E4%B8%87"
    [ranking]="$BASE/?view=ranking"
  )
  for pg in book toc read search ranking; do
    agent-browser open "${PAGES[$pg]}" >/dev/null 2>&1
    sleep 0.15
    r=$(agent-browser eval "JSON.stringify({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth,br:[...document.images].filter(i=>i.naturalWidth===0&&i.src).map(i=>i.src.slice(-50)),body:document.body.innerText.length})" 2>/dev/null)
    agent-browser screenshot /tmp/r62d-shots/$t-$pg-390.png >/dev/null 2>&1
    python3 - "$t" "$pg" "$r" <<'EOF' >> $OUT
import sys, json
t,pg,raw = sys.argv[1], sys.argv[2], sys.argv[3]
try:
    d=json.loads(json.loads(raw))
    print(f"{t}\t{pg}\t{d['sw']}\t{d['cw']}\t{len(d['br'])}\t{';'.join(d['br'][:2])}|body={d['body']}")
except Exception as e:
    print(f"{t}\t{pg}\tERR\t\t\t{e}")
EOF
  done
  echo "browser pass done: $t"
done
