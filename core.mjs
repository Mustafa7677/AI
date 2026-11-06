/* TULPAR Core — original, offline multilingual assistant.
 * Transparent design: a trainable feature-based retrieval model + deterministic tools.
 * This is not a pretrained foundation language model.
 */
const SEEDS = [
 ['greeting','сәлем салем қалайсың ассалаумағалейкум сәлеметсіз бе','kk'],
 ['greeting','привет здравствуй добрый день как дела','ru'],
 ['greeting','hello hi good morning how are you','en'],
 ['identity','сен кімсің өзің туралы айт tulpar ai деген не','kk'],
 ['identity','кто ты расскажи о себе что ты умеешь','ru'],
 ['identity','who are you what can you do what is tulpar ai','en'],
 ['help','маған көмектес не істей аласың мүмкіндіктер','kk'],
 ['help','помоги что ты можешь делать возможности','ru'],
 ['help','help me what can you do features','en'],
 ['thanks','рахмет көп рахмет алғыс','kk'],
 ['thanks','спасибо благодарю большое спасибо','ru'],
 ['thanks','thanks thank you appreciate it','en'],
 ['ideas','маған жоба идеясы тақырып ұсын идея бер','kk'],
 ['ideas','предложи идеи проекта темы для исследования','ru'],
 ['ideas','give me project ideas suggest a research topic','en'],
 ['study','емтиханға дайындалу сабақ оқу оқу жоспары','kk'],
 ['study','как подготовиться к экзамену план учебы','ru'],
 ['study','help me study exam preparation study plan','en'],
 ['code','код жаз python javascript бағдарламалау','kk'],
 ['code','напиши код программирование пример javascript','ru'],
 ['code','write code programming example javascript python','en'],
 ['writing','мәтін жаз эссе жаз хат жаз','kk'],
 ['writing','напиши эссе текст письмо','ru'],
 ['writing','write an essay message email','en'],
 ['summary','мына мәтінді қысқаша мазмұнда түйінде','kk'],
 ['summary','сделай краткое содержание резюме текста','ru'],
 ['summary','summarize this text give summary','en'],
 ['translate','аударма аударып бер ағылшынша орысша қазақша','kk'],
 ['translate','переведи перевод на английский русский казахский','ru'],
 ['translate','translate into english russian kazakh','en'],
 ['date','бүгін қандай күн уақыт сағат неше','kk'],
 ['date','какая сегодня дата сколько времени','ru'],
 ['date','what is the date what time is it','en']
];
const S = {
 kk:{greeting:'Сәлем! Мен TULPAR Core — өзіміз жасаған жергілікті AI көмекшісімін. Есеп, мәтін, оқу және жеке естеліктермен көмектесе аламын.',identity:'Мен TULPAR Core. Менің қозғалтқышым — осы жобада жазылған шағын үйренетін мәтіндік модель, жады және есептеу құралдары. Мен үлкен тілдік модель емеспін, сондықтан күрделі сұрақтарға жауаптарым шектеулі.',help:'Мына мүмкіндіктер бар: математикалық өрнек есептеу; қысқаша мазмұндау; оқу жоспары; жоба идеялары; қарапайым код үлгілері; жергілікті жады; мәтіндік файлдан ақпарат табу. «Үйрет: сұрақ => жауап» деп жаңа жауап қоса аласың.',thanks:'Әрқашан көмектесуге дайынмын!',ideas:'Жоба идеялары: 1) Қазақша ашық білім платформасы; 2) студенттерге арналған жеке оқу күнтізбесі; 3) Қазақстандағы экологиялық көрсеткіштер картасы. Біреуін таңдасаң, мақсат пен алғашқы қадамдарды құрамыз.',study:'Оқу жоспары: 25 минут материалды түсіну → 5 минут үзіліс → 25 минут өз бетіңше есеп шығару → 10 минут қателерді талдау. Күн соңында негізгі бес ұғымды қайта айт.',code:'Мысалы, JavaScript-та екі санды қосу:\n```js\nfunction add(a, b) { return a + b; }\nconsole.log(add(2, 3));\n```',writing:'Мәтін жазуға кіріспе: алдымен тақырып, мақсат және оқырманды анықта. Содан кейін кіріспе, екі негізгі ой және қорытындыны құрастыр.',unknown:'Бұл сұраққа сенімді толық жауап бере алмаймын. Мен шағын жергілікті AI-мін. Тақырыпты нақтылап жаз, есеп сұра немесе «Үйрет: сұрақ => жауап» арқылы мені үйрет.',source:'Құжаттардан ұқсас үзінді таптым:',saved:'Есте сақтадым. Бұл ақпарат тек осы браузерде сақталады.',learned:'Жаңа жауапты үйрендім. Ол осы құрылғыда сақталады.',notunderstood:'Үйрету үлгісі: Үйрет: сұрақ => жауап',summary:'Қысқаша мазмұны:',date:'Қазір жергілікті уақыт:',math:'Нәтиже:',noSource:'Әзірге құжат жүктелмеген. TXT, MD, JSON, CSV немесе PDF файлын тірке.',translation:'Дәл аударма үшін толық тілдік модель қажет. Бұл нұсқа қарапайым мәтін талдаумен шектелген.'},
 ru:{greeting:'Привет! Я TULPAR Core — локальный помощник с собственным движком. Могу помогать с расчётами, учёбой, текстами и памятью.',identity:'Я TULPAR Core: небольшая обучаемая система поиска ответов, памяти и вычислений, написанная для этого проекта. Я не большая языковая модель, поэтому мои ответы ограничены.',help:'Могу вычислять выражения, делать краткие выдержки из текста, предлагать учебные планы, искать по загруженным документам и запоминать информацию. Добавь ответ командой «Научи: вопрос => ответ».',thanks:'Всегда пожалуйста!',ideas:'Идеи: 1) учебная платформа на казахском; 2) личный планировщик учёбы; 3) карта экологических показателей Казахстана. Могу помочь выбрать направление.',study:'План: 25 минут изучения → 5 минут перерыв → 25 минут практики → 10 минут разбора ошибок. В конце дня повтори пять ключевых идей.',code:'Пример на JavaScript:\n```js\nfunction add(a, b) { return a + b; }\nconsole.log(add(2, 3));\n```',writing:'Для текста сначала определи тему, цель и аудиторию. Затем составь введение, два основных тезиса и заключение.',unknown:'У меня пока нет надёжного ответа. Я небольшой локальный ИИ, а не большая языковая модель. Уточни вопрос либо научи меня: «Научи: вопрос => ответ».',source:'Я нашёл похожий фрагмент в документе:',saved:'Запомнил. Данные остаются только в этом браузере.',learned:'Запомнил новую пару вопрос–ответ на этом устройстве.',notunderstood:'Формат: Научи: вопрос => ответ',summary:'Краткое содержание:',date:'Местное время:',math:'Результат:',noSource:'Сначала загрузи TXT, MD, JSON, CSV или PDF.',translation:'Для точного перевода нужна более мощная языковая модель. В этой версии возможен лишь базовый анализ текста.'},
 en:{greeting:"Hello! I'm TULPAR Core, an original local assistant with its own lightweight engine. I can help with calculations, study plans, text and memory.",identity:"I'm TULPAR Core: a small, trainable retrieval system with memory and calculation tools, written for this project. I am not a large language model; my answers are limited.",help:'I can calculate expressions, summarise passages, suggest study plans, search uploaded documents and remember information. Teach me using “Teach: question => answer”.',thanks:"You're welcome!",ideas:'Project ideas: 1) a Kazakh open-learning platform; 2) a student study planner; 3) a map of environmental indicators in Kazakhstan. Choose one and I can help outline it.',study:'Study cycle: 25 minutes learning → 5-minute break → 25 minutes practising → 10 minutes reviewing mistakes. Recall five key concepts at the end.',code:'A small JavaScript example:\n```js\nfunction add(a, b) { return a + b; }\nconsole.log(add(2, 3));\n```',writing:'To write clearly, identify your topic, purpose and reader, then draft an introduction, two main ideas and a conclusion.',unknown:"I don't have a reliable full answer yet. I'm a small local AI, not a large language model. Try a more specific question or teach me with “Teach: question => answer”.",source:'I found a relevant passage in your document:',saved:'Saved. This information stays in your browser.',learned:'I have learnt a new answer on this device.',notunderstood:'Use: Teach: question => answer',summary:'Short summary:',date:'Local time:',math:'Result:',noSource:'Upload a TXT, MD, JSON, CSV or PDF document first.',translation:'Accurate translation requires a stronger language model. This build supports basic text analysis only.'}
};
function langOf(text, preferred='auto') {
 if(preferred!=='auto') return preferred;
 if(/[әғқңөұүһіӘҒҚҢӨҰҮҺІ]/u.test(text)) return 'kk';
 if(/[ыэъёщЫЭЪЁЩ]/u.test(text)) return 'ru';
 if(/[а-яА-Я]/u.test(text)) return /\b(сәлем|рахмет|маған|қалай|бүгін|есеп|мәтін|қазақ|үйрет|жады|сен|не|үшін|жаз|оқу)\b/iu.test(text)?'kk':'ru';
 return 'en';
}
const clean = s => String(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
function vector(text) {
 const s=clean(text);const v=new Map();
 for(const w of s.split(/\s+/).filter(Boolean)) {
   const features=[`w:${w}`]; const padded=`^${w}$`;
   for(let n=2;n<=3;n++) for(let i=0;i<=padded.length-n;i++)features.push(`g:${padded.slice(i,i+n)}`);
   for(const f of features)v.set(f,(v.get(f)||0)+(f.startsWith('w:')?3:1));
 }
 let norm=0;for(const n of v.values())norm+=n*n;norm=Math.sqrt(norm)||1;
 for(const [k,n] of v)v.set(k,n/norm);
 return v;
}
function cosine(a,b) {let s=0; const [x,y]=a.size<=b.size?[a,b]:[b,a];for(const [k,v] of x)s+=v*(y.get(k)||0);return s;}
function calculate(expression) {
 const input=expression.replace(/,/g,'.').replace(/[×·]/g,'*').replace(/[÷:]/g,'/').replace(/[−–]/g,'-').replace(/\s+/g,'');
 if(!input||input.length>180||!/^[0-9.+\-*/()%\^]+$/.test(input)) return null;
 const toks=input.match(/\d+(?:\.\d+)?|\.\d+|[+\-*/%^()]/g);
 if(!toks||toks.join('')!==input||toks.length>110)return null;
 let i=0;
 function atom(){const t=toks[i++];if(t==='-')return -atom();if(t==='+')return atom();if(t==='('){const r=expr();if(toks[i++]!==')')throw Error();return r;}if(!t||!/^\d*\.?\d+$/.test(t))throw Error();return +t;}
 function power(){let v=atom();if(toks[i]==='^'){i++;v=v**power();}return v;}
 function term(){let v=power();while(['*','/','%'].includes(toks[i])){let op=toks[i++],b=power();v=op==='*'?v*b:op==='/'?v/b:v%b;}return v;}
 function expr(){let v=term();while(['+','-'].includes(toks[i])){let op=toks[i++],b=term();v=op==='+'?v+b:v-b;}return v;}
 try{const result=expr();if(i!==toks.length||!Number.isFinite(result)||Math.abs(result)>1e20)return null;return +result.toPrecision(12);}catch{return null;}
}
function summarize(text, language) {
 const sentences=String(text).replace(/\s+/g,' ').match(/[^.!?。]+[.!?。]?/g)?.map(s=>s.trim()).filter(s=>s.length>15)||[];
 if(!sentences.length)return text.slice(0,380);
 const count=new Map();const stop=new Set('және мен бұл оның үшін или как что когда там тут тоже the and for are with from this that your have has you can they will'.split(' '));
 for(const word of clean(text).split(' '))if(word.length>3&&!stop.has(word))count.set(word,(count.get(word)||0)+1);
 return sentences.map((s,i)=>({s,i,rank:clean(s).split(' ').reduce((n,w)=>n+(count.get(w)||0),0)/Math.sqrt(s.length+1)})).sort((a,b)=>b.rank-a.rank).slice(0,Math.min(3,sentences.length)).sort((a,b)=>a.i-b.i).map(x=>x.s).join(' ');
}
const storage = () => {try{return localStorage;}catch{return null;}};
function load(key,defaultValue){try{return JSON.parse(storage()?.getItem('tulpar_'+key)||'null')??defaultValue;}catch{return defaultValue;}}
function save(key,value){try{storage()?.setItem('tulpar_'+key,JSON.stringify(value));}catch{}}
function makeId(){return (globalThis.crypto?.randomUUID?.()||`chat_${Date.now()}_${Math.random().toString(36).slice(2)}`);}
export class TulparCore {
 constructor(){this.preferred=load('lang','auto');this.examples=load('examples',[]);this.notes=load('notes',[]);this.documents=load('documents',[]);this.chats=load('chats',[]);this.current=load('current',null);this.seedVectors=SEEDS.map(([intent,text,lang])=>({intent,lang,v:vector(text)}));if(!this.chats.length)this.newChat();if(!this.chats.find(c=>c.id===this.current))this.current=this.chats[0].id;}
 persist(){save('examples',this.examples);save('notes',this.notes);save('documents',this.documents);save('chats',this.chats);save('current',this.current);save('lang',this.preferred);}
 newChat(){const chat={id:makeId(),title:'New chat',created:Date.now(),messages:[]};this.chats.unshift(chat);this.current=chat.id;this.persist();return chat;}
 chat(){return this.chats.find(c=>c.id===this.current)||this.chats[0];}
 selectChat(id){if(this.chats.some(c=>c.id===id)){this.current=id;this.persist();}}
 deleteChat(id){this.chats=this.chats.filter(c=>c.id!==id);if(!this.chats.length)this.newChat();else if(this.current===id)this.current=this.chats[0].id;this.persist();}
 clearMemory(){this.notes=[];this.examples=[];this.documents=[];this.persist();}
 async addDocument(file,text){const doc={id:makeId(),name:file.name||'document',text:String(text).slice(0,130000),created:Date.now()};this.documents.unshift(doc);this.documents=this.documents.slice(0,12);this.persist();return doc;}
 append(role,content){const chat=this.chat();chat.messages.push({id:makeId(),role,content,time:Date.now()});if(role==='user'&&chat.messages.filter(m=>m.role==='user').length===1)chat.title=content.slice(0,42);this.persist();}
 async reply(prompt){const input=String(prompt).trim().slice(0,15000),lang=langOf(input,this.preferred),s=S[lang],norm=clean(input);if(!input)return '';
 const teach=input.match(/^(?:үйрет|үйрен|научи|teach)\s*:\s*(.+?)\s*=>\s*([\s\S]+)$/i);
 if(teach){this.examples.push({question:teach[1].slice(0,800),answer:teach[2].slice(0,4000)});this.examples=this.examples.slice(-200);this.persist();return s.learned;}
 const remember=input.match(/^(?:есте сақта|запомни|remember)\s*:\s*([\s\S]+)/i);
 if(remember){this.notes.push(remember[1].slice(0,1500));this.notes=this.notes.slice(-80);this.persist();return s.saved;}
 if(/^(?:не есіңде|что ты помнишь|what do you remember|мен туралы не білесің)/i.test(input))return this.notes.length?this.notes.map((n,i)=>`${i+1}. ${n}`).join('\n'):s.unknown;
 const mathInput=input.match(/^(?:есепте|вычисли|посчитай|calculate|what is|сколько будет|қанша болады)\s*[:：]?\s*(.+)$/i)?.[1]||input;
 const result=calculate(mathInput.replace(/[?？]$/,''));if(result!==null)return `${s.math} ${result}`;
 const qv=vector(input);
 const matchLearned=this.examples.map(e=>({answer:e.answer,score:cosine(qv,vector(e.question))})).sort((a,b)=>b.score-a.score)[0];
 if(matchLearned?.score>0.66)return matchLearned.answer;
 const wantsDocs=/(?:құжат|файл|мәтінде|құжатта|document|file|uploaded|in the text|документ|файлда|қорытындыла|summarize|резюме|мазмұнда)/i.test(input);
 if(this.documents.length && wantsDocs){const docs=this.documents.flatMap(doc=>doc.text.match(/[^.!?\n]+[.!?]?/g)?.filter(x=>x.trim().length>24).slice(0,250).map(text=>({text,doc:doc.name,score:cosine(qv,vector(text))}))||[]).sort((a,b)=>b.score-a.score);if(docs.length){const top=docs[0];if(/(?:summary|summarize|мазмұнда|қысқаша|резюме|кратко)/i.test(input))return `${s.summary}\n${summarize(this.documents[0].text,lang)}`;if(top.score>0.15)return `${s.source}\n\n${top.text.trim().slice(0,650)}\n\n— ${top.doc}`;}}
 let match=this.seedVectors.map(e=>({...e,score:cosine(qv,e.v)+(e.lang===lang?0.025:0)})).sort((a,b)=>b.score-a.score)[0];
 if(/^(?:сәлем|салам|привет|hello|hi|hey)\b/i.test(input))match={intent:'greeting',score:1};
 if(match?.score>0.30){if(match.intent==='date')return `${s.date} ${new Date().toLocaleString(lang==='kk'?'kk-KZ':lang==='ru'?'ru-RU':'en-GB')}`;if(match.intent==='summary'){const following=input.replace(/^.*?(?:[:：]|\n)/s,'');if(following.length>70)return `${s.summary}\n${summarize(following,lang)}`;return s.noSource;}if(match.intent==='translate')return s.translation;return s[match.intent]||s.unknown;}
 if(this.notes.length){const best=this.notes.map(n=>({n,score:cosine(qv,vector(n))})).sort((a,b)=>b.score-a.score)[0];if(best.score>0.42)return best.n;}
 return s.unknown;
 }
}
export {calculate,langOf,vector,cosine,summarize};
