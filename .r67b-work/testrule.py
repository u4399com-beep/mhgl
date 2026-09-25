#!/usr/bin/env python3
"""R67-b 规则实测驱动: 逐条 4 段试采(list→book→toc→content), 礼貌红线每 host ≤10 请求。
用法: python3 testrule.py <ruleId> ...  (可多条顺序跑; 结果追加 .r67b-work/matrix.jsonl)
"""
import json, sys, time, urllib.request, urllib.error, os

BASE = "http://127.0.0.1:3000"
JAR = "/tmp/jar"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "matrix.jsonl")

def cookie():
    for line in open(JAR):
        if "heis_admin" in line:
            return line.strip().split("\t")[-1]
    return ""

def post_test(section, url, rule_obj, fetch_cfg, clean_cfg, timeout=130):
    body = json.dumps({"section": section, "url": url, "rule": rule_obj,
                       "fetch": fetch_cfg, "clean": clean_cfg}).encode()
    req = urllib.request.Request(BASE + "/api/admin/rules/test", data=body,
        headers={"Content-Type": "application/json", "Cookie": "heis_admin=" + cookie()})
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            data = json.loads(r.read().decode())
            return data, None, int((time.time()-t0)*1000)
    except urllib.error.HTTPError as e:
        try:
            payload = json.loads(e.read().decode())
            return payload, "HTTP %d: %s" % (e.code, payload.get("error", "")), int((time.time()-t0)*1000)
        except Exception:
            return None, "HTTP %d" % e.code, int((time.time()-t0)*1000)
    except Exception as e:
        return None, "%s: %s" % (type(e).__name__, e), int((time.time()-t0)*1000)

def get_first_url(sample):
    for it in sample or []:
        u = it.get("url") or it.get("bookUrl") or ""
        if u:
            return u
    return ""

def run_rule(rule):
    cfg = json.loads(rule["config"]) if isinstance(rule.get("config"), str) else (rule.get("config") or {})
    fetch_cfg, clean_cfg = cfg.get("fetch", {}), cfg.get("clean", {})
    rec = {"id": rule["id"], "name": rule["name"], "stages": {}, "verdict": "PASS"}
    list_rule = cfg.get("list", {})
    tpl = list_rule.get("urlTemplate") or ""
    if not tpl:
        rec["stages"]["list"] = {"skip": "no urlTemplate"}
        rec["verdict"] = "SKIP(list 无模板)"
        return rec
    res, err, ms = post_test("list", tpl, list_rule, fetch_cfg, clean_cfg)
    st = {"ms": ms}
    if err:
        st["FAIL"] = err
        rec["verdict"] = "FAIL(list)"
        rec["stages"]["list"] = st
        return rec
    d = ((res.get("data") or {}).get("data")) or {}
    st.update({"count": d.get("count"), "htmlSize": d.get("htmlSize")})
    sample = d.get("sample") or []
    book_url = get_first_url(sample)
    st["sample0"] = {k: (v[:60] if isinstance(v, str) else v) for k, v in list(sample[0].items())[:4]} if sample else None
    rec["stages"]["list"] = st
    if not book_url:
        rec["verdict"] = "FAIL(list 无样本链接)"
        return rec
    res, err, ms = post_test("book", book_url, cfg.get("book", {}), fetch_cfg, clean_cfg)
    st = {"ms": ms, "url": book_url[:80]}
    if err:
        st["FAIL"] = err
        rec["verdict"] = "FAIL(book)"
        rec["stages"]["book"] = st
        return rec
    fields = (((res.get("data") or {}).get("data")) or {}).get("fields") or {}
    st["fields"] = {k: (str(v)[:40] if v else "") for k, v in fields.items() if k in ("name", "author", "status", "wordCount")}
    rec["stages"]["book"] = st
    if not fields.get("name"):
        rec["verdict"] = "FAIL(book 无书名)"
        return rec
    res, err, ms = post_test("toc", book_url, cfg.get("toc", {}), fetch_cfg, clean_cfg)
    st = {"ms": ms}
    if err:
        st["FAIL"] = err
        rec["verdict"] = "FAIL(toc)"
        rec["stages"]["toc"] = st
        return rec
    d = ((res.get("data") or {}).get("data")) or {}
    st.update({"count": d.get("count"), "pages": d.get("pages")})
    tsample = d.get("sample") or []
    ch_url = get_first_url(tsample)
    st["sample0"] = {k: (v[:50] if isinstance(v, str) else v) for k, v in list(tsample[0].items())[:3]} if tsample else None
    rec["stages"]["toc"] = st
    if not ch_url:
        rec["verdict"] = "FAIL(toc 无章节链接)"
        return rec
    res, err, ms = post_test("content", ch_url, cfg.get("content", {}), fetch_cfg, clean_cfg)
    st = {"ms": ms, "url": ch_url[:80]}
    if err:
        st["FAIL"] = err
        rec["verdict"] = "FAIL(content)"
        rec["stages"]["content"] = st
        return rec
    d = ((res.get("data") or {}).get("data")) or {}
    txt = d.get("cleanedText") or ""
    st.update({"rawLength": d.get("rawLength"), "cleanedLength": d.get("cleanedLength"),
               "preview": txt[:60].replace("\n", "|")})
    rec["stages"]["content"] = st
    if (d.get("cleanedLength") or 0) <= 0:
        rec["verdict"] = "FAIL(content 清洗后空)"
    return rec

def main():
    rules = {r["id"]: r for r in json.load(open("/tmp/r67b_rules.json"))["data"]}
    for rid in sys.argv[1:]:
        if rid not in rules:
            print("!! 未知规则 id:", rid); continue
        r = rules[rid]
        print("== 测试:", r["name"], flush=True)
        rec = run_rule(r)
        print(json.dumps(rec, ensure_ascii=False, indent=1), flush=True)
        with open(OUT, "a") as f:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
        if rec["verdict"] != "PASS":
            print("!! 非绿, 按规程停改复测", flush=True)
        time.sleep(2)

if __name__ == "__main__":
    main()
