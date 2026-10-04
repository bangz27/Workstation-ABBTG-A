/* กะ Fleet / กะ Ops + view switcher — UI identical to Apps Script v5; data via SPX_API */
/* ===== View switcher + shift roster views (กะ Fleet / กะ Ops) ===== */
(function(){
"use strict";
var TH_MON=['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
var TH_WD=['อา','จ','อ','พ','พฤ','ศ','ส'];
var TH_WDL=['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];
var VIEWS={home:{title:'หน้าแรก',theme:'#F8F8F5'},
  driver:{theme:'#F8F8F5'},
  fleet:{sheet:'Dayoff Fleet',title:'กะ Fleet',theme:'#F8F8F5'},
  ops:{sheet:'Dayoff Ops',title:'กะ Ops',theme:'#F8F8F5'},
  leave:{title:'การลา',theme:'#F8F8F5'}};
var RS={};
['fleet','ops'].forEach(function(v){RS[v]={v:v,res:null,people:[],date:'',filter:'all',func:'',q:'',open:{},seq:0,loading:false};});
var view='driver';

function $(id){return document.getElementById(id);}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function pad2(n){return (n<10?'0':'')+n;}

/* ---------- dates ('yyyy-MM-dd' strings only) ---------- */
function dparts(s){var m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(s||'');return m?{y:+m[1],m:+m[2]-1,d:+m[3]}:null;}
function dnum(s){var p=dparts(s);return p?Date.UTC(p.y,p.m,p.d)/864e5:NaN;}
function wday(s){var p=dparts(s);return p?new Date(Date.UTC(p.y,p.m,p.d)).getUTCDay():0;}
function dShort(s){var p=dparts(s);return p?TH_WD[wday(s)]+' '+p.d+' '+TH_MON[p.m]:s;}
function dBox(s){var p=dparts(s);return p?p.d+' '+TH_MON[p.m]+' '+String(p.y+543).slice(-2):s;}
function dLong(s){var p=dparts(s);return p?'วัน'+TH_WDL[wday(s)]+'ที่ '+p.d+' '+TH_MON[p.m]+' '+(p.y+543):s;}
function bkkToday(){
  try{var f=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());if(/^\d{4}-\d{2}-\d{2}$/.test(f))return f;}catch(e){}
  var d=new Date(Date.now()+7*36e5);return d.getUTCFullYear()+'-'+pad2(d.getUTCMonth()+1)+'-'+pad2(d.getUTCDate());
}
function thStamp(s){var m=/^(\d{4})-(\d{2})-(\d{2}) (\d{2}:\d{2}):\d{2}/.exec(String(s||''));return m?(+m[3])+' '+TH_MON[+m[2]-1]+' '+m[4]+' น.':String(s||'');}
function relDay(s,today){var k=dnum(s)-dnum(today);return k===0?'วันนี้':k===1?'พรุ่งนี้':k===-1?'เมื่อวาน':'';}

/* ---------- leave types (edit here) ----------
   A cell (or one comma-separated part of it) equal to one of `match` (case-insensitive, spaces trimmed)
   is that leave type. Leave counts as NOT working (k:'other') → never in ทำงาน / กะเช้า / กะบ่าย. */
var LEAVE_UI=true;           // compact leave line in กะ Fleet / กะ Ops + legend (full cards live in the การลา tab)
var LEAVE_TEXT_MATCH=false;  // recognise leave words typed in the sheet cells (off: leave comes from leave_records)
var LEAVE_TYPES=[
  {key:'sick',     label:'ลาป่วย',    short:'ป่วย',    match:['ลาป่วย','ป่วย','SL','Sick']},
  {key:'personal', label:'ลากิจ',     short:'กิจ',     match:['ลากิจ','กิจ','PL','BL','Personal']},
  {key:'annual',   label:'ลาพักร้อน', short:'พักร้อน', match:['ลาพักร้อน','พักร้อน','AL','VL','Annual','Vacation']},
  {key:'absent',   label:'ขาดงาน',    short:'ขาด',     match:['ขาดงาน','ขาด','ABS','Absent']},
  {key:'other',    label:'ลาอื่นๆ',    short:'อื่นๆ',    match:['ลาอื่นๆ','ลาอื่น','OL','Other leave']}
];
/* Exact values from the read-only Dayoff Fleet / Dayoff Ops sheet cells only. */
var SHEET_LEAVE_CODES={
  sl:{key:'sick',label:'ลาป่วย',short:'ป่วย'},
  bl:{key:'personal',label:'ลากิจ',short:'กิจ'},
  ab:{key:'absent',label:'ขาดงาน',short:'ขาด'},
  l:{key:'other',label:'ลาอื่นๆ',short:'อื่นๆ'}
};
var LEAVE_BY={};LEAVE_TYPES.forEach(function(t){t.match.forEach(function(m){LEAVE_BY[String(m).replace(/\s+/g,' ').trim().toLowerCase()]=t;});});
function leaveOf(tok){if(!LEAVE_TEXT_MATCH)return null;return LEAVE_BY[String(tok==null?'':tok).replace(/\s+/g,' ').trim().toLowerCase()]||null;}

/* ---------- shift cell parsing ---------- */
var RD_RE=/^(RD|OFF|DAY\s*OFF|DAYOFF|หยุด|วันหยุด)$/i;
var SH_RE=/^(\d{1,2})[:.]?(\d{2})\s*[-–~]\s*(\d{1,2})[:.]?(\d{2})$/;
function hm(h,m){return pad2(h)+':'+m;}
function parseCell(raw){
  var s=String(raw==null?'':raw).trim();
  if(!s)return {k:'blank',raw:'',key:'blank',label:'ไม่ระบุ',short:'–'};
  var sheetLeave=SHEET_LEAVE_CODES[s.toLowerCase()];
  if(sheetLeave)return {k:'other',lv:sheetLeave.key,raw:s,key:'lv:'+sheetLeave.key,label:sheetLeave.label,short:sheetLeave.short};
  var toks=s.split(/\s*[,;|\n]\s*/).filter(Boolean),sh=[],rd=false,oth=[];
  toks.forEach(function(t){
    var m=SH_RE.exec(t);
    if(m&&+m[1]<=24&&+m[3]<=24){var a=(+m[1])*60+(+m[2]),b=(+m[3])*60+(+m[4]);
      sh.push({key:pad2(+m[1])+m[2]+'-'+pad2(+m[3])+m[4],start:a,end:b,label:hm(+m[1],m[2])+'–'+hm(+m[3],m[4])+(b<=a?' (ข้ามวัน)':''),
        short:pad2(+m[1])+(m[2]!=='00'?':'+m[2]:'')+'-'+pad2(+m[3])+(m[4]!=='00'?':'+m[4]:'')});}
    else if(RD_RE.test(t))rd=true;
    else oth.push(t);
  });
  if(sh.length){var f=sh[0];return {k:'work',raw:s,key:f.key,start:f.start,end:f.end,label:f.label,short:f.short,mixed:rd||sh.length>1||oth.length>0};}
  if(rd&&!oth.length)return {k:'off',raw:s,key:'RD',label:'หยุด (RD)',short:'RD'};
  var lv=null;for(var q=0;q<oth.length&&!lv;q++)lv=leaveOf(oth[q]);
  if(lv&&oth.length===1&&!rd)return {k:'other',lv:lv.key,raw:s,key:'lv:'+lv.key,label:lv.label,short:lv.short};
  if(lv){var lo=oth.map(function(t){var x=leaveOf(t);return x?x.label:t;}).join(', ')+(rd?' + RD':'');
    return {k:'other',lv:lv.key,raw:s,key:'o:'+lo,label:lo,short:lv.short};}
  var o=oth.join(', ')+(rd?' + RD':'');
  return {k:'other',raw:s,key:'o:'+o,label:o,short:o.length>5?o.slice(0,5):o};
}

/* ---------- leave records overlay (from public.leave_records via SPX_LEAVE) ----------
   A record covering a date turns that person's cell into leave (not working).
   RD in the sheet stays RD. */
var LT_BY={};LEAVE_TYPES.forEach(function(t){LT_BY[t.key]=t;});
function leaveIndex(v){
  var L=window.SPX_LEAVE,rows=L&&L.rows||[],m={};
  rows.forEach(function(r){if(r.staff_type===v&&LT_BY[r.leave_type])(m[r.person_id]||(m[r.person_id]=[])).push(r);});
  return m;
}
function applyLeave(v){
  var st=RS[v];if(!st||!st.res)return;
  var m=leaveIndex(v),dates=st.res.dates;
  st.people.forEach(function(p){
    var recs=m[p.key]||(p.id?null:m[p.name]);
    p.cells=p.base.map(function(c,i){
      if(!recs||c.k==='off')return c;
      var d=dates[i],r=null;
      for(var j=0;j<recs.length;j++)if(recs[j].start_date<=d&&recs[j].end_date>=d){r=recs[j];break;}
      if(!r)return c;
      var t=LT_BY[r.leave_type];
      return {k:'other',lv:t.key,key:'lv:'+t.key,label:t.label,short:t.short,rec:r,
        raw:t.label+(r.note?' – '+r.note:'')+(c.raw?' (ตารางเดิม: '+c.raw+')':'')};
    });
  });
}

/* ---------- loading ---------- */
function anyLoading(){return RS.fleet.loading||RS.ops.loading;}
function setSLoading(){
  var st=RS[view]||{};
  document.body.classList.toggle('sloading',anyLoading());
  $('sRefBtn').classList.toggle('spin',!!st.loading);
  $('sRefBtn').disabled=!!st.loading;
  $('sRetryBtn').disabled=!!st.loading;
}
function showSErr(msg){$('serrMsg').textContent='โหลดตารางกะไม่สำเร็จ: '+msg;$('serr').classList.add('show');}
function hideSErr(){$('serr').classList.remove('show');}

function loadRoster(v){
  var st=RS[v],my=++st.seq;
  st.loading=true;setSLoading();if(v===view)hideSErr();
  window.SPX_API.getRosterData(VIEWS[v].sheet).then(function(res){
      if(my!==st.seq)return;
      st.loading=false;
      try{onRoster(v,res);}catch(e){if(v===view)showSErr('แสดงผลผิดพลาด: '+(e&&e.message||e));}
      setSLoading();
    },function(err){
      if(my!==st.seq)return;
      st.loading=false;setSLoading();
      st.err=err&&err.message?err.message:String(err);
      if(v===view){showSErr(st.err);if(!st.res){$('slist').innerHTML='<div class="empty">ไม่สามารถโหลดตารางกะได้</div>';$('supd').textContent='โหลดข้อมูลไม่สำเร็จ';}}
    });
}

function onRoster(v,res){
  if(!res||!res.dates||!res.people)throw new Error('ไม่ได้รับข้อมูลจากเซิร์ฟเวอร์');
  var st=RS[v];st.res=res;st.err='';
  st.today=res.today||bkkToday();
  st.people=res.people.map(function(p){
    return {id:String(p.id||''),empId:String(p.empId||''),name:String(p.name||''),func:String(p.func||''),station:String(p.station||''),
      base:(p.shifts||[]).map(parseCell),cells:null,key:String(p.id||p.name)};
  });
  applyLeave(v);
  if(!st.date||res.dates.indexOf(st.date)<0)st.date=pickDate(res.dates,st.today);
  if(st.func&&!st.people.some(function(p){return p.func===st.func;}))st.func='';
  if(v===view)renderAll(true);
  if(window.SPX_LEAVE)window.SPX_LEAVE.rosterLoaded(v);
}
/* today if present, else nearest date in range */
function pickDate(dates,today){
  if(!dates.length)return '';
  if(dates.indexOf(today)>=0)return today;
  var t=dnum(today),best=dates[0],bd=Infinity;
  dates.forEach(function(d){var k=Math.abs(dnum(d)-t);if(k<bd){bd=k;best=d;}});
  return best;
}

/* ---------- view switching ---------- */
function setView(v,save){
  if(!VIEWS[v])v='driver';
  view=v;
  document.body.classList.remove('v-home','v-driver','v-fleet','v-ops','v-leave');
  document.body.classList.add('v-'+v);
  Array.prototype.forEach.call($('views').children,function(b){var on=b.getAttribute('data-v')===v;b.classList.toggle('on',on);b.setAttribute('aria-selected',on?'true':'false');});
  var tm=document.querySelector('meta[name="theme-color"]');if(tm)tm.setAttribute('content',VIEWS[v].theme);
  if(save){try{localStorage.setItem('spxView2',v);}catch(e){}}
  if(v==='home'){if(window.SPX_DRIVER)window.SPX_DRIVER.ensure();if(window.SPX_HOME)window.SPX_HOME.paint();window.scrollTo(0,0);return;}
  if(v==='driver'){if(window.SPX_DRIVER)window.SPX_DRIVER.ensure();return;}
  if(v==='leave'){if(window.SPX_LEAVE)window.SPX_LEAVE.show();window.scrollTo(0,0);return;}
  var st=RS[v];
  $('sViewLbl').textContent=VIEWS[v].title;
  hideSErr();
  $('sq').value=st.q;$('sclr').style.display=st.q?'block':'none';
  if(st.res)renderAll(true);
  else{
    $('scards').innerHTML='';$('stiles').innerHTML='';$('dstrip').innerHTML='';$('schips').innerHTML='';$('fchips').style.display='none';
    $('sDateLbl').textContent='–';$('sDateLong').textContent='กำลังโหลด…';$('supd').textContent='กำลังโหลดตารางกะ…';$('scnt').textContent='';$('swarns').innerHTML='';
    $('slist').innerHTML=st.err?'<div class="empty">ไม่สามารถโหลดตารางกะได้</div>':'<div class="empty"><div class="spinner"></div>กำลังโหลดตารางกะ…</div>';
    if(st.err)showSErr(st.err);
    if(!st.loading)loadRoster(v);
  }
  setSLoading();
  window.scrollTo(0,0);
}
$('views').addEventListener('click',function(e){var b=e.target.closest('button[data-v]');if(b&&b.getAttribute('data-v')!==view)setView(b.getAttribute('data-v'),true);});

/* ---------- rendering ---------- */
function cur(){return RS[view];}
function dIdx(st){return st.res?st.res.dates.indexOf(st.date):-1;}

function renderAll(scroll){
  var st=cur();if(!st||!st.res)return;
  var res=st.res;
  $('supd').textContent='อัปเดตล่าสุด '+thStamp(res.loadedAt);
  $('sfoot').textContent='ข้อมูลจากแท็บ "'+res.sheetName+'" · ซิงก์เมื่อ '+thStamp(res.loadedAt)+' · แตะที่รายชื่อเพื่อดูตารางกะทั้งช่วง';
  var idLbl=res.cols&&res.cols.id||'ID';
  $('sq').placeholder='ค้นหาชื่อ หรือ '+idLbl;
  $('swarns').innerHTML=(res.warnings||[]).map(function(w){return '<div class="warn">'+esc(w)+'</div>';}).join('');
  renderStrip(scroll);renderDay();
}

function renderStrip(scroll){
  var st=cur(),dates=st.res.dates,i0=dIdx(st);
  $('dstrip').innerHTML=dates.map(function(d,i){
    var p=dparts(d),w=wday(d),off=0;
    st.people.forEach(function(x){if(x.cells[i]&&x.cells[i].k==='off')off++;});
    return '<button type="button" class="dchip'+(d===st.date?' sel':'')+(d===st.today?' today':'')+(w===0||w===6?' wkend':'')+'" data-d="'+d+'">'+
      '<span class="dw">'+(d===st.today?'วันนี้':TH_WD[w])+'</span><b>'+p.d+'</b><span class="dm">'+TH_MON[p.m]+'</span><span class="doff">หยุด '+off+'</span></button>';
  }).join('')||'<span style="font-size:13px;opacity:.9;padding:8px">ไม่พบคอลัมน์วันที่</span>';
  $('dPrev').disabled=i0<=0;$('dNext').disabled=i0<0||i0>=dates.length-1;
  $('todayBtn').disabled=!dates.length||st.date===pickDate(dates,st.today);
  if(scroll){var el=$('dstrip').querySelector('.dchip.sel');if(el){var s=$('dstrip');s.style.scrollBehavior='auto';s.scrollLeft=Math.max(0,el.offsetLeft-s.offsetLeft-(s.clientWidth-el.offsetWidth)/2);s.style.scrollBehavior='';}}
}

function setDate(d,scroll){
  var st=cur();if(!st||!st.res||st.res.dates.indexOf(d)<0)return;
  st.date=d;
  Array.prototype.forEach.call($('dstrip').children,function(b){b.classList.toggle('sel',b.getAttribute('data-d')===d);});
  var i0=dIdx(st);$('dPrev').disabled=i0<=0;$('dNext').disabled=i0>=st.res.dates.length-1;
  $('todayBtn').disabled=st.date===pickDate(st.res.dates,st.today);
  if(scroll!==false){var el=$('dstrip').querySelector('.dchip.sel');if(el&&el.scrollIntoView)el.scrollIntoView({inline:'center',block:'nearest',behavior:'smooth'});}
  renderDay();
}

/* ---------- "พรุ่งนี้หยุด" + leave cards ---------- */
function nextDay(s){var p=dparts(s);if(!p)return '';var d=new Date(Date.UTC(p.y,p.m,p.d+1));return d.getUTCFullYear()+'-'+pad2(d.getUTCMonth()+1)+'-'+pad2(d.getUTCDate());}
/* index of the calendar day after the selected date, -1 if that day is not in the roster */
function tmrIdx(st){return st&&st.res?st.res.dates.indexOf(nextDay(st.date)):-1;}
function tmrCount(st){var t=tmrIdx(st),n=0;if(t>=0)st.people.forEach(function(p){if(p.cells[t]&&p.cells[t].k==='off')n++;});return n;}
function leaveCounts(st,i){var o={};LEAVE_TYPES.forEach(function(t){o[t.key]=0;});st.people.forEach(function(p){var c=p.cells[i];if(c&&c.lv)o[c.lv]++;});return o;}
function extraCards(st,i){
  var t=tmrIdx(st),nd=nextDay(st.date),dis=t<0,n=dis?0:tmrCount(st),on=st.filter==='tmr',lc=leaveCounts(st,i);
  var h='<div class="tmr'+(on?' on':'')+(dis?' dis':'')+'"'+(dis?' aria-disabled="true"':' data-f="tmr" role="button" tabindex="0"')+' aria-label="พรุ่งนี้หยุด '+n+' คน">'+
    '<span class="tg">พรุ่งนี้</span>'+
    '<span class="tk">หยุด (RD)<small>'+(dis?'ไม่มีข้อมูลวันถัดไป':esc(dShort(nd)))+'</small></span>'+
    '<b class="tv">'+n+'<small>'+(dis?'ไม่มีข้อมูล':'คน')+'</small></b>'+
    (dis?'':'<span class="tx">'+(on?'✕ ปิด':'ดูรายชื่อ ›')+'</span>')+'</div>';
  if(LEAVE_UI&&window.SPX_LEAVE&&window.SPX_LEAVE.canView()){   // compact: only the types that have people today; hidden without การลา view permission
    var ltot=0,lp=LEAVE_TYPES.filter(function(x){ltot+=lc[x.key];return lc[x.key]>0||st.filter==='lv:'+x.key;});
    h+='<div class="lvline'+(ltot?'':' none')+'"><span class="lt">ลา/ขาด '+ltot+' คน</span>'+lp.map(function(x){var f='lv:'+x.key;
      return '<button type="button" class="lvs lv-'+x.key+(st.filter===f?' on':'')+'" data-f="'+f+'" aria-label="'+esc(x.label)+' '+lc[x.key]+' คน">'+esc(x.label)+' <b>'+lc[x.key]+'</b></button>';}).join('')+
      (ltot?'':'<span class="lnone">ไม่มีคนลาวันนี้</span>')+
      '<button type="button" class="lvgo" data-go="leave">การลา ›</button></div>';
  }
  return {html:h,tmr:dis?null:n,leave:lc};
}

/* stats for the selected date */
function dayStats(st,i){
  var s={total:0,work:0,off:0,other:0,blank:0,shifts:{},others:{}};
  st.people.forEach(function(p){
    var c=p.cells[i]||parseCell('');s.total++;s[c.k]++;
    if(c.k==='work'){var g=s.shifts[c.key]||(s.shifts[c.key]={key:c.key,label:c.label,start:c.start,end:c.end,n:0});g.n++;}
    if(c.k==='other'){var o=s.others[c.key]||(s.others[c.key]={key:c.key,label:c.label,n:0});o.n++;}
  });
  s.shiftList=Object.keys(s.shifts).map(function(k){return s.shifts[k];}).sort(function(a,b){return a.start-b.start||a.end-b.end;});
  return s;
}

function renderDay(){
  var st=cur(),res=st.res,i=dIdx(st);
  var rel=relDay(st.date,st.today);
  $('sDateLbl').textContent=dBox(st.date);
  var note=res.dates.indexOf(st.today)<0?'<small>วันนี้ไม่อยู่ในตาราง — แสดงวันที่ใกล้ที่สุด</small>':(rel?'<small>'+rel+'</small>':'<small>&nbsp;</small>');
  $('sDateLong').innerHTML=esc(dLong(st.date))+note;
  if(i<0){$('scards').innerHTML='';$('stiles').innerHTML='';$('schips').innerHTML='';$('slist').innerHTML='<div class="empty">ไม่พบข้อมูลวันที่ในแท็บนี้</div>';$('scnt').textContent='';return;}
  if(st.filter==='tmr'&&tmrIdx(st)<0)st.filter='all';
  var s=dayStats(st,i);
  var pw=s.total?Math.round(s.work/s.total*100):0;
  if(view==='ops'){renderOpsCards(st,i,s);renderChips(s);renderList();return;}
  $('scards').className='scards';$('stiles').style.display='';
  $('scards').innerHTML=
    '<div class="scard" data-f="all"><div class="k">พนักงานทั้งหมด</div><div class="v">'+s.total+'<small>คน</small></div><div class="s">ในตาราง</div></div>'+
    '<div class="scard work'+(st.filter==='work'?' on':'')+'" data-f="work"><div class="k">ทำงาน</div><div class="v">'+s.work+'<small>คน</small></div><div class="s">'+pw+'% ของทั้งหมด</div></div>'+
    '<div class="scard off'+(st.filter==='off'?' on':'')+'" data-f="off"><div class="k">หยุด (RD)</div><div class="v">'+s.off+'<small>คน</small></div><div class="s">วันหยุด</div></div>';
  var xc=extraCards(st,i);
  $('scards').innerHTML+=xc.html;
  var max=Math.max.apply(null,[1].concat(s.shiftList.map(function(g){return g.n;})));
  var tiles=s.shiftList.map(function(g){
    return '<div class="stile'+(st.filter==='s:'+g.key?' on':'')+'" data-f="s:'+esc(g.key)+'"><div class="t">'+esc(g.label)+'</div><div class="c">'+g.n+' <small>คน</small></div><div class="bar"><i style="width:'+(g.n/max*100).toFixed(1)+'%"></i></div></div>';
  });
  if(s.other)tiles.push('<div class="stile other'+(st.filter==='other'?' on':'')+'" data-f="other"><div class="t">ลา / อื่นๆ</div><div class="c">'+s.other+' <small>คน</small></div></div>');
  if(s.blank)tiles.push('<div class="stile blank'+(st.filter==='blank'?' on':'')+'" data-f="blank"><div class="t">ไม่ระบุกะ</div><div class="c">'+s.blank+' <small>คน</small></div></div>');
  $('stiles').innerHTML=tiles.join('');
  window.__SPX_ROSTER={view:view,date:st.date,total:s.total,work:s.work,off:s.off,other:s.other,blank:s.blank,shifts:s.shiftList.map(function(g){return g.key+':'+g.n;}),tmr:xc.tmr,leave:xc.leave};
  renderChips(s);renderList();
}

/* ---------- กะ Ops summary cards: Hub Supervisor / Hub Assistant Supervisor / Hub Agent ---------- */
function deptKind(f){
  var k=String(f||'').toLowerCase().replace(/\s+/g,' ').trim();
  if(k==='hub supervisor')return 'sup';
  if(k==='hub assistant supervisor')return 'asst';
  if(k==='hub agent')return 'agent';
  return 'other';                                   // counted with Hub Agents
}
var MILE_CUT=11*60;                                 // start < 11:00 → Last Mile / กะเช้า
/* RD dates from index i to end of roster → "อา 4, อา 11 ต.ค., อา 1 พ.ย." */
function offList(p,i,dates){
  var out=[],grp=[],gm=-1;
  for(var j=i;j<dates.length;j++){
    if(!p.cells[j]||p.cells[j].k!=='off')continue;
    var d=dparts(dates[j]);
    if(gm!==-1&&d.m!==gm){out.push(grp.join(', ')+' '+TH_MON[gm]);grp=[];}
    gm=d.m;grp.push(String(d.d));
  }
  if(grp.length)out.push(grp.join(', ')+' '+TH_MON[gm]);
  return out.join(', ');
}
/* shift used for Last/First Mile: selected day if working, else most frequent working shift */
function mileShift(p,i){
  var c=p.cells[i];
  if(c&&c.k==='work')return c;
  var cnt={},best=null;
  p.cells.forEach(function(x){if(x.k!=='work')return;cnt[x.key]=(cnt[x.key]||0)+1;if(!best||cnt[x.key]>cnt[best.key]||(cnt[x.key]===cnt[best.key]&&x.start<best.start))best=x;});
  return best;
}
function shiftBadge(c){
  if(c.k==='work')return '<span class="sbdg work">'+esc(c.label)+(c.mixed?'<span class="mx">'+(/RD/i.test(c.raw)?'+RD':'+')+'</span>':'')+'</span>';
  if(c.k==='off')return '<span class="sbdg off">หยุด RD</span>';
  if(c.k==='other')return '<span class="sbdg other'+(c.lv?' lv-'+c.lv:'')+'">'+esc(c.label)+'</span>';
  return '<span class="sbdg blank">ไม่ระบุ</span>';
}
function personCard(p,i,dates,title,cls){
  var c=p.cells[i]||parseCell(''),off=offList(p,i,dates);
  return '<div class="pcard'+(c.k==='off'?' rd':'')+'">'+
    '<div class="pc1"><span class="pcn">'+esc(p.name)+'</span></div>'+
    '<div class="pcd '+(cls||'')+'">'+esc(title)+'</div>'+
    '<div class="pcr"><span class="k">กะเข้างาน</span><span class="v">'+shiftBadge(c)+'</span>'+
    '<span class="k">สถานะ</span><span class="v">'+(c.k==='off'?'<span class="sbdg off">วันหยุด</span>':c.k==='work'?'<span class="sbdg work">ทำงาน</span>':c.lv?'<span class="sbdg other lv-'+c.lv+'">'+esc(c.label)+'</span>':'<span class="sbdg blank">ไม่ระบุ</span>')+'</span></div></div>';
}
function agentBucket(p,i){var c=p.cells[i]||parseCell('');return c.k==='work'?(c.start>=MILE_CUT?'pm':'am'):c.k==='off'?'off':'';}
function renderOpsCards(st,i,s){
  var dates=st.res.dates,sc=$('scards');
  sc.className='scards opsx';$('stiles').style.display='none';$('stiles').innerHTML='';
  var sups=[],assts=[],ag={am:0,pm:0,off:0,other:0,total:0,amT:{},pmT:{},extra:0,sh:{}};
  st.people.forEach(function(p){
    var k=deptKind(p.func);
    if(k==='sup')sups.push(p);
    else if(k==='asst')assts.push(p);
    else{
      ag.total++;if(k==='other')ag.extra++;
      var b=agentBucket(p,i),c=p.cells[i];
      if(b==='am'||b==='pm'){ag[b]++;ag[b+'T'][c.label.slice(0,5)]=1;var g=ag.sh[c.key]||(ag.sh[c.key]={key:c.key,label:c.label,start:c.start,end:c.end,n:0});g.n++;}
      else if(b==='off')ag.off++;else ag.other++;
    }
  });
  var byName=function(a,b){return a.name.localeCompare(b.name,'th');};
  sups.sort(byName);
  var am=assts.map(function(p){var m=mileShift(p,i);return {p:p,m:m,o:m?(m.start<MILE_CUT?0:1):2};});
  am.sort(function(a,b){return a.o-b.o||byName(a.p,b.p);});
  var h=[];
  // compact totals (tap = filter, as before)
  h.push('<div class="ostat">'+
    '<div class="os" data-f="all"><span class="k">ทั้งหมด</span><b>'+s.total+'</b><span class="k">คน</span></div>'+
    '<div class="os work'+(st.filter==='work'?' on':'')+'" data-f="work"><span class="k">ทำงาน</span><b>'+s.work+'</b></div>'+
    '<div class="os off'+(st.filter==='off'?' on':'')+'" data-f="off"><span class="k">หยุด RD</span><b>'+s.off+'</b></div></div>');
  var xc=extraCards(st,i);
  h.push(xc.html);
  if(sups.length){
    h.push('<div class="osec">Hub Supervisor</div>');
    sups.forEach(function(p){h.push(personCard(p,i,dates,p.func||'Hub Supervisor',''));});
  }
  if(am.length){
    h.push('<div class="osec">Hub Assistant Supervisor</div>');
    h.push('<div class="pgrid">');
    am.forEach(function(x){
      var t='Hub Assistant Supervisor'+(x.o===0?' Last Mile':x.o===1?' First Mile':'');
      h.push(personCard(x.p,i,dates,t,x.o===0?'lm':x.o===1?'fm':''));
    });
    h.push('</div>');
  }
  var times=function(o){return Object.keys(o).sort().join(' · ');};
  h.push('<div class="osec">Hub Agent <small>· '+(ag.total)+' คน'+(ag.extra?' (รวมแผนกอื่น '+ag.extra+')':'')+(ag.other?' · ไม่ระบุ/ลา '+ag.other:'')+'</small></div>');
  h.push('<div class="ostat">'+
    '<div class="os work'+(st.filter==='ag:am'?' on':'')+'" data-f="ag:am"><span class="k">กะเช้า</span><b>'+ag.am+'</b><span class="k">คน</span></div>'+
    '<div class="os work'+(st.filter==='ag:pm'?' on':'')+'" data-f="ag:pm"><span class="k">กะบ่าย</span><b>'+ag.pm+'</b><span class="k">คน</span></div>'+
    '<div class="os off'+(st.filter==='ag:off'?' on':'')+'" data-f="ag:off"><span class="k">หยุด RD</span><b>'+ag.off+'</b></div></div>');
  var shl=Object.keys(ag.sh).map(function(k){return ag.sh[k];}).sort(function(a,b){return a.start-b.start||a.end-b.end;});
  if(shl.length){
    var mx=Math.max.apply(null,[1].concat(shl.map(function(g){return g.n;})));
    h.push('<div class="osec sm">Hub Agent แยกตามกะ</div><div class="stiles agt">'+shl.map(function(g){
      var f='ag:s:'+g.key;
      return '<div class="stile'+(st.filter===f?' on':'')+'" data-f="'+esc(f)+'"><div class="t">'+esc(g.label)+'</div><div class="c">'+g.n+' <small>คน</small></div><div class="bar"><i style="width:'+(g.n/mx*100).toFixed(1)+'%"></i></div></div>';
    }).join('')+'</div>');
  }
  sc.innerHTML=h.join('');
  window.__SPX_ROSTER={view:view,date:st.date,total:s.total,work:s.work,off:s.off,other:s.other,blank:s.blank,shifts:s.shiftList.map(function(g){return g.key+':'+g.n;}),
    ops:{sup:sups.map(function(p){var c=p.cells[i];return p.name+'|'+c.raw+'|'+offList(p,i,dates);}),
      asst:am.map(function(x){var c=x.p.cells[i];return x.p.name+'|'+(x.o===0?'Last':x.o===1?'First':'?')+'|'+c.raw+'|'+offList(x.p,i,dates);}),
      agent:{am:ag.am,pm:ag.pm,off:ag.off,other:ag.other,total:ag.total}},tmr:xc.tmr,leave:xc.leave};
}
var AGF={'ag:am':'Hub Agent · กะเช้า','ag:pm':'Hub Agent · กะบ่าย','ag:off':'Hub Agent · หยุด RD'};
function agLabel(f){if(AGF[f])return AGF[f];if(f==='tmr')return 'พรุ่งนี้หยุด';if(String(f).indexOf('lv:')===0){for(var j=0;j<LEAVE_TYPES.length;j++)if('lv:'+LEAVE_TYPES[j].key===f)return LEAVE_TYPES[j].label;}if(String(f).indexOf('ag:s:')===0){var k=f.slice(5),m=/^(\d{2})(\d{2})-(\d{2})(\d{2})$/.exec(k);return 'Hub Agent · '+(m?m[1]+':'+m[2]+'–'+m[3]+':'+m[4]:k);}return '';}

/* filter chips: status + per-shift (single choice), Function/Department (separate row) */
function funcPass(st,p){return !st.func||p.func===st.func;}
function renderChips(){
  var st=cur(),i=dIdx(st),res=st.res;
  var base=st.people.filter(function(p){return funcPass(st,p);});
  var s={total:base.length,work:0,off:0,other:0,blank:0,shifts:{}};
  base.forEach(function(p){var c=p.cells[i]||parseCell('');s[c.k]++;if(c.k==='work'){var g=s.shifts[c.key]||(s.shifts[c.key]={label:c.label,start:c.start,end:c.end,n:0});g.n++;}});
  var keys=Object.keys(s.shifts).sort(function(a,b){return s.shifts[a].start-s.shifts[b].start||s.shifts[a].end-s.shifts[b].end;});
  if(st.filter.indexOf('s:')===0&&!s.shifts[st.filter.slice(2)]&&!dayHasShift(st,i,st.filter.slice(2)))st.filter='all';
  var ch=[['all','ทั้งหมด',s.total,''],['work','ทำงาน',s.work,''],['off','หยุด (RD)',s.off,'c-off']];
  keys.forEach(function(k){ch.push(['s:'+k,s.shifts[k].label,s.shifts[k].n,'']);});
  if(s.other||st.filter==='other')ch.push(['other','ลา/อื่นๆ',s.other,'']);
  if(s.blank||st.filter==='blank')ch.push(['blank','ไม่ระบุ',s.blank,'']);
  if(agLabel(st.filter))ch.unshift([st.filter,agLabel(st.filter)+' ✕',base.filter(function(p){return passFilter(st.filter,p.cells[i]||parseCell(''),p);}).length,'c-ag']);
  $('schips').innerHTML=ch.map(function(c){
    return '<button type="button" class="chip '+c[3]+(st.filter===c[0]?' on':'')+'" data-f="'+esc(c[0])+'">'+esc(c[1])+'<span class="n">'+c[2]+'</span></button>';
  }).join('');
  var funcs={};st.people.forEach(function(p){if(p.func)funcs[p.func]=(funcs[p.func]||0)+1;});
  var fk=Object.keys(funcs).sort(function(a,b){return funcs[b]-funcs[a]||a.localeCompare(b);});
  var fc=$('fchips');
  if(fk.length>1){
    var lbl=res.cols&&res.cols.func||'กลุ่ม';
    fc.style.display='';
    fc.innerHTML='<span class="clbl">'+esc(lbl)+'</span>'+
      '<button type="button" class="chip'+(!st.func?' on':'')+'" data-fn="">ทั้งหมด<span class="n">'+st.people.length+'</span></button>'+
      fk.map(function(f){return '<button type="button" class="chip'+(st.func===f?' on':'')+'" data-fn="'+esc(f)+'">'+esc(f)+'<span class="n">'+funcs[f]+'</span></button>';}).join('');
  }else{fc.style.display='none';fc.innerHTML='';}
}
function dayHasShift(st,i,k){return st.people.some(function(p){var c=p.cells[i];return c&&c.k==='work'&&c.key===k;});}

function passFilter(f,c,p){
  if(f==='all')return true;
  if(AGF[f])return !!p&&(deptKind(p.func)==='agent'||deptKind(p.func)==='other')&&agentBucket(p,dIdx(cur()))===f.slice(3);
  if(f.indexOf('ag:s:')===0)return !!p&&(deptKind(p.func)==='agent'||deptKind(p.func)==='other')&&c.k==='work'&&c.key===f.slice(5);
  if(f==='work'||f==='off'||f==='other'||f==='blank')return c.k===f;
  if(f.indexOf('s:')===0)return c.k==='work'&&c.key===f.slice(2);
  if(f==='tmr'){var t=tmrIdx(cur());return !!p&&t>=0&&!!p.cells[t]&&p.cells[t].k==='off';}
  if(f.indexOf('lv:')===0)return c.k==='other'&&c.lv===f.slice(3);
  return true;
}

/* next RD after index i (for working people) / next working day (for people on RD) */
function nextOf(p,i,k){for(var j=i+1;j<p.cells.length;j++)if(p.cells[j].k===k)return j;return -1;}

var GORDER={off:0,work:1,other:2,blank:3};
function renderList(){
  var st=cur(),i=dIdx(st),dates=st.res.dates,q=st.q;
  var rows=st.people.filter(function(p){
    var c=p.cells[i]||parseCell('');
    if(!funcPass(st,p)||!passFilter(st.filter,c,p))return false;
    return !q||p.name.toLowerCase().indexOf(q)>=0||p.id.toLowerCase().indexOf(q)>=0||p.empId.toLowerCase().indexOf(q)>=0;
  });
  rows.sort(function(a,b){
    var x=a.cells[i]||parseCell(''),y=b.cells[i]||parseCell('');
    return (GORDER[x.k]-GORDER[y.k])||((x.start||0)-(y.start||0))||((x.end||0)-(y.end||0))||(x.key<y.key?-1:x.key>y.key?1:0)||a.name.localeCompare(b.name,'th');
  });
  var html=[],lastG=null,groups={};
  rows.forEach(function(p){var c=p.cells[i]||parseCell('');var g=c.k==='work'?'w:'+c.key:c.k;groups[g]=(groups[g]||0)+1;});
  rows.forEach(function(p){
    var c=p.cells[i]||parseCell('');var g=c.k==='work'?'w:'+c.key:c.k;
    if(g!==lastG){
      lastG=g;
      var t=c.k==='work'?'กะ '+c.label:c.k==='off'?'หยุด (RD)':c.k==='other'?'ลา / อื่นๆ':'ไม่ระบุกะ';
      html.push('<div class="ghdr g-'+c.k+'"><span class="dot"></span>'+esc(t)+' <span class="gn">· '+groups[g]+' คน</span></div>');
    }
    html.push(rowHTML(st,p,i,dates));
  });
  $('slist').innerHTML=html.length?html.join(''):'<div class="empty">'+(st.people.length?'ไม่พบพนักงานที่ตรงกับเงื่อนไข':'แท็บนี้ยังไม่มีรายชื่อพนักงาน')+'</div>';
  $('scnt').textContent='แสดง '+rows.length+' / '+st.people.length+' คน';
}

function badge(c){
  if(c.k==='work')return '<span class="sbdg work">'+esc(c.label)+(c.mixed?'<span class="mx">'+(/RD/i.test(c.raw)?'+RD':'+')+'</span>':'')+'</span>';
  if(c.k==='off')return '<span class="sbdg off">หยุด RD</span>';
  if(c.k==='other')return '<span class="sbdg other'+(c.lv?' lv-'+c.lv:'')+'">'+esc(c.label)+'</span>';
  return '<span class="sbdg blank">ไม่ระบุ</span>';
}

function rowHTML(st,p,i,dates){
  var c=p.cells[i]||parseCell(''),open=!!st.open[p.key];
  var meta=[];
  if(p.id)meta.push('ID '+esc(p.id));
  if(p.func)meta.push(esc(p.func));
  var nx='';
  if(c.k==='off'){
    var w=nextOf(p,i,'work');
    nx=w>=0?'<span class="nx back">กลับมา '+esc(dShort(dates[w]))+' · '+esc(p.cells[w].short)+'</span>':'';
  }else{
    var r=nextOf(p,i,'off');
    if(r>=0){var gap=dnum(dates[r])-dnum(dates[i]);nx='<span class="nx'+(gap<=1?' soon':'')+'">'+(gap===1?'พรุ่งนี้หยุด':'หยุดถัดไป '+esc(dShort(dates[r])))+'</span>';}
    else nx='<span class="nx">ไม่มีวันหยุดถัดไปในตาราง</span>';
  }
  return '<div class="prow p-'+c.k+(c.lv?' lv-'+c.lv:'')+(open?' open':'')+'" data-k="'+esc(p.key)+'">'+
    '<div class="pmain"><div class="p1"><span class="pnm">'+esc(p.name)+'</span>'+badge(c)+'</div>'+
    '<div class="p2"><span class="meta">'+meta.join(' · ')+'</span>'+nx+'</div></div>'+
    '<div class="pdet">'+(open?detHTML(st,p,i,dates):'')+'</div></div>';
}

function detHTML(st,p,i,dates){
  var res=st.res,cols=res.cols||{};
  var info=[];
  if(p.id)info.push(esc(cols.id||'ID')+' <b>'+esc(p.id)+'</b>');
  if(p.empId)info.push(esc(cols.empId||'Employee ID')+' <b>'+esc(p.empId)+'</b>');
  if(p.func)info.push(esc(cols.func||'กลุ่ม')+' <b>'+esc(p.func)+'</b>');
  var nw=0,no=0,nl=0;p.cells.forEach(function(c){if(c.k==='work')nw++;else if(c.k==='off')no++;else if(c.lv)nl++;});
  var upc=[];for(var j=i;j<p.cells.length&&upc.length<8;j++)if(p.cells[j].k==='off')upc.push(dShort(dates[j])+(dates[j]===st.today?' (วันนี้)':''));
  var raw=p.cells[i]&&p.cells[i].mixed?'<div class="rawn">ข้อมูลในช่องวันนี้: "'+esc(p.cells[i].raw)+'"</div>':'';
  // calendar, Monday first
  var cal=['จ','อ','พ','พฤ','ศ','ส','อา'].map(function(w,k){return '<div class="wh'+(k>=5?' we':'')+'">'+w+'</div>';});
  var lead=(wday(dates[0])+6)%7,prev=null;
  for(var a=0;a<lead;a++)cal.push('<div class="cc pad"></div>');
  dates.forEach(function(d,j){
    if(prev!==null){var gap=dnum(d)-dnum(prev)-1;for(var b=0;b<gap&&b<6;b++)cal.push('<div class="cc pad"></div>');}
    prev=d;
    var c=p.cells[j],pd=dparts(d);
    cal.push('<div class="cc c-'+c.k+(c.lv?' lv-'+c.lv:'')+(d===st.date?' c-sel':'')+(d===st.today?' c-today':'')+(dnum(d)<dnum(st.today)?' c-past':'')+'" data-d="'+d+'" title="'+esc(dShort(d)+': '+(c.raw||'ไม่ระบุ'))+'">'+
      '<span class="cd">'+pd.d+'</span><span class="cs">'+esc(c.short)+'</span></div>');
  });
  var r0=dparts(dates[0]),r1=dparts(dates[dates.length-1]);
  return '<div class="info">'+info.join('')+'</div>'+
    '<div class="stat">ทั้งช่วง '+r0.d+' '+TH_MON[r0.m]+' – '+r1.d+' '+TH_MON[r1.m]+': ทำงาน <span class="w">'+nw+'</span> วัน · หยุด <span class="o">'+no+'</span> วัน'+(nl?' · ลา <span class="l">'+nl+'</span> วัน':'')+'</div>'+
    (upc.length?'<div class="upc">วันหยุดตั้งแต่ '+esc(dShort(dates[i]))+': '+esc(upc.join(', '))+'</div>':'<div class="upc none">ไม่มีวันหยุดตั้งแต่ '+esc(dShort(dates[i]))+' จนจบตาราง</div>')+raw+
    '<div class="cal">'+cal.join('')+'</div>'+
    '<div class="legend"><span><i style="background:var(--sgl);border:1px solid var(--sgln)"></i>ทำงาน (เวลาเข้า-ออก)</span><span><i style="background:var(--srbg)"></i>หยุด RD</span>'+(LEAVE_UI&&window.SPX_LEAVE&&window.SPX_LEAVE.canView()?'<span><i class="lg-lv"></i>ลา/ขาดงาน</span>':'')+'<span>แตะวันที่เพื่อดูทั้งทีม</span></div>';
}

/* ---------- events ---------- */
$('dstrip').addEventListener('click',function(e){var b=e.target.closest('.dchip');if(b)setDate(b.getAttribute('data-d'));});
$('dPrev').addEventListener('click',function(){var st=cur(),i=dIdx(st);if(i>0)setDate(st.res.dates[i-1]);});
$('dNext').addEventListener('click',function(){var st=cur(),i=dIdx(st);if(st.res&&i<st.res.dates.length-1)setDate(st.res.dates[i+1]);});
$('todayBtn').addEventListener('click',function(){var st=cur();if(st.res)setDate(pickDate(st.res.dates,st.today));});
$('sRefBtn').addEventListener('click',function(){if(RS[view])loadRoster(view);});
$('sRetryBtn').addEventListener('click',function(){if(RS[view])loadRoster(view);});
function setFilter(f){var st=cur();if(!st||!st.res)return;st.filter=(st.filter===f&&f!=='all')?'all':f;renderDay();}
$('schips').addEventListener('click',function(e){var b=e.target.closest('.chip');if(b)setFilter(b.getAttribute('data-f'));});
$('scards').addEventListener('click',function(e){var g=e.target.closest('[data-go]');if(g){setView(g.getAttribute('data-go'),true);return;}var b=e.target.closest('[data-f]');if(b)setFilter(b.getAttribute('data-f'));});
$('scards').addEventListener('keydown',function(e){if(e.key!=='Enter'&&e.key!==' ')return;var b=e.target.closest('[data-f][role="button"]');if(b){e.preventDefault();setFilter(b.getAttribute('data-f'));var x=$('scards').querySelector('[data-f="'+b.getAttribute('data-f')+'"]');if(x)x.focus();}});
$('stiles').addEventListener('click',function(e){var b=e.target.closest('.stile');if(b)setFilter(b.getAttribute('data-f'));});
$('fchips').addEventListener('click',function(e){var b=e.target.closest('.chip');if(!b)return;var st=cur();st.func=b.getAttribute('data-fn')||'';renderChips();renderList();});
var sq=$('sq'),sclr=$('sclr');
sq.addEventListener('input',function(){var st=cur();if(!st)return;st.q=sq.value.trim().toLowerCase();sclr.style.display=sq.value?'block':'none';if(st.res)renderList();});
sclr.addEventListener('click',function(){var st=cur();sq.value='';if(st)st.q='';sclr.style.display='none';if(st&&st.res)renderList();sq.focus();});
$('slist').addEventListener('click',function(e){
  var st=cur();if(!st||!st.res)return;
  var cc=e.target.closest('.cc[data-d]');
  if(cc){setDate(cc.getAttribute('data-d'));return;}
  var r=e.target.closest('.prow');if(!r)return;
  var k=r.getAttribute('data-k');st.open[k]=!st.open[k];
  if(st.open[k]){var p=st.people.filter(function(x){return x.key===k;})[0];if(p)r.querySelector('.pdet').innerHTML=detHTML(st,p,dIdx(st),st.res.dates);}
  r.classList.toggle('open',!!st.open[k]);
});

/* ---------- start ---------- */
var start='home';
try{var sv=localStorage.getItem('spxView2');if(VIEWS[sv])start=sv;}catch(e){}
var hm0=/[#&?]view=(home|driver|fleet|ops|leave)/.exec(location.hash||'');if(hm0)start=hm0[1];
window.SPX_START=function(){if(window.SPX_LEAVE)window.SPX_LEAVE.init();setView(start,false);};
window.SPX_VIEW={set:function(v){setView(v,true);},state:RS,current:function(){return view;},
  ensure:function(v){var st=RS[v];if(st&&!st.res&&!st.loading)loadRoster(v);return !!(st&&st.res);},
  /* called by SPX_LEAVE after leave records change */
  leavesChanged:function(){['fleet','ops'].forEach(applyLeave);if(RS[view]&&RS[view].res)renderAll(false);},
  util:{esc:esc,pad2:pad2,dShort:dShort,dBox:dBox,dLong:dLong,dnum:dnum,bkkToday:bkkToday,LEAVE_TYPES:LEAVE_TYPES}};
})();
