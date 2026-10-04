/* Fleet Over View (tab "Daily Report") — UI identical to Apps Script v5; data via SPX_API */
(function(){
"use strict";
var TH_MON=['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
var EN_MON={jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};

var DATA=[], META=null, reqSeq=0;
var state={q:"",filter:"all",sort:"delivered",dir:-1,open:{},sheet:"",userPicked:false,loading:false};

function $(id){return document.getElementById(id);}
function fmt(n){return Number(n||0).toLocaleString('en-US');}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function mins(t){var m=/^(\d{1,2}):(\d{2})/.exec(String(t||''));return m?(+m[1])*60+(+m[2]):9999;}

/* "3 Oct 2026" -> {d:3,m:9,y:2026} */
function parseTabDate(name){
  var m=/(\d{1,2})\s+([A-Za-z]{3})[A-Za-z]*\.?\s+(\d{4})/.exec(String(name||''));
  if(!m)return null;
  var mo=EN_MON[m[2].toLowerCase()];
  return mo==null?null:{d:+m[1],m:mo,y:+m[3]};
}
function thShort(name){var p=parseTabDate(name);return p?p.d+' '+TH_MON[p.m]+' '+String(p.y+543).slice(-2):String(name);}
function thLong(name){var p=parseTabDate(name);return p?p.d+' '+TH_MON[p.m]+' '+(p.y+543):String(name);}
/* "2026-10-03 19:13:05" -> "3 ต.ค. 19:13:05 น." */
function thStamp(s){
  var m=/^(\d{4})-(\d{2})-(\d{2}) (\d{2}:\d{2}:\d{2})/.exec(String(s||''));
  return m?(+m[3])+' '+TH_MON[+m[2]-1]+' '+m[4]+' น.':String(s||'');
}

/* derived fields: progress = Delivered/Assign %, ค้าง = Assign − Delivered − On-hold */
function enrich(d){
  var a=+d.assign||0,del=+d.delivered||0,oh=+d.onhold||0,raw=a-del-oh;
  return {id:String(d.id),name:String(d.name),first:d.first||'-',assign:a,delivered:del,onhold:oh,
    remainRaw:raw,remain:Math.max(0,raw),done:raw<=0,progress:a?del/a*100:0};
}
function status(d){
  if(d.done)return {c:"done",t:"ส่งครบ",o:3};
  var t='ค้าง '+fmt(d.remain);
  if(d.progress<50)return {c:"major",t:t,o:0};
  if(d.progress<70)return {c:"minor",t:t,o:1};
  return {c:"active",t:t,o:2};
}

var FILTERS=[
  {k:"all",t:"ทั้งหมด",f:function(){return true;}},
  {k:"notdone",t:"ยังส่งไม่ครบ",f:function(d){return d.remainRaw>0;}},
  {k:"done",t:"ส่งครบ",f:function(d){return d.remainRaw<=0;}},
  {k:"oh5",t:"On-hold ≥ 5",f:function(d){return d.onhold>=5;}}
];
var SORTS={
  delivered:{f:function(d){return d.delivered;},def:-1},
  assign:{f:function(d){return d.assign;},def:-1},
  onhold:{f:function(d){return d.onhold;},def:-1},
  remain:{f:function(d){return d.remain;},def:-1},
  first:{f:function(d){return mins(d.first);},def:1},
  progress:{f:function(d){return d.progress;},def:-1},
  name:{f:function(d){return d.name;},def:1,str:true},
  status:{f:function(d){return status(d).o;},def:1}
};

/* ---------- data loading ---------- */
function setLoading(on){
  state.loading=on;
  document.body.classList.toggle('loading',on);
  $('refBtn').classList.toggle('spin',on);
  $('refBtn').disabled=on;
  $('tabSel').disabled=on||!META;
  $('retryBtn').disabled=on;
}
function showErr(msg){$('errMsg').textContent='โหลดข้อมูลไม่สำเร็จ: '+msg;$('err').classList.add('show');}
function hideErr(){$('err').classList.remove('show');}

function load(sheetName){
  var my=++reqSeq;
  setLoading(true);hideErr();
  window.SPX_API.getDashboardData(sheetName||'').then(function(res){
      if(my!==reqSeq)return; // a newer request superseded this one
      try{onData(res);}catch(e){showErr('แสดงผลผิดพลาด: '+(e&&e.message||e));}
      setLoading(false);
    },function(err){
      if(my!==reqSeq)return;
      setLoading(false);
      showErr(err&&err.message?err.message:String(err));
      if(!META){$('list').innerHTML='<div class="empty">ไม่สามารถโหลดข้อมูลได้</div>';$('upd').textContent='โหลดข้อมูลไม่สำเร็จ';}
    });
}
function reload(){load(state.userPicked?state.sheet:'');}

function onData(res){
  if(!res||!res.drivers)throw new Error('ไม่ได้รับข้อมูลจากเซิร์ฟเวอร์');
  META=res;
  state.sheet=res.sheetName;
  if(res.sheetName===res.defaultSheet)state.userPicked=false;
  DATA=res.drivers.map(enrich);
  fillTabs(res.sheets||[],res.sheetName);
  $('dateLbl').textContent=thShort(res.sheetName);
  $('upd').textContent='อัปเดตล่าสุด '+thStamp(res.loadedAt);
  $('foot').textContent='ข้อมูลจากแท็บ "'+res.sheetName+'" · ซิงก์เมื่อ '+thStamp(res.loadedAt)+' · แตะที่รายชื่อเพื่อดูรายละเอียด';
  $('warns').innerHTML=(res.warnings||[]).map(function(w){return '<div class="warn">'+esc(w)+'</div>';}).join('');
  renderCards();renderChips();render();
}

/* newest (right-most) tab first */
function fillTabs(names,cur){
  var sel=$('tabSel');
  sel.innerHTML=names.slice().reverse().map(function(n){
    var lbl=thLong(n);
    return '<option value="'+esc(n)+'"'+(n===cur?' selected':'')+'>'+esc(lbl===n?n:lbl+'  ('+n+')')+'</option>';
  }).join('');
  sel.value=cur;
}

/* ---------- summary cards ---------- */
function renderCards(){
  var n=DATA.length,done=0,a=0,del=0,oh=0,rem=0;
  DATA.forEach(function(d){a+=d.assign;del+=d.delivered;oh+=d.onhold;rem+=d.remain;if(d.done)done++;});
  var pct=a?(del/a*100):0;
  $('cards').innerHTML=[
    ['คนขับทั้งหมด',fmt(n),'คน',''],
    ['Assign รวม',fmt(a),'ชิ้น',''],
    ['Delivered รวม',fmt(del),pct.toFixed(1)+'% ของ Assign','o'],
    ['On-hold รวม',fmt(oh),'ชิ้น','r'],
    ['ค้างรวม',fmt(rem),'ยังส่งไม่ครบ '+(n-done)+' คน','y'],
    ['ส่งครบ',fmt(done),'จาก '+n+' คน','g']
  ].map(function(c){return '<div class="card"><div class="k">'+c[0]+'</div><div class="v '+c[3]+'">'+c[1]+'</div><div class="s">'+c[2]+'</div></div>';}).join('');
  window.__SPX_TOTALS={sheet:state.sheet,drivers:n,done:done,assign:a,delivered:del,onhold:oh,remain:rem,pct:+pct.toFixed(1)};
}

/* ---------- chips ---------- */
var chipsEl=$('chips');
function renderChips(){
  chipsEl.innerHTML=FILTERS.map(function(f){
    return '<button type="button" class="chip" data-k="'+f.k+'">'+f.t+'<span class="n">'+DATA.filter(f.f).length+'</span></button>';
  }).join('');
}
chipsEl.addEventListener('click',function(e){
  var b=e.target.closest('.chip');if(!b)return;
  state.filter=b.getAttribute('data-k');render();
});

/* ---------- controls ---------- */
var qEl=$('q'),clr=$('clr');
qEl.addEventListener('input',function(){state.q=qEl.value.trim().toLowerCase();clr.style.display=qEl.value?'block':'none';render();});
clr.addEventListener('click',function(){qEl.value='';state.q='';clr.style.display='none';render();qEl.focus();});

function setSort(k){
  if(!SORTS[k])return;
  if(state.sort===k)state.dir=-state.dir;else{state.sort=k;state.dir=SORTS[k].def;}
  render();
}
var sortSel=$('sortSel'),dirBtn=$('dirBtn');
sortSel.addEventListener('change',function(){state.sort=sortSel.value;state.dir=SORTS[state.sort].def;render();});
dirBtn.addEventListener('click',function(){state.dir=-state.dir;render();});
$('thead').addEventListener('click',function(e){var s=e.target.closest('span[data-k]');if(s)setSort(s.getAttribute('data-k'));});

$('tabSel').addEventListener('change',function(){
  var v=this.value;
  state.userPicked=!!(META&&v!==META.defaultSheet);
  state.sheet=v;state.open={};
  load(v);
});
$('refBtn').addEventListener('click',reload);
$('retryBtn').addEventListener('click',reload);

var listEl=$('list');
listEl.addEventListener('click',function(e){
  var r=e.target.closest('.row');if(!r)return;
  var id=r.getAttribute('data-id');state.open[id]=!state.open[id];r.classList.toggle('open',!!state.open[id]);
});

/* ---------- rows ---------- */
function fillCls(p){return p>=100?'f100':p<50?'fvlow':p<70?'flow':'';}
function rowHTML(d,i){
  var st=status(d);
  var ohCls=d.onhold>=10?'hot':d.onhold>=5?'warn':'';
  var p=d.progress;
  var note='';
  if(!d.done&&p<50)note+='<div class="note r">ส่งได้ต่ำกว่า 50% — ค้างอีก '+fmt(d.remain)+' ชิ้น ควรติดต่อคนขับ</div>';
  else if(!d.done&&p<70)note+='<div class="note y">ส่งได้ '+p.toFixed(1)+'% — ติดตามความคืบหน้า</div>';
  if(d.onhold>=10)note+='<div class="note r">On-hold สูง ('+d.onhold+' ชิ้น) — ตรวจสอบเหตุผลพัสดุตีกลับ</div>';
  if(d.remainRaw<0)note+='<div class="note y">ข้อมูลเกิน: Delivered + On-hold มากกว่า Assign '+fmt(-d.remainRaw)+' ชิ้น</div>';
  if(d.done)note+='<div class="note g">ส่งครบแล้ว'+(d.onhold>0?' (On-hold '+d.onhold+' ชิ้น)':'')+'</div>';
  return '<div class="row st-'+st.c+(state.open[d.id]?' open':'')+'" data-id="'+esc(d.id)+'">'+
   '<div class="rmain">'+
    '<div class="l1">'+
      '<span class="rank">'+(i+1)+'</span>'+
      '<span class="wrapname nm"><span class="nm">'+esc(d.name)+'</span><span class="id d-only">ID '+esc(d.id)+'</span></span>'+
    '</div>'+
    '<div class="l2 m-only"><span class="id">ID '+esc(d.id)+'</span><span>·</span><span>เริ่มส่ง '+esc(d.first)+'</span><span style="margin-left:auto"><span class="badge sb '+st.c+'">'+st.t+'</span></span></div>'+
    '<div class="nums">'+
      '<div class="m-only"><div class="k">First Del</div><div class="v">'+esc(d.first)+'</div></div>'+
      '<div class="d-only"><div class="v">'+esc(d.first)+'</div></div>'+
      '<div><div class="k">Assign</div><div class="v">'+fmt(d.assign)+'</div></div>'+
      '<div><div class="k">Delivered</div><div class="v del">'+fmt(d.delivered)+'</div></div>'+
      '<div class="'+(d.onhold>=10?'hotbg':'')+'"><div class="k">On-hold</div><div class="v oh '+ohCls+'">'+fmt(d.onhold)+'</div></div>'+
      '<div><div class="k">ค้าง</div><div class="v rem'+(d.remain?'':' zero')+'">'+fmt(d.remain)+'</div></div>'+
    '</div>'+
    '<div class="pbar"><span style="display:flex;align-items:center;gap:8px;flex:1"><span class="track"><span class="fill '+fillCls(p)+'" style="display:block;width:'+Math.min(100,p).toFixed(2)+'%"></span></span><span class="pct">'+p.toFixed(1)+'%</span></span>'+
    '<span class="d-only"><span class="badge sb '+st.c+'">'+st.t+'</span></span></div>'+
   '</div>'+
   '<div class="det"><dl>'+
     '<dt>Driver ID</dt><dd>'+esc(d.id)+'</dd>'+
     '<dt>ชื่อคนขับ</dt><dd>'+esc(d.name)+'</dd>'+
     '<dt>เริ่มส่งชิ้นแรก</dt><dd>'+esc(d.first)+(d.first!=='-'?' น.':'')+'</dd>'+
     '<dt>Assign</dt><dd>'+fmt(d.assign)+' ชิ้น</dd>'+
     '<dt>Delivered</dt><dd>'+fmt(d.delivered)+' ชิ้น</dd>'+
     '<dt>On-hold</dt><dd>'+fmt(d.onhold)+' ชิ้น</dd>'+
     '<dt>ค้าง (Assign − Delivered − On-hold)</dt><dd>'+fmt(d.remainRaw)+' ชิ้น</dd>'+
     '<dt>Progress (Delivered ÷ Assign)</dt><dd>'+p.toFixed(2)+'%</dd>'+
     '<dt>สถานะ</dt><dd>'+st.t+'</dd>'+
   '</dl>'+note+'</div>'+
  '</div>';
}

function render(){
  var f=FILTERS.filter(function(x){return x.k===state.filter;})[0]||FILTERS[0];
  var q=state.q;
  var rows=DATA.filter(f.f).filter(function(d){return !q||d.name.toLowerCase().indexOf(q)>=0||d.id.toLowerCase().indexOf(q)>=0;});
  var S=SORTS[state.sort]||SORTS.delivered,dir=state.dir;
  rows.sort(function(a,b){
    var x=S.f(a),y=S.f(b),c=S.str?String(x).localeCompare(String(y),'th'):(x-y);
    if(c===0)c=b.delivered-a.delivered;else c*=dir;
    return c;
  });
  listEl.innerHTML=rows.length?rows.map(rowHTML).join(''):'<div class="empty">'+(DATA.length?'ไม่พบคนขับที่ตรงกับเงื่อนไข':'แท็บนี้ยังไม่มีข้อมูลคนขับ')+'</div>';
  $('cnt').textContent='แสดง '+rows.length+' / '+DATA.length+' คน';
  Array.prototype.forEach.call(chipsEl.children,function(b){b.classList.toggle('on',b.getAttribute('data-k')===state.filter);});
  sortSel.value=state.sort;
  dirBtn.textContent=dir<0?'↓ มาก→น้อย':'↑ น้อย→มาก';
  if(state.sort==='first')dirBtn.textContent=dir<0?'↓ ช้า→เร็ว':'↑ เร็ว→ช้า';
  if(state.sort==='name')dirBtn.textContent=dir<0?'↓ ฮ→ก':'↑ ก→ฮ';
  if(state.sort==='status')dirBtn.textContent=dir<0?'↓ ครบ→น่าห่วง':'↑ น่าห่วง→ครบ';
  Array.prototype.forEach.call(document.querySelectorAll('#thead span'),function(s){
    var k=s.getAttribute('data-k'),base=s.getAttribute('data-t')||s.textContent;
    s.setAttribute('data-t',base);
    var on=k===state.sort;s.classList.toggle('on',on);
    s.textContent=base+(on?(dir<0?' ▼':' ▲'):'');
  });
}

dirBtn.textContent='↓ มาก→น้อย';
/* loaded lazily when the คนขับ view is first shown (see view switcher below) */
window.SPX_DRIVER={ensure:function(){if(!META&&!state.loading)load('');}};
})();
