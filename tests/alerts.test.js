'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const context={console,Date,JSON,Math,String,Number,Array,Object,isFinite};
vm.runInNewContext(fs.readFileSync(path.join(root,'apps-script','Alerts.gs'),'utf8'),context,{filename:'apps-script/Alerts.gs'});
const A=context.SpxAlerts_;

// Test fixture (not operational data): 3 drivers.
function input(over){
  return Object.assign({
    today:'2026-11-17',time:'10:45',
    drivers:[
      {id:'1',name:'A',position:'2WH',assign:200,delivered:120,onhold:0,idle:'1:20'},
      {id:'2',name:'B',position:'2WH',assign:150,delivered:150,onhold:0,idle:'2:00'},
      {id:'3',name:'C',position:'4WH',assign:100,delivered:40,onhold:5,idle:'0:30'}
    ],
    todayVolume:600,volumeDay:'2026-11-17',updateDay:'2026-11-17',pdtyTarget:194,sent:{}
  },over||{});
}
const keys=r=>Array.from(r.alerts,a=>a.key).sort();

test('fires No Assign, PDTY and idle with the Workstation formulas',()=>{
  const r=A.evaluate(input());
  assert.deepEqual(keys(r),['idle','noAssign','pdty']);
  assert.equal(r.status.noAssign,150);                    // 600 - 450
  assert.equal(r.status.pdty,150);                        // 450 / 3 active
  const idle=r.alerts.find(a=>a.key==='idle');
  assert.deepEqual(Array.from(idle.keys),['idle:1']);     // B finished, C idle only 30 min
});

test('SLA only checked at/after cutoff',()=>{
  assert.ok(!keys(A.evaluate(input({time:'19:59'}))).includes('sla'));
  const r=A.evaluate(input({time:'20:00'}));
  assert.ok(keys(r).includes('sla'));
  assert.equal(r.status.sla,310/600);
});

test('no alerts when today\'s data has not arrived',()=>{
  assert.equal(A.evaluate(input({updateDay:'2026-11-16'})).alerts.length,0);
  assert.equal(A.evaluate(input({drivers:[{id:'#N/A',name:'',assign:0}]})).alerts.length,0);
});

test('stale Today\'s Volume skips volume-based rules only',()=>{
  const r=A.evaluate(input({volumeDay:'2026-11-16',time:'20:30'}));
  assert.deepEqual(keys(r),['pdty']);                      // idle window closed at 19:00
});

test('already-sent items are not repeated; outside active hours stays quiet',()=>{
  const r=A.evaluate(input({sent:{noAssign:true,pdty:true,'idle:1':true}}));
  assert.equal(r.alerts.length,0);
  assert.equal(A.evaluate(input({time:'07:59'})).alerts.length,0);
  assert.equal(A.evaluate(input({time:'21:00'})).alerts.length,0);
});

test('below thresholds → nothing',()=>{
  const r=A.evaluate(input({todayVolume:480,pdtyTarget:150,drivers:input().drivers.map(d=>Object.assign({},d,{idle:'0:10'}))}));
  assert.equal(r.alerts.length,0);
});

test('format and sheet timestamp parsing',()=>{
  const r=A.evaluate(input());r.today='2026-11-17';r.time='10:45';
  const msg=A.format(r);
  assert.match(msg,/^⚠️ แจ้งเตือน ABBTG-A · 17\/11 10:45/);
  assert.match(msg,/No Assign 150 ชิ้น/);
  assert.equal(A.stampDay('17/11/2026, 0:03:32'),'2026-11-17');
  assert.equal(A.stampDay('5/1/2026, 9:00'),'2026-01-05');
  assert.equal(A.stampDay(''),'');
});
