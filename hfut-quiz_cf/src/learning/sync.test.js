import test from 'node:test';
import assert from 'node:assert/strict';
import {nextSyncAt,shouldSync,retryDelay} from './sync-policy.js';
import {exchangePages} from './sync-transport.js';
const t=1000000;
const events=(n,at=t)=>Array.from({length:n},(_,i)=>({id:String(i+1),at}));
test('no polling, entry cooldown and manual override',()=>{
  const data={events:[],lastSyncAt:t};
  assert.equal(nextSyncAt(data,t+1000),null);
  assert.equal(shouldSync(data,'timer',t+1000000),false);
  assert.equal(shouldSync(data,'exit',t+1000000),false);
  assert.equal(shouldSync(data,'enter',t+1000),false);
  assert.equal(shouldSync(data,'enter',t+300000),true);
  assert.equal(shouldSync(data,'manual',t+1000),true);
});
test('idle debounce, hard deadline, threshold, backoff',()=>{
  assert.equal(nextSyncAt({events:events(1)},t),t+30000);
  assert.equal(nextSyncAt({events:[...events(1),{id:'2',at:t+29000}]},t+29000),t+59000);
  assert.equal(nextSyncAt({events:[...events(1),{id:'2',at:t+290000}]},t+290000),t+300000);
  assert.equal(nextSyncAt({events:events(50)},t),t);
  assert.equal(nextSyncAt({events:events(50),retryAt:t+60000},t),t+60000);
  assert.equal(shouldSync({events:events(1),retryAt:t+60000},'exit',t),false);
  assert.equal(retryDelay(1),30000);assert.equal(retryDelay(2),60000);assert.equal(retryDelay(50),1800000);
});
test('one exchange request for ordinary batch, no separate GET',async()=>{
  const calls=[],checkpoints=[];
  await exchangePages({data:{events:events(10),cursor:5},subject:'maogai',uid:1,
    request:async(path,method,body)=>{calls.push({path,method,body});return {success:true,userId:1,ack:body.events.map(e=>e.id),events:[],cursor:5,more:false};},
    checkpoint:async x=>checkpoints.push(x)});
  assert.equal(calls.length,1);assert.equal(calls[0].path,'/learning/exchange');assert.equal(checkpoints[0].complete,true);
});
test('combined multi-batch and pull pagination',async()=>{
  const calls=[];
  await exchangePages({data:{events:events(101),cursor:0},subject:'maogai',uid:1,
    request:async(_p,_m,b)=>{calls.push(b);return {success:true,userId:1,ack:b.events.map(e=>e.id),events:[],cursor:b.after+1,more:calls.length<2};},
    checkpoint:async()=>{}});
  assert.deepEqual(calls.map(x=>x.events.length),[50,50,1]);assert.deepEqual(calls.map(x=>x.after),[0,1,2]);
});
test('fallback only for missing endpoint and checkpoint successful legacy upload before failed pull',async()=>{
  const calls=[],checkpoints=[];
  await assert.rejects(exchangePages({data:{events:events(1)},subject:'maogai',uid:1,request:async(path)=>{
    calls.push(path);
    if(path==='/learning/exchange')throw Object.assign(Error('not found'),{status:404});
    if(path==='/learning/events')return {success:true,userId:1};
    throw Error('network');
  },checkpoint:async x=>checkpoints.push(x)}));
  assert.equal(calls.length,3);assert.equal(checkpoints.length,1);assert.equal(checkpoints[0].ack.length,1);
  const rejected=[];
  await assert.rejects(exchangePages({data:{events:events(1)},subject:'maogai',uid:1,request:async(path)=>{rejected.push(path);throw Object.assign(Error('db'),{status:500});},checkpoint:async()=>{}}));
  assert.equal(rejected.length,1);
});
test('wrong account or missing acknowledgement must never commit a checkpoint',async()=>{
  for(const reply of [{success:true,userId:2,ack:['1'],events:[],cursor:0},{success:true,userId:1,ack:[],events:[],cursor:0}]){
    let committed=false;
    await assert.rejects(exchangePages({data:{events:events(1)},subject:'maogai',uid:1,request:async()=>reply,checkpoint:async()=>{committed=true;}}));
    assert.equal(committed,false);
  }
});
