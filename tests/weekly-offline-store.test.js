'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../weekly-off/offline-store.js'), 'utf8');
function createStore() {
  const values = new Map();
  const window = {localStorage:{
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  }};
  vm.runInNewContext(source, {window, Date, Intl});
  return {store:window.WeeklyOffOfflineStore, values};
}

test('offline snapshots are scoped to authenticated user IDs and contain only the dataset', () => {
  const {store, values} = createStore();
  const session = {access_token:'do-not-store-this-token', user:{id:'user-a', is_anonymous:false}};
  const fleet = [{driver_id:'F1', staff_name:'Sample Fleet'}];
  const ops = [{ops_id:'O1', staff_name:'Sample Ops'}];
  assert.equal(store.save(session, fleet, ops, '2026-10-08T10:00:00.000Z'), true);
  assert.deepEqual(JSON.parse(JSON.stringify(store.load(session))), {
    userId:'user-a', savedAt:'2026-10-08T10:00:00.000Z', fleet, ops
  });
  assert.equal(JSON.stringify([...values.values()]).includes('do-not-store-this-token'), false);
  assert.equal(JSON.stringify([...values.values()]).includes('access_token'), false);
});

test('anonymous and different authenticated users cannot read a cached user’s snapshot', () => {
  const {store} = createStore();
  const userA = {access_token:'token-a', user:{id:'user-a', is_anonymous:false}};
  const userB = {access_token:'token-b', user:{id:'user-b', is_anonymous:false}};
  const anonymousA = {access_token:'token-anon', user:{id:'user-a', is_anonymous:true}};
  assert.equal(store.save(userA, [{driver_id:'F1'}], [], '2026-10-08T10:00:00.000Z'), true);
  assert.equal(store.load(userB), null);
  assert.equal(store.load(anonymousA), null);
  assert.equal(store.save(anonymousA, [{driver_id:'F2'}], [], '2026-10-08T10:01:00.000Z'), false);
});

test('sign-out can clear only the current user’s offline snapshot', () => {
  const {store} = createStore();
  const userA = {user:{id:'user-a', is_anonymous:false}};
  const userB = {user:{id:'user-b', is_anonymous:false}};
  store.save(userA, [{driver_id:'F1'}], [], '2026-10-08T10:00:00.000Z');
  store.save(userB, [{driver_id:'F2'}], [], '2026-10-08T10:00:00.000Z');
  assert.equal(store.clear(userA), true);
  assert.equal(store.load(userA), null);
  assert.equal(store.load(userB).fleet[0].driver_id, 'F2');
});
