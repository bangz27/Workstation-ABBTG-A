/* ส่งรายงานเข้า SeaTalk จากหน้าแรก (ทางเสริม — ตารางส่งอัตโนมัติใน Apps Script ยังทำงานตามเดิม)
   ข้อความทั้งหมดสร้างใน Apps Script (DailySummary!B28 และ LineReport2) — หน้านี้แค่แสดงตัวอย่างและสั่งส่ง
   สิทธิ์: Apps Script ตรวจ token ล็อกอิน Supabase ของผู้ใช้ทุกครั้ง (ผู้ใช้ที่ล็อกอินได้ส่งได้) */
(function(){
"use strict";
var EXEC=window.SPX_CONFIG&&window.SPX_CONFIG.SEATALK_EXEC_URL;
var SEND='ส่งเข้า SeaTalk',ARM='แตะอีกครั้งเพื่อยืนยันส่ง';
var dlg=null,armed={daily:false,low:false},timers={},loaded={};

function el(id){return document.getElementById(id);}
function token(){
  var api=window.SPX_API;
  if(!api||!api.client)return Promise.reject(new Error('ระบบยังไม่พร้อม'));
  return api.client.auth.getSession().then(function(r){
    var s=r&&r.data&&r.data.session;
    if(!s||!s.access_token)throw new Error('เซสชันหมดอายุ — กรุณาเข้าสู่ระบบใหม่');
    return s.access_token;
  });
}
function call(op,extra){
  if(!EXEC)return Promise.reject(new Error('ยังไม่ได้ตั้งค่า SEATALK_EXEC_URL'));
  return token().then(function(t){
    var body={stOp:op,token:t};
    if(extra)for(var k in extra)body[k]=extra[k];
    // text/plain = simple request (no CORS preflight); Apps Script replies with JSON
    return fetch(EXEC,{method:'POST',body:JSON.stringify(body),redirect:'follow'});
  }).then(function(res){
    if(!res.ok)throw new Error('เชื่อมต่อ Apps Script ไม่ได้ ('+res.status+')');
    return res.json();
  },function(e){
    if(/failed to fetch|networkerror|load failed/i.test(String(e&&e.message)))throw new Error('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่');
    throw e;
  }).then(function(j){
    if(!j||!j.ok)throw new Error((j&&j.error)||'เกิดข้อผิดพลาด');
    return j.data;
  });
}

function build(){
  dlg=document.createElement('dialog');
  dlg.className='st-dlg';
  dlg.setAttribute('aria-labelledby','stTitle');
  dlg.innerHTML=
    '<div class="st-wrap"><div class="st-head"><h2 id="stTitle">ส่งรายงานเข้า SeaTalk</h2><button type="button" class="st-x" id="stClose" aria-label="ปิด">×</button></div>'+
    '<div class="st-body">'+
      '<div class="st-tabs" role="tablist">'+
        '<button type="button" class="st-tab" role="tab" id="stTabDaily" aria-controls="stPanelDaily" aria-selected="true" data-k="daily">Daily Report</button>'+
        '<button type="button" class="st-tab" role="tab" id="stTabLow" aria-controls="stPanelLow" aria-selected="false" data-k="low">ส่งไม่ถึง 80%</button>'+
      '</div>'+
      '<div class="st-panel" role="tabpanel" id="stPanelDaily" aria-labelledby="stTabDaily">'+
        '<label for="stIssue">Issue หน้างาน</label><input id="stIssue" placeholder="-" autocomplete="off">'+
        '<label for="stAct">Action</label><input id="stAct" placeholder="-" autocomplete="off">'+
        '<div class="st-row"><button type="button" class="st-prev" id="stDailyPrev">ดูตัวอย่าง</button><button type="button" class="st-send" id="stDailySend">'+SEND+'</button></div>'+
        '<div class="st-status" id="stDailyStatus" role="status"></div><div class="st-last" id="stDailyLast"></div>'+
        '<div id="stDailyOut"></div>'+
      '</div>'+
      '<div class="st-panel" role="tabpanel" id="stPanelLow" aria-labelledby="stTabLow" hidden>'+
        '<div class="st-row"><button type="button" class="st-prev" id="stLowPrev">ดูตัวอย่าง</button><button type="button" class="st-send" id="stLowSend">'+SEND+'</button></div>'+
        '<div class="st-status" id="stLowStatus" role="status"></div><div class="st-last" id="stLowLast"></div>'+
        '<div id="stLowOut"></div>'+
      '</div>'+
    '</div></div>';
  document.body.appendChild(dlg);
  el('stClose').addEventListener('click',function(){dlg.close();});
  dlg.addEventListener('close',function(){disarm('daily');disarm('low');});
  dlg.querySelectorAll('.st-tab').forEach(function(b){b.addEventListener('click',function(){tab(b.getAttribute('data-k'));});});
  el('stDailyPrev').addEventListener('click',function(){preview('daily',true);});
  el('stLowPrev').addEventListener('click',function(){preview('low');});
  el('stDailySend').addEventListener('click',function(){armOrSend('daily');});
  el('stLowSend').addEventListener('click',function(){armOrSend('low');});
}
function ids(k){var p=k==='daily'?'stDaily':'stLow';return {prev:el(p+'Prev'),send:el(p+'Send'),status:el(p+'Status'),last:el(p+'Last'),out:el(p+'Out')};}
function busy(k,b){var x=ids(k);x.prev.disabled=b;x.send.disabled=b;}
function status(k,text,cls){var s=ids(k).status;s.className='st-status'+(cls?' '+cls:'');s.textContent=text||'';}
function disarm(k){armed[k]=false;clearTimeout(timers[k]);var b=ids(k).send;if(b){b.textContent=SEND;b.classList.remove('armed');}}
function tab(k){
  ['daily','low'].forEach(function(n){
    var on=n===k;
    el(n==='daily'?'stTabDaily':'stTabLow').setAttribute('aria-selected',on?'true':'false');
    el(n==='daily'?'stPanelDaily':'stPanelLow').hidden=!on;
  });
  if(!loaded[k])preview(k);
}
function render(k,d){
  var x=ids(k),texts=k==='daily'?[d.message]:(d.texts||[]);
  x.out.innerHTML='';
  texts.filter(function(t){return t;}).forEach(function(t){var p=document.createElement('pre');p.className='st-pre';p.textContent=t;x.out.appendChild(p);});
  if(!x.out.children.length){var p=document.createElement('pre');p.className='st-pre';p.textContent='—';x.out.appendChild(p);}
  x.last.textContent=d.lastSent?'ส่งล่าสุด: '+d.lastSent:'';
  if(k==='daily'){
    if(!el('stIssue').value&&d.issue&&d.issue!=='-')el('stIssue').value=d.issue;
    if(!el('stAct').value&&d.action&&d.action!=='-')el('stAct').value=d.action;
  }
  loaded[k]=true;
}
function inputs(withText){return withText?{issue:el('stIssue').value,act:el('stAct').value}:null;}
function preview(k,withText){
  busy(k,true);status(k,'กำลังโหลด…');
  call(k==='daily'?'dailyPreview':'lowPreview',k==='daily'?inputs(withText):null)
    .then(function(d){render(k,d);status(k,'');})
    .catch(function(e){status(k,e.message,'err');})
    .then(function(){busy(k,false);});
}
function armOrSend(k){
  var b=ids(k).send;
  if(!armed[k]){
    armed[k]=true;b.textContent=ARM;b.classList.add('armed');
    clearTimeout(timers[k]);timers[k]=setTimeout(function(){disarm(k);},5000);
    return;
  }
  disarm(k);
  busy(k,true);status(k,'กำลังส่ง…');
  call(k==='daily'?'dailySend':'lowSend',k==='daily'?inputs(true):null)
    .then(function(r){status(k,'ส่งแล้ว ✓ '+(r.count>1?r.count+' ข้อความ · ':'')+r.sentAt,'ok');busy(k,false);preview(k);})
    .catch(function(e){status(k,'ส่งไม่สำเร็จ: '+e.message,'err');busy(k,false);});
}
function open(){
  if(!dlg)build();
  if(typeof dlg.showModal==='function')dlg.showModal();else dlg.setAttribute('open','');
  tab('daily');
}

var btn=el('hSeaTalk');
if(btn)btn.addEventListener('click',open);
window.SPX_SEATALK={open:open};
})();
