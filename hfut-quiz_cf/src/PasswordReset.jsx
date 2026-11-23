import { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, KeyRound, Loader2, Mail, ShieldCheck } from 'lucide-react';
import { api } from './api';

export default function PasswordReset() {
  const [email,setEmail]=useState('');
  const [code,setCode]=useState('');
  const [password,setPassword]=useState('');
  const [confirm,setConfirm]=useState('');
  const [step,setStep]=useState(1);
  const [waiting,setWaiting]=useState(false);
  const [seconds,setSeconds]=useState(0);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  useEffect(()=>{
    if(seconds<=0)return;
    const timer=setTimeout(()=>setSeconds(n=>Math.max(0,n-1)),1000);
    return ()=>clearTimeout(timer);
  },[seconds]);

  async function sendCode(e) {
    e?.preventDefault();
    if(waiting||seconds>0)return;
    setWaiting(true);setError('');setMessage('');
    try{
      const result=await api.request('/password-reset/request','POST',
        {email:email.trim()},{skipAuth:true});
      setMessage(result.message||'如果该邮箱已绑定有效账号，请检查收件箱。');
      setStep(2);
      setSeconds(60);
    }catch(err){setError(err.message||'邮件发送失败，请稍后再试');}
    finally{setWaiting(false);}
  }
  async function reset(e){
    e.preventDefault();
    setError('');setMessage('');
    if(!/^\d{6}$/.test(code)){setError('请输入邮件中的六位验证码');return;}
    if(password.length<8||password.length>128){setError('新密码长度为 8–128 位');return;}
    if(password!==confirm){setError('两次输入的密码不一致');return;}
    setWaiting(true);
    try{
      const result=await api.request('/password-reset/confirm','POST',{
        email:email.trim(),code,newPassword:password
      },{skipAuth:true});
      setPassword('');setConfirm('');setCode('');
      // Existing signed-in browser sessions are revoked server-side.
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user_info');
      setMessage(result.message||'密码已修改成功，请重新登录');
      setStep(3);
    }catch(err){setError(err.message||'重置失败，请检查验证码后重试');}
    finally{setWaiting(false);}
  }
  const input='w-full px-4 py-3 rounded-xl bg-slate-900/60 border border-slate-700 outline-none focus:border-blue-500 text-white placeholder:text-slate-500';
  const button='w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold flex justify-center';
  return (
    <main className="min-h-screen bg-[#0f172a] text-white flex items-center justify-center p-4">
      <section className="w-full max-w-md p-6 sm:p-8 rounded-3xl bg-slate-800/70 border border-white/10 shadow-2xl">
        <div className="text-center mb-6">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-blue-600/30 flex items-center justify-center mb-4">
            {step===3?<ShieldCheck size={32}/>:<KeyRound size={32}/>}
          </div>
          <h1 className="text-2xl font-bold">修改 / 找回密码</h1>
          <p className="text-sm text-slate-400 mt-2">Question-Bank · J's 通行证</p>
        </div>
        {error&&<p role="alert" className="rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm p-3 mb-4">{error}</p>}
        {message&&<p role="status" className="rounded-xl bg-green-500/10 border border-green-500/20 text-green-200 text-sm p-3 mb-4">{message}</p>}
        {step===1&&(
          <form onSubmit={sendCode} className="space-y-4">
            <p className="text-sm text-slate-300">请输入注册时已验证的邮箱。我们会发送一次性验证码，确认后即可设置新密码。</p>
            <label htmlFor="reset-email" className="block text-sm font-semibold">绑定邮箱</label>
            <input id="reset-email" type="email" autoComplete="email" required maxLength={254}
              value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@example.com" className={input}/>
            <button className={button} disabled={waiting}>{waiting?<Loader2 className="animate-spin" size={21}/>:<><Mail size={18} className="mr-2"/>发送验证码</>}</button>
          </form>
        )}
        {step===2&&(
          <form onSubmit={reset} className="space-y-4">
            <p className="text-sm text-slate-300">如该邮箱关联已验证账号，验证码会发送到 <strong className="break-all">{email}</strong>。有效期为 10 分钟，最多可尝试 5 次。</p>
            <label htmlFor="reset-code" className="block text-sm font-semibold">邮件验证码</label>
            <input id="reset-code" type="text" inputMode="numeric" autoComplete="one-time-code"
              pattern="[0-9]{6}" maxLength={6} required className={input+' text-center tracking-[0.3em]'}
              placeholder="6 位验证码" value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,''))}/>
            <label htmlFor="reset-password" className="block text-sm font-semibold">新密码</label>
            <input id="reset-password" type="password" autoComplete="new-password" minLength={8} maxLength={128}
              required className={input} placeholder="8–128 位" value={password} onChange={e=>setPassword(e.target.value)}/>
            <label htmlFor="reset-confirm" className="block text-sm font-semibold">确认新密码</label>
            <input id="reset-confirm" type="password" autoComplete="new-password" required className={input}
              placeholder="再次输入新密码" value={confirm} onChange={e=>setConfirm(e.target.value)}/>
            <button disabled={waiting} className={button}>
              {waiting?<Loader2 className="animate-spin" size={21}/>:<><CheckCircle2 size={18} className="mr-2"/>验证并修改密码</>}
            </button>
            <button type="button" disabled={waiting||seconds>0} onClick={sendCode}
              className="block mx-auto text-sm text-blue-300 disabled:text-slate-500">
              {seconds>0?`${seconds} 秒后可重新发送`:'没有收到邮件？重新发送验证码'}
            </button>
            <button type="button" className="block mx-auto text-sm text-slate-400 hover:text-white"
              onClick={()=>{setStep(1);setMessage('');setError('');}}>修改邮箱地址</button>
          </form>
        )}
        {step===3&&<p className="text-center text-sm text-slate-300 mb-5">
          新密码已生效。旧的登录令牌已失效，请在 Question-Bank 网页和已启用独立云同步的扩展中重新登录。
        </p>}
        <a href="/#/" className="flex items-center justify-center gap-2 text-sm text-blue-300 hover:text-blue-200 mt-7">
          <ArrowLeft size={17}/> 返回 Question-Bank 登录页
        </a>
      </section>
    </main>
  );
}
