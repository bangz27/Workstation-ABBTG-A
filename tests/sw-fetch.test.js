'use strict';
/* Runs sw.js in a sandbox with mocked fetch / Cache Storage to check the fetch strategies. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
const ORIGIN = 'https://app.test';

class FakeResponse {
  constructor(body, ok = true) { this.body = body; this.ok = ok; this.status = ok ? 200 : 500; this.type = 'basic'; }
  clone() { return new FakeResponse(this.body, this.ok); }
  static error() { return new FakeResponse('ERROR', false); }
}

function strip(u) { const x = new URL(u); return x.origin + x.pathname; }

function setup({network, timeoutNow = false} = {}) {
  const store = new Map();
  const cache = {
    async match(req, opts) {
      const u = typeof req === 'string' ? req : req.url;
      if (store.has(u)) return store.get(u).clone();
      if (opts && opts.ignoreSearch) for (const [k, v] of store) if (strip(k) === strip(u)) return v.clone();
      return undefined;
    },
    async put(req, res) { store.set(typeof req === 'string' ? req : req.url, res); },
    async addAll() {}, async add() {}
  };
  const fetchCalls = [];
  const handlers = {};
  const context = {
    URL, Promise, Response: FakeResponse,
    setTimeout: timeoutNow ? (fn) => { setImmediate(fn); return 1; } : setTimeout,
    clearTimeout,
    caches: { open: async () => cache, keys: async () => [], delete: async () => true, match: cache.match },
    fetch: (req, init) => { fetchCalls.push({url: req.url, init}); return network(req.url); },
    self: {
      registration: {scope: ORIGIN + '/'},
      addEventListener(type, fn) { handlers[type] = fn; },
      skipWaiting() {}, clients: {claim() {}}
    }
  };
  vm.runInNewContext(source, context);
  async function request(url, {headers = {}} = {}) {
    const req = {method: 'GET', url, mode: 'no-cors', headers: {
      has: (k) => k in headers, get: (k) => headers[k] || null
    }};
    let responded = null;
    handlers.fetch({request: req, respondWith(p) { responded = p; }, waitUntil() {}});
    return responded ? await responded : 'passthrough';
  }
  return {store, request, fetchCalls};
}

test('same-origin JS is network-first: a new deploy replaces the cached copy', async () => {
  const sw = setup({network: async () => new FakeResponse('new home.js')});
  sw.store.set(ORIGIN + '/assets/home.js', new FakeResponse('old home.js'));
  const res = await sw.request(ORIGIN + '/assets/home.js?v=123');
  assert.equal(res.body, 'new home.js');
  assert.equal(sw.fetchCalls[0].init.cache, 'no-cache');
  assert.equal(sw.store.get(ORIGIN + '/assets/home.js').body, 'new home.js');
});

test('manifest and CSS are also network-first', async () => {
  const sw = setup({network: async (u) => new FakeResponse('fresh ' + new URL(u).pathname)});
  sw.store.set(ORIGIN + '/manifest.webmanifest', new FakeResponse('stale'));
  sw.store.set(ORIGIN + '/assets/style.css', new FakeResponse('stale'));
  assert.equal((await sw.request(ORIGIN + '/manifest.webmanifest')).body, 'fresh /manifest.webmanifest');
  assert.equal((await sw.request(ORIGIN + '/assets/style.css?v=1')).body, 'fresh /assets/style.css');
});

test('offline: JS falls back to the cached copy (ignoring ?v=)', async () => {
  const sw = setup({network: async () => { throw new TypeError('offline'); }});
  sw.store.set(ORIGIN + '/weekly-off/weekly-off.js', new FakeResponse('cached weekly-off.js'));
  const res = await sw.request(ORIGIN + '/weekly-off/weekly-off.js?v=20261012referenceui1');
  assert.equal(res.body, 'cached weekly-off.js');
});

test('slow network: cached copy is served after the timeout', async () => {
  const sw = setup({network: () => new Promise(() => {}), timeoutNow: true});
  sw.store.set(ORIGIN + '/assets/home.js', new FakeResponse('cached home.js'));
  const res = await sw.request(ORIGIN + '/assets/home.js?v=1');
  assert.equal(res.body, 'cached home.js');
});

test('server error does not overwrite the cached copy', async () => {
  const sw = setup({network: async () => new FakeResponse('boom', false)});
  sw.store.set(ORIGIN + '/assets/home.js', new FakeResponse('good home.js'));
  const res = await sw.request(ORIGIN + '/assets/home.js');
  assert.equal(res.ok, false);
  assert.equal(sw.store.get(ORIGIN + '/assets/home.js').body, 'good home.js');
});

test('images stay cache-first (no network request when cached)', async () => {
  const sw = setup({network: async () => new FakeResponse('network png')});
  sw.store.set(ORIGIN + '/icons/icon-192.png', new FakeResponse('cached png'));
  const res = await sw.request(ORIGIN + '/icons/icon-192.png');
  assert.equal(res.body, 'cached png');
  assert.equal(sw.fetchCalls.length, 0);
});

test('Supabase and Authorization requests are never intercepted', async () => {
  const sw = setup({network: async () => new FakeResponse('x')});
  assert.equal(await sw.request('https://abc.supabase.co/rest/v1/table'), 'passthrough');
  assert.equal(await sw.request(ORIGIN + '/assets/api.js', {headers: {authorization: 'Bearer t'}}), 'passthrough');
});
