/* Home dashboard — numbers are derived only from Daily Report totals and the Fleet roster already loaded. */
(function(){
"use strict";
function $(id){return document.getElementById(id);}
function fmt(n){return Number(n||0).toLocaleString('en-US');}
function num(n){var x=Number(n)||0;return (Math.round(x*10)/10).toLocaleString('en-US',{minimumFractionDigits:1,maximumFractionDigits:1});}
function card(label,value,sub,bg){
  return '<article class="hkpi" style="background:'+bg+'"><span>'+label+'</span><b>'+value+'</b><span>'+sub+'</span></article>';
}
function met(label,value,sub,bg){
  return '<article class="hmet" style="background:'+bg+'"><span>'+label+'</span><b>'+value+'</b><small>'+sub+'</small></article>';
}
var EN={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
function sheetISO(name){
  var m=/(\d{1,2})\s+([A-Za-z]{3})[A-Za-z]*\.?\s+(\d{4})/.exec(String(name||''));
  if(!m)return '';
  var mo=EN[m[2].toLowerCase()];
  if(!mo)return '';
  var d=+m[1];
  return m[3]+'-'+(mo<10?'0':'')+mo+'-'+(d<10?'0':'')+d;
}
function wheelOf(func){
  var s=String(func||'').toLowerCase();
  if(/4\s*w|4w|สี่ล้อ|van|pickup/.test(s))return 4;
  if(/2\s*w|2w|สองล้อ|bike|motor|มอเตอร์/.test(s))return 2;
  return 0;
}
function fleetHC(sheet){
  var V=window.SPX_VIEW;
  if(V&&V.ensure)V.ensure('fleet');
  var st=V&&V.state&&V.state.fleet;
  if(!st||!st.res)return {label:'HC 2W/4W',v:'…',sub:'กำลังโหลดกะ Fleet'};
  var iso=sheetISO(sheet),i=st.res.dates.indexOf(iso);
  if(i<0)return {label:'HC เข้ากะ',v:'–',sub:'วันนี้ไม่อยู่ในตารางกะ'};
  var n2=0,n4=0,work=0;
  st.people.forEach(function(p){
    var c=p.cells[i];
    if(!c||c.k!=='work')return;
    work++;
    var w=wheelOf(p.func);
    if(w===2)n2++;else if(w===4)n4++;
  });
  if(n2||n4)return {label:'HC 2W/4W',v:fmt(n2)+' / '+fmt(n4),sub:'คนเข้ากะ สองล้อ / สี่ล้อ'};
  return {label:'HC เข้ากะ',v:fmt(work),sub:'คนเข้ากะ · ชีตไม่ได้แยก 2W/4W'};
}
function paint(){
  var t=window.__SPX_TOTALS,root=$('home');
  if(!root)return;
  if(!t){
    $('hkpis').innerHTML=card('Assign','—','รอ Daily Report','#FFE6D8')+card('Delivered','—','รอ Daily Report','#F4F7FB')+card('ค้าง','—','รอ Daily Report','#FFF4E5')+card('คนขับ','—','รอ Daily Report','#FFE9A8');
    $('hmetrics').innerHTML=met('In Hub','—','รอรายงาน','#E7F4FF')+met('เที่ยวงาน','—','รอรายงาน','#FFE6D8')+met('HC 2W/4W','—','รอรายงาน','#FFE9A8')+met('WL','—','รอรายงาน','#F4F7FB')+met('PDTY','—','รอรายงาน','#E9F9EF')+met('SLA','—','รอรายงาน','#FFF4E5');
    $('hSheet').textContent='กำลังโหลดรายงาน…';
    $('hnote').textContent='กำลังคำนวณจากรายงานที่ซิงก์…';
    $('hFollow').innerHTML='<div>ยังไม่มีตัวเลข</div>';
    return;
  }
  var trips=t.trips>0?t.trips:(t.drivers||0);
  var inHub=Math.max(0,(t.assign||0)-(t.delivered||0));
  var wl=trips?t.assign/trips:0,pdty=trips?t.delivered/trips:0;
  var hc=fleetHC(t.sheet);
  $('hkpis').innerHTML=[
    card('Assign',fmt(t.assign),'ชิ้น จากแท็บที่เลือก','#FFE6D8'),
    card('Delivered',fmt(t.delivered),t.pct+'% ของ Assign','#F4F7FB'),
    card('ค้าง',fmt(t.remain),'On-hold '+fmt(t.onhold),'#FFF4E5'),
    card('HC ในรายงาน',fmt(t.drivers),'ส่งครบ '+fmt(t.done)+' คน','#FFE9A8')
  ].join('');
  $('hmetrics').innerHTML=[
    met('In Hub',fmt(inHub),'ชิ้นที่ยังไม่ Delivered','#E7F4FF'),
    met('เที่ยวงาน',fmt(trips),'คนที่มี Assign วันนี้','#FFE6D8'),
    met(hc.label,hc.v,hc.sub,'#FFE9A8'),
    met('WL',num(wl),'ชิ้น Assign ต่อคน','#F4F7FB'),
    met('PDTY',num(pdty),'ชิ้นที่ส่งแล้วต่อคน','#E9F9EF'),
    met('SLA',num(t.pct)+'%','Delivered ÷ Assign','#FFF4E5')
  ].join('');
  $('hnote').textContent='คำนวณจากแท็บ '+(t.sheet||'Daily Report')+' · In Hub = Assign − Delivered · เที่ยวงาน = คนที่มี Assign · WL = Assign ต่อคน · PDTY = ส่งแล้วต่อคน · SLA = Delivered ÷ Assign';
  $('hminis').innerHTML=[
    ['On-hold',fmt(t.onhold)],
    ['ส่งครบ',fmt(t.done)],
    ['ยังไม่ครบ',fmt(t.drivers-t.done)],
    ['Completion',t.pct+'%']
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
document.addEventListener('click',function(e){
  var b=e.target.closest('#home [data-go]');
  if(!b||!window.SPX_VIEW)return;
  window.SPX_VIEW.set(b.getAttribute('data-go'));
});
var sync=$('hSync');
if(sync)sync.addEventListener('click',function(){if(window.SPX_DRIVER)window.SPX_DRIVER.reload();});
window.SPX_HOME={paint:paint};
setInterval(paint,4000);
})();
