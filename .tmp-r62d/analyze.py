#!/usr/bin/env python3
# R62-d static HTML analyzer: theme × page matrix
import re, os, json, html

SHOTS = "/tmp/r62d-shots"
CSSDIR = "/home/z/my-project/web/static/css"
THEMES = ["aijjxs","pili","shipsay","x2552","kks101","trxsw","ddyueshu","ggd66","huangjinwu","qb23","x33yq"]
PAGES = ["home","category","book","toc","toc-p2","read","search-hit","search-empty","ranking","fulltext","history","404"]

css_cache = {}
def css_text(theme):
    if theme not in css_cache:
        parts = []
        for f in (f"{theme}.css","site.css"):
            p = os.path.join(CSSDIR, f)
            if os.path.exists(p):
                parts.append(open(p, encoding="utf-8", errors="replace").read())
        css_cache[theme] = "\n".join(parts)
    return css_cache[theme]

def strip_comments(css):
    return re.sub(r"/\*.*?\*/", "", css, flags=re.S)

cls_re = re.compile(r'class="([^"]*)"')
img_re = re.compile(r'<img[^>]*>', re.I)
src_re = re.compile(r'src="([^"]*)"')

def classes_in(h):
    out = set()
    for m in cls_re.finditer(h):
        for c in m.group(1).split():
            out.add(c)
    return out

def css_has_class(css, cls):
    # crude: class name appears as selector token
    return re.search(r'\.'+re.escape(cls)+r'(?![\w-])', css) is not None

report = {}
for t in THEMES:
    d = os.path.join(SHOTS, t)
    csst = strip_comments(css_text(t))
    theme_only = strip_comments(open(os.path.join(CSSDIR, f"{t}.css"), encoding="utf-8", errors="replace").read()) if os.path.exists(os.path.join(CSSDIR,f"{t}.css")) else ""
    trep = {}
    for pg in PAGES:
        fp = os.path.join(d, pg+".html")
        if not os.path.exists(fp):
            trep[pg] = {"error":"missing file"}
            continue
        h = open(fp, encoding="utf-8", errors="replace").read()
        issues = []
        if '<!DOCTYPE html>' not in h: issues.append("no-doctype")
        if 'name="viewport"' not in h: issues.append("no-viewport")
        if f'/static/css/{t}.css' not in h: issues.append("no-theme-css-link")
        m = re.search(r'<title>(.*?)</title>', h, re.S)
        title = html.unescape(m.group(1)).strip() if m else ""
        if not title: issues.append("empty-title")
        if '<meta name="description"' not in h and pg not in ("history","404"): issues.append("no-description")
        # images
        imgs = img_re.findall(h)
        broken = []
        for im in imgs:
            sm = src_re.search(im)
            if not sm: broken.append("no-src")
            else:
                s = sm.group(1)
                if s=="" or s=="covers/" or s.startswith("covers/") or s=="/api/public/cover?file=":
                    broken.append(s or "empty")
        if broken: issues.append("img-broken:%d(%s)" % (len(broken), ",".join(sorted(set(broken))[:3])))
        # CSS coverage of used classes
        used = classes_in(h)
        missing = sorted(c for c in used if not css_has_class(csst, c))
        missing_theme_only = sorted(c for c in used if not css_has_class(theme_only, c) and not css_has_class(csst, c))
        # page specific
        spec = {}
        if pg == "book":
            spec["has-intro"] = bool(re.search(r'(简介|內容簡介|内容简介|ajx-intro|book-intro|intro)', h))
            spec["has-latest-block"] = bool(re.search(r'(最新章节|最新章節|最新更新|latest)', h))
            spec["has-recommend"] = bool(re.search(r'(同类推荐|相似推荐|相关推荐|推荐阅读|看过.*还看过|猜你喜欢|喜欢)', h))
            spec["cover-img"] = h.count("/api/public/cover")
        if pg == "read":
            spec["prev-next"] = bool(re.search(r'(上一页|上一章|上一頁)', h)) and bool(re.search(r'(下一页|下一章|下一頁)', h))
            spec["toc-entry"] = bool(re.search(r'(目录|目錄|章节列表|章节目錄)', h))
            spec["content-paras"] = len(re.findall(r'<p[ >]', h))
        if pg == "toc":
            spec["chapters"] = len(re.findall(r'chapterHref|/read/[^"]+\.html', h))
            spec["pager"] = bool(re.search(r'(下一页|下一頁|page=2|pager|pagination)', h))
        if pg == "toc-p2":
            spec["pager"] = bool(re.search(r'(page=1|page=3|上一页|下一頁|pager)', h))
            spec["chapters"] = len(re.findall(r'/read/[^"]+\.html', h))
        if pg == "search-hit":
            spec["results"] = h.count("bookHref") or len(re.findall(r'/book/[a-z0-9]+\.html', h))
            spec["books-links"] = len(re.findall(r'/book/[a-z0-9]+\.html', h))
        if pg == "search-empty":
            spec["empty-state"] = bool(re.search(r'(没有找到|未找到|无结果|沒有找到|暂无|抱歉)', h))
        if pg == "ranking":
            spec["rows"] = len(re.findall(r'rank|排名|top-\d|ranking-item|板|榜', h, re.I))
            spec["book-links"] = len(re.findall(r'/book/[a-z0-9]+\.html', h))
        if pg == "404":
            spec["themed404"] = bool(re.search(r'(页面不存在|不存在|404)', h))
        trep[pg] = {"title": title[:60], "bytes": len(h), "issues": issues,
                    "css-missing": missing[:20], "css-missing-n": len(missing),
                    "spec": spec}
    report[t] = trep

print(json.dumps(report, ensure_ascii=False, indent=1))
