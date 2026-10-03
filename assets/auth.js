/* Login / logout / set-password. Sign-up is intentionally not offered (accounts are created by the admin). */
(function(){
"use strict";
var api=window.SPX_API,sb=api.client,started=false;
var FLASH='abbtga-ws-flash';
function $(id){return document.getElementById(id);}
function theme(c){var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content',c);}
function msg(id,t,ok){var el=$(id);el.textContent=t||'';el.className='amsg'+(ok?' ok':'');}
function cleanUrl(){try{if(/access_token|type=/.test(location.hash))history.replaceState(null,'',location.pathname+location.search);}catch(e){}}
var leaving=false;
function restart(){if(leaving)return;leaving=true;location.replace(location.pathname+location.search);}   // drop in-memory data of the old session

function showLogin(t){
  document.body.classList.add('auth-out');
  $('authWait').hidden=true;$('pwForm').hidden=true;$('loginForm').hidden=false;
  var f='';try{f=sessionStorage.getItem(FLASH)||'';sessionStorage.removeItem(FLASH);}catch(e){}
  msg('loginMsg',t||f);
  theme('#FFF8E7');
}
function showSetPw(){
  document.body.classList.add('auth-out');
  $('authWait').hidden=true;$('loginForm').hidden=true;$('pwForm').hidden=false;
  msg('pwMsg','');theme('#FFF8E7');
  setTimeout(function(){$('npw').focus();},50);
}
function showApp(){
  cleanUrl();
  document.body.classList.remove('auth-out');
  if(!started){started=true;window.SPX_START();}
}

window.SPX_AUTH={expired:function(){
  if(!started)return;
  try{sessionStorage.setItem(FLASH,'เซสชันหมดอายุ — กรุณาเข้าสู่ระบบใหม่');}catch(e){}
  sb.auth.signOut({scope:'local'}).then(restart,restart);
}};

sb.auth.onAuthStateChange(function(ev){
  if(ev==='PASSWORD_RECOVERY'){setTimeout(showSetPw,0);return;}
  if(ev==='SIGNED_OUT'&&started)setTimeout(restart,0);
});

sb.auth.getSession().then(function(r){
  var s=r&&r.data&&r.data.session;
  if(s&&(api.urlType==='recovery'||api.urlType==='invite'))showSetPw();
  else if(s)showApp();
  else showLogin();
},function(){showLogin('ตรวจสอบการเข้าสู่ระบบไม่สำเร็จ');});

/* ---------- login ---------- */
$('loginForm').addEventListener('submit',function(e){
  e.preventDefault();
  var em=$('email').value.trim(),pw=$('pw').value,btn=$('loginBtn');
  if(!em||!pw){msg('loginMsg','กรุณากรอกอีเมลและรหัสผ่าน');return;}
  btn.disabled=true;btn.textContent='กำลังเข้าสู่ระบบ…';msg('loginMsg','');
  sb.auth.signInWithPassword({email:em,password:pw}).then(function(r){
    btn.disabled=false;btn.textContent='เข้าสู่ระบบ';
    if(r.error){msg('loginMsg',api.thErr(r.error));$('pw').select();return;}
    $('pw').value='';showApp();
  },function(err){btn.disabled=false;btn.textContent='เข้าสู่ระบบ';msg('loginMsg',api.thErr(err));});
});

/* ---------- set new password (recovery / invite link) ---------- */
$('pwForm').addEventListener('submit',function(e){
  e.preventDefault();
  var a=$('npw').value,b=$('npw2').value,btn=$('pwBtn');
  if(a.length<8){msg('pwMsg','รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร');return;}
  if(a!==b){msg('pwMsg','รหัสผ่านทั้งสองช่องไม่ตรงกัน');return;}
  btn.disabled=true;
  sb.auth.updateUser({password:a}).then(function(r){
    btn.disabled=false;
    if(r.error){msg('pwMsg',api.thErr(r.error));return;}
    $('npw').value=$('npw2').value='';msg('pwMsg','บันทึกรหัสผ่านแล้ว',true);
    setTimeout(showApp,600);
  },function(err){btn.disabled=false;msg('pwMsg',api.thErr(err));});
});

/* show / hide password */
Array.prototype.forEach.call(document.querySelectorAll('.eye'),function(b){
  b.addEventListener('click',function(){
    var i=$(b.getAttribute('data-for')),show=i.type==='password';
    i.type=show?'text':'password';b.textContent=show?'ซ่อน':'แสดง';
    b.setAttribute('aria-label',show?'ซ่อนรหัสผ่าน':'แสดงรหัสผ่าน');
  });
});

/* ---------- logout ---------- */
$('logoutBtn').addEventListener('click',function(){
  if(!window.confirm('ออกจากระบบ?'))return;
  sb.auth.signOut({scope:'local'}).then(restart,restart);
});
})();
