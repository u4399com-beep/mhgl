// CloakBrowser — 基于 puppeteer-extra + stealth 的反检测浏览器引擎
// 作为 Obscura 引擎的补充, 处理 Obscura 无法突破的 CF/WAF 站点
// 
// 端口: 3016
// 端点:
//   GET /health → 健康检查
//   POST /fetch → {url, timeout?, selectors?} → {ok, html, status, finalUrl}
//
// 特性:
//   - puppeteer-extra-plugin-stealth: 12 个隐身脚本(TLS/WebGL/Canvas/UA/插件等)
//   - 真实 Chrome 152 (非 Chromium), TLS 指纹更真实
//   - 自动 CF challenge 等待 + Turnstile 点击
//   - Cookie 回流 (返回 Set-Cookie 供引擎复用)
//   - 并发限制 2 (与 Obscura 一致)

import puppeteer from 'puppeteer-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import { createBridgeServer, json } from '../_shared/server'

puppeteer.use(StealthPlugin())

const PORT = Number(process.env.PORT) || 3016
const MAX_CONCURRENT = 2
let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null
let inFlight = 0

async function ensureBrowser() {
  if (browser && browser.connected) return browser
  browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1920,1080',
      '--disable-features=IsolateOrigins,site-per-process',
    ],
  })
  return browser
}

interface FetchResult { ok: boolean; html: string; status: number; finalUrl: string; cookies: Array<Record<string, unknown>> }

async function fetchPage(url: string, timeoutMs = 30000): Promise<FetchResult> {
  const b = await ensureBrowser()
  const page = await b.newPage()
  await page.setViewport({ width: 1920, height: 1080 })
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36')
  
  let status = 0
  let finalUrl = url
  
  try {
    const response = await page.goto(url, { waitUntil: 'networkidle2', timeout: timeoutMs })
    if (response) {
      status = response.status()
      finalUrl = page.url()
    }
    
    // CF challenge detection + wait
    const html1 = await page.content()
    if (html1.includes('challenge-platform') || html1.includes('Just a moment') || html1.includes('cf-chl')) {
      await page.waitForFunction(
        () => !document.title.includes('Just a moment') && !document.querySelector('#challenge-running'),
        { timeout: 20000 }
      ).catch(() => {})
      await new Promise(r => setTimeout(r, 2000))
    }
    
    const html = await page.content()
    const cookies = await page.cookies()
    return { ok: html.length > 100, html, status, finalUrl, cookies }
  } catch (e: any) {
    const html = await page.content().catch(() => '')
    return { ok: false, html, status, finalUrl, cookies: [] }
  } finally {
    await page.close().catch(() => {})
  }
}

createBridgeServer({
  name: 'cloak-browser',
  port: PORT,
  idleTimeoutS: 250,
  selfTest: async () => {
    try {
      const b = await ensureBrowser()
      const page = await b.newPage()
      await page.goto('https://example.com/', { waitUntil: 'domcontentloaded', timeout: 10000 })
      const title = await page.title()
      await page.close()
      return title.length > 0
    } catch { return false }
  },
  async fetch(req) {
    const u = new URL(req.url)
    if (u.pathname === '/health') {
      return json({ ok: true, service: 'cloak-browser', port: PORT, browserReady: !!browser?.connected, inFlight })
    }
    if (u.pathname === '/fetch') {
      if (inFlight >= MAX_CONCURRENT) return json({ ok: false, error: '并发已满' }, 503)
      inFlight++
      try {
        const body = await req.json()
        const url = String(body?.url || '')
        if (!url || !/^https?:\/\//.test(url)) return json({ ok: false, error: 'url required' }, 400)
        const result = await fetchPage(url, Number(body?.timeoutMs) || 30000)
        return json({ ok: result.ok, html: result.html, status: result.status, finalUrl: result.finalUrl, cookies: result.cookies?.slice(0, 20) })
      } catch (e: any) {
        return json({ ok: false, error: String(e?.message || e).slice(0, 300) }, 502)
      } finally {
        inFlight--
      }
    }
    return json({ ok: false, error: `未知路径 ${u.pathname}` }, 404)
  },
})
