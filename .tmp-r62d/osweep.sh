#!/bin/bash
# R62-d overflow sweep for remaining pages (no screenshots)
SID=ckws7sgp39zyf333nhz88n01n
B1=ckws7tjsf9zyf333oi7jlus2a
THEMES="aijjxs pili shipsay x2552 kks101 trxsw ddyueshu ggd66 huangjinwu qb23 x33yq"
BASE=http://127.0.0.1:3000
agent-browser set viewport 390 844 >/dev/null
for t in $THEMES; do
  curl -s -b /tmp/r62d-jar -X PUT $BASE/api/admin/sites/$SID -H 'Content-Type: application/json' -d "{\"themeId\":\"$t\"}" >/dev/null
  sleep 0.12
  line="$t:"
  for u in "/" "/?view=category&cat=cat:%E7%8E%84%E5%B9%BB%E5%A5%87%E5%B9%BB&sort=words&status=completed" "/?view=fulltext" "/?view=history" "/book/nonexist999.html"; do
    agent-browser open "$BASE$u" >/dev/null 2>&1
    sw=$(agent-browser eval "document.documentElement.scrollWidth" 2>/dev/null)
    line="$line [$(echo $u | cut -c1-14)]=$sw"
  done
  echo "$line"
done
