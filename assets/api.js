/* Data layer: Supabase client + the two calls the UI needs (same JSON shapes as the old Apps Script). */
(function(){
"use strict";
var C=window.SPX_CONFIG;
// remember why we arrived (password-recovery / invite link) before supabase-js consumes the URL hash
var urlType=(/[#&]type=(recovery|invite)(?:&|$)/.exec(location.hash||'')||[])[1]||'';
var sb=window.supabase.createClient(C.SUPABASE_URL,C.SUPABASE_KEY,{
  auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'implicit',storageKey:'abbtga-ws-auth'}
});

function thErr(e){
  var m=String(e&&(e.message||e.error_description||e.msg)||e||'');
  var st=e&&e.status;
  if(/invalid login credentials/i.test(m))return 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
  if(/email not confirmed/i.test(m))return 'บัญชียังไม่ได้ยืนยันอีเมล — ติดต่อผู้ดูแลระบบ';
  if(st===429||/rate limit|too many/i.test(m))return 'ลองหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่';
  if(/failed to fetch|networkerror|network request failed|load failed/i.test(m))return 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่';
  if(/jwt expired|invalid jwt|permission denied|not authenticated/i.test(m))return 'เซสชันหมดอายุ — กรุณาเข้าสู่ระบบใหม่';
  if(/row-level security|violates row-level/i.test(m))return 'ไม่มีสิทธิ์แก้ไขข้อมูลการลา (เฉพาะผู้ดูแลระบบ)';
  if(/leave_records_dates/i.test(m))return 'ช่วงวันที่ไม่ถูกต้อง (วันสิ้นสุดต้องไม่ก่อนวันเริ่ม และไม่เกิน 1 ปี)';
  if(/different from the old|same password/i.test(m))return 'รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสเดิม';
  if(/password/i.test(m)&&/(short|weak|at least|characters)/i.test(m))return 'รหัสผ่านไม่ปลอดภัยพอ (อย่างน้อย 8 ตัวอักษร)';
  return m||'เกิดข้อผิดพลาด';
}
function isAuthErr(r){
  var e=r.error||{};
  return r.status===401||e.code==='PGRST301'||e.code==='PGRST303'||(e.code==='42501'&&/permission denied/i.test(e.message||''));
}
function call(fn,args){
  return sb.rpc(fn,args||{}).then(function(r){
    if(r.error){
      if(isAuthErr(r)&&window.SPX_AUTH)window.SPX_AUTH.expired();
      throw new Error(thErr(r.error));
    }
    if(r.data==null)throw new Error('ยังไม่มีข้อมูล — รอการซิงก์จาก Google Sheet');
    return r.data;
  },function(e){throw new Error(thErr(e));});
}

window.SPX_API={
  client:sb,
  urlType:urlType,
  thErr:thErr,
  /* Fleet Over View — tab "Daily Report" (only one tab is synced, the argument is ignored) */
  getDashboardData:function(){return call('get_daily_report');},
  /* "Dayoff Fleet" | "Dayoff Ops" */
  getRosterData:function(sheet){return call('get_roster',{p_key:/ops/i.test(String(sheet))?'ops':'fleet'});},
  /* ---- leave records (table public.leave_records; writes are admin-only via RLS) ---- */
  isAdmin:function(){return sb.rpc('is_admin').then(function(r){return !r.error&&r.data===true;},function(){return false;});},
  listLeaves:function(){return q(sb.from('leave_records').select(LV_COLS).order('start_date',{ascending:true}).order('id',{ascending:true}).limit(5000));},
  addLeave:function(row){return q(sb.from('leave_records').insert(row).select(LV_COLS).single());},
  updateLeave:function(id,row){return q(sb.from('leave_records').update(row).eq('id',id).select(LV_COLS)).then(function(d){
    if(!d||!d.length)throw new Error('ไม่มีสิทธิ์แก้ไข หรือรายการถูกลบไปแล้ว');return d[0];});},
  deleteLeave:function(id){return q(sb.from('leave_records').delete().eq('id',id).select('id')).then(function(d){
    if(!d||!d.length)throw new Error('ไม่มีสิทธิ์ลบ หรือรายการถูกลบไปแล้ว');return d;});}
};
var LV_COLS='id,staff_type,person_id,person_name,leave_type,start_date,end_date,note,created_at';
function q(builder){
  return builder.then(function(r){
    if(r.error){if(isAuthErr(r)&&window.SPX_AUTH)window.SPX_AUTH.expired();throw new Error(thErr(r.error));}
    return r.data;
  },function(e){throw new Error(thErr(e));});
}
})();
