/* Register the single root-scoped ABBTG-A service worker from any app page. */
(function () {
  'use strict';
  if (!('serviceWorker' in navigator)) return;
  var current = document.currentScript;
  if (!current || !current.src) return;
  var appRoot = new URL('../', current.src);
  var workerUrl = new URL('sw.js', appRoot);
  window.addEventListener('load', function () {
    navigator.serviceWorker.register(workerUrl.href, {scope:appRoot.pathname}).catch(function (error) {
      try { console.warn('Service worker registration failed', error); } catch (_) {}
    });
  });
})();
