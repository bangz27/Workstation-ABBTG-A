'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
require('../amh-lm/core.js');
const C=globalThis.AmhLmCore;
const ctx={console,Date,JSON,Math,String,Number,Array,Object,isFinite,isNaN};
vm.runInNewContext(fs.readFileSync(path.join(root,'apps-script','SyncAmhLm.gs'),'utf8'),ctx,{filename:'apps-script/SyncAmhLm.gs'});
const G=ctx.SpxAmhLm_;

// Test fixtures only — not operational data.
test('business date follows the 09:00 Bangkok day start',()=>{
  assert.equal(C.businessDate(new Date('2026-11-24T01:59:00Z')),'2026-11-23');   // 08:59 BKK
  assert.equal(C.businessDate(new Date('2026-11-24T02:00:00Z')),'2026-11-24');   // 09:00 BKK
  assert.equal(C.businessDate(new Date('2026-11-24T19:00:00Z')),'2026-11-24');   // 02:00 next day BKK
});

test('missing numbers show a dash, never 0',()=>{
  assert.equal(C.fmtNum(null),'—');
  assert.equal(C.fmtNum(''),'—');
  assert.equal(C.fmtNum(undefined),'—');
  assert.equal(C.fmtNum(0),'0');
  assert.equal(C.fmtNum(10721),'10,721');
  assert.equal(C.fmtPct(null),'—');
  assert.equal(C.fmtPct(97),'97.0%');
  assert.equal(C.fmtBaht(26201200),'฿262,012');
  assert.equal(C.fmtBaht(null),'—');
});

test('pct and freshness',()=>{
  assert.equal(C.pct(9680,9940),97.4);
  assert.equal(C.pct(1,0),null);
  const now=Date.parse('2026-11-24T12:00:00Z');
  assert.equal(C.freshness('2026-11-24T18:40:00+07:00',now).stale,false);   // 20 min
  assert.equal(C.freshness('2026-11-24T18:20:00+07:00',now).stale,true);    // 40 min
  assert.equal(C.freshness('2026-11-24T18:40:00+07:00',now).label,'อัปเดต 24/11 18:40');
  assert.equal(C.freshness(null,now).known,false);
});

test('shape reads kpi by key and scope; absent stays null',()=>{
  const d=C.shape({business_date:'2026-11-24',kpi:[{key:'expedite',scope:'hub',value:'3'}],
    progress:[{direction:'before_cutoff',stage:'received',volume:2,total:10,completed:8}]});
  assert.equal(d.kpi('expedite','hub'),3);
  assert.equal(d.kpi('expedite'),null);
  assert.deepEqual(d.progress('before_cutoff')[0],{stage:'received',volume:2,total:10,completed:8,pct:80});
  assert.equal(d.cod.length,4);
  assert.equal(d.cod[0].orders,null);
  assert.equal(C.shape({}).empty,true);
});

test('donut fractions add up',()=>{
  const dn=C.donut([{bucket:'a',to_buyer:1,to_seller:0,to_transfer:1},{bucket:'b',to_buyer:2}]);
  assert.equal(dn.total,4);
  assert.equal(dn.parts[1].start,0.5);
  assert.equal(C.donut([]).total,0);
});

const H=['ส่วน','รายการ','กลุ่ม','ค่า1','ค่า2','ค่า3','ค่า4','อัปเดต FMS'];
test('sheet parser builds the sync payload',()=>{
  const r=G.parse([H,
    ['date','','','2026-11-24'],
    ['kpi','est_inbound','total','10,721','','','','24 Nov 18:40'],
    ['kpi','completion_rate','','97.0%'],
    ['kpi','cfr','',''],
    ['kpi','cod_pending_baht','','262012.5'],
    ['backlog','>6 Days','total/hub_aging',5,0,0],
    ['lh','lt1abc','Arrived',139,'09:00','10:39'],
    ['progress','Received','before_cutoff',260,9940,9680],
    ['fleet','2wh','full_time',33,33],
    ['fleet','4WH','part_time/forward','','',147,153],
    ['cod','today','',1013,'237933']
  ],'ABBTG-A');
  const p=r.payload;
  assert.deepEqual(Array.from(r.warnings),[]);
  assert.equal(p.business_date,'2026-11-24');
  assert.deepEqual(JSON.parse(JSON.stringify(p.kpi)),[
    {key:'est_inbound',scope:'total',value:10721,updated:'2026-11-24T18:40:00+07:00'},
    {key:'completion_rate',scope:'total',value:97,updated:null},
    {key:'cod_pending_satang',scope:'total',value:26201250,updated:null}]);
  assert.equal(p.lh[0].trip_id,'LT1ABC');
  assert.equal(p.progress[0].stage,'received');
  assert.equal(p.fleet[0].vehicle_type,'2WH');
  assert.equal(p.fleet[0].section,'headcount');
  assert.equal(p.fleet[1].section,'productivity');
  assert.equal(p.cod[0].pending_satang,23793300);
});

test('sections not in the sheet are left out (so the sync does not wipe them)',()=>{
  const p=G.parse([H,['date','','','2026-11-24'],['kpi','expedite','hub',2]]).payload;
  assert.ok(p.kpi);
  assert.equal('backlog' in p,false);
  assert.equal('lh' in p,false);
});

test('bad rows are reported, not guessed',()=>{
  const r=G.parse([H,['kpi','made_up','total',1],['lh','X1','',1],['kpi','expedite','total','abc'],['weird','a']]);
  assert.equal(r.payload.business_date,null);
  assert.equal(r.warnings.length,5);   // no date + 4 bad rows
});

test('Date cells convert to Bangkok time',()=>{
  assert.equal(G.stamp(new Date('2026-11-24T11:40:00Z')),'2026-11-24T18:40:00+07:00');
  assert.equal(G.stamp('24/11/2026 18:40'),'2026-11-24T18:40:00+07:00');
  assert.equal(G.stamp('nonsense','2026'),null);
});
