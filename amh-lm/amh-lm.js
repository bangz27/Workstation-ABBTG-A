/* ภาพรวม Last Mile (AMH-LM) — page controller.
   Data: public.get_amh_lm (Sheet tab "AMH-LM" → apps-script/SyncAmhLm.gs → Supabase). Read only.
   Missing numbers render as "—", never 0. Every card shows its FMS "Updated" time and a stale banner. */
(function(){
'use strict';
var C=window.AmhLmCore,api=window.SPX_API,sb=api&&api.client;
var HUB='ABBTG-A',FMS_URL='https://spx.shopee.co.th/#/dashboard/all-mile-hub/lm';
var S={d:null,backlogScope:'total',aging:'hub_aging',expScope:'total',dir:'before_cutoff',prodDir:'total',loading:false};

function $(id){return document.getElementById(id);}
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
var N=C.fmtNum,P=C.fmtPct,L=C.label;

/* ---------- building blocks ---------- */
function stampHtml(sec){
  var s=S.d.sections[sec],f=C.freshness(s&&s.fms_updated_at,Date.now());
  var t='<time class="amh-upd"'+(s&&s.fms_updated_at?' datetime="'+esc(s.fms_updated_at)+'"':'')+'>'+esc(f.label)+'</time>';
  var warn=!s?'':(f.stale?'<p class="amh-stale"><svg class="ic" aria-hidden="true"><use href="#i-clock"/></svg>'+
    (f.known?'ข้อมูลอาจไม่ล่าสุด · ผ่านมา '+fmtAge(f.minutes):'ไม่ทราบว่าตัวเลขนี้อัปเดตเมื่อไหร่')+'</p>':'');
  return {head:t,warn:warn,has:!!s};
}
function fmtAge(m){return m<60?m+' นาที':Math.floor(m/60)+' ชม. '+(m%60)+' นาที';}
function card(id,title,sec,body,opt){
  opt=opt||{};var st=stampHtml(sec);
  return '<section class="amh-card'+(opt.span?' span2':'')+'" aria-labelledby="t-'+id+'">'+
    '<header class="amh-ch"><div><h2 id="t-'+id+'">'+esc(title)+'</h2>'+st.head+'</div>'+(opt.ctrl||'')+'</header>'+
    st.warn+(st.has?body:'<p class="amh-empty">ยังไม่มีข้อมูลส่วนนี้ในแท็บ AMH-LM</p>')+'</section>';
}
function kpi(label,val,sub,cls){
  return '<div class="amh-kpi'+(cls?' '+cls:'')+'" role="group" aria-label="'+esc(label)+'"><span class="k">'+esc(label)+'</span>'+
    '<b class="v">'+esc(val)+'</b>'+(sub?'<span class="s">'+esc(sub)+'</span>':'')+'</div>';
}
function seg(name,cur,opts){
  return '<div class="amh-seg" role="radiogroup" aria-label="'+esc(name)+'">'+opts.map(function(o){
    var on=o===cur;
    return '<button type="button" role="radio" class="chip'+(on?' on':'')+'" aria-checked="'+on+'" tabindex="'+(on?0:-1)+'" data-seg="'+esc(name)+'" data-v="'+esc(o)+'">'+esc(L(o))+'</button>';
  }).join('')+'</div>';
}
function table(cap,heads,rows,numFrom){
  if(!rows.length)return '<p class="amh-empty">ไม่มีรายการ</p>';
  return '<div class="amh-tw"><table class="amh-t"><caption class="sr">'+esc(cap)+'</caption><thead><tr>'+
    heads.map(function(h,i){return '<th scope="col"'+(i>=numFrom?' class="n"':'')+'>'+esc(h)+'</th>';}).join('')+'</tr></thead><tbody>'+
    rows.map(function(r){return '<tr>'+r.map(function(c,i){return (i===0?'<th scope="row">':'<td'+(i>=numFrom?' class="n"':'')+'>')+c+(i===0?'</th>':'</td>');}).join('')+'</tr>';}).join('')+
    '</tbody></table></div>';
}

/* ---------- cards ---------- */
function cForecast(d){
  return card('fc','คาดการณ์งานเข้า','forecast','<div class="amh-kpis">'+
    kpi('คาดการณ์ LM เข้า',N(d.kpi('est_inbound')))+kpi('เข้าฮับจริง',N(d.kpi('actual_inbound')))+'</div>');
}
function cVolume(d){
  return card('vol','ปริมาณพัสดุ','volume','<div class="amh-kpis two">'+
    kpi('รับเข้า (ส่งออก)',N(d.kpi('forward_inbounded')))+kpi('รับเข้า (ตีกลับ)',N(d.kpi('return_inbounded')))+
    kpi('ส่งถึงผู้ซื้อ',N(d.kpi('delivered_to_buyer')),'เฉลี่ย 7 วัน '+N(d.kpi('avg_l7d_delivered')))+
    kpi('คืนผู้ขาย',N(d.kpi('returned_to_seller')),'เฉลี่ย 7 วัน '+N(d.kpi('avg_l7d_returned')))+'</div>');
}
function cDtp(d){
  var v=d.kpi('dtp_value'),t=d.kpi('dtp_target'),over=v!=null&&t!=null&&v>t;
  return card('dtp','วันที่ใช้เคลียร์งาน','dtp','<div class="amh-kpis">'+
    kpi('ใช้จริง / เป้า',N(v,1)+' / '+N(t,1),over?'เกินเป้า':'',over?'bad':'')+'</div>');
}
function cBacklog(d){
  var rows=d.backlog(S.backlogScope,S.aging),dn=C.donut(rows);
  var sel='<label class="amh-sel"><span class="sr">ประเภทอายุงาน</span><select id="agingSel">'+
    ['hub_aging','leg_aging','delivery_attempts'].map(function(a){return '<option value="'+a+'"'+(a===S.aging?' selected':'')+'>'+esc(L(a))+'</option>';}).join('')+'</select></label>';
  var body='<div class="amh-ctl">'+seg('backlog',S.backlogScope,['total','hub','fleet'])+sel+'</div>'+
    (rows.length?'<div class="amh-bl">'+donutSvg(dn)+table('งานค้างตามอายุ',['อายุงาน','ถึงผู้ซื้อ','ถึงผู้ขาย','โอนย้าย'],
      rows.map(function(r){return [esc(r.bucket),N(r.to_buyer),N(r.to_seller),N(r.to_transfer)];}),1)+'</div>'
      :'<p class="amh-empty">ไม่มีข้อมูลงานค้างสำหรับมุมมองนี้</p>');
  return card('bl','งานค้าง (Backlog)','backlog',body,{span:true});
}
var DONUT_CLS=['d0','d1','d2','d3','d4'];
function donutSvg(dn){
  var r=40,c=2*Math.PI*r;
  var segs=dn.total?dn.parts.map(function(p,i){
    return '<circle r="'+r+'" cx="50" cy="50" class="'+DONUT_CLS[i%5]+'" stroke-dasharray="'+(p.frac*c).toFixed(2)+' '+c.toFixed(2)+'" stroke-dashoffset="'+(-p.start*c).toFixed(2)+'"/>';
  }).join(''):'<circle r="'+r+'" cx="50" cy="50" class="dz"/>';
  var aria='งานค้างรวม '+N(dn.total)+' ชิ้น: '+dn.parts.map(function(p){return p.bucket+' '+N(p.value);}).join(', ');
  return '<figure class="amh-donut"><svg viewBox="0 0 100 100" role="img" aria-label="'+esc(aria)+'"><g transform="rotate(-90 50 50)">'+segs+'</g>'+
    '<text x="50" y="54" text-anchor="middle">'+esc(N(dn.total))+'</text></svg>'+
    '<figcaption>'+dn.parts.map(function(p,i){return '<span><i class="'+DONUT_CLS[i%5]+'"></i>'+esc(p.bucket)+'</span>';}).join('')+'</figcaption></figure>';
}
function cExpedite(d){
  var s=S.expScope;
  return card('ex','งานเร่งด่วน','expedite','<div class="amh-ctl">'+seg('expedite',s,['total','hub','fleet'])+'</div><div class="amh-kpis">'+
    kpi('เร่งด่วน',N(d.kpi('expedite',s)))+kpi('ด่วนพิเศษ',N(d.kpi('super_expedite',s)))+'</div>');
}
function cLh(d){
  var rows=d.lh.map(function(t){return ['<span class="mono">'+esc(t.trip_id)+'</span>',esc(t.atd||C.DASH),esc(t.eta||C.DASH),N(t.orders),'<span class="badge">'+esc(t.status||C.DASH)+'</span>'];});
  return card('lh','รถ Linehaul เข้าฮับ','lh','<div class="amh-kpis">'+kpi('กำลังโหลด',N(d.kpi('lh_loading')))+kpi('กำลังวิ่ง',N(d.kpi('lh_transporting')))+'</div>'+
    table('เที่ยวรถ Linehaul',['Trip ID','ออก','ถึง (ETA)','ชิ้น','สถานะ'],rows,3)+
    '<a class="amh-out" href="'+FMS_URL+'" target="_blank" rel="noopener">ดูเที่ยวรถทั้งหมดใน FMS<svg class="ic" aria-hidden="true"><use href="#i-ext"/></svg></a>');
}
function cProgress(d){
  var dirs=['before_cutoff','to_buyer','to_seller'];
  var tabs='<div class="amh-ctabs" role="tablist" aria-label="ทิศทางงาน">'+dirs.map(function(x){
    var on=x===S.dir;return '<button type="button" role="tab" aria-selected="'+on+'" tabindex="'+(on?0:-1)+'" class="'+(on?'on':'')+'" data-dir="'+x+'">'+esc(L(x))+'</button>';}).join('')+'</div>';
  var rows=d.progress(S.dir);
  var fun=rows.length?'<div class="amh-fun">'+[['ในฮับ',C.HUB_STAGES],['กับคนขับ',['delivering','delivered','on_hold']]].map(function(g){
    var rs=rows.filter(function(r){return g[1].indexOf(r.stage)>=0;});
    return rs.length?table('สถานะ'+g[0],[g[0],'ค้าง','ทั้งหมด','เสร็จ'],rs.map(function(r){
      var low=r.pct!=null&&r.pct<95;
      return [esc(L(r.stage)),N(r.volume),N(r.total),N(r.completed)+' <span class="pc'+(low?' bad':'')+'">('+P(r.pct)+(low?' · ต่ำกว่า 95%':'')+')</span>'+
        (r.pct!=null?'<span class="pbar" aria-hidden="true"><span class="track"><span class="fill" style="width:'+Math.min(100,r.pct)+'%"></span></span></span>':'')];
    }),1):'';
  }).join('')+'</div>':'<p class="amh-empty">ไม่มีข้อมูลสถานะสำหรับมุมมองนี้</p>';
  return card('op','ความคืบหน้าวันนี้','progress',tabs+'<div class="amh-kpis six">'+
    kpi('ยอดวันนี้',N(d.kpi('today_volume')))+kpi('รอส่งมอบ',N(d.kpi('to_handover')))+kpi('รอนำส่ง',N(d.kpi('to_deliver')))+
    kpi('ส่งสำเร็จ (Completion)',P(d.kpi('completion_rate')))+kpi('เคลียร์พื้น (CFR)',P(d.kpi('cfr')))+kpi('ออกส่งแล้ว',N(d.kpi('delivering_attempted')))+'</div>'+fun,{span:true});
}
function vtRows(list,a,b){
  return ['2WH','4WH','Others'].map(function(vt){
    function cell(ct){var r=list.filter(function(x){return x.vehicle_type===vt&&x.contract===ct;})[0];return r?N(r[a])+'/'+N(r[b]):C.DASH;}
    return [vt,cell('full_time'),cell('part_time')];
  });
}
function cHead(d){
  return card('hc','จำนวนคนขับ','headcount','<div class="amh-kpis two">'+
    kpi('ประจำ',N(d.kpi('ft_headcount')),'มาทำงาน '+P(d.kpi('ft_attendance_rate')))+kpi('พาร์ทไทม์',N(d.kpi('pt_headcount')),'มาทำงาน '+P(d.kpi('pt_attendance_rate')))+'</div>'+
    table('คนขับตามประเภทรถ',['ประเภทรถ','ประจำ มา/แผน','พาร์ทไทม์ มา/แผน'],vtRows(d.fleet('total'),'actual','scheduled'),1));
}
function cProd(d){
  var s=S.prodDir;
  return card('pd','ผลงานต่อคน','productivity','<div class="amh-ctl">'+seg('prod',s,['total','forward','return'])+'</div><div class="amh-kpis two">'+
    kpi('ประจำ (ชิ้น/คน)',N(d.kpi('ft_orders_per_rider',s)))+kpi('พาร์ทไทม์ (ชิ้น/คน)',N(d.kpi('pt_orders_per_rider',s)))+'</div>'+
    table('ส่งสำเร็จต่อที่รับไปตามประเภทรถ',['ประเภทรถ','ประจำ ส่ง/รับ','พาร์ทไทม์ ส่ง/รับ'],vtRows(d.fleet(s),'delivered','handed_over'),1));
}
function cCod(d){
  return card('cod','เงิน COD ที่ยังไม่ได้เก็บ','finance','<div class="amh-kpis">'+kpi('ค้างเก็บรวม',C.fmtBaht(d.kpi('cod_pending_satang')))+'</div>'+
    table('COD ค้างเก็บตามวันที่ส่ง',['ส่งเมื่อ','ชิ้น','ค้างเก็บ'],d.cod.map(function(r){return [esc(L(r.bucket)),N(r.orders),C.fmtBaht(r.pending_satang)];}),1));
}

/* ---------- page ---------- */
function render(){
  var d=S.d,g=$('panelHub');
  if(!d)return;
  if(d.empty){
    $('hDate').textContent='ยังไม่มีข้อมูล';
    g.innerHTML='<div class="amh-card span3"><p class="amh-empty">ยังไม่มีตัวเลขในระบบ ให้กรอกแท็บ AMH-LM ในชีต แล้วรัน amhLmSyncNow ใน Apps Script</p></div>';
  }else{
    var today=C.businessDate(new Date());
    $('hDate').textContent='วันทำงาน '+thDate(d.date)+(d.date===today?' (วันนี้)':' · ไม่ใช่วันนี้');
    $('hDate').classList.toggle('bad',d.date!==today);
    g.innerHTML=[cForecast(d),cVolume(d),cDtp(d),cBacklog(d),cExpedite(d),cProgress(d),cLh(d),cHead(d),cProd(d),cCod(d)].join('');
  }
  g.setAttribute('aria-busy','false');
}
function thDate(iso){
  var p=String(iso||'').split('-');if(p.length!==3)return iso||C.DASH;
  return new Intl.DateTimeFormat('th-TH',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(+p[0],+p[1]-1,+p[2])));
}
function showErr(t){var e=$('err');e.textContent=t;e.hidden=!t;}
function missing(err){var m=String(err&&(err.message||err.code)||'');return /42883|PGRST202|does not exist|schema cache/i.test(m);}

function load(){
  if(S.loading)return;S.loading=true;
  var b=$('refBtn');b.disabled=true;b.setAttribute('aria-busy','true');$('panelHub').setAttribute('aria-busy','true');
  if(!S.d)$('panelHub').innerHTML=skeleton();
  sb.auth.getSession().then(function(r){
    var s=r&&r.data&&r.data.session;
    if(!s){location.replace('../');return Promise.reject('redirect');}
    window.SPX_LEAVE={state:{perm:{known:true,email:s.user&&s.user.email||'',admin:false}}};   // sidebar account label (shell.js)
    return sb.rpc('get_amh_lm',{p_hub:HUB});
  }).then(function(r){
    if(r.error)throw r.error;
    S.d=C.shape(r.data);showErr('');render();
  }).catch(function(e){
    if(e==='redirect')return;
    if(missing(e))showErr('ยังไม่ได้ติดตั้งฐานข้อมูลของหน้านี้ ให้ผู้ดูแลรัน supabase/migrations/20261124120000_amh_lm.sql ใน Supabase → SQL Editor');
    else showErr('โหลดข้อมูลไม่สำเร็จ: '+(api.thErr?api.thErr(e):(e&&e.message||e)));
    if(!S.d)$('panelHub').innerHTML='';
  }).then(function(){S.loading=false;b.disabled=false;b.removeAttribute('aria-busy');});
}
function skeleton(){
  var c='<section class="amh-card sk" aria-hidden="true"><span></span><span></span><span></span></section>';
  return c+c+c+c.replace('amh-card','amh-card span2')+c;
}

/* ---------- events ---------- */
function wire(){
  $('refBtn').onclick=load;
  $('views').addEventListener('click',function(e){var b=e.target.closest('button[data-href]');if(b)location.href=new URL(b.getAttribute('data-href'),location.href).href;});
  $('logoutBtn').onclick=function(){sb.auth.signOut({scope:'local'}).then(function(){location.replace('../');},function(){location.replace('../');});};
  var g=$('panelHub');
  g.addEventListener('click',function(e){
    var s=e.target.closest('[data-seg]'),t=e.target.closest('[data-dir]');
    if(s){var n=s.getAttribute('data-seg'),v=s.getAttribute('data-v');
      if(n==='backlog')S.backlogScope=v;else if(n==='expedite')S.expScope=v;else if(n==='prod')S.prodDir=v;
      render();refocus('[data-seg="'+n+'"][data-v="'+v+'"]');}
    else if(t){S.dir=t.getAttribute('data-dir');render();refocus('[data-dir="'+S.dir+'"]');}
  });
  g.addEventListener('change',function(e){if(e.target.id==='agingSel'){S.aging=e.target.value;render();refocus('#agingSel');}});
  g.addEventListener('keydown',function(e){   // arrow keys inside radio groups and card tabs
    if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].indexOf(e.key)<0)return;
    var b=e.target.closest('[data-seg],[data-dir]');if(!b)return;
    var all=Array.prototype.slice.call(b.parentNode.querySelectorAll('button')),i=all.indexOf(b);
    var nx=all[(i+(e.key==='ArrowRight'||e.key==='ArrowDown'?1:all.length-1))%all.length];
    e.preventDefault();nx.click();
  });
  document.addEventListener('visibilitychange',function(){if(!document.hidden)load();});
  setInterval(function(){if(!document.hidden)load();},5*60000);
}
function refocus(sel){var el=$('panelHub').querySelector(sel);if(el)el.focus();}

if(!C||!sb){showErr('โหลดหน้าไม่สำเร็จ (ไม่พบไลบรารี) ลองรีเฟรชอีกครั้ง');return;}
wire();load();
})();
