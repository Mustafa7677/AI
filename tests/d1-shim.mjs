/* Minimal Cloudflare D1 API shim over node:sqlite for local tests. */
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
export function createD1(schemaPath=new URL('../classroom/schema.sql',import.meta.url)){
 const db=new DatabaseSync(':memory:');db.exec(readFileSync(schemaPath,'utf8'));
 const stmt=(sql,args=[])=>({
  bind:(...a)=>stmt(sql,a),
  first:async()=>db.prepare(sql).get(...args)??null,
  all:async()=>({results:db.prepare(sql).all(...args)}),
  run:async()=>{const r=db.prepare(sql).run(...args);return {meta:{changes:Number(r.changes)}}},
  _exec(){return db.prepare(sql).run(...args)}
 });
 return {raw:db,prepare:sql=>stmt(sql),batch:async list=>{db.exec('BEGIN');try{const out=list.map(s=>s._exec());db.exec('COMMIT');return out}catch(e){db.exec('ROLLBACK');throw e}}};
}
