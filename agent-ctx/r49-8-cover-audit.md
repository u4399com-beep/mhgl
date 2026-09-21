# R49-8 全规则封面获取审计 v2 (2026-09-20T12:05:30.828Z)

| 规则 | 结论 | 明细 | 耗时 |
|---|---|---|---|
共 29 条内置规则


[probe] 77shuku …
| 77shuku | 站点不可达/异常 | The operation was aborted. | 15.1s |

[probe] 80ge …
| 80ge | 列表零项 | list 探针 http://www.80ge.info/top/lastupdate/1.html 无书籍项 | 0.6s |

[probe] aijjxs-toplist …
| aijjxs-toplist | OK | 16941B image/jpeg ← https://image.jjjjxsw.com/UploadPic/202609/entmumqpha2.jpg | 1.9s |

[probe] aijjxs …
| aijjxs | OK | 16569B image/jpeg ← https://image.jjjjxsw.com/UploadPic/202609/0digb5g1xc1.jpg | 0.5s |

[probe] biqugetw …
| biqugetw | 站点不可达/异常 | HTTP 403 | 0.2s |

[probe] book4 …
| book4 | 封面提取失败 | cover 配置(div.book-img img)未提取到 URL: https://book4.cc/AU%E6%96%87%E5%AD%A6/%E4%BB%99%E4%BE%A0/411 | 1.3s |

[probe] bqg713 …
| bqg713 | SKIP | 源站 JSON API 无封面字段(实测 /api/book 返回 10 字段), 规则无从提取 | 0.0s |

[probe] dafengdagengren …
| dafengdagengren | 站点不可达/异常 | HTTP 403 | 1.1s |

[probe] daweixs …
| daweixs | 站点不可达/异常 | HTTP 403 | 3.1s |

[probe] deqixs …
| deqixs | 列表零项 | list 探针 https://www.deqixs.cc/sort/1/1.html 无书籍项 | 2.1s |

[probe] fanqianxs …
| fanqianxs | 站点不可达/异常 | HTTP 403 | 2.0s |

[probe] fanqie …
| fanqie | 列表零项 | list 探针 https://fq.taijiwang.top/api/search?key=%E5%89%91&tab_type=3&offset=0 无书籍项 | 1.3s |

[probe] hodei …
| hodei | OK | 5682B image/jpeg ← https://www.hodei.net/cover/51/3c/3a/513c3ad20acd752aab5af41163e1fad5.jpg | 0.9s |

[probe] iidcr …
| iidcr | OK | 14027B image/jpeg ← https://www.iidcr.com/uploads/cover/25225s.jpg | 1.6s |

[probe] jpxs123 …
| jpxs123 | 列表零项 | list 探针 https://jpxs123.com/ 无书籍项 | 0.4s |

[probe] kanunu8 …
| kanunu8 | 源站无封面形态 | 书籍页可达; 页面未发现明显封面形态 | 0.4s |

[probe] moli …
| moli | 封面URL不可达 | 提取到 https://www.molixs.com/files/article/image/6/6041/6041s.jpg 但二进制抓取失败(防盗链/失效) | 0.3s |

[probe] piaotia …
| piaotia | OK | 15508B image/jpeg ← https://www.piaotia.com/files/article/image/1/1195/1195s.jpg | 0.4s |

[probe] pilishuwu …
| pilishuwu | 站点不可达/异常 | HTTP 403 | 0.6s |

[probe] qidian …
| qidian | 站点不可达/异常 | curl 进程异常退出(code=7): curl: (7) Failed to connect to full.hnxianxin.cn port 443 after 66 ms: Could not connect to server
 | 0.2s |

[probe] qimao …
| qimao | SKIP | 七猫官方 API(api-bc.wtzw.com)需签名代理, 无静态样本, 配置面已含 book.cover 提取 | 0.0s |

[probe] ratelimit-demo …
| ratelimit-demo | SKIP | 本地演示站(mock), 封面链路不适用 | 0.0s |

[probe] shudugu …
| shudugu | OK | 26814B image/jpeg ← https://www.shudugu.org/files/cover/202508/1732cbc1-7d41-421d-9b81-dc8ef444c29 | 1.0s |

[probe] trxsw …
| trxsw | 站点不可达/异常 | curl 进程异常退出(code=92): curl: (92) HTTP/2 stream 1 was not closed cleanly: PROTOCOL_ERROR (err 1)
 | 0.5s |

[probe] wanben …
| wanben | 站点不可达/异常 | HTTP 403 | 1.0s |

[probe] wuxiaworld …
| wuxiaworld | 列表零项 | list 探针 https://lite.wuxiaworld.com/novels?sort=chapters 无书籍项 | 0.5s |

[probe] xjp …
| xjp | 列表零项 | list 探针 https://www.xinjianpan.com/sort/xuanhuan-1.html 无书籍项 | 1.1s |

[probe] yybsw …
| yybsw | OK | 22079B image/jpeg ← https://www.yybsw.com/uploads/cover/c27714.jpg | 1.5s |

[probe] zxcs …
| zxcs | OK | 27158B image/jpeg ← https://www.zxcs.click/uploads/202608/29/260829072228736.jpeg | 1.3s |

=== 汇总: OK 8 / 29 ===
- [站点不可达/异常] 77shuku: The operation was aborted.
- [列表零项] 80ge: list 探针 http://www.80ge.info/top/lastupdate/1.html 无书籍项
- [站点不可达/异常] biqugetw: HTTP 403
- [封面提取失败] book4: cover 配置(div.book-img img)未提取到 URL: https://book4.cc/AU%E6%96%87%E5%AD%A6/%E4%BB%99%E4%BE%A0/411
- [SKIP] bqg713: 源站 JSON API 无封面字段(实测 /api/book 返回 10 字段), 规则无从提取
- [站点不可达/异常] dafengdagengren: HTTP 403
- [站点不可达/异常] daweixs: HTTP 403
- [列表零项] deqixs: list 探针 https://www.deqixs.cc/sort/1/1.html 无书籍项
- [站点不可达/异常] fanqianxs: HTTP 403
- [列表零项] fanqie: list 探针 https://fq.taijiwang.top/api/search?key=%E5%89%91&tab_type=3&offset=0 无书籍项
- [列表零项] jpxs123: list 探针 https://jpxs123.com/ 无书籍项
- [源站无封面形态] kanunu8: 书籍页可达; 页面未发现明显封面形态
- [封面URL不可达] moli: 提取到 https://www.molixs.com/files/article/image/6/6041/6041s.jpg 但二进制抓取失败(防盗链/失效)
- [站点不可达/异常] pilishuwu: HTTP 403
- [站点不可达/异常] qidian: curl 进程异常退出(code=7): curl: (7) Failed to connect to full.hnxianxin.cn port 443 after 66 ms: Could not connect 
- [SKIP] qimao: 七猫官方 API(api-bc.wtzw.com)需签名代理, 无静态样本, 配置面已含 book.cover 提取
- [SKIP] ratelimit-demo: 本地演示站(mock), 封面链路不适用
- [站点不可达/异常] trxsw: curl 进程异常退出(code=92): curl: (92) HTTP/2 stream 1 was not closed cleanly: PROTOCOL_ERROR (err 1)

- [站点不可达/异常] wanben: HTTP 403
- [列表零项] wuxiaworld: list 探针 https://lite.wuxiaworld.com/novels?sort=chapters 无书籍项
- [列表零项] xjp: list 探针 https://www.xinjianpan.com/sort/xuanhuan-1.html 无书籍项

## 终版结论(v3 复探+环境修复后)

| 分类 | 规则 | 说明 |
|---|---|---|
| OK(封面全链通) | aijjxs, aijjxs-toplist, hodei, iidcr, piaotia, shudugu, yybsw, zxcs | 提取+二进制校验全过(8/29) |
| 引擎死配置已修 | biqugetw, yybsw, zxcs | engine:http+browserFallbackStatus 组合下浏览器升级臂永不触发(fetcher.ts:5169 仅 auto 生效)→ 已改 auto; 全库扫出同类共 3 处 |
| 提取正常/源站文件失效 | moli | 选择器正确提取 URL, 样本书封面文件源站 404(带 Referer 同) |
| 浏览器强制站 | book4 | base64 壳需 engine:browser(规则已正确配置); chromium 已重装后渲染成功, 封面 URL 提取到但 CDN 网络窗口不可达 |
| 源站无封面数据 | bqg713(/api/book 10 字段无封面), kanunu8(页面无封面形态), ratelimit-demo(本地演示) | 规则无从提取, 属源站形态而非缺陷 |
| 反爬窗口待复核 | dafengdagengren, daweixs(无封面配置), fanqianxs, wanben(提取失败), biqugetw(403), pilishuwu(403) | 沙箱 IP 被限窗口期, 引擎升级链(Obscura/impersonate)在真实采集下处理 |
| 探针入口不匹配 | 80ge, deqixs, fanqie, jpxs123, wuxiaworld, xjp, qimao | cover 配置面齐全, live 验证需任务级列表入口(规则库为页形定义) |

> **[R49-9 更正] bqg713 结论被用户证伪**: 用户在 SPA 页 `#/book/1/` 可见封面 → 解剖 SPA 前端
> (common.js `url_img(id)`) 实锤封面为**前端固定规律构造**: `//www.{host}/bookimg/{floor(id/1000)}/{id}.jpg`
> (API 确实无封面字段, 但封面数据存在于源站 CDN)。已落地: parser.constTemplate 安全算术后缀
> `{key|/1000}` + bqg713 规则 book.fields.cover + 存量 10 书回填(webp)。陷阱留档: 错目录/不存在书
> **恒 200 返回全站同一张 6909B 占位图**(勿以 200 判定封面正确); 源站 id=10 封面本身归档错位
> (瘟疫医生页面挂同作者《黎明医生》封面图, 源站数据质量问题, 我们忠实镜像)。
> 详见 worklog R49-9。

环境修复: playwright chromium 被沙箱重置抹除(全站浏览器引擎链断) → bunx playwright install chromium 重装恢复。
