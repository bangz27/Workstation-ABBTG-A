'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
require('../weekly-off/core.js');
const Core = globalThis.WeeklyOffCore;

test('calendar order is Monday through Sunday', () => {
  assert.deepEqual(Core.DAYS, ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']);
});

test('counts Fleet and Ops independently from the supplied Owner Source rows', () => {
  const fleet = [{driver_id:'D1',weekly_off:'Monday'},{driver_id:'D2',weekly_off:'Sunday'},{driver_id:'D3',weekly_off:'Monday'}];
  const ops = [{ops_id:'O1',weekly_off:'Monday'},{ops_id:'O2',weekly_off:'Friday'}];
  const result = Core.summarize(fleet, ops);
  assert.equal(result.totalFleet, fleet.length);
  assert.equal(result.totalOps, ops.length);
  assert.equal(result.total, fleet.length + ops.length);
  assert.deepEqual(result.days[0], {day:'Monday',fleet:2,ops:1,total:3});
  assert.deepEqual(result.days[4], {day:'Friday',fleet:0,ops:1,total:1});
  assert.deepEqual(result.days[6], {day:'Sunday',fleet:1,ops:0,total:1});
});

test('records are selected by the Owner Source Weekly Off value only; RD is not guessed', () => {
  const fleet = [{driver_id:'D1',weekly_off:'RD'},{driver_id:'D2',weekly_off:'Tuesday'}];
  const result = Core.summarize(fleet, []);
  assert.equal(result.days[1].fleet, 1);
  assert.deepEqual(result.unknown, [{value:'RD',count:1}]);
  assert.deepEqual(Core.forDay(fleet, [], 'Tuesday').fleet, [fleet[1]]);
  assert.deepEqual(Core.forDay(fleet, [], 'Monday').fleet, []);
});

test('search matches the specified per-group identity fields', () => {
  const fleet = [
    {driver_id:'F-10',employee_id:'EMP-A',staff_name:'Alpha'},
    {driver_id:'F-20',employee_id:'EMP-B',staff_name:'Beta'}
  ];
  const ops = [{ops_id:'OPS-7',staff_name:'Gamma',department:'Hub Agent'}];
  assert.deepEqual(Core.search(fleet,'emp-b',['driver_id','employee_id','staff_name']),[fleet[1]]);
  assert.deepEqual(Core.search(ops,'hub agent',['ops_id','staff_name','department']),[ops[0]]);
  assert.equal(Core.search(fleet,'missing',['driver_id','employee_id','staff_name']).length,0);
});

// Month model: M0/M+1 are derived from Thai calendar month, not sync timestamp.
assert.equal(Core.relativeMonthKey(0,new Date('2026-10-09T00:00:00Z')),'2026-10-01');
assert.equal(Core.relativeMonthKey(1,new Date('2026-10-09T00:00:00Z')),'2026-11-01');
assert.equal(Core.relativeMonthKey(0,new Date('2026-11-01T00:00:00Z')),'2026-11-01');
assert.equal(Core.relativeMonthKey(1,new Date('2026-11-01T00:00:00Z')),'2026-12-01');
