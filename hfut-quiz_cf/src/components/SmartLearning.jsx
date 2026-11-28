import {useEffect,useMemo,useRef,useState} from 'react';
import {ArrowLeft,Brain,CalendarDays,RefreshCw} from 'lucide-react';
import MemoryReport from './MemoryReport';
import {Markdown} from './Markdown';
import {QuizQuestionPanel} from './QuizQuestionPanel';
import {gradeFill,parseFillAnswer} from '../utils/fillAnswer';
import {localDay,dailyPlan,chooseNext,replayEvents,recallProbability,isReviewDue,nextShortTime,DAY} from '../learning/scheduler';
import {loadLearning,appendLearning,exchangeLearning,makeLearningEvent} from '../learning/store';

const btn='rounded-xl px-4 py-3 font-bold border border-slate-200 dark:border-slate-700';
const primary='rounded-xl px-4 py-3 font-bold bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50';
const surface='rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 dark:border-slate-800 dark:bg-slate-900';
const event=makeLearningEvent;
const correctIndices=q=>Array.isArray(q.rawAnswer)?q.rawAnswer.map(Number):typeof q.rawAnswer==='string'?(q.rawAnswer.match(/[A-H]/gi)||[]).map(x=>x.toUpperCase().charCodeAt(0)-65):[Number(q.rawAnswer)];
export default function SmartLearning({subject,subjectName,bank,user,wrongIds,brushedIds,onBack}){
  const [data,setData]=useState(null),[now,setNow]=useState(Date.now()),[exam,setExam]=useState(''),[reserve,setReserve]=useState(3),[scope,setScope]=useState('all');
  const [active,setActive]=useState(false),[extra,setExtra]=useState(false),[task,setTask]=useState(null),[error,setError]=useState(''),[syncing,setSyncing]=useState(false),[busy,setBusy]=useState(false),[syncMessage,setSyncMessage]=useState('');
  const lock=useRef(false),alive=useRef(true),lastSyncAttempt=useRef('');
  const all=useMemo(()=>Object.values(bank).flat().filter(q=>q?.id),[bank]);
  const map=useMemo(()=>new Map(all.map(q=>[q.id,q])),[all]);
  const state=useMemo(()=>replayEvents(data?.events||[]),[data]);
  const ids=useMemo(()=>[...new Set(all.filter(q=>!state.plan||state.plan.scope==='all'||q.category===state.plan.scope).map(q=>q.id))],[all,state.plan]);
  const plan=state.plan?dailyPlan(ids,state.cards,state.plan,now):null;
  const priority=useMemo(()=>[...wrongIds,...brushedIds],[wrongIds,brushedIds]);
  useEffect(()=>{
    alive.current=true;
    let cancelled=false;
    loadLearning(user,subject).then(value=>{if(cancelled)return;setData(value);const p=replayEvents(value.events).plan;if(p){setExam(p.exam);setReserve(p.reserve);setScope(p.scope);}}).catch(()=>{if(!cancelled)setError('无法读取本地学习记录，请重试。');});
    const timer=setInterval(()=>setNow(Date.now()),15000);
    return ()=>{cancelled=true;alive.current=false;clearInterval(timer);};
  },[subject,user]);
  async function commit(e){
    if(lock.current||!data)return false;
    lock.current=true;setBusy(true);setError('');
    try{const next=await appendLearning(user,subject,e);if(alive.current){setData(next);setNow(Date.now());setTask(null);}return true;}
    catch{if(alive.current)setError('本地保存失败，学习进度未提交，请重试。');return false;}
    finally{lock.current=false;if(alive.current)setBusy(false);}
  }
  async function sync(){
    if(lock.current||!data)return;
    lock.current=true;setSyncing(true);setSyncMessage('');
    try{lastSyncAttempt.current=data.events.filter(e=>!e.synced).map(e=>e.id).join(',');const next=await exchangeLearning(user,subject);if(alive.current){setData(next);const p=replayEvents(next.events).plan;if(p){setExam(p.exam);setReserve(p.reserve);setScope(p.scope);}setSyncMessage('云端学习记录已合并');}}
    catch{if(alive.current)setSyncMessage('云同步暂不可用，本地记录仍保留。');}
    finally{lock.current=false;if(alive.current)setSyncing(false);}
  }
  // Pull once after local initialization; explicit sync remains available.
  const pulled=useRef(false);
  useEffect(()=>{if(data&&user&&!subject.startsWith('custom_')&&!pulled.current){pulled.current=true;sync();}},[data,user,subject]);
  // Flush completed events when returning to the plan; offline retries are safe.
  useEffect(()=>{
    if(!data||!user||subject.startsWith('custom_')||active)return;
    const signature=data.events.filter(e=>!e.synced).map(e=>e.id).join(',');
    if(!signature||signature===lastSyncAttempt.current)return;
    const timer=setTimeout(()=>{if(!lock.current)sync();},800);
    return ()=>clearTimeout(timer);
  },[data,active,user,subject]);
  useEffect(()=>{
    if(active&&!task&&data&&!busy&&!syncing){
      const next=chooseNext({ids,state,now,extra,priorityIds:priority});
      if(next)setTask(next);
    }
  },[active,task,data,busy,syncing,ids,state,now,extra,priority]);
  const covered=ids.filter(id=>state.cards[id]).length;
  const pending=ids.filter(id=>state.cards[id]&&state.cards[id].phase!=='review').length;
  const due=ids.filter(id=>state.plan&&isReviewDue(state.cards[id],state.plan,now)).length;
  const completedReviews=state.todayCounts[localDay(now)]?.size||0;
  const waitUntil=nextShortTime(ids,state,now);
  const previewIds=all.filter(q=>scope==='all'||q.category===scope).map(q=>q.id);
  const preview=exam?dailyPlan([...new Set(previewIds)],state.cards,{exam,reserve:Math.max(0,Number(reserve)||0)},now):null;
  const probabilities=ids.map(id=>recallProbability(state.cards[id],now)).filter(x=>x!==null);
  const q=task&&map.get(task.id);
  const locked=busy||syncing;
  return <main className="max-w-4xl mx-auto p-4 sm:p-8 space-y-4">
    <header className="flex flex-wrap items-center gap-3"><button disabled={locked} className={btn} onClick={()=>active?(setActive(false),setTask(null)):onBack()}><ArrowLeft size={18}/></button><div className="flex-1"><h1 className="text-2xl font-bold flex items-center gap-2"><Brain/> 智能学习</h1><p className="text-sm text-slate-500">{subjectName}</p></div>{user&&!subject.startsWith('custom_')&&<button disabled={locked||!data||active} onClick={sync} className={btn}><RefreshCw className="inline mr-1" size={16}/>{syncing?'同步中':'同步'}</button>}</header>
    {error&&<p role="alert" className="text-red-600">{error}</p>}
    {syncMessage&&<p role="status" className="text-sm text-slate-500">{syncMessage}</p>}
    {!data?<p>正在读取学习记录…</p>:<>
      {plan&&<section className={surface}><div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[['距离考试',plan.days+' 天'],['今日新题',plan.todayNew+' / '+Math.max(plan.quota,plan.todayNew)],['今日复习',completedReviews+' / '+(completedReviews+due)],['待巩固',pending+' 题']].map(([label,value])=><div key={label}><p className="text-xs text-slate-500">{label}</p><p className="text-xl font-bold">{value}</p></div>)}
      </div><div className="mt-4 text-sm">已接触 {covered}/{ids.length} · 已进入间隔复习 {covered-pending} 题</div><div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800 mt-2 overflow-hidden"><div className="h-full bg-indigo-600" style={{width:(100*covered/Math.max(1,ids.length))+'%'}}/></div><p className="text-xs mt-2 text-slate-500">已测题预测记忆率：{probabilities.length?Math.round(100*probabilities.reduce((a,b)=>a+b,0)/probabilities.length)+'%':'暂无'} · 非实际考试正确率</p></section>}
      {!active?<><section className={surface}><h2 className="font-bold flex gap-2 items-center"><CalendarDays size={18}/> 考试计划</h2><div className="grid sm:grid-cols-3 gap-3 my-4">
        <label className="text-sm">考试日期<input type="date" min={localDay(now)} value={exam} onChange={e=>setExam(e.target.value)} className="block w-full rounded-lg border p-2 bg-transparent"/></label>
        <label className="text-sm">考前预留天数<input type="number" min="0" max="30" value={reserve} onChange={e=>setReserve(Number(e.target.value))} className="block w-full rounded-lg border p-2 bg-transparent"/></label>
        <label className="text-sm">学习范围<select value={scope} onChange={e=>setScope(e.target.value)} className="block w-full rounded-lg border p-2 bg-transparent dark:bg-slate-900"><option value="all">全部题目</option>{[...new Set(all.map(q=>q.category).filter(Boolean))].map(c=><option key={c}>{c}</option>)}</select></label>
      </div><button className={primary} disabled={locked||!exam||exam<localDay(now)||!Number.isInteger(reserve)||reserve<0||reserve>30} onClick={()=>commit(event('plan',{plan:{exam,reserve,scope}}))}>保存学习计划</button>{preview&&<p className="mt-3 text-sm font-medium text-indigo-600 dark:text-indigo-300">计划范围 {previewIds.length} 题 · 每日新题约 {preview.quota} 题 · 实际预留 {preview.reserve} 天{preview.days===0?' · 考试日/紧急冲刺':''}</p>}<p className="text-xs text-slate-500 mt-3">首次直接背题；随后混合出现新题、即时检测及到期复习。按北京时间划分学习日。旧刷题记录用于优先安排确认性学习，不虚构历史记忆数据。</p></section>
      {plan&&<div className="grid sm:grid-cols-2 gap-3"><button className={primary} disabled={locked} onClick={()=>{setExtra(false);setActive(true);setTask(null);}}>开始 / 继续今日学习</button><button className={btn} disabled={locked||!plan.unseen.length} onClick={()=>{setExtra(true);setActive(true);setTask(null);}}>额外学习新题</button></div>}
      {plan&&<section className={surface}><h2 className="font-bold mb-3">未来 7 天到期预测</h2><div className="grid grid-cols-7 gap-1 text-center">{Array.from({length:7},(_,i)=>{const day=localDay(now+i*DAY);const count=ids.filter(id=>state.cards[id]?.phase==='review'&&(i===0?isReviewDue(state.cards[id],state.plan,now):localDay(state.cards[id].due)===day)).length;return <div key={day} className="rounded-lg bg-slate-100 dark:bg-slate-800 p-2"><b>{count}</b><p className="text-xs text-slate-500">{day.slice(5)}</p></div>;})}</div></section>}
      {plan&&<MemoryReport ids={ids} cards={state.cards} activity={state.activity} bank={map} now={now} exam={state.plan.exam} onPractice={id=>{setExtra(false);setActive(true);setTask({id,kind:state.cards[id]?'recall':'intro'});}}/>}
      </>:q?<LearningQuestion key={task.kind+':'+q.id+':'+state.step} q={q} task={task} busy={locked} onDone={rating=>commit(task.kind==='intro'?event('intro',{questionId:q.id}):event('rate',{questionId:q.id,rating}))}/>:<section className={surface}><h2 className="text-xl font-bold">{pending?'暂时没有可立即学习的题目':'本轮学习完成'}</h2><p className="my-3 text-slate-500">{pending?(waitUntil&&waitUntil>now?'下次可巩固约 '+Math.ceil((waitUntil-now)/60000)+' 分钟后，可稍后继续。':'待巩固题会在间隔满足后再次出现，可等待或稍后继续。'):'已自动安排后续复习。'}</p><button className={btn} disabled={locked} onClick={()=>{setActive(false);setTask(null);}}>返回计划</button></section>}
    </>}
  </main>;
}
function LearningQuestion({q,task,busy,onDone}){
  const intro=task.kind==='intro';
  const [selected,setSelected]=useState([]),[inputs,setInputs]=useState([]),[result,setResult]=useState(null);
  const show=intro||result!==null;
  const big=q.type==='big';
  const submit=(v=selected)=>{if(show||!v.length)return;setSelected(v);const a=correctIndices(q);setResult(a.length===v.length&&a.every(x=>v.includes(x))?'correct':'wrong');};
  const answer=q.type==='fill'?parseFillAnswer(q.options?.[0],q.question).map(x=>x.join(' / ')).join('；'):big?q.options?.join('\n')||String(q.rawAnswer??''):correctIndices(q).map(i=>q.options?.[i]).filter(Boolean).join('；');
  return <section className="space-y-3"><p className="text-sm font-bold text-indigo-600">{intro?'学习新题':task.kind==='review'?'间隔复习':'即时巩固'} · {q.category}</p>
    {big?<div className={surface}><h2 className="font-bold text-xl">{q.question}</h2>{!show&&<textarea placeholder="先独立回忆，可在此输入要点" className="w-full border rounded-lg p-3 mt-4 bg-transparent" rows={5}/>}</div>:<QuizQuestionPanel currentQ={q} isQuiz={!intro&&!(result==='forgot')} isAnswered={show} selectedIndices={selected} fillInputs={inputs} onOptionClick={i=>{if(show||busy)return;if(q.type==='multiple')setSelected(v=>v.includes(i)?v.filter(x=>x!==i):[...v,i]);else submit([i]);}} onSubmit={()=>submit()} onFillInputChange={(i,v)=>setInputs(prev=>{const next=[...prev];next[i]=v;return next;})} onFillSubmit={({usedHint}={})=>{if(show)return;setResult(gradeFill(inputs,parseFillAnswer(q.options?.[0],q.question)).isCorrect?(usedHint?'hint':'correct'):'wrong');}}/>}
    {show&&<div className={surface}>{!intro&&result!=='self'&&<p role="status" className={result==='correct'?'text-emerald-600 font-bold mb-2':'text-amber-600 font-bold mb-2'}>{result==='correct'?'回答正确':result==='hint'?'使用提示后答对':'需要重新巩固'}</p>}<b className="text-emerald-600">正确答案</b><div className="whitespace-pre-wrap mt-2">{answer}</div>{q.explanation&&<div className="mt-3"><Markdown content={q.explanation}/></div>}</div>}
    {intro?<button className={primary+' w-full'} disabled={busy} onClick={()=>onDone()}>已阅读，继续学习</button>:!show?<button className={btn+' w-full'} disabled={busy} onClick={()=>setResult(big?'self':'forgot')}>{big?'展示参考答案':'忘记了，查看答案'}</button>:
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{(result==='wrong'||result==='forgot'?[[1,'重新学习']]:result==='hint'?[[1,'依赖提示'],[2,'模糊']]:[[1,'忘记 / 蒙对'],[2,'模糊'],[3,'记得'],[4,'很熟悉']]).map(([r,t])=><button key={r} disabled={busy} className={r===1?btn:primary} onClick={()=>onDone(r)}>{t}</button>)}</div>}
  </section>;
}
