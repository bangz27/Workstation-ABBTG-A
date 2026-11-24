/* AMH-LM — pure helpers (no DOM, no network). Loaded by the page and by tests/amh-lm.test.js. */
(function(root){
'use strict';
var DAY_START_H=9;           // FMS business day: 09:00 → 09:00 next day, Asia/Bangkok (UTC+7, no DST)
var STALE_MIN=30;

function pad(n){return (n<10?'0':'')+n;}

/** Business date (YYYY-MM-DD) for a moment, following the FMS 09:00 day start. */
function businessDate(now){
  var t=(now instanceof Date?now.getTime():Number(now))+7*3600000-DAY_START_H*3600000;
  var d=new Date(t);
  return d.getUTCFullYear()+'-'+pad(d.getUTCMonth()+1)+'-'+pad(d.getUTCDate());
}

function isNum(v){return typeof v==='number'?isFinite(v):(v!=null&&v!==''&&isFinite(Number(v)));}
var DASH='—';

/** 10721 → "10,721"; missing → "—" (never 0) */
function fmtNum(v,digits){
  if(!isNum(v))return DASH;
  var n=Number(v);
  return n.toLocaleString('en-US',{minimumFractionDigits:digits||0,maximumFractionDigits:digits==null?2:digits});
}
function fmtPct(v){return isNum(v)?fmtNum(v,1)+'%':DASH;}
/** satang → "฿262,012" */
function fmtBaht(satang){return isNum(satang)?'฿'+fmtNum(Number(satang)/100,0):DASH;}

/** completed / total as a percentage (1 decimal) or null */
function pct(completed,total){
  if(!isNum(completed)||!isNum(total)||Number(total)<=0)return null;
  return Math.round(Number(completed)/Number(total)*1000)/10;
}

/** "Updated" stamp → {known, stale, minutes, label} */
function freshness(iso,now,limitMin){
  if(!iso)return {known:false,stale:true,minutes:null,label:'ไม่ทราบเวลาอัปเดต'};
  var t=Date.parse(iso);
  if(!isFinite(t))return {known:false,stale:true,minutes:null,label:'ไม่ทราบเวลาอัปเดต'};
  var n=now instanceof Date?now.getTime():Number(now);
  var m=Math.max(0,Math.round((n-t)/60000));
  var b=new Date(t+7*3600000);
  var label='อัปเดต '+pad(b.getUTCDate())+'/'+pad(b.getUTCMonth()+1)+' '+pad(b.getUTCHours())+':'+pad(b.getUTCMinutes());
  return {known:true,stale:m>(limitMin||STALE_MIN),minutes:m,label:label};
}

/** get_amh_lm result → lookups the cards read from */
function shape(res){
  res=res||{};
  var kpi={};
  (res.kpi||[]).forEach(function(r){kpi[r.key+'|'+(r.scope||'total')]=r.value==null?null:Number(r.value);});
  return {
    hub:res.hub||'ABBTG-A',
    date:res.business_date||null,
    sections:res.sections||{},
    kpi:function(key,scope){var v=kpi[key+'|'+(scope||'total')];return v===undefined?null:v;},
    backlog:function(scope,aging){return (res.backlog||[]).filter(function(r){return r.scope===scope&&r.aging_type===aging;});},
    hasBacklog:function(scope,aging){return (res.backlog||[]).some(function(r){return r.scope===scope&&(!aging||r.aging_type===aging);});},
    lh:res.lh||[],
    progress:function(dir){return STAGES.map(function(s){
      var r=(res.progress||[]).filter(function(x){return x.direction===dir&&x.stage===s;})[0];
      return r?{stage:s,volume:r.volume,total:r.total,completed:r.completed,pct:pct(r.completed,r.total)}:null;
    }).filter(Boolean);},
    fleet:function(dir){return (res.fleet||[]).filter(function(r){return (r.direction||'total')===dir;});},
    cod:COD.map(function(b){return (res.cod||[]).filter(function(r){return r.bucket===b;})[0]||{bucket:b,orders:null,pending_satang:null};}),
    empty:!res.business_date
  };
}

var STAGES=['transported','received','assigning','assigned','delivering','delivered','on_hold'];
var HUB_STAGES=['transported','received','assigning','assigned'];
var COD=['today','1_3_days','4_5_days','over_5_days'];
var LABEL={
  transported:'ขนส่งถึงฮับ',received:'รับเข้าแล้ว',assigning:'กำลังจ่ายงาน',assigned:'จ่ายงานแล้ว',
  delivering:'กำลังนำส่ง',delivered:'ส่งสำเร็จ',on_hold:'พักไว้ (On-hold)',
  today:'วันนี้','1_3_days':'1-3 วัน','4_5_days':'4-5 วัน',over_5_days:'มากกว่า 5 วัน',
  before_cutoff:'ก่อนตัดรอบ',to_buyer:'ส่งถึงผู้ซื้อ',to_seller:'ตีกลับผู้ขาย',
  hub_aging:'อายุงานในฮับ',leg_aging:'อายุงานช่วง LM',delivery_attempts:'จำนวนครั้งที่พยายามส่ง',
  total:'ทั้งหมด',hub:'ในฮับ',fleet:'กับคนขับ',forward:'ส่งออก',return:'ตีกลับ',
  full_time:'ประจำ',part_time:'พาร์ทไทม์'
};
function label(k){return LABEL[k]||k;}

/** donut segments for backlog buckets → [{bucket,value,frac,start}] */
function donut(rows){
  var vals=rows.map(function(r){return (Number(r.to_buyer)||0)+(Number(r.to_seller)||0)+(Number(r.to_transfer)||0);});
  var sum=vals.reduce(function(a,b){return a+b;},0),acc=0;
  return {total:sum,parts:rows.map(function(r,i){var f=sum?vals[i]/sum:0,p={bucket:r.bucket,value:vals[i],frac:f,start:acc};acc+=f;return p;})};
}

root.AmhLmCore={businessDate:businessDate,fmtNum:fmtNum,fmtPct:fmtPct,fmtBaht:fmtBaht,pct:pct,freshness:freshness,
  shape:shape,donut:donut,label:label,STAGES:STAGES,HUB_STAGES:HUB_STAGES,COD:COD,DASH:DASH,STALE_MIN:STALE_MIN};
})(typeof window!=='undefined'?window:globalThis);
