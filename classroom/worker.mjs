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
 // Student enrollment on the same origin keeps the session cookie first-party.
 if(request.method==="GET"&&new URL(request.url).pathname==="/join"){
  const html=`<!doctype html><html lang="kk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TULPAR AI — Классқа қосылу</title><style>body{font:16px system-ui;background:#08111d;color:#e9f2ff;margin:0}main{max-width:550px;margin:5vh auto;padding:24px}section{background:#101f30;border:1px solid #304358;border-radius:18px;padding:22px}h1{color:#67dce3}label{display:block;margin:16px 0 6px}input{display:block;width:100%;box-sizing:border-box;background:#081522;color:white;border:1px solid #456075;border-radius:10px;padding:14px;font:inherit}button{background:#67dce3;color:#092130;border:0;border-radius:10px;padding:13px 20px;margin-top:20px;font-weight:bold}#status{margin-top:20px;color:#ffd58b}a{color:#8ddce8}</style></head><body><main><h1>🎓 Классқа қосылу</h1><p>Мұғалім берген Join Code кодын енгіз.</p><section><form id="joinForm"><label for="studentName">Аты-жөнің</label><input id="studentName" required minlength="2" maxlength="80"><label for="joinCode">Класс коды (Join Code)</label><input id="joinCode" required minlength="6" maxlength="32"><button id="submit">Классқа қосылу</button></form><p id="status" role="status"></p></section><p><a href="https://mustafa7677.github.io/AI/">← TULPAR AI</a></p></main><script>document.getElementById("joinForm").onsubmit=async function(e){e.preventDefault();const status=document.getElementById("status"),btn=document.getElementById("submit");btn.disabled=true;status.textContent="Қосылуда…";try{const res=await fetch("/api/class/join",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify({name:document.getElementById("studentName").value.trim(),code:document.getElementById("joinCode").value.trim().toUpperCase()})});const data=await res.json();if(!res.ok)throw Error(data.error||"Қосылу қатесі");const me=await fetch("/api/me",{credentials:"same-origin"}).then(r=>r.json());if(me.role!=="student")throw Error("Сессия сақталмады");status.textContent="✓ Классқа сәтті қосылдың!";}catch(err){status.textContent="⚠ "+err.message}finally{btn.disabled=false}};</script></body></html>`;
  return new Response(html,{headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff","content-security-policy":"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'"}});
 }
 // Admin UI served first-party; its requests stay on this Worker origin.
 if(request.method==="GET"&&new URL(request.url).pathname==="/admin"){
  const html=`<!doctype html><html lang="kk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TULPAR AI — Super Admin</title><style>body{font:16px system-ui;background:#08111d;color:#e9f2ff;margin:0}main{max-width:550px;margin:5vh auto;padding:24px}section{background:#101f30;border:1px solid #304358;border-radius:18px;padding:22px}h1{color:#67dce3}label{display:block;margin:16px 0 6px}input{display:block;width:100%;box-sizing:border-box;background:#081522;color:white;border:1px solid #456075;border-radius:10px;padding:14px;font:inherit}button{background:#67dce3;color:#092130;border:0;border-radius:10px;padding:13px 20px;margin-top:20px;font-weight:bold}#status{color:#ffd58b;overflow-wrap:anywhere}.hidden{display:none}a{color:#8ddce8}</style></head><body><main><h1>TULPAR AI · Super Admin</h1><section id="login"><h2>Әкімші кіру</h2><form id="loginForm"><label for="password">Пароль</label><input id="password" type="password" autocomplete="current-password" required><button>Кіру</button></form></section><section id="dashboard" class="hidden"><h2>Жаңа класс ашу</h2><form id="classForm"><label for="className">Класс атауы</label><input id="className" maxlength="80" required placeholder="A017"><button>Класс ашу</button></form><p id="code"></p></section><p id="status" role="status"></p><a href="/join">Оқушыларға кіру</a></main><script>const $=id=>document.getElementById(id);async function api(path,opts={}){const r=await fetch(path,{credentials:"same-origin",headers:{"content-type":"application/json"},...opts});const d=await r.json();if(!r.ok)throw Error(d.error||"HTTP "+r.status);return d}function show(){ $("login").classList.add("hidden");$("dashboard").classList.remove("hidden") }api("/api/me").then(d=>{if(d.role==="admin")show()}).catch(()=>{});$("loginForm").onsubmit=async e=>{e.preventDefault();try{await api("/api/admin/login",{method:"POST",body:JSON.stringify({password:$("password").value})});$("password").value="";const d=await api("/api/me");if(d.role!=="admin")throw Error("Сессия сақталмады");show();$("status").textContent="Кіру сәтті"}catch(err){$("status").textContent=err.message}};$("classForm").onsubmit=async e=>{e.preventDefault();try{const d=await api("/api/admin/classes",{method:"POST",body:JSON.stringify({name:$("className").value})});$("code").textContent="Join Code: "+d.joinCode;$("status").textContent="Класс ашылды"}catch(err){$("status").textContent=err.message}};</script></body></html>`;
  return new Response(html,{headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff","content-security-policy":"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'"}});
 }
 const origin=request.headers.get("origin");
 const ownOrigin=new URL(request.url).origin;
 const h=origin===ownOrigin?{}:cors(request,env);
 if(origin&&origin!==ownOrigin&&!h)return json({error:"Origin not allowed"},403);
 const responseHeaders=h||{};
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers:responseHeaders});
 const path=new URL(request.url).pathname;
 try{
  if(path==="/api/class/join"&&request.method==="POST"){
   const body=await payload(request);
   const code=String(body.code||"").trim().toUpperCase();
   const displayName=String(body.name||"").trim().slice(0,80);
   if(!/^[A-Z0-9-]{6,32}$/.test(code)||displayName.length<2)return json({error:"Invalid class code or name"},400,responseHeaders);
   const cls=await env.DB.prepare("SELECT id FROM classes WHERE code_hash=? AND active=1").bind(await hex(code)).first();
   if(!cls)return json({error:"Class not found"},404,responseHeaders);
   const id=random(),token=random()+random(),expires=Date.now()+30*86400000;
   await env.DB.batch([
    env.DB.prepare("INSERT INTO users(id,class_id,display_name,role,active) VALUES(?,?,?,'student',1)").bind(id,cls.id,displayName),
    env.DB.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)").bind(await hex(token),id,expires)
   ]);
   return json({ok:true,role:"student"},200,{...responseHeaders,"set-cookie":`tulpar_session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`});
  }
  if(path==="/api/admin/login"&&request.method==="POST"){
   const body=await payload(request);
   const password=String(body.password||"");
   if(!env.ADMIN_PASSWORD||password.length<12||await hex(password)!==await hex(env.ADMIN_PASSWORD))return json({error:"Invalid admin credentials"},401,responseHeaders);
   const admin=await env.DB.prepare("SELECT id FROM users WHERE role='admin' AND active=1 LIMIT 1").first();
   if(!admin)return json({error:"Super Admin not initialized"},409,responseHeaders);
   const token=random()+random();
   await env.DB.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)").bind(await hex(token),admin.id,Date.now()+30*86400000).run();
   return json({ok:true,role:"admin"},200,{...responseHeaders,"set-cookie":`tulpar_session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`});
  }
  if(false && path==="/api/admin/bootstrap"&&request.method==="POST"){
   if(!env.ADMIN_SETUP_SECRET||request.headers.get("authorization")!==`Bearer ${env.ADMIN_SETUP_SECRET}`)return json({error:"Forbidden"},403,responseHeaders);
   const count=await env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE role='admin'").first();
   if(count.n)return json({error:"Admin already exists"},409,responseHeaders);
   const id=random(),token=random()+random();
   await env.DB.batch([
    env.DB.prepare("INSERT INTO users(id,class_id,display_name,role,active) VALUES(?,NULL,'Super Admin','admin',1)").bind(id),
    env.DB.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)").bind(await hex(token),id,Date.now()+30*86400000)
   ]);
   return json({ok:true},200,{...responseHeaders,"set-cookie":`tulpar_session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`});
  }
  const me=await session(request,env);
  if(path==="/api/me"&&request.method==="GET")return json({authenticated:!!me,role:me?.role||null},200,responseHeaders);
  if(!me)return json({error:"Join a class first"},401,responseHeaders);
  if(path==="/api/admin/classes"&&request.method==="POST"){
   if(me.role!=="admin")return json({error:"Admin only"},403,responseHeaders);
   const body=await payload(request);const name=String(body.name||"").trim().slice(0,80);
   if(name.length<2)return json({error:"Invalid class name"},400,responseHeaders);
   const code=Array.from(crypto.getRandomValues(new Uint8Array(8)),x=>x.toString(16).padStart(2,"0")).join("").toUpperCase();
   const id=random();
   await env.DB.prepare("INSERT INTO classes(id,name,code_hash,active) VALUES(?,?,?,1)").bind(id,name,await hex(code)).run();
   return json({id,name,joinCode:code},201,responseHeaders);
  }
  if(path==="/api/chat"&&request.method==="POST"){
   if(me.role!=="student"||!me.class_id)return json({error:"Class membership required"},403,responseHeaders);
   const active=await env.DB.prepare("SELECT id FROM classes WHERE id=? AND active=1").bind(me.class_id).first();
   if(!active)return json({error:"Class inactive"},403,responseHeaders);
   if(!env.AI_GATEWAY||!env.TULPAR_ACCESS_TOKEN)return json({error:"AI gateway is not configured"},503,responseHeaders);
   const body=await payload(request);
   if(!Array.isArray(body.messages)||body.messages.length<1||body.messages.length>40)return json({error:"Invalid messages"},400,responseHeaders);
   const upstream=await env.AI_GATEWAY.fetch("https://tulpar-internal/v1/chat",{method:"POST",headers:{"content-type":"application/json","origin":env.ALLOWED_ORIGIN,"authorization":`Bearer ${env.TULPAR_ACCESS_TOKEN}`},body:JSON.stringify({messages:body.messages})});
   return new Response(upstream.body,{status:upstream.status,headers:{...responseHeaders,"content-type":upstream.headers.get("content-type")||"text/event-stream","cache-control":"no-store"}});
  }
  return json({error:"Not found"},404,responseHeaders);
 }catch(e){return json({error:"Request failed"},500,responseHeaders)}
}};
