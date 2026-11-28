import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {registerLearningRoutes} from './learning-sync.js';
function fixture(){
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec('CREATE TABLE Users(id INTEGER PRIMARY KEY); INSERT INTO Users VALUES(1),(2);');
  sqlite.exec(readFileSync(new URL('../migrations/0001_smart_learning.sql',import.meta.url),'utf8'));
  const db={
    prepare(sql){return {bind(...args){return {run:()=>sql.startsWith('SELECT')?{results:sqlite.prepare(sql).all(...args)}:sqlite.prepare(sql).run(...args),all:()=>({results:sqlite.prepare(sql).all(...args)})};}};},
    async batch(stmts){sqlite.exec('BEGIN');try{const result=stmts.map(s=>s.run());sqlite.exec('COMMIT');return result;}catch(e){sqlite.exec('ROLLBACK');throw e;}}
  };
  let post,get,exchange;
  registerLearningRoutes({post:(p,h)=>{if(p.endsWith('/exchange'))exchange=h;else post=h;},get:(_p,h)=>get=h});
  const call=(handler,uid,body,query={})=>handler({env:{DB:db},get:()=>({id:uid}),req:{text:async()=>JSON.stringify(body),query:k=>query[k]},header:()=>{},json:(body,status=200)=>({status,body})});
  return {exchange:(uid,subject,after,events)=>call(exchange,uid,{subject,after,events}),post:(uid,subject,events)=>call(post,uid,{subject,events}),get:(uid,subject,after=0)=>call(get,uid,null,{subject,after:String(after)}),sqlite};
}
const stamp=Date.parse('2026-01-01T00:00:00Z');
const event=(n,fields={})=>({id:'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),kind:'intro',questionId:'MG-'+n,at:stamp,day:'2026-01-01',...fields});
test('migration, idempotency, account and course isolation, incremental cursor',async()=>{
  const f=fixture();
  const a=event(1);
  assert.equal((await f.post(1,'maogai',[a,a])).status,200);
  assert.equal((await f.post(2,'maogai',[a])).status,200);
  const first=await f.get(1,'maogai');assert.equal(first.body.events.length,1);
  assert.equal((await f.get(1,'english-culture')).body.events.length,0);
  const b=event(2,{kind:'rate',rating:1,questionId:'MG-1',source:'practice'});
  await f.post(1,'maogai',[b]);
  const next=await f.get(1,'maogai',first.body.cursor);
  assert.deepEqual(next.body.events,[b]);
  assert.equal((await f.get(2,'maogai')).body.events.length,1);
  assert.equal((await f.get(1,'maogai',next.body.cursor)).body.events.length,0);
  f.sqlite.close();
});
test('invalid input rejects entire batch and unauthenticated access',async()=>{
  const f=fixture();
  assert.equal((await f.post(0,'maogai',[event(1)])).status,401);
  assert.equal((await f.post(1,'maogai',[event(1),event(2,{questionId:'RELICS-2'})])).status,400);
  assert.equal((await f.get(1,'maogai')).body.events.length,0);
  assert.equal((await f.post(1,'maogai',[event(3,{kind:'plan',plan:{exam:'2026-02-31',scope:'all',reserve:3}})])).status,400);
  const plan=event(4,{kind:'plan',plan:{exam:'2026-12-10',scope:'all',reserve:3,target:.95}});
  assert.equal((await f.post(1,'maogai',[plan])).status,200);
  assert.equal((await f.get(1,'maogai')).body.events[0].plan.target,.95);
  f.sqlite.close();
});
test('pagination returns every event without duplication',async()=>{
  const f=fixture();
  for(let i=0;i<5;i++)assert.equal((await f.post(1,'maogai',Array.from({length:50},(_,j)=>event(i*50+j+1)))).status,200);
  const first=await f.get(1,'maogai');
  assert.equal(first.body.events.length,200);assert.equal(first.body.more,true);
  const second=await f.get(1,'maogai',first.body.cursor);
  assert.equal(second.body.events.length,50);assert.equal(second.body.more,false);
  assert.equal(new Set([...first.body.events,...second.body.events].map(e=>e.id)).size,250);
  f.sqlite.close();
});

test('combined exchange uploads 50 events and pulls delta in the same request',async()=>{
  const f=fixture();const events=Array.from({length:50},(_,i)=>event(i+1));
  const res=await f.exchange(1,'maogai',0,events);
  assert.equal(res.status,200);assert.equal(res.body.ack.length,50);assert.equal(res.body.events.length,50);
  assert.equal(res.body.userId,1);
  const again=await f.exchange(1,'maogai',res.body.cursor,events);
  assert.equal(again.body.ack.length,50);assert.equal(again.body.events.length,0);
  const other=await f.exchange(2,'maogai',0,[]);assert.equal(other.body.events.length,0);
  const invalid=await f.exchange(1,'maogai',0,[event(51),event(52,{questionId:'RELICS-2'})]);assert.equal(invalid.status,400);
  assert.equal((await f.exchange(1,'maogai',res.body.cursor,[])).body.events.length,0);
  f.sqlite.close();
});
test('combined pagination never skips remote rows when uploads are interleaved',async()=>{
  const f=fixture();
  for(let i=0;i<5;i++)await f.post(1,'maogai',Array.from({length:50},(_,j)=>event(i*50+j+1)));
  const first=await f.exchange(1,'maogai',0,[event(251)]);
  assert.equal(first.body.events.length,200);assert.equal(first.body.more,true);assert.equal(first.body.ack.length,1);
  const second=await f.exchange(1,'maogai',first.body.cursor,[]);
  assert.equal(second.body.events.length,51);assert.equal(second.body.more,false);
  assert.equal(new Set([...first.body.events,...second.body.events].map(e=>e.id)).size,251);
  f.sqlite.close();
});
