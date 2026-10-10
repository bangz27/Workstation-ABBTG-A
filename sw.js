/* ABBTG-A Workstation service worker
   - Network-first for the root and Weekly Off HTML shells, with route-correct offline fallback.
   - Cache only static same-origin assets and approved public CDN assets.
   - Never cache Supabase/auth requests, requests carrying Authorization, or token-bearing URLs.
   - Weekly Off data is kept separately by the authenticated page, not in Cache Storage.
*/
'use strict';
var VERSION = '20261011kpiorder1';
var CACHE = 'abbtga-ws-' + VERSION;
var SCOPE_URL = new URL(self.registration.scope);
var SUPABASE_SUFFIX = '.supabase.co';
var STATIC_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.jsdelivr.net'];
var CORE = [
  'index.html', 'manifest.webmanifest',
  'icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/workforce-icon.svg',
  'assets/style.css', 'assets/config.js', 'assets/api.js', 'assets/driver.js', 'assets/roster.js',
  'assets/leave.js', 'assets/auth.js', 'assets/home.js', 'assets/shell.js', 'assets/pwa.js',
  'weekly-off/index.html', 'weekly-off/manifest.webmanifest', 'weekly-off/weekly-off-apple-touch-icon.png', 'weekly-off/weekly-off.css', 'weekly-off/core.js',
  'weekly-off/weekly-off.js', 'weekly-off/offline-store.js'
].map(function (path) { return new URL(path, SCOPE_URL).href; });
var OPTIONAL = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.js'
];

function inScope(url) {
  return url.origin === SCOPE_URL.origin && url.pathname.indexOf(SCOPE_URL.pathname) === 0;
}
function relativePath(url) {
  return url.pathname.slice(SCOPE_URL.pathname.length).replace(/^\/+/, '');
}
function shellKey(url) {
  if (!inScope(url)) return null;
  var path = relativePath(url);
  if (path === '' || path === 'index.html') return new URL('index.html', SCOPE_URL).href;
  if (path === 'weekly-off' || path === 'weekly-off/' || path === 'weekly-off/index.html') {
    return new URL('weekly-off/index.html', SCOPE_URL).href;
  }
  return null;
}
function hasSensitiveQuery(url) {
  var keys = ['access_token', 'refresh_token', 'id_token', 'token', 'code'];
  return keys.some(function (key) { return url.searchParams.has(key); });
}
function mustNotCache(request, url) {
  return request.headers.has('authorization') || request.headers.has('cookie') ||
    url.hostname === 'supabase.co' || url.hostname.slice(-SUPABASE_SUFFIX.length) === SUPABASE_SUFFIX ||
    hasSensitiveQuery(url);
}
function isStatic(url) {
  if (url.origin === SCOPE_URL.origin) {
    if (!inScope(url)) return false;
    var path = relativePath(url);
    if (/(^|\/)(api|auth|rest|functions)(\/|$)/i.test(path)) return false;
    return /\.(css|js|png|jpe?g|svg|ico|webmanifest|woff2?)$/i.test(path) && path !== 'sw.js';
  }
  return STATIC_HOSTS.indexOf(url.hostname) >= 0;
}
function cacheable(response) {
  return !!response && (response.ok || response.type === 'opaque');
}

self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(CACHE).then(function (cache) {
    return cache.addAll(CORE).then(function () {
      return Promise.all(OPTIONAL.map(function (url) {
        return cache.add(url).catch(function () { return null; });
      }));
    });
  }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (key) {
      return key.indexOf('abbtga-ws-') === 0 && key !== CACHE;
    }).map(function (key) { return caches.delete(key); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;
  var url = new URL(request.url);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return;
  if (mustNotCache(request, url)) return;

  if (request.mode === 'navigate' || (request.headers.get('accept') || '').indexOf('text/html') >= 0) {
    var key = shellKey(url);
    if (!key) return;
    event.respondWith(fetch(request).then(function (response) {
      if (!response.ok) return response;
      return caches.open(CACHE).then(function (cache) {
        return cache.put(key, response.clone()).catch(function () {}).then(function () { return response; });
      });
    }).catch(function () {
      if (relativePath(url) === 'weekly-off') {
        return Response.redirect(new URL('weekly-off/', SCOPE_URL).href, 302);
      }
      return caches.open(CACHE).then(function (cache) {
        return cache.match(key).then(function (cached) { return cached || Response.error(); });
      });
    }));
    return;
  }

  if (!isStatic(url)) return;
  event.respondWith(caches.open(CACHE).then(function (cache) {
    return cache.match(request, {ignoreSearch:true}).then(function (cached) {
      if (cached) return cached;
      return fetch(request).then(function (response) {
        if (!cacheable(response)) return response;
        return cache.put(request, response.clone()).catch(function () {}).then(function () { return response; });
      });
    });
  }));
});
