/**
 * TULPAR classroom access gateway (Cloudflare Worker + D1).
 * Students enter a class code once, receive an HttpOnly first-party session
 * cookie, and never handle provider credentials or TULPAR_ACCESS_TOKEN.
 *
 * Bindings: DB (D1), AI_GATEWAY (service binding to tulpar-ai-gateway).
 * Secrets: TULPAR_ACCESS_TOKEN, ADMIN_PASSWORD. Var: ALLOWED_ORIGIN.
 * Optional var: APP_SOURCE (default https://mustafa7677.github.io/AI/).
 *
 * The full TULPAR AI interface is served at /app/ from this Worker's own
 * origin, so the SameSite=Lax session cookie is first-party and every
 * /api/chat call is checked against an active class membership server-side.
 */
const enc=new TextEncoder();
const DEFAULT_APP_SOURCE="https://mustafa7677.github.io/AI/";
const APP_FILES={"index.html":"text/html; charset=utf-8","styles.css":"text/css; charset=utf-8","app.js":"text/javascript; charset=utf-8","core.mjs":"text/javascript; charset=utf-8","gateway-client.mjs":"text/javascript; charset=utf-8","backup.mjs":"text/javascript; charset=utf-8","icon.svg":"image/svg+xml","manifest.webmanifest":"application/manifest+json"};
const MAX_BODY=65536,MAX_TURNS=24,MAX_MESSAGE=12000;
const RATE_LIMIT=20,RATE_WINDOW=60000; // best effort per isolate, per student
const rate=new Map();
const SESSION_MAX_AGE=2592000;
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json","cache-control":"no-store",...headers}});
const random=()=>crypto.randomUUID();
const hex=async data=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",enc.encode(data)))).map(x=>x.toString(16).padStart(2,"0")).join("");
const setCookie=token=>`tulpar_session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE}`;
const clearCookie="tulpar_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0";
const PAGE_CSP="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'";
const APP_CSP="default-src 'self'; script-src 'self' https://cdnjs.cloudflare.com; worker-src 'self' blob: https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' https://cdnjs.cloudflare.com; manifest-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'";
const page=html=>new Response(html,{headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff","referrer-policy":"no-referrer","content-security-policy":PAGE_CSP}});
const redirect=(request,to)=>new Response(null,{status:302,headers:{location:new URL(to,request.url).href,"cache-control":"no-store"}});
function cors(request,env){const origin=request.headers.get("origin");const allowed=env.ALLOWED_ORIGIN;if(!allowed||origin!==allowed)return null;return {"access-control-allow-origin":origin,"access-control-allow-credentials":"true","access-control-allow-headers":"content-type,authorization","access-control-allow-methods":"GET,POST,OPTIONS","vary":"Origin"}}
function cookie(request){return /(?:^|;\s*)tulpar_session=([^;]+)/.exec(request.headers.get("cookie")||"")?.[1]||""}
// A student session is valid only while the user is active AND their class is active.
async function session(request,env){const token=cookie(request);if(!token)return null;const hash=await hex(token);return env.DB.prepare("SELECT s.token_hash,s.user_id,u.role,u.class_id,u.display_name,c.name AS class_name FROM sessions s JOIN users u ON u.id=s.user_id LEFT JOIN classes c ON c.id=u.class_id WHERE s.token_hash=? AND s.expires_at>? AND u.active=1 AND (u.role='admin' OR c.active=1)").bind(hash,Date.now()).first()}
async function payload(request){const raw=await request.text();if(raw.length>MAX_BODY)throw Object.assign(Error("Request too large"),{status:413});let data;try{data=JSON.parse(raw)}catch{throw Object.assign(Error("Invalid JSON"),{status:400})}if(!data||typeof data!=="object"||Array.isArray(data))throw Object.assign(Error("Invalid JSON object"),{status:400});return data}
function cleanMessages(list){
 if(!Array.isArray(list)||!list.length)return null;
 const out=list.slice(-MAX_TURNS).map(m=>m&&["user","assistant"].includes(m.role)&&typeof m.content==="string"&&m.content.length<=MAX_MESSAGE?{role:m.role,content:m.content}:null);
 if(out.includes(null)||out.at(-1).role!=="user")return null;
 return out;
}
function limited(userId){const now=Date.now();const hits=(rate.get(userId)||[]).filter(t=>now-t<RATE_WINDOW);if(hits.length>=RATE_LIMIT){rate.set(userId,hits);return true}hits.push(now);rate.set(userId,hits);if(rate.size>5000)rate.clear();return false}

const PAGE_STYLE="@import url('https://fonts.googleapis.com/css2?family=PT+Mono&family=PT+Sans:wght@400;700&family=PT+Serif:ital,wght@0,400;0,700;1,400&display=swap');:root{color-scheme:dark;--bg:#0d0a07;--ink:#050403;--text:#efe4cc;--muted:#a3937a;--gold:#d4a84b;--gold2:#f0d58c;--line:#4a3b27;--card:#15100a;--crimson:#b8402f}*{box-sizing:border-box}body{margin:0;min-height:100vh;font:16px 'PT Sans',system-ui,sans-serif;color:var(--text);background:radial-gradient(ellipse 70% 50% at 50% 20%,#3a281226,transparent 70%),var(--bg);box-shadow:inset 0 0 200px #000;border-top:7vh solid var(--ink);border-bottom:7vh solid var(--ink)}body::after{content:'';position:fixed;inset:0;pointer-events:none;opacity:.08;background-image:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 .6 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")}main{max-width:600px;margin:5vh auto;padding:24px}.eyebrow{font:11px 'PT Mono',monospace;letter-spacing:.34em;color:var(--gold);text-transform:uppercase;margin:0}.eyebrow b{color:var(--crimson);font-weight:400}h1{font:700 clamp(32px,6vw,46px)/1.08 'PT Serif',Georgia,serif;margin:.35em 0 .2em}h1 em{color:var(--gold)}h2{font:700 20px 'PT Serif',Georgia,serif;margin:0 0 4px}p{color:var(--muted);line-height:1.7}section{background:var(--card);border:1px solid var(--line);border-radius:2px;padding:24px;margin:22px 0;box-shadow:inset 0 0 0 4px var(--card),inset 0 0 0 5px #2a2219}.ticket{-webkit-mask:radial-gradient(circle 13px at 0 50%,#0000 97%,#000) left/51% 100% no-repeat,radial-gradient(circle 13px at 100% 50%,#0000 97%,#000) right/51% 100% no-repeat;mask:radial-gradient(circle 13px at 0 50%,#0000 97%,#000) left/51% 100% no-repeat,radial-gradient(circle 13px at 100% 50%,#0000 97%,#000) right/51% 100% no-repeat;padding:26px 34px}.stub{display:flex;justify-content:space-between;gap:12px;font:10px 'PT Mono',monospace;letter-spacing:.25em;color:var(--gold);border-bottom:1px dashed var(--line);padding-bottom:12px;margin-bottom:4px}label{display:block;margin:18px 0 4px;font:11px 'PT Mono',monospace;letter-spacing:.2em;text-transform:uppercase;color:var(--muted)}input{display:block;width:100%;background:transparent;color:var(--text);border:0;border-bottom:1px solid var(--line);border-radius:0;padding:10px 2px;font:19px 'PT Serif',Georgia,serif}input:focus{outline:none;border-bottom-color:var(--gold)}button{background:var(--gold);color:#1a1206;border:0;border-radius:2px;padding:13px 22px;margin-top:22px;font:700 12px 'PT Sans',sans-serif;letter-spacing:.16em;text-transform:uppercase;cursor:pointer}button:hover{background:var(--gold2)}button:disabled{opacity:.5}button:focus-visible,a:focus-visible,input:focus-visible{outline:2px solid var(--gold);outline-offset:3px}.ghost{background:transparent;border:1px solid var(--line);color:var(--gold)}.ghost:hover{background:#d4a84b1f}#status,#code{color:var(--gold2);font:14px/1.6 'PT Mono',monospace;overflow-wrap:anywhere}a{color:var(--gold)}.foot{font:11px 'PT Mono',monospace;letter-spacing:.2em}table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:10px 4px;border-bottom:1px solid #2a2219}th{font:10px 'PT Mono',monospace;letter-spacing:.2em;color:var(--muted);text-transform:uppercase;font-weight:400}td:first-child{font-family:'PT Serif',Georgia,serif}td button{margin:0;padding:7px 12px;font-size:10px}.off{opacity:.5}.hidden{display:none}@media(max-width:520px){main{padding:18px;margin:3vh auto}section,.ticket{padding:20px}}@media(prefers-reduced-motion:reduce){*{transition:none!important}}";

const JOIN_HTML=`<!doctype html><html lang="kk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#0d0a07"><title>TULPAR AI — Классқа қосылу</title><style>${PAGE_STYLE}</style></head><body><main><p class="eyebrow"><b>●</b> TULPAR AI · Классқа кіру</p><h1>Классқа <em>қосылу</em></h1><p>Мұғалім берген Join Code кодын енгіз. API кілті немесе токен қажет емес.</p><section class="ticket"><div class="stub"><span>КЛАСС БИЛЕТІ</span><span>ADMIT ONE</span></div><form id="joinForm"><label for="studentName">Аты-жөнің</label><input id="studentName" required minlength="2" maxlength="80" autocomplete="name"><label for="joinCode">Класс коды (Join Code)</label><input id="joinCode" required minlength="6" maxlength="32" autocomplete="off" autocapitalize="characters"><button id="submit">Классқа қосылу</button></form><p id="status" role="status"></p></section><p class="foot"><a href="https://mustafa7677.github.io/AI/">← TULPAR AI</a></p></main><script>fetch("/api/me",{credentials:"same-origin"}).then(r=>r.json()).then(d=>{if(d.role==="student")document.getElementById("status").innerHTML='Сен классқа қосылғансың: <a href="/app/">TULPAR AI ашу →</a>'}).catch(()=>{});document.getElementById("joinForm").onsubmit=async function(e){e.preventDefault();const status=document.getElementById("status"),btn=document.getElementById("submit");btn.disabled=true;status.textContent="Қосылуда…";try{const res=await fetch("/api/class/join",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify({name:document.getElementById("studentName").value.trim(),code:document.getElementById("joinCode").value.trim().toUpperCase()})});const data=await res.json();if(!res.ok)throw Error(data.error||"Қосылу қатесі");const me=await fetch("/api/me",{credentials:"same-origin"}).then(r=>r.json());if(me.role!=="student")throw Error("Сессия сақталмады");status.textContent="✓ Классқа сәтті қосылдың!";location.href="/app/";}catch(err){status.textContent="⚠ "+err.message}finally{btn.disabled=false}};</script></body></html>`;

const ADMIN_HTML=`<!doctype html><html lang="kk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#0d0a07"><title>TULPAR AI — Super Admin</title><style>${PAGE_STYLE}</style></head><body><main><p class="eyebrow"><b>●</b> TULPAR AI · Super Admin</p><h1>Кластарды <em>басқару</em></h1><section id="login"><h2>Әкімші кіру</h2><form id="loginForm"><label for="password">Пароль</label><input id="password" type="password" autocomplete="current-password" required><button>Кіру</button></form></section><div id="dashboard" class="hidden"><section><h2>Жаңа класс ашу</h2><form id="classForm"><label for="className">Класс атауы</label><input id="className" maxlength="80" required placeholder="A017"><button>Класс ашу</button></form><p id="code"></p></section><section><h2>Кластар</h2><table><thead><tr><th>Класс</th><th>Оқушы</th><th>Күйі</th><th></th></tr></thead><tbody id="classes"></tbody></table></section><button id="logout" class="ghost">Шығу</button></div><p id="status" role="status"></p><p class="foot"><a href="/join">Оқушыларға кіру →</a></p></main><script>const $=id=>document.getElementById(id);async function api(path,opts={}){const r=await fetch(path,{credentials:"same-origin",headers:{"content-type":"application/json"},...opts});const d=await r.json();if(!r.ok)throw Error(d.error||"HTTP "+r.status);return d}async function load(){const d=await api("/api/admin/classes");const tb=$("classes");tb.replaceChildren();for(const c of d.classes){const tr=document.createElement("tr");if(!c.active)tr.className="off";for(const v of [c.name,String(c.students),c.active?"Белсенді":"Жабық"]){const td=document.createElement("td");td.textContent=v;tr.append(td)}const td=document.createElement("td"),b=document.createElement("button");b.textContent=c.active?"Жабу":"Ашу";b.onclick=async()=>{try{await api("/api/admin/classes/status",{method:"POST",body:JSON.stringify({id:c.id,active:!c.active})});await load()}catch(err){$("status").textContent=err.message}};td.append(b);tr.append(td);tb.append(tr)}}function show(){$("login").classList.add("hidden");$("dashboard").classList.remove("hidden");load().catch(err=>$("status").textContent=err.message)}api("/api/me").then(d=>{if(d.role==="admin")show()}).catch(()=>{});$("loginForm").onsubmit=async e=>{e.preventDefault();try{await api("/api/admin/login",{method:"POST",body:JSON.stringify({password:$("password").value})});$("password").value="";const d=await api("/api/me");if(d.role!=="admin")throw Error("Сессия сақталмады");show();$("status").textContent="Кіру сәтті"}catch(err){$("status").textContent=err.message}};$("classForm").onsubmit=async e=>{e.preventDefault();try{const d=await api("/api/admin/classes",{method:"POST",body:JSON.stringify({name:$("className").value})});$("code").textContent="Join Code: "+d.joinCode+" (кейін қайта көрсетілмейді)";$("status").textContent="Класс ашылды";await load()}catch(err){$("status").textContent=err.message}};$("logout").onclick=async()=>{await api("/api/logout",{method:"POST",body:"{}"}).catch(()=>{});location.reload()};</script></body></html>`;

/** Serve the existing TULPAR AI frontend first-party, gated by an active class session. */
async function serveApp(request,env,path){
 const file=path.slice("/app/".length)||"index.html";
 if(file==="join.html")return redirect(request,"/join");
 if(file==="admin.html")return redirect(request,"/admin");
 const type=APP_FILES[file];
 if(!type)return json({error:"Not found"},404);
 if(file==="index.html"){
  const me=await session(request,env);
  if(!me||me.role!=="student")return redirect(request,"/join");
 }
 const base=String(env.APP_SOURCE||DEFAULT_APP_SOURCE).replace(/\/?$/,"/");
 const upstream=await fetch(base+file,{cf:{cacheTtl:60}});
 if(!upstream.ok)return json({error:"App unavailable"},502);
 const headers={"content-type":type,"cache-control":file==="index.html"?"no-store":"no-cache","x-content-type-options":"nosniff","referrer-policy":"no-referrer","content-security-policy":APP_CSP};
 if(file!=="index.html")return new Response(upstream.body,{headers});
 const html=(await upstream.text()).replace(/<head>/i,'<head><meta name="tulpar-classroom" content="1">');
 return new Response(html,{headers});
}

export default {async fetch(request,env){
 const url=new URL(request.url),path=url.pathname;
 if(request.method==="GET"){
  if(path==="/join")return page(JOIN_HTML);
  if(path==="/admin")return page(ADMIN_HTML);
  if(path==="/"||path==="/app"||path==="/chat")return redirect(request,"/app/");
  if(path.startsWith("/app/")){try{return await serveApp(request,env,path)}catch{return json({error:"App unavailable"},502)}}
 }
 const origin=request.headers.get("origin");
 const ownOrigin=url.origin;
 const h=origin===ownOrigin?{}:cors(request,env);
 if(origin&&origin!==ownOrigin&&!h)return json({error:"Origin not allowed"},403);
 const responseHeaders=h||{};
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers:responseHeaders});
 try{
  if(path==="/api/class/join"&&request.method==="POST"){
   const body=await payload(request);
   const code=String(body.code||"").trim().toUpperCase();
   const displayName=String(body.name||"").trim().slice(0,80);
   if(!/^[A-Z0-9-]{6,32}$/.test(code)||displayName.length<2)return json({error:"Invalid class code or name"},400,responseHeaders);
   const cls=await env.DB.prepare("SELECT id FROM classes WHERE code_hash=? AND active=1").bind(await hex(code)).first();
   if(!cls)return json({error:"Class not found"},404,responseHeaders);
   const id=random(),token=random()+random(),expires=Date.now()+SESSION_MAX_AGE*1000;
   await env.DB.batch([
    env.DB.prepare("INSERT INTO users(id,class_id,display_name,role,active) VALUES(?,?,?,'student',1)").bind(id,cls.id,displayName),
    env.DB.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)").bind(await hex(token),id,expires)
   ]);
   return json({ok:true,role:"student"},200,{...responseHeaders,"set-cookie":setCookie(token)});
  }
  if(path==="/api/admin/login"&&request.method==="POST"){
   const body=await payload(request);
   const password=String(body.password||"");
   if(!env.ADMIN_PASSWORD||password.length<12||await hex(password)!==await hex(env.ADMIN_PASSWORD))return json({error:"Invalid admin credentials"},401,responseHeaders);
   const admin=await env.DB.prepare("SELECT id FROM users WHERE role='admin' AND active=1 LIMIT 1").first();
   if(!admin)return json({error:"Super Admin not initialized"},409,responseHeaders);
   const token=random()+random();
   await env.DB.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)").bind(await hex(token),admin.id,Date.now()+SESSION_MAX_AGE*1000).run();
   return json({ok:true,role:"admin"},200,{...responseHeaders,"set-cookie":setCookie(token)});
  }
  const me=await session(request,env);
  if(path==="/api/me"&&request.method==="GET")return json({authenticated:!!me,role:me?.role||null,name:me?.display_name||null,className:me?.role==="student"?me.class_name:null},200,responseHeaders);
  if(path==="/api/logout"&&request.method==="POST"){
   if(me)await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?").bind(me.token_hash).run();
   return json({ok:true},200,{...responseHeaders,"set-cookie":clearCookie});
  }
  if(!me)return json({error:"Join a class first"},401,responseHeaders);
  if(path==="/api/admin/classes"){
   if(me.role!=="admin")return json({error:"Admin only"},403,responseHeaders);
   if(request.method==="GET"){
    const {results}=await env.DB.prepare("SELECT c.id,c.name,c.active,(SELECT COUNT(*) FROM users u WHERE u.class_id=c.id AND u.role='student') AS students FROM classes c ORDER BY c.rowid DESC").all();
    return json({classes:(results||[]).map(c=>({id:c.id,name:c.name,active:!!c.active,students:Number(c.students)||0}))},200,responseHeaders);
   }
   if(request.method==="POST"){
    const body=await payload(request);const name=String(body.name||"").trim().slice(0,80);
    if(name.length<2)return json({error:"Invalid class name"},400,responseHeaders);
    const code=Array.from(crypto.getRandomValues(new Uint8Array(8)),x=>x.toString(16).padStart(2,"0")).join("").toUpperCase();
    const id=random();
    await env.DB.prepare("INSERT INTO classes(id,name,code_hash,active) VALUES(?,?,?,1)").bind(id,name,await hex(code)).run();
    return json({id,name,joinCode:code},201,responseHeaders);
   }
  }
  if(path==="/api/admin/classes/status"&&request.method==="POST"){
   if(me.role!=="admin")return json({error:"Admin only"},403,responseHeaders);
   const body=await payload(request);
   if(typeof body.id!=="string"||typeof body.active!=="boolean")return json({error:"Invalid request"},400,responseHeaders);
   const r=await env.DB.prepare("UPDATE classes SET active=? WHERE id=?").bind(body.active?1:0,body.id).run();
   if(!r?.meta?.changes)return json({error:"Class not found"},404,responseHeaders);
   return json({ok:true,id:body.id,active:body.active},200,responseHeaders);
  }
  if(path==="/api/chat"&&request.method==="POST"){
   if(me.role!=="student"||!me.class_id)return json({error:"Class membership required"},403,responseHeaders);
   const active=await env.DB.prepare("SELECT id FROM classes WHERE id=? AND active=1").bind(me.class_id).first();
   if(!active)return json({error:"Class inactive"},403,responseHeaders);
   if(!env.AI_GATEWAY||!env.TULPAR_ACCESS_TOKEN)return json({error:"AI gateway is not configured"},503,responseHeaders);
   const body=await payload(request);
   const messages=cleanMessages(body.messages);
   if(!messages)return json({error:"Invalid messages"},400,responseHeaders);
   if(limited(me.user_id))return json({error:"Too many requests, wait a minute"},429,responseHeaders);
   const upstream=await env.AI_GATEWAY.fetch("https://tulpar-internal/v1/chat",{method:"POST",headers:{"content-type":"application/json","origin":env.ALLOWED_ORIGIN,"authorization":`Bearer ${env.TULPAR_ACCESS_TOKEN}`,"x-tulpar-user":me.user_id},body:JSON.stringify({messages})});
   const type=upstream.headers.get("content-type")||"application/json";
   if(!upstream.ok){const text=await upstream.text().catch(()=>"");let error="AI gateway error";try{error=JSON.parse(text).error||error}catch{}return json({error},upstream.status===401||upstream.status===403?502:upstream.status,responseHeaders)}
   return new Response(upstream.body,{status:upstream.status,headers:{...responseHeaders,"content-type":type,"cache-control":"no-cache, no-transform","x-content-type-options":"nosniff"}});
  }
  return json({error:"Not found"},404,responseHeaders);
 }catch(e){return json({error:e?.status?e.message:"Request failed"},e?.status||500,responseHeaders)}
}};
