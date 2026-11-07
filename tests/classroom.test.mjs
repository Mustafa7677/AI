import {test,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import worker from '../classroom/worker.mjs';
import {handleRequest,resetProviderCooldowns} from '../server/gateway.mjs';
import {streamChat} from '../gateway-client.mjs';
import {createD1} from './d1-shim.mjs';

const W='https://tulpar-classroom.example';
const ACCESS='server-side-tulpar-access-token';
const PROVIDER_KEY='private-groq-provider-key';
let env,providerCalls,gatewayCalls;
const sse=text=>new Response(`data: ${JSON.stringify({choices:[{delta:{content:text}}]})}\n\ndata: [DONE]\n\n`,{headers:{'content-type':'text/event-stream'}});
beforeEach(()=>{
 resetProviderCooldowns();providerCalls=[];gatewayCalls=[];
 const gatewayEnv={TULPAR_ACCESS_TOKEN:ACCESS,GROQ_API_KEY:PROVIDER_KEY,MODEL_PRIORITY:'groq',ALLOWED_ORIGINS:'https://mustafa7677.github.io'};
 env={DB:createD1(),TULPAR_ACCESS_TOKEN:ACCESS,ADMIN_PASSWORD:'correct-horse-battery',ALLOWED_ORIGIN:'https://mustafa7677.github.io',
  // Service binding → the real gateway code with a mocked model provider.
  AI_GATEWAY:{fetch:(url,init)=>{const r=new Request(url,init);gatewayCalls.push(r.headers);return handleRequest(r,gatewayEnv,async(u,i)=>{providerCalls.push(i.headers.authorization);return sse('Сәлем, оқушы!')})}}};
 env.DB.raw.exec("INSERT INTO users(id,class_id,display_name,role,active) VALUES('admin1',NULL,'Super Admin','admin',1)");
});
const call=(path,{method='GET',body,cookie,origin=W}={})=>worker.fetch(new Request(W+path,{method,headers:{...(origin?{origin}:{}),...(cookie?{cookie}:{}),...(body?{'content-type':'application/json'}:{})},body:body&&JSON.stringify(body),redirect:'manual'}),env);
const cookieOf=r=>/tulpar_session=([^;]+)/.exec(r.headers.get('set-cookie'))?.[0];
async function adminCookie(){const r=await call('/api/admin/login',{method:'POST',body:{password:'correct-horse-battery'}});assert.equal(r.status,200);return cookieOf(r)}
async function newClass(name='SE-2601'){const c=await adminCookie();const r=await call('/api/admin/classes',{method:'POST',body:{name},cookie:c});assert.equal(r.status,201);return {admin:c,...await r.json()}}
async function student(code){const r=await call('/api/class/join',{method:'POST',body:{name:'Айдана',code}});assert.equal(r.status,200);const sc=r.headers.get('set-cookie');assert.match(sc,/HttpOnly/);assert.match(sc,/Secure/);assert.match(sc,/SameSite=Lax/);return cookieOf(r)}
const chatBody={messages:[{role:'user',content:'Сәлем'}]};

test('unauthenticated and wrong-origin requests cannot reach the AI gateway',async()=>{
 assert.equal((await call('/api/chat',{method:'POST',body:chatBody})).status,401);
 assert.equal((await call('/api/chat',{method:'POST',body:chatBody,cookie:'tulpar_session=forged'})).status,401);
 assert.equal((await call('/api/chat',{method:'POST',body:chatBody,origin:'https://evil.example'})).status,403);
 assert.equal((await call('/api/class/join',{method:'POST',body:{name:'X Y',code:'NOPE1234'}})).status,404);
 assert.equal(gatewayCalls.length,0);
});
test('admin password and admin-only routes',async()=>{
 assert.equal((await call('/api/admin/login',{method:'POST',body:{password:'wrong-password-123'}})).status,401);
 const {joinCode}=await newClass();const s=await student(joinCode);
 assert.equal((await call('/api/admin/classes',{method:'POST',body:{name:'Hack'},cookie:s})).status,403);
 assert.equal((await call('/api/admin/classes',{cookie:s})).status,403);
 const admin=await adminCookie();
 assert.equal((await call('/api/chat',{method:'POST',body:chatBody,cookie:admin})).status,403);
});
test('enrolled student streams AI answer; tokens and keys stay server-side',async()=>{
 const {joinCode}=await newClass();const s=await student(joinCode.toLowerCase());
 const me=await (await call('/api/me',{cookie:s})).json();
 assert.deepEqual(me,{authenticated:true,role:'student',name:'Айдана',className:'SE-2601'});
 const r=await call('/api/chat',{method:'POST',body:{messages:[{role:'user',content:'Сәлем',extra:'x'}]},cookie:s});
 assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/event-stream/);
 const text=await r.text();
 assert.match(text,/event: model/);assert.match(text,/Сәлем, оқушы!/);assert.match(text,/event: done/);
 assert.ok(!text.includes(ACCESS)&&!text.includes(PROVIDER_KEY));
 assert.equal(gatewayCalls[0].get('authorization'),'Bearer '+ACCESS);
 assert.equal(providerCalls[0],'Bearer '+PROVIDER_KEY);
});
test('browser client classroom mode streams via /api/chat without a token',async()=>{
 const {joinCode}=await newClass();const s=await student(joinCode);let seen;
 const fetchFn=(url,init)=>{seen={url,init};return worker.fetch(new Request(url,{...init,headers:{...init.headers,cookie:s,origin:W}}),env)};
 const deltas=[];const out=await streamChat({endpoint:W,classroom:true,messages:chatBody.messages,onDelta:d=>deltas.push(d),fetchFn});
 assert.equal(seen.url,W+'/api/chat');assert.equal(seen.init.credentials,'same-origin');assert.equal(seen.init.headers.authorization,undefined);
 assert.equal(out.text,'Сәлем, оқушы!');assert.deepEqual(deltas,['Сәлем, оқушы!']);
 await assert.rejects(streamChat({endpoint:W,classroom:true,messages:chatBody.messages,fetchFn:(u,i)=>worker.fetch(new Request(u,i),env)}),e=>e.status===401);
});
test('closing a class revokes student AI access; reopening restores it',async()=>{
 const {joinCode,id,admin}=await newClass();const s=await student(joinCode);
 const list=await (await call('/api/admin/classes',{cookie:admin})).json();
 assert.deepEqual(list.classes,[{id,name:'SE-2601',active:true,students:1}]);
 assert.equal((await call('/api/admin/classes/status',{method:'POST',body:{id,active:false},cookie:admin})).status,200);
 assert.equal((await call('/api/chat',{method:'POST',body:chatBody,cookie:s})).status,401);
 assert.equal((await (await call('/api/me',{cookie:s})).json()).authenticated,false);
 assert.equal((await call('/api/class/join',{method:'POST',body:{name:'Жаңа',code:joinCode}})).status,404);
 await call('/api/admin/classes/status',{method:'POST',body:{id,active:true},cookie:admin});
 assert.equal((await call('/api/chat',{method:'POST',body:chatBody,cookie:s})).status,200);
});
test('logout deletes the session',async()=>{
 const {joinCode}=await newClass();const s=await student(joinCode);
 const r=await call('/api/logout',{method:'POST',body:{},cookie:s});assert.match(r.headers.get('set-cookie'),/Max-Age=0/);
 assert.equal((await call('/api/chat',{method:'POST',body:chatBody,cookie:s})).status,401);
});
test('invalid messages and oversized bodies are rejected before the gateway',async()=>{
 const {joinCode}=await newClass();const s=await student(joinCode);
 assert.equal((await call('/api/chat',{method:'POST',body:{messages:[{role:'system',content:'x'}]},cookie:s})).status,400);
 assert.equal((await call('/api/chat',{method:'POST',body:{messages:[{role:'user',content:'x'.repeat(70000)}]},cookie:s})).status,413);
 assert.equal(gatewayCalls.length,0);
});
test('/app serves TULPAR UI first-party only to enrolled students',async()=>{
 const realFetch=globalThis.fetch;const fetched=[];
 globalThis.fetch=async url=>{fetched.push(String(url));return new Response(String(url).endsWith('index.html')?'<!doctype html><html><head><title>T</title></head></html>':'export{}')};
 try{
  let r=await call('/app/',{origin:null});assert.equal(r.status,302);assert.equal(r.headers.get('location'),W+'/join');
  assert.equal((await call('/chat',{origin:null})).headers.get('location'),W+'/app/');
  const {joinCode}=await newClass();const s=await student(joinCode);
  r=await call('/app/',{cookie:s,origin:null});assert.equal(r.status,200);
  const html=await r.text();assert.match(html,/<meta name="tulpar-classroom" content="1">/);
  assert.match(r.headers.get('content-security-policy'),/connect-src 'self'/);
  r=await call('/app/app.js',{origin:null});assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/javascript/);
  assert.equal((await call('/app/sw.js',{origin:null})).status,404);
  assert.equal((await call('/app/join.html',{origin:null})).headers.get('location'),W+'/join');
  assert.deepEqual(fetched,['https://mustafa7677.github.io/AI/index.html','https://mustafa7677.github.io/AI/app.js']);
 }finally{globalThis.fetch=realFetch}
});
