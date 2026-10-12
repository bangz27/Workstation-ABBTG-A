// Username/password login proxy. The username-to-email map never reaches the browser.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
const ORIGINS=["https://bangz27.github.io","https://workstation-abbtg-a.vercel.app","http://localhost:8091"];
const cors=(o:string)=>({"Access-Control-Allow-Origin":ORIGINS.includes(o)?o:ORIGINS[0],"Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin","Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"});
Deno.serve(async(req:Request)=>{
 const h=cors(req.headers.get("Origin")??"");const reply=(s:number,b:Record<string,unknown>)=>new Response(JSON.stringify(b),{status:s,headers:h});
 if(req.method==="OPTIONS")return new Response("ok",{headers:h});if(req.method!=="POST")return reply(405,{error:"ใช้ได้เฉพาะ POST"});
 let b:any;try{b=await req.json()}catch{return reply(400,{error:"ข้อมูลไม่ถูกต้อง"})}
 const identity=String(b.username??"").trim(),password=String(b.password??"");
 if(!identity||!password||identity.length>254||password.length>256)return reply(400,{error:"กรอก Username และรหัสผ่านให้ครบ"});
 const url=Deno.env.get("SUPABASE_URL")!,anon=Deno.env.get("SUPABASE_ANON_KEY")!,service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
 const root=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
 let email=identity.toLowerCase();
 if(!identity.includes("@")){
  if(!/^[A-Za-z0-9._-]{3,40}$/.test(identity))return reply(401,{error:"Username หรือรหัสผ่านไม่ถูกต้อง"});
  const {data,error}=await root.from("workstation_accounts_lookup").select("email,is_active").ilike("username",identity).maybeSingle();
  if(error||!data||!data.is_active)return reply(401,{error:"Username หรือรหัสผ่านไม่ถูกต้อง"});email=String(data.email);
 }
 const client=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 const {data,error}=await client.auth.signInWithPassword({email,password});
 if(error||!data.session)return reply(401,{error:"Username หรือรหัสผ่านไม่ถูกต้อง"});
 const {data:account,error:accountErr}=await root.from("workstation_accounts_lookup").select("is_active").eq("email",email).maybeSingle();
 if(accountErr||!account||!account.is_active){await client.auth.signOut();return reply(403,{error:"บัญชีถูกระงับหรือยังไม่ได้ตั้งค่า กรุณาติดต่อผู้ดูแลระบบ"});}
 return reply(200,{session:data.session});
});