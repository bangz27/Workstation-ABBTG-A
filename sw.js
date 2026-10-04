/* ABBTG-A Workstation service worker
   - HTML / navigation: network-first (always fresh), cached copy only when offline
   - static assets (css/js/icons/fonts/supabase-js CDN): stale-while-revalidate, versioned cache
   - Supabase API / auth (bkmvwgoldyrzmgvmeskp.supabase.co): NEVER cached, passed straight through */
'use strict';
var VERSION = '20261004pos';
var CACHE = 'abbtga-ws-' + VERSION;
var CORE = ['./', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];
var SUPABASE_HOST = 'bkmvwgoldyrzmgvmeskp.supabase.co';
var STATIC_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.jsdelivr.net'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(CORE); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('abbtga-ws-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function isStatic(url) {
  if (url.origin === self.location.origin) return /\.(css|js|png|jpe?g|svg|ico|webmanifest|woff2?)$/i.test(url.pathname) && !/\/sw\.js$/.test(url.pathname);
  return STATIC_HOSTS.indexOf(url.hostname) >= 0;
}
function put(req, res) {
  if (res && (res.ok || res.type === 'opaque')) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
  return res;
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;                       // writes etc. → network
  var url = new URL(req.url);
  if (url.hostname === SUPABASE_HOST || url.hostname.slice(-12) === '.supabase.co') return;   // API/auth: never cache
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return;

  if (req.mode === 'navigate' || (req.headers.get('accept') || '').indexOf('text/html') >= 0) {
    e.respondWith(fetch(req).then(function (res) {
      if (res.ok && url.origin === self.location.origin) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put('./', copy); }); }
      return res;
    }).catch(function () {
      return caches.match(req, { ignoreSearch: true }).then(function (m) { return m || caches.match('./'); });
    }));
    return;
  }
  if (isStatic(url)) {
    e.respondWith(caches.match(req).then(function (hit) {
      var net = fetch(req).then(function (res) { return put(req, res); });
      if (hit) { e.waitUntil(net.catch(function () {})); return hit; }
      return net;
    }));
  }
  // anything else: default network behaviour
});
