/* Validated, local-only chat backups: no HTML or executable data is interpreted. */
export function parseBackup(input){
 const data=typeof input==='string'?JSON.parse(input):input;
 if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Invalid backup format');
 if(!Array.isArray(data.chats)||data.chats.length>80)throw Error('Invalid chat list');
 const bounded=(value,max)=>typeof value==='string'?value.slice(0,max):'';
 const chats=data.chats.map((chat,index)=>{
  if(!chat||!Array.isArray(chat.messages)||chat.messages.length>300)throw Error('Invalid chat messages');
  const messages=chat.messages.map(m=>{
   if(!m||!['user','assistant'].includes(m.role)||typeof m.content!=='string'||m.content.length>15000)throw Error('Invalid message');
   return {id:bounded(m.id,100)||`imported_msg_${index}_${Math.random().toString(36).slice(2)}`,role:m.role,content:m.content,time:Number.isFinite(m.time)?m.time:Date.now()};
  });
  return {id:bounded(chat.id,100)||`imported_${index}_${Date.now()}`,title:bounded(chat.title,80)||'Imported chat',created:Number.isFinite(chat.created)?chat.created:Date.now(),messages};
 });
 const sourceExamples=Array.isArray(data.examples)?data.examples:[];
 if(sourceExamples.length>200)throw Error('Too many learned answers');
 const examples=sourceExamples.map(e=>({question:bounded(e?.question,800),answer:bounded(e?.answer,4000)})).filter(e=>e.question&&e.answer);
 const sourceNotes=Array.isArray(data.notes)?data.notes:[];
 if(sourceNotes.length>80)throw Error('Too many memories');
 const notes=sourceNotes.map(n=>bounded(n,1500)).filter(Boolean);
 const sourceDocs=Array.isArray(data.documents)?data.documents:[];
 if(sourceDocs.length>12)throw Error('Too many documents');
 const documents=sourceDocs.map((d,i)=>({id:bounded(d?.id,100)||`imported_doc_${i}`,name:bounded(d?.name,200)||'Document',text:bounded(d?.text,130000),created:Number.isFinite(d?.created)?d.created:Date.now()})).filter(d=>d.text);
 return {chats,examples,notes,documents};
}
