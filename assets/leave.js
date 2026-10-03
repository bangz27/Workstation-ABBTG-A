/* การลา tab: leave cards for a date, current/upcoming leave list, add / edit / delete per account permission,
   admin-only ⚙ ตั้งค่า → จัดการสิทธิ์ (who can ดู / เพิ่ม / แก้ไข / ลบ, by e-mail).
   Data: public.leave_records (RLS: admin or private.leave_permissions flags; add/edit/delete imply view). */
(function(){
"use strict";
var api=window.SPX_API,V=function(){return window.SPX_VIEW;},U=function(){return window.SPX_VIEW.util;};
function $(id){return document.getElementById(id);}
var GRP={fleet:'Fleet',ops:'Ops'};
var L={rows:[],loaded:false,loading:false,err:'',admin:false,perm:{known:false,email:'',admin:false,view:false,add:false,edit:false,del:false},editId:null,date:'',grp:'all',type:'',formOpen:false,busy:false,msg:'',msgOk:false,
  form:{grp:'fleet',person:null,type:'sick',start:'',end:'',note:'',q:''}};
var PM={rows:[],admins:[],loaded:false,loading:false,err:'',msg:'',msgOk:false,busy:'',edit:{},draft:{email:'',v:true,a:false,e:false,d:false}};
window.SPX_LEAVE={rows:L.rows,init:init,show:show,rosterLoaded:rosterLoaded,state:L,perms:PM,canView:function(){return L.perm.view;}};

function esc(s){return U().esc(s);}
function today(){return U().bkkToday();}
function addDays(s,n){var p=/^(\d{4})-(\d{2})-(\d{2})$/.exec(s);var d=new Date(Date.UTC(+p[1],+p[2]-1,+p[3]+n));return d.getUTCFullYear()+'-'+U().pad2(d.getUTCMonth()+1)+'-'+U().pad2(d.getUTCDate());}
function days(a,b){return U().dnum(b)-U().dnum(a)+1;}
function types(){return U().LEAVE_TYPES;}
function tOf(k){var t=types().filter(function(x){return x.key===k;})[0];return t||{key:k,label:k,short:k};}
function isView(){return V()&&V().current()==='leave';}

function init(){
  L.date=L.date||today();L.form.start=L.form.end=today();
  api.getMyLeavePerms().then(function(p){
    p=p||{};
    L.perm={known:true,email:p.email||'',admin:!!p.is_admin,view:!!p.can_view,add:!!p.can_add,edit:!!p.can_edit,del:!!p.can_delete};
    applyPerm();
  },function(){L.perm.known=true;applyPerm();});
}
/* show/hide everything leave-related for this account */
function applyPerm(){
  var P=L.perm;L.admin=P.admin;
  $('gearBtn').hidden=!P.admin;
  var tab=document.querySelector('#views button[data-v="leave"]');if(tab)tab.hidden=!P.view;
  if(!P.view){
    L.rows.length=0;L.loaded=false;L.formOpen=false;
    if(isView())V().set('driver');
    V().leavesChanged();
    return;
  }
  if(!P.add&&!P.admin&&L.editId==null)L.formOpen=false;
  load();
}
function load(){
  L.loading=true;L.err='';if(isView())render();
  api.listLeaves().then(function(rows){
    L.rows.length=0;Array.prototype.push.apply(L.rows,rows||[]);L.loaded=true;L.loading=false;
    V().leavesChanged();if(isView())render();
  },function(e){L.loading=false;L.err=e.message||String(e);if(isView())render();});
}
function show(){
  if(L.perm.known&&!L.perm.view){V().set('driver');return;}
  V().ensure('fleet');V().ensure('ops');render();
}
function rosterLoaded(){if(isView())render();}

/* person lookup in the loaded rosters */
function roster(g){var s=V().state[g];return s&&s.res?s:null;}
function findPerson(g,id,name){var s=roster(g);if(!s)return null;return s.people.filter(function(p){return p.key===id;})[0]||s.people.filter(function(p){return !p.id&&p.name===name;})[0]||null;}
function rdOn(g,p,d){var s=roster(g);if(!s||!p)return false;var i=s.res.dates.indexOf(d);return i>=0&&p.base[i]&&p.base[i].k==='off';}

/* records covering date d (group filter), each annotated: person, rd (sheet RD that day → not counted) */
function onDate(d){
  return L.rows.filter(function(r){return r.start_date<=d&&r.end_date>=d&&(L.grp==='all'||r.staff_type===L.grp);}).map(function(r){
    var p=findPerson(r.staff_type,r.person_id,r.person_name);return {r:r,p:p,rd:rdOn(r.staff_type,p,d)};});
}
function counts(list){
  var c={all:0},seen={};types().forEach(function(t){c[t.key]=0;});
  list.forEach(function(x){if(x.rd)return;var k=x.r.staff_type+'|'+x.r.person_id;if(seen[k])return;seen[k]=1;c[x.r.leave_type]=(c[x.r.leave_type]||0)+1;c.all++;});
  return c;
}

function render(){
  var d=L.date,list=onDate(d),c=counts(list);
  $('lDateLbl').textContent=U().dBox(d);
  $('lupd').textContent=L.loading?'กำลังโหลดข้อมูลการลา…':L.err?'โหลดข้อมูลการลาไม่สำเร็จ':'ข้อมูลการลา '+L.rows.length+' รายการ';
  var h=[];
  h.push('<div class="ldnav"><button type="button" class="arw" data-a="prev" aria-label="วันก่อนหน้า">‹</button>'+
    '<label class="ldate"><span>'+esc(U().dLong(d))+(d===today()?' · วันนี้':'')+'</span><input type="date" id="lDate" value="'+d+'" aria-label="เลือกวันที่"></label>'+
    '<button type="button" class="arw" data-a="next" aria-label="วันถัดไป">›</button></div>');
  h.push('<div class="lctl"><div class="lseg" role="group" aria-label="กลุ่ม">'+[['all','ทั้งหมด'],['fleet','Fleet'],['ops','Ops']].map(function(g){
      return '<button type="button" data-g="'+g[0]+'" class="'+(L.grp===g[0]?'on':'')+'">'+g[1]+'</button>';}).join('')+'</div>'+
    '<button type="button" class="tbtn" data-a="today">วันนี้</button>'+
    '<button type="button" class="refbtn'+(L.loading?' spin':'')+'" data-a="reload" aria-label="รีเฟรชข้อมูลการลา"><svg viewBox="0 0 24 24"><path d="M17.65 6.35A7.96 7.96 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg></button></div>');
  h.push('<div class="lcards">'+types().map(function(t){
      return '<button type="button" class="lcard lv-'+t.key+(L.type===t.key?' on':'')+'" data-t="'+t.key+'"><span class="k">'+esc(t.label)+'</span><b>'+c[t.key]+'<small>คน</small></b></button>';}).join('')+
    '<button type="button" class="lcard lsum'+(L.type===''?' on':'')+'" data-t=""><span class="k">รวมทั้งหมด</span><b>'+c.all+'<small>คน</small></b></button></div>');
  var P=L.perm;
  if(P.admin)h.push('<button type="button" class="ladd'+(L.formOpen?' on':'')+'" data-a="form">'+(L.formOpen?'✕ ปิดตั้งค่า':'⚙ ตั้งค่าการลา · จัดการสิทธิ์')+'</button>');
  else if(P.add)h.push('<button type="button" class="ladd'+(L.formOpen?' on':'')+'" data-a="form">'+(L.formOpen?'✕ ปิดฟอร์ม':'+ เพิ่มการลา')+'</button>');
  $('lhead').innerHTML=h.join('');

  var m=[];
  if(L.err)m.push('<div class="warn">⚠️ '+esc(L.err)+'</div>');
  if(L.formOpen&&(P.add||P.admin||L.editId!=null))m.push(formHTML());
  if(L.formOpen&&P.admin)m.push(permHTML());
  var sel=list.filter(function(x){return !L.type||x.r.leave_type===L.type;});
  sel.sort(function(a,b){return (a.rd-b.rd)||a.r.leave_type.localeCompare(b.r.leave_type)||(a.r.person_name||'').localeCompare(b.r.person_name||'','th');});
  m.push('<div class="lsec"><h2>'+(L.type?esc(tOf(L.type).label):'ลา / ขาดงาน')+' · '+esc(U().dShort(d))+(L.type?' <button type="button" class="chip c-ag on" data-t="">'+esc(tOf(L.type).label)+' ✕</button>':'')+'</h2>'+
    (sel.length?sel.map(function(x){return rowHTML(x.r,x.p,x.rd);}).join(''):'<div class="empty">'+(L.loading?'<div class="spinner"></div>กำลังโหลด…':'ไม่มีคนลาในวันนี้')+'</div>')+'</div>');
  var t0=today(),up=L.rows.filter(function(r){return r.end_date>=t0&&(L.grp==='all'||r.staff_type===L.grp);});
  m.push('<div class="lsec"><h2>การลาปัจจุบันและที่กำลังจะถึง <small>· '+up.length+' รายการ</small></h2>'+
    (up.length?up.map(function(r){return rowHTML(r,findPerson(r.staff_type,r.person_id,r.person_name),false,true);}).join(''):'<div class="empty">ยังไม่มีรายการลา</div>')+
    (P.admin||P.add||P.edit||P.del?'':'<p class="lnote">บัญชีนี้ดูข้อมูลการลาได้อย่างเดียว</p>')+'</div>');
  $('lmain').innerHTML=m.join('');
  window.__SPX_LEAVE_UI={date:d,grp:L.grp,type:L.type,counts:c,listed:sel.length,upcoming:up.length,admin:L.admin,perm:JSON.parse(JSON.stringify(P)),rows:L.rows.length,
    ui:{add:!!document.querySelector('#lhead .ladd'),form:!!$('lForm'),perm:!!$('lPerm'),edit:document.querySelectorAll('#lmain .ledit').length,del:document.querySelectorAll('#lmain .ldel').length}};
}
function rowHTML(r,p,rd,showRange){
  var t=tOf(r.leave_type),n=days(r.start_date,r.end_date);
  var id=p?(p.id||''):r.person_id,fn=p?p.func:'';
  return '<div class="lrow lv-'+t.key+(rd?' rd':'')+'">'+
    '<div class="l1"><b class="nm">'+esc(p?p.name:r.person_name||r.person_id)+'</b><span class="sbdg other lv-'+t.key+'">'+esc(t.label)+'</span></div>'+
    '<div class="l2">'+esc(GRP[r.staff_type])+(id?' · ID '+esc(id):'')+(fn?' · '+esc(fn):'')+'</div>'+
    '<div class="l3"><span class="rng">'+esc(U().dShort(r.start_date))+(n>1?' – '+esc(U().dShort(r.end_date)):'')+' · '+n+' วัน</span>'+
      (rd?'<span class="rdn">ตรงวันหยุด RD · ไม่นับ</span>':'')+
      (L.perm.edit||L.perm.del?'<span class="lact">'+(L.perm.edit?'<button type="button" class="ledit'+(L.editId===r.id?' on':'')+'" data-edit="'+r.id+'" aria-label="แก้ไขการลา">แก้ไข</button>':'')+
        (L.perm.del?'<button type="button" class="ldel" data-del="'+r.id+'" aria-label="ลบการลา">ลบ</button>':'')+'</span>':'')+'</div>'+
    (r.note?'<div class="l4">📝 '+esc(r.note)+'</div>':'')+'</div>';
}
function formHTML(){
  var f=L.form,s=roster(f.grp);
  var ed=L.editId!=null;
  return '<form class="lpanel'+(ed?' editing':'')+'" id="lForm" novalidate><h2>'+(ed?'✏️ แก้ไขการลา <small>#'+L.editId+'</small>':'⚙ ตั้งค่าการลา')+'</h2>'+
    '<div class="fl"><span class="fk">กลุ่ม</span><div class="lseg">'+['fleet','ops'].map(function(g){return '<button type="button" data-fg="'+g+'" class="'+(f.grp===g?'on':'')+'">กะ '+GRP[g]+'</button>';}).join('')+'</div></div>'+
    '<div class="fl"><span class="fk">พนักงาน</span>'+
      (f.person?'<div class="lpick"><div><b>'+esc(f.person.name)+'</b><small>'+(f.person.id?'ID '+esc(f.person.id)+' · ':'')+esc(f.person.func||'')+'</small></div><button type="button" class="tbtn" data-a="unpick">เปลี่ยน</button></div>':
       '<div class="search lsrch"><svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16a6.47 6.47 0 0 0 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg><input id="lq" type="search" autocomplete="off" placeholder="ค้นหาชื่อ หรือ ID ('+GRP[f.grp]+')" value="'+esc(f.q)+'"></div><div class="lres" id="lres">'+resHTML()+'</div>')+'</div>'+
    '<div class="fl"><span class="fk">ประเภท</span><div class="ltypes">'+types().map(function(t){return '<button type="button" data-ft="'+t.key+'" class="lvs lv-'+t.key+(f.type===t.key?' on':'')+'">'+esc(t.label)+'</button>';}).join('')+'</div></div>'+
    '<div class="fl two"><label><span class="fk">วันที่เริ่ม</span><input type="date" id="lStart" value="'+f.start+'" required></label><label><span class="fk">ถึงวันที่</span><input type="date" id="lEnd" value="'+f.end+'" required></label></div>'+
    '<div class="fl"><label><span class="fk">หมายเหตุ (ไม่บังคับ)</span><input type="text" id="lNote" maxlength="500" value="'+esc(f.note)+'" placeholder="'+(f.type==='other'?'เช่น ลาคลอด / ลาบวช / อบรม':'เช่น มีใบรับรองแพทย์')+'"></label></div>'+
    '<div class="lbtns"><button type="submit" class="abtn" id="lSave"'+(L.busy?' disabled':'')+'>'+(L.busy?'กำลังบันทึก…':ed?'บันทึกการแก้ไข':'บันทึกการลา')+'</button>'+
      (ed?'<button type="button" class="abtn lcancel" id="lCancel" data-a="cancelEdit"'+(L.busy?' disabled':'')+'>ยกเลิก</button>':'')+'</div>'+
    '<div class="amsg'+(L.msgOk?' ok':'')+'" id="lMsg" role="alert">'+esc(L.msg)+'</div></form>';
}
function resHTML(){
  var f=L.form,s=roster(f.grp);
  if(!s)return '<div class="lhint"><div class="spinner"></div>กำลังโหลดรายชื่อ…</div>';
  var q=f.q.trim().toLowerCase();
  var ps=s.people.filter(function(p){return !q||p.name.toLowerCase().indexOf(q)>=0||p.id.toLowerCase().indexOf(q)>=0||p.empId.toLowerCase().indexOf(q)>=0;});
  if(!ps.length)return '<div class="lhint">ไม่พบพนักงาน</div>';
  return ps.slice(0,8).map(function(p){return '<button type="button" class="lopt" data-pk="'+esc(p.key)+'"><b>'+esc(p.name)+'</b><small>'+(p.id?'ID '+esc(p.id)+' · ':'')+esc(p.func)+'</small></button>';}).join('')+
    (ps.length>8?'<div class="lhint">อีก '+(ps.length-8)+' คน — พิมพ์เพื่อค้นหา</div>':'');
}

/* ---------- events ---------- */
function setDate(d){if(/^\d{4}-\d{2}-\d{2}$/.test(d)){L.date=d;render();}}
document.addEventListener('click',function(e){
  if(e.target.closest('#gearBtn')){if(!L.perm.admin)return;L.formOpen=true;loadPerms();V().set('leave');setTimeout(function(){var f=$('lForm');if(f)f.scrollIntoView({block:'start'});},50);return;}
  var host=e.target.closest('#lhead,#lmain');if(!host)return;
  var b=e.target.closest('button');if(!b)return;
  var a=b.getAttribute('data-a');
  if(a==='prev')return setDate(addDays(L.date,-1));
  if(a==='next')return setDate(addDays(L.date,1));
  if(a==='today')return setDate(today());
  if(a==='reload')return load();
  if(a==='form'){L.formOpen=!L.formOpen;if(!L.formOpen)resetForm();else if(L.perm.admin)loadPerms();L.msg='';render();return;}
  if(a==='padd')return permAdd();
  if(a==='preload'){PM.loaded=false;return loadPerms();}
  if(b.hasAttribute('data-psave'))return permSave(b.getAttribute('data-psave'));
  if(b.hasAttribute('data-pdel'))return permDel(b.getAttribute('data-pdel'));
  if(a==='unpick'){L.form.person=null;render();var q=$('lq');if(q)q.focus();return;}
  if(b.hasAttribute('data-g')){L.grp=b.getAttribute('data-g');render();return;}
  if(b.hasAttribute('data-t')){var t=b.getAttribute('data-t');L.type=(L.type===t?'':t);render();return;}
  if(b.hasAttribute('data-fg')){var g=b.getAttribute('data-fg');if(g!==L.form.grp){L.form.grp=g;L.form.person=null;L.form.q='';}render();return;}
  if(b.hasAttribute('data-ft')){L.form.type=b.getAttribute('data-ft');syncForm();render();return;}
  if(b.hasAttribute('data-pk')){var s=roster(L.form.grp),k=b.getAttribute('data-pk');L.form.person=s&&s.people.filter(function(p){return p.key===k;})[0]||null;L.msg='';syncForm();render();return;}
  if(b.hasAttribute('data-del'))return del(+b.getAttribute('data-del'));
  if(b.hasAttribute('data-edit'))return startEdit(+b.getAttribute('data-edit'));
  if(a==='cancelEdit'){resetForm();closeIfNoAdd();L.msg='';render();return;}
});
function syncForm(){var f=L.form,x;if((x=$('lStart')))f.start=x.value;if((x=$('lEnd')))f.end=x.value;if((x=$('lNote')))f.note=x.value;}
document.addEventListener('input',function(e){
  if(e.target.id==='lq'){L.form.q=e.target.value;var r=$('lres');if(r)r.innerHTML=resHTML();}
  else if(e.target.id==='lNote')L.form.note=e.target.value;
  else if(e.target.id==='pEmail')PM.draft.email=e.target.value;
});
document.addEventListener('change',function(e){
  if(e.target.id==='lDate')setDate(e.target.value);
  else if(e.target.id==='lStart'){L.form.start=e.target.value;var en=$('lEnd');if(en&&(!en.value||en.value<e.target.value)){en.value=e.target.value;L.form.end=e.target.value;}}
  else if(e.target.id==='lEnd')L.form.end=e.target.value;
  else if(e.target.hasAttribute&&e.target.hasAttribute('data-pf')){
    var em=e.target.getAttribute('data-em'),k=e.target.getAttribute('data-pf'),on=e.target.checked;
    var tgt=em?(PM.edit[em]||(PM.edit[em]=flagsOf(PM.rows.filter(function(r){return r.email===em;})[0]))):PM.draft;
    setFlag(tgt,k,on);
    if(em&&sameFlags(tgt,flagsOf(PM.rows.filter(function(r){return r.email===em;})[0])))delete PM.edit[em];
    PM.msg='';render();
  }
});
document.addEventListener('submit',function(e){
  if(e.target.id!=='lForm')return;e.preventDefault();syncForm();
  var f=L.form,err='';
  if(!f.person)err='กรุณาเลือกพนักงาน';
  else if(!/^\d{4}-\d{2}-\d{2}$/.test(f.start)||!/^\d{4}-\d{2}-\d{2}$/.test(f.end))err='กรุณาเลือกวันที่เริ่มและวันที่สิ้นสุด';
  else if(f.end<f.start)err='วันสิ้นสุดต้องไม่ก่อนวันเริ่ม';
  else if(days(f.start,f.end)>367)err='ช่วงลายาวเกิน 1 ปี';
  if(err){L.msg=err;L.msgOk=false;render();return;}
  L.busy=true;L.msg='';render();
  if(L.editId!=null){var eid=L.editId;
    api.updateLeave(eid,{staff_type:f.grp,person_id:f.person.key,person_name:f.person.name,leave_type:f.type,start_date:f.start,end_date:f.end,note:f.note.trim()}).then(function(row){
      L.busy=false;var i=-1;L.rows.forEach(function(r,j){if(r.id===eid)i=j;});if(i>=0)L.rows[i]=row;else L.rows.push(row);sortRows();
      L.msg='แก้ไขแล้ว: '+row.person_name+' · '+tOf(row.leave_type).label+' '+U().dShort(row.start_date)+(row.end_date!==row.start_date?' – '+U().dShort(row.end_date):'');L.msgOk=true;
      resetForm();closeIfNoAdd();V().leavesChanged();render();
    },function(e2){L.busy=false;L.msg=e2.message||String(e2);L.msgOk=false;render();});
    return;
  }
  api.addLeave({staff_type:f.grp,person_id:f.person.key,person_name:f.person.name,leave_type:f.type,start_date:f.start,end_date:f.end,note:f.note.trim()}).then(function(row){
    L.busy=false;L.rows.push(row);sortRows();
    L.msg='บันทึกแล้ว: '+row.person_name+' · '+tOf(row.leave_type).label+' '+U().dShort(row.start_date)+(row.end_date!==row.start_date?' – '+U().dShort(row.end_date):'');L.msgOk=true;
    f.person=null;f.q='';f.note='';
    V().leavesChanged();render();
  },function(e2){L.busy=false;L.msg=e2.message||String(e2);L.msgOk=false;render();});
});
function closeIfNoAdd(){if(!L.perm.add&&!L.perm.admin)L.formOpen=false;}
function sortRows(){L.rows.sort(function(a,b){return a.start_date<b.start_date?-1:a.start_date>b.start_date?1:a.id-b.id;});}
function resetForm(){var f=L.form;L.editId=null;f.person=null;f.q='';f.note='';f.type='sick';f.start=f.end=today();}
function startEdit(id){
  var r=L.rows.filter(function(x){return x.id===id;})[0];if(!r||!L.perm.edit)return;
  var p=findPerson(r.staff_type,r.person_id,r.person_name)||{key:r.person_id,id:'',name:r.person_name||r.person_id,func:'',empId:''};
  L.editId=id;L.formOpen=true;L.msg='';
  L.form={grp:r.staff_type,person:p,type:r.leave_type,start:r.start_date,end:r.end_date,note:r.note||'',q:''};
  render();var fm=$('lForm');if(fm)fm.scrollIntoView({block:'start'});
}
/* ---------- จัดการสิทธิ์ (admin) ---------- */
var EM_RE=/^[^@\s]+@[^@\s]+\.[^@\s]+$/;
var PF=[['v','ดู'],['a','เพิ่ม'],['e','แก้ไข'],['d','ลบ']];
function flagsOf(r){return r?{v:!!r.can_view,a:!!r.can_add,e:!!r.can_edit,d:!!r.can_delete}:{v:false,a:false,e:false,d:false};}
function sameFlags(a,b){return a.v===b.v&&a.a===b.a&&a.e===b.e&&a.d===b.d;}
/* เพิ่ม / แก้ไข / ลบ imply ดู (same rule as the database) */
function setFlag(f,k,on){f[k]=on;if(on&&k!=='v')f.v=true;if(!on&&k==='v'){f.a=f.e=f.d=false;}}
function loadPerms(){
  if(!L.perm.admin||PM.loading||PM.loaded)return;
  PM.loading=true;PM.err='';if(isView())render();
  api.listLeavePerms().then(function(d){
    PM.rows=(d&&d.perms)||[];PM.admins=(d&&d.admins)||[];PM.loaded=true;PM.loading=false;PM.edit={};if(isView())render();
  },function(e){PM.loading=false;PM.err=e.message||String(e);if(isView())render();});
}
function checks(f,em){
  return '<div class="pchk">'+PF.map(function(x){
    var id='pf-'+x[0]+'-'+(em?em.replace(/[^a-z0-9]/gi,'_'):'new');
    return '<label class="pck'+(f[x[0]]?' on':'')+'" for="'+esc(id)+'"><input type="checkbox" id="'+esc(id)+'" data-pf="'+x[0]+'"'+(em?' data-em="'+esc(em)+'"':'')+(f[x[0]]?' checked':'')+'><span>'+x[1]+'</span></label>';
  }).join('')+'</div>';
}
function permHTML(){
  var h=['<section class="lpanel lperm" id="lPerm"><div class="phead"><h2>👥 จัดการสิทธิ์</h2><button type="button" class="tbtn" data-a="preload" aria-label="โหลดรายการสิทธิ์ใหม่">↻</button></div>',
    '<p class="phint">กำหนดว่าบัญชีไหน (ตามอีเมล) <b>ดู / เพิ่ม / แก้ไข / ลบ</b> ข้อมูลการลาได้ · ติ๊ก เพิ่ม/แก้ไข/ลบ จะได้สิทธิ์ดูด้วย · ใส่อีเมลไว้ก่อนได้แม้ยังไม่มีบัญชี</p>'];
  if(PM.err)h.push('<div class="amsg">'+esc(PM.err)+'</div>');
  if(PM.loading&&!PM.loaded)h.push('<div class="lhint"><div class="spinner"></div>กำลังโหลดรายการสิทธิ์…</div>');
  PM.admins.forEach(function(em){h.push('<div class="prm adm"><div class="pem"><b>'+esc(em)+'</b><span class="pbd adm">ผู้ดูแลระบบ · สิทธิ์เต็ม</span></div></div>');});
  PM.rows.forEach(function(r){
    var f=PM.edit[r.email]||flagsOf(r),dirty=!!PM.edit[r.email],busy=PM.busy===r.email;
    var none=!f.v&&!f.a&&!f.e&&!f.d;
    h.push('<div class="prm'+(dirty?' dirty':'')+'" data-em="'+esc(r.email)+'"><div class="pem"><b>'+esc(r.email)+'</b><span class="pbd'+(r.has_account?' ok':'')+'">'+(r.has_account?'มีบัญชีแล้ว':'ยังไม่มีบัญชี')+'</span></div>'+
      checks(f,r.email)+
      '<div class="pact">'+(none?'<span class="pnone">ไม่มีสิทธิ์</span>':'')+
        '<button type="button" class="psave" data-psave="'+esc(r.email)+'"'+(dirty&&!busy?'':' disabled')+'>'+(busy?'กำลังบันทึก…':'บันทึก')+'</button>'+
        '<button type="button" class="ldel" data-pdel="'+esc(r.email)+'"'+(busy?' disabled':'')+'>ลบ</button></div></div>');
  });
  if(PM.loaded&&!PM.rows.length)h.push('<div class="lhint">ยังไม่ได้ให้สิทธิ์ใคร — เพิ่มอีเมลด้านล่าง</div>');
  var dft=PM.draft;
  h.push('<div class="padd"><label class="fk" for="pEmail">เพิ่มอีเมล</label><input type="email" id="pEmail" inputmode="email" autocapitalize="off" spellcheck="false" autocomplete="off" placeholder="name@example.com" value="'+esc(dft.email)+'">'+
    checks(dft,'')+'<button type="button" class="abtn" data-a="padd"'+(PM.busy==='+'?' disabled':'')+'>'+(PM.busy==='+'?'กำลังบันทึก…':'+ เพิ่ม / บันทึกสิทธิ์')+'</button></div>');
  h.push('<div class="amsg'+(PM.msgOk?' ok':'')+'" id="pMsg" role="alert">'+esc(PM.msg)+'</div></section>');
  return h.join('');
}
function permUpsert(email,f,key){
  PM.busy=key;PM.msg='';render();
  return api.upsertLeavePerm(email,f).then(function(row){
    PM.busy='';var i=-1;PM.rows.forEach(function(r,j){if(r.email===row.email)i=j;});
    if(i>=0)PM.rows[i]=row;else{PM.rows.push(row);PM.rows.sort(function(a,b){return a.email<b.email?-1:1;});}
    delete PM.edit[row.email];PM.msg='บันทึกสิทธิ์ของ '+row.email+' แล้ว';PM.msgOk=true;render();return row;
  },function(e){PM.busy='';PM.msg=e.message||String(e);PM.msgOk=false;render();throw e;});
}
function permSave(email){var f=PM.edit[email];if(!f)return;permUpsert(email,f,email).catch(function(){});}
function permAdd(){
  var em=String(PM.draft.email||'').trim().toLowerCase();
  if(!EM_RE.test(em)){PM.msg='กรุณากรอกอีเมลให้ถูกต้อง';PM.msgOk=false;render();return;}
  var f={v:PM.draft.v,a:PM.draft.a,e:PM.draft.e,d:PM.draft.d};
  permUpsert(em,f,'+').then(function(){PM.draft={email:'',v:true,a:false,e:false,d:false};render();},function(){});
}
function permDel(email){
  if(!window.confirm('ลบสิทธิ์การลาของ '+email+'?\n(บัญชีนี้จะดู/แก้ไขข้อมูลการลาไม่ได้อีก)'))return;
  PM.busy=email;render();
  api.deleteLeavePerm(email).then(function(){
    PM.busy='';PM.rows=PM.rows.filter(function(r){return r.email!==email;});delete PM.edit[email];PM.msg='ลบสิทธิ์ของ '+email+' แล้ว';PM.msgOk=true;render();
  },function(e){PM.busy='';PM.msg=e.message||String(e);PM.msgOk=false;render();});
}
function del(id){
  var r=L.rows.filter(function(x){return x.id===id;})[0];if(!r)return;
  if(!window.confirm('ลบการลาของ '+r.person_name+' ('+tOf(r.leave_type).label+' '+U().dShort(r.start_date)+(r.end_date!==r.start_date?' – '+U().dShort(r.end_date):'')+')?'))return;
  api.deleteLeave(id).then(function(){
    var i=L.rows.indexOf(r);if(i>=0)L.rows.splice(i,1);if(L.editId===id)resetForm();L.msg='';V().leavesChanged();render();
  },function(e){window.alert(e.message||String(e));});
}
})();
