/* App shell — PRESENTATION ONLY: mobile drawer toggle, header date, signed-in account label.
   No data, auth, permission or navigation logic lives here: view switching is still done by
   roster.js (#views) and the account/role shown is what auth/leave.js already loaded. */
(function(){
"use strict";
function $(id){return document.getElementById(id);}
var body=document.body,side=$('side'),tog=$('navTog'),scrim=$('scrim');
if(!side||!tog||!scrim)return;

/* ---------- drawer (below 1024px the sidebar slides in) ---------- */
function isOpen(){return body.classList.contains('nav-open');}
function setNav(open,focusBack){
  body.classList.toggle('nav-open',open);
  tog.setAttribute('aria-expanded',open?'true':'false');
  scrim.hidden=!open;
  if(open){var b=side.querySelector('#views button.on')||side.querySelector('button');if(b)setTimeout(function(){b.focus();},30);}
  else if(focusBack)tog.focus();
}
tog.addEventListener('click',function(){setNav(!isOpen());});
$('navClose').addEventListener('click',function(){setNav(false,true);});
scrim.addEventListener('click',function(){setNav(false);});
document.addEventListener('keydown',function(e){if(e.key==='Escape'&&isOpen())setNav(false,true);});
/* picking a menu item closes the drawer; the click itself is handled by roster.js / leave.js as before */
side.addEventListener('click',function(e){if(e.target.closest('#views button,#gearBtn'))setNav(false);});
var mq=window.matchMedia?window.matchMedia('(min-width:1024px)'):null;
if(mq){var onMq=function(){if(mq.matches&&isOpen())setNav(false);};if(mq.addEventListener)mq.addEventListener('change',onMq);else if(mq.addListener)mq.addListener(onMq);}

/* ---------- header date (display only, Asia/Bangkok) ---------- */
try{
  var now=new Date(),tz='Asia/Bangkok',td=$('tDate');
  var dl=document.createElement('span'),ds=document.createElement('span');
  dl.className='dl';ds.className='ds';
  dl.textContent=new Intl.DateTimeFormat('th-TH',{timeZone:tz,weekday:'short',day:'numeric',month:'short',year:'numeric'}).format(now);
  ds.textContent=new Intl.DateTimeFormat('th-TH',{timeZone:tz,day:'numeric',month:'short'}).format(now);
  td.appendChild(dl);td.appendChild(ds);td.setAttribute('aria-label',dl.textContent);
}catch(e){}

/* ---------- signed-in greeting + account label ----------
   The welcome line follows whoever is logged in. A display name comes from the
   auth profile when one was set; otherwise the mailbox name is used.
   Never hard-code a person's name here. */
var shown='',sessionEmail='',sessionUser=null;
function displayName(user,email){
  var meta=user&&user.user_metadata||{},keys=['full_name','name','display_name','nickname'];
  var i,n='';
  for(i=0;i<keys.length;i++){n=String(meta[keys[i]]||'').trim();if(n)return n;}
  var local=String(email||'').split('@')[0]||'';
  return local.replace(/[._]+/g,' ').replace(/\s+/g,' ').trim();
}
function paint(email,admin,name){
  var em=String(email||''),nm=String(name||'').trim(),ini=(em.charAt(0)||'?').toUpperCase();
  var key=em+'|'+(admin?1:0)+'|'+nm;
  if(shown===key)return;shown=key;
  $('sEmail').textContent=em||'–';$('tEmail').textContent=em;
  $('sAvatar').textContent=ini;$('tAvatar').textContent=ini;
  $('sRole').textContent=admin?'ผู้ดูแลระบบ':'ผู้ใช้งาน';
  if(em)$('tAvatar').setAttribute('title',em);
  var hi=nm?('สวัสดีครับ '+nm):'สวัสดีครับ';
  var nodes=document.querySelectorAll('.whi,.hhi');
  for(var i=0;i<nodes.length;i++)nodes[i].textContent=hi;
}
var triedSession=false;
function poll(){
  if(body.classList.contains('auth-out')){sessionEmail='';sessionUser=null;shown='';triedSession=false;}
  else{
    var L=window.SPX_LEAVE&&window.SPX_LEAVE.state,P=L&&L.perm;
    var email=P&&P.known?String(P.email||''):'';
    if(email){
      if(sessionEmail!==email){
        sessionEmail=email;sessionUser=null;
        paint(email,!!P.admin,displayName(null,email));
        var c=window.SPX_API&&window.SPX_API.client;
        if(c)c.auth.getSession().then(function(r){
          var u=r&&r.data&&r.data.session&&r.data.session.user;
          if(!u||String(u.email||'').toLowerCase()!==email.toLowerCase())return;
          sessionUser=u;paint(email,!!P.admin,displayName(u,email));
        },function(){});
      }else paint(email,!!P.admin,displayName(sessionUser,email));
    }else if(P&&P.known&&!triedSession){
      triedSession=true;
      var c2=window.SPX_API&&window.SPX_API.client;
      if(c2)c2.auth.getSession().then(function(r){
        var u=r&&r.data&&r.data.session&&r.data.session.user;
        if(u&&u.email){sessionEmail=u.email;sessionUser=u;paint(u.email,!!(P&&P.admin),displayName(u,u.email));}
      },function(){});
    }
  }
  setTimeout(poll,shown?5000:500);
}
poll();
})();
