/* Admin-only account manager. All writes go through the JWT-checked user-admin Edge Function. */
(function(){
"use strict";
var api=window.SPX_API,$=function(id){return document.getElementById(id);},modal=$('userAdminModal'),list=$('uamList'),message=$('uamMessage'),busy=false;
if(!modal)return;
var fields=['can_home','can_fleet_overview','can_fleet','can_ops','can_leave','can_manage_fleet','can_manage_ops','can_manage_leave'];
function normalize(body){if(body.can_manage_fleet)body.can_fleet=true;if(body.can_manage_ops)body.can_ops=true;if(body.can_manage_leave)body.can_leave=true;return body;}
var labels={can_home:'หน้าแรก',can_fleet_overview:'Fleet Overview',can_fleet:'กะ Fleet · ดู',can_ops:'กะ Ops · ดู',can_leave:'การลา · ดู',can_manage_fleet:'กะ Fleet · จัดการ/OT',can_manage_ops:'กะ Ops · จัดการ',can_manage_leave:'การลา · จัดการ'};
function esc(s){return String(s??'').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function msg(t,ok){message.textContent=t||'';message.className='uam-msg'+(t?(ok?' ok':' error'):'');}
function flags(a){return fields.map(function(f){return '<label class="uam-check"><input type="checkbox" data-flag="'+f+'" '+(a[f]?'checked':'')+'> '+labels[f]+'</label>';}).join('');}
function render(accounts){
 list.innerHTML=accounts.map(function(a){
  return '<article class="uam-account'+(!a.is_active?' inactive':'')+'" data-user="'+esc(a.username)+'"><div class="uam-account-head"><div><strong>'+esc(a.username)+'</strong><br><small>'+(a.is_active?'เปิดใช้งาน':'ระงับบัญชี')+'</small></div><label class="uam-check"><input type="checkbox" data-active '+(a.is_active?'checked':'')+'> เปิดใช้งาน</label></div><div class="uam-perms">'+flags(a)+'</div><div class="uam-account-actions"><input type="password" data-password autocomplete="new-password" minlength="10" placeholder="ตั้งรหัสผ่านใหม่ (เว้นว่างถ้าไม่เปลี่ยน)"><button class="uam-save" data-save>บันทึกสิทธิ์</button></div></article>';
 }).join('')||'<p>ยังไม่มีบัญชี</p>';
}
function load(){list.innerHTML='<p>กำลังโหลดบัญชี…</p>';api.manageAccounts({action:'list'}).then(function(r){render(r.accounts||[]);}).catch(function(e){list.innerHTML='';msg(e.message||String(e),false);});}
function open(){if(!window.SPX_ACCESS||!window.SPX_ACCESS.is_admin)return;modal.hidden=false;document.body.style.overflow='hidden';msg('');load();}
function close(){modal.hidden=true;document.body.style.overflow='';}
$('userAdminBtn').addEventListener('click',open);$('uamClose').addEventListener('click',close);
modal.addEventListener('click',function(e){if(e.target===modal)close();});
document.addEventListener('keydown',function(e){if(e.key==='Escape'&&!modal.hidden)close();});
$('uamCreate').addEventListener('submit',function(e){
 e.preventDefault();if(busy)return;var username=$('uamUsername').value.trim().toLowerCase(),password=$('uamPassword').value,body={action:'create',username:username,password:password};
 fields.forEach(function(f){var el=$('uamCreate').querySelector('[name="'+f+'"]');body[f]=!!(el&&el.checked);});normalize(body);
 busy=true;$('uamCreateBtn').disabled=true;msg('กำลังสร้างบัญชี…',true);
 api.manageAccounts(body).then(function(r){$('uamCreate').reset();$('uamPassword').value='';msg(r.message||'สร้างบัญชีแล้ว',true);load();},function(e){msg(e.message||String(e),false);}).finally(function(){busy=false;$('uamCreateBtn').disabled=false;});
});
list.addEventListener('click',function(e){
 var btn=e.target.closest('[data-save]');if(!btn||busy)return;var card=btn.closest('[data-user]'),username=card.getAttribute('data-user'),body={action:'update',username:username,is_active:!!card.querySelector('[data-active]').checked};
 fields.forEach(function(f){body[f]=!!card.querySelector('[data-flag="'+f+'"]').checked;});normalize(body);
 body.password=card.querySelector('[data-password]').value;
 busy=true;btn.disabled=true;btn.textContent='กำลังบันทึก…';
 api.manageAccounts(body).then(function(r){msg(r.message||'บันทึกแล้ว',true);card.querySelector('[data-password]').value='';load();},function(err){msg(err.message||String(err),false);}).finally(function(){busy=false;btn.disabled=false;btn.textContent='บันทึกสิทธิ์';});
});
})();
