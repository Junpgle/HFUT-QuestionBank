import {useEffect,useMemo,useRef,useState} from 'react';
import {ArrowLeft,Brain,CalendarDays,RefreshCw} from 'lucide-react';
import MemoryReport from './MemoryReport';
import LearningQuestion from './LearningQuestion';
import {makeBackup,parseBackup,LIMIT} from '../learning/backup';
import {readDraft,writeDraft,validDraft,cardVersion} from '../learning/session';
import {localDay,dailyPlan,chooseNext,replayEvents,recallProbability,isReviewDue,nextShortTime,scopedActivity,DAY} from '../learning/scheduler';
import {loadLearning,appendLearning,exchangeLearning,makeLearningEvent,unionEvents,scheduleLearningSync,subscribeLearning,importLearning} from '../learning/store';

const btn='rounded-xl px-4 py-3 font-bold border border-slate-200 dark:border-slate-700';
const primary='rounded-xl px-4 py-3 font-bold bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50';
const surface='rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 dark:border-slate-800 dark:bg-slate-900';
const event=makeLearningEvent;
export default function SmartLearning({subject,subjectName,bank,user,wrongIds,brushedIds,onBack}){
  const [data,setData]=useState(null),[now,setNow]=useState(Date.now()),[exam,setExam]=useState(''),[reserve,setReserve]=useState(3),[scope,setScope]=useState('all'),[target,setTarget]=useState(.9);
  const [active,setActive]=useState(false),[extra,setExtra]=useState(false),[task,setTask]=useState(null),[error,setError]=useState(''),[syncing,setSyncing]=useState(false),[busy,setBusy]=useState(false),[syncMessage,setSyncMessage]=useState('');
  const [draft,setDraft]=useState(null),[backupPreview,setBackupPreview]=useState(null),[draftWarning,setDraftWarning]=useState(false);
  const fileRef=useRef(null),scrollRef=useRef(null),draftRef=useRef(null);
  const lock=useRef(false),alive=useRef(true),lastSyncAttempt=useRef(''),syncLock=useRef(false),formDirty=useRef(false);
  const all=useMemo(()=>Object.values(bank).flat().filter(q=>q?.id),[bank]);
  const map=useMemo(()=>new Map(all.map(q=>[q.id,q])),[all]);
  const state=useMemo(()=>replayEvents(data?.events||[]),[data]);
  const ids=useMemo(()=>[...new Set(all.filter(q=>!state.plan||state.plan.scope==='all'||q.category===state.plan.scope).map(q=>q.id))],[all,state.plan]);
  const plan=state.plan?dailyPlan(ids,state.cards,state.plan,now):null;
  const priority=useMemo(()=>[...wrongIds,...brushedIds],[wrongIds,brushedIds]);
  useEffect(()=>{
    alive.current=true;
    let cancelled=false;
    loadLearning(user,subject).then(value=>{if(cancelled)return;setData(value);setDraft(readDraft(user,subject));const p=replayEvents(value.events).plan;if(p){setExam(p.exam);setReserve(p.reserve);setScope(p.scope);setTarget(p.target??.9);}}).catch(()=>{if(!cancelled)setError('无法读取本地学习记录，请重试。');});
    const unsubscribe=subscribeLearning(user,subject,()=>loadLearning(user,subject).then(value=>{if(!cancelled)setData(prev=>({...value,events:unionEvents(prev?.events,value.events),cursor:Math.max(prev?.cursor||0,value.cursor||0)}));}).catch(()=>{}));
    const timer=setInterval(()=>setNow(Date.now()),5000);
    return ()=>{cancelled=true;alive.current=false;clearInterval(timer);unsubscribe();};
  },[subject,user]);
  async function commit(e){
    if(lock.current||!data)return false;
    lock.current=true;setBusy(true);setError('');
    try{const next=await appendLearning(user,subject,e);if(alive.current){setData(prev=>({...next,events:unionEvents(prev?.events,next.events),cursor:Math.max(prev?.cursor||0,next.cursor||0)}));setNow(Date.now());setTask(null);}if(user&&!subject.startsWith('custom_'))scheduleLearningSync(user,subject);if(e.kind==='plan')formDirty.current=false;else {draftRef.current=null;setDraft(null);writeDraft(user,subject,null);}return true;}
    catch{if(alive.current)setError('本地保存失败，学习进度未提交，请重试。');return false;}
    finally{lock.current=false;if(alive.current)setBusy(false);}
  }
  async function sync(){
    if(syncLock.current||!data||!user)return;
    syncLock.current=true;setSyncing(true);setSyncMessage('');
    try{lastSyncAttempt.current=data.events.filter(e=>!e.synced).map(e=>e.id).join(',');const next=await exchangeLearning(user,subject);if(alive.current){setData(prev=>({...next,events:unionEvents(prev?.events,next.events),cursor:Math.max(prev?.cursor||0,next.cursor||0)}));const p=replayEvents(next.events).plan;if(p&&!formDirty.current){setExam(p.exam);setReserve(p.reserve);setScope(p.scope);setTarget(p.target??.9);}setSyncMessage('云端学习记录已合并');}}
    catch{if(alive.current)setSyncMessage('云同步暂不可用，本地记录仍保留。');}
    finally{syncLock.current=false;if(alive.current)setSyncing(false);}
  }
  // Pull once after local initialization; explicit sync remains available.
  const pulled=useRef(false);
  useEffect(()=>{if(!user||subject.startsWith('custom_'))return;const online=()=>{lastSyncAttempt.current='';scheduleLearningSync(user,subject);};window.addEventListener('online',online);return ()=>window.removeEventListener('online',online);},[user,subject]);
  useEffect(()=>{if(data&&user&&!subject.startsWith('custom_')&&!pulled.current){pulled.current=true;sync();}},[data,user,subject]);
  // Flush completed events when returning to the plan; offline retries are safe.
  useEffect(()=>{
    if(!data||!user||subject.startsWith('custom_')||active)return;
    const signature=data.events.filter(e=>!e.synced).map(e=>e.id).join(',');
    if(!signature||signature===lastSyncAttempt.current)return;
    const timer=setTimeout(()=>{if(!syncLock.current)sync();},800);
    return ()=>clearTimeout(timer);
  },[data,active,user,subject]);
  useEffect(()=>{
    if(active&&!task&&data&&!busy){
      const resume=draftRef.current||draft;
      if(validDraft(resume,ids,state.cards,state.plan)){setTask(resume.task);return;}
      const next=chooseNext({ids,state,now,extra,priorityIds:priority});
      if(next){const d={task:next,version:cardVersion(state.cards[next.id]),exam:state.plan.exam,scope:state.plan.scope,answer:{}};draftRef.current=d;setDraft(d);setDraftWarning(!writeDraft(user,subject,d));setTask(next);}
    }
  },[active,task,data,busy,syncing,ids,state,now,extra,priority,draft,user,subject]);
  const covered=ids.filter(id=>state.cards[id]).length;
  const pending=ids.filter(id=>state.cards[id]&&state.cards[id].phase!=='review').length;
  const due=ids.filter(id=>state.plan&&isReviewDue(state.cards[id],state.plan,now)).length;
  const completedReviews=ids.filter(id=>state.todayCounts[localDay(now)]?.has(id)).length;
  const activity=useMemo(()=>scopedActivity(ids,state.byQuestion),[ids,state.byQuestion]);
  const waitUntil=nextShortTime(ids,state,now);
  const previewIds=all.filter(q=>scope==='all'||q.category===scope).map(q=>q.id);
  const preview=exam?dailyPlan([...new Set(previewIds)],state.cards,{exam,reserve:Math.max(0,Number(reserve)||0)},now):null;
  const probabilities=ids.map(id=>recallProbability(state.cards[id],now)).filter(x=>x!==null);
  const q=task&&map.get(task.id);
  const canResume=validDraft(draft,ids,state.cards,state.plan);
  useEffect(()=>{if(task&&draft&&(!validDraft(draft,ids,state.cards,state.plan))&&!busy){draftRef.current=null;setDraft(null);setTask(null);writeDraft(user,subject,null);}},[task,draft,ids,state,busy,user,subject]);
  useEffect(()=>{if(task)scrollRef.current?.scrollTo({top:0});},[task]);
  function saveAnswer(answer){const d={...(draftRef.current||draft),answer};draftRef.current=d;setDraft(d);setDraftWarning(!writeDraft(user,subject,d));}
  function start(extraMode=false,id=null){setExtra(extraMode);setActive(true);if(id){const t={id,kind:state.cards[id]?'recall':'intro'};const d={task:t,version:cardVersion(state.cards[id]),exam:state.plan.exam,scope:state.plan.scope,answer:{}};draftRef.current=d;setDraft(d);writeDraft(user,subject,d);setTask(t);}else {draftRef.current=canResume?draft:null;if(!canResume){setDraft(null);writeDraft(user,subject,null);}setTask(null);}}
  async function download(){try{const current=await loadLearning(user,subject);const url=URL.createObjectURL(new Blob([JSON.stringify(makeBackup(subject,current.events),null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='Qbank-智能学习-'+subject+'-'+localDay() +'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch{setError('备份导出失败');}}
  async function readBackup(e){const file=e.target.files?.[0];e.target.value='';if(!file)return;try{if(file.size>LIMIT)throw Error('备份文件超过 20 MB 上限');setBackupPreview(parseBackup(await file.text(),subject,all.map(q=>q.id)));setError('');}catch(err){setBackupPreview(null);setError(err.message||'备份格式错误');}}
  async function restore(){if(lock.current||!backupPreview)return;lock.current=true;setBusy(true);try{const next=await importLearning(user,subject,backupPreview);setData(next);const p=replayEvents(next.events).plan;if(p){setExam(p.exam);setReserve(p.reserve);setScope(p.scope);setTarget(p.target??.9);}setBackupPreview(null);setSyncMessage('备份已合并，本地已有事件未覆盖');}catch{setError('备份导入失败，原数据未清除');}finally{lock.current=false;setBusy(false);}}
  const locked=busy;
  return <div ref={scrollRef} className="h-full overflow-y-auto bg-slate-50 dark:bg-slate-950"><main className="max-w-5xl mx-auto p-3 sm:p-8 pb-24 space-y-4">
    <header className="flex flex-wrap items-center gap-3 sticky top-0 z-10 py-2 bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur"><button disabled={locked} className={btn} onClick={()=>active?(setActive(false),setTask(null)):onBack()} aria-label="返回"><ArrowLeft size={18}/></button><div className="flex-1"><h1 className="text-2xl font-bold flex items-center gap-2"><Brain/> 智能学习</h1><p className="text-sm text-slate-500">{subjectName}</p></div>{user&&!subject.startsWith('custom_')&&<button disabled={locked||syncing||!data} onClick={sync} className={btn}><RefreshCw className="inline mr-1" size={16}/>{syncing?'同步中':'同步'}</button>}</header>
    {draftWarning&&<p className="text-amber-600 text-sm">当前浏览器无法保存未提交的答题草稿，已提交学习记录不受影响。</p>}
    {error&&<p role="alert" className="text-red-600">{error}</p>}
    {syncMessage&&<p role="status" className="text-sm text-slate-500">{syncMessage}</p>}
    {!data?<p>正在读取学习记录…</p>:<>
      {plan&&<section className={surface}><div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[['距离考试',plan.days+' 天'],['今日新题',plan.todayNew+' / '+Math.max(plan.quota,plan.todayNew)],['今日复习',completedReviews+' / '+(completedReviews+due)],['待巩固',pending+' 题']].map(([label,value])=><div key={label}><p className="text-xs text-slate-500">{label}</p><p className="text-xl font-bold">{value}</p></div>)}
      </div><div className="mt-4 text-sm">已接触 {covered}/{ids.length} · 已进入间隔复习 {covered-pending} 题</div><div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800 mt-2 overflow-hidden"><div className="h-full bg-indigo-600" style={{width:(100*covered/Math.max(1,ids.length))+'%'}}/></div><p className="text-xs mt-2 text-slate-500">已测题预测记忆率：{probabilities.length?Math.round(100*probabilities.reduce((a,b)=>a+b,0)/probabilities.length)+'%':'暂无'} · 非实际考试正确率</p>{plan.days===0&&<p className="text-amber-600 text-sm mt-2">已进入考试日或考试日期已过，可继续冲刺或调整考试日期。</p>}</section>}
      {!active?<><section className={surface}><h2 className="font-bold flex gap-2 items-center"><CalendarDays size={18}/> 考试计划</h2><div className="grid sm:grid-cols-2 gap-3 my-4">
        <label className="text-sm">考试日期<input type="date" min={localDay(now)} value={exam} onChange={e=>{formDirty.current=true;setExam(e.target.value);}} className="block w-full rounded-lg border p-2 bg-transparent"/></label>
        <label className="text-sm">考前预留天数<input type="number" min="0" max="30" value={reserve} onChange={e=>{formDirty.current=true;setReserve(Number(e.target.value));}} className="block w-full rounded-lg border p-2 bg-transparent"/></label>
        <label className="text-sm">学习范围<select value={scope} onChange={e=>{formDirty.current=true;setScope(e.target.value);}} className="block w-full rounded-lg border p-2 bg-transparent dark:bg-slate-900"><option value="all">全部题目</option>{[...new Set(all.map(q=>q.category).filter(Boolean))].map(c=><option key={c}>{c}</option>)}</select></label>
        <label className="text-sm">目标记忆保持率<select value={target} onChange={e=>{formDirty.current=true;setTarget(Number(e.target.value));}} className="block w-full rounded-lg border p-2 bg-transparent dark:bg-slate-900"><option value={.85}>85% · 轻量</option><option value={.9}>90% · 推荐</option><option value={.95}>95% · 高频巩固</option></select></label>
      </div><button className={primary} disabled={locked||!exam||exam<localDay(now)||!Number.isInteger(reserve)||reserve<0||reserve>30} onClick={()=>commit(event('plan',{plan:{exam,reserve,scope,target}}))}>保存学习计划</button>{preview&&<p className="mt-3 text-sm font-medium text-indigo-600 dark:text-indigo-300">计划范围 {previewIds.length} 题 · 每日新题约 {preview.quota} 题 · 实际预留 {preview.reserve} 天{preview.days===0?' · 考试日/紧急冲刺':''}</p>}<p className="text-xs text-slate-500 mt-3">首次直接背题；随后混合出现新题、即时检测及到期复习。按北京时间划分学习日。旧刷题记录用于优先安排确认性学习，不虚构历史记忆数据。</p></section>
      {plan&&<div className="grid sm:grid-cols-2 gap-3"><button className={primary} disabled={locked} onClick={()=>start(false)}>{canResume?'继续上次学习':'开始今日学习'}</button><button className={btn} disabled={locked||!plan.unseen.length} onClick={()=>start(true)}>额外学习新题</button></div>}
      {plan&&<section className={surface}><h2 className="font-bold mb-3">未来 7 天到期预测</h2><div className="grid grid-cols-7 gap-1 text-center">{Array.from({length:7},(_,i)=>{const day=localDay(now+i*DAY);const count=ids.filter(id=>state.cards[id]?.phase==='review'&&(i===0?isReviewDue(state.cards[id],state.plan,now):localDay(state.cards[id].due)===day)).length;return <div key={day} className="rounded-lg bg-slate-100 dark:bg-slate-800 p-2"><b>{count}</b><p className="text-xs text-slate-500">{day.slice(5)}</p></div>;})}</div></section>}
      {plan&&<MemoryReport ids={ids} cards={state.cards} activity={activity} bank={map} now={now} exam={state.plan.exam} onPractice={id=>start(false,id)}/>}
      <section className={surface}><h2 className="font-bold mb-2">学习记录备份</h2><p className="text-xs text-slate-500 mb-3">导入只合并本课程的学习事件，不覆盖已有事件。请仅导入自己的备份。</p><div className="flex flex-wrap gap-2"><button className={btn} disabled={locked} onClick={download}>导出 JSON</button><button className={btn} disabled={locked} onClick={()=>fileRef.current?.click()}>导入备份</button><input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={readBackup}/></div>{backupPreview&&<div className="mt-3 border rounded-lg p-3"><p className="text-sm mb-2">已验证 {backupPreview.length} 条事件。确认合并至当前{user?'账号':'游客'}的学习记录？</p><div className="flex gap-2"><button className={primary} disabled={locked} onClick={restore}>确认合并</button><button className={btn} onClick={()=>setBackupPreview(null)}>取消</button></div></div>}</section>
      </>:q?<LearningQuestion key={task.kind+':'+q.id} q={q} task={task} busy={locked} answer={draft?.answer||{}} onAnswer={saveAnswer} onDone={rating=>commit(task.kind==='intro'?event('intro',{questionId:q.id,difficult:rating===1}):event('rate',{questionId:q.id,rating}))}/>:<section className={surface}><h2 className="text-xl font-bold">{pending?'暂时没有可立即学习的题目':'本轮学习完成'}</h2><p className="my-3 text-slate-500">{pending?(waitUntil&&waitUntil>now?'下次可巩固约 '+Math.ceil((waitUntil-now)/60000)+' 分钟后，可稍后继续。':'待巩固题会在间隔满足后再次出现，可等待或稍后继续。'):'已自动安排后续复习。'}</p><button className={btn} disabled={locked} onClick={()=>{setActive(false);setTask(null);}}>返回计划</button></section>}
    </>}
  </main></div>;
}
