/* Question-Bank account recovery used by the website and the Edge extension.
 * No password-reset code is stored in plaintext or returned to the client.
 * Independent of the registration activation code fields in Users. */
import bcrypt from 'bcryptjs';
import { Resend } from 'resend';

const GENERIC = '如果邮箱对应已验证的账号，验证码将发送到该邮箱，请注意查收。';
const CODE_LIFE_MS = 10 * 60 * 1000;
const RESEND_MS = 60 * 1000;
const WINDOW_MS = 60 * 60 * 1000;
const MAX_EMAILS_PER_USER = 3;
const MAX_REQUESTS_PER_IP = 10;
const MAX_GUESSES = 5;
const noStore = (c, body, status=200) => {
  c.header('Cache-Control', 'no-store');
  return c.json(body,status);
};
const generic = c => noStore(c,{success:true,message:GENERIC});
const validEmail = value => typeof value==='string' && value.length<=254 &&
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const validPassword = value => typeof value==='string' && value.length>=8 && value.length<=128;
const validCode = value => typeof value==='string' && /^\d{6}$/.test(value);

async function hmac(secret, value) {
  if(!secret)throw new Error('未配置 JWT_SECRET');
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),
    {name:'HMAC',hash:'SHA-256'},false,['sign']);
  const digest=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), b=>b.toString(16).padStart(2,'0')).join('');
}
function secureCode(){
  const sample=new Uint32Array(1);
  const ceiling=Math.floor(0x100000000/1000000)*1000000;
  do { crypto.getRandomValues(sample); } while(sample[0]>=ceiling);
  return String(sample[0]%1000000).padStart(6,'0');
}
function sameHash(a,b){
  if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;
  let diff=0;
  for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);
  return diff===0;
}
function resetReplyError(c){
  return noStore(c,{error:'验证码错误、已过期或尝试次数过多，请重新申请'},400);
}

export function registerPasswordResetRoutes(app,{sendMail}={}){
  // Request a verification code by bound email. Always respond identically
  // for unknown/unverified users to avoid account enumeration.
  app.post('/api/password-reset/request',async c=>{
    let email;
    try{
      const body=await c.req.json();
      email=typeof body?.email==='string'?body.email.trim():'';
    }catch{return noStore(c,{error:'无效请求'},400);}
    if(!validEmail(email))return noStore(c,{error:'请输入有效的邮箱地址'},400);
    try{
      const now=Date.now(),start=now-now%WINDOW_MS;
      const ip=c.req.header('cf-connecting-ip')||'unknown';
      const ipKey=await hmac(c.env.JWT_SECRET,'password-reset-ip:'+ip);
      await c.env.DB.prepare(`
        INSERT INTO PasswordResetIpRate(ip_hash,window_start,requests)
        VALUES(?,?,1)
        ON CONFLICT(ip_hash) DO UPDATE SET
          requests=CASE WHEN window_start<? THEN 1 ELSE requests+1 END,
          window_start=CASE WHEN window_start<? THEN excluded.window_start ELSE window_start END
      `).bind(ipKey,start,start,start).run();
      const rate=await c.env.DB.prepare(
        'SELECT requests FROM PasswordResetIpRate WHERE ip_hash=?'
      ).bind(ipKey).first();
      if((rate?.requests||0)>MAX_REQUESTS_PER_IP)return generic(c);

      const users=await c.env.DB.prepare(
        'SELECT id,email FROM Users WHERE lower(email)=lower(?) AND email_verified=1 LIMIT 2'
      ).bind(email).all();
      if(users.results.length!==1)return generic(c);
      const user=users.results[0];
      const existing=await c.env.DB.prepare(
        'SELECT last_sent_at,window_start,window_count FROM PasswordResetRequests WHERE user_id=?'
      ).bind(user.id).first();
      if(existing && now-existing.last_sent_at<RESEND_MS)return generic(c);
      const count=existing && existing.window_start===start?existing.window_count:0;
      if(count>=MAX_EMAILS_PER_USER)return generic(c);

      const code=secureCode();
      const codeHash=await hmac(c.env.JWT_SECRET,'password-reset-code:'+user.id+':'+code);
      // Update the code before email delivery so only the newest code works.
      await c.env.DB.prepare(`
        INSERT INTO PasswordResetRequests
          (user_id,code_hash,expires_at,attempts,last_sent_at,window_start,window_count)
        VALUES(?,?,?,0,?,?,?)
        ON CONFLICT(user_id) DO UPDATE SET
          code_hash=excluded.code_hash,expires_at=excluded.expires_at,
          attempts=0,last_sent_at=excluded.last_sent_at,
          window_start=excluded.window_start,window_count=excluded.window_count
      `).bind(user.id,codeHash,now+CODE_LIFE_MS,now,start,count+1).run();
      const from=c.env.RESEND_FROM_EMAIL||'onboarding@resend.dev';
      const html='<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;line-height:1.7">'+
        '<h2>Question-Bank 密码重置验证码</h2>'+
        '<p>您正在为 Question-Bank（J\'s 通行证）账号重置密码，验证码如下：</p>'+
        '<p style="font-size:28px;letter-spacing:6px;font-weight:bold">'+code+'</p>'+
        '<p>验证码有效期为 10 分钟，请勿转发。如非本人操作，请忽略此邮件。</p></div>';
      const result=await (sendMail
        ?sendMail({from,to:user.email,subject:'【Question-Bank】密码重置验证码',html})
        :new Resend(c.env.RESEND_API_KEY).emails.send({
          from,to:user.email,subject:'【Question-Bank】密码重置验证码',html
        }));
      if(result?.error) {
        console.error('[Password reset] Email provider error:',result.error.message);
      }
      return generic(c);
    }catch(err){
      console.error('[Password reset] Request failed:',err?.message||err);
      return noStore(c,{error:'邮件服务暂不可用，请稍后再试'},503);
    }
  });

  app.post('/api/password-reset/confirm',async c=>{
    let input;
    try{input=await c.req.json();}catch{return noStore(c,{error:'无效请求'},400);}
    const email=typeof input?.email==='string'?input.email.trim():'';
    const code=input?.code, password=input?.newPassword;
    if(!validEmail(email)||!validCode(code))
      return noStore(c,{error:'请输入正确的邮箱地址和六位验证码'},400);
    if(!validPassword(password))
      return noStore(c,{error:'新密码必须为 8 至 128 个字符'},400);
    try{
      const users=await c.env.DB.prepare(
        'SELECT id FROM Users WHERE lower(email)=lower(?) AND email_verified=1 LIMIT 2'
      ).bind(email).all();
      if(users.results.length!==1)return resetReplyError(c);
      const id=users.results[0].id,now=Date.now();
      const row=await c.env.DB.prepare(
        'SELECT code_hash,expires_at,attempts FROM PasswordResetRequests WHERE user_id=?'
      ).bind(id).first();
      if(!row||row.expires_at<=now||row.attempts>=MAX_GUESSES)return resetReplyError(c);
      const expected=await hmac(c.env.JWT_SECRET,'password-reset-code:'+id+':'+code);
      if(!sameHash(row.code_hash,expected)){
        await c.env.DB.prepare(
          'UPDATE PasswordResetRequests SET attempts=attempts+1 WHERE user_id=? AND attempts<?'
        ).bind(id,MAX_GUESSES).run();
        return resetReplyError(c);
      }

      const hash=await bcrypt.hash(password,10);
      // D1 batch runs in one transaction; code consumption and password update
      // are atomic. Updating token_version revokes old JWTs on subsequent calls.
      const result=await c.env.DB.batch([
        c.env.DB.prepare(`
          UPDATE Users SET password_hash=?,salt=NULL,is_legacy=0,
              token_version=COALESCE(token_version,0)+1
          WHERE id=? AND EXISTS (
            SELECT 1 FROM PasswordResetRequests
            WHERE user_id=? AND code_hash=? AND expires_at>? AND attempts<?
          )
        `).bind(hash,id,id,expected,now,MAX_GUESSES),
        c.env.DB.prepare(
          'DELETE FROM PasswordResetRequests WHERE user_id=? AND code_hash=?'
        ).bind(id,expected)
      ]);
      if(result[0]?.meta?.changes!==1)return resetReplyError(c);
      return noStore(c,{success:true,message:'密码已修改成功，请在所有设备重新登录。'});
    }catch(err){
      console.error('[Password reset] Confirm failed:',err?.message||err);
      return noStore(c,{error:'密码重置暂不可用，请稍后重试'},503);
    }
  });
}

export const passwordResetInternals={validEmail,validPassword,validCode,sameHash,secureCode,hmac};
