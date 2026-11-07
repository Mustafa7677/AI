/**
 * TULPAR classroom access gateway (Cloudflare Worker + D1).
 * Students enter a class code once, receive an HttpOnly session cookie, and
 * never handle provider credentials. The owner uses ADMIN_SETUP_SECRET only
 * server-to-server; never place it in the public frontend.
 *
 * Bind DB (D1) and AI_GATEWAY (service binding to the existing AI worker).
 * Configure ALLOWED_ORIGIN to the exact frontend origin.
 */
const enc=new TextEncoder();
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json","cache-control":"no-store",...headers}});
const random=()=>crypto.randomUUID();
const hex=async data=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",enc.encode(data)))).map(x=>x.toString(16).padStart(2,"0")).join("");
function cors(request,env){const origin=request.headers.get("origin");const allowed=env.ALLOWED_ORIGIN;if(!allowed||origin!==allowed)return null;return {"access-control-allow-origin":origin,"access-control-allow-credentials":"true","access-control-allow-headers":"content-type,authorization","access-control-allow-methods":"GET,POST,OPTIONS","vary":"Origin"}}
function cookie(request){return /(?:^|;\s*)tulpar_session=([^;]+)/.exec(request.headers.get("cookie")||"")?.[1]||""}
async function session(request,env){const token=cookie(request);if(!token)return null;const hash=await hex(token);return env.DB.prepare("SELECT s.user_id,u.role,u.class_id FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.active=1").bind(hash,Date.now()).first()}
async function payload(request){const data=await request.json();if(!data||typeof data!=="object"||Array.isArray(data))throw Error("Invalid JSON object");return data}
export default {async fetch(request,env){
 const h=cors(request,env);if(!h)return json({error:"Origin not allowed"},403);
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers:h});
 const path=new URL(request.url).pathname;
 try{
  if(path==="/api/class/join"&&request.method==="POST"){
   const body=await payload(request);
   const code=String(body.code||"").trim().toUpperCase();
   const displayName=String(body.name||"").trim().slice(0,80);
   if(!/^[A-Z0-9-]{6,32}$/.test(code)||displayName.length<2)return json({error:"Invalid class code or name"},400,h);
   const cls=await env.DB.prepare("SELECT id FROM classes WHERE code_hash=? AND active=1").bind(await hex(code)).first();
   if(!cls)return json({error:"Class not found"},404,h);
   const id=random(),token=random()+random(),expires=Date.now()+30*86400000;
   await env.DB.batch([
    env.DB.prepare("INSERT INTO users(id,class_id,display_name,role,active) VALUES(?,?,?,'student',1)").bind(id,cls.id,displayName),
    env.DB.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)").bind(await hex(token),id,expires)
   ]);
   return json({ok:true,role:"student"},200,{...h,"set-cookie":`tulpar_session=${token}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=2592000`});
  }
  if(path==="/api/admin/login"&&request.method==="POST"){
   const body=await payload(request);
   const password=String(body.password||"");
   if(!env.ADMIN_PASSWORD||password.length<12||await hex(password)!==await hex(env.ADMIN_PASSWORD))return json({error:"Invalid admin credentials"},401,h);
   const admin=await env.DB.prepare("SELECT id FROM users WHERE role='admin' AND active=1 LIMIT 1").first();
   if(!admin)return json({error:"Super Admin not initialized"},409,h);
   const token=random()+random();
   await env.DB.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)").bind(await hex(token),admin.id,Date.now()+30*86400000).run();
   return json({ok:true,role:"admin"},200,{...h,"set-cookie":`tulpar_session=${token}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=2592000`});
  }
  if(path==="/api/admin/bootstrap"&&request.method==="POST"){
   if(!env.ADMIN_SETUP_SECRET||request.headers.get("authorization")!==`Bearer ${env.ADMIN_SETUP_SECRET}`)return json({error:"Forbidden"},403,h);
   const count=await env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE role='admin'").first();
   if(count.n)return json({error:"Admin already exists"},409,h);
   const id=random(),token=random()+random();
   await env.DB.batch([
    env.DB.prepare("INSERT INTO users(id,class_id,display_name,role,active) VALUES(?,NULL,'Super Admin','admin',1)").bind(id),
    env.DB.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)").bind(await hex(token),id,Date.now()+30*86400000)
   ]);
   return json({ok:true},200,{...h,"set-cookie":`tulpar_session=${token}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=2592000`});
  }
  const me=await session(request,env);
  if(path==="/api/me"&&request.method==="GET")return json({authenticated:!!me,role:me?.role||null},200,h);
  if(!me)return json({error:"Join a class first"},401,h);
  if(path==="/api/admin/classes"&&request.method==="POST"){
   if(me.role!=="admin")return json({error:"Admin only"},403,h);
   const body=await payload(request);const name=String(body.name||"").trim().slice(0,80);
   if(name.length<2)return json({error:"Invalid class name"},400,h);
   const code=Array.from(crypto.getRandomValues(new Uint8Array(8)),x=>x.toString(16).padStart(2,"0")).join("").toUpperCase();
   const id=random();
   await env.DB.prepare("INSERT INTO classes(id,name,code_hash,active) VALUES(?,?,?,1)").bind(id,name,await hex(code)).run();
   return json({id,name,joinCode:code},201,h);
  }
  if(path==="/api/chat"&&request.method==="POST"){
   if(!env.AI_GATEWAY||!env.TULPAR_ACCESS_TOKEN)return json({error:"AI gateway is not configured"},503,h);
   const body=await payload(request);
   if(!Array.isArray(body.messages)||body.messages.length>40)return json({error:"Invalid messages"},400,h);
   const upstream=await env.AI_GATEWAY.fetch("https://tulpar-internal/v1/chat",{method:"POST",headers:{"content-type":"application/json","origin":env.ALLOWED_ORIGIN,"authorization":`Bearer ${env.TULPAR_ACCESS_TOKEN}`},body:JSON.stringify({messages:body.messages})});
   return new Response(upstream.body,{status:upstream.status,headers:{...h,"content-type":upstream.headers.get("content-type")||"application/json","cache-control":"no-store"}});
  }
  return json({error:"Not found"},404,h);
 }catch(e){return json({error:"Request failed"},500,h)}
}};
