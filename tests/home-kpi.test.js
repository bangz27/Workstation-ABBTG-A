'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'assets/home.js'),'utf8');
function near(actual,expected,label){assert.ok(Math.abs(actual-expected)<1e-10,label+': '+actual+' !== '+expected);}
function fixturePeople(){
  const people=[];
  for(let i=0;i<15;i++)people.push({position:'2WH',assign:800,delivered:0});
  people.push({position:'4WH',assign:1333,delivered:0},{position:'4WH',assign:1333,delivered:0},{position:'4WH',assign:1334,delivered:0});
  people.push({position:'2WH',assign:0,delivered:0});
  return people;
}
function makeRoster(){
  const people=[];
  for(let i=0;i<14;i++)people.push({func:'2WH',base:[{k:'work'}],cells:[{k:i===0?'other':'work'}]});
  for(let i=0;i<6;i++)people.push({func:'4WH',base:[{k:'work'}],cells:[{k:'work'}]});
  return {dates:['2026-10-05'],people:people};
}
function harness(t,storageSeed){
  const elements=new Map();
  function element(id){
    if(!elements.has(id))elements.set(id,{id:id,innerHTML:'',textContent:'',value:'',style:{},listeners:{},addEventListener:function(type,fn){this.listeners[type]=fn;}});
    return elements.get(id);
  }
  const storage=new Map(Object.entries(storageSeed||{}));
  const localStorage={getItem:k=>storage.has(k)?storage.get(k):null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)};
  const view={ensure:function(){},state:{fleet:{res:makeRoster(),today:'2026-10-05',date:'2026-10-05',people:makeRoster().people}}};
  const window={__SPX_TOTALS:t,SPX_VIEW:view,SPX_DRIVER:{reload:function(){}},SPX_LEAVE:null};
  const document={getElementById:element,addEventListener:function(){}};
  const context={window:window,document:document,localStorage:localStorage,setInterval:function(){},console:console,Number:Number,Math:Math,String:String,Array:Array,Object:Object,Date:Date,isFinite:isFinite};
  vm.runInNewContext(source,context,{filename:'assets/home.js'});
  window.SPX_HOME.paint();
  return {window:window,elements:elements,storage:storage,localStorage:localStorage};
}
const rows=fixturePeople();
const base={sheet:'Daily Report',drivers:rows.length,done:0,assign:16000,delivered:13387,onhold:0,remain:2613,trips:18,pct:83.7,people:rows};
const calcHarness=harness(base);
const kpi=calcHarness.window.SPX_HOME.calculate(base);
assert.equal(kpi.active,18,'Active counts people with Assign > 0');
assert.equal(kpi.active2,15,'2W Active people');
assert.equal(kpi.active4,3,'4W Active people');
assert.equal(kpi.assign2,12000,'Assign 2W volume');
assert.equal(kpi.assign4,4000,'Assign 4W volume');
near(kpi.allocation2,0.75,'2W Allocation uses Assign volume');
near(kpi.allocation4,0.25,'4W Allocation uses Assign volume');
near(kpi.allocation2+kpi.allocation4,1,'2W + 4W Allocation');
near(kpi.sla,13387/16000,'SLA = Delivered / Assign');
const pdtyBase={...base,delivered:5574};
const pdty=calcHarness.window.SPX_HOME.calculate(pdtyBase);
near(pdty.pdty,5574/18,'PDTY = Delivered / Active');
const pdtyHarness=harness(pdtyBase);
assert.equal(pdtyHarness.elements.get('kpiPdtyValue').textContent,'309.7','PDTY primary UI uses a compact one-decimal value');
assert.equal(calcHarness.elements.get('kpiSlaValue').textContent,'83.67%','SLA UI percentage');
assert.equal(calcHarness.elements.get('kpiAllocation2w').textContent,'75.00%','2W Allocation UI');
assert.equal(calcHarness.elements.get('kpiAllocation4w').textContent,'25.00%','4W Allocation UI');
assert.equal(calcHarness.elements.get('kpiActiveValue').textContent,'18','Active UI total');
assert.equal(calcHarness.elements.get('kpiActive2w').textContent,'15','Active 2W UI');
assert.equal(calcHarness.elements.get('kpiActive4w').textContent,'3','Active 4W UI');
const plan=calcHarness.window.SPX_HOME.planHC('Daily Report');
assert.equal(plan.total,20,'Plan HC total from scheduled people');
assert.equal(plan.two,14,'Plan HC 2W breakdown');
assert.equal(plan.four,6,'Plan HC 4W breakdown');
assert.equal(calcHarness.elements.get('kpiPlanValue').textContent,'20','Plan HC UI total');
assert.equal(calcHarness.elements.get('kpiPlan2w').textContent,'14','Plan HC UI 2W');
assert.equal(calcHarness.elements.get('kpiPlan4w').textContent,'6','Plan HC UI 4W');
const zero=calcHarness.window.SPX_HOME.calculate({assign:0,delivered:0,people:[{position:'2WH',assign:0,delivered:0}]});
assert.equal(zero.allocation2,0,'zero Assign allocation is safe');
assert.equal(zero.allocation4,0,'zero Assign 4W allocation is safe');
assert.equal(zero.pdty,0,'zero Active PDTY is safe');
assert.equal(zero.sla,0,'zero Assign SLA is safe');
const cards=calcHarness.elements.get('hkpis').innerHTML;
const order=[...cards.matchAll(/data-kpi="([^"]+)"/g)].map(m=>m[1]);
assert.deepEqual(order,['today-volume','inbound','plan-hc','active','allocation-2w','allocation-4w','pdty','sla'],'Home card order');
assert.ok(!/\bWL\b/i.test(cards),'WL must not appear in Home KPI cards');
assert.ok(cards.includes('Target 69.80%'),'2W target is present');
assert.equal((cards.match(/Target /g)||[]).length,2,'only the 2W Allocation and PDTY target labels are rendered; 4W has no target');
assert.ok(!/ชิ้น\s*\/\s*Active/i.test(cards),'PDTY does not promote a unit label');
assert.ok(calcHarness.elements.get('hChart').innerHTML.includes('<rect'),'existing Home chart still renders');
assert.ok(calcHarness.elements.get('hDonut').innerHTML.includes('<circle'),'existing Home donut still renders');
assert.ok(!/\bWL\b/i.test(source),'Home KPI implementation contains no WL calculation or UI');
const today=calcHarness.elements.get('todayVolume'),inbound=calcHarness.elements.get('inboundVolume');
today.value='10,000';today.listeners.input({});
inbound.value='3500';inbound.listeners.input({});
assert.equal(calcHarness.storage.get('spxTodayVolumeManual'),'10000','Today Volume persists as digits');
assert.equal(calcHarness.storage.get('spxInboundManual'),'3500','Inbound persists as digits');
const reloadHarness=harness(base,{spxTodayVolumeManual:'10000',spxInboundManual:'3500'});
assert.equal(reloadHarness.elements.get('todayVolume').value,'10,000','Today Volume restores after reload');
assert.equal(reloadHarness.elements.get('inboundVolume').value,'3,500','Inbound restores after reload');
const inHub=reloadHarness.elements.get('inHub');inHub.value='250';inHub.listeners.input({});
assert.equal(reloadHarness.storage.get('spxInHubManual'),'250','existing In Hub manual persistence remains intact');
const css=fs.readFileSync(path.join(root,'assets/style.css'),'utf8');
assert.match(css,/\.hkpi-target\{[^}]*font-size:10px/,'targets are visually secondary');
assert.match(css,/@media\(max-width:600px\)\{\.hgrid\{grid-template-columns:minmax\(0,1fr\)\}/,'Home layout stacks on narrow screens');
const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
assert.match(index,/assets\/driver\.js\?v=20261005homekpi/,'driver data bridge receives a fresh cache key');
for(const file of ['assets/home.js','assets/driver.js','index.html','assets/style.css','sw.js']){
  const text=fs.readFileSync(path.join(root,file),'utf8');
  for(const qa of ['10000','3500','5574','13387'])assert.ok(!text.includes(qa),file+' must not contain QA constants '+qa);
}
console.log('PASS: Home KPI logic, rendering, manual persistence, Plan HC, zero division, WL removal, and existing Home/ In Hub regressions');
