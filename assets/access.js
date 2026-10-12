/* Page permissions are loaded before the main app starts; database RLS remains authoritative. */
(function(){
"use strict";
var api=window.SPX_API;
var baseStart=window.SPX_START;\nfunction apply(a){
 if(!a||a.active===false){document.body.classList.add('auth-out');api.client.auth.signOut({scope:'local'}).then(function(){location.reload();});return;}
 if(a.is_admin){['home','fleet_overview','fleet','ops','leave'].forEach(function(k){a[k]=true;});a.manage_fleet=a.manage_ops=a.manage_leave=true;}
 window.SPX_ACCESS=a;
 var map={home:'home',driver:'fleet_overview',fleet:'fleet',ops:'ops',leave:'leave'};
 Object.keys(map).forEach(function(v){var b=document.querySelector('#views button[data-v="'+v+'"]');if(b)b.hidden=!a[map[v]];});
 var allowed=Object.keys(map).filter(function(v){return a[map[v]];});
 if(!allowed.length){document.body.classList.add('auth-out');alert('บัญชีนี้ยังไม่ได้รับสิทธิ์เข้าใช้งาน กรุณาติดต่อผู้ดูแลระบบ');api.client.auth.signOut({scope:'local'});return;}
 var current=location.hash.match(/view=(home|driver|fleet|ops|leave)/);var chosen=current&&allowed.indexOf(current[1])>=0?current[1]:allowed[0];
 try{localStorage.setItem('spxView2',chosen);}catch(e){}
 if(baseStart){baseStart();if(chosen!=='home'||!a.home){setTimeout(function(){if(window.SPX_VIEW)window.SPX_VIEW.set(chosen);},0);}}
 var adminBtn=document.getElementById('userAdminBtn');if(adminBtn)adminBtn.hidden=!a.is_admin;
 var gear=document.getElementById('gearBtn');if(gear)gear.hidden=!(a.is_admin||a.manage_leave);
}
var wrapped=false;
window.SPX_START=function(){
 if(wrapped)return;wrapped=true;
 api.getWorkstationAccess().then(apply).catch(function(e){
   document.body.classList.add('auth-out');
   api.client.auth.signOut({scope:'local'}).then(function(){location.reload();});
 });
};
})();
