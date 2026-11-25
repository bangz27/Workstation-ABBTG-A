'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');

// Test fixture: text shaped like the FMS AMH-LM Hub Overview page (numbers made up).
const PAGE = [
  'Hub Overview', 'Fleet Overview', 'Forecast', 'Updated: {{time}}(Data from {{startTime}} - {{endTime}})',
  'LM Est. Inbound', '1,000', 'Actual Inbounded', '100',
  'Order Volume', 'Updated: 25 Nov 13:05 (Data of 25 Nov)', 'Total Forward Inbounded', '900', 'Total Return Inbounded', '10',
  'Total Delivered to Buyer', '800', 'Avg. L7D', '750', 'Total Returned to Seller', '5', 'Avg. L7D', '6',
  'Days to Process Orders', 'Updated: {{time}}', 'Days to Process/Target', '0.6', '/1.0',
  'Backlog', 'Updated: {{time}}', 'Total', 'Hub', 'Fleet', 'LM Hub Aging', '>6 Days', '3-6 Days', '1-2 Days',
  'Aging\tTo Buyer\tTo Seller\tTo Transfer', '>6 Days\t2\t0\t0', '3-6 Days\t3\t0\t1', '1-2 Days\t40\t1\t0',
  'To Expedite', 'Updated: {{time}}', 'TotalHubFleet', 'Expedite', 'Super Expedite',
  'Linehaul Trip', 'Updated: {{time}}', 'View All Trips', 'Loading', '-', 'Transporting', '-',
  'Trip ID\tATD\tETA\tOrders\tStatus', 'LTTEST1\t', '09:21', '\t', '10:37', '\t1,067\tArrived',
  'Operation Progress', "Updated: {{time}}LH COT: 13:00", 'Before CutOff', 'Deliver to Buyer', 'Return to Seller',
  "Today's Volume", '910', 'To Handover', '10', 'To Deliver', '100', 'Completion Rate', '50.3%', 'Clear Floor Rate (CFR)', '98.1%',
  'Delivering attempted', '800', 'In Hub Status\tVolume\tTotal\tCompleted', 'Transported\t1\t910\t', '909', '(99.9%)', '',
  'Received\t9\t909\t', '900', '(99.0%)', 'Fleet status\tVolume\tTotal\tCompleted', 'Delivered\t800\t-\t', '-', '(-%)',
  'Fleet Head Counts', 'Updated: {{time}}', 'Full-Time', '12', 'Attendance Rate', '100.0%', 'Part-Time', '2', 'Attendance Rate', '50.0%',
  'Vehicle Type\tFull-Time Actual/Schedule\tPart-Time Actual/Schedule', '2WH\t8/9\t0/0', '4WH\t4/4\t2/2', 'Others\t0/0\t0/0',
  'Fleet Productivity', 'Updated: {{time}}', 'TotalForwardReturn', 'Full-Time', '70', 'Orders', 'Part-Time', '40', 'Orders',
  'Vehicle Type\tFull-Time Delivered/Handed Over\tPart-Time Delivered/Handed Over', '2WH\t100/110\t0/0', '4WH\t50/60\t40/45', 'Others\t0/0\t0/0',
  'Finance', 'Updated: {{time}} (Data of Last 6 Months)', 'View Details', 'Pending COD Collection', '฿12,345',
  'Delivered Date\tOrder Volume\tPending Collection', 'Today\t20\t฿10,000', '1-3 Days\t0\t฿0', '4-5 Days\t0\t฿0', '>5 Days\t2\t฿2,345'
].join('\n');

function loadExtract() {
  const ctx = { __AMH_TEST__: {}, document: { body: { innerText: PAGE } }, location: { hash: '#/other' }, localStorage: {}, sessionStorage: {},
    window: { addEventListener() {} }, console, Date, Math, JSON, String, Number, Object, Array, RegExp, isFinite };
  ctx.globalThis = ctx;
  vm.runInNewContext(fs.readFileSync(path.join(root, 'userscripts', 'amh-lm-send.user.js'), 'utf8'), ctx);
  return ctx.__AMH_TEST__.extract;
}
function loadRows() {
  const ctx = { console, JSON, String, Number, Object, Array };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'apps-script', 'AmhLmImport.gs'), 'utf8'), ctx);
  return ctx.AmhLmRows_;
}

test('userscript reads the page text into the import payload', () => {
  const d = JSON.parse(JSON.stringify(loadExtract()()));   // plain objects (vm realm arrays compare by reference)
  assert.equal(d.kpi['est_inbound|'][0], 1000);
  assert.equal(d.kpi['avg_l7d_returned|'][0], 6);
  assert.equal(d.kpi['completion_rate|'][0], 50.3);
  assert.equal(d.kpi['pt_attendance_rate|'][0], 50);
  assert.equal(d.kpi['expedite|total'][0], '');                 // not shown on the page → blank, never 0
  assert.equal(d.kpi['lh_loading|'][0], '');
  assert.equal(d.stamps.volume, '25 Nov 13:05');                // FMS time when shown
  assert.equal(d.stamps.forecast, d.readStamp);                 // else the time it was read
  assert.deepEqual(d.backlog['3-6 Days|total/hub_aging'], [3, 0, 1]);
  assert.deepEqual(d.trips, [['LTTEST1', 'Arrived', 1067, '09:21', '10:37']]);
  assert.deepEqual(d.prog['received|before_cutoff'], [9, 909, 900]);
  assert.deepEqual(d.fleet['4WH|part_time'], [2, 2, 40, 45]);
  assert.deepEqual(d.cod.over_5_days, [2, 2345]);
  assert.match(d.businessDate, /^\d{4}-\d{2}-\d{2}$/);
});

test('page still loading → no payload', () => {
  const ctx = { __AMH_TEST__: {}, document: { body: { innerText: 'Forecast\nUpdated: {{time}}' } }, location: { hash: '' }, localStorage: {}, sessionStorage: {},
    window: { addEventListener() {} }, console, Date, Math, JSON, String, Number, Object, Array, RegExp, isFinite };
  ctx.globalThis = ctx;
  vm.runInNewContext(fs.readFileSync(path.join(root, 'userscripts', 'amh-lm-send.user.js'), 'utf8'), ctx);
  assert.equal(ctx.__AMH_TEST__.extract(), null);
});

test('Apps Script builds the AMH-LM rows from sheet labels and the payload', () => {
  const d = loadExtract()(), R = loadRows();
  const labels = [['date', '', ''], ['kpi', 'est_inbound', ''], ['kpi', 'expedite', 'total'], ['backlog', '>6 Days', 'total/hub_aging'],
    ['backlog', '>6 Days', 'hub/hub_aging'], ['lh', '', ''], ['lh', 'OLDTRIP', 'Arrived'], ['progress', 'received', 'before_cutoff'],
    ['fleet', '2WH', 'full_time'], ['fleet', '2WH', 'full_time/forward'], ['cod', 'today', '']];
  const r = R.build(labels, d);
  assert.deepEqual(Array.from(r.rows[0]), ['date', '', '', d.businessDate, '', '', '', '']);
  assert.deepEqual(Array.from(r.rows[1]).slice(3, 8), [1000, '', '', '', d.readStamp]);
  assert.deepEqual(Array.from(r.rows[2]), ['kpi', 'expedite', 'total', '', '', '', '', '']);          // blank stays blank
  assert.deepEqual(Array.from(r.rows[3]).slice(3, 7), [2, 0, 0, '']);
  assert.deepEqual(Array.from(r.rows[4]).slice(3, 7), ['', '', '', '']);                            // other views not read
  assert.deepEqual(Array.from(r.rows[5]).slice(0, 6), ['lh', 'LTTEST1', 'Arrived', 1067, '09:21', '10:37']);
  assert.deepEqual(Array.from(r.rows[6]), ['lh', '', '', '', '', '', '', '']);                       // yesterday's trip cleared
  assert.deepEqual(Array.from(r.lhRows), [7, 8]);                                                   // sheet rows (labels start at row 2)
  assert.deepEqual(Array.from(r.rows[8]).slice(3, 7), [8, 9, 100, 110]);
  assert.deepEqual(Array.from(r.rows[10]).slice(3, 5), [20, 10000]);
  assert.equal(r.filled, 6);
});
