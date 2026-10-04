/* Home dashboard — presentation only. Numbers come from Daily Report totals already computed in driver.js. */
(function(){
"use strict";
function $(id){return document.getElementById(id);}
function fmt(n){return Number(n||0).toLocaleString('en-US');}
function card(label,value,sub,bg){
  return '<article class="hkpi" style="background:'+bg+'"><span>'+label+'</span><b>'+value+'</b><span>'+sub+'</span></article>';
}
function paint(){
  var t=window.__SPX_TOTALS,root=$('home');
  if(!root)return;
  if(!t){
    $('hkpis').innerHTML=card('Assign','—','รอ Daily Report','#FFE6D8')+card('Delivered','—','รอ Daily Report','#F4F7FB')+card('ค้าง','—','รอ Daily Report','#FFF4E5')+card('คนขับ','—','รอ Daily Report','#FFE9A8');
    $('hSheet').textContent='กำลังโหลดรายงาน…';
    $('hFollow').innerHTML='<div>ยังไม่มีตัวเลข</div>';
    return;
  }
  $('hkpis').innerHTML=[
    card('Assign',fmt(t.assign),'ชิ้น จากแท็บที่เลือก','#FFE6D8'),
    card('Delivered',fmt(t.delivered),t.pct+'% ของ Assign','#F4F7FB'),
    card('ค้าง',fmt(t.remain),'On-hold '+fmt(t.onhold),'#FFF4E5'),
    card('HC ในรายงาน',fmt(t.drivers),'ส่งครบ '+fmt(t.done)+' คน','#FFE9A8')
  ].join('');
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
