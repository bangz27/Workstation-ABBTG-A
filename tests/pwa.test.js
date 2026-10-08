'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const manifest = JSON.parse(read('manifest.webmanifest'));
const sw = read('sw.js');
const pwa = read('assets/pwa.js');
const rootHtml = read('index.html');
const weeklyHtml = read('weekly-off/index.html');
const weeklyJs = read('weekly-off/weekly-off.js');
const offlineStore = read('weekly-off/offline-store.js');

function pngDimensions(file) {
  const bytes = fs.readFileSync(path.join(root, file));
  assert.equal(bytes.toString('hex', 0, 8), '89504e470d0a1a0a');
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

test('manifest is installable and references real 192/512 PNG and maskable icons', () => {
  assert.equal(manifest.name, 'Workstation ABBTG-A');
  assert.equal(manifest.short_name, 'Workstation ABBTG-A');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  for (const [size, purpose] of [[192, 'any'], [512, 'any'], [512, 'maskable']]) {
    const icon = manifest.icons.find((candidate) => candidate.sizes === `${size}x${size}` && candidate.purpose === purpose);
    assert.ok(icon, `missing ${size}x${size} ${purpose} icon`);
    assert.equal(icon.type, 'image/png');
    assert.deepEqual(pngDimensions(icon.src), [size, size]);
  }
  assert.ok(manifest.shortcuts.some((item) => item.url === './weekly-off/'));
});

test('root and standalone Weekly Off use the same root manifest and shared worker bootstrap', () => {
  assert.match(rootHtml, /rel="manifest" href="manifest\.webmanifest"/);
  assert.match(rootHtml, /name="apple-mobile-web-app-title" content="Workstation ABBTG-A"/);
  assert.match(rootHtml, /name="application-name" content="Workstation ABBTG-A"/);
  assert.match(rootHtml, /assets\/pwa\.js/);
  assert.match(weeklyHtml, /rel="manifest" href="\.\.\/manifest\.webmanifest"/);
  assert.match(weeklyHtml, /name="application-name" content="Workstation ABBTG-A"/);
  assert.match(weeklyHtml, /\.\.\/assets\/pwa\.js/);
  assert.match(weeklyHtml, /offline-store\.js/);
  assert.match(pwa, /new URL\('sw\.js', appRoot\)/);
  assert.match(pwa, /scope:appRoot\.pathname/);
  assert.ok(fs.existsSync(path.join(root, 'weekly-off/index.html'))); // /weekly-off, /weekly-off/, and /weekly-off/index.html share this shell
});

test('the existing worker caches route-correct shells for /, /weekly-off, and /weekly-off/index.html', () => {
  assert.match(sw, /path === '' \|\| path === 'index\.html'/);
  assert.match(sw, /path === 'weekly-off' \|\| path === 'weekly-off\/' \|\| path === 'weekly-off\/index\.html'/);
  assert.match(sw, /Response\.redirect\(new URL\('weekly-off\/'/);
  assert.match(sw, /weekly-off\/index\.html/);
  assert.match(sw, /var VERSION = '20261009pwaidentity1'/);
});

test('service worker bypasses Supabase, credentials, tokens and non-GET data requests before caching', () => {
  const guard = sw.indexOf('if (mustNotCache(request, url)) return;');
  const respond = sw.indexOf('event.respondWith');
  assert.ok(guard >= 0 && respond > guard);
  assert.match(sw, /request\.headers\.has\('authorization'\)/);
  assert.match(sw, /request\.headers\.has\('cookie'\)/);
  assert.match(sw, /hostname\.slice\(-SUPABASE_SUFFIX\.length\)/);
  assert.match(sw, /access_token.*refresh_token.*id_token.*token.*code/);
  assert.match(sw, /request\.method !== 'GET'/);
  assert.match(weeklyJs, /cache:'no-store'/);
  assert.match(weeklyJs, /Authorization:'Bearer '\+state\.session\.access_token/);
  assert.doesNotMatch(offlineStore, /access_token|refresh_token/);
});

test('Weekly Off refreshes automatically when connectivity returns and labels cached freshness', () => {
  assert.match(weeklyJs, /addEventListener\('online'/);
  assert.match(weeklyJs, /if\(isAuthenticated\).*load\(\)/s);
  assert.match(weeklyJs, /ออฟไลน์ · ข้อมูลล่าสุด/);
  assert.match(weeklyJs, /ออนไลน์ · อัปเดตล่าสุด/);
  assert.match(weeklyJs, /OfflineStore\.save\(session,result\[0\],result\[1\],savedAt\)/);
});
