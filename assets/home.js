/* Home dashboard — Daily Report + Fleet shift roster; manual volume values stay on this device. */
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
function planHC(sheet){
  var V=window.SPX_VIEW;
  if(V&&V.ensure)V.ensure('fleet');
  var st=V&&V.state&&V.state.fleet;
  if(!st||!st.res)return {ready:false,available:false};
  var source=st.res.cols&&st.res.cols.planHC;
  if(!source||typeof source!=='object')return {ready:true,available:false};
  var n2=Number(source.two),n4=Number(source.four);
  if(!isFinite(n2)||!isFinite(n4)||n2<0||n4<0)return {ready:true,available:false};
  return {ready:true,available:true,total:n2+n4,two:n2,four:n4,source:source.source||'dayoff fleet!AK4:AK'};
}
var cardsReady=false;
function renderKpiCards(){
  if(cardsReady)return;
  var box=$('hkpis');if(!box)return;
  box.innerHTML=[
    '<article class="hkpi hkpi-manual" data-kpi="today-volume" style="background:#FFE6D8"><span class="hkpi-label">Today Volume</span><input id="todayVolume" class="hkpi-input" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" spellcheck="false" placeholder="–" aria-label="Today Volume กรอกเอง"><small class="hkpi-meta">Manual · แตะตัวเลขเพื่อแก้ไข</small></article>',
    '<article class="hkpi hkpi-manual" data-kpi="inbound" style="background:#E7F4FF"><span class="hkpi-label">Inbound</span><input id="inboundVolume" class="hkpi-input" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" spellcheck="false" placeholder="–" aria-label="Inbound กรอกเอง"><small class="hkpi-meta">Manual · แตะตัวเลขเพื่อแก้ไข</small></article>',
    '<article class="hkpi hkpi-wide" data-kpi="plan-hc" style="background:#FFE9A8"><span class="hkpi-label">Plan HC</span><b id="kpiPlanValue">–</b><div class="hkpi-split"><span>2W <b id="kpiPlan2w">–</b></span><i aria-hidden="true">|</i><span>4W <b id="kpiPlan4w">–</b></span></div><small class="hkpi-note" id="kpiPlanNote"></small></article>',
    '<article class="hkpi hkpi-wide" data-kpi="active" style="background:#E9F9EF"><span class="hkpi-label">Active</span><b id="kpiActiveValue">–</b><div class="hkpi-split"><span>2W <b id="kpiActive2w">–</b></span><i aria-hidden="true">|</i><span>4W <b id="kpiActive4w">–</b></span></div><small class="hkpi-note" id="kpiActiveNote"></small></article>',
    '<article class="hkpi" data-kpi="allocation-2w" style="background:#FFF4E5"><span class="hkpi-label">2W Allocation</span><b id="kpiAllocation2w">–</b><small class="hkpi-target">Target 69.80%</small></article>',
    '<article class="hkpi" data-kpi="allocation-4w" style="background:#F4F7FB"><span class="hkpi-label">4W Allocation</span><b id="kpiAllocation4w">–</b><small class="hkpi-meta">จาก Assign 2W + 4W</small></article>',
    '<article class="hkpi" data-kpi="pdty" style="background:#E9F9EF"><span class="hkpi-label">PDTY</span><b id="kpiPdtyValue">–</b><small class="hkpi-target">Target 196</small></article>',
    '<article class="hkpi" data-kpi="sla" style="background:#FFE6D8"><span class="hkpi-label">SLA</span><b id="kpiSlaValue">–</b><small class="hkpi-meta">Delivered ÷ Assign</small></article>'
  ].join('');
  bindManual($('todayVolume'),'spxTodayVolumeManual');
  bindManual($('inboundVolume'),'spxInboundManual');
  cardsReady=true;
}
function setText(id,text){var el=$(id);if(el)el.textContent=text;}
function grouped(digits){return digits.replace(/\B(?=(\d{3})+(?!\d))/g,',');}
function bindManual(el,key){
  if(!el)return;
  try{var saved=localStorage.getItem(key);if(saved!==null&&/^\d+$/.test(saved))el.value=grouped(saved.replace(/^0+(?=\d)/,''));}catch(e){}
  function save(){
    var clean=String(el.value||'').replace(/\D/g,'').replace(/^0+(?=\d)/,'');
    if(el.value!==clean)el.value=clean;
    try{if(clean==='')localStorage.removeItem(key);else localStorage.setItem(key,clean);}catch(e){}
  }
  el.addEventListener('beforeinput',function(e){if(e.data!=null&&/\D/.test(e.data))e.preventDefault();});
  el.addEventListener('input',save);
  el.addEventListener('focus',function(){el.value=String(el.value||'').replace(/\D/g,'');});
  el.addEventListener('blur',function(){var clean=String(el.value||'').replace(/\D/g,'');el.value=clean?grouped(clean):'';});
}
function paint(){
  var t=window.__SPX_TOTALS,root=$('home');
  if(!root)return;
  renderKpiCards();
  var k=calculate(t),hc=planHC(t&&t.sheet);
  if(t){
    setText('kpiActiveValue',k.active==null?'—':fmt(k.active));
    setText('kpiActive2w',k.active2==null?'–':fmt(k.active2));
    setText('kpiActive4w',k.active4==null?'–':fmt(k.active4));
    setText('kpiActiveNote',k.activeUnknown?'ไม่ระบุประเภท '+fmt(k.activeUnknown):'');
    setText('kpiAllocation2w',pct(k.allocation2));
    setText('kpiAllocation4w',pct(k.allocation4));
    setText('kpiPdtyValue',decimal(k.pdty,1));
    setText('kpiSlaValue',pct(k.sla));
  }else{
    setText('kpiActiveValue','—');setText('kpiActive2w','–');setText('kpiActive4w','–');setText('kpiActiveNote','รอ Daily Report');
    setText('kpiAllocation2w','—');setText('kpiAllocation4w','—');setText('kpiPdtyValue','—');setText('kpiSlaValue','—');
  }
  if(!hc.ready){setText('kpiPlanValue','—');setText('kpiPlan2w','–');setText('kpiPlan4w','–');setText('kpiPlanNote','กำลังโหลดกะ Fleet');}
  else if(!hc.available){setText('kpiPlanValue','—');setText('kpiPlan2w','–');setText('kpiPlan4w','–');setText('kpiPlanNote','ยังไม่มี Plan HC จาก dayoff fleet!AK4:AK');}
  else{
    setText('kpiPlanValue',fmt(hc.total));setText('kpiPlan2w',fmt(hc.two));setText('kpiPlan4w',fmt(hc.four));
    setText('kpiPlanNote',hc.source);
  }
  if(!t){
    setText('hSheet','กำลังโหลดรายงาน…');
    setText('hnote','กำลังคำนวณจากรายงานที่ซิงก์…');
    if($('hFollow'))$('hFollow').innerHTML='<div>ยังไม่มีตัวเลข</div>';
    return;
  }
  $('hnote').textContent='คำนวณจากแท็บ '+(t.sheet||'Daily Report')+' · Active = คนที่มี Assign > 0 · Allocation = Assign 2W/4W ÷ Assign 2W+4W · In Hub กรอกเอง';
  $('hminis').innerHTML=[
    ['On-hold',fmt(t.onhold)],['ส่งครบ',fmt(t.done)],['ยังไม่ครบ',fmt(t.drivers-t.done)],['Completion',t.pct+'%']
  ].map(function(m){return '<article class="hmini"><span>'+m[0]+'</span><b>'+m[1]+'</b></article>';}).join('');
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
var inHubEl=$('inHub'),inHubLast='',INHUB_KEY='spxInHubManual';
function saveInHub(){
  if(!inHubEl)return;
  var v=String(inHubEl.value||'');
  if(v===''){inHubLast='';try{localStorage.removeItem(INHUB_KEY);}catch(e){}return;}
  if(!/^\d+$/.test(v)){inHubEl.value=inHubLast;return;}
  var n=v.replace(/^0+(?=\d)/,'');
  if(inHubEl.value!==n)inHubEl.value=n;
  inHubLast=n;
  try{localStorage.setItem(INHUB_KEY,n);}catch(e){}
}
if(inHubEl){
  try{var savedInHub=localStorage.getItem(INHUB_KEY);if(savedInHub!==null&&/^\d+$/.test(savedInHub)){inHubLast=savedInHub.replace(/^0+(?=\d)/,'');inHubEl.value=inHubLast;}}catch(e){}
  inHubEl.addEventListener('beforeinput',function(e){if(e.data!=null&&/\D/.test(e.data))e.preventDefault();});
  inHubEl.addEventListener('input',saveInHub);
}
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
