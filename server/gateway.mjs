/**
 * TULPAR AI Multi-Provider Gateway for Cloudflare Workers.
 * All provider credentials stay on this server, NEVER in GitHub Pages.
 * Failover occurs on timeouts, rate limits, upstream errors and empty streams.
 * After output begins, changing models would produce an incoherent answer;
 * instead an explicit interruption event is sent.
 */

const SYSTEM = `You are TULPAR AI, a helpful assistant for Kazakh, Russian, and English. Respond in the user's language unless asked otherwise. Explain reasoning and calculations carefully. Never claim to have used tools you cannot access. Be clear about uncertainty. You are served by a multi-provider model router.`;
const MAX_BODY = 65_536;
const MAX_TURNS = 24;
const MAX_MESSAGE = 12_000;
const cooldown = new Map(); // best effort across requests within each isolate

const REGISTRY = [
  {id:'groq', key:'GROQ_API_KEY', model:'GROQ_MODEL', defaultModel:'openai/gpt-oss-120b', url:'https://api.groq.com/openai/v1/chat/completions'},
  {id:'gemini', key:'GEMINI_API_KEY', model:'GEMINI_MODEL', defaultModel:'gemini-2.5-flash', protocol:'gemini'},
  {id:'openrouter', key:'OPENROUTER_API_KEY', model:'OPENROUTER_MODEL', defaultModel:'openrouter/free', url:'https://openrouter.ai/api/v1/chat/completions'},
  {id:'mistral', key:'MISTRAL_API_KEY', model:'MISTRAL_MODEL', defaultModel:'mistral-small-latest', url:'https://api.mistral.ai/v1/chat/completions'},
  {id:'deepseek', key:'DEEPSEEK_API_KEY', model:'DEEPSEEK_MODEL', defaultModel:'deepseek-chat', url:'https://api.deepseek.com/chat/completions'},
  {id:'openai', key:'OPENAI_API_KEY', model:'OPENAI_MODEL', defaultModel:'gpt-4.1-mini', url:'https://api.openai.com/v1/chat/completions'},
  {id:'together', key:'TOGETHER_API_KEY', model:'TOGETHER_MODEL', defaultModel:'meta-llama/Llama-3.3-70B-Instruct-Turbo', url:'https://api.together.xyz/v1/chat/completions'},
  {id:'cerebras', key:'CEREBRAS_API_KEY', model:'CEREBRAS_MODEL', defaultModel:'llama3.1-8b', url:'https://api.cerebras.ai/v1/chat/completions'},
  {id:'fireworks', key:'FIREWORKS_API_KEY', model:'FIREWORKS_MODEL', defaultModel:'accounts/fireworks/models/llama-v3p1-8b-instruct', url:'https://api.fireworks.ai/inference/v1/chat/completions'},
];

const encoder = new TextEncoder();
const json = (data, status=200, headers={}) => new Response(JSON.stringify(data), {status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers}});
export function listProviders(env){
  const available=REGISTRY.filter(p=>typeof env[p.key]==='string'&&env[p.key].trim());
  const priorities=String(env.MODEL_PRIORITY||'groq,gemini,openrouter,mistral,deepseek,openai,together,cerebras,fireworks').split(',').map(s=>s.trim().toLowerCase());
  const rank=new Map(priorities.map((p,i)=>[p,i]));
  return available.filter(p=>rank.has(p.id)).sort((a,b)=>rank.get(a.id)-rank.get(b.id)).map(p=>({...p,modelId:String(env[p.model]||p.defaultModel)}));
}
function corsHeaders(req,env){
  const origin=req.headers.get('origin');
  const allowed=String(env.ALLOWED_ORIGINS||'https://mustafa7677.github.io').split(',').map(s=>s.trim()).filter(Boolean);
  if(!origin || !allowed.includes(origin)) return null;
  return {'access-control-allow-origin':origin,'access-control-allow-methods':'GET, POST, OPTIONS','access-control-allow-headers':'content-type, authorization','access-control-max-age':'3600','vary':'Origin'};
}
function authorize(request,env){
  if(!env.TULPAR_ACCESS_TOKEN || String(env.TULPAR_ACCESS_TOKEN).length<16) return false;
  const provided=request.headers.get('authorization')||'';
  const expected=`Bearer ${env.TULPAR_ACCESS_TOKEN}`;
  // Avoid direct string early-exit comparisons for authentication tokens.
  const a=encoder.encode(provided),b=encoder.encode(expected);
  let diff=a.length^b.length;
  for(let i=0;i<Math.max(a.length,b.length);i++) diff |= (a[i]||0)^(b[i]||0);
  return diff===0;
}
function validateMessages(data){
  if(!data || !Array.isArray(data.messages)||!data.messages.length||data.messages.length>MAX_TURNS)throw Error('Invalid message history');
  const cleaned=data.messages.map(m=>{
    if(!m || !['user','assistant'].includes(m.role)||typeof m.content!=='string'||m.content.length>MAX_MESSAGE)throw Error('Invalid chat message');
    return {role:m.role,content:m.content};
  });
  if(cleaned.at(-1).role!=='user')throw Error('Last message must be a user message');
  if(cleaned.reduce((n,m)=>n+m.content.length,0)>50_000)throw Error('Chat history too long');
  return cleaned;
}
function cooldownProvider(p,code,retryHeader){
  const seconds=Number(retryHeader);
  const dateWait=retryHeader&&!Number.isFinite(seconds)?(Date.parse(retryHeader)-Date.now())/1000:NaN;
  const retry=Number.isFinite(seconds)&&seconds>0?seconds:dateWait;
  const secs=code===429?(Number.isFinite(retry)&&retry>0?Math.min(300,Math.ceil(retry)):45):[401,403].includes(code)?300:20;
  cooldown.set(p.id,Date.now()+secs*1000);
}
function openAIRequest(p,key,messages){
  return {url:p.url, init:{method:'POST',headers:{'content-type':'application/json','authorization':`Bearer ${key}`,...(p.id==='openrouter'?{'HTTP-Referer':'https://mustafa7677.github.io/AI/','X-Title':'TULPAR AI'}:{})},body:JSON.stringify({model:p.modelId,stream:true,temperature:0.65,messages:[{role:'system',content:SYSTEM},...messages]})}};
}
function geminiRequest(p,key,messages){
  return {url:`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(p.modelId)}:streamGenerateContent?alt=sse`,init:{method:'POST',headers:{'content-type':'application/json','x-goog-api-key':key},body:JSON.stringify({systemInstruction:{parts:[{text:SYSTEM}]},contents:messages.map(m=>({role:m.role==='assistant'?'model':'user',parts:[{text:m.content}]})),generationConfig:{temperature:0.65}})}};
}
/** Parse OpenAI-compatible and Gemini SSE without relying on chunk boundaries. */
export async function* parseModelStream(response,protocol='openai'){
  if(!response.body)throw new Error('Upstream response has no body');
  const reader=response.body.getReader();const decoder=new TextDecoder();let buffer='';
  try{
    for(;;){const {done,value}=await reader.read();buffer+=done?decoder.decode():decoder.decode(value,{stream:true});
      let pos;
      while((pos=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,pos).trimEnd();buffer=buffer.slice(pos+1);
        if(!line.startsWith('data:'))continue;
        const data=line.slice(5).trim();if(!data||data==='[DONE]')continue;
        let payload;try{payload=JSON.parse(data)}catch{continue}
        if(payload.error)throw Error('Provider reported an error');
        let text='';
        if(protocol==='gemini')text=(payload.candidates?.[0]?.content?.parts||[]).map(x=>x.text||'').join('');
        else {
          const delta=payload.choices?.[0]?.delta?.content;
          text=typeof delta==='string'?delta:Array.isArray(delta)?delta.map(x=>x.text||'').join(''):'';
          if(payload.choices?.[0]?.finish_reason==='error')throw Error('Provider stream ended with error');
        }
        if(text)yield text;
      }
      if(done)break;
    }
  }finally{reader.releaseLock();try{await reader.cancel()}catch{}}
}
export function resetProviderCooldowns(){cooldown.clear()}
export async function selectModel(env,messages,fetchFn=fetch){
  const providers=listProviders(env); if(!providers.length)return {error:'No model provider credentials configured',status:503};
  const errors=[];
  for(const p of providers){
    if((cooldown.get(p.id)||0)>Date.now()){errors.push({provider:p.id,reason:'cooldown'});continue}
    const controller=new AbortController();const timeoutMs=Math.max(3000,Math.min(60000,Number(env.MODEL_TIMEOUT_MS)||25000));
    const timer=setTimeout(()=>controller.abort(),timeoutMs);
    try{
      const req=p.protocol==='gemini'?geminiRequest(p,env[p.key],messages):openAIRequest(p,env[p.key],messages);
      const upstream=await fetchFn(req.url,{...req.init,signal:controller.signal});
      if(!upstream.ok){
        const code=upstream.status;cooldownProvider(p,code,upstream.headers.get('retry-after'));
        errors.push({provider:p.id,status:code});await upstream.body?.cancel().catch(()=>{});clearTimeout(timer);continue;
      }
      const iterator=parseModelStream(upstream,p.protocol)[Symbol.asyncIterator]();
      const first=await iterator.next();
      if(first.done||!first.value){errors.push({provider:p.id,reason:'empty response'});cooldownProvider(p,503);clearTimeout(timer);continue}
      clearTimeout(timer);
      const idleTimeoutMs=Math.max(10000,Math.min(180000,Number(env.STREAM_IDLE_TIMEOUT_MS)||45000));
      return {provider:p.id,model:p.modelId,first:first.value,iterator,controller,idleTimeoutMs,attempts:errors};
    }catch(e){
      errors.push({provider:p.id,reason:e?.name==='AbortError'?'timeout':'connection/stream error'});
      cooldownProvider(p,503);clearTimeout(timer);
    }
  }
  return {error:'All configured models are unavailable',status:503,attempts:errors};
}
function sse(event,data){return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)}
export function makeSSE(selected){
  let closed=false,idleTimer;
  const resetIdle=()=>{clearTimeout(idleTimer);idleTimer=setTimeout(()=>selected.controller.abort(),selected.idleTimeoutMs||45000)};
  return new ReadableStream({
    async start(controller){
      try{
        controller.enqueue(sse('model',{provider:selected.provider,model:selected.model,attempts:selected.attempts||[]}));
        controller.enqueue(sse('delta',{text:selected.first}));
        resetIdle();
        for await(const text of { [Symbol.asyncIterator]:()=>selected.iterator }){
          if(closed)break;
          controller.enqueue(sse('delta',{text}));resetIdle();
        }
        if(!closed)controller.enqueue(sse('done',{}));
      }catch{
        // Cannot switch after producing content: never splice two unrelated answers.
        if(!closed)controller.enqueue(sse('interrupted',{message:'Stream interrupted. Retry this message to try another model.'}));
      }finally{clearTimeout(idleTimer);selected.controller.abort();if(!closed){closed=true;controller.close()}}
    },
    cancel(){closed=true;clearTimeout(idleTimer);selected.controller.abort()}
  });
}
export async function handleRequest(request,env,fetchFn=fetch){
  const headers=corsHeaders(request,env);
  if(!headers)return json({error:'Origin not allowed'},403,{'vary':'Origin'});
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(!authorize(request,env))return json({error:'Access token required or invalid'},401,headers);
  const path=new URL(request.url).pathname.replace(/\/+$/,'');
  if(request.method==='GET' && path==='/health'){
    return json({status:'ready',engine:'TULPAR Multi-Model Router',providers:listProviders(env).map(p=>({name:p.id,model:p.modelId,available:(cooldown.get(p.id)||0)<=Date.now()}))},200,headers);
  }
  if(path!=='/v1/chat'||request.method!=='POST')return json({error:'Not found'},404,headers);
  const size=Number(request.headers.get('content-length')||0);
  if(size>MAX_BODY)return json({error:'Request too large'},413,headers);
  let messages;
  try{
    const raw=await request.text();if(raw.length>MAX_BODY)return json({error:'Request too large'},413,headers);
    messages=validateMessages(JSON.parse(raw));
  }catch(e){return json({error:e.message||'Invalid request body'},400,headers)}
  if(env.RATE_LIMITER){
    // Classroom Worker (already token-authorized) passes a per-student key.
    const ip=request.headers.get('x-tulpar-user')||request.headers.get('cf-connecting-ip')||'unknown';
    const {success}=await env.RATE_LIMITER.limit({key:ip});
    if(!success)return json({error:'Too many requests'},429,headers);
  }
  const selected=await selectModel(env,messages,fetchFn);
  if(selected.error)return json({error:selected.error,attempts:selected.attempts||[]},selected.status,headers);
  return new Response(makeSSE(selected),{status:200,headers:{...headers,'content-type':'text/event-stream; charset=utf-8','cache-control':'no-cache, no-transform','x-content-type-options':'nosniff'}});
}
export default {fetch(request,env){return handleRequest(request,env)}};
