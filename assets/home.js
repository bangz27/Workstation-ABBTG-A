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
  box.innerHTML=
    '<section class="kpi-section" aria-label="Fleet Head Count"><div class="kpi-section-head"><h2>♧ FLEET HEAD COUNT</h2><span>HC Status</span></div><div class="kpi-section-grid">'+
    '<article class="hkpi kpi-plan" data-kpi="plan-hc"><div class="kpi-card-head"><span class="hkpi-label">Plan HC</span><span class="kpi-pill" id="kpiPlanPct">—</span></div><b id="kpiPlanValue">—</b><div class="kpi-progress"><span id="kpiPlanBar2"></span><span id="kpiPlanBar4"></span></div><div class="hkpi-split"><span>● 2W <b id="kpiPlan2w">–</b><small id="kpiPlan2p"></small></span><span>● 4W <b id="kpiPlan4w">–</b><small id="kpiPlan4p"></small></span></div></article>'+
    '<article class="hkpi kpi-active" data-kpi="active"><div class="kpi-card-head"><span class="hkpi-label">Active</span><span class="kpi-pill" id="kpiActivePct">—</span></div><b id="kpiActiveValue">—</b><div class="kpi-progress"><span id="kpiActiveBar2"></span><span id="kpiActiveBar4"></span></div><div class="hkpi-split"><span>● 2W <b id="kpiActive2w">–</b><small id="kpiActive2p"></small></span><span>● 4W <b id="kpiActive4w">–</b><small id="kpiActive4p"></small></span></div><small class="hkpi-note" id="kpiActiveNote"></small></article></div></section>'+
    '<section class="kpi-section" aria-label="Fleet and Productivity"><div class="kpi-section-head"><h2>↔ FLEET AND PRODUCTIVITY</h2><span>Overview</span></div><div class="kpi-section-grid">'+
    '<article class="hkpi kpi-allocation" data-kpi="allocation"><span class="hkpi-label">2W AND 4W ALLOCATION</span><div class="allocation-row"><span>● 2W</span><b id="kpiAllocation2w">—</b></div><div class="kpi-track"><span id="kpiAllocation2bar"></span></div><div class="allocation-row"><span>● 4W</span><b id="kpiAllocation4w">—</b></div><div class="kpi-track blue"><span id="kpiAllocation4bar"></span></div><div class="kpi-card-foot"><span>Target 69.80%</span><b id="kpiAllocationGap">—</b></div></article>'+
    '<article class="hkpi kpi-pdty" data-kpi="pdty"><div class="kpi-card-head"><span class="hkpi-label">PDTY</span><span class="kpi-pill">Productivity</span></div><b id="kpiPdtyValue">—</b><div class="kpi-card-foot"><span>Target 196</span><b id="kpiPdtyPct">—</b></div><div class="kpi-track green"><span id="kpiPdtyBar"></span></div></article></div></section>'+
    '<section class="kpi-section" aria-label="Operations and Standards"><div class="kpi-section-head"><h2>ϟ OPERATIONS AND STANDARDS</h2></div><div class="kpi-section-grid">'+
    '<article class="hkpi kpi-onhold" data-kpi="onhold"><div class="kpi-card-head"><span class="hkpi-label">ON-HOLD</span><i class="kpi-dot amber"></i></div><div class="kpi-value-line"><b id="kpiOnholdValue">—</b><span>orders</span></div><div class="kpi-status amber-status"><span>Pending</span><b id="kpiOnholdPct">—</b></div></article>'+
    '<article class="hkpi kpi-sla" data-kpi="sla"><div class="kpi-card-head"><span class="hkpi-label">SLA</span><span class="kpi-pill danger" id="kpiSlaStatus">—</span></div><b id="kpiSlaValue">—</b><div class="kpi-card-foot"><span>Target ≥ 95%</span><b>Action Req.</b></div></article></div></section>'+
    '<section class="kpi-section" aria-label="Delivery Tracking"><div class="kpi-section-head"><h2>♧ DELIVERY TRACKING</h2><span id="kpiOrdersTotal">—</span></div><div class="kpi-section-grid">'+
    '<article class="hkpi kpi-done" data-kpi="journey-done"><div class="kpi-card-head"><span class="hkpi-label">DELIVERED</span><i class="kpi-dot green-dot"></i></div><div class="kpi-value-line"><b id="kpiDeliveredValue">—</b><span>orders</span></div><div class="kpi-status green-status"><span>Completed</span><b id="kpiDeliveredPct">—</b></div></article>'+
    '<article class="hkpi kpi-working" data-kpi="working"><div class="kpi-card-head"><span class="hkpi-label">REMAINING</span><i class="kpi-dot blue-dot"></i></div><div class="kpi-value-line"><b id="kpiRemainValue">—</b><span>orders</span></div><div class="kpi-status blue-status"><span>In Progress</span><b id="kpiRemainPct">—</b></div></article></div></section>';
  cardsReady=true;
}
function setText(id,text){var el=$(id);if(el)el.textContent=text;}
function paint(){
  var t=window.__SPX_TOTALS,root=$('home');
  if(!root)return;
  renderKpiCards();
  var k=calculate(t),hc=planHC(t&&t.sheet),metrics=homeMetrics();
  function bar(id,n){var el=$(id);if(el)el.style.width=Math.max(0,Math.min(100,value(n)))+'%';}
  function share(n,d){return d>0?value(n)/d*100:0;}
  var planTotal=hc.available?hc.total:0,activeTotal=k.active==null?0:k.active;
  setText('kpiPlanValue',hc.available?fmt(hc.total):'—');
  setText('kpiPlan2w',hc.available?fmt(hc.two):'–');setText('kpiPlan4w',hc.available?fmt(hc.four):'–');
  setText('kpiPlan2p',hc.available?Math.round(share(hc.two,hc.total))+'%':'');
  setText('kpiPlan4p',hc.available?Math.round(share(hc.four,hc.total))+'%':'');
  setText('kpiPlanPct',hc.available&&hc.total>0?'100%':'—');
  bar('kpiPlanBar2',share(hc.two,hc.total));bar('kpiPlanBar4',share(hc.four,hc.total));
  setText('kpiActiveValue',k.active==null?'—':fmt(k.active));
  setText('kpiActive2w',k.active2==null?'–':fmt(k.active2));setText('kpiActive4w',k.active4==null?'–':fmt(k.active4));
  setText('kpiActive2p',k.active!=null?Math.round(share(k.active2,k.active))+'%':'');
  setText('kpiActive4p',k.active!=null?Math.round(share(k.active4,k.active))+'%':'');
  setText('kpiActivePct',planTotal>0?decimal(activeTotal/planTotal*100,1)+'%':'—');
  setText('kpiActiveNote',k.activeUnknown?'ไม่ระบุประเภท '+fmt(k.activeUnknown):'');
  bar('kpiActiveBar2',share(k.active2,k.active));bar('kpiActiveBar4',share(k.active4,k.active));
  setText('kpiAllocation2w',pct(k.allocation2));setText('kpiAllocation4w',pct(k.allocation4));
  bar('kpiAllocation2bar',share(k.allocation2,1));bar('kpiAllocation4bar',share(k.allocation4,1));
  setText('kpiAllocationGap',k.allocation2==null?'—':decimal(k.allocation2*100-69.8,2)+'%');
  setText('kpiPdtyValue',decimal(k.pdty,1));
  var pdtyProgress=k.pdty==null?0:share(k.pdty,196);
  setText('kpiPdtyPct',k.pdty==null?'—':decimal(pdtyProgress,1)+'%');bar('kpiPdtyBar',pdtyProgress);
  setText('kpiSlaValue',pct(k.sla));
  setText('kpiSlaStatus',k.sla!=null&&k.sla>=.95?'On Target':'Below Target');
  setText('kpiTodayVolume',metrics.todayVolume==null?'—':fmt(metrics.todayVolume));
  setText('kpiInboundValue',metrics.inbound==null?'—':fmt(metrics.inbound));
  if(!t){
    ['kpiOnholdValue','kpiOnholdPct','kpiDeliveredValue','kpiDeliveredPct','kpiRemainValue','kpiRemainPct','kpiOrdersTotal'].forEach(function(id){setText(id,'—');});
    setText('hSheet','กำลังโหลดรายงาน…');setText('hnote','กำลังคำนวณจากรายงานที่ซิงก์…');
    if($('hFollow'))$('hFollow').innerHTML='<div>ยังไม่มีตัวเลข</div>';
    return;
  }
  setText('kpiOnholdValue',fmt(t.onhold));
  setText('kpiOnholdPct',decimal(share(t.onhold,t.assign),1)+'%');
  setText('kpiDeliveredValue',fmt(t.delivered));setText('kpiDeliveredPct',decimal(share(t.delivered,t.assign),1)+'%');
  setText('kpiRemainValue',fmt(t.remain));setText('kpiRemainPct',decimal(share(t.remain,t.assign),1)+'%');
  setText('kpiOrdersTotal','Total '+fmt(t.assign)+' Orders');
  if($('hminis'))$('hminis').style.display='none';
  $('hnote').textContent='คำนวณจากแท็บ '+(t.sheet||'Daily Report')+' · Active = คนที่มี Assign > 0 · Allocation = Assign 2W/4W ÷ Assign 2W+4W';
  $('hSheet').textContent=t.sheet||'';
  var max=Math.max(t.assign,t.delivered,t.onhold,1);
  var bars=[['Assign',t.assign,'#F08A5D'],['Delivered',t.delivered,'#3DDC84'],['On-hold',t.onhold,'#F2C14E'],['ค้าง',Math.max(t.remain,0),'#7EB6FF']];
  $('hChart').innerHTML=bars.map(function(b,i){
    var h=Math.round((b[1]/max)*140),x=40+i*150,y=160-h;
    return '<rect x="'+x+'" y="'+y+'" width="70" height="'+h+'" rx="8" fill="'+b[2]+'"/><text x="'+(x+35)+'" y="178" text-anchor="middle" font-size="13" fill="#6E675E">'+b[0]+'</text><text x="'+(x+35)+'" y="'+(y-6)+'" text-anchor="middle" font-size="13" font-weight="700">'+fmt(b[1])+'</text>';
  }).join('');
  var whole=t.assign||1,del=t.delivered/whole*100,oh=t.onhold/whole*100;
  $('hDonut').innerHTML='<svg width="140" height="140" viewBox="0 0 42 42" aria-hidden="true"><circle cx="21" cy="21" r="15.9" fill="none" stroke="#E9EEF2" stroke-width="6"/><circle cx="21" cy="21" r="15.9" fill="none" stroke="#3DDC84" stroke-width="6" stroke-dasharray="'+del.toFixed(1)+' '+(100-del).toFixed(1)+'" stroke-dashoffset="25"/><circle cx="21" cy="21" r="15.9" fill="none" stroke="#F2C14E" stroke-width="6" stroke-dasharray="'+oh.toFixed(1)+' '+(100-oh).toFixed(1)+'" stroke-dashoffset="'+(25-del).toFixed(1)+'"/></svg><div class="hfollow"><div>Delivered '+t.pct+'%</div><div>On-hold '+fmt(t.onhold)+'</div><div>ค้าง '+fmt(t.remain)+'</div></div>';
  var follow=[];
  if(t.remain>0)follow.push('<div><b>ค้างส่ง '+fmt(t.remain)+' ชิ้น</b><br><small>ยังไม่ครบ '+(t.drivers-t.done)+' คน · เปิดรายงานเพื่อดูรายชื่อ</small></div>');
  if(t.onhold>=5)follow.push('<div><b>On-hold รวม '+fmt(t.onhold)+'</b><br><small>กรอง On-hold ≥ 5 ได้ใน Fleet Over View</small></div>');
  if(!follow.length)follow.push('<div>ไม่มีรายการค้างจากยอดรวมวันนี้</div>');
  $('hFollow').innerHTML=follow.join('');
  var L=window.SPX_LEAVE&&window.SPX_LEAVE.state;
  if(!L||!L.perm||!L.perm.view)$('hLeave').innerHTML='<div>บัญชีนี้ยังไม่มีสิทธิ์ดูการลา</div>';
  else $('hLeave').innerHTML='<div>มีรายการลาในระบบ '+((L.rows&&L.rows.length)||0)+' รายการ</div><small>ไม่แสดงชื่อบนหน้าแรก</small>';
}
renderKpiCards();
document.addEventListener('click',function(e){
  var b=e.target.closest('#home [data-go]');
  if(!b||!window.SPX_VIEW)return;
  window.SPX_VIEW.set(b.getAttribute('data-go'));
});
var sync=$('hSync');
if(sync)sync.addEventListener('click',function(){if(window.SPX_DRIVER)window.SPX_DRIVER.reload();});
var topSync=$('homeTopRefresh');
if(topSync)topSync.addEventListener('click',function(){if(sync)sync.click();else if(window.SPX_DRIVER)window.SPX_DRIVER.reload();});
window.SPX_HOME={paint:paint,calculate:calculate,planHC:planHC};
setInterval(paint,4000);
})();
