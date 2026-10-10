/* Home dashboard — Daily Report + Fleet shift roster; KPI values arrive through the existing sync/API flow. */
(function(){
"use strict";
function $(id){return document.getElementById(id);}
function value(n){var x=Number(n);return isFinite(x)?x:0;}
function fmt(n){return value(n).toLocaleString('en-US');}
function ratio(n,d){return d>0?value(n)/d:0;}
function decimal(n,places){return n==null?'—':value(n).toLocaleString('en-US',{minimumFractionDigits:places,maximumFractionDigits:places});}
function pct(n){return n==null?'—':decimal(n*100,2)+'%';}
function wheelOf(func){
  var s=String(func||'').toLowerCase();
  if(/4\s*w|4w|สี่ล้อ|van|pickup/.test(s))return 4;
  if(/2\s*w|2w|สองล้อ|bike|motor|มอเตอร์/.test(s))return 2;
  return 0;
}
function calculate(t){
  var hasPeople=!!(t&&Array.isArray(t.people)),active=hasPeople?0:null,active2=0,active4=0,activeUnknown=0;
  var assign2=0,assign4=0;
  if(hasPeople)t.people.forEach(function(p){
    var a=value(p&&p.assign),type=wheelOf(p&&p.position);
    if(a>0){active++;if(type===2)active2++;else if(type===4)active4++;else activeUnknown++;}
    if(type===2)assign2+=a;else if(type===4)assign4+=a;
  });
  var assignTotal=assign2+assign4,delivered=t?value(t.delivered):null,assign=t?value(t.assign):null;
  return {
    active:active,active2:hasPeople?active2:null,active4:hasPeople?active4:null,activeUnknown:activeUnknown,
    assign2:hasPeople?assign2:null,assign4:hasPeople?assign4:null,assignTotal:hasPeople?assignTotal:null,
    allocation2:hasPeople?ratio(assign2,assignTotal):null,allocation4:hasPeople?ratio(assign4,assignTotal):null,
    pdty:active==null?null:ratio(delivered,active),sla:t?ratio(delivered,assign):null
  };
}
function sheetISO(name){
  var m=/(\d{1,2})\s+([A-Za-z]{3})[A-Za-z]*\.?\s+(\d{4})/.exec(String(name||''));
  if(!m)return '';
  var months={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
  var mo=months[m[2].toLowerCase()];if(!mo)return '';
  return m[3]+'-'+(mo<10?'0':'')+mo+'-'+(+m[1]<10?'0':'')+(+m[1]);
}
function fleetRoster(){
  var V=window.SPX_VIEW;
  if(V&&V.ensure)V.ensure('fleet');
  var st=V&&V.state&&V.state.fleet;
  return st&&st.res?st.res:null;
}
function countValue(n){
  if(n==null||n==='')return null;
  var x=Number(n);
  return isFinite(x)&&x>=0?x:null;
}
function homeMetrics(){
  var roster=fleetRoster(),values=roster&&roster.cols&&roster.cols.homeKpis;
  return {todayVolume:countValue(values&&values.todayVolume),inbound:countValue(values&&values.inbound)};
}
function planHC(sheet){
  var roster=fleetRoster();
  if(!roster)return {ready:false,available:false};
  var source=roster.cols&&roster.cols.planHC;
  if(!source||typeof source!=='object')return {ready:true,available:false};
  var n2=Number(source.two),n4=Number(source.four);
  if(!isFinite(n2)||!isFinite(n4)||n2<0||n4<0)return {ready:true,available:false};
  return {ready:true,available:true,total:n2+n4,two:n2,four:n4};
}
var cardsReady=false;
function renderKpiCards(){
  if(cardsReady)return;
  var box=$('hkpis');if(!box)return;
  box.innerHTML=[
    '<div class="hmetric-heading"><span>▤ DELIVERY TRACKING</span><small id="homeOrderTotal">Daily Report</small></div>',
    '<article class="hkpi" data-kpi="today-volume" style="background:#FFE6D8"><span class="hkpi-label">Today\'s Volume</span><b id="kpiTodayVolume">—</b><small class="hkpi-target">ปริมาณงานวันนี้</small></article>',
    '<article class="hkpi" data-kpi="inbound" style="background:#E7F4FF"><span class="hkpi-label">Inbound</span><b id="kpiInboundValue">—</b><small class="hkpi-target">ข้อมูลจากระบบซิงก์</small></article>',
    '<div class="hmetric-heading"><span>♧ FLEET HEAD COUNT</span><small>HC Status</small></div>',
    '<article class="hkpi hkpi-plan" data-kpi="plan-hc" style="background:#FFF0B8"><div class="hkpi-top"><span class="hkpi-label">Plan HC</span><span class="hkpi-badge" id="kpiPlanBadge">—</span></div><b id="kpiPlanValue">–</b><div class="hkpi-progress"><i id="kpiPlan2wBar"></i><i id="kpiPlan4wBar"></i></div><div class="hkpi-split"><span>● 2W <b id="kpiPlan2w">–</b></span><span>● 4W <b id="kpiPlan4w">–</b></span></div></article>',
    '<article class="hkpi hkpi-active" data-kpi="active" data-status="neutral"><div class="hkpi-top"><span class="hkpi-label">Active</span><span class="hkpi-badge green">—</span></div><b id="kpiActiveValue">–</b><div class="hkpi-split"><span>● 2W <b id="kpiActive2w">–</b></span><span>● 4W <b id="kpiActive4w">–</b></span></div><small class="hkpi-note" id="kpiActiveNote"></small></article>',
    '<div class="hmetric-heading"><span>↔ ALLOCATION & PRODUCTIVITY</span><small>Overview</small></div>',
    '<article class="hkpi hkpi-allocation" data-kpi="allocation" data-status="neutral"><div class="hkpi-top"><span class="hkpi-label">2W / 4W ALLOCATION</span><span class="hkpi-badge" id="kpiAllocationStatus">Target 69.80%</span></div><div class="allocation-row"><div class="allocation-row-label"><span><i class="allocation-dot two"></i>2W</span><b id="kpiAllocation2w">–</b></div><div class="hkpi-meter"><i id="kpiAllocation2wBar"></i></div></div><div class="allocation-row"><div class="allocation-row-label"><span><i class="allocation-dot four"></i>4W</span><b id="kpiAllocation4w">–</b></div><div class="hkpi-meter blue"><i id="kpiAllocation4wBar"></i></div></div><small class="hkpi-target" id="kpiAllocationTarget">Target 2W 69.80% · 4W 30.20%</small></article>',
    '<article class="hkpi" data-kpi="pdty" data-status="neutral"><div class="hkpi-top"><span class="hkpi-label">PDTY</span><span class="hkpi-badge">Productivity</span></div><b id="kpiPdtyValue">–</b><small class="hkpi-target">Target 196</small><div class="hkpi-meter"><i id="kpiPdtyBar"></i></div></article>',
    '<div class="hmetric-heading"><span>⚡ OPERATIONS & STANDARDS</span><small>Hub KPI</small></div>',
    '<article class="hkpi" data-kpi="sla" data-status="neutral"><div class="hkpi-top"><span class="hkpi-label">SLA</span><span class="hkpi-badge coral">Target ≥ 96%</span></div><b id="kpiSlaValue">–</b><small class="hkpi-target">อิงจาก Delivered ÷ Assign</small><div class="hkpi-meter"><i id="kpiSlaBar"></i></div></article>',
    '<article class="hkpi" data-kpi="onhold" style="background:#FFF1B8"><span class="hkpi-label">On-hold</span><b id="kpiOnholdValue">—</b><small class="hkpi-target">พัสดุที่พักการจัดส่ง</small></article>'
  ].join('');
  cardsReady=true;
}
function setText(id,text){var el=$(id);if(el)el.textContent=text;}
function renderTopDelivered(t){
  var box=$('hTopDelivered');if(!box)return;
  if(!t||!Array.isArray(t.people)){box.innerHTML='<p class="htop-empty">กำลังโหลดข้อมูลรายบุคคล…</p>';return;}
  var people=t.people.map(function(p){
    var assign=value(p&&p.assign),delivered=value(p&&p.delivered);
    return {id:String(p&&p.id||''),name:String(p&&p.name||'ไม่ระบุชื่อ'),position:String(p&&p.position||''),assign:assign,delivered:delivered,rate:assign>0?delivered/assign*100:null};
  }).filter(function(p){return p.assign>0&&p.rate!=null&&p.rate<80;})
    .sort(function(a,b){return b.delivered-a.delivered;}).slice(0,5);
  if(!people.length){box.innerHTML='<p class="htop-empty">ไม่มีพนักงานที่มี Completion ต่ำกว่า 80% ในข้อมูลชุดนี้</p>';return;}
  box.innerHTML='<div class="htop-table"><div class="htop-row htop-head"><span>พนักงาน</span><span>Delivered / Assign</span><span>Completion</span></div>'+
    people.map(function(p,i){
      var name=String(p.name).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});
      var pos=String(p.position).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});
      return '<div class="htop-row"><span class="htop-person"><b>'+name+'</b><small>'+pos+'</small></span><span>'+fmt(p.delivered)+' / '+fmt(p.assign)+'</span><strong class="htop-rate">'+p.rate.toFixed(1)+'%</strong></div>';
    }).join('')+'</div>';
}
function paint(){
  var t=window.__SPX_TOTALS,root=$('home');
  if(!root)return;
  renderKpiCards();
  var k=calculate(t),hc=planHC(t&&t.sheet),metrics=homeMetrics();
  setText('kpiTodayVolume',metrics.todayVolume==null?'—':fmt(metrics.todayVolume));
  setText('kpiInboundValue',metrics.inbound==null?'—':fmt(metrics.inbound));
  setText('kpiOnholdValue',t&&t.onhold!=null?fmt(t.onhold):'—');
  if(t){
    setText('kpiActiveValue',k.active==null?'—':fmt(k.active));
    setText('kpiActive2w',k.active2==null?'–':fmt(k.active2));
    setText('kpiActive4w',k.active4==null?'–':fmt(k.active4));
    setText('kpiActiveNote',k.activeUnknown?'ไม่ระบุประเภท '+fmt(k.activeUnknown):'');
    setText('kpiAllocation2w',pct(k.allocation2));
    setText('kpiAllocation4w',pct(k.allocation4));
    setText('kpiPdtyValue',decimal(k.pdty,1));
    setText('kpiSlaValue',pct(k.sla));
    var slaBar=$('kpiSlaBar');if(slaBar)slaBar.style.width=Math.min(100,Math.max(0,k.sla*100))+'%';
    var a2=$('kpiAllocation2wBar');if(a2)a2.style.width=Math.min(100,Math.max(0,k.allocation2*100))+'%';
    var a4=$('kpiAllocation4wBar');if(a4)a4.style.width=Math.min(100,Math.max(0,k.allocation4*100))+'%';
    var pdtyBar=$('kpiPdtyBar');if(pdtyBar)pdtyBar.style.width=Math.min(100,Math.max(0,ratio(k.pdty,196)*100))+'%';
    function setStatus(key,status){var el=document.querySelector('[data-kpi="'+key+'"]');if(el)el.setAttribute('data-status',status);}
    function thresholdStatus(actual,target,near){if(actual==null||!isFinite(actual)||!target)return 'neutral';var rate=actual/target;return rate>=1?'green':rate>=near?'yellow':'red';}
    var allocationStatus=k.allocation2==null?'neutral':(k.allocation2>=0.698?'green':k.allocation2>=0.668?'yellow':'red');
    setStatus('allocation',allocationStatus);
    var allocationBadge=$('kpiAllocationStatus');if(allocationBadge)allocationBadge.textContent=allocationStatus==='green'?'ถึงเป้าหมาย':allocationStatus==='yellow'?'ใกล้เป้าหมาย':allocationStatus==='red'?'ต่ำกว่าเป้าหมาย':'รอข้อมูล';
    setText('kpiAllocationTarget','เป้าหมาย 2W 69.80% · 4W 30.20%');
    setStatus('pdty',thresholdStatus(k.pdty,196,0.9));
    setStatus('sla',k.sla==null?'neutral':(k.sla>=0.96?'green':k.sla>=0.93?'yellow':'red'));
    setStatus('active',hc.available&&hc.total?thresholdStatus(k.active/hc.total*100,100,0.9):'neutral');
    var activeBadge2=document.querySelector('[data-kpi="active"] .hkpi-badge');if(activeBadge2)activeBadge2.textContent=hc.available&&hc.total?decimal(k.active/hc.total*100,1)+'%':'—';
    var activeBadge=document.querySelector('[data-kpi=\"active\"] .hkpi-badge');if(activeBadge)activeBadge.textContent=hc.available&&hc.total?decimal(k.active/hc.total*100,1)+'%':'—';
    var orderTotal=$('homeOrderTotal');if(orderTotal)orderTotal.textContent=fmt(t.assign)+' Assign';
  }else{
    setText('kpiActiveValue','—');setText('kpiActive2w','–');setText('kpiActive4w','–');setText('kpiActiveNote','');
    setText('kpiAllocation2w','—');setText('kpiAllocation4w','—');setText('kpiPdtyValue','—');setText('kpiSlaValue','—');
  }
  if(!hc.ready){setText('kpiPlanValue','—');setText('kpiPlan2w','–');setText('kpiPlan4w','–');}
  else if(!hc.available){setText('kpiPlanValue','—');setText('kpiPlan2w','–');setText('kpiPlan4w','–');}
  else{
    setText('kpiPlanValue',fmt(hc.total));setText('kpiPlan2w',fmt(hc.two));setText('kpiPlan4w',fmt(hc.four));
    var planBadge=$('kpiPlanBadge');if(planBadge)planBadge.textContent=hc.total?'100%':'—';
    var plan2bar=$('kpiPlan2wBar');if(plan2bar)plan2bar.style.width=(hc.total?hc.two/hc.total*100:0)+'%';
    var plan4bar=$('kpiPlan4wBar');if(plan4bar)plan4bar.style.width=(hc.total?hc.four/hc.total*100:0)+'%';
  }
  renderTopDelivered(t);
}
renderKpiCards();
document.addEventListener('click',function(e){
  var b=e.target.closest('#home [data-go]');
  if(!b||!window.SPX_VIEW)return;
  window.SPX_VIEW.set(b.getAttribute('data-go'));
});
var sync=$('hSync');
if(sync)sync.addEventListener('click',function(){if(window.SPX_DRIVER)window.SPX_DRIVER.reload();});
window.SPX_HOME={paint:paint,calculate:calculate,planHC:planHC};
setInterval(paint,4000);
})();
