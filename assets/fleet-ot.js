/* Daily OT for Workforce > กะ Fleet.
   Stores only date-specific OT choices in public.weekly_off_ot; roster source remains read-only. */
(function(){
'use strict';
var api=window.SPX_API, panel=null, records=[], activeDate='', requestedDate='', loading=false, errorText='';
var observer=null, timer=null;
function $(id){return document.getElementById(id);}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function state(){return window.SPX_VIEW&&window.SPX_VIEW.state?window.SPX_VIEW.state.fleet:null;}
function currentDate(){var s=state();return s&&s.res?s.date:'';}
function isFleet(){return window.SPX_VIEW&&window.SPX_VIEW.current&&window.SPX_VIEW.current()==='fleet';}
function mount(){
  if(panel)return;
  panel=document.createElement('section');
  panel.id='fleetOtPanel';
  panel.className='fleet-ot-panel';
  panel.innerHTML='<div class="fleet-ot-head"><div><h2>มาทำงาน (OT)</h2><p>รายชื่อคนหยุดที่เลือกมาทำ OT เฉพาะวันที่เลือก · แชร์ข้อมูลผ่าน Supabase</p></div><span id="fleetOtCount" class="fleet-ot-count">0 คน</span></div><div id="fleetOtMessage" class="fleet-ot-message" role="status" aria-live="polite"></div><div id="fleetOtList" class="fleet-ot-list"></div>';
  var list=$('slist');
  if(list&&list.parentNode)list.parentNode.insertBefore(panel,list);
}
function setMessage(s,kind){
  var el=$('fleetOtMessage');if(!el)return;
  el.textContent=s||'';el.className='fleet-ot-message'+(kind?' '+kind:'');
}
function getClient(){return api&&api.client;}
function loadRecords(date,force,silent){
  var client=getClient();
  if(!date||!client)return;
  if(loading&&requestedDate===date)return;
  if(!force&&requestedDate===date&&activeDate===date)return;
  requestedDate=date;loading=true;if(!silent)setMessage('กำลังโหลดรายการ OT…');
  client.from('weekly_off_ot').select('shift_date,staff_type,person_id,person_name').eq('shift_date',date).eq('staff_type','fleet').order('person_name')
    .then(function(r){
      if(date!==currentDate())return;
      loading=false;
      if(r.error)throw r.error;
      activeDate=date;records=r.data||[];errorText='';renderPanel();applyRows();
    }).catch(function(e){
      if(date!==currentDate())return;
      loading=false;errorText=(e&&e.message)||'เกิดข้อผิดพลาด';setMessage('โหลด OT ไม่สำเร็จ: '+errorText,'error');
      if(panel){var list=$('fleetOtList');if(list)list.innerHTML='<button type="button" class="fleet-ot-retry" data-fleet-ot-retry>ลองโหลด OT อีกครั้ง</button>';}
    });
}
function personByKey(key){
  var s=state();return s&&s.people?s.people.find(function(p){return String(p.key)===String(key);}):null;
}
function renderPanel(){
  if(!panel)return;
  $('fleetOtCount').textContent=records.length+' คน';
  if(!records.length){$('fleetOtList').innerHTML='<div class="fleet-ot-empty">ยังไม่มีคนมาทำ OT ในวันที่เลือก</div>';setMessage('วันที่ '+activeDate);return;}
  $('fleetOtList').innerHTML=records.map(function(r){
    return '<article class="fleet-ot-card"><div class="fleet-ot-person"><b>'+esc(r.person_name||'ไม่ระบุชื่อ')+'</b><small>'+esc(r.person_id)+'</small></div><span class="fleet-ot-tag">OT · Fleet</span><button type="button" class="fleet-ot-remove" data-fleet-ot-remove="'+esc(r.person_id)+'">ยกเลิก OT</button></article>';
  }).join('');
  setMessage('บันทึกสำหรับวันที่ '+activeDate+' แล้ว');
}
function updateStats(){
  if(!isFleet())return;
  var s=state();if(!s||!s.res)return;
  var i=s.res.dates.indexOf(s.date);if(i<0)return;
  var work=0,off=0,offKeys={};
  s.people.forEach(function(p){var c=p.cells[i];if(c&&c.k==='work')work++;else if(c&&c.k==='off'){off++;offKeys[String(p.key)]=true;}});
  var ot=records.filter(function(r){return !!offKeys[String(r.person_id)];}).length;
  var w=$('scards').querySelector('.scard.work .v'),o=$('scards').querySelector('.scard.off .v');
  if(w&&w.textContent!==String(work+ot)+'คน')w.innerHTML=(work+ot)+'<small>คน</small>';
  if(o&&o.textContent!==String(Math.max(0,off-ot))+'คน')o.innerHTML=Math.max(0,off-ot)+'<small>คน</small>';
  var wc=$('schips').querySelector('.chip[data-f="work"] .n'),oc=$('schips').querySelector('.chip[data-f="off"] .n');
  if(wc&&wc.textContent!==String(work+ot))wc.textContent=work+ot;
  if(oc&&oc.textContent!==String(Math.max(0,off-ot)))oc.textContent=Math.max(0,off-ot);
  var rows=$('slist').querySelectorAll('.prow:not([hidden])');
  var visible=0;Array.prototype.forEach.call(rows,function(r){if(r.style.display!=='none')visible++;});
  var cnt=$('scnt');if(cnt)cnt.textContent='แสดง '+visible+' / '+s.people.length+' คน';
  if(window.__SPX_ROSTER&&window.__SPX_ROSTER.view==='fleet'&&window.__SPX_ROSTER.date===s.date){
    window.__SPX_ROSTER.work=work+ot;window.__SPX_ROSTER.off=Math.max(0,off-ot);
  }
}
function applyRows(){
  if(!isFleet()||activeDate!==currentDate())return;
  var otKeys={};records.forEach(function(r){otKeys[String(r.person_id)]=true;});
  var rows=$('slist').querySelectorAll('.prow');
  Array.prototype.forEach.call(rows,function(row){
    var key=row.getAttribute('data-k'),isOT=!!otKeys[String(key)],isOff=row.classList.contains('p-off');
    var existing=row.querySelector('[data-fleet-ot-add]');
    if(isOff&&!isOT){
      if(!existing){
        var p=personByKey(key),slot=row.querySelector('.p2')||row.querySelector('.pmain');
        if(p&&slot){
          var b=document.createElement('button');b.type='button';b.className='fleet-ot-add';b.setAttribute('data-fleet-ot-add',String(p.key));b.textContent='+ มาทำ OT';
          slot.appendChild(b);
        }
      }
    }else if(existing)existing.remove();
    if(isOff&&isOT){row.style.display='none';row.setAttribute('data-fleet-ot-hidden','true');}
    else if(row.hasAttribute('data-fleet-ot-hidden')){row.style.display='';row.removeAttribute('data-fleet-ot-hidden');}
  });
  updateStats();
}
function sync(){
  mount();
  if(!isFleet()){
    if(panel)panel.style.display='none';
    var rows=$('slist')&&$('slist').querySelectorAll('[data-fleet-ot-hidden]');
    if(rows)Array.prototype.forEach.call(rows,function(r){r.style.display='';r.removeAttribute('data-fleet-ot-hidden');});
    return;
  }
  panel.style.display='';
  var date=currentDate();
  if(!date)return;
  if(date!==requestedDate){records=[];activeDate='';renderPanel();loadRecords(date,false);}
  else if(activeDate===date){renderPanel();applyRows();}
}
function saveOT(key){
  var date=currentDate(),p=personByKey(key),client=getClient();
  if(!date||!p||!client)return;
  var id=String(p.key||p.id||p.name);
  setMessage('กำลังบันทึก OT…');
  client.from('weekly_off_ot').upsert({shift_date:date,staff_type:'fleet',person_id:id,person_name:String(p.name||'')},{onConflict:'shift_date,staff_type,person_id'})
    .then(function(r){if(r.error)throw r.error;requestedDate='';loadRecords(date,true);})
    .catch(function(e){setMessage('บันทึก OT ไม่สำเร็จ: '+((e&&e.message)||'ตรวจสอบสิทธิ์และการเชื่อมต่อ'),'error');});
}
function removeOT(key){
  var date=currentDate(),client=getClient();
  if(!date||!client)return;
  setMessage('กำลังยกเลิก OT…');
  client.from('weekly_off_ot').delete().eq('shift_date',date).eq('staff_type','fleet').eq('person_id',String(key))
    .then(function(r){if(r.error)throw r.error;requestedDate='';loadRecords(date,true);})
    .catch(function(e){setMessage('ยกเลิก OT ไม่สำเร็จ: '+((e&&e.message)||'ตรวจสอบสิทธิ์และการเชื่อมต่อ'),'error');});
}
document.addEventListener('click',function(e){
  var add=e.target.closest('[data-fleet-ot-add]');
  if(add){e.preventDefault();e.stopPropagation();saveOT(add.getAttribute('data-fleet-ot-add'));return;}
  var rem=e.target.closest('[data-fleet-ot-remove]');
  if(rem){e.preventDefault();e.stopPropagation();removeOT(rem.getAttribute('data-fleet-ot-remove'));return;}
  if(e.target.closest('[data-fleet-ot-retry]')){requestedDate='';loadRecords(currentDate(),true);}
});
function observe(){
  var root=$('slist'),date=$('sDateLong'),cards=$('scards');
  if(observer)observer.disconnect();
  observer=new MutationObserver(function(){if(timer)clearTimeout(timer);timer=setTimeout(sync,40);});
  [root,date,cards,$('schips')].forEach(function(el){if(el)observer.observe(el,{childList:true,subtree:true,characterData:true});});
  var bodyObserver=new MutationObserver(function(){sync();});
  bodyObserver.observe(document.body,{attributes:true,attributeFilter:['class']});
  sync();
}
window.setInterval(function(){if(isFleet()&&currentDate()&&!loading)loadRecords(currentDate(),true,true);},30000);
window.addEventListener('focus',function(){if(isFleet()&&currentDate()&&!loading)loadRecords(currentDate(),true,true);});
document.addEventListener('visibilitychange',function(){if(!document.hidden&&isFleet()&&currentDate()&&!loading)loadRecords(currentDate(),true,true);});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',observe);else observe();
})();
