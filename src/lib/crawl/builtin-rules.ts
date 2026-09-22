// ============================================================
// [R15-b1] 内置规则库 — 由 scripts/gen-builtin-rules.ts 自动生成, 勿手改
// ============================================================
// 数据来源: scripts/seed-rule-*.ts(24 站种子规则, R13 轮 19/22 四段实测全链 PASS)
// 重新生成: bun run scripts/gen-builtin-rules.ts
// 消费方: /api/admin/rules/builtin(元数据+导入状态) / POST /api/admin/rules/import-builtin
//         (幂等导入) / 管理端「采集规则 → 内置规则库」对话框
// 修改规则的正确姿势: 改对应 seed-rule-*.ts → 四段实测 → 重跑生成器同步本文件
// ============================================================

/** 内置规则(种子规则注册表条目) */
export interface BuiltinRule {
  /** 稳定 key(种子文件名派生, 导入请求用) */
  key: string
  /** 规则名(与种子入库名一致, 幂等导入按名查重) */
  name: string
  description: string
  enabled: boolean
  /** 完整 RuleConfig(list/book/toc/content 四段 + fetch + clean) */
  config: Record<string, unknown>
  /** 生成来源脚本(相对项目根) */
  source: string
}

export const BUILTIN_RULES: BuiltinRule[] = [
  {
    key: "77shuku",
    name: "77读书 (77shuku.info)",
    description: "77shuku.info 杰奇CMS 站(Legado 书源反译, yckceo 源7819)。★需国内 IP 出口: 站点对海外/数据中心 IP 连接级丢弃(沙箱实测 timeout), 必须在 fetch.proxyUrl 配国内 IP 代理(http(s)://或socks5h://, 逗号分隔多条构成轮换池≤10, 走 curl 链生效)。列表=最近更新榜 /rank/lastupdate/(单页全量, 任务范围 1..1; 其余 7 榜 allvisit/monthvisit/weekvisit/postdate/size/allvote/goodnum/toptime 改路径即用; 分类页 /store/{1玄幻|2仙侠|3都市|4穿越|6恐怖|7科幻|8网游|9言情}_{page}.html 带分页) div#articlelist ul li(span.l2 a 书名/span.l3 作者/span.l1 分类剥[]/span.l4 a 最新章/span.l5 字数/span.l7 时间) / 书籍页 /novel/{id}/ og:novel:* meta 全套+og:image+div#intro+div#info 字数 / 目录内嵌书籍页 div.zjbox dd a(URL 含 /chapter/, 全量单页无翻页) / 正文 div#ChapterContents(去 #content_tip+行级广告词清洗: txt下载地址尾部/站名水印/导导流句)。UTF-8, 无需登录, 移动 UA 钉住(书源同款); 书源 2req/s 频控由任务间隔(缺省 1000~2000ms)+hostGateLimit 3 兜底(waitMs 仅浏览器引擎生效)。\n⚠ 未实测: 本沙箱无国内代理资源, 四段为书源反译(书源作者实测过, 源 2026-09-12 仍在维护); 拿到代理后 CN_PROXY=… CN77_PROBE=1 重跑种子或管理端编辑 proxyUrl 后用四段测试面板复验。",
    enabled: true,
    source: "scripts/seed-rule-77shuku.ts",
    config: {
      "list": {
        "enabled": true,
        "urlTemplate": "http://www.77shuku.info/rank/lastupdate/",
        "itemSelector": {
          "type": "css",
          "expression": "div#articlelist ul li"
        },
        "fields": {
          "name": {
            "type": "css",
            "expression": "span.l2 a",
            "attr": "text"
          },
          "bookUrl": {
            "type": "css",
            "expression": "span.l2 a",
            "attr": "href"
          },
          "author": {
            "type": "css",
            "expression": "span.l3",
            "attr": "text"
          },
          "category": {
            "type": "css",
            "expression": "span.l1",
            "attr": "text",
            "replaceFrom": "\\[|\\]",
            "replaceTo": ""
          },
          "latestChapter": {
            "type": "css",
            "expression": "span.l4 a",
            "attr": "text"
          },
          "wordCount": {
            "type": "css",
            "expression": "span.l5",
            "attr": "text"
          },
          "updateTime": {
            "type": "css",
            "expression": "span.l7",
            "attr": "text"
          }
        },
        "pagination": {
          "enabled": false,
          "maxPages": 1
        }
      },
      "book": {
        "enabled": true,
        "fields": {
          "name": {
            "type": "css",
            "expression": "meta[property=\"og:novel:book_name\"]",
            "attr": "content"
          },
          "author": {
            "type": "css",
            "expression": "meta[property=\"og:novel:author\"]",
            "attr": "content"
          },
          "category": {
            "type": "css",
            "expression": "meta[property=\"og:novel:category\"]",
            "attr": "content"
          },
          "status": {
            "type": "css",
            "expression": "meta[property=\"og:novel:status\"]",
            "attr": "content"
          },
          "latestChapter": {
            "type": "css",
            "expression": "meta[property=\"og:novel:latest_chapter_name\"]",
            "attr": "content"
          },
          "cover": {
            "type": "css",
            "expression": "meta[property=\"og:image\"]",
            "attr": "content"
          },
          "intro": {
            "type": "css",
            "expression": "div#intro",
            "attr": "html"
          },
          "wordCount": {
            "type": "css",
            "expression": "div#info span.item:contains(\"字数\")",
            "attr": "text",
            "replaceFrom": "^字数[:：]\\s*|字$",
            "replaceTo": ""
          }
        }
      },
      "toc": {
        "enabled": true,
        "itemSelector": {
          "type": "css",
          "expression": "div.zjbox dd a"
        },
        "fields": {
          "title": {
            "type": "css",
            "expression": "a",
            "attr": "text"
          },
          "url": {
            "type": "css",
            "expression": "a",
            "attr": "href"
          }
        },
        "pagination": {
          "enabled": false,
          "maxPages": 1
        }
      },
      "content": {
        "enabled": true,
        "fields": {
          "content": {
            "type": "css",
            "expression": "div#ChapterContents",
            "attr": "html"
          }
        },
        "pagination": {
          "enabled": false,
          "maxPages": 1
        }
      },
      "fetch": {
        "engine": "http",
        "uaMode": "custom",
        "customUa": "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
        "autoCookie": true,
        "referer": true,
        "timeout": 25000,
        "retries": 2,
        "waitMs": 800,
        "hostGateLimit": 3,
        "proxyUrl": ""
      },
      "clean": {
        "removeSelectors": [
          "script",
          "style",
          "iframe",
          "ins",
          "noscript",
          "#content_tip"
        ],
        "adPatterns": [
          "txt下载地址\\S*",
          "txt下载[^<>]*",
          "全集txt\\S*",
          "txt全集\\S*",
          "77shuku[^<>]*",
          "77dushu[^<>]*",
          "记住77[^<>]*",
          "牢记网址[^<>]*",
          "最新网址[^<>]*",
          "请收藏本站[^<>]*",
          "全文免费阅读[^<>]*",
          "(www\\.)?[a-z0-9-]+\\.(com|net|cc|org|info|top|xyz|vip|site)(\\/\\S*)?",
          "无弹窗",
          "最快更新",
          "手机版|手机端",
          "章节报错[^<>]*",
          "app下载[^<>]*",
          "请分享[^<>]*"
        ],
        "whitelist": [
          "p",
          "br",
          "b",
          "strong",
          "em",
          "i",
          "u",
          "h1",
          "h2",
          "h3",
          "h4",
          "h5",
          "h6"
        ],
        "normalize": true,
        "plainText": false
      }
    },
  },
  {
    key: "80ge",
    name: "八零电子书 (80ge.info)·wap正文·直连",
    description: "80ge.info 八零电子书(TXT下载老站, XHTML utf-8, 零反爬直连)。qq-a2 轮: 姊妹站 qiushu.info(www 目录页章节链接指向它)对本沙箱出口 IP TCP 拉黑(2026-09 实测), 应急转场 wap.80ge.info 手机版(同 bookId/chapterId 体系, 第1章同为 76636828)。架构: list/book=www 桌面页, toc/content=wap 页; tocLink 把书籍页 txtml_{id} 链接改写为 wap/{id}/page-1.html(每页40章, 多页书走 select 下拉引擎不可表达=已知边界)。章节页 div#nr1 章内分页(_2/_3), 末页导航变'下一章'无'下一页'锚 → content 翻页无 nextLink 兜底自然收敛。单一桌面 UA 全站通用。探测样本: 修仙从绑定名师课程开始 /txtxz/225637.html(28章, 全3页/章, ~4400字/章)。",
    enabled: true,
    source: "scripts/seed-rule-80ge.ts",
    config: {
      "list": {
        "enabled": true,
        "urlTemplate": "http://www.80ge.info/top/lastupdate/{page}.html",
        "itemSelector": {
          "type": "css",
          "expression": "div#list_art_2013"
        },
        "fields": {
          "name": {
            "type": "css",
            "expression": "div.book_bg a",
            "attr": "text",
            "replaceFrom": "\\s*TXT下载\\s*$",
            "replaceTo": ""
          },
          "bookUrl": {
            "type": "css",
            "expression": "div.book_bg a",
            "attr": "href"
          },
          "author": {
            "type": "css",
            "expression": "div.book_cont a[href*='/author/']",
            "attr": "text"
          },
          "intro": {
            "type": "css",
            "expression": "div.book_jj",
            "attr": "text"
          },
          "cover": {
            "type": "css",
            "expression": "div.book_pic img",
            "attr": "src"
          },
          "status": {
            "type": "css",
            "expression": "div.book_rg span.strong",
            "attr": "text"
          }
        },
        "pagination": {
          "enabled": false,
          "maxPages": 1
        }
      },
      "book": {
        "enabled": true,
        "fields": {
          "name": {
            "type": "css",
            "expression": "#soft_info_para h1",
            "attr": "text",
            "replaceFrom": "TXT全集下载$",
            "replaceTo": ""
          },
          "author": {
            "type": "css",
            "expression": "div.soft_info_r a[href*='/author/']",
            "attr": "text"
          },
          "cover": {
            "type": "css",
            "expression": "img.info_img",
            "attr": "src"
          },
          "status": {
            "type": "css",
            "expression": "li:contains(\"写作进度\") strong",
            "attr": "text"
          },
          "intro": {
            "type": "css",
            "expression": "#mainSoftIntro p",
            "attr": "text",
            "replaceFrom": "^.*?分享推荐给你的朋友！\\s*|更多.*$",
            "replaceTo": ""
          }
        }
      },
      "toc": {
        "enabled": true,
        "tocLink": {
          "type": "css",
          "expression": "a[href*='txtml_']",
          "attr": "href",
          "replaceFrom": "^http://www\\.80ge\\.info/txtml_(\\d+)\\.html$",
          "replaceTo": "http://wap.80ge.info/$1/page-1.html"
        },
        "itemSelector": {
          "type": "css",
          "expression": "div.book_last dd"
        },
        "fields": {
          "title": {
            "type": "css",
            "expression": "a",
            "attr": "text",
            "replaceFrom": "^\\d+、",
            "replaceTo": ""
          },
          "url": {
            "type": "css",
            "expression": "a",
            "attr": "href"
          }
        },
        "pagination": {
          "enabled": true,
          "maxPages": 5
        }
      },
      "content": {
        "enabled": true,
        "fields": {
          "title": {
            "type": "css",
            "expression": "h1",
            "attr": "text"
          },
          "content": {
            "type": "css",
            "expression": "div#nr1",
            "attr": "html"
          }
        },
        "pagination": {
          "enabled": true,
          "maxPages": 10
        }
      },
      "fetch": {
        "engine": "http",
        "uaMode": "custom",
        "customUa": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "autoCookie": false,
        "referer": true,
        "timeout": 30000,
        "retries": 1,
        "waitMs": 200,
        "hostGateLimit": 3
      },
      "clean": {
        "removeSelectors": [
          "script",
          "style",
          "iframe",
          "ins",
          "noscript"
        ],
        "adPatterns": [
          "（?本章未完[^）<>]{0,40}）?",
          "请记住本站[^<>]*",
          "本站所收录[^<>]*",
          "一秒记住[^<>]*"
        ]
      }
    },
  },
  {
    key: "aijjxs-toplist",
    name: "久久小说网 排行榜 (aijjxs.com toplist)",
    description: "aijjxs.com 排行榜/筛选页(toplist)专用规则, 与分类列表规则(div.listbg)同站互补 —— toplist 是紧凑布局无 listbg, 用分类规则取不到数。★0 基翻页: 首个 p_ 段=页码-1(第1页 p_0/第2页 p_1), urlTemplate 用 {offset:1} 表达, 任务页号 1..N 直接可用; 筛选参数: c_(1女生/2男生/3耽美) r_(1最新上传/2下载排行/3收藏排行/4只看推荐) n_年度 s_背景 q_大小, 变体通过任务级列表页 URL 覆盖改参即可(仅 {page}/{offset:N} 被引擎替换)。列表=div.body.grid2 div.book ×10/页(h4 a 书名/zuozhe 作者/meta small:last-of-type 分类/regex 状态锚定\"· 状态 · 大小\"/oldDate 上传日期/封面协议相对自动补全/desc 简介) / 书籍页+目录+正文与分类规则同构(/txt/{bid}.html → a[href^=/read/] → /read/{bid}/ ul.chapter-list 全量单页, 正文 #view_content_txt 每章单页翻页关闭)。UTF-8 直连无挑战。",
    enabled: true,
    source: "scripts/seed-rule-aijjxs-toplist.ts",
    config: {
      "list": {
        "enabled": true,
        "urlTemplate": "https://www.aijjxs.com/txt/toplist-p_{offset:1}-c_2-n_0-l_10-t_6-p_1-s_0-q_0-r_1-m_0.html",
        "itemSelector": {
          "type": "css",
          "expression": "div.body.grid2 div.book"
        },
        "fields": {
          "name": {
            "type": "css",
            "expression": "h4 a",
            "attr": "text"
          },
          "bookUrl": {
            "type": "css",
            "expression": "h4 a",
            "attr": "href"
          },
          "author": {
            "type": "css",
            "expression": "a[href*=\"/zuozhe/\"]",
            "attr": "text"
          },
          "category": {
            "type": "css",
            "expression": "div.meta small:last-of-type",
            "attr": "text"
          },
          "status": {
            "type": "regex",
            "expression": "·\\s*(已完结|连载中|连载|完本)\\s*·\\s*[\\d.]+\\s*[KMG]?B"
          },
          "updateTime": {
            "type": "regex",
            "expression": "oldDate\">(\\d{4}-\\d{2}-\\d{2})"
          },
          "size": {
            "type": "regex",
            "expression": "·\\s*([\\d.]+\\s*[KMG]B)\\s*·"
          },
          "cover": {
            "type": "css",
            "expression": "img",
            "attr": "src"
          },
          "intro": {
            "type": "css",
            "expression": "div.desc",
            "attr": "text"
          }
        },
        "pagination": {
          "enabled": false,
          "maxPages": 1
        }
      },
      "book": {
        "enabled": true,
        "fields": {
          "name": {
            "type": "css",
            "expression": "article.panel h3",
            "attr": "text",
            "replaceFrom": "^《|》$",
            "replaceTo": ""
          },
          "author": {
            "type": "css",
            "expression": ".kv a[href*=\"/zuozhe/\"]",
            "attr": "text"
          },
          "category": {
            "type": "css",
            "expression": ".kv p:contains(\"书籍分类\")",
            "attr": "text",
            "replaceFrom": "^书籍分类：\\s*",
            "replaceTo": ""
          },
          "status": {
            "type": "css",
            "expression": "span.sfwj",
            "attr": "text"
          },
          "intro": {
            "type": "css",
            "expression": "div.desc",
            "attr": "text"
          },
          "cover": {
            "type": "css",
            "expression": ".pic img",
            "attr": "src"
          }
        }
      },
      "toc": {
        "enabled": true,
        "tocLink": {
          "type": "css",
          "expression": "a[href^=\"/read/\"]",
          "attr": "href"
        },
        "itemSelector": {
          "type": "css",
          "expression": "ul.chapter-list li:not(:first-child)"
        },
        "fields": {
          "title": {
            "type": "css",
            "expression": "a",
            "attr": "text"
          },
          "url": {
            "type": "css",
            "expression": "a",
            "attr": "href"
          }
        },
        "pagination": {
          "enabled": false,
          "maxPages": 1
        }
      },
      "content": {
        "enabled": true,
        "fields": {
          "content": {
            "type": "css",
            "expression": "#view_content_txt",
            "attr": "html"
          }
        },
        "pagination": {
          "enabled": false,
          "maxPages": 1
        }
      },
      "fetch": {
        "engine": "http",
        "uaMode": "rotate",
        "autoCookie": true,
        "referer": true,
        "timeout": 25000,
        "retries": 2,
        "waitMs": 800,
        "browserFallbackStatus": [
          403,
          412,
          429,
          503
        ],
        "hostGateLimit": 3
      },
      "clean": {
        "removeSelectors": [
          "script",
          "style",
          "iframe",
          "ins",
          "noscript",
          ".adsbygoogle"
        ],
        "adPatterns": [
          "(www\\.)?aijjxs\\.com\\S*",
          "(www\\.)?jjjjxsw\\.com\\S*",
          "久久小说网[^<>]*",
          "请记住本站[^<>]*",
          "本站内容来源于网络[^。<>]*",
          "本站所收录作品[^<>]*",
          "(www\\.)?[a-z0-9-]+\\.(com|net|cc|org|info|top|xyz|vip|site)(\\/\\S*)?"
        ],
        "whitelist": [
          "p",
          "br",
          "b",
          "strong",
          "em",
          "i",
          "u",
          "h1",
          "h2",
          "h3",
          "h4",
          "h5",
          "h6"
        ],
        "normalize": true,
        "plainText": false
      }
    },
  },
  {
    key: "aijjxs",
    name: "久久小说网 (aijjxs.com)",
    description: "aijjxs.com 帝国CMS系 TXT下载+在线阅读混合站, openresty/PHP, UTF-8 直连无挑战(无WAF/无UA门禁/无编码陷阱)。列表=/txt/{slug}/index_{page}.html(第1页与 /txt/{slug}/ 同页实测, index_1 为别名) div.listbg 10本/页(书名/bookUrl/作者/regex状态/封面(协议相对地址自动补全)/简介) / 书籍页 /txt/{bid}.html article.panel h3 剥《》+.kv 作者/分类+span.sfwj 状态原文+div.desc 简介+.pic img 封面 / 目录: 书籍页 a[href^=/read/] tocLink → /read/{bid}/ 内嵌 ul.chapter-list 全量单页(1368章大书实测不截断, 首个li=内容简介用 :not(:first-child) 排除) / 正文 #view_content_txt 纯p段落, 每章单页(★\"下一页\"锚=下一章, 翻页必须关闭防跨章连锁); 章节字数约2000~4000, 正文极净。",
    enabled: true,
    source: "scripts/seed-rule-aijjxs.ts",
    config: {
      "list": {
        "enabled": true,
        "urlTemplate": "https://www.aijjxs.com/txt/xuanhuan/index_{page}.html",
        "itemSelector": {
          "type": "css",
          "expression": "div.listbg"
        },
        "fields": {
          "name": {
            "type": "css",
            "expression": ".title a",
            "attr": "text"
          },
          "bookUrl": {
            "type": "css",
            "expression": ".title a",
            "attr": "href"
          },
          "author": {
            "type": "css",
            "expression": "a[href*=\"/zuozhe/\"]",
            "attr": "text"
          },
          "status": {
            "type": "regex",
            "expression": "写作进度：</small>\\s*([^\\s<]+)"
          },
          "intro": {
            "type": "css",
            "expression": "div[style*=\"padding\"]",
            "attr": "text"
          },
          "cover": {
            "type": "css",
            "expression": "a.img img",
            "attr": "src"
          }
        },
        "pagination": {
          "enabled": false,
          "maxPages": 1
        }
      },
      "book": {
        "enabled": true,
        "fields": {
          "name": {
            "type": "css",
            "expression": "article.panel h3",
            "attr": "text",
            "replaceFrom": "^《|》$",
            "replaceTo": ""
          },
          "author": {
            "type": "css",
            "expression": ".kv a[href*=\"/zuozhe/\"]",
            "attr": "text"
          },
          "category": {
            "type": "css",
            "expression": ".kv p:contains(\"书籍分类\")",
            "attr": "text",
            "replaceFrom": "^书籍分类：\\s*",
            "replaceTo": ""
          },
          "status": {
            "type": "css",
            "expression": "span.sfwj",
            "attr": "text"
          },
          "intro": {
            "type": "css",
            "expression": "div.desc",
            "attr": "text"
          },
          "cover": {
            "type": "css",
            "expression": ".pic img",
            "attr": "src"
          }
        }
      },
      "toc": {
        "enabled": true,
        "tocLink": {
          "type": "css",
          "expression": "a[href^=\"/read/\"]",
          "attr": "href"
        },
        "itemSelector": {
          "type": "css",
          "expression": "ul.chapter-list li:not(:first-child)"
        },
        "fields": {
          "title": {
            "type": "css",
            "expression": "a",
            "attr": "text"
          },
          "url": {
            "type": "css",
            "expression": "a",
            "attr": "href"
          }
        },
        "pagination": {
          "enabled": false,
          "maxPages": 1
        }
      },
      "content": {
        "enabled": true,
        "fields": {
          "content": {
            "type": "css",
            "expression": "#view_content_txt",
            "attr": "html"
          }
        },
        "pagination": {
          "enabled": false,
          "maxPages": 1
        }
      },
      "fetch": {
        "engine": "http",
        "uaMode": "rotate",
        "autoCookie": true,
        "referer": true,
        "timeout": 25000,
        "retries": 2,
        "waitMs": 800,
        "browserFallbackStatus": [
          403,
          412,
          429,
          503
        ],
        "hostGateLimit": 3
      },
      "clean": {
        "removeSelectors": [
          "script",
          "style",
          "iframe",
          "ins",
          "noscript",
          ".adsbygoogle"
        ],
        "adPatterns": [
          "(www\\.)?aijjxs\\.com\\S*",
          "(www\\.)?jjjjxsw\\.com\\S*",
          "久久小说网[^<>]*",
          "请记住本站[^<>]*",
          "本站内容来源于网络[^。<>]*",
          "本站所收录作品[^<>]*",
          "(www\\.)?[a-z0-9-]+\\.(com|net|cc|org|info|top|xyz|vip|site)(\\/\\S*)?"
        ],
        "whitelist": [
          "p",
          "br",
          "b",
          "strong",
          "em",
          "i",
          "u",
          "h1",
          "h2",
          "h3",
          "h4",
          "h5",
          "h6"
        ],
        "normalize": true,
        "plainText": false
      }
    },
  },
  {
    key: "biqugetw",
    name: "笔趣阁(www.biquge.tw)·直连SSR采集",
    description: "biquge.tw 直连无防护 UTF-8 SSR 简体站(m.biquge.tw 为繁体镜像不采用, 实测 www 正文简体字形无需 t2s)。列表=书库 /sort/{page}.html .list-index-2:not(.hidden-xs) .item(dt>a 书名/dd.author/dd.intro/img data-src 封面/span 状态) / 书籍页 h1+og:novel:* meta(注意章名键 lastest 拼写)+.intro p 真简介+img.backcover 封面 / 目录=tocLink a.chapterlist 独立页 /book/{id}/ .booklist li>a 全量单页(1869章实测) / 正文 div#chaptercontent, \"下一章\"=下一章故翻页关闭(h1 带章内分页计数器 1/1, 抽查无分页章)。",
    enabled: true,
    source: "scripts/seed-rule-biqugetw.ts",
    config: {
      "list": {
        "enabled": true,
        "urlTemplate": "https://www.biquge.tw/sort/{page}.html",
        "itemSelector": {
          "type": "css",
          "expression": "div.list-index-2:not(.hidden-xs) div.item"
        },
        "fields": {
          "name": {
            "type": "css",
            "expression": "dl dt a",
            "attr": "text"
          },
          "bookUrl": {
            "type": "css",
            "expression": "dl dt a",
            "attr": "href"
          },
          "author": {
            "type": "css",
            "expression": "dd.author",
            "attr": "text"
          },
          "intro": {
            "type": "css",
            "expression": "dd.intro",
            "attr": "text"
          },
          "cover": {
            "type": "css",
            "expression": "div.cover img",
            "attr": "data-src"
          },
          "status": {
            "type": "css",
            "expression": "div.cover span",
            "attr": "text",
            "replaceFrom": "^\\s*/\\s*",
            "replaceTo": ""
          }
        }
      },
      "book": {
        "enabled": true,
        "fields": {
          "name": {
            "type": "css",
            "expression": "h1",
            "attr": "text"
          },
          "author": {
            "type": "css",
            "expression": "meta[property='og:novel:author']",
            "attr": "content"
          },
          "category": {
            "type": "css",
            "expression": "meta[property='og:novel:category']",
            "attr": "content"
          },
          "status": {
            "type": "css",
            "expression": "meta[property='og:novel:status']",
            "attr": "content"
          },
          "latestChapter": {
            "type": "css",
            "expression": "meta[property='og:novel:lastest_chapter_name']",
            "attr": "content"
          },
          "intro": {
            "type": "css",
            "expression": "div.intro p",
            "attr": "html"
          },
          "cover": {
            "type": "css",
            "expression": "img.backcover",
            "attr": "src"
          }
        }
      },
      "toc": {
        "enabled": true,
        "tocLink": {
          "type": "css",
          "expression": "a.chapterlist",
          "attr": "href"
        },
        "itemSelector": {
          "type": "css",
          "expression": ".booklist li"
        },
        "fields": {
          "title": {
            "type": "css",
            "expression": "a",
            "attr": "text"
          },
          "url": {
            "type": "css",
            "expression": "a",
            "attr": "href"
          }
        },
        "pagination": {
          "enabled": false,
          "maxPages": 1
        }
      },
      "content": {
        "enabled": true,
        "fields": {
          "content": {
            "type": "css",
            "expression": "#chaptercontent",
            "attr": "html"
          }
        },
        "pagination": {
          "enabled": false,
          "maxPages": 1
        }
      },
      "fetch": {
        "engine": "http",
        "uaMode": "rotate",
        "autoCookie": true,
        "referer": true,
        "timeout": 20000,
        "retries": 2,
        "waitMs": 800,
        "browserFallbackStatus": [
          403,
          412,
          429,
          503
        ]
      },
      "clean": {
        "removeSelectors": [
          "script",
          "style",
          "iframe",
          "ins",
          "noscript",
          ".adsbygoogle"
        ],
        "adPatterns": [
          "(www\\.)?biquge\\.tw\\S*",
          "笔趣阁[^<>]*转载收集",
          "本站所有小说为转载作品[^<>]*",
          "本站小说由程序自动索引",
          "(www\\.)?[a-z0-9-]+\\.(com|net|cc|org|info|top|xyz|vip|site)(\\/\\S*)?",
          "本章未完.*?点击下一页继续阅读",
          "一秒记住.*?免费读"
        ],
        "whitelist": [
          "p",
          "br",
          "b",
          "strong",
          "em",
          "i",
          "u",
          "h1",
          "h2",
          "h3",
          "h4",
          "h5",
          "h6"
        ],
        "normalize": true,
        "plainText": false
      }
    },
  },
  {
    key: "book4",
    name: "AU文学 (book4.cc)",
    description: "book4.cc 聚合书库(AU文学站群, 页面品牌 AU文学/聚合书库), 全站统一 base64 渲染壳 —— 真实 DOM 内嵌 html_b 变量由 JS atob+document.write 输出, 响应无 Set-Cookie(壳化无条件, Cookie 两步法不可行), 且壳页 looksBlocked 不命中 → 必须 engine=browser 强制渲染, 禁用 auto(http 首选会拿壳返回空解析)。页面容器 class 带 6 位随机 hex 前缀逐页轮换, 选择器只认语义类名。列表=/AU文学/{分类}/{page}(无尾斜杠, {page} 从 1 起)的 li:has(div.book-info) 每页 20 本(书名/作者/简介/封面) / 书籍页 /AU文学/{分类}/{id}/ h2 书名+作者regex+div.intro 简介+封面(剥 .css 伪装后缀)+最新章regex, 站点无状态字段(isok 语义不明未采用)交 smartCompleteDetect / 目录=书籍页 AJAX 注入 #chapter_list li(996 章全量单页, (N字) 后缀由 replaceFrom 剥除, 依赖 obscura settle 等注入) / 正文=.entry-content 无章节内分页, 尾部推广行与\"正在阅读/当前章节\"行由 adPatterns 剥除。已知源数据瑕疵: 源站章节中部混入其他小说段落(反采集污染, 清洗不可修复)。",
    enabled: true,
    source: "scripts/seed-rule-book4.ts",
    config: {
      "list": {
        "enabled": true,
        "urlTemplate": "https://book4.cc/AU%E6%96%87%E5%AD%A6/%E4%BB%99%E4%BE%A0/{page}",
        "itemSelector": {
          "type": "css",
          "expression": "li:has(div.book-info)"
        },
        "fields": {
          "name": {
            "type": "css",
            "expression": "h3 a",
            "attr": "text",
            "replaceFrom": "[《》]",
            "replaceTo": ""
          },
          "bookUrl": {
            "type": "css",
            "expression": "h3 a",
            "attr": "href"
          },
          "author": {
            "type": "regex",
            "expression": "作者[:：]\\s*([^<\\s<]{1,40})",
            "attr": "1",
            "flags": "gis"
          },
          "intro": {
            "type": "css",
            "expression": "p:contains(\"简介\")",
            "attr": "text",
            "replaceFrom": "^简介[:：]\\s*",
            "replaceTo": ""
          },
          "cover": {
            "type": "css",
            "expression": "div.book-img img",
            "attr": "src",
            "replaceFrom": "\\.css$",
            "replaceTo": ""
          }
        },
        "pagination": {
          "enabled": false,
          "maxPages": 1
        }
      },
      "book": {
        "enabled": true,
        "fields": {
          "name": {
            "type": "css",
            "expression": ".book-detail-info h2",
            "attr": "text",
            "replaceFrom": "[《》]",
            "replaceTo": ""
          },
          "author": {
            "type": "regex",
            "expression": "作者[:：]\\s*([^<\\s<]{1,40})",
            "attr": "1",
            "flags": "gis"
          },
          "intro": {
            "type": "css",
            "expression": "div.intro p",
            "attr": "text",
            "replaceFrom": "^简介[:：]\\s*",
            "replaceTo": ""
          },
          "cover": {
            "type": "css",
            "expression": "div.book-img img",
            "attr": "src",
            "replaceFrom": "\\.css$",
            "replaceTo": ""
          },
          "latestChapter": {
            "type": "regex",
            "expression": "最新：<a[^>]*>([^<]{1,120})</a>",
            "attr": "1",
            "flags": "gis"
          },
          "category": {
            "type": "css",
            "expression": ".tag-box a",
            "attr": "text"
          }
        }
      },
      "toc": {
        "enabled": true,
        "itemSelector": {
          "type": "css",
          "expression": "#chapter_list li"
        },
        "fields": {
          "title": {
            "type": "css",
            "expression": "a",
            "attr": "text",
            "replaceFrom": "\\(\\d+字\\)",
            "replaceTo": ""
          },
          "url": {
            "type": "css",
            "expression": "a",
            "attr": "href"
          }
        },
        "pagination": {
          "enabled": true,
          "maxPages": 20
        }
      },
      "content": {
        "enabled": true,
        "fields": {
          "content": {
            "type": "css",
            "expression": ".entry-content",
            "attr": "html"
          }
        },
        "pagination": {
          "enabled": false,
          "maxPages": 1
        }
      },
      "fetch": {
        "engine": "browser",
        "uaMode": "custom",
        "customUa": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
        "timeout": 60000,
        "retries": 1,
        "waitMs": 1500,
        "browserFallbackStatus": [
          403,
          412,
          429,
          503
        ],
        "hostGateLimit": 2
      },
      "clean": {
        "removeSelectors": [
          "script",
          "style",
          "iframe",
          "ins",
          "noscript",
          ".adsbygoogle"
        ],
        "adPatterns": [
          "<!--[\\s\\S]{0,300}?-->",
          "(www\\.)?book4\\.cc\\S*",
          "请各位大哥大姐帮忙推广[^<]{0,200}",
          "正在阅读《[^<]{0,80}》?",
          "当前章节[:：][^<]{0,120}",
          "下一章节[:：][^<]{0,120}",
          "本站长期运营[^<]{0,120}",
          "(www\\.)?[a-z0-9-]+\\.(com|net|cc|org|info|top|xyz|vip|site)(\\/\\S*)?"
        ],
        "whitelist": [
          "p",
          "br",
          "b",
          "strong",
          "em",
          "i",
          "u",
          "h1",
          "h2",
          "h3",
          "h4",
          "h5",
          "h6"
        ],
        "normalize": true,
        "plainText": false
      }
    },
  },
  {
    key: "bqg713",
    name: "笔趣阁bqg713(www.bqg713.cc)·纯JSON API站采集",
    description: "www.bqg713.cc 纯JSON API站(SPA壳+hash路由无SSR; 已301迁域 www.bqg413.cc, 引擎跟随重定向)。列表 /api/index 并集路径(hotlist,sort1~6)/书籍 /api/book/目录 /api/booklist(纯章节名数组, chapterid=下标+1)。[R21-b] 诱饵正文根治: 章节镜像 apibi.cc 已死(恒403)/apiqu.cc 按章节粒度被投毒(成人诱饵文本, 水印 biquio点cc+srsp.cc), 旧 tokenUrl+txt 链路命中被毒镜像; 真实正文 = www.bqg413.cc / apige.cc 的明文 txt 字段(无 RC4, /api/hm 为纯遥测信标)。现正文走 mini-services/bqg713-proxy:3010 /unlock 端点(deqixs degrade-native 契约): fetch.contentProxyUrl 为 SSRF loopback 豁免键, 探测自指→404→引擎降级直连 toc 合成的 /unlock URL → 主机池(www.bqg413.cc→apige.cc+家族动态学习)逐台取章, 诱饵水印校验(长度下限+水印签名)剔除毒镜像后返回 {ok,content}。",
    enabled: true,
    source: "scripts/seed-rule-bqg713.ts",
    config: {
      "list": {
        "enabled": true,
        "urlTemplate": "https://www.bqg713.cc/api/index?sort=all",
        "itemSelector": {
          "type": "json",
          "expression": "hotlist,sort1,sort2,sort3,sort4,sort5,sort6"
        },
        "fields": {
          "id": {
            "type": "json",
            "expression": "id"
          },
          "title": {
            "type": "json",
            "expression": "title"
          },
          "author": {
            "type": "json",
            "expression": "author"
          },
          "intro": {
            "type": "json",
            "expression": "intro"
          },
          "bookUrl": {
            "type": "const",
            "expression": "https://www.bqg713.cc/api/book?id={id}"
          }
        },
        "pagination": {
          "enabled": false,
          "maxPages": 1
        }
      },
      "book": {
        "enabled": true,
        "fields": {
          "name": {
            "type": "json",
            "expression": "title"
          },
          "author": {
            "type": "json",
            "expression": "author"
          },
          "category": {
            "type": "json",
            "expression": "sortname"
          },
          "intro": {
            "type": "json",
            "expression": "intro"
          },
          "status": {
            "type": "json",
            "expression": "full"
          },
          "latestChapter": {
            "type": "json",
            "expression": "lastchapter"
          }
        }
      },
      "toc": {
        "enabled": true,
        "tocLink": {
          "type": "const",
          "expression": "https://www.bqg713.cc/api/booklist?id={q.id}"
        },
        "itemSelector": {
          "type": "json",
          "expression": "list"
        },
        "fields": {
          "title": {
            "type": "json",
            "expression": "."
          },
          "url": {
            "type": "const",
            "expression": "http://127.0.0.1:3010/unlock?url=https://apige.cc/api/chapter?id={q.id}&chapterid={index}"
          }
        },
        "pagination": {
          "enabled": false,
          "maxPages": 1
        }
      },
      "content": {
        "enabled": true,
        "fields": {
          "title": {
            "type": "json",
            "expression": "chaptername"
          },
          "content": {
            "type": "json",
            "expression": "content"
          }
        },
        "pagination": {
          "enabled": false,
          "maxPages": 1
        }
      },
      "fetch": {
        "engine": "http",
        "uaMode": "rotate",
        "autoCookie": true,
        "referer": true,
        "timeout": 20000,
        "retries": 2,
        "waitMs": 500,
        "browserFallbackStatus": [
          403,
          412,
          429,
          503
        ],
        "contentProxyUrl": "http://127.0.0.1:3010/unlock?url={url}",
        "mirrorDomains": "www.bqg413.cc,apige.cc"
      },
      "clean": {
        "removeSelectors": [
          "script",
          "style",
          "iframe",
          "ins",
          "noscript"
        ],
        "adPatterns": [
          "(www\\.)?bqg7[0-9]{1,2}\\.(cc|com)\\S*",
          "(www\\.)?[a-z0-9-]+\\.(com|net|cc|org|info|top|xyz|vip|site)(\\/\\S*)?",
          "biquio\\S*",
          "srsp\\.cc\\S*",
          "请收藏本站.*?手机版",
          "一秒记住.*?免费读",
          "本站所有小说为转载作品.*?$"
        ],
        "whitelist": [
          "p",
          "br",
          "b",
          "strong",
          "em",
          "i",
          "u",
          "h1",
          "h2",
          "h3"
        ],
        "normalize": true,
        "plainText": true
      }
    },
  },
  {
    key: "cuoceng",
    name: "错层小说网(m.cuoceng.com)·移动站UUID书号采集",
    description: "m.cuoceng.com 错层小说网移动版(R52-a 2026-09-21 实测)。纯静态 SSR/UTF-8/https; Cloudflare 在位但未启用 challenge(curl 直连全 200)。URL 形态: 列表 /book/finish/{page}.html(全本榜 100 页×20 本) | 书籍 /book/{UUID}.html(★UUID 书号, 不可用 mode=bookIds, 必须 mode=list) | 章节 /book/{书UUID}/{章UUID}.html | 目录 /book/chapter/{书UUID}.html(500 章/页, 分页 /book/chapter/{UUID}/{页}.html, nextLink=a#linkNext)。列表 div.bookbox/书籍 h1.booktitle+.booktag 组(a.red 作者/a.blue 分类/span.red 状态)/正文 #content 单页全章。书籍页目录仅内嵌最新 3 条(倒序), 全量走 tocLink 指向独立目录页。简介尾部「本书由错层小说为您呈现…」推广句由 replaceFrom/clean 段清除。反爬态势: CF 未启用 challenge → 推荐引擎 TS/Go 皆可(engine=http); 若 CF 收紧可切 browser(TS 引擎渲染)。",
    enabled: true,
    source: "scripts/seed-rule-cuoceng.ts",
    config: {
      "list": {
        "enabled": true,
        "urlTemplate": "https://m.cuoceng.com/book/finish/{page}.html",
        "itemSelector": {
          "type": "css",
          "expression": "div.bookbox"
        },
        "fields": {
          "bookUrl": {
            "type": "css",
            "expression": ".bookname a",
            "attr": "href"
          },
          "name": {
            "type": "css",
            "expression": ".bookname a",
            "attr": "text"
          },
          "author": {
            "type": "css",
            "expression": ".author",
            "attr": "text",
            "replaceFrom": "^作者：",
            "replaceTo": ""
          },
          "wordCount": {
            "type": "regex",
            "expression": "字数：([0-9.]+万)"
          },
          "latestChapter": {
            "type": "css",
            "expression": ".cat a",
            "attr": "text"
          },
          "intro": {
            "type": "css",
            "expression": ".update",
            "attr": "text",
            "replaceFrom": "^简介：",
            "replaceTo": ""
          }
        },
        "pagination": {
          "enabled": true,
          "maxPages": 2
        }
      },
      "book": {
        "enabled": true,
        "fields": {
          "name": {
            "type": "css",
            "expression": "h1.booktitle",
            "attr": "text"
          },
          "author": {
            "type": "css",
            "expression": ".booktag a.red",
            "attr": "text"
          },
          "category": {
            "type": "css",
            "expression": ".booktag a.blue",
            "attr": "text"
          },
          "wordCount": {
            "type": "css",
            "expression": ".booktag span.blue",
            "attr": "text"
          },
          "status": {
            "type": "css",
            "expression": ".booktag span.red",
            "attr": "text"
          },
          "latestChapter": {
            "type": "css",
            "expression": "a.bookchapter",
            "attr": "text"
          },
          "intro": {
            "type": "css",
            "expression": "p.bookintro",
            "attr": "text",
            "replaceFrom": "本书由错层小说为您呈现[\\s\\S]*$",
            "replaceTo": ""
          },
          "cover": {
            "type": "css",
            "expression": ".bookcover img",
            "attr": "src"
          }
        }
      },
      "toc": {
        "enabled": true,
        "tocLink": {
          "type": "css",
          "expression": "dd a[href*=\"/book/chapter/\"]",
          "attr": "href"
        },
        "itemSelector": {
          "type": "css",
          "expression": "div.chapterlist dd"
        },
        "fields": {
          "title": {
            "type": "css",
            "expression": "a",
            "attr": "text"
          },
          "url": {
            "type": "css",
            "expression": "a",
            "attr": "href"
          }
        },
        "pagination": {
          "enabled": true,
          "nextLink": {
            "type": "css",
            "expression": "a#linkNext",
            "attr": "href"
          },
          "maxPages": 5,
          "joinWith": ""
        }
      },
      "content": {
        "enabled": true,
        "fields": {
          "content": {
            "type": "css",
            "expression": "#content",
            "attr": "html"
          }
        },
        "pagination": {
          "enabled": false,
          "maxPages": 1
        }
      },
      "fetch": {
        "engine": "http",
        "uaMode": "mobile",
        "autoCookie": true,
        "referer": true,
        "refererChain": true,
        "timeout": 20000,
        "retries": 2,
        "waitMs": 500,
        "browserFallbackStatus": [
          403,
          412,
          429,
          503
        ],
        "hostGateLimit": 2,
        "hostGateConcurrency": 2,
        "globalConcurrency": 6
      },
      "clean": {
        "removeSelectors": [
          "script",
          "style",
          "iframe",
          "ins",
          "noscript"
        ],
        "adPatterns": [
          "错层小说.*?呈现",
          "(www\\.)?cuoceng\\.(com|org)\\S*",
          "(www\\.)?[a-z0-9-]+\\.(com|net|cc|org|info|top|xyz|vip|site)(\\/\\S*)?"
        ],
        "whitelist": [
          "p",
          "br",
          "b",
          "strong",
          "em",
          "i",
          "u",
          "h1",
          "h2",
          "h3"
        ],
        "normalize": true,
        "plainText": false
      }
    },
  },
  {
    key: "dafengdagengren",
    name: "大奉打更人 (dafengdagengren.com)",
    description: "dafengdagengren.com GBK 笔趣阁模板站(与 daweixs.com 同平台同模板)。WAF: nginx 403 双 Set-Cookie 挑战(server_name_session 会话 Cookie 为关键凭证), 引擎 http 层 autoCookie 挑战重试链原生破解(首访种 Cookie 二连过, 无需浏览器)。dd-c 改版适配: 分类路径加 xiaoshuo 后缀, 旧列表源 /paihangbang/ 上游恒 502 已弃用, 列表改用 /xuanhuanxiaoshuo/ 分类页 ul.txt-list-row5 li(30 本/页, /list/1_N.html 第 N≥2 页但首页路径独立无法 {page} 表达)。书籍页 .info h1+作者 regex+.info .desc / 目录 #section-list li a / 正文 #content(纵横转载源带捧场月票灌水块, 已清洗; <br>×3 段间折叠+第N/M页页码/本章未完引流行剥离 R21-f2-3, 章内翻页关闭防并章)。",
    enabled: true,
    source: "scripts/seed-rule-dafengdagengren.ts",
    config: {
      "list": {
        "enabled": true,
        "urlTemplate": "https://www.dafengdagengren.com/xuanhuanxiaoshuo/",
        "itemSelector": {
          "type": "css",
          "expression": "ul.txt-list.txt-list-row5 li"
        },
        "fields": {
          "name": {
            "type": "css",
            "expression": "span.s2 a",
            "attr": "text"
          },
          "bookUrl": {
            "type": "css",
            "expression": "span.s2 a",
            "attr": "href"
          },
          "author": {
            "type": "css",
            "expression": "span.s4",
            "attr": "text"
          }
        },
        "pagination": {
          "enabled": false,
          "maxPages": 1
        }
      },
      "book": {
        "enabled": true,
        "fields": {
          "name": {
            "type": "css",
            "expression": ".info h1",
            "attr": "text"
          },
          "author": {
            "type": "regex",
            "expression": "作者[:：]\\s*([^\\s<]{1,30})",
            "attr": "1",
            "flags": "gs"
          },
          "intro": {
            "type": "css",
            "expression": ".info .desc",
            "attr": "html",
            "replaceFrom": "\\s*【(?:添加微信公众号|我们的YY频道|QQ群|QQ交流群|公众账号)[^】]*】|&nbsp;",
            "replaceTo": ""
          },
          "category": {
            "type": "regex",
            "expression": "类别[:：]\\s*([^\\s<]{1,12})",
            "attr": "1",
            "flags": "gs"
          },
          "status": {
            "type": "regex",
            "expression": "状态[:：]\\s*([^\\s<]{1,10})",
            "attr": "1",
            "flags": "gs"
          }
        }
      },
      "toc": {
        "enabled": true,
        "itemSelector": {
          "type": "css",
          "expression": "#section-list li"
        },
        "fields": {
          "title": {
            "type": "css",
            "expression": "a",
            "attr": "text"
          },
          "url": {
            "type": "css",
            "expression": "a",
            "attr": "href"
          }
        },
        "pagination": {
          "enabled": false,
          "maxPages": 1
        }
      },
      "content": {
        "enabled": true,
        "fields": {
          "content": {
            "type": "css",
            "expression": "#content",
            "attr": "html",
            "replaceFrom": "https?:/{2,3}\\d{1,8}/|(?:\\s*<br\\s*\\/?>){3,}|<a[^>]*>\\s*[^<]{0,40}第\\d+\\/\\d+页[^<]{0,10}\\s*<\\/a>|本章未完[^<]{0,40}|第\\d+\\/\\d+页",
            "replaceTo": ""
          }
        },
        "pagination": {
          "enabled": false,
          "maxPages": 1
        }
      },
      "fetch": {
        "engine": "auto",
        "uaMode": "rotate",
        "autoCookie": true,
        "referer": true,
        "timeout": 25000,
        "retries": 2,
        "waitMs": 800,
        "browserFallbackStatus": [
          403,
          412,
          429,
          503
        ]
      },
      "clean": {
        "removeSelectors": [
          "script",
          "style",
          "iframe",
          "ins",
          "noscript",
          "h4"
        ],
        "adPatterns": [
          "https?:\\/\\/(www\\.)?dafengdagengren\\.com\\S*",
          "https?:\\/\\/\\/\\S*",
          "本站所有小说为转载作品[^。<>]*",
          "捧场\\d*纵横币",
          "投\\d*张月票",
          "抽月票",
          "求月票",
          "疯求各种点击、收藏、红票、月票！?",
          "如果觉得本章写的精彩[^<]*",
          "(www\\.)?[a-z0-9-]+\\.(com|net|cc|org|info|top|xyz|vip|site)(\\/\\S*)?"
        ],
        "whitelist": [
          "p",
          "br",
          "b",
          "strong",
          "em",
          "i",
          "u",
          "h1",
          "h2",
          "h3",
          "h5",
          "h6"
        ],
        "normalize": true,
        "plainText": false
      }
    },
  },
  {
    key: "daweixs",
    name: "大微小说网 (daweixs.com)",
    description: "daweixs.com GBK 笔趣阁模板站。WAF: nginx 403 双 Set-Cookie 挑战(server_name_session 会话 Cookie 为关键凭证), 引擎 http 层 autoCookie 挑战重试链原生破解(首访种 Cookie 二连过, 无需浏览器)。dd-c 改版适配: 分类路径加 xiaoshuo 后缀, 旧列表源 /paihangbang/ 上游恒 502 已弃用, 列表改用 /xuanhuanxiaoshuo/ 分类页 ul.txt-list-row5 li(30 本/页, /list/1_N.html 第 N≥2 页但首页路径独立无法 {page} 表达)。书籍页 .info h1+作者 regex+.info .desc / 目录 #section-list li a(精确锚定全量正序, 避开首个\"最新章节\"倒序块) / 正文 #content(<br>×3 段间折叠+第N/M页页码/本章未完引流行剥离 R21-f2-4, 章内翻页关闭防并章)。已知瑕疵: 部分旧章正文尾部混入他书摘录(无标记不可剥离), 采集前建议核对首章。",
    enabled: true,
    source: "scripts/seed-rule-daweixs.ts",
    config: {
      "list": {
        "enabled": true,
        "urlTemplate": "https://www.daweixs.com/xuanhuanxiaoshuo/",
        "itemSelector": {
          "type": "css",
          "expression": "ul.txt-list.txt-list-row5 li"
        },
        "fields": {
          "name": {
            "type": "css",
            "expression": "span.s2 a",
            "attr": "text"
          },
          "bookUrl": {
            "type": "css",
            "expression": "span.s2 a",
            "attr": "href"
          },
          "author": {
            "type": "css",
            "expression": "span.s4",
            "attr": "text"
          }
        },
        "pagination": {
          "enabled": false,
          "maxPages": 1
        }
      },
      "book": {
        "enabled": true,
        "fields": {
          "name": {
            "type": "css",
            "expression": ".info h1",
            "attr": "text"
          },
          "author": {
            "type": "regex",
            "expression": "作者[:：]\\s*([^\\s<]{1,30})",
            "attr": "1",
            "flags": "gs"
          },
          "intro": {
            "type": "css",
            "expression": ".info .desc",
            "attr": "html",
            "replaceFrom": "\\s*【(?:添加微信公众号|我们的YY频道|QQ群|QQ交流群|公众账号)[^】]*】|&nbsp;",
            "replaceTo": ""
          },
          "category": {
            "type": "regex",
            "expression": "类别[:：]\\s*([^\\s<]{1,12})",
            "attr": "1",
            "flags": "gs"
          },
          "status": {
            "type": "regex",
            "expression": "状态[:：]\\s*([^\\s<]{1,10})",
            "attr": "1",
            "flags": "gs"
          }
        }
      },
      "toc": {
        "enabled": true,
        "itemSelector": {
          "type": "css",
          "expression": "#section-list li"
        },
        "fields": {
          "title": {
            "type": "css",
            "expression": "a",
            "attr": "text"
          },
          "url": {
            "type": "css",
            "expression": "a",
            "attr": "href"
          }
        },
        "pagination": {
          "enabled": false,
          "maxPages": 1
        }
      },
      "content": {
        "enabled": true,
        "fields": {
          "content": {
            "type": "css",
            "expression": "#content",
            "attr": "html",
            "replaceFrom": "https?:/{2,3}\\d{1,8}/|(?:\\s*<br\\s*\\/?>){3,}|<a[^>]*>\\s*[^<]{0,40}第\\d+\\/\\d+页[^<]{0,10}\\s*<\\/a>|本章未完[^<]{0,40}|第\\d+\\/\\d+页",
            "replaceTo": ""
          }
        },
        "pagination": {
          "enabled": false,
          "maxPages": 1
        }
      },
      "fetch": {
        "engine": "auto",
        "uaMode": "rotate",
        "autoCookie": true,
        "referer": true,
        "timeout": 25000,
        "retries": 2,
        "waitMs": 800,
        "browserFallbackStatus": [
          403,
          412,
          429,
          503
        ]
      },
      "clean": {
        "removeSelectors": [
          "script",
          "style",
          "iframe",
          "ins",
          "noscript",
          "h4"
        ],
        "adPatterns": [
          "https?:\\/\\/(www\\.)?daweixs\\.com\\S*",
          "https?:\\/\\/\\/\\S*",
          "本站所有小说为转载作品[^。<>]*",
          "(www\\.)?[a-z0-9-]+\\.(com|net|cc|org|info|top|xyz|vip|site)(\\/\\S*)?"
        ],
        "whitelist": [
          "p",
          "br",
          "b",
          "strong",
          "em",
          "i",
          "u",
          "h1",
          "h2",
          "h3",
          "h5",
          "h6"
        ],
        "normalize": true,
        "plainText": false
      }
    },
  },
  {
    key: "deqixs",
    name: "得奇小说网 (deqixs.cc)·直连+签名代理正文",
    description: "得奇小说网(deqixs.cc)杰奇系 GBK 站: list/book/toc 三段直连 + content 段走外置签名代理。正文层双墙: 章节页 SSR 空(懒加载渲染) + 真实内容走 chapter.js.php 三参数(token/timestamp/nonce)→ajax2.php GBK JSON; ajax2 三重校验(XRW/Referer 头, token 与签发 referrer 绑定, timestamp 限时) → 每章动态三参数超出声明式引擎表达力(rr-a 真网实测)。 ⚠ 依赖本机转换代理 mini-services/deqixs-proxy(端口 3014, 三参数签发+GBK 解码+HTML→纯文本): toc url 字段以 replaceFrom ^ 前置 http://127.0.0.1:3014/content?u= 指向代理, 代理只接受 deqixs /books/{aid}/{cid}.html 章节形态。 toc 在书页单 dl.chapterlist 两段(最新12倒序+全量正序), dd.visible-xs\"查看全部章节\"死锚以 :not() 排除, 文档序乱序由引擎 reorderToc 去重+章号排序自愈。 代理启动: cd mini-services/deqixs-proxy && bun run start; /health 自检 selfTestOk/upstreamReachable。",
    enabled: true,
    source: "scripts/seed-rule-deqixs.ts",
    config: {
      "list": {
        "enabled": true,
        "urlTemplate": "https://www.deqixs.cc/sort/1/{page}.html",
        "itemSelector": {
          "type": "css",
          "expression": "div.bookbox"
        },
        "fields": {
          "name": {
            "type": "css",
            "expression": "h4.bookname a"
          },
          "author": {
            "type": "css",
            "expression": "div.author",
            "replaceFrom": "^作者：",
            "replaceTo": ""
          },
          "intro": {
            "type": "css",
            "expression": "div.update",
            "replaceFrom": "^\\s*简介：",
            "replaceTo": ""
          },
          "latestChapter": {
            "type": "css",
            "expression": "div.cat a"
          },
          "bookUrl": {
            "type": "css",
            "expression": "h4.bookname a",
            "attr": "href"
          }
        },
        "pagination": {
          "enabled": true,
          "nextLink": {
            "type": "css",
            "expression": "div.pages a.next",
            "attr": "href"
          },
          "maxPages": 5
        }
      },
      "book": {
        "enabled": true,
        "fields": {
          "name": {
            "type": "css",
            "expression": "h1.booktitle"
          },
          "author": {
            "type": "css",
            "expression": "p.booktag a.red"
          },
          "status": {
            "type": "css",
            "expression": "meta[property=\"og:novel:status\"]",
            "attr": "content",
            "replaceFrom": "^连载$",
            "replaceTo": "连载中"
          },
          "category": {
            "type": "css",
            "expression": "meta[property=\"og:novel:category\"]",
            "attr": "content"
          },
          "latestChapter": {
            "type": "css",
            "expression": "meta[property=\"og:novel:latest_chapter_name\"]",
            "attr": "content"
          },
          "cover": {
            "type": "css",
            "expression": "img.thumbnail",
            "attr": "src"
          },
          "intro": {
            "type": "css",
            "expression": "p.bookintro",
            "stripTags": true
          }
        }
      },
      "toc": {
        "enabled": true,
        "itemSelector": {
          "type": "css",
          "expression": "dl.chapterlist dd:not(.visible-xs)"
        },
        "fields": {
          "title": {
            "type": "css",
            "expression": "a"
          },
          "url": {
            "type": "css",
            "expression": "a",
            "attr": "href",
            "replaceFrom": "^",
            "replaceTo": "http://127.0.0.1:3014/content?u="
          }
        },
        "pagination": {
          "enabled": false,
          "maxPages": 1
        }
      },
      "content": {
        "enabled": true,
        "fields": {
          "content": {
            "type": "json",
            "expression": "content"
          }
        },
        "pagination": {
          "enabled": false,
          "maxPages": 1
        }
      },
      "fetch": {
        "engine": "http",
        "uaMode": "custom",
        "customUa": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "headers": {
          "Accept": "application/json,text/html;q=0.9,*/*;q=0.8"
        },
        "autoCookie": false,
        "referer": false,
        "timeout": 30000,
        "retries": 1,
        "waitMs": 200,
        "hostGateLimit": 2,
        "contentProxyUrl": "http://127.0.0.1:3014/content?u={url}"
      },
      "clean": {
        "removeSelectors": [
          "script",
          "style",
          "iframe",
          "ins",
          "noscript"
        ],
        "adPatterns": [
          "更新不易.*?章节！",
          "速\\s*\\.?\\s*读\\s*\\.?\\s*谷",
          "shudugu\\.org",
          "看最新完整章節，就上速讀谷",
          "本章节未完.*?请订阅",
          "请记住本书.*?域名",
          "最新章节请到.*?查看",
          "一秒记住.*?免费读"
        ],
        "whitelist": [
          "p",
          "br",
          "b",
          "strong",
          "em",
          "i",
          "u"
        ],
        "normalize": true,
        "plainText": true
      }
    },
  },
  {
    key: "fanqianxs",
    name: "番茄小说网(www.fanqianxs.com)·CF隐身桥采集",
    description: "fanqianxs.com CF 封锁站(bxwx 系笔趣阁模板, UTF-8)。列表=首页多板块并集(#recommend div.item+#novelslist li+#recommend .right li+#newslist li, name/bookUrl=\"dt a,.s2 a,li>a\" 首匹配), 快照实测 133 项/127 书; 分类页 /xuanhuan/ 未存档(任务 listUrl 可驱动)。\n⚠ 未实测(2026-09-15): CF IP 级 403+域名 301→fehuu.com(亦 403), 无法四段实测; list 段=2023-03-31 Wayback 快照实证, book/toc/content 按家族惯例写+合成夹具回归(og:novel meta+文本标签正则双保险/#list dd a 目录/#content 正文并集+引擎最大容器兜底); 章节页实证 /html/{bid}/{cid}.html。解封/换出口 IP 后 FANQ_PROBE=1 复验。fetch=scrapling-stealthy 桥+桌面 Chrome UA。",
    enabled: true,
    source: "scripts/seed-rule-fanqianxs.ts",
    config: {
      "list": {
        "enabled": true,
        "urlTemplate": "https://www.fanqianxs.com/",
        "itemSelector": {
          "type": "css",
          "expression": "#recommend div.item, #novelslist .content ul li, #recommend .right ul li, #newslist ul li"
        },
        "fields": {
          "name": {
            "type": "css",
            "expression": "dt a, .s2 a, li > a",
            "attr": "text"
          },
          "bookUrl": {
            "type": "css",
            "expression": "dt a, .s2 a, li > a",
            "attr": "href"
          },
          "author": {
            "type": "css",
            "expression": "dt span, .s4, .s5",
            "attr": "text"
          },
          "category": {
            "type": "css",
            "expression": ".s1",
            "attr": "text",
            "replaceFrom": "\\[|\\]",
            "replaceTo": ""
          },
          "latestChapter": {
            "type": "css",
            "expression": ".s3 a",
            "attr": "text"
          },
          "intro": {
            "type": "css",
            "expression": "dl dd",
            "attr": "text"
          },
          "cover": {
            "type": "css",
            "expression": "img",
            "attr": "src"
          }
        },
        "pagination": {
          "enabled": false,
          "maxPages": 1
        }
      },
      "book": {
        "enabled": true,
        "fields": {
          "name": {
            "type": "css",
            "expression": "h1",
            "attr": "text",
            "replaceFrom": "^《|》$",
            "replaceTo": ""
          },
          "author": {
            "type": "regex",
            "expression": "(?:og:novel:author\"\\s*content=\"|作\\s*者[：:](?:<[^>]*>)*\\s*)([^\"\\s<]{1,40})",
            "attr": "1"
          },
          "category": {
            "type": "regex",
            "expression": "(?:og:novel:category\"\\s*content=\"|类\\s*别[：:](?:<[^>]*>)*\\s*\\[?)([^\"\\]\\s<]{1,12})",
            "attr": "1"
          },
          "status": {
            "type": "regex",
            "expression": "(?:og:novel:status\"\\s*content=\"|状\\s*态[：:](?:<[^>]*>)*\\s*)([^\"\\]\\s<]{1,10})",
            "attr": "1"
          },
          "wordCount": {
            "type": "regex",
            "expression": "字\\s*数[：:](?:<[^>]*>)*\\s*([\\d.,]+\\s*万?[字]?)",
            "attr": "1"
          },
          "latestChapter": {
            "type": "regex",
            "expression": "(?:og:novel:latest_chapter_name\"\\s*content=\"|最新章节[：:](?:<[^>]*>)*\\s*)([^\"<]{1,80})",
            "attr": "1"
          },
          "intro": {
            "type": "css",
            "expression": "#intro, .intro, #bookintro, .bookintro",
            "attr": "text"
          },
          "cover": {
            "type": "css",
            "expression": "img[src*=\"files/article/image\"], img[src*=\"/img/\"], #imgbox img, .imgbox img, .cover img, #img img",
            "attr": "src"
          }
        }
      },
      "toc": {
        "enabled": true,
        "itemSelector": {
          "type": "css",
          "expression": "#list dd a, #chapterlist li a, .chapterlist li a, #chapter_list dd a"
        },
        "fields": {
          "title": {
            "type": "css",
            "expression": "a",
            "attr": "text"
          },
          "url": {
            "type": "css",
            "expression": "a",
            "attr": "href"
          }
        },
        "pagination": {
          "enabled": true,
          "maxPages": 20,
          "nextLink": {
            "type": "css",
            "expression": "a:contains(\"下一页\")",
            "attr": "href"
          }
        }
      },
      "content": {
        "enabled": true,
        "fields": {
          "content": {
            "type": "css",
            "expression": "#content, #chaptercontent, #booktxt, .showtxt",
            "attr": "html"
          }
        },
        "pagination": {
          "enabled": false,
          "maxPages": 1
        }
      },
      "fetch": {
        "engine": "auto",
        "fetchMode": "scrapling-stealthy",
        "uaMode": "custom",
        "customUa": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "headers": {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Accept-Language": "zh-CN,zh;q=0.9"
        },
        "autoCookie": true,
        "referer": true,
        "timeout": 60000,
        "retries": 2,
        "waitMs": 2000,
        "browserFallbackStatus": [
          403,
          412,
          429,
          503
        ],
        "hostGateLimit": 3
      },
      "clean": {
        "removeSelectors": [
          "script",
          "style",
          "iframe",
          "ins",
          "noscript",
          ".adsbygoogle"
        ],
        "adPatterns": [
          "(www\\.)?fanqianxs\\.com\\S*",
          "(www\\.)?fehuu\\.com\\S*",
          "番茄小说网[^<>]*",
          "本站所有小说为转载作品[^<>]*",
          "(www\\.)?[a-z0-9-]+\\.(com|net|cc|org|info|top|xyz|vip|site)(\\/\\S*)?",
          "本章未完.*?点击下一页继续阅读",
          "一秒记住.*?免费读"
        ],
        "whitelist": [
          "p",
          "br",
          "b",
          "strong",
          "em",
          "i",
          "u",
          "h1",
          "h2",
          "h3",
          "h4",
          "h5",
          "h6"
        ],
        "normalize": true,
        "plainText": false
      }
    },
  },
  {
    key: "fanqie",
    name: "番茄小说聚合API (fq.taijiwang.top)",
    description: "番茄小说聚合API(fq.taijiwang.top)四层JSON采集: search(tab_type=3嵌套数组过滤+map-collect展平)/detail/book(数组的数组*展平)/content。结构依据 legado 书源 V3.2 反译。⚠ API 于 2026-08-31 全路径 502 暂不可达, 规则未实测, 恢复后请四段复验。引擎依赖: cc-c jsonGet [n]/[k=v]/*/map-collect + parseToc 两阶段vars + runner {offset:N}。",
    enabled: true,
    source: "scripts/seed-rule-fanqie.ts",
    config: {
      "list": {
        "enabled": true,
        "urlTemplate": "https://fq.taijiwang.top/api/search?key=%E5%89%91&tab_type=3&offset={offset:10}",
        "itemSelector": {
          "type": "json",
          "expression": "data.search_tabs[tab_type=3].data.book_data"
        },
        "fields": {
          "name": {
            "type": "json",
            "expression": "book_name"
          },
          "author": {
            "type": "json",
            "expression": "author"
          },
          "intro": {
            "type": "json",
            "expression": "abstract"
          },
          "category": {
            "type": "json",
            "expression": "category"
          },
          "cover": {
            "type": "json",
            "expression": "thumb_url"
          },
          "bookUrl": {
            "type": "json",
            "expression": "book_id",
            "replaceFrom": "^(\\d+)$",
            "replaceTo": "/api/detail?book_id=$1"
          }
        },
        "pagination": {
          "enabled": false,
          "maxPages": 1
        }
      },
      "book": {
        "enabled": true,
        "fields": {
          "name": {
            "type": "json",
            "expression": "data.data.book_name"
          },
          "author": {
            "type": "json",
            "expression": "data.data.author"
          },
          "category": {
            "type": "json",
            "expression": "data.data.category"
          },
          "keywords": {
            "type": "json",
            "expression": "data.data.tags"
          },
          "intro": {
            "type": "json",
            "expression": "data.data.abstract"
          },
          "cover": {
            "type": "json",
            "expression": "data.data.thumb_url"
          },
          "status": {
            "type": "json",
            "expression": "data.data.creation_status",
            "replaceFrom": "^0$",
            "replaceTo": "连载中"
          }
        }
      },
      "toc": {
        "enabled": true,
        "tocLink": {
          "type": "const",
          "expression": "/api/book?book_id={q.book_id}&bid={q.book_id}"
        },
        "itemSelector": {
          "type": "json",
          "expression": "data.data.chapterListWithVolume.*"
        },
        "fields": {
          "title": {
            "type": "json",
            "expression": "title"
          },
          "itemId": {
            "type": "json",
            "expression": "itemId"
          },
          "url": {
            "type": "const",
            "expression": "/api/content?tab=%E5%B0%8F%E8%AF%B4&item_id={itemId}&bid={q.book_id}"
          }
        },
        "pagination": {
          "enabled": false,
          "maxPages": 1
        }
      },
      "content": {
        "enabled": true,
        "fields": {
          "content": {
            "type": "json",
            "expression": "data.content"
          }
        },
        "pagination": {
          "enabled": false,
          "maxPages": 1
        }
      },
      "fetch": {
        "engine": "http",
        "uaMode": "custom",
        "customUa": "Mozilla/5.0 (Linux; Android 10; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/78.0.3904.108 Mobile Safari/537.36 SearchCraft/3.6.5 (Baidu; P1 9.0)",
        "headers": {
          "Accept": "application/json"
        },
        "autoCookie": true,
        "referer": true,
        "timeout": 20000,
        "retries": 2,
        "waitMs": 500,
        "hostGateLimit": 3
      },
      "clean": {
        "removeSelectors": [
          "script",
          "style",
          "iframe",
          "ins",
          "noscript"
        ],
        "adPatterns": [
          "(www\\.)?[a-z0-9-]+\\.(com|net|cc|org|info|top|xyz|vip|site)(\\/\\S*)?",
          "一秒记住.*?免费读",
          "请记住本书.*?域名"
        ],
        "whitelist": [
          "p",
          "br",
          "b",
          "strong",
          "em",
          "i",
          "u"
        ],
        "normalize": true,
        "plainText": true
      }
    },
  },
  {
    key: "hodei",
    name: "好读小说网(www.hodei.net)·直连SSR采集",
    description: "hodei.net 直连无防护 UTF-8 SSR 站。列表=分类页 #newscontent .l li(s2书名/s3最新章/s4作者/s1分类, {page} 分页 /xuanhuan/{page}.html) / 书籍页 h1+og:novel:* meta(作者/分类/状态/最新章)+.normal-intro-box 简介(跳过 AI 导读)+#fmimg 封面 / 目录=tocLink a.dir-link 独立页 /mulu/{id}.html dd>a, ?page=N 翻页(50章/页) / 正文 div#content 段落, \"下一章\"=下一章故翻页关闭。注意: 源站部分章节页正文为空(数据洞按失败标记), 多数老书单章仅约千字。",
    enabled: true,
    source: "scripts/seed-rule-hodei.ts",
    config: {
      "list": {
        "enabled": true,
        "urlTemplate": "https://www.hodei.net/xuanhuan/{page}.html",
        "itemSelector": {
          "type": "css",
          "expression": "#newscontent .l li"
        },
        "fields": {
          "name": {
            "type": "css",
            "expression": "span.s2 a",
            "attr": "text"
          },
          "bookUrl": {
            "type": "css",
            "expression": "span.s2 a",
            "attr": "href"
          },
          "latestChapter": {
            "type": "css",
            "expression": "span.s3 a",
            "attr": "text"
          },
          "author": {
            "type": "css",
            "expression": "span.s4 a",
            "attr": "text"
          },
          "category": {
            "type": "css",
            "expression": "span.s1",
            "attr": "text"
          }
        }
      },
      "book": {
        "enabled": true,
        "fields": {
          "name": {
            "type": "css",
            "expression": "h1",
            "attr": "text"
          },
          "author": {
            "type": "css",
            "expression": "meta[property='og:novel:author']",
            "attr": "content"
          },
          "category": {
            "type": "css",
            "expression": "meta[property='og:novel:category']",
            "attr": "content"
          },
          "status": {
            "type": "css",
            "expression": "meta[property='og:novel:status']",
            "attr": "content"
          },
          "latestChapter": {
            "type": "css",
            "expression": "meta[property='og:novel:latest_chapter_name']",
            "attr": "content"
          },
          "intro": {
            "type": "css",
            "expression": ".normal-intro-box .intro-content",
            "attr": "html"
          },
          "cover": {
            "type": "css",
            "expression": "#fmimg img",
            "attr": "src"
          }
        }
      },
      "toc": {
        "enabled": true,
        "tocLink": {
          "type": "css",
          "expression": "a.dir-link",
          "attr": "href"
        },
        "itemSelector": {
          "type": "css",
          "expression": "dd a"
        },
        "fields": {
          "title": {
            "type": "css",
            "expression": "a",
            "attr": "text"
          },
          "url": {
            "type": "css",
            "expression": "a",
            "attr": "href"
          }
        },
        "pagination": {
          "enabled": true,
          "maxPages": 100
        }
      },
      "content": {
        "enabled": true,
        "fields": {
          "content": {
            "type": "css",
            "expression": "#content",
            "attr": "html"
          }
        },
        "pagination": {
          "enabled": false,
          "maxPages": 1
        }
      },
      "fetch": {
        "engine": "http",
        "uaMode": "rotate",
        "autoCookie": true,
        "referer": true,
        "timeout": 20000,
        "retries": 2,
        "waitMs": 800,
        "browserFallbackStatus": [
          403,
          412,
          429,
          503
        ]
      },
      "clean": {
        "removeSelectors": [
          "script",
          "style",
          "iframe",
          "ins",
          "noscript",
          ".adsbygoogle"
        ],
        "adPatterns": [
          "(www\\.)?hodei\\.net\\S*",
          "本站内容来源于网络[^。<>]*",
          "本站所有小说[^<>]*",
          "请记住本站[^<>]*",
          "加入书签[^<>]*",
          "(www\\.)?[a-z0-9-]+\\.(com|net|cc|org|info|top|xyz|vip|site)(\\/\\S*)?",
          "本章未完.*?点击下一页继续阅读"
        ],
        "whitelist": [
          "p",
          "br",
          "b",
          "strong",
          "em",
          "i",
          "u",
          "h1",
          "h2",
          "h3",
          "h4",
          "h5",
          "h6"
        ],
        "normalize": true,
        "plainText": false
      }
    },
  },
  {
    key: "iidcr",
    name: "稻草人书屋 (iidcr.com)",
    description: "iidcr.com 稻草人书屋 Cloudflare+Apache(DedeCMS 系) UTF-8 传统多页站, 静态直采非 JS 壳。★UA 门禁站(yybsw 同款): 桌面 UA 深路径全 403, 钉 uaMode=custom 移动 Chrome UA 后三层全通(引擎 http)。列表=/nav/sublove-{page}.html(言情类每页10本×5页, sublove-1=love.html 页1别名实测; 其他8类改 sub{slug} 即可: subbl/subqihuan/subwuxia/subkehuan/subdushi/sublishi/subkongbu/sublight) div.b10 div.media(书名/bookUrl/简介/封面, 主列表无作者由 book 段补齐) / 书籍页 /book/p{id}/ 内嵌 h1.book-name+a[href*=/author/]+div.dark 状态原文+最新章+div.book-detail 简介 / 目录全量内嵌书籍页 #all-chapter div.item 无翻页锚(实测 1205 章单页不截断) / 正文 div#cont-body, 章节子页 {cid}_{n}.html 由顶部\"下一页\"按钮翻页(末页变\"下一章\"自然收敛); 每子页尾固定订阅推广语已入 adPatterns。旧域名 dcrbk.com 301 归一非镜像。",
    enabled: true,
    source: "scripts/seed-rule-iidcr.ts",
    config: {
      "list": {
        "enabled": true,
        "urlTemplate": "https://www.iidcr.com/nav/sublove-{page}.html",
        "itemSelector": {
          "type": "css",
          "expression": "div.b10 div.media"
        },
        "fields": {
          "name": {
            "type": "css",
            "expression": ".media-title h4 a",
            "attr": "text"
          },
          "bookUrl": {
            "type": "css",
            "expression": ".media-title h4 a",
            "attr": "href"
          },
          "intro": {
            "type": "css",
            "expression": ".media-info",
            "attr": "text"
          },
          "cover": {
            "type": "css",
            "expression": ".media-left img",
            "attr": "src"
          }
        },
        "pagination": {
          "enabled": false,
          "maxPages": 1
        }
      },
      "book": {
        "enabled": true,
        "fields": {
          "name": {
            "type": "css",
            "expression": "h1.book-name a",
            "attr": "text"
          },
          "author": {
            "type": "css",
            "expression": "a[href*=\"/author/\"]",
            "attr": "text"
          },
          "status": {
            "type": "css",
            "expression": "div.dark:contains(\"状态\")",
            "attr": "text",
            "replaceFrom": "^状态[:：]\\s*",
            "replaceTo": ""
          },
          "latestChapter": {
            "type": "css",
            "expression": "div.dark:contains(\"最近更新\") a",
            "attr": "text"
          },
          "intro": {
            "type": "css",
            "expression": "div.book-detail",
            "attr": "text"
          },
          "cover": {
            "type": "css",
            "expression": "div.media-left img",
            "attr": "src"
          }
        }
      },
      "toc": {
        "enabled": true,
        "itemSelector": {
          "type": "css",
          "expression": "#all-chapter div.item"
        },
        "fields": {
          "title": {
            "type": "css",
            "expression": "a",
            "attr": "text"
          },
          "url": {
            "type": "css",
            "expression": "a",
            "attr": "href"
          }
        },
        "pagination": {
          "enabled": false,
          "maxPages": 1
        }
      },
      "content": {
        "enabled": true,
        "fields": {
          "content": {
            "type": "css",
            "expression": "div#cont-body",
            "attr": "html"
          }
        },
        "pagination": {
          "enabled": true,
          "maxPages": 10
        }
      },
      "fetch": {
        "engine": "http",
        "uaMode": "custom",
        "customUa": "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36",
        "autoCookie": true,
        "referer": true,
        "timeout": 25000,
        "retries": 2,
        "waitMs": 800,
        "hostGateLimit": 3
      },
      "clean": {
        "removeSelectors": [
          "script",
          "style",
          "iframe",
          "ins",
          "noscript",
          ".adsbygoogle"
        ],
        "adPatterns": [
          "有能力者，请一定订阅[^<]*",
          "(www\\.)?iidcr\\.com\\S*",
          "(www\\.)?dcrbk\\.com\\S*",
          "稻草人书屋[^<>]*",
          "请记住本站[^<>]*",
          "本站所有小说[^<>]*",
          "(www\\.)?[a-z0-9-]+\\.(com|net|cc|org|info|top|xyz|vip|site)(\\/\\S*)?"
        ],
        "whitelist": [
          "p",
          "br",
          "b",
          "strong",
          "em",
          "i",
          "u",
          "h1",
          "h2",
          "h3",
          "h4",
          "h5",
          "h6"
        ],
        "normalize": true,
        "plainText": false
      }
    },
  },
  {
    key: "jpxs123",
    name: "精品小说(jpxs123.com)·繁体站直连采集",
    description: "",
    enabled: true,
    source: "scripts/seed-rule-jpxs123.ts",
    config: {
      "list": {
        "enabled": true,
        "urlTemplate": "https://jpxs123.com/",
        "itemSelector": {
          "type": "css",
          "expression": "div.bk"
        },
        "fields": {
          "title": {
            "type": "css",
            "expression": "h3",
            "attr": "text"
          },
          "bookUrl": {
            "type": "css",
            "expression": "a",
            "attr": "href"
          },
          "author": {
            "type": "css",
            "expression": ".booknews",
            "attr": "text",
            "replaceFrom": "作者[:：]\\s*|\\s*\\d{4}-\\d{2}-\\d{2}\\s*$",
            "replaceTo": ""
          },
          "intro": {
            "type": "css",
            "expression": "div.infos > p",
            "attr": "text",
            "replaceFrom": "^(简介|簡介)[:：]\\s*",
            "replaceTo": ""
          },
          "cover": {
            "type": "css",
            "expression": "img",
            "attr": "src"
          }
        },
        "pagination": {
          "enabled": false,
          "maxPages": 1
        }
      },
      "book": {
        "enabled": true,
        "fields": {
          "name": {
            "type": "css",
            "expression": "h1",
            "attr": "text",
            "replaceFrom": "\\s*[(（](全本|完本|連載中|\\d{1,5}-\\d{1,5})[)）]\\s*$",
            "replaceTo": ""
          },
          "status": {
            "type": "css",
            "expression": "h1",
            "attr": "text"
          },
          "author": {
            "type": "css",
            "expression": "a[href*=\"/author/\"]",
            "attr": "text"
          },
          "cover": {
            "type": "css",
            "expression": ".book_info img",
            "attr": "src"
          },
          "intro": {
            "type": "css",
            "expression": "meta[name=\"description\"]",
            "attr": "content"
          }
        },
        "pagination": {
          "enabled": false,
          "maxPages": 1
        }
      },
      "toc": {
        "enabled": true,
        "itemSelector": {
          "type": "regex",
          "expression": "<a href=\"[^\"]*/\\d{1,6}\\.html\">\\s*第\\d+节\\s*</a>",
          "attr": "0",
          "flags": "gi"
        },
        "fields": {
          "title": {
            "type": "regex",
            "expression": "<a href=\"[^\"]*\">\\s*(第\\d+节)\\s*</a>",
            "attr": "1",
            "flags": "gi"
          },
          "url": {
            "type": "regex",
            "expression": "href=\"([^\"]*/\\d{1,6}\\.html)\"",
            "attr": "1",
            "flags": "gi"
          }
        },
        "pagination": {
          "enabled": false,
          "maxPages": 1
        }
      },
      "content": {
        "enabled": true,
        "fields": {
          "content": {
            "type": "css",
            "expression": "div.read_chapterDetail",
            "attr": "html"
          },
          "title": {
            "type": "css",
            "expression": ".read_chapterName h1",
            "attr": "text"
          }
        },
        "pagination": {
          "enabled": false,
          "maxPages": 1
        }
      },
      "fetch": {
        "engine": "http",
        "uaMode": "rotate",
        "autoCookie": true,
        "referer": true,
        "timeout": 20000,
        "retries": 2,
        "waitMs": 500,
        "browserFallbackStatus": [
          403,
          412,
          429,
          503
        ]
      },
      "clean": {
        "removeSelectors": [
          "script",
          "style",
          "iframe",
          "ins",
          "noscript"
        ],
        "adPatterns": [
          "jpxs123\\.com\\S*",
          "(请|請)记住本书.*?(首发|首發)",
          "最新章节请到.*?查看",
          "本站最新网址.*?$"
        ],
        "whitelist": [
          "p",
          "br",
          "b",
          "strong",
          "em",
          "i",
          "u",
          "h1",
          "h2",
          "h3"
        ],
        "normalize": true
      }
    },
  },
  {
    key: "kanunu8",
    name: "努努书坊(www.kanunu8.com)·中文综合书坊采集",
    description: "kanunu8.com 努努书坊, 直连无防护 GBK 站(引擎自动 gb18030 解码)。13 频道, 主用华文小说 29-{page}.html(约3460本, 页脚标10页实测有效至28页), 8-/6-/11-、/wuxia/ 裸数字、/tuili/list- 等换模板即用。列表=正则白名单 /(bookN|tuili|101)/ target=_blank 只收书籍页链, 剔除 /zt/ 专题与 /files|/wuxia/ 单文件文章页(不可采); 「作者：书名」前缀剥离+author 兜底。书籍页三代兼容: 一代 .catalog(h1+.info+.intro) / 二代 book_2015 表格(td.p10-24:contains(内容简介)) / 三代单文件列表已剔; 无封面/分类/状态留空。目录=内嵌相对链 \\d{4,8}.html, 文档序即阅读序。正文三容器 #neirong/td[width=820]/#Article .text; 长章不拆页 → 翻页关闭。残留: 敏感词(Rx房)烙于正文; &nbsp; 由 cleaner 处置; 分卷名不采。",
    enabled: true,
    source: "scripts/seed-rule-kanunu8.ts",
    config: {
      "list": {
        "enabled": true,
        "urlTemplate": "https://www.kanunu8.com/files/chinese/29-{page}.html",
        "itemSelector": {
          "type": "regex",
          "expression": "<a\\s+href=[\"']/(?:book\\d*|tuili|101)/[^\"']*[\"']\\s+target=[\"']_blank[\"']\\s*>[^<]{1,100}</a>",
          "attr": "0",
          "flags": "gi"
        },
        "fields": {
          "name": {
            "type": "regex",
            "expression": ">([^<]{1,100})</a>",
            "attr": "1",
            "flags": "gi",
            "replaceFrom": "^[^<>：:]{1,25}[：:]\\s*",
            "replaceTo": ""
          },
          "author": {
            "type": "regex",
            "expression": ">\\s*([^<>：:]{1,25})[：:]",
            "attr": "1",
            "flags": "gi"
          },
          "bookUrl": {
            "type": "regex",
            "expression": "href=[\"']([^\"']+)[\"']",
            "attr": "1",
            "flags": "gi"
          }
        },
        "pagination": {
          "enabled": false,
          "maxPages": 1
        }
      },
      "book": {
        "enabled": true,
        "fields": {
          "name": {
            "type": "css",
            "expression": "h1",
            "attr": "text"
          },
          "author": {
            "type": "regex",
            "expression": "作者[:：]\\s*([^\\s<]{1,30})",
            "attr": "1",
            "flags": "gs"
          },
          "intro": {
            "type": "css",
            "expression": ".intro, td.p10-24:contains(\"内容简介\")",
            "attr": "html",
            "replaceFrom": "^(?:<(?:strong|b)>\\s*)?内容简介[:：]?\\s*(?:</(?:strong|b)>)?\\s*(?:<br\\s*/?>\\s*)?",
            "replaceTo": ""
          }
        }
      },
      "toc": {
        "enabled": true,
        "itemSelector": {
          "type": "regex",
          "expression": "<a\\s+href=[\"']\\d{4,8}\\.html[\"']\\s*[^>]*>[^<]{1,120}</a>",
          "attr": "0",
          "flags": "gi"
        },
        "fields": {
          "title": {
            "type": "regex",
            "expression": "<a\\s+href=[\"']\\d{4,8}\\.html[\"'][^>]*>([^<]{1,120})</a>",
            "attr": "1",
            "flags": "gi"
          },
          "url": {
            "type": "regex",
            "expression": "href=[\"'](\\d{4,8}\\.html)[\"']",
            "attr": "1",
            "flags": "gi"
          }
        },
        "pagination": {
          "enabled": false,
          "maxPages": 1
        }
      },
      "content": {
        "enabled": true,
        "fields": {
          "content": {
            "type": "css",
            "expression": "#neirong, td[width=\"820\"], #Article .text",
            "attr": "html"
          }
        },
        "pagination": {
          "enabled": false,
          "maxPages": 1
        }
      },
      "fetch": {
        "engine": "http",
        "uaMode": "rotate",
        "autoCookie": true,
        "referer": true,
        "timeout": 25000,
        "retries": 2,
        "waitMs": 800,
        "browserFallbackStatus": [
          403,
          412,
          429,
          503
        ]
      },
      "clean": {
        "removeSelectors": [
          "script",
          "style",
          "iframe",
          "ins",
          "noscript",
          ".adsbygoogle",
          "p[align=\"center\"]"
        ],
        "adPatterns": [
          "(www\\.)?kanunu8\\.com\\S*",
          "本站内容来源于网络[^。<>]*",
          "本站作品收集整理自网络[^<>]*",
          "请记住本站[^<>]*",
          "(www\\.)?[a-z0-9-]+\\.(com|net|cc|org|info|top|xyz|vip|site)(\\/\\S*)?",
          "本章未完.*?点击下一页继续阅读",
          "上一页\\s*回目录\\s*下一页"
        ],
        "whitelist": [
          "p",
          "br",
          "b",
          "strong",
          "em",
          "i",
          "u",
          "h1",
          "h2",
          "h3",
          "h4",
          "h5",
          "h6"
        ],
        "normalize": true,
        "plainText": false
      }
    },
  },
  {
    key: "moli",
    name: "茉莉小说(www.molixs.com)·17mbCMS GBK采集",
    description: "molixs.com 茉莉小说(17mbCMS 女频站) GBK 直连无防护, 编码由 <meta charset=gbk> 提供给引擎 gb18030 解码。列表=分类真分页页 /{cat}_{page}.html 的 .listcon li(30本/页; 8 类 xiaoyuan/guyan/chuangyue/danmei/xianyan/tianchong/meiwen/qita, 排行榜 /paihang/{type}_{page}.html 12 榜同构) / 书籍页 /{cat}_{id}/ og:novel:* meta 全套+div.articleinfo p.p3 简介 / 目录内嵌书籍页 div.chapterlist ul li a 全量单页 / 正文 #content 单 <p> 内 <br /> 三连分隔, clean.plainText 按行归一为 \\n\\n 段落(零连续空行)。章节页仅上一章/下一章, content 翻页关闭。",
    enabled: true,
    source: "scripts/seed-rule-moli.ts",
    config: {
      "list": {
        "enabled": true,
        "urlTemplate": "https://www.molixs.com/guyan_{page}.html",
        "itemSelector": {
          "type": "css",
          "expression": "div.articlelist .listcon li"
        },
        "fields": {
          "name": {
            "type": "css",
            "expression": "p.articlename a",
            "attr": "text"
          },
          "bookUrl": {
            "type": "css",
            "expression": "p.articlename a",
            "attr": "href"
          },
          "author": {
            "type": "css",
            "expression": "p.p2 span a",
            "attr": "text"
          },
          "intro": {
            "type": "css",
            "expression": "p.p3",
            "attr": "text"
          },
          "cover": {
            "type": "css",
            "expression": "div.l2 img",
            "attr": "data-original"
          }
        },
        "pagination": {
          "enabled": false,
          "maxPages": 1
        }
      },
      "book": {
        "enabled": true,
        "fields": {
          "name": {
            "type": "css",
            "expression": "meta[property='og:novel:book_name']",
            "attr": "content"
          },
          "author": {
            "type": "css",
            "expression": "meta[property='og:novel:author']",
            "attr": "content"
          },
          "category": {
            "type": "css",
            "expression": "meta[property='og:novel:category']",
            "attr": "content"
          },
          "status": {
            "type": "css",
            "expression": "meta[property='og:novel:status']",
            "attr": "content"
          },
          "latestChapter": {
            "type": "css",
            "expression": "meta[property='og:novel:lastest_chapter_name']",
            "attr": "content"
          },
          "intro": {
            "type": "css",
            "expression": "div.articleinfo p.p3",
            "attr": "text"
          },
          "cover": {
            "type": "css",
            "expression": "meta[property='og:image']",
            "attr": "content"
          }
        }
      },
      "toc": {
        "enabled": true,
        "itemSelector": {
          "type": "css",
          "expression": "div.chapterlist ul li"
        },
        "fields": {
          "title": {
            "type": "css",
            "expression": "a",
            "attr": "text"
          },
          "url": {
            "type": "css",
            "expression": "a",
            "attr": "href"
          }
        },
        "pagination": {
          "enabled": false,
          "maxPages": 1
        }
      },
      "content": {
        "enabled": true,
        "fields": {
          "content": {
            "type": "css",
            "expression": "#content",
            "attr": "html"
          }
        },
        "pagination": {
          "enabled": false,
          "maxPages": 1
        }
      },
      "fetch": {
        "engine": "http",
        "uaMode": "rotate",
        "autoCookie": true,
        "referer": true,
        "timeout": 20000,
        "retries": 2,
        "waitMs": 800,
        "browserFallbackStatus": [
          403,
          412,
          429,
          503
        ],
        "hostGateLimit": 3
      },
      "clean": {
        "removeSelectors": [
          "script",
          "style",
          "iframe",
          "ins",
          "noscript",
          ".adsbygoogle"
        ],
        "adPatterns": [
          "(www\\.)?molixs\\.com\\S*",
          "茉莉小说[^<>]*",
          "本站所有小说为转载作品[^。<>]*",
          "(www\\.)?[a-z0-9-]+\\.(com|net|cc|org|info|top|xyz|vip|site)(\\/\\S*)?",
          "本章未完.*?点击下一页继续阅读"
        ],
        "whitelist": [
          "p",
          "br",
          "b",
          "strong",
          "em",
          "i",
          "u",
          "h1",
          "h2",
          "h3",
          "h4",
          "h5",
          "h6"
        ],
        "normalize": true,
        "plainText": true
      }
    },
  },
  {
    key: "piaotia",
    name: "飘天文学(www.piaotia.com)·直连GBK采集",
    description: "piaotia.com 直连无防护 GBK 老式 XHTML 站(fetcher 按 meta charset 自动解码)。列表=分类表格 table.grid tr(booksort1~9 /0/{page}.html, td1 书名/td2 最新章/td3 作者/td6 状态; 首字母检索行 articlelist.php 链接置空剔除) / 书籍页 h1+表格 td regex(类别/作者/文章状态, &nbsp; 实体兼容)+内容简介 regex+封面 / 目录=tocLink a:contains(查看全部章节) 独立页 /html/{s}/{id}/index.html li>a 相对链全量单页 / 正文 regex 截 toplink→bottomlink(body 级裸文本无容器), 翻页关闭。源站正文末尾孤立 \">\" 已由 adPatterns 剥除。",
    enabled: true,
    source: "scripts/seed-rule-piaotia.ts",
    config: {
      "list": {
        "enabled": true,
        "urlTemplate": "https://www.piaotia.com/booksort1/0/{page}.html",
        "itemSelector": {
          "type": "css",
          "expression": "table.grid tr"
        },
        "fields": {
          "name": {
            "type": "regex",
            "expression": "<td class=\"odd\"><a href=\"[^\"]*bookinfo/\\d+/\\d+\\.html\"[^>]*>\\s*([^<]+)</a>",
            "attr": "1"
          },
          "bookUrl": {
            "type": "regex",
            "expression": "href=\"([^\"]*bookinfo/\\d+/\\d+\\.html)\"",
            "attr": "1"
          },
          "latestChapter": {
            "type": "regex",
            "expression": "<td class=\"even\"><a href=\"[^\"]*\"[^>]*>\\s*([^<]+)</a>",
            "attr": "1",
            "replaceFrom": "^\\s+",
            "replaceTo": ""
          },
          "author": {
            "type": "regex",
            "expression": "<td class=\"odd\">([^<]+)</td>",
            "attr": "1"
          },
          "status": {
            "type": "regex",
            "expression": "<td class=\"even\" align=\"center\">([^<]+)</td>",
            "attr": "1"
          }
        }
      },
      "book": {
        "enabled": true,
        "fields": {
          "name": {
            "type": "css",
            "expression": "h1",
            "attr": "text"
          },
          "category": {
            "type": "regex",
            "expression": "类(?:&nbsp;|\\s)*别[：:]\\s*([^&<\\s]{1,12})",
            "attr": "1",
            "flags": "i"
          },
          "author": {
            "type": "regex",
            "expression": "作(?:&nbsp;|\\s)*者[：:]\\s*([^&<\\s]{1,30})",
            "attr": "1",
            "flags": "i"
          },
          "status": {
            "type": "regex",
            "expression": "文章状态[：:]\\s*([^&<\\s]{1,10})",
            "attr": "1",
            "flags": "i"
          },
          "latestChapter": {
            "type": "regex",
            "expression": "最新章节：</span><a href=\"[^\"]*\"[^>]*>([^<]+)</a>",
            "attr": "1",
            "flags": "i"
          },
          "intro": {
            "type": "regex",
            "expression": "内容简介：</span>(?:\\s|<br\\s*/?>)*([\\s\\S]*?)<br\\s*/?>\\s*<br",
            "attr": "1",
            "flags": "i"
          },
          "cover": {
            "type": "css",
            "expression": "img[src*=\"files/article/image\"]",
            "attr": "src"
          }
        }
      },
      "toc": {
        "enabled": true,
        "tocLink": {
          "type": "css",
          "expression": "a:contains(\"查看全部章节\")",
          "attr": "href"
        },
        "itemSelector": {
          "type": "css",
          "expression": "li"
        },
        "fields": {
          "title": {
            "type": "css",
            "expression": "a",
            "attr": "text"
          },
          "url": {
            "type": "css",
            "expression": "a",
            "attr": "href"
          }
        },
        "pagination": {
          "enabled": false,
          "maxPages": 1
        }
      },
      "content": {
        "enabled": true,
        "fields": {
          "content": {
            "type": "regex",
            "expression": "<div class=\"toplink\">[\\s\\S]*?</div>([\\s\\S]*?)<div class=\"bottomlink\">",
            "attr": "1",
            "flags": "i"
          }
        },
        "pagination": {
          "enabled": false,
          "maxPages": 1
        }
      },
      "fetch": {
        "engine": "http",
        "uaMode": "rotate",
        "autoCookie": true,
        "referer": true,
        "timeout": 20000,
        "retries": 2,
        "waitMs": 800,
        "browserFallbackStatus": [
          403,
          412,
          429,
          503
        ]
      },
      "clean": {
        "removeSelectors": [
          "script",
          "style",
          "iframe",
          "ins",
          "noscript",
          ".adsbygoogle"
        ],
        "adPatterns": [
          "(www\\.)?piaotia\\.com\\S*",
          "飘天文学[^。<>]*",
          "PT文学网?[^。<>]*",
          "本站只为书友提供阅读平台[^<>]*",
          "^>\\s*$",
          "(www\\.)?[a-z0-9-]+\\.(com|net|cc|org|info|top|xyz|vip|site)(\\/\\S*)?",
          "本章未完.*?点击下一页继续阅读"
        ],
        "whitelist": [
          "p",
          "br",
          "b",
          "strong",
          "em",
          "i",
          "u",
          "h1",
          "h2",
          "h3",
          "h4",
          "h5",
          "h6"
        ],
        "normalize": true,
        "plainText": false
      }
    },
  },
  {
    key: "pilishuwu",
    name: "霹雳书屋(www.pilishuwu.com)·CF防护隐身采集",
    description: "[R10-b实测修正] www.pilishuwu.com Cloudflare 防护站(wmcms-web模板, 裸HTTP 403)。engine=auto + browserFallbackStatus[403,412,429,503] 自动升级 Obscura 求解挑战, uaMode=desktop 保持同站UA指纹一致。实测结构: 列表=/0/list/0_0_0_0_0_0_0_{page}.html(旧版 /sort/* 与 /list/{page}.html 分页均无效, P2起0项) li.ret-search-item(h3.ret-works-title a 书名/书链, p.ret-works-author 剥\"作者：\"前缀, p.ret-works-tags a 剥\"分类：\"前缀, p.ret-works-decs 简介, 封面图) / 书籍=/bookId/info.html(h2.works-intro-title strong + a.works-author-name + label.works-intro-status 完结直判 + a.works-ft-new 最新章 + p.works-intro-short 简介<br>转行 + div.works-cover img; 无分类字段由列表段补) / 目录=tocLink a[href*=menu] → /menu/1.html 单页全量 span.works-chapter-item>a 正序 / 正文=/read/{cid}.html div.j_readContent 纯p段落单页。",
    enabled: true,
    source: "scripts/seed-rule-pilishuwu.ts",
    config: {
      "list": {
        "enabled": true,
        "urlTemplate": "https://www.pilishuwu.com/0/list/0_0_0_0_0_0_0_{page}.html",
        "itemSelector": {
          "type": "css",
          "expression": "li.ret-search-item"
        },
        "fields": {
          "name": {
            "type": "css",
            "expression": "h3.ret-works-title a",
            "attr": "text"
          },
          "bookUrl": {
            "type": "css",
            "expression": "h3.ret-works-title a",
            "attr": "href"
          },
          "author": {
            "type": "css",
            "expression": "p.ret-works-author",
            "attr": "text",
            "replaceFrom": "作者[：:]\\s*",
            "replaceTo": ""
          },
          "category": {
            "type": "css",
            "expression": "p.ret-works-tags a",
            "attr": "text",
            "replaceFrom": "分类[：:]\\s*",
            "replaceTo": ""
          },
          "intro": {
            "type": "css",
            "expression": "p.ret-works-decs",
            "attr": "text"
          },
          "cover": {
            "type": "css",
            "expression": "a.mod-cover-list-thumb img",
            "attr": "src"
          },
          "latestChapter": {
            "type": "css",
            "expression": "span.mod-cover-list-text",
            "attr": "text"
          }
        },
        "pagination": {
          "enabled": true,
          "maxPages": 20
        }
      },
      "book": {
        "enabled": true,
        "fields": {
          "name": {
            "type": "css",
            "expression": "h2.works-intro-title strong",
            "attr": "text"
          },
          "author": {
            "type": "css",
            "expression": "a.works-author-name",
            "attr": "text"
          },
          "status": {
            "type": "css",
            "expression": "label.works-intro-status",
            "attr": "text"
          },
          "latestChapter": {
            "type": "css",
            "expression": "a.works-ft-new",
            "attr": "text"
          },
          "intro": {
            "type": "css",
            "expression": "p.works-intro-short",
            "attr": "html"
          },
          "cover": {
            "type": "css",
            "expression": "div.works-cover img",
            "attr": "src"
          }
        }
      },
      "toc": {
        "enabled": true,
        "tocLink": {
          "type": "css",
          "expression": "a[href*='/menu/']",
          "attr": "href"
        },
        "itemSelector": {
          "type": "css",
          "expression": "span.works-chapter-item"
        },
        "fields": {
          "title": {
            "type": "css",
            "expression": "a",
            "attr": "text"
          },
          "url": {
            "type": "css",
            "expression": "a",
            "attr": "href"
          }
        },
        "pagination": {
          "enabled": true,
          "maxPages": 10
        }
      },
      "content": {
        "enabled": true,
        "fields": {
          "title": {
            "type": "css",
            "expression": "h3.j_chapterName",
            "attr": "text"
          },
          "content": {
            "type": "css",
            "expression": "div.j_readContent",
            "attr": "html"
          }
        },
        "pagination": {
          "enabled": false,
          "maxPages": 1
        }
      },
      "fetch": {
        "engine": "auto",
        "uaMode": "desktop",
        "autoCookie": true,
        "referer": true,
        "timeout": 25000,
        "retries": 2,
        "waitMs": 1200,
        "browserFallbackStatus": [
          403,
          412,
          429,
          503
        ],
        "hostGateLimit": 2,
        "proxyRotationStrategy": "round-robin"
      },
      "clean": {
        "removeSelectors": [
          "script",
          "style",
          "iframe",
          "ins",
          "noscript",
          ".adsbygoogle",
          ".ad",
          "#ad",
          ".ads"
        ],
        "adPatterns": [
          "(www\\.)?pilishuwu\\.com\\S*",
          "霹雳书屋[^<>]*",
          "请记住本书.*?域名",
          "最新章节请到.*?查看",
          "一秒记住.*?免费读",
          "(www\\.)?[a-z0-9-]+\\.(com|net|cc|org|info|top|xyz|vip|site)(\\/\\S*)?"
        ],
        "whitelist": [
          "p",
          "br",
          "b",
          "strong",
          "em",
          "i",
          "u",
          "h1",
          "h2",
          "h3",
          "h4",
          "h5",
          "h6"
        ],
        "normalize": true,
        "plainText": false
      }
    },
  },
  {
    key: "qidian",
    name: "起点中文(镜像API full.hnxianxin.cn)·Legado书源转换",
    description: "起点中文经镜像 API full.hnxianxin.cn/qd(Legado 书源「小雨的世界·起点中文」转换)。发现=ranking.php 榜单(男生站 site_id=11 人气最高; 女生/出版改 site_id=12/4, 榜单/分类/状态/字数/付费/标签筛选参数见 ranking.php?action=config),书籍=detail.php, 目录=catalog.php(C 载荷 b64 签名), 正文经外置代理 mini-services/qidian-proxy:3017(目录索引→解码→签名 content.php)。\n⚠ 正文需起点小程序凭证: 设 mini-services/qidian-proxy 环境变量 QD_YWKEY/QD_YWGUID 后重启代理(书源自订凭证机制同源; 未配置时三段发现/目录照常, 正文为空且 /health.credentialsConfigured=false 可诊)。\n⚠ 2026-09-14 R21 复测: 镜像 full.hnxianxin.cn TLS 证书已过期(TLS alert 557)+绕过校验后端点 404 —— 镜像目标失效, 四段暂 SKIP; 待书源换新镜像后在管理端更新 urlTemplate 后复验。\ntoc url 直指代理 + fetch.contentProxyUrl=…?url={url} 为 SSRF loopback 豁免键(degrade-native 契约, 缺失则章节抓取被 SSRF 全拒); 卷行以 Vo 标记在规则侧清空 URL 过滤。",
    enabled: true,
    source: "scripts/seed-rule-qidian.ts",
    config: {
      "list": {
        "enabled": true,
        "urlTemplate": "https://full.hnxianxin.cn/qd/ranking.php?action=ranking&site_id=11&order=11&page={page}&page_size=20&category_id=0",
        "itemSelector": {
          "type": "json",
          "expression": "Data.Books"
        },
        "fields": {
          "bookId": {
            "type": "json",
            "expression": "BookId"
          },
          "name": {
            "type": "json",
            "expression": "BookName"
          },
          "author": {
            "type": "json",
            "expression": "AuthorName"
          },
          "intro": {
            "type": "json",
            "expression": "Description"
          },
          "category": {
            "type": "json",
            "expression": "CategoryName"
          },
          "bookUrl": {
            "type": "const",
            "expression": "https://full.hnxianxin.cn/qd/detail.php?bookId={bookId}"
          }
        },
        "pagination": {
          "enabled": false,
          "maxPages": 1
        }
      },
      "book": {
        "enabled": true,
        "fields": {
          "name": {
            "type": "json",
            "expression": "Data.BaseBookInfo.BookName"
          },
          "author": {
            "type": "json",
            "expression": "Data.AuthorInfo.Author"
          },
          "category": {
            "type": "json",
            "expression": "Data.BaseBookInfo.CategoryName"
          },
          "intro": {
            "type": "json",
            "expression": "Data.BaseBookInfo.Description"
          },
          "status": {
            "type": "json",
            "expression": "Data.BaseBookInfo.BookStatus"
          },
          "latestChapter": {
            "type": "json",
            "expression": "Data.BaseBookInfo.ChapterInfo.LastVipUpdateChapterName"
          },
          "cover": {
            "type": "const",
            "expression": "https://bookcover.yuewen.com/qdbimg/349573/{q.bookId}/180"
          }
        }
      },
      "toc": {
        "enabled": true,
        "tocLink": {
          "type": "const",
          "expression": "https://full.hnxianxin.cn/qd/catalog.php?bookId={q.bookId}"
        },
        "itemSelector": {
          "type": "json",
          "expression": "data"
        },
        "fields": {
          "title": {
            "type": "json",
            "expression": "N"
          },
          "Vo": {
            "type": "json",
            "expression": "Vo"
          },
          "url": {
            "type": "const",
            "expression": "http://127.0.0.1:3017/chapter?bookId={q.bookId}&index={index}&Vo={Vo}",
            "replaceFrom": "^.*&Vo=true$",
            "replaceTo": ""
          }
        },
        "pagination": {
          "enabled": false,
          "maxPages": 1
        }
      },
      "content": {
        "enabled": true,
        "fields": {
          "content": {
            "type": "json",
            "expression": "content"
          }
        },
        "pagination": {
          "enabled": false,
          "maxPages": 1
        }
      },
      "fetch": {
        "engine": "http",
        "uaMode": "custom",
        "customUa": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "headers": {
          "Accept": "application/json,text/plain;q=0.9,*/*;q=0.8"
        },
        "autoCookie": false,
        "referer": true,
        "timeout": 20000,
        "retries": 2,
        "waitMs": 300,
        "hostGateLimit": 2,
        "contentProxyUrl": "http://127.0.0.1:3017/chapter?url={url}"
      },
      "clean": {
        "removeSelectors": [
          "script",
          "style",
          "iframe",
          "ins",
          "noscript"
        ],
        "whitelist": [
          "p",
          "br",
          "b",
          "strong",
          "em",
          "i",
          "u",
          "h1",
          "h2",
          "h3"
        ],
        "normalize": true,
        "plainText": true
      }
    },
  },
  {
    key: "qimao",
    name: "七猫官方API (wtzw.com)·Legado7698·签名代理",
    description: "七猫官方API(api-bc/api-ks.wtzw.com)四层JSON采集: rank发现页/detail/toc/content。结构依据 Legado 书源 yckceo 7698.json「⭐七猫[官方]v3.1✨」反译并真网实测。⚠ 依赖本机签名代理 mini-services/qimao-proxy(端口3013, MD5双签名+正文AES-128-CBC解密, key=242ccb8230d709e1): 上游全端点强制逐请求验签, 声明式规则无法表达 → 六段指向代理(引擎 json/const 型)。list=leader-board大热榜男频50本(上游忽略page分页禁用, /search 通道留代理); 出版书(source非空)正文为EPUB如实报错。代理启动: cd mini-services/qimao-proxy && bun run start; /health 自检 selfTestOk/apiReachable。",
    enabled: true,
    source: "scripts/seed-rule-qimao.ts",
    config: {
      "list": {
        "enabled": true,
        "urlTemplate": "http://127.0.0.1:3013/rank?rank_type=hot_list&tab_type=1",
        "itemSelector": {
          "type": "json",
          "expression": "books"
        },
        "fields": {
          "name": {
            "type": "json",
            "expression": "name"
          },
          "author": {
            "type": "json",
            "expression": "author"
          },
          "intro": {
            "type": "json",
            "expression": "intro"
          },
          "category": {
            "type": "json",
            "expression": "category"
          },
          "cover": {
            "type": "json",
            "expression": "cover"
          },
          "status": {
            "type": "json",
            "expression": "status"
          },
          "id": {
            "type": "json",
            "expression": "id"
          },
          "bookUrl": {
            "type": "const",
            "expression": "/detail?bid={id}"
          }
        },
        "pagination": {
          "enabled": false,
          "maxPages": 1
        }
      },
      "book": {
        "enabled": true,
        "fields": {
          "name": {
            "type": "json",
            "expression": "book.name"
          },
          "author": {
            "type": "json",
            "expression": "book.author"
          },
          "category": {
            "type": "json",
            "expression": "book.category"
          },
          "keywords": {
            "type": "json",
            "expression": "book.keywords"
          },
          "intro": {
            "type": "json",
            "expression": "book.intro"
          },
          "cover": {
            "type": "json",
            "expression": "book.cover"
          },
          "status": {
            "type": "json",
            "expression": "book.status"
          },
          "latestChapter": {
            "type": "json",
            "expression": "book.latestChapter"
          }
        }
      },
      "toc": {
        "enabled": true,
        "tocLink": {
          "type": "const",
          "expression": "/toc?bid={q.bid}"
        },
        "itemSelector": {
          "type": "json",
          "expression": "chapters"
        },
        "fields": {
          "title": {
            "type": "json",
            "expression": "title"
          },
          "cid": {
            "type": "json",
            "expression": "cid"
          },
          "url": {
            "type": "const",
            "expression": "/content?bid={q.bid}&cid={cid}"
          }
        },
        "pagination": {
          "enabled": false,
          "maxPages": 1
        }
      },
      "content": {
        "enabled": true,
        "fields": {
          "content": {
            "type": "json",
            "expression": "content"
          }
        },
        "pagination": {
          "enabled": false,
          "maxPages": 1
        }
      },
      "fetch": {
        "engine": "http",
        "allowLoopback": true,
        "uaMode": "custom",
        "customUa": "okhttp/3.12.0",
        "headers": {
          "Accept": "application/json"
        },
        "autoCookie": false,
        "referer": false,
        "timeout": 30000,
        "retries": 1,
        "waitMs": 200,
        "hostGateLimit": 2
      },
      "clean": {
        "removeSelectors": [
          "script",
          "style",
          "iframe",
          "ins",
          "noscript"
        ],
        "adPatterns": [],
        "whitelist": [
          "p",
          "br",
          "b",
          "strong",
          "em",
          "i",
          "u"
        ],
        "normalize": true,
        "plainText": true
      }
    },
  },
  {
    key: "ratelimit-demo",
    name: "模拟源站·校准演示 (127.0.0.1:3040)",
    description: "极限校准演示规则(zz-a 校准系统实战, ab-a): 四段指向本机模拟源站 scripts/ratelimit-site.ts(127.0.0.1:3040, standard 档 60req/60s 窗+2s 突发窗 6+429×5→临时封60s)。HTML 四段 css 型选择器: list=/list/{page}(8本) / book=#maininfo / toc=#toc dd(60章) / content=#content。用途: calibrate-all 全量校准 + 校准参数落库后真实采集任务端到端验证。⚠ 源站仅本地 3040 常驻, 生产环境无此站。",
    enabled: true,
    source: "scripts/seed-rule-ratelimit-demo.ts",
    config: {
      "list": {
        "enabled": true,
        "urlTemplate": "http://127.0.0.1:3040/list/{page}",
        "itemSelector": {
          "type": "css",
          "expression": "ul#list li.book-item"
        },
        "fields": {
          "name": {
            "type": "css",
            "expression": "a",
            "attr": "text"
          },
          "author": {
            "type": "css",
            "expression": "span",
            "attr": "text"
          },
          "bookUrl": {
            "type": "css",
            "expression": "a",
            "attr": "href"
          }
        },
        "pagination": {
          "enabled": false,
          "maxPages": 1
        }
      },
      "book": {
        "enabled": true,
        "fields": {
          "name": {
            "type": "css",
            "expression": "#maininfo h1",
            "attr": "text"
          },
          "author": {
            "type": "css",
            "expression": "#maininfo p:nth-of-type(1)",
            "attr": "text",
            "replaceFrom": "^作者：",
            "replaceTo": ""
          },
          "category": {
            "type": "css",
            "expression": "#maininfo p:nth-of-type(2)",
            "attr": "text",
            "replaceFrom": "^分类：",
            "replaceTo": ""
          },
          "keywords": {
            "type": "css",
            "expression": "meta[name=\"keywords\"]",
            "attr": "content"
          },
          "intro": {
            "type": "css",
            "expression": "#intro",
            "attr": "text"
          }
        }
      },
      "toc": {
        "enabled": true,
        "tocLink": {
          "type": "css",
          "expression": "a#toclink",
          "attr": "href"
        },
        "itemSelector": {
          "type": "css",
          "expression": "dl#toc dd"
        },
        "fields": {
          "title": {
            "type": "css",
            "expression": "a",
            "attr": "text"
          },
          "url": {
            "type": "css",
            "expression": "a",
            "attr": "href"
          }
        },
        "pagination": {
          "enabled": false,
          "maxPages": 1
        }
      },
      "content": {
        "enabled": true,
        "fields": {
          "content": {
            "type": "css",
            "expression": "div#content",
            "attr": "html"
          }
        },
        "pagination": {
          "enabled": false,
          "maxPages": 1
        }
      },
      "fetch": {
        "engine": "http",
        "allowLoopback": true,
        "uaMode": "rotate",
        "autoCookie": true,
        "referer": true,
        "timeout": 20000,
        "retries": 2,
        "waitMs": 500,
        "hostGateLimit": 3
      },
      "clean": {
        "removeSelectors": [
          "script",
          "style",
          "iframe",
          "ins",
          "noscript"
        ],
        "adPatterns": [],
        "whitelist": [
          "p",
          "br",
          "b",
          "strong",
          "em",
          "i",
          "u",
          "h2"
        ],
        "normalize": true,
        "plainText": true
      }
    },
  },
  {
    key: "shoujixs",
    name: "手机小说(shoujixs.net)·杰奇WAP模板GBK站采集",
    description: "www.shoujixs.net 手机小说(杰奇 WAP 模板系, R52-a 2026-09-21 实测)。纯静态 SSR, ★GBK 编码(meta 与实际字节一致; 引擎 fetcher 自动升级 gb18030 解码), https, 无反爬直连 200。URL 形态: 列表 /{分类缩写}_{page}.html(如 /xhqh_1.html) | 书籍 /shoujixs_{数字id}/ (亦兼容 mode=bookIds 模板 /shoujixs_{bookId}/) | 章节 /shoujixs_{书id}_{章id}.html。目录: 书籍页内嵌 #lbks(最新 8 章倒序 + 正文前 80 章), 全量目录分页 /shoujixs_{id}_{页}/(80 章/页), tocLink 取书籍页内 select[name=pageselect] 首个 option value(★镜像域 www.shoujixsw.com, 实测同内容), 目录翻页 nextLink=span.right a。正文 #zjny 单页全章。封面占位: 无封面书统一 nocover.jpg(站点真实占位, 非反爬)。★镜像域: www.shoujixsw.com ≡ www.shoujixs.net(实测 200 同源), fetch.mirrorDomains 互为故障切换。反爬态势: 无 → 推荐引擎 TS/Go 皆可(engine=http, GBK 解码引擎层内置)。",
    enabled: true,
    source: "scripts/seed-rule-shoujixs.ts",
    config: {
      "list": {
        "enabled": true,
        "urlTemplate": "https://www.shoujixs.net/xhqh_{page}.html",
        "itemSelector": {
          "type": "css",
          "expression": "div.item"
        },
        "fields": {
          "bookUrl": {
            "type": "css",
            "expression": ".image a",
            "attr": "href"
          },
          "name": {
            "type": "css",
            "expression": "dl dt a",
            "attr": "text"
          },
          "author": {
            "type": "css",
            "expression": "dl dt span",
            "attr": "text"
          },
          "intro": {
            "type": "css",
            "expression": "dl dd",
            "attr": "text"
          },
          "cover": {
            "type": "css",
            "expression": ".image img",
            "attr": "src"
          }
        },
        "pagination": {
          "enabled": true,
          "maxPages": 2
        }
      },
      "book": {
        "enabled": true,
        "fields": {
          "name": {
            "type": "css",
            "expression": "#muluzuoceh h1",
            "attr": "text"
          },
          "author": {
            "type": "regex",
            "expression": "作者：([^<]+)"
          },
          "wordCount": {
            "type": "regex",
            "expression": "字数：([0-9.]+万字)"
          },
          "latestChapter": {
            "type": "regex",
            "expression": "最新章节：<a[^>]*>([^<]+)</a>"
          },
          "intro": {
            "type": "css",
            "expression": "#shojixsinto p",
            "attr": "text"
          },
          "cover": {
            "type": "css",
            "expression": "#fmimg img",
            "attr": "src"
          }
        }
      },
      "toc": {
        "enabled": true,
        "tocLink": {
          "type": "css",
          "expression": "select[name=\"pageselect\"] option",
          "attr": "value"
        },
        "itemSelector": {
          "type": "css",
          "expression": "#lbks dl dd"
        },
        "fields": {
          "title": {
            "type": "css",
            "expression": "a",
            "attr": "text"
          },
          "url": {
            "type": "css",
            "expression": "a",
            "attr": "href"
          }
        },
        "pagination": {
          "enabled": true,
          "nextLink": {
            "type": "css",
            "expression": "span.right a",
            "attr": "href"
          },
          "maxPages": 5,
          "joinWith": ""
        }
      },
      "content": {
        "enabled": true,
        "fields": {
          "content": {
            "type": "css",
            "expression": "#zjny",
            "attr": "html"
          }
        },
        "pagination": {
          "enabled": false,
          "maxPages": 1
        }
      },
      "fetch": {
        "engine": "http",
        "uaMode": "rotate",
        "autoCookie": true,
        "referer": true,
        "refererChain": true,
        "timeout": 20000,
        "retries": 2,
        "waitMs": 500,
        "browserFallbackStatus": [
          403,
          412,
          429,
          503
        ],
        "hostGateLimit": 2,
        "hostGateConcurrency": 2,
        "globalConcurrency": 6,
        "mirrorDomains": "www.shoujixs.net,www.shoujixsw.com"
      },
      "clean": {
        "removeSelectors": [
          "script",
          "style",
          "iframe",
          "ins",
          "noscript",
          "a"
        ],
        "adPatterns": [
          "www\\.shoujixsw?\\.com\\S*",
          "(www\\.)?[a-z0-9-]+\\.(com|net|cc|org|info|top|xyz|vip|site)(\\/\\S*)?"
        ],
        "whitelist": [
          "p",
          "br",
          "b",
          "strong",
          "em",
          "i",
          "u",
          "h1",
          "h2",
          "h3"
        ],
        "normalize": true,
        "plainText": false
      }
    },
  },
  {
    key: "shudugu",
    name: "速读谷 (shudugu.org)",
    description: "shudugu.org IIS+ASP.NET 传统多页站, UTF-8 直连无挑战(无WAF/无UA门禁)。列表=/zuixin/{page}.html(483页每页11本, 第1页302→/zuixin/自动跟随) div.item(书名/作者剥\"作者：\"前缀/状态/封面) / 书籍页 /{bid}/ 内嵌 .itemtxt(h1 a 书名+a[href*=zuozhe] 作者+p span 状态原文+ul li 最新章)+div.des.bb 简介+img 封面 / 目录内嵌书籍页 #list li 单页(★站点内嵌目录有~1000章截断上限, 超千章大书只露前999章且无翻页入口, 硬约束) / 正文 div.con, 章节子页 {cid}-{n}.html 由 prenext\"下一页\"锚翻页(末页变\"下一章\"无锚自然收敛, 陷阱不存在)。",
    enabled: true,
    source: "scripts/seed-rule-shudugu.ts",
    config: {
      "list": {
        "enabled": true,
        "urlTemplate": "https://www.shudugu.org/xuanhuan/{page}.html",
        "itemSelector": {
          "type": "css",
          "expression": "div.item"
        },
        "fields": {
          "name": {
            "type": "css",
            "expression": ".itemtxt h3 a, .itemtxt h1 a",
            "attr": "text"
          },
          "bookUrl": {
            "type": "css",
            "expression": ".itemtxt h3 a, .itemtxt h1 a",
            "attr": "href"
          },
          "author": {
            "type": "css",
            "expression": ".itemtxt p a",
            "attr": "text",
            "replaceFrom": "^作者[:：]\\s*",
            "replaceTo": ""
          },
          "status": {
            "type": "css",
            "expression": ".itemtxt p span",
            "attr": "text"
          },
          "cover": {
            "type": "css",
            "expression": "img",
            "attr": "src"
          }
        },
        "pagination": {
          "enabled": false,
          "maxPages": 1
        }
      },
      "book": {
        "enabled": true,
        "fields": {
          "name": {
            "type": "css",
            "expression": ".itemtxt h1 a",
            "attr": "text"
          },
          "author": {
            "type": "css",
            "expression": "a[href*=\"/zuozhe/\"]",
            "attr": "text",
            "replaceFrom": "^作者[:：]\\s*",
            "replaceTo": ""
          },
          "status": {
            "type": "css",
            "expression": ".itemtxt p span",
            "attr": "text"
          },
          "latestChapter": {
            "type": "css",
            "expression": ".itemtxt ul li a",
            "attr": "text"
          },
          "intro": {
            "type": "css",
            "expression": "div.des.bb",
            "attr": "text"
          },
          "cover": {
            "type": "css",
            "expression": "div.item img",
            "attr": "src"
          }
        }
      },
      "toc": {
        "enabled": true,
        "itemSelector": {
          "type": "css",
          "expression": "#list li"
        },
        "fields": {
          "title": {
            "type": "css",
            "expression": "a",
            "attr": "text"
          },
          "url": {
            "type": "css",
            "expression": "a",
            "attr": "href"
          }
        },
        "pagination": {
          "enabled": true,
          "maxPages": 20,
          "nextLink": {
            "type": "css",
            "expression": "a.gr",
            "attr": "href"
          }
        }
      },
      "content": {
        "enabled": true,
        "fields": {
          "content": {
            "type": "css",
            "expression": "div.con",
            "attr": "html"
          }
        },
        "pagination": {
          "enabled": true,
          "maxPages": 10
        }
      },
      "fetch": {
        "engine": "http",
        "uaMode": "rotate",
        "autoCookie": true,
        "referer": true,
        "timeout": 25000,
        "retries": 2,
        "waitMs": 800,
        "browserFallbackStatus": [
          403,
          412,
          429,
          503
        ],
        "hostGateLimit": 3
      },
      "clean": {
        "removeSelectors": [
          "script",
          "style",
          "iframe",
          "ins",
          "noscript",
          ".adsbygoogle"
        ],
        "adPatterns": [
          "(www\\.)?shudugu\\.org\\S*",
          "(www\\.)?sudugu\\.org\\S*",
          "速读谷[^<>]*",
          "谷内无错[^<>]*",
          "请记住本站[^<>]*",
          "本站内容来源于网络[^。<>]*",
          "本站所收录作品[^<>]*",
          "(www\\.)?[a-z0-9-]+\\.(com|net|cc|org|info|top|xyz|vip|site)(\\/\\S*)?"
        ],
        "whitelist": [
          "p",
          "br",
          "b",
          "strong",
          "em",
          "i",
          "u",
          "h1",
          "h2",
          "h3",
          "h4",
          "h5",
          "h6"
        ],
        "normalize": true,
        "plainText": false
      }
    },
  },
  {
    key: "trxsw",
    name: "同人小说网(www.trxsw.com)·杰奇GBK采集",
    description: "trxsw.com 同人小说网(杰奇 CMS 经典模板, GBK — fetcher 自动升级 gb18030 解码)。列表=/book/{cat}_{sort}_0_0_0_0_{page}.html(cat 1..7 分类/0 全站, sort=lastupdate|monthvisit, 页码1基), .top+#novelslist li+#newscontent li 并集兼容列表页同构 s1..s5 行, 快照实测 95 项/94 书。\n⚠ 未实测(2026-09-15): 真站 HTTP/2 framing 层拒绝所有出口(ERR_HTTP2_PROTOCOL_ERROR), 无法四段实测; list 段=2019-10-19 Wayback 快照实证, book/toc/content 按杰奇惯例写+合成夹具回归(og:novel meta+文本正则双保险/#list dd a/#content 并集+引擎兜底); 章节页实证 /book/{bid}/{cid}.html; host 钉扎无 --http1.1 画像(留档)。恢复后 TRXSW_PROBE=1 复验。",
    enabled: true,
    source: "scripts/seed-rule-trxsw.ts",
    config: {
      "list": {
        "enabled": true,
        "urlTemplate": "https://www.trxsw.com/book/0_lastupdate_0_0_0_0_{page}.html",
        "itemSelector": {
          "type": "css",
          "expression": "div.novelslist .top, div.novelslist .content ul li, #newscontent li"
        },
        "fields": {
          "name": {
            "type": "css",
            "expression": "dt a, .s2 a, li > a",
            "attr": "text"
          },
          "bookUrl": {
            "type": "css",
            "expression": "dt a, .s2 a, li > a",
            "attr": "href"
          },
          "author": {
            "type": "css",
            "expression": "dt span, .s4, .s5",
            "attr": "text"
          },
          "category": {
            "type": "css",
            "expression": ".s1",
            "attr": "text",
            "replaceFrom": "\\[|\\]",
            "replaceTo": ""
          },
          "latestChapter": {
            "type": "css",
            "expression": ".s3 a",
            "attr": "text"
          },
          "intro": {
            "type": "css",
            "expression": "dl dd",
            "attr": "text"
          },
          "cover": {
            "type": "css",
            "expression": "img",
            "attr": "src"
          }
        },
        "pagination": {
          "enabled": false,
          "maxPages": 1
        }
      },
      "book": {
        "enabled": true,
        "fields": {
          "name": {
            "type": "css",
            "expression": "h1",
            "attr": "text",
            "replaceFrom": "^《|》$",
            "replaceTo": ""
          },
          "author": {
            "type": "regex",
            "expression": "(?:og:novel:author\"\\s*content=\"|作\\s*者[：:](?:<[^>]*>)*\\s*)([^\"\\s<]{1,40})",
            "attr": "1"
          },
          "category": {
            "type": "regex",
            "expression": "(?:og:novel:category\"\\s*content=\"|类\\s*别[：:](?:<[^>]*>)*\\s*\\[?)([^\"\\]\\s<]{1,12})",
            "attr": "1"
          },
          "status": {
            "type": "regex",
            "expression": "(?:og:novel:status\"\\s*content=\"|状\\s*态[：:](?:<[^>]*>)*\\s*)([^\"\\]\\s<]{1,10})",
            "attr": "1"
          },
          "wordCount": {
            "type": "regex",
            "expression": "字\\s*数[：:](?:<[^>]*>)*\\s*([\\d.,]+\\s*万?[字]?)",
            "attr": "1"
          },
          "latestChapter": {
            "type": "regex",
            "expression": "(?:og:novel:latest_chapter_name\"\\s*content=\"|最新章节[：:](?:<[^>]*>)*\\s*)([^\"<]{1,80})",
            "attr": "1"
          },
          "intro": {
            "type": "css",
            "expression": "#intro, .intro, #bookintro, .bookintro",
            "attr": "text"
          },
          "cover": {
            "type": "css",
            "expression": "img[src*=\"files/article/image\"], img[src*=\"/img/\"], #imgbox img, .imgbox img, .cover img, #img img",
            "attr": "src"
          }
        }
      },
      "toc": {
        "enabled": true,
        "itemSelector": {
          "type": "css",
          "expression": "#list dd a, #chapterlist dd a, #chapterlist li a, .chapterlist dd a, .chapterlist li a, #booklist dd a"
        },
        "fields": {
          "title": {
            "type": "css",
            "expression": "a",
            "attr": "text"
          },
          "url": {
            "type": "css",
            "expression": "a",
            "attr": "href"
          }
        },
        "pagination": {
          "enabled": true,
          "maxPages": 20,
          "nextLink": {
            "type": "css",
            "expression": "a:contains(\"下一页\")",
            "attr": "href"
          }
        }
      },
      "content": {
        "enabled": true,
        "fields": {
          "content": {
            "type": "css",
            "expression": "#content, #chaptercontent, #booktxt, .showtxt",
            "attr": "html"
          }
        },
        "pagination": {
          "enabled": false,
          "maxPages": 1
        }
      },
      "fetch": {
        "engine": "auto",
        "uaMode": "rotate",
        "autoCookie": true,
        "referer": true,
        "timeout": 25000,
        "retries": 2,
        "waitMs": 1000,
        "browserFallbackStatus": [
          403,
          412,
          429,
          503
        ],
        "hostGateLimit": 3
      },
      "clean": {
        "removeSelectors": [
          "script",
          "style",
          "iframe",
          "ins",
          "noscript",
          ".adsbygoogle"
        ],
        "adPatterns": [
          "(www\\.)?trxsw\\.com\\S*",
          "同人小说网[^<>]*",
          "本站所有小说均由网友上传[^<>]*",
          "请记住本书首发域名[^<>]*",
          "(www\\.)?[a-z0-9-]+\\.(com|net|cc|org|info|top|xyz|vip|site)(\\/\\S*)?",
          "一秒记住.*?免费读"
        ],
        "whitelist": [
          "p",
          "br",
          "b",
          "strong",
          "em",
          "i",
          "u",
          "h1",
          "h2",
          "h3",
          "h4",
          "h5",
          "h6"
        ],
        "normalize": true,
        "plainText": false
      }
    },
  },
  {
    key: "wanben",
    name: "完本神站 (wanbenshenzhan.com)",
    description: "wanbenshenzhan.com GoEdge WAF 站(Legado 书源反译)。列表=书库 /all/{cat}_lastupdate_{完本}_{0}_{page}.html, 表格(.data-table tr)+卡片(.rank-item)双布局 CSS 并集(书名/作者剥\"作者：\"/分类剥[]/最新章/封面/简介) / 书籍页 .book-info-detail h1(剥\"编辑\")+.book-meta span(作者/分类/字数)+.latest-chapter-link+.book-intro p+封面, status 不入字段交 smartCompleteDetect / 目录内嵌书籍页 #chapter-list .chapter-list a, 分页\"下一页\"链(?chapter_page=N) / 正文 .chapter-content html。搜索走 sososhu.com 需登录已跳过(list 段代替)。\n⚠ 未实测(2026-08-31): 沙箱出口 IP 被 GoEdge 边缘级拒绝(移动UA 403/桌面UA 307→图形验证码; http+curl+真渲染浏览器三链路均 403), 规则按 Legado 书源反译入库未经真网四段验证, 换出口 IP(配置 proxyUrl)解封后请 WANBEN_PROBE=1 重跑种子做四段复验。m./www. 双域 DNS 同边缘, 选 www. 基准。",
    enabled: true,
    source: "scripts/seed-rule-wanben.ts",
    config: {
      "list": {
        "enabled": true,
        "urlTemplate": "https://www.wanbenshenzhan.com/all/0_lastupdate_0_0_{page}.html",
        "itemSelector": {
          "type": "css",
          "expression": ".data-table tr, .rank-item"
        },
        "fields": {
          "name": {
            "type": "regex",
            "expression": "(?:class=\"[^\"]*book-name[^\"]*\"[^>]*>\\s*<a[^>]*>|class=\"[^\"]*rank-book-info[^\"]*\"[\\s\\S]{0,400}?<h4>\\s*<a[^>]*>)([^<]+)"
          },
          "bookUrl": {
            "type": "regex",
            "expression": "(?:class=\"[^\"]*book-name[^\"]*\"[^>]*>\\s*<a[^>]*href=\"|class=\"[^\"]*rank-book-info[^\"]*\"[\\s\\S]{0,400}?href=\")([^\"]+)"
          },
          "author": {
            "type": "css",
            "expression": ".author, .rank-book-info .meta span:nth-of-type(1)",
            "attr": "text",
            "replaceFrom": "^作者[:：]\\s*",
            "replaceTo": ""
          },
          "category": {
            "type": "css",
            "expression": ".sort, .rank-book-info .meta span:nth-of-type(2)",
            "attr": "text",
            "replaceFrom": "^分类[:：]\\s*|\\[|\\]",
            "replaceTo": ""
          },
          "latestChapter": {
            "type": "css",
            "expression": ".chapter a, .latest a",
            "attr": "text"
          },
          "cover": {
            "type": "css",
            "expression": ".rank-cover img",
            "attr": "src"
          },
          "wordCount": {
            "type": "css",
            "expression": ".words",
            "attr": "text"
          },
          "intro": {
            "type": "css",
            "expression": ".desc",
            "attr": "text"
          }
        },
        "pagination": {
          "enabled": false,
          "maxPages": 1
        }
      },
      "book": {
        "enabled": true,
        "fields": {
          "name": {
            "type": "css",
            "expression": ".book-info-detail h1",
            "attr": "text",
            "replaceFrom": "编辑",
            "replaceTo": ""
          },
          "author": {
            "type": "css",
            "expression": ".book-meta span:nth-of-type(1)",
            "attr": "text",
            "replaceFrom": "^作者[:：]\\s*",
            "replaceTo": ""
          },
          "category": {
            "type": "css",
            "expression": ".book-meta span:nth-of-type(2)",
            "attr": "text",
            "replaceFrom": "^分类[:：]\\s*",
            "replaceTo": ""
          },
          "wordCount": {
            "type": "css",
            "expression": ".book-meta span:nth-of-type(4)",
            "attr": "text",
            "replaceFrom": "^字数[:：]\\s*",
            "replaceTo": ""
          },
          "latestChapter": {
            "type": "css",
            "expression": ".latest-chapter-link a",
            "attr": "text"
          },
          "intro": {
            "type": "css",
            "expression": ".book-intro p",
            "attr": "text"
          },
          "cover": {
            "type": "css",
            "expression": ".book-cover-large img",
            "attr": "src"
          }
        }
      },
      "toc": {
        "enabled": true,
        "itemSelector": {
          "type": "css",
          "expression": "#chapter-list .chapter-list a"
        },
        "fields": {
          "title": {
            "type": "css",
            "expression": "a",
            "attr": "text"
          },
          "url": {
            "type": "css",
            "expression": "a",
            "attr": "href"
          }
        },
        "pagination": {
          "enabled": true,
          "maxPages": 20,
          "nextLink": {
            "type": "css",
            "expression": "a:contains(\"下一页\")",
            "attr": "href"
          }
        }
      },
      "content": {
        "enabled": true,
        "fields": {
          "content": {
            "type": "css",
            "expression": ".chapter-content",
            "attr": "html"
          }
        },
        "pagination": {
          "enabled": false,
          "maxPages": 1
        }
      },
      "fetch": {
        "engine": "auto",
        "uaMode": "custom",
        "customUa": "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
        "autoCookie": true,
        "referer": true,
        "timeout": 25000,
        "retries": 2,
        "waitMs": 1500,
        "browserFallbackStatus": [
          403,
          412,
          429,
          503
        ],
        "hostGateLimit": 3
      },
      "clean": {
        "removeSelectors": [
          "script",
          "style",
          "iframe",
          "ins",
          "noscript",
          ".adsbygoogle"
        ],
        "adPatterns": [
          "<p>【完本神站】[^<]*</p>",
          "<p>\\s*</p>",
          "完本神站[^<>]*",
          "(www\\.)?wanbenshenzhan\\.com\\S*",
          "请记住本站[^<>]*",
          "本站最新网址[^<>]*"
        ],
        "whitelist": [
          "p",
          "br",
          "b",
          "strong",
          "em",
          "i",
          "u",
          "h1",
          "h2",
          "h3",
          "h4",
          "h5",
          "h6"
        ],
        "normalize": true,
        "plainText": false
      }
    },
  },
  {
    key: "wuxiaworld",
    name: "WuxiaWorld Lite(lite.wuxiaworld.com)·英文英译站采集",
    description: "lite.wuxiaworld.com 英译网文站(SSR 纯静态, 免浏览器)。列表 td.novel-cell / 书籍页 h1+meta 行+chapter-body 简介 / 目录 ul.toc(?toc=N 分页自动跟随) / 正文 div.chapter-viewport。VIP 锁定章节无容器自动失败不污染。中文分类词表对英文分类无效→未分类兜底, 完结判断按 Ongoing/Completed 原文存状态字段。",
    enabled: true,
    source: "scripts/seed-rule-wuxiaworld.ts",
    config: {
      "list": {
        "enabled": true,
        "urlTemplate": "https://lite.wuxiaworld.com/novels?sort=chapters",
        "itemSelector": {
          "type": "css",
          "expression": "td.novel-cell"
        },
        "fields": {
          "name": {
            "type": "css",
            "expression": "p.title a",
            "attr": "text"
          },
          "bookUrl": {
            "type": "css",
            "expression": "p.title a",
            "attr": "href"
          },
          "cover": {
            "type": "css",
            "expression": "a.cover img",
            "attr": "src"
          },
          "status": {
            "type": "css",
            "expression": "p.tag",
            "attr": "text",
            "replaceFrom": "\\s*·[\\s\\S]*$",
            "replaceTo": ""
          },
          "category": {
            "type": "css",
            "expression": "p.tag",
            "attr": "text",
            "replaceFrom": "^[\\s\\S]*?·\\s*",
            "replaceTo": ""
          },
          "intro": {
            "type": "css",
            "expression": "p.syn",
            "attr": "text"
          }
        },
        "pagination": {
          "enabled": false,
          "maxPages": 1
        }
      },
      "book": {
        "enabled": true,
        "fields": {
          "name": {
            "type": "css",
            "expression": "main h1",
            "attr": "text"
          },
          "author": {
            "type": "css",
            "expression": "p.muted.small",
            "attr": "text",
            "replaceFrom": "^[\\s\\S]*?Author:\\s*([^·]+?)(?:\\s*·[\\s\\S]*)?$",
            "replaceTo": "$1"
          },
          "status": {
            "type": "css",
            "expression": "p.muted.small",
            "attr": "text",
            "replaceFrom": "^\\s*(Ongoing|Completed|Hiatus)\\b[\\s\\S]*$",
            "replaceTo": "$1"
          },
          "intro": {
            "type": "css",
            "expression": "div.chapter-body",
            "attr": "html"
          },
          "cover": {
            "type": "css",
            "expression": "div.cover img",
            "attr": "src"
          },
          "latestChapter": {
            "type": "css",
            "expression": "p.muted.small",
            "attr": "text",
            "replaceFrom": "^[\\s\\S]*?(\\d+)\\s+chapters[\\s\\S]*$",
            "replaceTo": "全书共 $1 章"
          }
        }
      },
      "toc": {
        "enabled": true,
        "itemSelector": {
          "type": "css",
          "expression": "ul.toc li"
        },
        "fields": {
          "title": {
            "type": "css",
            "expression": "a",
            "attr": "text"
          },
          "url": {
            "type": "css",
            "expression": "a",
            "attr": "href"
          }
        },
        "pagination": {
          "enabled": true,
          "maxPages": 100,
          "joinWith": "",
          "nextLink": {
            "type": "css",
            "expression": "a.btn.next",
            "attr": "href"
          }
        }
      },
      "content": {
        "enabled": true,
        "fields": {
          "content": {
            "type": "css",
            "expression": "div.chapter-viewport",
            "attr": "html"
          }
        },
        "pagination": {
          "enabled": false,
          "maxPages": 1
        }
      },
      "fetch": {
        "engine": "http",
        "uaMode": "rotate",
        "autoCookie": true,
        "referer": true,
        "timeout": 25000,
        "retries": 2,
        "waitMs": 2000,
        "browserFallbackStatus": [
          403,
          412,
          429,
          503
        ]
      },
      "clean": {
        "removeSelectors": [
          "script",
          "style",
          "iframe",
          "ins",
          "noscript",
          ".adsbygoogle",
          "div.notice",
          "div.chapter-nav",
          "div.reader-controls",
          "div.search-form",
          "form"
        ],
        "adPatterns": [
          "(www\\.)?wuxiaworld\\.com\\S*",
          "Please\\s+(rate|follow|bookmark)[^.]*",
          "Translator[:\\s].{0,40}Editor[:\\s].{0,40}",
          "Join\\s+our?\\s+(discord|community)[^.]*",
          "(www\\.)?[a-z0-9-]+\\.(com|net|cc|org|info|top|xyz|vip|site)(\\/\\S*)?"
        ],
        "whitelist": [
          "p",
          "br",
          "b",
          "strong",
          "em",
          "i",
          "u",
          "h1",
          "h2",
          "h3"
        ],
        "normalize": true,
        "plainText": false
      }
    },
  },
  {
    key: "x33yq",
    name: "33言情小说网 (x33yq.org)·代理池采集",
    description: "x33yq.org 33言情(杰奇家族 alistbox 变体, UTF-8)。列表=/sort/{1..18}/{page}(页码1基), div[id=alistbox] 条目(.pic 封面/.title h2 a 书名/.title span 作者/.info .intro/.info .sys 最新章); 书页 h1.f21h+.box_intro(简介/封面 img.x33yq.org); 目录链 .btopt a→/read/{bid}/(全量单页 #list dl dd); 正文 #content。\n⚠ 源站需大陆出口 IP(R43 实测: 香港直连/cloak 均拒绝, CN 代理 120.232.115.170 HTTP 200) — needsProxy=true+proxyCountries=CN 走代理池自动匹配; 已单本试采验证。",
    enabled: true,
    source: "scripts/seed-rule-x33yq.ts",
    config: {
      "list": {
        "enabled": true,
        "urlTemplate": "https://www.x33yq.org/sort/1/{page}",
        "itemSelector": {
          "type": "css",
          "expression": "div[id='alistbox']"
        },
        "fields": {
          "name": {
            "type": "css",
            "expression": ".title h2 a",
            "attr": "text",
            "replaceFrom": "[《》]",
            "replaceTo": ""
          },
          "bookUrl": {
            "type": "css",
            "expression": ".pic a",
            "attr": "href"
          },
          "author": {
            "type": "css",
            "expression": ".title span",
            "attr": "text",
            "replaceFrom": "^作者[:：]\\s*",
            "replaceTo": ""
          },
          "intro": {
            "type": "css",
            "expression": ".info .intro",
            "attr": "text"
          },
          "latestChapter": {
            "type": "css",
            "expression": ".info .sys a",
            "attr": "text"
          },
          "cover": {
            "type": "css",
            "expression": ".pic img",
            "attr": "src"
          }
        },
        "pagination": {
          "enabled": false,
          "maxPages": 1
        }
      },
      "book": {
        "enabled": true,
        "fields": {
          "name": {
            "type": "css",
            "expression": "h1.f21h",
            "attr": "text",
            "replaceFrom": "\\s*作者:.*$",
            "replaceTo": ""
          },
          "author": {
            "type": "css",
            "expression": "h1.f21h em a",
            "attr": "text"
          },
          "intro": {
            "type": "css",
            "expression": ".box_intro div.intro",
            "attr": "text",
            "replaceFrom": "^\\s*关于.*?[：:]\\s*",
            "replaceTo": ""
          },
          "cover": {
            "type": "css",
            "expression": ".box_intro .pic img",
            "attr": "src"
          },
          "status": {
            "type": "regex",
            "expression": "小说状态[：</b>\\s]{0,20}(连载|已完成|完本)",
            "attr": "1",
            "flags": "i"
          }
        }
      },
      "toc": {
        "enabled": true,
        "tocLink": {
          "type": "css",
          "expression": ".btopt a",
          "attr": "href"
        },
        "itemSelector": {
          "type": "css",
          "expression": "#list dl dd"
        },
        "fields": {
          "title": {
            "type": "css",
            "expression": "a",
            "attr": "text"
          },
          "url": {
            "type": "css",
            "expression": "a",
            "attr": "href"
          }
        },
        "pagination": {
          "enabled": false,
          "maxPages": 1
        }
      },
      "content": {
        "enabled": true,
        "fields": {
          "content": {
            "type": "css",
            "expression": "#content",
            "attr": "html"
          }
        },
        "pagination": {
          "enabled": false,
          "maxPages": 1
        }
      },
      "fetch": {
        "engine": "http",
        "uaMode": "custom",
        "customUa": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        "timeout": 30000,
        "retries": 2,
        "needsProxy": true,
        "proxyCountries": "CN",
        "hostGateLimit": 2
      },
      "clean": {
        "removeSelectors": [
          "script",
          "style",
          ".wudu-bar",
          ".bottem",
          ".bottem1",
          ".con_top",
          ".toolbar"
        ],
        "adPatterns": [],
        "whitelist": [],
        "normalize": true,
        "plainText": false
      }
    },
  },
  {
    key: "xbqg777",
    name: "新笔趣阁(xbqg777.com)·bqg家族静态站采集",
    description: "www.xbqg777.com 新笔趣阁(bqg 家族近亲, R52-a 2026-09-21 实测)。纯静态 SSR HTML/UTF-8/https/无反爬, 直连即可。URL 形态: 列表 /{分类}?page={page}(★查询参数分页, 如 /ds?page=2) | 书籍 /{数字id}(无 .html 后缀, 亦兼容 mode=bookIds 模板 /{bookId}) | 章节 /{书id}/{章id}。列表 div.cls .card(容器唯一 <a> 即书链)/书籍 .detail(作者 .zuthor/状态 .state)/目录内嵌 div.chapter ol li a(616 章全量)/正文 article#article。★占位封面陷阱预警: 封面在 cdn.biquge7.top/www.biquge7.top/imgs/{id}.jpg; 实测真实 id 全 200 且图各异、不存在 id 返 404(当日陷阱未复现), 但 bqg 家族历史上有「不存在封面恒 200 返同一默认图」行为 —— 若入库封面 md5 高度重复, 先核查 CDN 是否退化再调规则。反爬态势: 无 → 推荐引擎 TS/Go 皆可(engine=http)。",
    enabled: true,
    source: "scripts/seed-rule-xbqg777.ts",
    config: {
      "list": {
        "enabled": true,
        "urlTemplate": "https://www.xbqg777.com/ds?page={page}",
        "itemSelector": {
          "type": "css",
          "expression": "div.cls .card"
        },
        "fields": {
          "bookUrl": {
            "type": "css",
            "expression": "a",
            "attr": "href"
          },
          "name": {
            "type": "css",
            "expression": ".title",
            "attr": "text"
          },
          "author": {
            "type": "css",
            "expression": ".author",
            "attr": "text"
          },
          "intro": {
            "type": "css",
            "expression": ".des",
            "attr": "text"
          },
          "cover": {
            "type": "css",
            "expression": ".cover img",
            "attr": "src"
          }
        },
        "pagination": {
          "enabled": true,
          "maxPages": 2
        }
      },
      "book": {
        "enabled": true,
        "fields": {
          "name": {
            "type": "css",
            "expression": ".detail .title",
            "attr": "text"
          },
          "author": {
            "type": "css",
            "expression": ".zuthor",
            "attr": "text",
            "replaceFrom": "^作者：",
            "replaceTo": ""
          },
          "status": {
            "type": "css",
            "expression": ".state",
            "attr": "text",
            "replaceFrom": "^状态：",
            "replaceTo": ""
          },
          "latestChapter": {
            "type": "css",
            "expression": ".upcont a",
            "attr": "text"
          },
          "intro": {
            "type": "css",
            "expression": ".des .text",
            "attr": "text",
            "replaceFrom": "最新章节由网友提供[\\s\\S]*$",
            "replaceTo": ""
          },
          "cover": {
            "type": "css",
            "expression": ".detail .cover img",
            "attr": "src"
          }
        }
      },
      "toc": {
        "enabled": true,
        "itemSelector": {
          "type": "css",
          "expression": "div.chapter ol li"
        },
        "fields": {
          "title": {
            "type": "css",
            "expression": "a",
            "attr": "text"
          },
          "url": {
            "type": "css",
            "expression": "a",
            "attr": "href"
          }
        },
        "pagination": {
          "enabled": false,
          "maxPages": 1
        }
      },
      "content": {
        "enabled": true,
        "fields": {
          "content": {
            "type": "css",
            "expression": "article#article",
            "attr": "html"
          }
        },
        "pagination": {
          "enabled": false,
          "maxPages": 1
        }
      },
      "fetch": {
        "engine": "http",
        "uaMode": "rotate",
        "autoCookie": true,
        "referer": true,
        "refererChain": true,
        "timeout": 20000,
        "retries": 2,
        "waitMs": 500,
        "browserFallbackStatus": [
          403,
          412,
          429,
          503
        ],
        "hostGateLimit": 2,
        "hostGateConcurrency": 2,
        "globalConcurrency": 6
      },
      "clean": {
        "removeSelectors": [
          "script",
          "style",
          "iframe",
          "ins",
          "noscript"
        ],
        "adPatterns": [
          "本站所有小说为转载作品.*$",
          "笔趣阁免费提供.*?在线阅读。",
          "章节由网友上传",
          "(www\\.)?biquge7\\.top\\S*",
          "(www\\.)?xbqg777\\.com\\S*",
          "(www\\.)?[a-z0-9-]+\\.(com|net|cc|org|info|top|xyz|vip|site)(\\/\\S*)?"
        ],
        "whitelist": [
          "p",
          "br",
          "b",
          "strong",
          "em",
          "i",
          "u",
          "h1",
          "h2",
          "h3"
        ],
        "normalize": true,
        "plainText": false
      }
    },
  },
  {
    key: "xjp",
    name: "新键盘小说网 (xinjianpan.com)·直连+var c解密代理正文",
    description: "新键盘小说网(xinjianpan.com) biquge2023 仿站: list/book/toc 三段直连 + content 段走外置解密代理。正文层双层: #chaptercontent SSR 前半 + var c(base64, 每章恒定) 加密后半由 get20260103.js 客户端解密注入; 解密算法已破(s=atob(c); n=parseInt(s[8:11]); payload=s[11+n:len-n]; '-'→PHA+, '_'→8L3A+ 标记膨胀; atob→UTF-8), 超出声明式引擎表达力 → mini-services/xjp-proxy(端口 3015)承载(章节页抓取+双层合并+HTML→纯文本)。 toc url 字段以 attr=onclick + replaceFrom 前置代理前缀(站点章节锚为 javascript:;+onclick 形态, 引擎 javascript: 过滤器要求必须先提取); 代理只接受 xinjianpan /txt/{code}/{page}.html 形态(防开放代理)。类名带部署哈希尾缀, 选择器一律 [class^=] 前缀匹配。 代理启动: cd mini-services/xjp-proxy && bun run start; /health 自检 selfTestOk/upstreamReachable。",
    enabled: true,
    source: "scripts/seed-rule-xjp.ts",
    config: {
      "list": {
        "enabled": true,
        "urlTemplate": "https://www.xinjianpan.com/sort/xuanhuan-{page}.html",
        "itemSelector": {
          "type": "css",
          "expression": "dl[class^=\"list-item\"]"
        },
        "fields": {
          "name": {
            "type": "css",
            "expression": "dt a",
            "replaceFrom": "\\s*\\(完\\)$",
            "replaceTo": ""
          },
          "bookUrl": {
            "type": "css",
            "expression": "dt a",
            "attr": "href"
          },
          "intro": {
            "type": "css",
            "expression": "dd:nth-of-type(1)",
            "stripTags": true
          },
          "author": {
            "type": "css",
            "expression": "dd:nth-of-type(2) a",
            "attr": "text"
          },
          "status": {
            "type": "css",
            "expression": "dd:nth-of-type(2) span:nth-of-type(1)",
            "attr": "text",
            "replaceFrom": "^全本$",
            "replaceTo": "完结"
          },
          "cover": {
            "type": "css",
            "expression": "a.cover img",
            "attr": "data-src"
          }
        },
        "pagination": {
          "enabled": true,
          "nextLink": {
            "type": "css",
            "expression": "div[class^=\"pages\"] li.next a",
            "attr": "href"
          },
          "maxPages": 5
        }
      },
      "book": {
        "enabled": true,
        "fields": {
          "name": {
            "type": "css",
            "expression": "h1",
            "attr": "text"
          },
          "author": {
            "type": "css",
            "expression": "p:contains(\"作者：\") a",
            "attr": "text"
          },
          "status": {
            "type": "css",
            "expression": "p:contains(\"状态：\") span",
            "attr": "text",
            "replaceFrom": "^连载$",
            "replaceTo": "连载中"
          },
          "latestChapter": {
            "type": "css",
            "expression": "p:contains(\"最新章节：\") a",
            "attr": "text"
          },
          "cover": {
            "type": "css",
            "expression": "img[src*=\"bookimg\"]",
            "attr": "src"
          },
          "intro": {
            "type": "css",
            "expression": "div.bookintro p",
            "attr": "text",
            "replaceFrom": "^小说简介：",
            "replaceTo": ""
          }
        },
        "tocLink": {
          "type": "css",
          "expression": "a[href$=\"list-1.html\"]",
          "attr": "href"
        }
      },
      "toc": {
        "enabled": true,
        "itemSelector": {
          "type": "css",
          "expression": "li[class^=\"list-item\"]"
        },
        "fields": {
          "title": {
            "type": "css",
            "expression": "a",
            "attr": "text"
          },
          "url": {
            "type": "css",
            "expression": "a",
            "attr": "onclick",
            "replaceFrom": "^location\\.href='(.+)'$",
            "replaceTo": "http://127.0.0.1:3015/content?u=https://www.xinjianpan.com$1"
          }
        },
        "pagination": {
          "enabled": true,
          "nextLink": {
            "type": "css",
            "expression": "span.right a",
            "attr": "onclick",
            "replaceFrom": "^location\\.href='(.+)'$",
            "replaceTo": "$1"
          },
          "maxPages": 130
        }
      },
      "content": {
        "enabled": true,
        "fields": {
          "content": {
            "type": "json",
            "expression": "content"
          }
        },
        "pagination": {
          "enabled": false,
          "maxPages": 1
        }
      },
      "fetch": {
        "engine": "http",
        "uaMode": "custom",
        "customUa": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "headers": {
          "Accept": "application/json,text/html;q=0.9,*/*;q=0.8"
        },
        "autoCookie": false,
        "referer": true,
        "timeout": 30000,
        "retries": 1,
        "waitMs": 300,
        "hostGateLimit": 2,
        "contentProxyUrl": "http://127.0.0.1:3015/content?u={url}"
      },
      "clean": {
        "removeSelectors": [
          "script",
          "style",
          "iframe",
          "ins",
          "noscript"
        ],
        "adPatterns": [
          "[^\\n]*一秒记住[^\\n]*",
          "[^\\n]*第一时间更新[^\\n]*",
          "[^\\n]*xinjianpan\\.com[^\\n]*",
          "《[^\\n]*》转载请注明来源[^\\n]*",
          "更多内容加载中[^\\n]*",
          "请关闭浏览器的阅读模式[^\\n]*",
          "本站只支持手机浏览器访问[^\\n]*"
        ],
        "normalize": true,
        "plainText": true
      }
    },
  },
  {
    key: "xyetianlian",
    name: "仙侠天恋(xyetianlian.com)·杰奇WAP模板http站采集",
    description: "www.xyetianlian.com 仙侠天恋(R52-a 2026-09-21 实测)。杰奇 WAP 模板系纯静态 SSR, ★仅 http 无 https, UTF-8(meta 与实际字节一致; 部分页面无视请求头恒返 gzip, 引擎 bun fetch/curl --compressed 均自动解压无影响)。无反爬, 直连 200。URL 形态: 列表 /fenlei/{分类}/{page}.html | 书籍 /yt{数字id}/ 或拼音 slug(混合形态, 不适用 mode=bookIds) | 章节 /{slug}/{章id}.html。目录内嵌书籍页 div.listmain dl(最新 12 条倒序 + 正文卷全量, 1646 dd 实测) —— 无 tocLink, 引擎书籍页兜底提取, 倒序头部由章节重排归位。正文 #content 单页全章。书籍页/正文尾部推广文案(无弹窗推荐地址/转载作品声明)由 clean 段清除。反爬态势: 无 → 推荐引擎 TS/Go 皆可(engine=http)。",
    enabled: true,
    source: "scripts/seed-rule-xyetianlian.ts",
    config: {
      "list": {
        "enabled": true,
        "urlTemplate": "http://www.xyetianlian.com/fenlei/1/{page}.html",
        "itemSelector": {
          "type": "css",
          "expression": "div.item"
        },
        "fields": {
          "bookUrl": {
            "type": "css",
            "expression": ".image a",
            "attr": "href"
          },
          "name": {
            "type": "css",
            "expression": "dl dt a",
            "attr": "text"
          },
          "author": {
            "type": "css",
            "expression": "dl dt span",
            "attr": "text"
          },
          "intro": {
            "type": "css",
            "expression": "dl dd",
            "attr": "text"
          },
          "cover": {
            "type": "css",
            "expression": ".image img",
            "attr": "src"
          }
        },
        "pagination": {
          "enabled": true,
          "maxPages": 2
        }
      },
      "book": {
        "enabled": true,
        "fields": {
          "name": {
            "type": "css",
            "expression": "div.info h2",
            "attr": "text"
          },
          "author": {
            "type": "regex",
            "expression": "作者：([^<]+)"
          },
          "category": {
            "type": "regex",
            "expression": "分类：([^<]+)"
          },
          "status": {
            "type": "regex",
            "expression": "状态：([^<]+)"
          },
          "wordCount": {
            "type": "regex",
            "expression": "字数：([0-9]+)"
          },
          "latestChapter": {
            "type": "css",
            "expression": ".small .last a",
            "attr": "text"
          },
          "intro": {
            "type": "css",
            "expression": "div.intro",
            "attr": "text",
            "replaceFrom": "^简介：",
            "replaceTo": ""
          },
          "cover": {
            "type": "css",
            "expression": "div.info .cover img",
            "attr": "src"
          }
        }
      },
      "toc": {
        "enabled": true,
        "itemSelector": {
          "type": "css",
          "expression": "div.listmain dl dd"
        },
        "fields": {
          "title": {
            "type": "css",
            "expression": "a",
            "attr": "text"
          },
          "url": {
            "type": "css",
            "expression": "a",
            "attr": "href"
          }
        },
        "pagination": {
          "enabled": false,
          "maxPages": 1
        }
      },
      "content": {
        "enabled": true,
        "fields": {
          "content": {
            "type": "css",
            "expression": "#content",
            "attr": "html"
          }
        },
        "pagination": {
          "enabled": false,
          "maxPages": 1
        }
      },
      "fetch": {
        "engine": "http",
        "uaMode": "rotate",
        "autoCookie": true,
        "referer": true,
        "refererChain": true,
        "timeout": 20000,
        "retries": 2,
        "waitMs": 500,
        "browserFallbackStatus": [
          403,
          412,
          429,
          503
        ],
        "hostGateLimit": 2,
        "hostGateConcurrency": 2,
        "globalConcurrency": 6
      },
      "clean": {
        "removeSelectors": [
          "script",
          "style",
          "iframe",
          "ins",
          "noscript",
          "a"
        ],
        "adPatterns": [
          "作者：.*?所写的《.*?》无弹窗免费全文阅读为转载作品,?章节由网友发布。",
          "无弹窗推荐地址：\\S*",
          "无弹窗.*?阅读",
          "何以笙箫默小说小说推荐阅读：.*?$",
          "(www\\.)?xyetianlian\\.com\\S*",
          "(www\\.)?[a-z0-9-]+\\.(com|net|cc|org|info|top|xyz|vip|site)(\\/\\S*)?"
        ],
        "whitelist": [
          "p",
          "br",
          "b",
          "strong",
          "em",
          "i",
          "u",
          "h1",
          "h2",
          "h3"
        ],
        "normalize": true,
        "plainText": false
      }
    },
  },
  {
    key: "yueyouxs",
    name: "神马小说(sma.yueyouxs.com)·移动站静态HTML采集",
    description: "sma.yueyouxs.com 神马小说移动子域 WAP 站(R52-a 2026-09-21 实测)。纯静态 SSR HTML/UTF-8/无反爬(无 WAF 无 UA 过滤), 直连即可。URL 形态: 列表 /l/s/29/{page}.html(男生必读榜, {page} 分页) | 书籍 /b/{数字id}.html(亦兼容 mode=bookIds 模板 /b/{bookId}.html) | 目录 /c/{id}.html(单页全量) | 章节 /r/{书id}/{章id}.html(整章 5 段 div.section 全内联, 无正文翻页)。★列表项无 <a> 标签: 跳转在容器 onclick 属性里(newWebView/gotoPage), bookUrl 用 regex 从 item html 提取(/b/\\d+\\.html)。书籍页作者/分类/字数为「作者：xx」文本段, 用 regex 提取; 目录页底部上一页/下一页是 JS 展示分页(数据全量内联), 规则不翻页。正文 div.book 整体提取(attr html)后靠 clean 段去 h2 段标题/下载广告块(.wanzheng-dl/.dibu-dl)/「（本章未完，请翻页）」占位行。反爬态势: 无 → 推荐引擎 TS/Go 皆可(engine=http 纯 HTTP 链路, 无需浏览器)。",
    enabled: true,
    source: "scripts/seed-rule-yueyouxs.ts",
    config: {
      "list": {
        "enabled": true,
        "urlTemplate": "https://sma.yueyouxs.com/l/s/29/{page}.html",
        "itemSelector": {
          "type": "css",
          "expression": "div.v-list-item"
        },
        "fields": {
          "bookUrl": {
            "type": "regex",
            "expression": "(/b/[0-9]+\\.html)"
          },
          "name": {
            "type": "css",
            "expression": ".v-title",
            "attr": "text"
          },
          "author": {
            "type": "css",
            "expression": ".v-author",
            "attr": "text",
            "replaceFrom": "\\u00a0",
            "replaceTo": ""
          },
          "intro": {
            "type": "css",
            "expression": ".v-intro",
            "attr": "text"
          },
          "cover": {
            "type": "css",
            "expression": ".v-cover-img",
            "attr": "src"
          },
          "wordCount": {
            "type": "css",
            "expression": ".v-words",
            "attr": "text"
          }
        },
        "pagination": {
          "enabled": true,
          "maxPages": 2
        }
      },
      "book": {
        "enabled": true,
        "fields": {
          "name": {
            "type": "css",
            "expression": "p.face-info-title",
            "attr": "text"
          },
          "author": {
            "type": "regex",
            "expression": "作者：([^<]+)"
          },
          "category": {
            "type": "regex",
            "expression": "分类：([^<]+)"
          },
          "wordCount": {
            "type": "regex",
            "expression": "字数：([^<]+)"
          },
          "status": {
            "type": "css",
            "expression": ".content-tag .content-label",
            "attr": "text"
          },
          "intro": {
            "type": "css",
            "expression": "#intro",
            "attr": "text"
          },
          "cover": {
            "type": "css",
            "expression": ".face .face-cover img",
            "attr": "src"
          }
        }
      },
      "toc": {
        "enabled": true,
        "tocLink": {
          "type": "css",
          "expression": "a[href^=\"/c/\"]",
          "attr": "href"
        },
        "itemSelector": {
          "type": "css",
          "expression": "ul.catalog_ls li"
        },
        "fields": {
          "title": {
            "type": "css",
            "expression": "a",
            "attr": "text"
          },
          "url": {
            "type": "css",
            "expression": "a",
            "attr": "href"
          }
        },
        "pagination": {
          "enabled": false,
          "maxPages": 1
        }
      },
      "content": {
        "enabled": true,
        "fields": {
          "content": {
            "type": "css",
            "expression": "div.book",
            "attr": "html"
          }
        },
        "pagination": {
          "enabled": false,
          "maxPages": 1
        }
      },
      "fetch": {
        "engine": "http",
        "uaMode": "mobile",
        "autoCookie": true,
        "referer": true,
        "refererChain": true,
        "timeout": 20000,
        "retries": 2,
        "waitMs": 500,
        "browserFallbackStatus": [
          403,
          412,
          429,
          503
        ],
        "hostGateLimit": 2,
        "hostGateConcurrency": 2,
        "globalConcurrency": 6
      },
      "clean": {
        "removeSelectors": [
          "script",
          "style",
          "iframe",
          "ins",
          "noscript",
          "h2",
          ".wanzheng-dl",
          ".dibu-dl",
          "div[style*=\"padding:0 10px\"]",
          "a"
        ],
        "adPatterns": [
          "（本章未完，请翻页）",
          "（本章完）",
          "万本小说\\s*永久免费读",
          "页面篇幅有限.*?算我输！",
          "(www\\.)?yueyouxs\\.com\\S*",
          "(www\\.)?[a-z0-9-]+\\.(com|net|cc|org|info|top|xyz|vip|site)(\\/\\S*)?"
        ],
        "whitelist": [
          "p",
          "br",
          "b",
          "strong",
          "em",
          "i",
          "u",
          "h1",
          "h2",
          "h3"
        ],
        "normalize": true,
        "plainText": false
      }
    },
  },
  {
    key: "yybsw",
    name: "夜伴书屋 (yybsw.com)",
    description: "yybsw.com CF前置直连, DedeCMS 模板 UTF-8。核心坑: 源站 UA 门禁 —— 桌面浏览器 UA 在 /book/*、/list/* 被 Apache 403, 需 uaMode=custom 钉 Android 移动 Chrome UA(实测放行, 模板与桌面一致)。列表=分类真分页页 /list/{slug}{page}.html 的 div.media(书名/作者/简介/封面, 每页10本; dushi{page}.html 116页) / 书籍页 /book/{id} h1.book-name+a[href*=/author/]+状态regex+最近更新regex+div.book-detail 简介+img.book-img-middel 封面 / 目录内嵌书籍页 #all-chapter .col-md-6.item 全量单页 / 正文 #cont-body, 章节子页 _2/_3.html 由\"下一页\"锚翻页(末页\"没有了\"自然收敛)。混合形态站(在线阅读+TXT下载), 走在线层。",
    enabled: true,
    source: "scripts/seed-rule-yybsw.ts",
    config: {
      "list": {
        "enabled": true,
        "urlTemplate": "https://www.yybsw.com/list/dushi{page}.html",
        "itemSelector": {
          "type": "css",
          "expression": "div.media"
        },
        "fields": {
          "name": {
            "type": "css",
            "expression": ".media-title h4 a",
            "attr": "text"
          },
          "bookUrl": {
            "type": "css",
            "expression": ".media-title h4 a",
            "attr": "href"
          },
          "intro": {
            "type": "css",
            "expression": ".media-info",
            "attr": "text"
          },
          "cover": {
            "type": "css",
            "expression": "img.book-img, img.book-img-small",
            "attr": "src"
          }
        },
        "pagination": {
          "enabled": false,
          "maxPages": 1
        }
      },
      "book": {
        "enabled": true,
        "fields": {
          "name": {
            "type": "css",
            "expression": "h1.book-name a",
            "attr": "text"
          },
          "author": {
            "type": "css",
            "expression": "a[href*=\"/author/\"]",
            "attr": "text"
          },
          "status": {
            "type": "regex",
            "expression": "状态[:：]\\s*([^\\s<]{1,12})",
            "attr": "1",
            "flags": "gs"
          },
          "latestChapter": {
            "type": "regex",
            "expression": "最近更新：\\s*<a[^>]*>([^<]{1,80})</a>",
            "attr": "1",
            "flags": "gs"
          },
          "intro": {
            "type": "css",
            "expression": "div.book-detail",
            "attr": "text"
          },
          "cover": {
            "type": "css",
            "expression": "img.book-img-middel",
            "attr": "src"
          }
        }
      },
      "toc": {
        "enabled": true,
        "itemSelector": {
          "type": "css",
          "expression": "#all-chapter .col-md-6.item"
        },
        "fields": {
          "title": {
            "type": "css",
            "expression": "a",
            "attr": "text"
          },
          "url": {
            "type": "css",
            "expression": "a",
            "attr": "href"
          }
        },
        "pagination": {
          "enabled": true,
          "maxPages": 20
        }
      },
      "content": {
        "enabled": true,
        "fields": {
          "content": {
            "type": "css",
            "expression": "#cont-body",
            "attr": "html",
            "replaceFrom": "^(?:\\s|<script[\\s\\S]*?</script>|<p>\\s*</p>|<br\\s*/?>)+|(?:\\s|<script[\\s\\S]*?</script>|<p>\\s*</p>|<br\\s*/?>)+$",
            "replaceTo": ""
          }
        },
        "pagination": {
          "enabled": true,
          "maxPages": 10
        }
      },
      "fetch": {
        "engine": "http",
        "uaMode": "custom",
        "customUa": "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36",
        "autoCookie": true,
        "referer": true,
        "timeout": 25000,
        "retries": 2,
        "waitMs": 800,
        "browserFallbackStatus": [
          403,
          412,
          429,
          503
        ],
        "hostGateLimit": 3
      },
      "clean": {
        "removeSelectors": [
          "script",
          "style",
          "iframe",
          "ins",
          "noscript",
          ".adsbygoogle"
        ],
        "adPatterns": [
          "(www\\.)?yybsw\\.com\\S*",
          "(www\\.)?ybsw[o8aws]?\\.com\\S*",
          "夜伴书屋[^<>]*",
          "完美书库[^<>]*",
          "本站内容来源于网络[^。<>]*",
          "本站所收录作品[^<>]*",
          "请记住本站[^<>]*",
          "(www\\.)?[a-z0-9-]+\\.(com|net|cc|org|info|top|xyz|vip|site)(\\/\\S*)?"
        ],
        "whitelist": [
          "p",
          "br",
          "b",
          "strong",
          "em",
          "i",
          "u",
          "h1",
          "h2",
          "h3",
          "h4",
          "h5",
          "h6"
        ],
        "normalize": true,
        "plainText": false
      }
    },
  },
  {
    key: "zxcs",
    name: "知轩藏书(www.zxcs.click)·TXT资源站采集",
    description: "zxcs.click 直连无防护 UTF-8 SSR 站(TXT 下载站)。列表=分类页 li.book-li(.book-title 书名/span.author 作者/.book-intro 简介/.cover style 封面, /dushi/list_{page}.html 分页) / 书籍页 h1.book-info__title+a.book-info__author+div.intro-content 简介+img.book-cover__img 封面 / 目录与正文段 enabled:false —— 全站无在线阅读与章节页(仅整本 TXT 下载 /download/{id} JS桥页), 不提供 per-chapter 采集。",
    enabled: true,
    source: "scripts/seed-rule-zxcs.ts",
    config: {
      "list": {
        "enabled": true,
        "urlTemplate": "https://www.zxcs.click/dushi/list_{page}.html",
        "itemSelector": {
          "type": "css",
          "expression": "li.book-li"
        },
        "fields": {
          "name": {
            "type": "css",
            "expression": ".book-title",
            "attr": "text"
          },
          "bookUrl": {
            "type": "css",
            "expression": "div.book-head a",
            "attr": "href"
          },
          "author": {
            "type": "css",
            "expression": "span.author",
            "attr": "text"
          },
          "intro": {
            "type": "css",
            "expression": ".book-intro",
            "attr": "text"
          },
          "cover": {
            "type": "css",
            "expression": "div.cover",
            "attr": "style",
            "replaceFrom": "^.*url\\(([^)]*)\\).*$",
            "replaceTo": "$1"
          },
          "category": {
            "type": "css",
            "expression": "span.rect a",
            "attr": "text"
          }
        }
      },
      "book": {
        "enabled": true,
        "fields": {
          "name": {
            "type": "css",
            "expression": "h1.book-info__title",
            "attr": "text"
          },
          "author": {
            "type": "css",
            "expression": "a.book-info__author",
            "attr": "text"
          },
          "category": {
            "type": "css",
            "expression": "p.book-info__categories a.category",
            "attr": "text"
          },
          "intro": {
            "type": "css",
            "expression": "div.intro-content",
            "attr": "html"
          },
          "cover": {
            "type": "css",
            "expression": "img.book-cover__img",
            "attr": "src"
          }
        }
      },
      "toc": {
        "enabled": false,
        "fields": {},
        "pagination": {
          "enabled": false,
          "maxPages": 1
        }
      },
      "content": {
        "enabled": false,
        "fields": {},
        "pagination": {
          "enabled": false,
          "maxPages": 1
        }
      },
      "fetch": {
        "engine": "http",
        "uaMode": "rotate",
        "autoCookie": true,
        "referer": true,
        "timeout": 20000,
        "retries": 2,
        "waitMs": 800,
        "browserFallbackStatus": [
          403,
          412,
          429,
          503
        ]
      },
      "clean": {
        "removeSelectors": [
          "script",
          "style",
          "iframe",
          "ins",
          "noscript",
          ".adsbygoogle"
        ],
        "adPatterns": [
          "(www\\.)?zxcs\\.click\\S*",
          "知轩藏书[^<>]*",
          "本站所有小说[^<>]*",
          "(www\\.)?[a-z0-9-]+\\.(com|net|cc|org|info|top|xyz|vip|site)(\\/\\S*)?"
        ],
        "whitelist": [
          "p",
          "br",
          "b",
          "strong",
          "em",
          "i",
          "u",
          "h1",
          "h2",
          "h3",
          "h4",
          "h5",
          "h6"
        ],
        "normalize": true,
        "plainText": false
      }
    },
  },
]

/** 按 key 查找内置规则 */
export function findBuiltinRule(key: string): BuiltinRule | undefined {
  return BUILTIN_RULES.find((r) => r.key === key)
}

/** 按规则名查找(幂等导入的查重口径) */
export function findBuiltinRuleByName(name: string): BuiltinRule | undefined {
  return BUILTIN_RULES.find((r) => r.name === name)
}
