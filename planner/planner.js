/* จัดกะ FMS — page controller.
   Data: public.shift_planner (one JSON document per hub) + public.shift_planner_template (FMS layout files).
   Everyone signed in can read and export; only admins can change (enforced again by the save RPCs). */
(function(){
"use strict";
var C=window.PlannerCore,X=window.PlannerXlsx,api=window.SPX_API,sb=api&&api.client;
var HUB='ABBTG-A';
var S={D:C.emptyData(),rev:0,admin:false,email:'',ym:C.addMonths(C.bkkMonth(),1),f:'all',q:'',onlyBad:false,showRes:false,view:'list',
  dayF:null,sel:new Set(),tpl:{driver:null,ops:null},tplCache:{},dw:null,saving:false,loaded:false};

function $(id){return document.getElementById(id);}
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
function toast(t,ms){var el=$('toast');el.textContent=t;el.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(function(){el.hidden=true;},ms||2600);}
function fail(t){$('loading').hidden=true;var e=$('err');e.textContent=t;e.hidden=false;}
function typeLbl(t){return t==='ops'?'Ops':'Driver';}
function idLbl(t){return t==='ops'?'Ops ID':'Driver ID';}
function byId(id){return S.D.employees.find(function(e){return e.id===id;});}

/* in-page confirm (native confirm/prompt are blocked in some embedded browsers) */
function ask(text,opt){
  opt=opt||{};
  return new Promise(function(res){
    var m=$('askModal');$('askTxt').textContent=text;
    var d=$('askDate');d.hidden=!opt.date;if(opt.date)d.value=opt.date;
    $('askGo').textContent=opt.ok||'ยืนยัน';$('askGo').classList.toggle('danger',!!opt.danger);
    m.hidden=false;setTimeout(function(){(opt.date?d:$('askGo')).focus();},30);
    function done(v){m.hidden=true;$('askGo').onclick=$('askNo').onclick=null;m.onkeydown=null;res(v);}
    $('askGo').onclick=function(){if(opt.date&&!/^\d{4}-\d{2}-\d{2}$/.test(d.value)){d.focus();return;}done(opt.date?d.value:true);};
    $('askNo').onclick=function(){done(false);};
    m.onkeydown=function(e){if(e.key==='Escape'){e.stopPropagation();done(false);}};
  });
}

/* ---------------- load / save ---------------- */
function missingTable(err){var m=String(err&&(err.message||err.code)||'');return /42P01|PGRST20[25]|does not exist|schema cache/i.test(m);}
function load(){
  return sb.auth.getSession().then(function(r){
    var s=r&&r.data&&r.data.session;
    if(!s){location.replace('../');return Promise.reject('redirect');}
    S.email=s.user&&s.user.email||'';
    return Promise.all([
      api.isAdmin(),
      sb.from('shift_planner').select('data,rev,updated_at,updated_by').eq('hub',HUB).maybeSingle(),
      sb.from('shift_planner_template').select('kind,file_name,month,updated_at').eq('hub',HUB)
    ]);
  }).then(function(res){
    S.admin=!!res[0];
    if(res[1].error)throw res[1].error;
    if(res[2].error)throw res[2].error;
    var row=res[1].data;
    S.D=C.migrate(row&&row.data);S.rev=row?row.rev:0;S.meta=row;
    S.tpl={driver:null,ops:null};(res[2].data||[]).forEach(function(t){S.tpl[t.kind]=t;});
    window.SPX_LEAVE={state:{perm:{known:true,email:S.email,admin:S.admin}}};   // account label in the shared sidebar (shell.js)
    document.body.classList.toggle('ro',!S.admin);
    S.loaded=true;$('loading').hidden=true;$('err').hidden=true;$('ui').hidden=false;
    render();
  }).catch(function(e){
    if(e==='redirect')return;
    if(missingTable(e))fail('ยังไม่ได้ติดตั้งตารางของหน้านี้ในฐานข้อมูล\nให้ผู้ดูแลรัน supabase/migrations/20261108090000_shift_planner.sql ใน Supabase → SQL Editor ก่อน');
    else fail('โหลดข้อมูลไม่สำเร็จ: '+api.thErr(e));
  });
}
function save(){
  if(!S.admin)return Promise.reject(new Error('แก้ไขได้เฉพาะผู้ดูแลระบบ'));
  S.D.savedAt=Date.now();
  return sb.rpc('save_shift_planner',{p_hub:HUB,p_data:S.D,p_rev:S.rev}).then(function(r){
    if(r.error){
      if(/rev conflict/i.test(r.error.message||'')){toast('มีการแก้ไขจากอีกเครื่อง — โหลดข้อมูลล่าสุดแล้ว ลองใหม่อีกครั้ง',5000);load();}
      throw new Error(api.thErr(r.error));
    }
    S.rev=r.data;S.meta={updated_at:new Date().toISOString(),updated_by:S.email};renderFoot();
  });
}
/* inline edits: save in the background, one request at a time (rev must chain) */
var q={timer:null,busy:false,again:false};
function saveSoon(){
  clearTimeout(q.timer);setSaveState('wait');
  q.timer=setTimeout(flush,500);
}
function flush(){
  if(q.busy){q.again=true;return;}
  q.busy=true;setSaveState('saving');
  save().then(function(){q.busy=false;if(q.again){q.again=false;flush();}else setSaveState('ok');},
    function(e){q.busy=false;q.again=false;setSaveState('err');toast('บันทึกไม่สำเร็จ: '+e.message,6000);});
}
function setSaveState(k){
  var el=$('saveSt');if(!el)return;
  el.className='wp-save '+k;
  el.textContent={wait:'กำลังบันทึก…',saving:'กำลังบันทึก…',ok:'✓ บันทึกแล้ว',err:'⚠ บันทึกไม่สำเร็จ'}[k]||'';
  if(k==='ok'){clearTimeout(setSaveState.t);setSaveState.t=setTimeout(function(){if(el.className==='wp-save ok')el.textContent='';},2500);}
}
function commit(msg){return save().then(function(){render();if(msg)toast(msg);},function(e){toast('บันทึกไม่สำเร็จ: '+e.message,5000);render();});}

/* ---------------- list ---------------- */
/* list groups = position (e.g. 4W First Mile); known positions first, in the preset order */
function grpOf(e){
  var p=String(e.pos||(e.type==='ops'?e.dept:'')||'').trim();
  if(/^4W First Mile\b/i.test(p))return '4W First Mile';   // 4W First Mile (PROJ) shares the 4W First Mile group
  return p||'Subcon Monthly';   // no position recorded = Subcon Monthly (hub rule)
}
function grpRank(e){
  var i=C.POS[e.type].indexOf(grpOf(e));
  return (e.type==='driver'?'0':'1')+(i>=0?String(i).padStart(2,'0'):'50');
}
function sortKey(e){return grpRank(e)+'|'+grpOf(e)+'|'+(C.issue(e)?'0':'1')+(e.status==='resigned'?'1':'0')+String(e.name||'');}
function visible(){
  var q=S.q.trim().toLowerCase();
  return S.D.employees.filter(function(e){
    var inM=C.inMonth(e,S.ym);
    if(!inM&&!(S.showRes&&e.status==='resigned'))return false;
    if(S.f!=='all'&&e.type!==S.f)return false;
    if(S.onlyBad&&!(inM&&C.issue(e)))return false;
    if(S.dayF!=null&&e.offDays.indexOf(S.dayF)<0)return false;
    if(q&&[e.name,e.nick,e.wid,e.empId,e.pos,e.dept].join(' ').toLowerCase().indexOf(q)<0)return false;
    return true;
  }).sort(function(a,b){return sortKey(a).localeCompare(sortKey(b),'th');});
}
function offHtml(e){
  var h=C.WEEK_ORDER.filter(function(w){return e.offDays.indexOf(w)>=0;}).map(function(w){return '<i class="dd">'+C.TH_WD[w]+'</i>';}).join('');
  var nc=e.comp.filter(function(iso){return iso.slice(0,7)===S.ym;}).length;
  return (h||'<small>ไม่มีวันหยุด</small>')+(nc?' <small>+ชดเชย '+nc+'</small>':'');
}
function shiftSel(e){
  var opts=C.SHIFTS.slice();if(e.shift&&opts.indexOf(e.shift)<0)opts.unshift(e.shift);
  return '<select class="r-sh'+(e.shift?'':' miss')+'" aria-label="กะของ '+esc(e.name)+'"'+(S.admin?'':' disabled')+'><option value="">— เลือกกะ —</option>'+
    opts.map(function(o){return '<option'+(o===e.shift?' selected':'')+'>'+o+'</option>';}).join('')+'</select>';
}
function dayBtns(e){
  return '<span class="r-days" role="group" aria-label="วันหยุดประจำ">'+C.WEEK_ORDER.map(function(w){
    var on=e.offDays.indexOf(w)>=0;
    return '<button type="button" data-w="'+w+'" class="'+(on?'on':'')+'" aria-pressed="'+on+'"'+(S.admin?'':' disabled')+'>'+C.TH_WD[w]+'</button>';
  }).join('')+'</span>';
}
function renderList(list){
  var h='',last=null;
  var groups={};list.forEach(function(e){var k=e.type+'|'+grpOf(e);groups[k]=(groups[k]||0)+1;});
  list.forEach(function(e){
    var k=e.type+'|'+grpOf(e);
    if(k!==last){
      h+=(last===null?'<div class="wp-row wp-head" aria-hidden="true"><span></span><span>ชื่อ</span><span>กะ</span><span>หยุดประจำ (กดเพื่อเปลี่ยน)</span><span></span></div>':'')+'<div class="wp-grp"><b>'+esc(grpOf(e))+'</b><em class="gt '+e.type+'">'+typeLbl(e.type)+'</em><span>'+groups[k]+' คน</span>'+(S.admin?'<button type="button" class="gsel" data-g="'+esc(k)+'">เลือกทั้งกลุ่ม</button>':'')+'</div>';
      last=k;
    }
    var b=C.inMonth(e,S.ym)?C.issue(e):'',rs=e.status==='resigned';
    var nc=e.comp.filter(function(iso){return iso.slice(0,7)===S.ym;}).length;
    var flag=rs?'<span class="flag mut">ลาออก'+(e.resignDate?' '+esc(C.shortDate(e.resignDate)):'')+'</span>':b?'<span class="flag">'+esc(b)+'</span>':'<span class="fine" aria-label="ครบ">✓</span>';
    h+='<div class="wp-row'+(S.sel.has(e.id)?' selr':'')+(rs?' rsg':'')+(b?' badr':'')+'" data-id="'+e.id+'">'+
      (S.admin?'<span class="cbx" data-c="1" role="checkbox" aria-checked="'+S.sel.has(e.id)+'" aria-label="เลือก"></span>':'<span></span>')+
      '<button type="button" class="nm" data-open="1"><b>'+esc(e.name||'(ไม่มีชื่อ)')+(e.nick?' <i class="nk">('+esc(e.nick)+')</i>':'')+'</b><small>'+esc(e.wid||'—')+(e.pos&&e.pos!==grpOf(e)?' · '+esc(e.pos):'')+(nc?' · <i class="cdn">ชดเชย '+nc+' วัน</i>':'')+'</small></button>'+
      '<span class="shf">'+shiftSel(e)+'</span>'+
      '<span class="offd">'+dayBtns(e)+'</span>'+flag+'</div>';
  });
  $('list').innerHTML=h||'<p class="wp-empty">'+(S.D.employees.length?'ไม่มีรายชื่อที่ตรงกับตัวกรอง':'ยังไม่มีพนักงาน — '+(S.admin?'กด “+ เพิ่มพนักงาน” หรือ ⋯ → นำเข้ารายชื่อจากไฟล์ FMS':'รอผู้ดูแลเพิ่มรายชื่อ'))+'</p>';
  var nRes=S.D.employees.filter(function(e){return e.status==='resigned'&&!C.inMonth(e,S.ym);}).length;
  $('listNote').innerHTML=(S.admin?'กดชื่อเพื่อแก้ข้อมูลอื่น / วันหยุดชดเชย · ':'')+(nRes?(S.showRes?'<button type="button" id="resTg">ซ่อนคนที่ลาออกแล้ว</button>':'ลาออกก่อนเดือนนี้ซ่อนอยู่ <button type="button" id="resTg">แสดง '+nRes+' คน</button>'):'');
}
function renderDays(){
  var act=C.monthList(S.D,S.ym).filter(function(e){return S.f==='all'||e.type===S.f;});
  $('daySum').innerHTML='<span class="ds-l">หยุดวันไหนกี่คน</span>'+C.WEEK_ORDER.map(function(w){
    var n=act.filter(function(e){return e.offDays.indexOf(w)>=0;}).length;
    return '<button type="button" data-w="'+w+'" class="'+(S.dayF===w?'on':'')+'" aria-pressed="'+(S.dayF===w)+'"><span>'+C.TH_WD[w]+'</span><b>'+n+'</b></button>';
  }).join('')+(S.dayF!=null?'<button type="button" class="clr" data-w="">ล้าง</button>':'');
}
function renderCal(list){
  var days=C.daysInMonth(S.ym),h='<table><tr><th class="nm">พนักงาน</th>';
  days.forEach(function(iso){var w=C.wdOf(iso);h+='<th class="'+(w===0||w===6?'we':'')+'">'+(+iso.slice(8))+'<br><small>'+C.TH_WD[w]+'</small></th>';});
  h+='</tr>';
  list.filter(function(e){return C.inMonth(e,S.ym);}).forEach(function(e){
    h+='<tr><td class="nm">'+esc(e.name||e.wid)+'</td>';
    days.forEach(function(iso){
      var c=C.cellValue(S.D,e,iso),k=c.k,t=c.v;
      if(k==='w')t=t.slice(0,4);
      h+='<td class="'+k+(c.ov?' ov':'')+(S.admin?' ce':'')+'" data-id="'+e.id+'" data-d="'+iso+'" title="'+esc(c.v||'ว่าง')+'">'+esc(t||'·')+'</td>';
    });
    h+='</tr>';
  });
  $('cal').innerHTML=h+'</table>';
}
function renderStatus(){
  var st=C.stats(S.D,S.ym),pct=st.total?st.ok/st.total*100:0;
  $('stOk').textContent=st.ok;$('stAll').textContent='/'+st.total;
  $('ring').style.setProperty('--p',pct.toFixed(1));
  $('statusBtn').classList.toggle('done',st.total>0&&!st.bad);
  $('stT').textContent=!st.total?'ยังไม่มีพนักงานในเดือนนี้':st.bad?'ขาดอีก '+st.bad+' คน ถึงจะส่งออกได้ครบ':'ครบทุกคน พร้อมส่งออก FMS';
  $('stS').textContent=st.bad?(S.onlyBad?'กำลังแสดงเฉพาะคนที่ยังไม่ครบ · กดเพื่อแสดงทั้งหมด':'กดเพื่อดูเฉพาะคนที่ยังไม่ครบ'):'Driver '+st.driver.total+' · Ops '+st.ops.total;
  $('stGo').textContent=st.bad?(S.onlyBad?'แสดงทั้งหมด ›':'ดู '+st.bad+' คน ›'):'';
  if(!st.bad)S.onlyBad=false;
}
function renderFoot(){
  var m=S.meta;
  $('foot').textContent=(m&&m.updated_at?'บันทึกล่าสุด '+new Date(m.updated_at).toLocaleString('th-TH',{timeZone:'Asia/Bangkok',dateStyle:'medium',timeStyle:'short'})+(m.updated_by?' โดย '+m.updated_by:''):'ยังไม่เคยบันทึก')+(S.admin?'':' · คุณดูและส่งออกได้ แต่แก้ไขได้เฉพาะผู้ดูแลระบบ');
}
function render(){
  if(!S.loaded)return;
  $('mLbl').textContent=C.monthLabel(S.ym);
  S.sel.forEach(function(id){if(!byId(id))S.sel.delete(id);});
  renderStatus();renderDays();
  var list=visible();
  if(S.view==='list')renderList(list);else renderCal(list);
  $('vList').hidden=S.view!=='list';$('vCal').hidden=S.view!=='cal';
  $('selBar').hidden=!S.sel.size;$('selN').textContent=S.sel.size+' คน';
  renderFoot();
}

/* ---------------- drawer (one person) ---------------- */
var dw={e:null,isNew:false};
function fillSelect(sel,opts,first){sel.innerHTML=(first?'<option value="">'+first+'</option>':'')+opts.map(function(o){return '<option>'+esc(o)+'</option>';}).join('');}
function setType(t){
  dw.e.type=t;
  Array.prototype.forEach.call($('dwType').children,function(b){b.classList.toggle('on',b.dataset.t===t);});
  $('fWidLbl').textContent=idLbl(t);$('fWid2Lbl').textContent=idLbl(t);
  $('fDrvOnly').hidden=t!=='driver';$('fOpsOnly').hidden=t!=='ops';
  $('dlPos').innerHTML=C.POS[t].map(function(p){return '<option value="'+esc(p)+'">';}).join('');
}
function compChips(){
  var mine=dw.e.comp.filter(function(iso){return iso.slice(0,7)===S.ym;});
  $('fComp').innerHTML=mine.map(function(iso){return '<span class="cd" data-iso="'+iso+'">'+esc(C.shortDate(iso))+(S.admin?' ✕':'')+'</span>';}).join('')||'<small style="color:var(--a-muted)">ไม่มีในเดือนนี้</small>';
  var days=C.daysInMonth(S.ym);$('fCompAdd').min=days[0];$('fCompAdd').max=days[days.length-1];$('fCompAdd').value='';
}
function openDw(e,isNew){
  dw={e:JSON.parse(JSON.stringify(e)),isNew:!!isNew};
  $('dwName').textContent=isNew?'เพิ่มพนักงาน':(e.name||'(ไม่มีชื่อ)')+(e.nick?' ('+e.nick+')':'');
  $('dwId').textContent=isNew?C.monthLabel(S.ym):idLbl(e.type)+' '+(e.wid||'—');
  $('dwNew').hidden=!isNew;$('fEditIds').hidden=!!isNew;
  setType(e.type);
  $('fWid').value=$('fWid2').value=e.wid||'';$('fName').value=$('fName2').value=e.name||'';
  var shifts=C.SHIFTS.slice();if(e.shift&&shifts.indexOf(e.shift)<0)shifts.unshift(e.shift);
  fillSelect($('fShift'),shifts,'— เลือกกะ —');$('fShift').value=e.shift||'';
  $('fOff').innerHTML=C.WEEK_ORDER.map(function(w){return '<button type="button" data-w="'+w+'" class="'+(e.offDays.indexOf(w)>=0?'on':'')+'" aria-pressed="'+(e.offDays.indexOf(w)>=0)+'">'+C.TH_WD[w]+'</button>';}).join('');
  compChips();
  $('fNick').value=e.nick||'';$('fPos').value=e.pos||'';$('fEmp').value=e.empId||'';$('fFunc').value=e.func||'';$('fDept').value=e.dept||'';
  $('fStart').value=e.startDate||'';$('fStatus').value=e.status;$('fResign').value=e.resignDate||'';$('fResignWrap').hidden=e.status!=='resigned';$('fNote').value=e.note||'';
  $('dwMore').open=!!isNew;
  $('dwMsg').textContent='';
  var sv=$('dwS');sv.classList.remove('saved');sv.textContent='บันทึก';sv.disabled=false;
  Array.prototype.forEach.call($('drawer').querySelectorAll('input,select,.dw-days button,.dw-pills button'),function(el){el.disabled=!S.admin;});
  $('dwC').textContent=S.admin?'ยกเลิก':'ปิด';
  $('drawer').classList.add('open');$('drawer').setAttribute('aria-hidden','false');$('dwScrim').hidden=false;
  setTimeout(function(){(isNew?$('fWid'):$('dwX')).focus();},60);
}
function closeDw(){$('drawer').classList.remove('open');$('drawer').setAttribute('aria-hidden','true');$('dwScrim').hidden=true;closePop();}
function readDw(){
  var e=dw.e;
  e.wid=C.normId(e.type,(dw.isNew?$('fWid'):$('fWid2')).value);
  e.name=(dw.isNew?$('fName'):$('fName2')).value.trim();
  e.nick=$('fNick').value.trim();
  e.shift=$('fShift').value;
  e.pos=$('fPos').value.trim();e.empId=$('fEmp').value.trim();e.func=$('fFunc').value.trim();e.dept=$('fDept').value.trim();
  e.startDate=$('fStart').value;e.status=$('fStatus').value;e.resignDate=e.status==='resigned'?$('fResign').value:'';e.note=$('fNote').value.trim();
  if(e.type!=='driver'){e.empId='';e.func='';}else e.dept='';
  return e;
}
function saveDw(){
  if(!S.admin||S.saving)return;
  var e=readDw();
  if(!e.wid){$('dwMsg').textContent='กรุณาใส่ '+idLbl(e.type);return;}
  if(!e.name){$('dwMsg').textContent='กรุณาใส่ชื่อ';return;}
  if(e.type==='ops'&&!/^Ops\d+$/i.test(e.wid)){$('dwMsg').textContent='Ops ID ต้องเป็นรูปแบบ Ops1234';return;}
  var dup=S.D.employees.find(function(x){return x.id!==e.id&&x.type===e.type&&C.normId(x.type,x.wid)===e.wid;});
  if(dup){$('dwMsg').textContent=idLbl(e.type)+' นี้มีอยู่แล้ว ('+(dup.name||'')+')';return;}
  if(e.status==='resigned'&&!e.resignDate){$('dwMsg').textContent='กรุณาใส่วันที่ลาออก';return;}
  var prev=JSON.stringify(S.D.employees);
  if(dw.isNew)S.D.employees.push(e);
  else{var i=S.D.employees.findIndex(function(x){return x.id===e.id;});if(i<0)return;S.D.employees[i]=e;}
  S.saving=true;var sv=$('dwS');sv.disabled=true;sv.textContent='กำลังบันทึก…';$('dwMsg').textContent='';
  save().then(function(){
    S.saving=false;sv.disabled=false;sv.classList.add('saved');sv.textContent='✓ บันทึกแล้ว';render();
    setTimeout(closeDw,900);
  },function(err){
    S.saving=false;S.D.employees=JSON.parse(prev);sv.disabled=false;sv.textContent='บันทึก';
    $('dwMsg').textContent='บันทึกไม่สำเร็จ: '+err.message;render();
  });
}

/* ---------------- bulk ---------------- */
function bulk(fn,msg){
  if(!S.sel.size)return;
  var prev=JSON.stringify(S.D);
  S.D.employees.forEach(function(e){if(S.sel.has(e.id))fn(e);});
  save().then(function(){S.sel.clear();render();toast(msg);},function(err){S.D=JSON.parse(prev);render();toast('บันทึกไม่สำเร็จ: '+err.message,5000);});
}

/* ---------------- calendar cell override ---------------- */
var pop={id:null,iso:null};
function closePop(){$('cellPop').hidden=true;pop={id:null,iso:null};}
function openPop(td){
  var e=byId(td.dataset.id);if(!e)return;
  pop={id:e.id,iso:td.dataset.d};
  var key=e.id+'|'+pop.iso,has=Object.prototype.hasOwnProperty.call(S.D.overrides,key);
  var opts=[['__base','↺ ตามกฎ ('+(function(){var o=S.D.overrides[key];delete S.D.overrides[key];var v=C.cellValue(S.D,e,pop.iso).v;if(has)S.D.overrides[key]=o;return v||'ว่าง';})()+')'],['__rd','RD หยุด'],['','ว่าง (ไม่ทำงาน)']].concat(C.SHIFTS.map(function(s){return [s,s];}));
  var sel=$('cellSel');sel.innerHTML=opts.map(function(o){return '<option value="'+esc(o[0])+'">'+esc(o[1])+'</option>';}).join('');
  sel.value=has?S.D.overrides[key]:'__base';
  var r=td.getBoundingClientRect(),p=$('cellPop');p.hidden=false;
  var x=Math.min(r.left,window.innerWidth-p.offsetWidth-8),y=r.bottom+4;if(y+p.offsetHeight>window.innerHeight)y=r.top-p.offsetHeight-4;
  p.style.left=Math.max(8,x)+'px';p.style.top=Math.max(8,y)+'px';sel.focus();
}
function applyPop(){
  if(!pop.id)return;
  var key=pop.id+'|'+pop.iso,v=$('cellSel').value,prev=JSON.stringify(S.D.overrides);
  if(v==='__base')delete S.D.overrides[key];else S.D.overrides[key]=v;
  closePop();
  save().then(render,function(err){S.D.overrides=JSON.parse(prev);render();toast('บันทึกไม่สำเร็จ: '+err.message,5000);});
}

/* ---------------- export ---------------- */
function tplBase(kind){
  var t=S.tpl[kind];if(!t)return Promise.resolve(null);
  var ck=kind+'|'+t.updated_at;if(S.tplCache[ck])return Promise.resolve(S.tplCache[ck]);
  return sb.from('shift_planner_template').select('file_b64').eq('hub',HUB).eq('kind',kind).single().then(function(r){
    if(r.error)throw new Error(api.thErr(r.error));
    return X.parseTemplate(X.b64ToU8(r.data.file_b64).buffer);
  }).then(function(b){S.tplCache[ck]=b;return b;});
}
function expState(k,st){
  var s=st[k],t=S.tpl[k];
  if(!s.total)return {cls:'mut',info:'ไม่มีพนักงาน '+typeLbl(k)+' ในเดือนนี้'};
  if(s.bad)return {cls:'bad',info:'ยังขาด '+s.bad+' คน',fix:true};
  if(!t)return {cls:'bad',info:'ยังไม่มี Template จาก FMS',tpl:true};
  return {cls:'ok',info:s.total+' คน พร้อมแล้ว',ready:true};
}
function renderExp(){
  var st=C.stats(S.D,S.ym),es={ops:expState('ops',st),driver:expState('driver',st)};
  var ready=['driver','ops'].filter(function(k){return es[k].ready;});
  $('expS').textContent=C.monthLabel(S.ym)+' · '+(S.D.settings.station||HUB);
  var h='<ol class="md-steps">';
  h+='<li><b>ดาวน์โหลดไฟล์</b>';
  h+=['driver','ops'].map(function(k){
    var x=es[k];
    var act=x.ready?'<button type="button" class="pri" data-dl="'+k+'">ดาวน์โหลด</button>':x.fix?'<button type="button" class="ghost" data-fix="'+k+'">ไปแก้</button>':x.tpl&&S.admin?'<button type="button" class="ghost" data-tpl="'+k+'">แนบ Template</button>':'';
    return '<div class="md-row '+x.cls+'"><div><b>'+typeLbl(k)+'</b><small>'+x.info+'</small></div>'+act+'</div>';
  }).join('');
  if(ready.length===2)h+='<button type="button" class="pri md-all" data-dl="both">ดาวน์โหลดทั้ง 2 ไฟล์</button>';
  h+='</li>';
  h+='<li><b>เปิด FMS</b> → Roster Event Planning → Upload Planned HC <a href="https://spx.shopee.co.th/#/rosterEventPlanning/eventPlanning/list" target="_blank" rel="noopener">เปิด FMS ↗</a></li>';
  h+='<li><b>อัปโหลดให้ตรงแท็บ</b><span class="md-tab">ไฟล์ <b>Driver</b> → แท็บ <b>Drivers</b></span><span class="md-tab">ไฟล์ <b>Ops</b> → แท็บ <b>Ops</b></span></li>';
  h+='</ol>';
  var tl=['driver','ops'].map(function(k){var t=S.tpl[k];return typeLbl(k)+': '+(t?esc(t.file_name||'ไฟล์ FMS')+(t.month?' ('+esc(C.monthLabel(t.month))+')':''):'ยังไม่มี')+(S.admin?' <button type="button" data-tpl="'+k+'">เปลี่ยน</button>':'');}).join('<br>');
  h+='<details class="md-tpl"><summary>Template ที่ใช้สร้างไฟล์</summary><p>'+tl+'</p><p class="md-hint">ถ้า FMS ไม่รับไฟล์ ให้ดาวน์โหลด Template เดือนนั้นจาก FMS แล้วกด “เปลี่ยน”</p></details>';
  $('expRows').innerHTML=h;
}
function download(kind,btn){
  btn.disabled=true;btn.textContent='กำลังสร้าง…';
  tplBase(kind).then(function(base){return X.buildExport(S.D,kind,S.ym,base);}).then(function(r){
    var a=document.createElement('a');a.href=URL.createObjectURL(r.blob);
    a.download=(kind==='ops'?'Ops':'Driver')+'_Upload_Planned_HC_'+HUB+'_'+S.ym+'.xlsx';
    document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(a.href);a.remove();},1500);
    btn.disabled=false;btn.textContent='ดาวน์โหลดอีกครั้ง';
    toast(typeLbl(kind)+' '+r.count+' คน'+(r.kept?' · คงรายชื่ออื่นใน Template '+r.kept+' แถว':'')+' — อัปโหลดในแท็บ '+(kind==='ops'?'Ops':'Drivers'),5000);
  },function(e){btn.disabled=false;btn.textContent='ดาวน์โหลด';toast('สร้างไฟล์ไม่สำเร็จ: '+(e.message||e),6000);});
}
function storeTemplate(kind,u8,name,base){
  var month=base.dates.length?base.dates[0].iso.slice(0,7):'';
  return sb.rpc('save_shift_planner_template',{p_hub:HUB,p_kind:kind,p_file_name:name,p_file_b64:X.u8ToB64(u8),p_month:month}).then(function(r){
    if(r.error)throw new Error(api.thErr(r.error));
    S.tpl[kind]={kind:kind,file_name:name,month:month,updated_at:new Date().toISOString()};
    S.tplCache[kind+'|'+S.tpl[kind].updated_at]=base;
  });
}
function readFile(input){var f=input.files&&input.files[0];input.value='';if(!f)return Promise.reject(null);return f.arrayBuffer().then(function(b){return {name:f.name,buf:b};});}

/* ---------------- imports / backup ---------------- */
function importFms(file){
  var u8=new Uint8Array(file.buf.slice(0));
  X.parseTemplate(file.buf).then(function(base){
    var people=C.peopleFromFms(base,S.D.settings.rdCode);
    if(!people.length)throw new Error('ไม่พบรายชื่อในแท็บ Dedicated');
    return ask('พบ '+people.length+' คน ('+typeLbl(base.type)+') ในไฟล์\nจะเพิ่มคนที่ยังไม่มี และอัปเดตกะ/วันหยุดของคนที่มีอยู่แล้ว\nและเก็บไฟล์นี้เป็น Template '+typeLbl(base.type)+' — ทำต่อไหม?',{ok:'นำเข้า'}).then(function(go){
      if(!go)return;
      if(base.type==='driver'&&base.data[0]&&base.data[0][0])S.D.settings.station=String(base.data[0][0]).trim();
      var prev=JSON.stringify(S.D),r=C.mergePeople(S.D,people);
      return save().then(function(){return storeTemplate(base.type,u8,file.name,base);}).then(function(){
        render();toast('นำเข้าแล้ว: เพิ่ม '+r.added+' · อัปเดต '+r.updated+' คน',5000);
      },function(err){S.D=JSON.parse(prev);render();throw err;});
    });
  }).catch(function(e){if(e)toast('นำเข้าไม่สำเร็จ: '+(e.message||e),6000);});
}
function importJson(file){
  var x;
  try{x=JSON.parse(new TextDecoder().decode(new Uint8Array(file.buf)));}catch(e){toast('ไฟล์ .json ไม่ถูกต้อง',5000);return;}
  var d=C.migrate(x);
  if(!d.employees.length){toast('ไม่พบรายชื่อพนักงานในไฟล์',5000);return;}
  ask('ไฟล์นี้มี '+d.employees.length+' คน\nจะแทนที่ข้อมูลทั้งหมดในหน้านี้ ('+S.D.employees.length+' คน) — ทำต่อไหม?',{ok:'นำเข้า'}).then(function(go){
    if(!go)return;
    var prev=S.D;S.D=d;
    save().then(function(){S.sel.clear();render();toast('นำเข้าแล้ว '+d.employees.length+' คน',4000);},function(err){S.D=prev;render();toast('นำเข้าไม่สำเร็จ: '+err.message,6000);});
  });
}
function backup(){
  var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(S.D,null,1)],{type:'application/json'}));
  a.download='shift-planner-'+HUB+'-'+new Date().toISOString().slice(0,10)+'.json';
  document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(a.href);a.remove();},1500);
}

/* ---------------- wiring ---------------- */
function bind(){
  fillSelect($('bShift'),C.SHIFTS,'ตั้งกะ…');
  $('bOff').innerHTML='<option value="">ตั้งวันหยุด…</option>'+C.WEEK_ORDER.map(function(w){return '<option value="'+w+'">หยุดทุกวัน'+['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'][w]+'</option>';}).join('');
  var allPos=C.POS.driver.concat(C.POS.ops);
  $('bPos').innerHTML='<option value="">ตั้งตำแหน่ง…</option>'+allPos.map(function(x){return '<option>'+esc(x)+'</option>';}).join('');
  $('dlFunc').innerHTML=C.FUNCS.map(function(f){return '<option value="'+esc(f)+'">';}).join('');

  $('mPrev').onclick=function(){S.ym=C.addMonths(S.ym,-1);S.sel.clear();render();};
  $('mNext').onclick=function(){S.ym=C.addMonths(S.ym,1);S.sel.clear();render();};
  $('statusBtn').onclick=function(){if(!C.stats(S.D,S.ym).bad)return;S.onlyBad=!S.onlyBad;render();};
  $('q').oninput=function(){S.q=this.value;render();};
  $('chips').onclick=function(e){var b=e.target.closest('button');if(!b)return;S.f=b.dataset.f;Array.prototype.forEach.call(this.children,function(x){x.classList.toggle('on',x===b);});render();};
  $('viewTg').onclick=function(e){var b=e.target.closest('button');if(!b)return;S.view=b.dataset.v;Array.prototype.forEach.call(this.children,function(x){x.classList.toggle('on',x===b);});render();};
  $('list').onclick=function(e){
    var gb=e.target.closest('.gsel');
    if(gb){var ids=visible().filter(function(p){return p.type+'|'+grpOf(p)===gb.dataset.g;}).map(function(p){return p.id;});
      var all=ids.every(function(id){return S.sel.has(id);});ids.forEach(function(id){all?S.sel.delete(id):S.sel.add(id);});render();return;}
    var r=e.target.closest('.wp-row');if(!r||r.classList.contains('wp-head'))return;
    var p=byId(r.dataset.id);if(!p)return;
    if(e.target.dataset.c&&S.admin){S.sel.has(p.id)?S.sel.delete(p.id):S.sel.add(p.id);render();return;}
    var db=e.target.closest('.r-days button');
    if(db){if(!S.admin)return;var w=+db.dataset.w,i=p.offDays.indexOf(w);if(i>=0)p.offDays.splice(i,1);else p.offDays.push(w);
      p.offDays.sort();render();saveSoon();return;}
    if(e.target.closest('[data-open]'))openDw(p,false);
  };
  $('list').onchange=function(e){
    if(!e.target.classList.contains('r-sh')||!S.admin)return;
    var p=byId(e.target.closest('.wp-row').dataset.id);if(!p)return;
    p.shift=e.target.value;render();saveSoon();
  };
  $('daySum').onclick=function(e){var b=e.target.closest('button');if(!b)return;S.dayF=b.dataset.w===''||S.dayF===+b.dataset.w?null:+b.dataset.w;render();};
  $('listNote').onclick=function(e){if(e.target.id==='resTg'){S.showRes=!S.showRes;render();}};
  $('cal').onclick=function(e){var td=e.target.closest('td.ce');if(td)openPop(td);else{var nm=e.target.closest('td.nm');if(nm){var tr=nm.parentNode.querySelector('td[data-id]');if(tr){var p=byId(tr.dataset.id);if(p)openDw(p,false);}}}};
  $('cellSel').onchange=applyPop;
  $('cellSel').onkeydown=function(e){if(e.key==='Enter')applyPop();if(e.key==='Escape')closePop();};
  document.addEventListener('mousedown',function(e){if(!$('cellPop').hidden&&!e.target.closest('#cellPop')&&!e.target.closest('td.ce'))closePop();});

  $('addBtn').onclick=function(){openDw(C.newEmp(S.f==='ops'?'ops':'driver',{startDate:''}),true);};
  $('dwType').onclick=function(e){var b=e.target.closest('button');if(b&&dw.isNew)setType(b.dataset.t);};
  $('fOff').onclick=function(e){var b=e.target.closest('button');if(!b||!S.admin)return;var w=+b.dataset.w,i=dw.e.offDays.indexOf(w);if(i>=0)dw.e.offDays.splice(i,1);else dw.e.offDays.push(w);b.classList.toggle('on',i<0);b.setAttribute('aria-pressed',String(i<0));};
  $('fComp').onclick=function(e){var c=e.target.closest('.cd');if(!c||!S.admin)return;dw.e.comp=dw.e.comp.filter(function(x){return x!==c.dataset.iso;});compChips();};
  $('fCompAdd').onchange=function(){var v=this.value;if(v&&dw.e.comp.indexOf(v)<0){dw.e.comp.push(v);dw.e.comp.sort();}compChips();};
  $('fCompAdd').onclick=function(){try{if(this.showPicker)this.showPicker();}catch(e){}};
  $('fStatus').onchange=function(){$('fResignWrap').hidden=this.value!=='resigned';if(this.value==='resigned'&&!$('fResign').value)$('fResign').value=new Date().toISOString().slice(0,10);};
  $('dwS').onclick=saveDw;$('dwC').onclick=closeDw;$('dwX').onclick=closeDw;$('dwScrim').onclick=closeDw;
  $('dwDel').onclick=function(){
    if(dw.isNew){closeDw();return;}
    ask('ลบ '+(dw.e.name||dw.e.wid)+' ออกจากรายชื่อถาวร?\n(ถ้าแค่ลาออก ให้เปลี่ยนสถานะเป็น “ลาออก” แทน)',{ok:'ลบ',danger:true}).then(function(go){
      if(!go)return;
      var id=dw.e.id,prev=JSON.stringify(S.D);
      S.D.employees=S.D.employees.filter(function(x){return x.id!==id;});
      Object.keys(S.D.overrides).forEach(function(k){if(k.indexOf(id+'|')===0)delete S.D.overrides[k];});
      save().then(function(){closeDw();render();toast('ลบแล้ว');},function(err){S.D=JSON.parse(prev);toast('ลบไม่สำเร็จ: '+err.message,5000);});
    });
  };
  document.addEventListener('keydown',function(e){if(e.key==='Escape'){if($('drawer').classList.contains('open'))closeDw();if(!$('expModal').hidden)$('expModal').hidden=true;$('moreMenu').hidden=true;}});

  $('bShift').onchange=function(){var v=this.value;this.value='';if(v)bulk(function(e){e.shift=v;},'ตั้งกะ '+v+' แล้ว');};
  $('bOff').onchange=function(){var v=this.value;this.value='';if(v!=='')bulk(function(e){e.offDays=[+v];},'ตั้งวันหยุดแล้ว');};
  $('bPos').onchange=function(){var v=this.value;this.value='';if(v)bulk(function(e){e.pos=v;},'ตั้งตำแหน่ง '+v+' แล้ว');};
  $('bResign').onclick=function(){
    ask('วันที่ลาออกของ '+S.sel.size+' คน (วันแรกที่ไม่ทำงาน)',{date:new Date().toISOString().slice(0,10),ok:'บันทึก'}).then(function(d){
      if(d)bulk(function(e){e.status='resigned';e.resignDate=d;},'บันทึกการลาออกแล้ว');
    });
  };
  $('bDel').onclick=function(){
    ask('ลบ '+S.sel.size+' คนออกจากรายชื่อถาวร?',{ok:'ลบ',danger:true}).then(function(go){
      if(!go)return;
      var ids=new Set(S.sel),prev=JSON.stringify(S.D);
      S.D.employees=S.D.employees.filter(function(e){return !ids.has(e.id);});
      Object.keys(S.D.overrides).forEach(function(k){if(ids.has(k.split('|')[0]))delete S.D.overrides[k];});
      save().then(function(){S.sel.clear();render();toast('ลบ '+ids.size+' คนแล้ว');},function(err){S.D=JSON.parse(prev);render();toast('ลบไม่สำเร็จ: '+err.message,5000);});
    });
  };
  $('selClr').onclick=function(){S.sel.clear();render();};

  $('moreBtn').onclick=function(e){e.stopPropagation();var m=$('moreMenu');m.hidden=!m.hidden;this.setAttribute('aria-expanded',String(!m.hidden));};
  document.addEventListener('click',function(e){if(!e.target.closest('.wp-more'))$('moreMenu').hidden=true;});
  $('moreMenu').onclick=function(e){
    var b=e.target.closest('button');if(!b)return;$('moreMenu').hidden=true;
    if(b.dataset.act==='importFms')$('fileFms').click();
    else if(b.dataset.act==='importJson')$('fileJson').click();
    else if(b.dataset.act==='backup')backup();
  };
  $('fileFms').onchange=function(){readFile(this).then(importFms,function(){});};
  $('fileJson').onchange=function(){readFile(this).then(importJson,function(){});};

  $('expBtn').onclick=function(){renderExp();$('expModal').hidden=false;};
  $('expX').onclick=function(){$('expModal').hidden=true;};
  $('expModal').onclick=function(e){if(e.target===this)this.hidden=true;};
  var tplKind=null;
  $('expRows').onclick=function(e){
    var b=e.target.closest('button');if(!b)return;
    if(b.dataset.dl==='both'){b.disabled=true;download('driver',$('expRows').querySelector('[data-dl=driver]'));setTimeout(function(){download('ops',$('expRows').querySelector('[data-dl=ops]'));b.disabled=false;},1200);}
    else if(b.dataset.dl)download(b.dataset.dl,b);
    else if(b.dataset.fix){$('expModal').hidden=true;S.f=b.dataset.fix;S.onlyBad=true;S.view='list';
      Array.prototype.forEach.call($('chips').children,function(x){x.classList.toggle('on',x.dataset.f===S.f);});
      Array.prototype.forEach.call($('viewTg').children,function(x){x.classList.toggle('on',x.dataset.v==='list');});render();}
    else if(b.dataset.tpl){tplKind=b.dataset.tpl;$('fileTpl').click();}
  };
  $('fileTpl').onchange=function(){
    readFile(this).then(function(file){
      var u8=new Uint8Array(file.buf.slice(0));
      return X.parseTemplate(file.buf).then(function(base){
        if(base.type!==tplKind)throw new Error('ไฟล์นี้เป็น Template '+typeLbl(base.type)+' ไม่ใช่ '+typeLbl(tplKind));
        return storeTemplate(tplKind,u8,file.name,base);
      }).then(function(){renderExp();toast('เก็บ Template '+typeLbl(tplKind)+' แล้ว');});
    }).catch(function(e){if(e)toast('แนบ Template ไม่สำเร็จ: '+(e.message||e),6000);});
  };

  $('views').addEventListener('click',function(e){var b=e.target.closest('button[data-href]');if(b)location.href=new URL(b.getAttribute('data-href'),location.href).href;});
  $('logoutBtn').onclick=function(){sb.auth.signOut({scope:'local'}).then(function(){location.replace('../');},function(){location.replace('../');});};
}

if(!C||!X||!sb){fail('โหลดสคริปต์ไม่ครบ — ลองรีเฟรชหน้า');return;}
bind();
load();
})();
