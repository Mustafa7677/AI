/* TULPAR browser client: API keys never appear in the bundle. */
export function validEndpoint(value){
  try{const u=new URL(value);return u.protocol==='https:'||(u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname))}catch{return false}
}
function cleanEndpoint(endpoint){return endpoint.replace(/\/+$/,'')}
async function* eventStream(body){
  if(!body)throw new Error('Streaming response unavailable');
  const reader=body.getReader(),decoder=new TextDecoder();let buf='';let event='message',data=[];
  try{
    while(true){const {done,value}=await reader.read();buf+=done?decoder.decode():decoder.decode(value,{stream:true});
      let i;while((i=buf.indexOf('\n'))>=0){const line=buf.slice(0,i).replace(/\r$/,'');buf=buf.slice(i+1);
        if(!line.trim()){
          if(data.length){let payload;try{payload=JSON.parse(data.join('\n'))}catch{throw new Error('Invalid gateway event')};yield {event,payload}}
          event='message';data=[];
        }else if(line.startsWith('event:'))event=line.slice(6).trim();
        else if(line.startsWith('data:'))data.push(line.slice(5).trimStart());
      }
      if(done)break;
    }
    if(data.length){yield {event,payload:JSON.parse(data.join('\n'))}}
  }finally{reader.releaseLock()}
}
export async function streamChat({endpoint,token,classroom=false,messages,onModel=()=>{},onRoute=()=>{},onDelta=()=>{},signal,fetchFn=fetch}){
  if(!validEndpoint(endpoint))throw new Error('Secure gateway URL required (HTTPS)');
  // Classroom mode: same-origin HttpOnly session cookie; the server adds the gateway token.
  if(!classroom&&!token)throw new Error('Gateway access token required');
  const init=classroom
    ?{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({messages}),signal}
    :{method:'POST',headers:{'content-type':'application/json','authorization':'Bearer '+token},body:JSON.stringify({messages}),signal};
  const response=await fetchFn(cleanEndpoint(endpoint)+(classroom?'/api/chat':'/v1/chat'),init);
  if(!response.ok){let reason='';try{const e=await response.json();reason=e.error||''}catch{}const err=new Error(reason||`Gateway HTTP ${response.status}`);err.status=response.status;throw err}
  let responseText='',model='',complete=false;
  for await(const {event,payload} of eventStream(response.body)){
    if(event==='model'){model=`${payload.provider} · ${payload.model}`;onModel(model);onRoute({provider:payload.provider,model:payload.model,attempts:payload.attempts||[]})}
    else if(event==='delta'){const text=payload.text||'';responseText+=text;onDelta(text)}
    else if(event==='done'){complete=true;break}
    else if(event==='interrupted')throw new Error(payload.message||'AI stream interrupted');
  }
  if(!complete)throw new Error('AI stream ended unexpectedly');
  return {text:responseText,model};
}
export async function checkGateway({endpoint,token,fetchFn=fetch}){
  if(!validEndpoint(endpoint))throw new Error('Secure gateway URL required (HTTPS)');
  const response=await fetchFn(cleanEndpoint(endpoint)+'/health',{headers:{authorization:'Bearer '+token}});
  const body=await response.json();if(!response.ok)throw new Error(body.error||`HTTP ${response.status}`);return body;
}
