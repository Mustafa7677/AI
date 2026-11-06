import {TulparCore} from './core.mjs';
import {streamChat,checkGateway,validEndpoint} from './gateway-client.mjs';
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
function renderHistory(){const parent=$('history');parent.replaceChildren();for(const chat of ai.chats){const row=elt('div','history-item'+(chat.id===ai.current?' selected':''));const btn=elt('button','history-item',`◷   ${chat.title}`);btn.title=chat.title;btn.style.flex='1';btn.style.minWidth='0';btn.style.textAlign='left';btn.onclick=()=>{ai.selectChat(chat.id);render();closeSidebar()};const del=elt('button','delete','×');del.title='Delete chat';del.setAttribute('aria-label','Delete chat');del.onclick=()=>{ai.deleteChat(chat.id);render()};row.append(btn,del);parent.appendChild(row);}}
function addBubble(role,content){const row=elt('div','message '+role);if(role==='assistant'){const avatar=elt('div','avatar');const img=document.createElement('img');img.src='./icon.svg';img.alt='TULPAR';avatar.append(img);row.appendChild(avatar);}const body=elt('div','content',content);row.append(body);$('messages').appendChild(row);$('conversation').scrollTop=$('conversation').scrollHeight;return body}
function render(){renderHistory();const list=ai.chat()?.messages||[];$('welcome').hidden=list.length>0;$('messages').replaceChildren();for(const msg of list)addBubble(msg.role,msg.content);$('conversation').scrollTop=$('conversation').scrollHeight;updateStats();}
function updateStats(){$('stats').textContent=`${ai.chats.length} chats · ${ai.examples.length} learned answers · ${ai.documents.length} documents · ${ai.notes.length} memories`;}
let busy=false;
let gateway=localStorage.getItem('tulpar_gateway_url')||'';
let accessToken=sessionStorage.getItem('tulpar_gateway_access')||'';
let aiMode=localStorage.getItem('tulpar_ai_mode')||'auto';
function setBadge(text){$('modelBadge').textContent=text||'● TULPAR CORE'}
function syncGatewaySettings(){$('gatewayUrl').value=gateway;$('gatewayToken').value=accessToken;$('aiMode').value=aiMode;setBadge(gateway&&aiMode!=='local'?'● AUTO MODELS':'● TULPAR CORE')}
async function send(text){
 text=(text??$('prompt').value).trim();if(!text||busy)return;
 busy=true;$('prompt').value='';resize();$('welcome').hidden=true;ai.append('user',text);addBubble('user',text);
 const bubble=addBubble('assistant',t('thinking'));renderHistory();
 try{
  const useCloud=aiMode!=='local'&&gateway;
  if(useCloud){
   let partial='';
   try{
    const messages=(ai.chat()?.messages||[]).slice(-20).map(({role,content})=>({role,content}));
    const result=await streamChat({endpoint:gateway,token:accessToken,messages,
      onModel:model=>setBadge('● '+model),
      onDelta:delta=>{partial+=delta;bubble.textContent=partial;$('conversation').scrollTop=$('conversation').scrollHeight}});
    bubble.textContent=result.text;ai.append('assistant',result.text);return;
   }catch(error){
    if(partial){bubble.textContent=partial+'\n\n⚠ '+error.message;ai.append('assistant',bubble.textContent);return}
    if(aiMode==='cloud')throw error;
    const localReply=await ai.reply(text);
    bubble.textContent='⚠ Cloud unavailable ('+error.message+'). Local TULPAR Core:\n\n'+localReply;
    ai.append('assistant',bubble.textContent);setBadge('● LOCAL FALLBACK');return;
   }
  }
  if(aiMode==='cloud')throw Error('Cloud mode requires a gateway URL and access token in settings');
  const reply=await ai.reply(text);bubble.textContent=reply;ai.append('assistant',reply);setBadge('● TULPAR CORE');
 }catch(e){bubble.textContent='⚠ '+(e?.message||String(e))}
 finally{busy=false;$('conversation').scrollTop=$('conversation').scrollHeight}
}

function resize(){const n=$('prompt');n.style.height='auto';n.style.height=Math.min(n.scrollHeight,145)+'px'}
$('composer').addEventListener('submit',e=>{e.preventDefault();send()});$('prompt').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}});$('prompt').addEventListener('input',resize);
$('newChat').onclick=()=>{ai.newChat();render();closeSidebar();$('prompt').focus()};$('lang').onchange=e=>{ai.preferred=e.target.value;ai.persist();setLanguage()};document.querySelectorAll('.suggestions button').forEach(b=>b.onclick=()=>send(b.dataset.prompt));
function closeSidebar(){$('sidebar').classList.remove('open');$('overlay').classList.remove('active')}$('menu').onclick=()=>{$('sidebar').classList.add('open');$('overlay').classList.add('active')};$('closeSidebar').onclick=closeSidebar;$('overlay').onclick=closeSidebar;
let light=localStorage.getItem('tulpar_theme')==='light';function setTheme(){document.body.classList.toggle('light',light);$('theme').textContent=light?'☀':'☾'}$('theme').onclick=()=>{light=!light;localStorage.setItem('tulpar_theme',light?'light':'dark');setTheme()};setTheme();
$('settingsOpen').onclick=()=>{$('settingsModal').hidden=false;closeSidebar();updateStats();syncGatewaySettings()};$('settingsClose').onclick=()=>{$('settingsModal').hidden=true};$('settingsModal').addEventListener('click',e=>{if(e.target===$('settingsModal'))$('settingsModal').hidden=true});
$('saveGateway').onclick=async()=>{
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
$('clearMemory').onclick=()=>{if(confirm(t('clearConfirm'))){ai.clearMemory();updateStats()}};$('clearChats').onclick=()=>{if(confirm(t('chatConfirm'))){ai.chats=[];ai.newChat();render()}};
$('export').onclick=()=>{const data=JSON.stringify({chats:ai.chats,examples:ai.examples,notes:ai.notes,documents:ai.documents},null,2);const url=URL.createObjectURL(new Blob([data],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='tulpar-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
$('attach').onclick=()=>$('fileInput').click();$('fileInput').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;if(f.size>5*1024*1024){alert(t('limit'));return;}let text;try{if(f.name.toLowerCase().endsWith('.pdf')){const pdfjs=await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs');pdfjs.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';const pdf=await pdfjs.getDocument({data:new Uint8Array(await f.arrayBuffer())}).promise;const pages=[];for(let i=1;i<=Math.min(pdf.numPages,60);i++){const p=await pdf.getPage(i);const c=await p.getTextContent();pages.push(c.items.map(x=>x.str||'').join(' '))}text=pages.join('\n')}else{text=await f.text()}if(!text.trim())throw Error('No text found');await ai.addDocument(f,text);$('fileChips').appendChild(elt('span','file-chip',`📄 ${f.name}`));updateStats();addBubble('assistant',`${t('attached')}: ${f.name}. ${text.length} characters.`)}catch(err){console.error(err);alert(t('badfile'))}finally{e.target.value=''}};
$('mic').onclick=()=>{const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SpeechRecognition){alert(t('mic'));return}const r=new SpeechRecognition();r.lang=uiLang()==='kk'?'kk-KZ':uiLang()==='ru'?'ru-RU':'en-US';r.interimResults=false;$('mic').classList.add('recording');r.onresult=e=>{$('prompt').value=e.results[0][0].transcript;resize()};r.onerror=()=>{$('mic').classList.remove('recording')};r.onend=()=>{$('mic').classList.remove('recording')};r.start()};
if('serviceWorker'in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js').catch(console.warn);
setLanguage();render();syncGatewaySettings();
