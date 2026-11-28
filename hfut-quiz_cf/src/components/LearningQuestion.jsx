import {useEffect,useRef} from 'react';
import {BookOpen,Brain,History,CheckCircle2,XCircle} from 'lucide-react';
import {Markdown} from './Markdown';
import {parseFillAnswer,gradeFill} from '../utils/fillAnswer';
import {getQuestionTypeLabel} from '../utils/questionType';
const box='bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-6';
const primary='min-h-12 rounded-xl px-3 py-3 font-bold bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50';
const secondary='min-h-12 rounded-xl px-3 py-3 font-semibold border border-slate-300 dark:border-slate-700 disabled:opacity-50';
const correct=q=>Array.isArray(q.rawAnswer)?q.rawAnswer.map(Number):[];
export default function LearningQuestion({q,task,busy,answer,onAnswer,onDone}){
  const intro=task.kind==='intro',big=q.type==='big',fill=q.type==='fill',multiple=q.type==='multiple';
  const selected=answer.selected||[],inputs=answer.inputs||[],result=answer.result||null,show=intro||!!result;
  const feedbackRef=useRef(null);
  const blanks=fill?parseFillAnswer(q.options?.[0],q.question):[];
  const solution=fill?blanks.map(a=>a.join(' / ')).join('；'):big?q.options?.join('\n')||'':correct(q).map(i=>String.fromCharCode(65+i)+'、'+q.options[i]).join('；');
  const change=patch=>{if(!busy)onAnswer({...answer,...patch});};
  function submit(v=selected){
    if(show||busy||!v.length)return;
    const a=correct(q);change({selected:v,result:a.length===v.length&&a.every(i=>v.includes(i))?'correct':'wrong'});
  }
  function submitFill(){if(!show&&!busy&&inputs.some(v=>String(v||'').trim()))change({result:gradeFill(inputs,blanks).isCorrect?'correct':'wrong'});}
  useEffect(()=>{if(result)feedbackRef.current?.scrollIntoView({block:'nearest',behavior:'smooth'});},[result]);
  const ratings=result==='wrong'||result==='forgot'?[[1,'重新学习']]:[[1,'忘记 / 蒙对'],[2,'模糊'],[3,'记得'],[4,'很熟悉']];
  const Icon=intro?BookOpen:task.kind==='review'?History:Brain;
  return <section className="space-y-3">
    <div className="flex items-center gap-2 text-sm font-bold text-indigo-600 dark:text-indigo-300"><Icon size={19}/>{intro?'学习新题':task.kind==='review'?'间隔复习':'即时巩固'}<span className="ml-auto text-slate-500 font-normal">{getQuestionTypeLabel(q.type)}题</span></div>
    <article className={box}>
      <p className="text-xs text-slate-500 mb-3">{q.category}</p>
      <h2 className="font-bold text-lg sm:text-2xl leading-relaxed break-words">{q.question}</h2>
      {!big&&!fill&&<div className="grid gap-2 mt-4">{(q.options||[]).map((o,i)=>{
        const right=show&&correct(q).includes(i),wrong=show&&selected.includes(i)&&!right,chosen=!show&&selected.includes(i);
        return <button type="button" key={i} disabled={show||busy} aria-pressed={selected.includes(i)} onClick={()=>multiple?change({selected:selected.includes(i)?selected.filter(x=>x!==i):[...selected,i]}):submit([i])} className={'min-h-12 text-left rounded-xl border p-3 sm:p-4 flex gap-3 items-start break-words '+(right?'bg-emerald-50 border-emerald-500 dark:bg-emerald-950/40 dark:text-emerald-200':wrong?'bg-rose-50 border-rose-500 dark:bg-rose-950/40 dark:text-rose-200':chosen?'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40':'border-slate-200 dark:border-slate-700')}>
          <span className="font-bold shrink-0">{String.fromCharCode(65+i)}.</span><span className="flex-1 min-w-0">{o}</span>{right&&<CheckCircle2 size={19} className="text-emerald-600 shrink-0"/>}{wrong&&<XCircle size={19} className="text-rose-600 shrink-0"/>}
        </button>;
      })}</div>}
      {fill&&!intro&&<div className="space-y-3 mt-4">{blanks.map((_,i)=><label key={i} className="block text-sm">填空 {i+1}<input disabled={show||busy} value={inputs[i]||''} autoComplete="off" onChange={e=>{const v=[...inputs];v[i]=e.target.value;change({inputs:v});}} className="block mt-1 w-full rounded-xl border bg-transparent px-3 py-3 text-base dark:border-slate-700"/></label>)}</div>}
      {big&&!intro&&<label className="block text-sm mt-4">先独立回忆，可在此输入要点<textarea disabled={show||busy} value={answer.text||''} onChange={e=>change({text:e.target.value})} rows={5} className="mt-2 w-full rounded-xl border p-3 bg-transparent dark:border-slate-700"/></label>}
    </article>
    {show&&<article ref={feedbackRef} className={box}>
      {result&&result!=='self'&&<p role="status" className={'font-bold mb-3 '+(result==='correct'?'text-emerald-600':'text-rose-600')}>{result==='correct'?'回答正确':'需要重新巩固'}</p>}
      <h3 className="font-bold text-emerald-600 dark:text-emerald-400">正确答案</h3><p className="whitespace-pre-wrap break-words my-2">{solution}</p>
      {q.explanation&&<><h3 className="font-bold mt-4">解析</h3><Markdown content={q.explanation}/></>}
    </article>}
    <div className="sticky bottom-0 z-10 p-3 -mx-3 sm:mx-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-t border-slate-200 dark:border-slate-800 mobile-safe-bottom sm:rounded-2xl">
      {intro?<div className="grid grid-cols-2 gap-2"><button className={secondary} disabled={busy} onClick={()=>onDone(1)}>比较难记</button><button className={primary} disabled={busy} onClick={()=>onDone()}>已记忆，继续</button></div>:!show?<div className="grid grid-cols-2 gap-2">
        <button className={secondary} disabled={busy} onClick={()=>change({result:big?'self':'forgot'})}>{big?'展示参考答案':'忘记了，查看答案'}</button>
        {multiple&&<button className={primary} disabled={busy||!selected.length} onClick={()=>submit()}>确认提交</button>}
        {fill&&<button className={primary} disabled={busy||!inputs.some(v=>String(v||'').trim())} onClick={submitFill}>确认提交</button>}
      </div>:<div className={'grid gap-2 '+(ratings.length===1?'grid-cols-1':'grid-cols-2 sm:grid-cols-4')}>{ratings.map(([r,label])=><button key={r} className={r<=2?secondary:primary} disabled={busy} onClick={()=>onDone(r)}>{label}</button>)}</div>}
    </div>
  </section>;
}
