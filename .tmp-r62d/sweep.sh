#!/bin/bash
# R62-d: per-theme page sweep (curl HTML evidence)
SID=ckws7sgp39zyf333nhz88n01n
B1=ckws7tjsf9zyf333oi7jlus2a   # 我在万界送外卖 2228ch completed
C1=ckws7tk6i9zyf331cjkqfa4aa   # 第1章
B2=ckws8s0wp9zyf331cuuhognho   # 万古神帝 4236ch (toc pagination)
C2=ckws8s13o9zyf3313o8ls21x6
THEMES="aijjxs pili shipsay x2552 kks101 trxsw ddyueshu ggd66 huangjinwu qb23 x33yq"
BASE=http://127.0.0.1:3000
for t in $THEMES; do
  curl -s -b /tmp/r62d-jar -X PUT $BASE/api/admin/sites/$SID -H 'Content-Type: application/json' -d "{\"themeId\":\"$t\"}" >/dev/null
  sleep 0.2
  d=/tmp/r62d-shots/$t; mkdir -p $d
  curl -s "$BASE/" -o $d/home.html
  curl -s "$BASE/?view=category&cat=cat:%E7%8E%84%E5%B9%BB%E5%A5%87%E5%B9%BB&sort=words&status=completed" -o $d/category.html
  curl -s "$BASE/book/$B1.html" -o $d/book.html
  curl -s "$BASE/read/$B1/" -o $d/toc.html
  curl -s "$BASE/read/$B1/?page=2" -o $d/toc-p2.html
  curl -s "$BASE/read/$B1/$C1.html" -o $d/read.html
  curl -s "$BASE/?view=search&kw=%E4%B8%87" -o $d/search-hit.html
  curl -s "$BASE/?view=search&kw=zzzznovel" -o $d/search-empty.html
  curl -s "$BASE/?view=ranking" -o $d/ranking.html
  curl -s "$BASE/?view=fulltext" -o $d/fulltext.html
  curl -s "$BASE/?view=history" -o $d/history.html
  code=$(curl -s -w '%{http_code}' "$BASE/book/nonexist999.html" -o $d/404.html)
  echo "$code" > $d/404-code.txt
  echo "swept $t"
done
