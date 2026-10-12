// Admin-only account management. Service-role key stays on the server.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
const ORIGINS=["https://bangz27.github.io","https://workstation-abbtg-a.vercel.app","http://localhost:8091"];
const cors=(o:string)=>({"Access-Control-Allow-Origin":ORIGINS.includes(o)?o:ORIGINS[0],"Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin","Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"});
const fields=["can_home","can_fleet_overview","can_fleet","can_ops","can_leave","can_manage_fleet","can_manage_ops","can_manage_leave"];
Deno.serve(async(req:Request)=>{
 const h=cors(req.headers.get("Origin")??"");const reply=(s:number,b:Record<string,unknown>)=>new Response(JSON.stringify(b),{status:s,headers:h});
 if(req.method==="OPTIONS")return new Response("ok",{headers:h});if(req.method!=="POST")return reply(405,{error:"ใช้ได้เฉพาะ POST"});
 const jwt=(req.headers.get("Authorization")??"").replace(/^Bearer\s+/i,"").trim();if(!jwt)return reply(401,{error:"กรุณาเข้าสู่ระบบ"});
 const url=Deno.env.get("SUPABASE_URL")!,anon=Deno.env.get("SUPABASE_ANON_KEY")!,service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
 const caller=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:"Bearer "+jwt}}});
 const {data:who,error:whoErr}=await caller.auth.getUser(jwt);if(whoErr||!who?.user||who.user.is_anonymous)return reply(401,{error:"เซสชันไม่ถูกต้อง"});
 const root=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:adminAccount}=await root.from("workstation_accounts_lookup").select("is_active").eq("user_id",who.user.id).maybeSingle();
 const {data:isAdmin,error:adminErr}=await caller.rpc("is_admin");
 if(adminErr||isAdmin!==true||!adminAccount?.is_active)return reply(403,{error:"เฉพาะผู้ดูแลระบบที่เปิดใช้งานเท่านั้น"});
 let b:any;try{b=await req.json()}catch{return reply(400,{error:"ข้อมูลไม่ถูกต้อง"})}
 if(b.action==="list"){
  const {data,error}=await root.from("workstation_accounts_lookup").select("*").order("username");
  if(error)return reply(500,{error:"โหลดบัญชีไม่สำเร็จ"});
  return reply(200,{accounts:(data??[]).map((a:any)=>({username:a.username,is_active:a.is_active,...Object.fromEntries(fields.map(f=>[f,a[f]])),user_id:a.user_id}))});
 }
 const username=String(b.username??"").trim().toLowerCase();
 if(!/^[a-z0-9._-]{3,40}$/.test(username))return reply(400,{error:"Username ต้องเป็น a-z, 0-9, จุด, _ หรือ - และยาว 3–40 ตัว"});
 const patch:any={};for(const f of fields)patch[f]=b[f]===true;
 if(b.action==="update"&&typeof b.password==="string"&&b.password.length>0&&b.password.length<10)return reply(400,{error:"รหัสผ่านต้องมีอย่างน้อย 10 ตัวอักษร"});
 if(b.action==="create"){
  const password=String(b.password??"");if(password.length<10)return reply(400,{error:"รหัสผ่านเริ่มต้นต้องมีอย่างน้อย 10 ตัวอักษร"});
  const {data:exists,error:lookupErr}=await root.from("workstation_accounts_lookup").select("username").ilike("username",username).maybeSingle();
  if(lookupErr)return reply(500,{error:"ตรวจสอบ Username ไม่สำเร็จ"});if(exists)return reply(409,{error:"Username นี้ถูกใช้แล้ว"});
  const email=username+"@accounts.workstation.invalid";
  const {data:created,error:createErr}=await root.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{username,created_via:"workstation-abbtg-a"}});
  if(createErr||!created.user)return reply(400,{error:createErr?.message??"สร้างบัญชีไม่สำเร็จ"});
  const {error:upErr}=await root.from("workstation_accounts").upsert({user_id:created.user.id,username,is_active:true,...patch,updated_at:new Date().toISOString()},{onConflict:"user_id"});
  if(upErr){await root.auth.admin.deleteUser(created.user.id);return reply(500,{error:"บันทึกบัญชีไม่สำเร็จ: "+upErr.message});}
  return reply(200,{ok:true,message:"สร้างบัญชี "+username+" สำเร็จ"});
 }
 if(b.action==="update"){
  const {data:target,error:targetErr}=await root.from("workstation_accounts_lookup").select("user_id").ilike("username",username).maybeSingle();
  if(targetErr||!target)return reply(404,{error:"ไม่พบบัญชีนี้"});
  if(target.user_id===who.user.id&&b.is_active===false)return reply(400,{error:"ไม่สามารถระงับบัญชีตัวเองได้"});
  const update:any={...patch,updated_at:new Date().toISOString()};if(typeof b.is_active==="boolean")update.is_active=b.is_active;
  const {error}=await root.from("workstation_accounts").update(update).eq("user_id",target.user_id);
  if(error)return reply(400,{error:"บันทึกสิทธิ์ไม่สำเร็จ: "+error.message});
  if(typeof b.password==="string"&&b.password.length){if(b.password.length<10)return reply(400,{error:"รหัสผ่านต้องมีอย่างน้อย 10 ตัวอักษร"});const {error:pwErr}=await root.auth.admin.updateUserById(target.user_id,{password:b.password});if(pwErr)return reply(400,{error:"เปลี่ยนรหัสผ่านไม่สำเร็จ"});}
  return reply(200,{ok:true,message:"อัปเดตบัญชี "+username+" แล้ว"});
 }
 return reply(400,{error:"ไม่รู้จักคำสั่ง"});
});