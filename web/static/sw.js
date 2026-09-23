/* ============================================================
   mhgl Service Worker (R56-2c PWA 补全)
   缓存策略:
     · /static/ 静态资源 → cache-first(命中直返, 后台更新缓存)
     · 页面导航(HTML)    → network-first(失败回落缓存, 再回落 offline.html)
     · /api/ 与 /admin/  → 永不缓存直通网络
   版本升级: 递增 CACHE 版本号, activate 清理旧缓存。
   ============================================================ */
(function () {
  'use strict';
  var CACHE = 'mhgl-pwa-v2';
  var PRECACHE = [
    '/offline.html',
    '/manifest.webmanifest',
    '/static/icons/icon-192.png',
    '/static/icons/icon-512.png',
    '/static/css/site.css',
    '/static/css/pili.css',
    '/static/css/shipsay.css',
    '/static/css/x2552.css',
    '/static/css/kks101.css',
    '/static/js/site.js'
  ];

  self.addEventListener('install', function (e) {
    e.waitUntil(
      caches.open(CACHE).then(function (c) {
        return Promise.all(PRECACHE.map(function (u) {
          return c.add(u).catch(function () { /* 单项失败不阻塞安装 */ });
        })).then(function () { return self.skipWaiting(); });
      })
    );
  });

  self.addEventListener('activate', function (e) {
    e.waitUntil(
      caches.keys().then(function (keys) {
        return Promise.all(keys.map(function (k) {
          return k === CACHE ? null : caches.delete(k);
        }));
      }).then(function () { return self.clients.claim(); })
    );
  });

  self.addEventListener('fetch', function (e) {
    var req = e.request;
    if (req.method !== 'GET') return;
    var url = new URL(req.url);
    if (url.origin !== self.location.origin) return;
    if (url.pathname.indexOf('/api/') === 0 || url.pathname.indexOf('/admin') === 0) return;

    // 静态资源: cache-first
    if (url.pathname.indexOf('/static/') === 0 || url.pathname === '/manifest.webmanifest' || url.pathname === '/favicon.ico') {
      e.respondWith(
        caches.match(req).then(function (hit) {
          if (hit) {
            // 后台刷新缓存(stale-while-revalidate 简化档)
            fetch(req).then(function (res) {
              if (res && res.ok) caches.open(CACHE).then(function (c) { c.put(req, res); });
            }).catch(function () {});
            return hit;
          }
          return fetch(req).then(function (res) {
            if (res && res.ok) {
              var copy = res.clone();
              caches.open(CACHE).then(function (c) { c.put(req, copy); });
            }
            return res;
          });
        })
      );
      return;
    }

    // 页面导航: network-first → 缓存 → offline
    if (req.mode === 'navigate' || (req.headers.get('accept') || '').indexOf('text/html') !== -1) {
      e.respondWith(
        fetch(req).then(function (res) {
          if (res && res.ok) {
            var copy = res.clone();
            caches.open(CACHE).then(function (c) { c.put(req, copy); });
          }
          return res;
        }).catch(function () {
          return caches.match(req).then(function (hit) {
            if (hit) return hit;
            return caches.match('/offline.html');
          });
        })
      );
    }
  });
})();
