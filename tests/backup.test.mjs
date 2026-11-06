import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseBackup} from '../backup.mjs';
test('valid backup round-trip preserves chat and notes',()=>{
 const data={chats:[{id:'1',title:'Hello',messages:[{role:'user',content:'Сәлем',time:3}]}],notes:['My note'],examples:[],documents:[]};
 const parsed=parseBackup(JSON.stringify(data));
 assert.equal(parsed.chats[0].messages[0].content,'Сәлем');assert.equal(parsed.notes[0],'My note');
});
test('backup rejects non-chat roles and oversized content',()=>{
 assert.throws(()=>parseBackup({chats:[{messages:[{role:'system',content:'inject'}]}]}));
 assert.throws(()=>parseBackup({chats:[{messages:[{role:'user',content:'x'.repeat(15001)}]}]}));
});
test('backup enforces document and memory caps',()=>{
 assert.throws(()=>parseBackup({chats:[],notes:Array(81).fill('x')}));
 assert.throws(()=>parseBackup({chats:[],documents:Array(13).fill({text:'x'})}));
});
test('backup import strips unsupported fields and bounds title lengths',()=>{
 const d=parseBackup({chats:[{title:'A'.repeat(100),messages:[],script:'unsafe'}],other:'unknown'});
 assert.equal(d.chats[0].title.length,80);assert.equal('script' in d.chats[0],false);
});
