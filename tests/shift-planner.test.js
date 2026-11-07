'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
require('../planner/core.js');
const C = globalThis.PlannerCore;
const root = path.join(__dirname, '..');

test('shift list is every 9-hour shift starting on the hour, 0000-0900 to 2300-0800', () => {
  assert.equal(C.SHIFTS.length, 24);
  assert.equal(C.SHIFTS[0], '0000-0900');
  assert.equal(C.SHIFTS[7], '0700-1600');
  assert.equal(C.SHIFTS[15], '1500-0000');
  assert.equal(C.SHIFTS[23], '2300-0800');
});

test('migrate keeps old planner data and drops empty comp slots', () => {
  const d = C.migrate({ settings: { station: 'X' }, employees: [
    { id: 'a', type: 'ops', wid: '1058', name: 'A', shift: '0700-1600', offDays: [5], comp: ['2026-12-10', '', ''] },
    { id: 'b', type: 'driver', wid: '248092', name: 'B', offDays: ['0'], comp: ['', '', ''], status: 'resigned', resignDate: '2026-11-15' }
  ], overrides: { 'a|2026-12-24': '1500-0000' } });
  assert.equal(d.settings.station, 'X');
  assert.equal(d.employees[0].wid, 'Ops1058');
  assert.deepEqual(d.employees[0].comp, ['2026-12-10']);
  assert.deepEqual(d.employees[1].offDays, [0]);
  assert.deepEqual(d.employees[1].comp, []);
  assert.equal(d.overrides['a|2026-12-24'], '1500-0000');
  assert.deepEqual(C.migrate(null).employees, []);
});

test('day value: override > comp > weekly off > shift; resigned and not-yet-started are blank', () => {
  const D = C.migrate({ employees: [{ id: 'a', type: 'driver', wid: '1', name: 'A', shift: '0700-1600', offDays: [5], comp: ['2026-12-10'],
    startDate: '2026-12-02', status: 'resigned', resignDate: '2026-12-30' }], overrides: { 'a|2026-12-24': '__rd', 'a|2026-12-23': '' } });
  const e = D.employees[0];
  assert.deepEqual(C.cellValue(D, e, '2026-12-01'), { v: '', k: 'bl' });           // before start
  assert.equal(C.cellValue(D, e, '2026-12-03').v, '0700-1600');                     // Thursday
  assert.deepEqual(C.cellValue(D, e, '2026-12-04'), { v: 'RD', k: 'rd' });          // Friday = weekly off
  assert.deepEqual(C.cellValue(D, e, '2026-12-10'), { v: 'RD', k: 'cp' });          // comp day
  assert.deepEqual(C.cellValue(D, e, '2026-12-24'), { v: 'RD', k: 'rd', ov: true });
  assert.deepEqual(C.cellValue(D, e, '2026-12-23'), { v: '', k: 'bl', ov: true });
  assert.equal(C.cellValue(D, e, '2026-12-30').v, '');                              // resigned from this day
});

test('month membership and issues', () => {
  const ok = C.newEmp('ops', { wid: 'Ops1', name: 'A', shift: '0700-1600', offDays: [1] });
  assert.equal(C.issue(ok), '');
  assert.equal(C.issue(C.newEmp('driver', { wid: '1', name: 'A', offDays: [1] })), 'ยังไม่ตั้งกะ');
  assert.equal(C.issue(C.newEmp('driver', { wid: '1', name: 'A', shift: '0700-1600' })), 'ยังไม่ตั้งวันหยุด');
  assert.equal(C.issue(C.newEmp('ops', { wid: 'X1', name: 'A', shift: '0700-1600', offDays: [1] })), 'Ops ID ต้องขึ้นต้นด้วย Ops');
  assert.equal(C.inMonth(C.newEmp('driver', { status: 'resigned', resignDate: '2026-12-01' }), '2026-12'), false);
  assert.equal(C.inMonth(C.newEmp('driver', { status: 'resigned', resignDate: '2026-12-15' }), '2026-12'), true);
  assert.equal(C.inMonth(C.newEmp('driver', { startDate: '2027-01-02' }), '2026-12'), false);
  const D = { settings: {}, overrides: {}, employees: [ok, C.newEmp('driver', { wid: '2', name: 'B' })] };
  assert.deepEqual(C.stats(D, '2026-12'), { total: 2, ok: 1, bad: 1, driver: { total: 1, bad: 1 }, ops: { total: 1, bad: 0 } });
});

test('export header and rows follow the FMS Dedicated layout', () => {
  const D = C.migrate({ settings: { station: 'ABBTG-A - บางบัวทอง' }, employees: [
    { id: 'd', type: 'driver', wid: '248092', empId: 'E1', name: 'B', func: 'Pickup+Delivery', shift: '0700-1600', offDays: [5] }] });
  const dates = ['2026-12-03', '2026-12-04'];
  assert.deepEqual(C.headerFor('driver', dates), ['Station Name', 'Driver ID', 'Employee ID', 'Staff Name', 'Function', '2026-12-03(Thursday)', '2026-12-04(Friday)']);
  assert.deepEqual(C.rowFor(D, D.employees[0], dates), ['ABBTG-A - บางบัวทอง', '248092', 'E1', 'B', 'Pickup+Delivery', '0700-1600', 'RD']);
});

test('import from an FMS sheet: weekly off needs a majority, other RD days become comp days', () => {
  const dates = C.daysInMonth('2026-12').map((iso, i) => ({ ci: 3 + i, iso }));
  const row = ['Ops1058', 'A', 'Hub Agent'];
  dates.forEach((d) => { row[d.ci] = C.wdOf(d.iso) === 5 ? 'RD' : '0700-1600'; });
  row[3 + 9] = 'RD';                                   // 2026-12-10 (Thursday) — a single extra RD
  const people = C.peopleFromFms({ type: 'ops', dates, data: [row] });
  assert.equal(people.length, 1);
  assert.equal(people[0].shift, '0700-1600');
  assert.deepEqual(people[0].offDays, [5]);
  assert.deepEqual(people[0].comp, ['2026-12-10']);
  const D = C.emptyData();
  assert.deepEqual(C.mergePeople(D, people), { added: 1, updated: 0 });
  assert.deepEqual(C.mergePeople(D, C.peopleFromFms({ type: 'ops', dates, data: [row] })), { added: 0, updated: 1 });
  assert.equal(D.employees.length, 1);
});

test('planner page is linked from the app menu and only writes through admin RPCs', () => {
  const rootHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(rootHtml, /data-href="planner\/"/);
  const js = fs.readFileSync(path.join(root, 'planner/planner.js'), 'utf8');
  assert.doesNotMatch(js, /\.from\([^)]*\)\s*\.(insert|update|upsert|delete)\(/);
  const sql = fs.readFileSync(path.join(root, 'supabase/migrations/20261108090000_shift_planner.sql'), 'utf8');
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /public\.is_admin\(\)/);
  assert.doesNotMatch(sql, /GRANT (INSERT|UPDATE|DELETE|ALL)/i);
});
