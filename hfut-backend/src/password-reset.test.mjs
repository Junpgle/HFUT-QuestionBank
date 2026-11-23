import test from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';
import { registerPasswordResetRoutes, passwordResetInternals } from './password-reset.js';

function setup() {
  const users=[
    {id:1,email:'member@example.test',email_verified:1,password_hash:'old-hash',token_version:0},
    {id:2,email:'pending@example.test',email_verified:0,password_hash:'old-hash',token_version:0}
  ];
  const ipRate=new Map(),resets=new Map(),messages=[];
  const db={
    prepare(sql) {
      const normalized=sql.replace(/\s+/g,' ').trim();
      return { bind(...args) {
        async function first(){
          if(normalized.startsWith('SELECT requests FROM PasswordResetIpRate'))return ipRate.get(args[0])||null;
          if(normalized.startsWith('SELECT last_sent_at,window_start,window_count FROM PasswordResetRequests'))return resets.get(args[0])||null;
          if(normalized.startsWith('SELECT code_hash,expires_at,attempts FROM PasswordResetRequests'))return resets.get(args[0])||null;
          throw Error('unexpected first: '+normalized);
        }
        async function all(){
          if(normalized.startsWith('SELECT id,email FROM Users')||normalized.startsWith('SELECT id FROM Users')){
            return {results:users.filter(u=>u.email_verified===1&&u.email.toLowerCase()===args[0].toLowerCase()).map(u=>({id:u.id,email:u.email})).slice(0,2)};
          }
          throw Error('unexpected all: '+normalized);
        }
        async function run(){
          if(normalized.startsWith('INSERT INTO PasswordResetIpRate')){
            const [key,start]=args,row=ipRate.get(key);
            if(row&&row.window_start===start)row.requests++;
            else ipRate.set(key,{window_start:start,requests:1});
            return {meta:{changes:1}};
          }
          if(normalized.startsWith('INSERT INTO PasswordResetRequests')){
            const [id,code_hash,expires_at,last_sent_at,window_start,window_count]=args;
            resets.set(id,{code_hash,expires_at,last_sent_at,window_start,window_count,attempts:0});
            return {meta:{changes:1}};
          }
          if(normalized.startsWith('UPDATE PasswordResetRequests SET attempts')){
            const [id,max]=args,row=resets.get(id);
            if(row&&row.attempts<max){row.attempts++;return {meta:{changes:1}};}
            return {meta:{changes:0}};
          }
          if(normalized.startsWith('UPDATE Users SET password_hash')){
            const [newHash,id,resetId,expected,now,limit]=args;
            const row=resets.get(resetId),user=users.find(u=>u.id===id);
            if(user&&row&&id===resetId&&row.code_hash===expected&&row.expires_at>now&&row.attempts<limit){
              user.password_hash=newHash;user.token_version++;
              return {meta:{changes:1}};
            }
            return {meta:{changes:0}};
          }
          if(normalized.startsWith('DELETE FROM PasswordResetRequests')){
            const [id,hash]=args;
            if(resets.get(id)?.code_hash===hash)resets.delete(id);
            return {meta:{changes:1}};
          }
          throw Error('unexpected run: '+normalized);
        }
        return {first,all,run};
      }};
    },
    async batch(statements){const out=[];for(const stmt of statements)out.push(await stmt.run());return out;}
  };
  const app=new Hono();
  registerPasswordResetRoutes(app,{sendMail:async mail=>{messages.push(mail);return {data:{id:'unit-mail'}};}});
  async function call(path,data,ip='203.0.113.10'){
    const res=await app.request('http://test/api/password-reset/'+path,{
      method:'POST',headers:{'Content-Type':'application/json','cf-connecting-ip':ip},
      body:JSON.stringify(data)
    },{DB:db,JWT_SECRET:'unit-test-secret',RESEND_FROM_EMAIL:'noreply@example.test'});
    return {status:res.status,data:await res.json()};
  }
  const mailedCode=()=>{
    const match=messages.at(-1)?.html.match(/letter-spacing:6px;font-weight:bold">(\d{6})/);
    assert.ok(match,'test mail should contain a one-time code');return match[1];
  };
  return {call,messages,users,resets,ipRate,mailedCode};
}
test('validator rejects weak passwords, non-six-digit codes and malformed email',()=>{
  const x=passwordResetInternals;
  assert.equal(x.validPassword('weak'),false);
  assert.equal(x.validPassword('correct password 2026'),true);
  assert.equal(x.validCode('123456'),true);
  assert.equal(x.validCode('12345a'),false);
  assert.equal(x.validEmail('real@example.com'),true);
  assert.equal(x.validEmail('not-an-email'),false);
});
test('request is generic; verified accounts receive a single email per cooldown',async()=>{
  const f=setup();
  const unknown=await f.call('request',{email:'unknown@example.test'});
  const unverified=await f.call('request',{email:'pending@example.test'});
  const known=await f.call('request',{email:'member@example.test'});
  const repeat=await f.call('request',{email:'member@example.test'});
  assert.equal(unknown.status,200);
  assert.equal(unknown.data.message,known.data.message);
  assert.equal(unverified.data.message,known.data.message);
  assert.equal(repeat.data.message,known.data.message);
  assert.equal(f.messages.length,1);
  assert.equal(f.messages[0].to,'member@example.test');
  assert.ok(!JSON.stringify(f.resets.get(1)).includes(f.mailedCode()),'code must be HMAC hashed');
});
test('bad reset code is rejected; valid one changes password once and revokes prior JWT versions',async()=>{
  const f=setup();
  await f.call('request',{email:'member@example.test'});
  const code=f.mailedCode();
  const bad=await f.call('confirm',{email:'member@example.test',code:'111111'===code?'222222':'111111',newPassword:'new-secure-password'});
  assert.equal(bad.status,400);
  assert.equal(f.resets.get(1).attempts,1);
  const ok=await f.call('confirm',{email:'member@example.test',code,newPassword:'new-secure-password'});
  assert.equal(ok.status,200);
  assert.equal(ok.data.success,true);
  assert.equal(f.users[0].token_version,1);
  assert.notEqual(f.users[0].password_hash,'new-secure-password');
  assert.equal(f.resets.has(1),false);
  const replay=await f.call('confirm',{email:'member@example.test',code,newPassword:'another-password'});
  assert.equal(replay.status,400,'reset code is single use');
});
test('at most five failed code attempts; cannot brute force a 6 digit code',async()=>{
  const f=setup();
  await f.call('request',{email:'member@example.test'});
  const real=f.mailedCode();
  let bad='000000';if(bad===real)bad='000001';
  for(let i=0;i<5;i++)assert.equal((await f.call('confirm',{email:'member@example.test',code:bad,newPassword:'new-secure-password'})).status,400);
  const locked=await f.call('confirm',{email:'member@example.test',code:real,newPassword:'new-secure-password'});
  assert.equal(locked.status,400);
  assert.equal(f.users[0].token_version,0);
});
test('request throttles unknown email enumeration by hashed originating IP',async()=>{
  const f=setup();
  for(let i=0;i<12;i++)assert.equal((await f.call('request',{email:'absent'+i+'@example.test'})).status,200);
  assert.equal(f.ipRate.size,1);
  assert.equal(f.messages.length,0);
  assert.ok(!Array.from(f.ipRate.keys())[0].includes('203.0.113.10'));
});
