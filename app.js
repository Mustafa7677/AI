import {TulparCore} from './core.mjs';
import {streamChat,checkGateway,validEndpoint} from './gateway-client.mjs';
import {parseBackup} from './backup.mjs';
const ai=new TulparCore(), $=id=>document.getElementById(id);
const I={
 kk:{newchat:'Жаңа чат',history:'ТАРИХ',offline:'Жеке · құрылғыңызда',settings:'Параметрлер',headline1:'Ойыңды',headline2:'қанаттандыр.',intro:'TULPAR AI бірнеше бұлт моделін автоматты ауыстырады. Қосылым жоқта TULPAR Core жергілікті көмекші жұмыс істейді.',s1:'Сен кімсің?',s2:'Есеп шығарайық',s3:'Жоба идеялары',s4:'Оқу жоспары',disclaimer:'Cloud AI үшін қорғалған gateway қажет. Local TULPAR Core үлкен тілдік модель емес.',about:'TULPAR Core интернетсіз жұмыс істейді. Чаттар және үйреткен жауаптарыңыз осы браузерде сақталады.',export:'Чаттарды жүктеу (JSON)',clear:'Үйретілген жауаптар мен құжаттарды өшіру',clearChats:'Барлық чаттарды өшіру',placeholder:'TULPAR AI-ға жазыңыз...',thinking:'Ойланып жатыр...',attached:'Құжат қосылды',badfile:'Файлды оқу мүмкін болмады.',limit:'Файл 5 МБ-тан үлкен болмауы керек.',mic:'Бұл браузерде дауыс тану қолжетімсіз.',clearConfirm:'Үйретілген жауаптар мен құжаттарды өшіреміз бе?',chatConfirm:'Барлық чаттарды өшіреміз бе?'},
 ru:{newchat:'Новый чат',history:'ИСТОРИЯ',offline:'Приватно · на устройстве',settings:'Настройки',headline1:'Дай идеям',headline2:'крылья.',intro:'TULPAR AI автоматически переключает облачные модели. При отсутствии подключения доступен локальный TULPAR Core.',s1:'Кто ты?',s2:'Посчитаем',s3:'Идеи проектов',s4:'План учёбы',disclaimer:'Cloud AI требует защищённого gateway. Local TULPAR Core — не большая языковая модель.',about:'TULPAR Core работает локально. Чаты и обученные ответы хранятся в этом браузере.',export:'Скачать чаты (JSON)',clear:'Удалить изученные ответы и документы',clearChats:'Удалить все чаты',placeholder:'Спросите TULPAR AI...',thinking:'Думаю...',attached:'Документ добавлен',badfile:'Не удалось прочитать файл.',limit:'Файл не должен превышать 5 МБ.',mic:'Распознавание речи недоступно.',clearConfirm:'Удалить сохранённые ответы и документы?',chatConfirm:'Удалить все чаты?'},
 en:{newchat:'New chat',history:'HISTORY',offline:'Private · on your device',settings:'Settings',headline1:'Give ideas',headline2:'their wings.',intro:'TULPAR AI automatically switches between cloud models. Offline TULPAR Core stays available when needed.',s1:'Who are you?',s2:'Calculate',s3:'Project ideas',s4:'Study plan',disclaimer:'Cloud AI requires a secure gateway. Local TULPAR Core is not a large language model.',about:'TULPAR Core runs locally. Chats and taught responses stay in this browser.',export:'Export chats (JSON)',clear:'Erase learned responses and documents',clearChats:'Delete all chats',placeholder:'Message TULPAR AI...',thinking:'Thinking...',attached:'Document attached',badfile:'Could not read the file.',limit:'File must be smaller than 5 MB.',mic:'Speech recognition is not supported in this browser.',clearConfirm:'Erase saved responses and documents?',chatConfirm:'Delete all chats?'}
};
function uiLang(){return ai.preferred==='auto'?'kk':ai.preferred}
function t(key){return I[uiLang()][key]||key}
function setLanguage(){document.documentElement.lang=uiLang();document.querySelectorAll('[data-i]').forEach(n=>n.textContent=t(n.dataset.i));$('prompt').placeholder=t('placeholder');$('lang').value=ai.preferred;const prompts={kk:['Сәлем! Сен кімсің?','Есепте: (25 + 17) * 4','Маған жоба идеяларын ұсын','Маған оқу жоспарын құрастыр'],ru:['Привет! Кто ты?','Посчитай: (25 + 17) * 4','Предложи идеи проекта','Помоги подготовиться к экзамену'],en:['Hello! Who are you?','Calculate: (25 + 17) * 4','Give me project ideas','Help me study for an exam']};document.querySelectorAll('.suggestions button').forEach((n,i)=>n.dataset.prompt=prompts[uiLang()][i]);}
function elt(tag,className,text){const n=document.createElement(tag);if(className)n.className=className;if(text!==undefined)n.textContent=text;return n}
function renderHistory(){const parent=$('history');parent.replaceChildren();for(const chat of ai.chats){const row=elt('div','history-item'+(chat.id===ai.current?' selected':''));const btn=elt('button','history-item',`◷   ${chat.title}`);btn.title=chat.title;btn.style.flex='1';btn.style.minWidth='0';btn.style.textAlign='left';btn.onclick=()=>{stopReply();ai.selectChat(chat.id);render();closeSidebar()};const del=elt('button','delete','×');del.title='Delete chat';del.setAttribute('aria-label','Delete chat');del.onclick=()=>{stopReply();ai.deleteChat(chat.id);render()};row.append(btn,del);parent.appendChild(row);}}
function addBubble(role,content){const row=elt('div','message '+role);if(role==='assistant'){const avatar=elt('div','avatar');const img=document.createElement('img');img.src='./icon.svg';img.alt='TULPAR';avatar.append(img);row.appendChild(avatar);}const body=elt('div','content',content);row.append(body);$('messages').appendChild(row);$('conversation').scrollTop=$('conversation').scrollHeight;return body}
function render(){renderHistory();const list=ai.chat()?.messages||[];$('welcome').hidden=list.length>0;$('messages').replaceChildren();for(const msg of list)addBubble(msg.role,msg.content);$('conversation').scrollTop=$('conversation').scrollHeight;updateStats();$('retryLast').hidden=busy||list.at(-1)?.role!=='assistant';}
function updateStats(){$('stats').textContent=`${ai.chats.length} chats · ${ai.examples.length} learned answers · ${ai.documents.length} documents · ${ai.notes.length} memories`;}
let busy=false;
let inflightController=null;
// Served by the Classroom Worker at /app/: cloud AI goes through same-origin /api/chat (no token in the browser).
const CLASSROOM=!!document.querySelector('meta[name="tulpar-classroom"]');
let gateway=CLASSROOM?location.origin:(localStorage.getItem('tulpar_gateway_url')||'');
let accessToken=CLASSROOM?'':(sessionStorage.getItem('tulpar_gateway_access')||'');
let aiMode=localStorage.getItem('tulpar_ai_mode')||'auto';
function setBadge(text){$('modelBadge').textContent=text||'● TULPAR CORE'}
function syncGatewaySettings(){$('gatewayUrl').value=gateway;$('gatewayToken').value=accessToken;$('aiMode').value=aiMode;setBadge(gateway&&aiMode!=='local'?(CLASSROOM?'● CLASSROOM AI':'● AUTO MODELS'):'● TULPAR CORE')}
function setBusy(value){busy=value;$('stop').hidden=!value;$('sendButton').disabled=value;$('retryLast').hidden=value||ai.chat()?.messages.at(-1)?.role!=='assistant'}
function stopReply(){inflightController?.abort()}
$('stop').onclick=stopReply;
$('retryLast').onclick=()=>{
 if(busy)return;
 const chat=ai.chat(),messages=chat?.messages||[];
 if(messages.at(-1)?.role!=='assistant'||messages.at(-2)?.role!=='user')return;
 const last=messages.at(-2).content;
 messages.splice(-2,2);ai.persist();render();send(last);
};
async function send(text){
 text=(text??$('prompt').value).trim();if(!text||busy)return;
 const chatId=ai.chat().id;
 const requestController=new AbortController();inflightController=requestController;
 setBusy(true);$('routeStatus').textContent='';$('prompt').value='';resize();$('welcome').hidden=true;
 ai.append('user',text);addBubble('user',text);
 const bubble=addBubble('assistant',t('thinking'));renderHistory();
 function saveAssistant(answer){
  const chat=ai.chats.find(c=>c.id===chatId);
  if(!chat)return;
  chat.messages.push({id:crypto.randomUUID(),role:'assistant',content:answer,time:Date.now()});
  ai.persist();if(ai.current===chatId)renderHistory();
 }
 let partial='';
 try{
  const useCloud=aiMode!=='local'&&gateway;
  if(useCloud){
   try{
    const messages=(ai.chats.find(c=>c.id===chatId)?.messages||[]).slice(-20).map(({role,content})=>({role,content}));
    const result=await streamChat({endpoint:gateway,token:accessToken,classroom:CLASSROOM,messages,signal:requestController.signal,
      onModel:model=>setBadge('● '+model),
      onRoute:route=>{
       if(route.attempts?.length){const names=route.attempts.map(a=>`${a.provider} (${a.status||a.reason})`);
        $('routeStatus').textContent=`↪ ${names.join(' → ')} → ${route.provider}`;
       }else $('routeStatus').textContent=`✓ ${route.provider} · ${route.model}`;
      },
      onDelta:delta=>{if(requestController.signal.aborted)return;partial+=delta;bubble.textContent=partial;$('conversation').scrollTop=$('conversation').scrollHeight}});
    if(requestController.signal.aborted)throw new DOMException('Aborted','AbortError');
    bubble.textContent=result.text;saveAssistant(result.text);return;
   }catch(error){
    if(requestController.signal.aborted)throw error;
    if(partial){bubble.textContent=partial+'\n\n⚠ '+error.message;saveAssistant(bubble.textContent);return}
    if(CLASSROOM&&error.status===401){bubble.textContent='⚠ Класс сессиясы аяқталды. Қайта қосылыңыз: /join';saveAssistant(bubble.textContent);setTimeout(()=>location.assign('/join'),1500);return}
    if(aiMode==='cloud')throw error;
    const localReply=await ai.reply(text);
    if(requestController.signal.aborted)throw new DOMException('Aborted','AbortError');
    bubble.textContent='⚠ Cloud unavailable ('+error.message+'). Local TULPAR Core:\n\n'+localReply;
    saveAssistant(bubble.textContent);setBadge('● LOCAL FALLBACK');$('routeStatus').textContent='↪ Local TULPAR Core';return;
   }
  }
  if(aiMode==='cloud')throw Error('Cloud mode requires a gateway URL and access token in settings');
  const reply=await ai.reply(text);
  if(requestController.signal.aborted)throw new DOMException('Aborted','AbortError');
  bubble.textContent=reply;saveAssistant(reply);setBadge('● TULPAR CORE');$('routeStatus').textContent='✓ Local TULPAR Core';
 }catch(e){
  const aborted=requestController.signal.aborted;
  bubble.textContent=aborted?(partial?partial+'\n\n⏹ Stopped by user':'⏹ Stopped by user'):'⚠ '+(e?.message||String(e));
  saveAssistant(bubble.textContent);
 }finally{inflightController=null;setBusy(false);$('conversation').scrollTop=$('conversation').scrollHeight}
}

function resize(){const n=$('prompt');n.style.height='auto';n.style.height=Math.min(n.scrollHeight,145)+'px'}
$('composer').addEventListener('submit',e=>{e.preventDefault();send()});$('prompt').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}});$('prompt').addEventListener('input',resize);
$('newChat').onclick=()=>{stopReply();ai.newChat();render();closeSidebar();$('prompt').focus()};$('lang').onchange=e=>{ai.preferred=e.target.value;ai.persist();setLanguage()};document.querySelectorAll('.suggestions button').forEach(b=>b.onclick=()=>send(b.dataset.prompt));document.querySelectorAll('.quick-start-card').forEach(b=>b.onclick=()=>send(b.dataset.prompt));
function closeSidebar(){$('sidebar').classList.remove('open');$('overlay').classList.remove('active')}$('menu').onclick=()=>{$('sidebar').classList.add('open');$('overlay').classList.add('active')};$('closeSidebar').onclick=closeSidebar;$('overlay').onclick=closeSidebar;
let light=localStorage.getItem('tulpar_theme')==='light';function setTheme(){document.body.classList.toggle('light',light);$('theme').textContent=light?'☀':'☾'}$('theme').onclick=()=>{light=!light;localStorage.setItem('tulpar_theme',light?'light':'dark');setTheme()};setTheme();
$('settingsOpen').onclick=()=>{$('settingsModal').hidden=false;closeSidebar();updateStats();syncGatewaySettings()};$('settingsClose').onclick=()=>{$('settingsModal').hidden=true};$('settingsModal').addEventListener('click',e=>{if(e.target===$('settingsModal'))$('settingsModal').hidden=true});
$('saveGateway').onclick=async()=>{
 if(CLASSROOM){
  aiMode=$('aiMode').value;localStorage.setItem('tulpar_ai_mode',aiMode);syncGatewaySettings();
  const status=$('gatewayStatus');status.textContent='Checking classroom…';
  try{const me=await fetch('/api/me',{credentials:'same-origin'}).then(r=>r.json());status.textContent=me.role==='student'?'✓ 🎓 '+me.className+' · '+me.name+(aiMode==='local'?' · Local TULPAR Core':' · Classroom AI'):'✕ Классқа қайта қосылыңыз (/join)'}
  catch(e){status.textContent='✕ '+e.message}
  return;
 }
 const next=$('gatewayUrl').value.trim(),mode=$('aiMode').value,token=$('gatewayToken').value;
 const status=$('gatewayStatus');if(next&&!validEndpoint(next)){status.textContent='HTTPS gateway URL required';return}
 gateway=next;accessToken=token;aiMode=mode;
 localStorage.setItem('tulpar_gateway_url',gateway);localStorage.setItem('tulpar_ai_mode',aiMode);
 if(accessToken)sessionStorage.setItem('tulpar_gateway_access',accessToken);else sessionStorage.removeItem('tulpar_gateway_access');
 syncGatewaySettings();
 if(!gateway||aiMode==='local'){status.textContent='Local TULPAR Core available. Cloud disabled.';return}
 status.textContent='Checking gateway…';
 try{const data=await checkGateway({endpoint:gateway,token:accessToken});status.textContent='✓ Connected · '+(data.providers.length?data.providers.map(x=>x.name+' ('+x.model+')').join(' → '):'No API providers configured');}
 catch(e){status.textContent='✕ '+e.message}
};
$('clearMemory').onclick=()=>{if(confirm(t('clearConfirm'))){ai.clearMemory();updateStats()}};$('clearChats').onclick=()=>{if(confirm(t('chatConfirm'))){stopReply();ai.chats=[];ai.newChat();render()}};
$('export').onclick=()=>{const data=JSON.stringify({version:3,exportedAt:new Date().toISOString(),chats:ai.chats,examples:ai.examples,notes:ai.notes,documents:ai.documents},null,2);const url=URL.createObjectURL(new Blob([data],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='tulpar-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
$('importBackup').onclick=()=>$('backupInput').click();
$('backupInput').onchange=async event=>{
 const file=event.target.files?.[0];event.target.value='';if(!file)return;
 if(file.size>5*1024*1024){alert('Backup exceeds 5 MB');return}
 try{
  const imported=parseBackup(await file.text());
  if(!confirm('Replace existing local chats, memories and learned answers with the imported backup?'))return;
  stopReply();Object.assign(ai,imported);if(!ai.chats.length)ai.newChat();
  ai.current=ai.chats[0].id;ai.persist();render();$('settingsModal').hidden=true;
 }catch(error){alert('Import failed: '+error.message)}
};
$('attach').onclick=()=>$('fileInput').click();$('fileInput').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;if(f.size>5*1024*1024){alert(t('limit'));return;}let text;try{if(f.name.toLowerCase().endsWith('.pdf')){const pdfjs=await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs');pdfjs.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';const pdf=await pdfjs.getDocument({data:new Uint8Array(await f.arrayBuffer())}).promise;const pages=[];for(let i=1;i<=Math.min(pdf.numPages,60);i++){const p=await pdf.getPage(i);const c=await p.getTextContent();pages.push(c.items.map(x=>x.str||'').join(' '))}text=pages.join('\n')}else{text=await f.text()}if(!text.trim())throw Error('No text found');await ai.addDocument(f,text);$('fileChips').appendChild(elt('span','file-chip',`📄 ${f.name}`));updateStats();addBubble('assistant',`${t('attached')}: ${f.name}. ${text.length} characters.`)}catch(err){console.error(err);alert(t('badfile'))}finally{e.target.value=''}};
$('mic').onclick=()=>{const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SpeechRecognition){alert(t('mic'));return}const r=new SpeechRecognition();r.lang=uiLang()==='kk'?'kk-KZ':uiLang()==='ru'?'ru-RU':'en-US';r.interimResults=false;$('mic').classList.add('recording');r.onresult=e=>{$('prompt').value=e.results[0][0].transcript;resize()};r.onerror=()=>{$('mic').classList.remove('recording')};r.onend=()=>{$('mic').classList.remove('recording')};r.start()};
if(!CLASSROOM&&'serviceWorker'in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js').catch(console.warn);
function setupClassroom(){
 // Hide owner-only gateway URL/token fields; students never enter credentials.
 for(const id of ['gatewayUrl','gatewayToken']){const input=$(id);input.hidden=true;const label=document.querySelector(`label[for="${id}"]`);if(label)label.hidden=true}
 $('gatewayInfo').textContent='Classroom AI: мұғалімнің серверіндегі multi-model gateway. Токен немесе API кілті қажет емес. Local режимі — TULPAR Core.';
 $('saveGateway').textContent='Режимді сақтау';
 $('gatewayStatus').textContent='🎓 Classroom';
 const logout=elt('button','bottom-link','⎋ Класстан шығу');logout.id='classLogout';
 logout.onclick=async()=>{stopReply();await fetch('/api/logout',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:'{}'}).catch(()=>{});location.assign('/join')};
 document.querySelector('.sidebar-bottom').append(logout);
 fetch('/api/me',{credentials:'same-origin'}).then(r=>r.json()).then(me=>{
  if(me.role!=='student'){location.assign('/join');return}
  document.querySelector('.brand small').textContent='🎓 '+me.className;
  $('gatewayStatus').textContent='✓ 🎓 '+me.className+' · '+me.name;
 }).catch(()=>{});
}
if(CLASSROOM)setupClassroom();
setLanguage();render();syncGatewaySettings();
