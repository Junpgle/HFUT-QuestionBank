import test from 'node:test';
import assert from 'node:assert/strict';
import {registerSiteSyncRoutes} from './site-sync.js';

function fixture() {
  const rows=new Map(), post=new Map(), del=new Map();
  const app={post:(p,h)=>post.set(p,h),delete:(p,h)=>del.set(p,h)};
  registerSiteSyncRoutes(app);
  const db={
    prepare(sql){
      return {bind(...args){
        return {
          async first(){
            if(!sql.includes('SELECT payload'))throw Error('unexpected first '+sql);
            const row=rows.get(args[0]);return row?structuredClone(row):null;
          },
          async run(){
            if(sql.startsWith('INSERT INTO SiteSyncState')){
              const [id,payload]=args;
              if(rows.has(id))return {meta:{changes:0}};
              rows.set(id,{payload,version:1});return {meta:{changes:1}};
            }
            if(sql.startsWith('UPDATE SiteSyncState')){
              const [payload,id,version]=args;
              const row=rows.get(id);
              if(!row||row.version!==version)return {meta:{changes:0}};
              row.payload=payload;row.version++;return {meta:{changes:1}};
            }
            if(sql.startsWith('DELETE FROM SiteSyncState')){
              rows.delete(args[0]);return {meta:{changes:1}};
            }
            throw Error('unexpected SQL '+sql);
          }
        };
      }};
    }
  };
  async function call(path,userId,body){
    const c={
      env:{DB:db},
      get:(key)=>key==='user'?{id:userId}:undefined,
      req:{
        header:name=>name.toLowerCase()==='content-length'?
          String(Buffer.byteLength(JSON.stringify(body||{}))):undefined,
        text:async()=>JSON.stringify(body||{}),
        json:async()=>body||{}
      },
      header:()=>{},
      json:(value,status=200)=>({status,body:value})
    };
    const route=post.get(path)||del.get(path);
    return route(c);
  }
  return {call,rows};
}
const q=(v,t,d)=>({v,t,d});
const reading=(updated,d,y=150)=>({percent:50,y,section:null,title:'计算机网络',updated,d});
test('independent accounts, concurrent optimistic merges, and LWW ordering',async()=>{
  const f=fixture(), endpoint='/api/site-sync/exchange';
  const a=await f.call(endpoint,1,{records:{net:{q1:q('wrong',1,'a')}},reading:{}});
  assert.equal(a.body.success,true);
  const b=await f.call(endpoint,1,{records:{net:{q2:q('right',2,'b')}},reading:{'#/net/deck/ch1':reading(3,'b')}});
  assert.deepEqual(Object.keys(b.body.records.net).sort(),['q1','q2']);
  assert.equal(b.body.reading['#/net/deck/ch1'].y,150);
  const c=await f.call(endpoint,2,{records:{net:{q1:q('right',4,'c')}}});
  assert.equal(c.body.records.net.q1.v,'right');
  assert.equal(f.rows.size,2);
  const older=await f.call(endpoint,1,{records:{net:{q1:q('right',0,'c')}}});
  assert.equal(older.body.records.net.q1.v,'wrong','older timestamp cannot overwrite');
  const newer=await f.call(endpoint,1,{records:{net:{q1:q('revealed',1,'z')}}});
  assert.equal(newer.body.records.net.q1.v,'revealed','deterministic tie on device ID');
});
test('course disable removes server data; re-enable allows fresh import',async()=>{
  const f=fixture(),ep='/api/site-sync/exchange',ctl='/api/site-sync/course';
  await f.call(ep,17,{records:{net:{q1:q('right',100,'a')},os:{q2:q('wrong',101,'a')}}});
  const disabled=await f.call(ctl,17,{course:'net',disabled:true,t:150,d:'a'});
  assert.equal(disabled.body.success,true);
  const blocked=await f.call(ep,17,{records:{net:{q1:q('right',110,'b')},os:{q3:q('right',111,'b')}},controls:{net:{disabled:false,t:130,d:'b'}}});
  assert.equal(blocked.body.controls.net.disabled,true);
  assert.equal(blocked.body.records.net,undefined);
  assert.ok(blocked.body.records.os.q3);
  const enabled=await f.call(ctl,17,{course:'net',disabled:false,t:200,d:'a'});
  assert.equal(enabled.body.control.disabled,false);
  const restored=await f.call(ep,17,{records:{net:{q1:q('right',110,'b')}}});
  assert.equal(restored.body.records.net.q1.v,'right');
});
test('delete is scoped to the signed-in account',async()=>{
  const f=fixture(),ep='/api/site-sync/exchange';
  await f.call(ep,1,{records:{net:{q1:q('right',1,'a')}}});
  await f.call(ep,2,{records:{net:{q1:q('wrong',2,'b')}}});
  const deleted=await f.call('/api/site-sync',1);
  assert.equal(deleted.status,200);
  assert.equal(f.rows.size,1);
  assert.equal(JSON.parse(f.rows.get(2).payload).records.net.q1.v,'wrong');
});
test('reject oversized payload and untrusted IDs',async()=>{
  const f=fixture();
  const huge=await f.call('/api/site-sync/exchange',1,{records:{net:{q1:q('right',2,'a')}},garbage:'x'.repeat(230000)});
  assert.equal(huge.status,413);
  const unauth=await f.call('/api/site-sync/exchange',0,{});
  assert.equal(unauth.status,401);
});
