import {useEffect,useMemo,useRef,useState} from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Brain,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Layers,
  Play,
  PlusCircle,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Upload,
} from 'lucide-react';
import MemoryReport from './MemoryReport';
import {Markdown} from './Markdown';
import {QuizQuestionPanel} from './QuizQuestionPanel';
import {makeBackup,parseBackup,LIMIT} from '../learning/backup';
import {readDraft,writeDraft,validDraft,cardVersion} from '../learning/session';
import {learningAttempt} from '../learning/attempt';
import {ignoreQuizShortcut,optionShortcutIndex} from '../utils/quizShortcuts';
import {gradeFill,parseFillAnswer} from '../utils/fillAnswer';
import {localDay,dailyPlan,chooseNext,replayEvents,recallProbability,isReviewDue,nextShortTime,scopedActivity,DAY,questionMemoryStage,MEMORY_STAGES} from '../learning/scheduler';
import {loadLearning,appendLearning,exchangeLearning,makeLearningEvent,unionEvents,scheduleLearningSync,subscribeLearning,importLearning} from '../learning/store';

const surface='rounded-[1.5rem] md:rounded-[2rem] border border-slate-200/90 bg-white p-4 sm:p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900';
const btnSecondary='inline-flex min-h-[44px] items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-bold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300 active:scale-[0.99] transition-all disabled:opacity-50 disabled:pointer-events-none dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:border-slate-600';
const btnPrimary='inline-flex min-h-[44px] items-center justify-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-bold bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white shadow-md shadow-indigo-500/20 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 transition-all disabled:opacity-50 disabled:pointer-events-none disabled:shadow-none';
const fieldClass='mt-1.5 block min-h-[42px] w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 text-sm font-medium text-slate-800 focus:bg-white focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-100 dark:focus:bg-slate-800 dark:focus:border-indigo-400';

const event=makeLearningEvent;
const correctIndices=q=>Array.isArray(q.rawAnswer)?q.rawAnswer.map(Number):typeof q.rawAnswer==='string'?(q.rawAnswer.match(/[A-H]/gi)||[]).map(x=>x.toUpperCase().charCodeAt(0)-65):[Number(q.rawAnswer)];

export default function SmartLearning({subject,subjectName,bank,user,wrongIds,brushedIds,onBack,onAttempt}){
  const [data,setData]=useState(null),[now,setNow]=useState(Date.now()),[exam,setExam]=useState(''),[reserve,setReserve]=useState(3),[scope,setScope]=useState('all'),[target,setTarget]=useState(.9);
  const [editingPlan,setEditingPlan]=useState(false),[showReport,setShowReport]=useState(false),[showBackup,setShowBackup]=useState(false);
  const [active,setActive]=useState(false),[extra,setExtra]=useState(false),[task,setTask]=useState(null),[error,setError]=useState(''),[syncing,setSyncing]=useState(false),[busy,setBusy]=useState(false),[syncMessage,setSyncMessage]=useState('');
  const [history,setHistory]=useState([]),[historyIndex,setHistoryIndex]=useState(null);
  const [draft,setDraft]=useState(null),[backupPreview,setBackupPreview]=useState(null),[draftWarning,setDraftWarning]=useState(false);
  const fileRef=useRef(null),scrollRef=useRef(null),draftRef=useRef(null);
  const lock=useRef(false),alive=useRef(true),syncLock=useRef(false),formDirty=useRef(false);

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

  async function commit(e,attempt=null){
    if(lock.current||!data)return false;
    lock.current=true;setBusy(true);setError('');
    try{const next=await appendLearning(user,subject,e,e.kind==='plan'?null:draftRef.current||draft);if(attempt&&onAttempt){try{await onAttempt(attempt);}catch(err){console.error('共享答题统计保存失败',err);if(alive.current)setError('记忆记录已保存，但共享答题统计保存失败，请检查本地存储。');}}if(alive.current){setData(prev=>({...next,events:unionEvents(prev?.events,next.events),cursor:Math.max(prev?.cursor||0,next.cursor||0)}));setNow(Date.now());setTask(null);}if(user&&!subject.startsWith('custom_'))scheduleLearningSync(user,subject).catch(()=>{});if(e.kind==='plan')formDirty.current=false;else {draftRef.current=null;setDraft(null);writeDraft(user,subject,null);}return true;}
    catch(err){if(alive.current){if(err.code==='STALE_CARD'){setData(await loadLearning(user,subject));draftRef.current=null;setDraft(null);setTask(null);writeDraft(user,subject,null);setError(err.message);}else setError('本地保存失败，学习进度未提交，请重试。');}return false;}
    finally{lock.current=false;if(alive.current)setBusy(false);}
  }

  async function sync(reason='manual'){
    if(syncLock.current||!data||!user)return;
    syncLock.current=true;setSyncing(true);setSyncMessage('');
    try{const next=await exchangeLearning(user,subject,reason);if(alive.current){setData(prev=>({...next,events:unionEvents(prev?.events,next.events),cursor:Math.max(prev?.cursor||0,next.cursor||0)}));const p=replayEvents(next.events).plan;if(p&&!formDirty.current){setExam(p.exam);setReserve(p.reserve);setScope(p.scope);setTarget(p.target??.9);}if(reason==='manual')setSyncMessage(next.syncError||(!next.lastSyncAt?'暂未完成云同步，请稍后重试':'云端学习记录已合并'));}}
    catch{if(alive.current)setSyncMessage(navigator.onLine===false?'当前网络离线，本地记录仍保留。':'云同步暂不可用，本地记录仍保留。');}
    finally{syncLock.current=false;if(alive.current)setSyncing(false);}
  }

  useEffect(()=>{if(data?.lastSyncAt&&!data.syncError)setSyncMessage('');},[data?.lastSyncAt,data?.syncError]);

  // Entry refresh is throttled across reloads by the persisted successful sync time.
  const pulled=useRef(false);
  useEffect(()=>{if(data&&user&&!subject.startsWith('custom_')&&!pulled.current){pulled.current=true;sync('enter');}},[data,user,subject]);

  function leave(){
    if(user&&!subject.startsWith('custom_'))exchangeLearning(user,subject,'exit').catch(()=>{});
    if(active){setActive(false);setTask(null);setHistory([]);setHistoryIndex(null);}else onBack();
  }

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
  const shortToday=ids.filter(id=>state.cards[id]&&state.cards[id].phase!=='review'&&localDay(state.cards[id].due)<=localDay(now)).length;
  const estimatedMinutes=Math.ceil(((plan?.remainingNew||0)*45+due*20+shortToday*20)/60);
  const completedReviews=ids.filter(id=>state.todayCounts[localDay(now)]?.has(id)).length;
  const activity=useMemo(()=>scopedActivity(ids,state.byQuestion),[ids,state.byQuestion]);
  const waitUntil=nextShortTime(ids,state,now);
  const previewIds=all.filter(q=>scope==='all'||q.category===scope).map(q=>q.id);
  const preview=exam?dailyPlan([...new Set(previewIds)],state.cards,{exam,reserve:Math.max(0,Number(reserve)||0)},now):null;
  const probabilities=ids.map(id=>recallProbability(state.cards[id],now)).filter(x=>x!==null);
  const avgRecall=probabilities.length?Math.round(100*probabilities.reduce((a,b)=>a+b,0)/probabilities.length):null;
  const coveragePct=Math.round((100*covered)/Math.max(1,ids.length));
  const q=task&&map.get(task.id);
  const canResume=validDraft(draft,ids,state.cards,state.plan);

  useEffect(()=>{if(task&&draft&&(!validDraft(draft,ids,state.cards,state.plan))&&!busy){draftRef.current=null;setDraft(null);setTask(null);writeDraft(user,subject,null);}},[task,draft,ids,state,busy,user,subject]);
  useEffect(()=>{if(task)scrollRef.current?.scrollTo({top:0});},[task]);

  function saveAnswer(answer){const d={...(draftRef.current||draft),answer};draftRef.current=d;setDraft(d);setDraftWarning(!writeDraft(user,subject,d));}
  function start(extraMode=false,id=null){setExtra(extraMode);setActive(true);setHistory([]);setHistoryIndex(null);if(id){const t={id,kind:state.cards[id]?'recall':'intro'};const d={task:t,version:cardVersion(state.cards[id]),exam:state.plan.exam,scope:state.plan.scope,answer:{}};draftRef.current=d;setDraft(d);writeDraft(user,subject,d);setTask(t);}else {draftRef.current=canResume?draft:null;if(!canResume){setDraft(null);writeDraft(user,subject,null);}setTask(null);}}
  async function download(){try{const current=await loadLearning(user,subject);const url=URL.createObjectURL(new Blob([JSON.stringify(makeBackup(subject,current.events),null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='Qbank-智能学习-'+subject+'-'+localDay()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch{setError('备份导出失败');}}
  async function readBackup(e){const file=e.target.files?.[0];e.target.value='';if(!file)return;try{if(file.size>LIMIT)throw Error('备份文件超过 20 MB 上限');setBackupPreview(parseBackup(await file.text(),subject,all.map(q=>q.id)));setError('');}catch(err){setBackupPreview(null);setError(err.message||'备份格式错误');}}
  async function restore(){if(lock.current||!backupPreview)return;lock.current=true;setBusy(true);try{const next=await importLearning(user,subject,backupPreview);setData(prev=>({...next,events:unionEvents(prev?.events,next.events),cursor:Math.max(prev?.cursor||0,next.cursor||0)}));const p=replayEvents(next.events).plan;if(p){setExam(p.exam);setReserve(p.reserve);setScope(p.scope);setTarget(p.target??.9);}setBackupPreview(null);setSyncMessage('备份已合并，本地已有事件未覆盖');}catch{setError('备份导入失败，原数据未清除');}finally{lock.current=false;setBusy(false);}}

  const locked=busy;
  const forecast=useMemo(()=>{
    const days=Array.from({length:7},(_,i)=>{
      const day=localDay(now+i*DAY);
      const count=ids.filter(id=>state.cards[id]?.phase==='review'&&(i===0?isReviewDue(state.cards[id],state.plan,now):localDay(state.cards[id].due)===day)).length;
      return {day,count,isToday:i===0};
    });
    const max=Math.max(1,...days.map(x=>x.count));
    return {days,max};
  },[ids,now,state.cards,state.plan]);

  if(active){
    const viewing=historyIndex!==null?history[historyIndex]:null;
    const displayTask=viewing?viewing.task:task;
    const displayQ=viewing?viewing.q:q;
    const displayAnswer=viewing?viewing.answer:(draft?.answer||{});
    const isHistory=Boolean(viewing);
    const canPrev=historyIndex===null?history.length>0:historyIndex>0;
    const canNext=historyIndex!==null;
    const goPrev=()=>{if(!locked&&canPrev)setHistoryIndex(i=>i===null?history.length-1:Math.max(0,i-1));};
    const goNext=()=>{if(!locked&&canNext)setHistoryIndex(i=>i>=history.length-1?null:i+1);};
    return (
      <SmartLearningSession
        q={displayQ}
        task={displayTask}
        card={displayQ?state.cards[displayQ.id]:null}
        plan={plan}
        due={due}
        pending={pending}
        completedReviews={completedReviews}
        waitUntil={waitUntil}
        now={now}
        busy={locked}
        error={error}
        draftWarning={draftWarning}
        answer={displayAnswer}
        isHistory={isHistory}
        historyRating={viewing?.rating}
        historyPos={historyIndex!==null?`${historyIndex+1}/${history.length}`:null}
        canPrev={canPrev}
        canNext={canNext}
        onPrev={goPrev}
        onNext={goNext}
        onCurrent={()=>setHistoryIndex(null)}
        onAnswer={saveAnswer}
        onExit={leave}
        onDone={async rating=>{
          const snapAnswer={...(draftRef.current||draft)?.answer};
          const snap={task,q,answer:snapAnswer,rating};
          const e=task.kind==='intro'?event('intro',{questionId:q.id,difficult:rating===1}):event('rate',{questionId:q.id,rating});
          const ok=await commit(e,learningAttempt(q,task,snapAnswer,rating,e));
          if(ok&&alive.current){setHistory(prev=>[...prev.slice(-49),snap]);setHistoryIndex(null);}
          return ok;
        }}
      />
    );
  }

  const targetLabel=t=>t===.85?'85% · 轻量':t===.95?'95% · 高频巩固':'90% · 推荐';
  const showPlanForm=!plan||editingPlan;

  const planSection=(
    <section className={surface}>
      <div className="flex items-center gap-3 mb-4">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400">
          <CalendarDays size={20} aria-hidden="true"/>
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 [text-wrap:balance]">考试计划</h2>
          {!plan&&<p className="text-sm text-slate-500 dark:text-slate-400 [text-wrap:pretty]">设置考试日期，自动安排每日新题与复习</p>}
        </div>
      </div>
        {showPlanForm?(
          <div className="space-y-3.5 mb-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                考试日期
                <input type="date" min={localDay(now)} value={exam} onChange={e=>{formDirty.current=true;setExam(e.target.value);}} className={fieldClass}/>
              </label>
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                考前预留天数
                <input type="number" min="0" max="30" value={reserve} onChange={e=>{formDirty.current=true;setReserve(Number(e.target.value));}} className={fieldClass}/>
              </label>
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                学习范围
                <select value={scope} onChange={e=>{formDirty.current=true;setScope(e.target.value);}} className={fieldClass}>
                  <option value="all">全部题目</option>
                  {[...new Set(all.map(item=>item.category).filter(Boolean))].map(c=><option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                目标保持率
                <select value={target} onChange={e=>{formDirty.current=true;setTarget(Number(e.target.value));}} className={fieldClass}>
                  <option value={.85}>85% · 轻量</option>
                  <option value={.9}>90% · 推荐</option>
                  <option value={.95}>95% · 高频巩固</option>
                </select>
              </label>
            </div>
            {preview&&(
              <p className="text-sm font-medium text-indigo-600 dark:text-indigo-300">
                范围 {previewIds.length} 题 · 每日新题约 {preview.quota} 题 · 预留 {preview.reserve} 天{preview.days===0?' · 考试冲刺':''}
              </p>
            )}
          </div>
        ):(
          <dl className="grid grid-cols-2 gap-3 mb-4 text-sm">
            <div className="rounded-xl bg-slate-50/80 dark:bg-slate-800/50 px-3.5 py-2.5">
              <dt className="text-slate-500 dark:text-slate-400">考试日期</dt>
              <dd className="mt-0.5 font-bold text-slate-900 dark:text-slate-100 tabular-nums">{state.plan.exam}</dd>
            </div>
            <div className="rounded-xl bg-slate-50/80 dark:bg-slate-800/50 px-3.5 py-2.5">
              <dt className="text-slate-500 dark:text-slate-400">考前预留</dt>
              <dd className="mt-0.5 font-bold text-slate-900 dark:text-slate-100 tabular-nums">{state.plan.reserve} 天</dd>
            </div>
            <div className="rounded-xl bg-slate-50/80 dark:bg-slate-800/50 px-3.5 py-2.5">
              <dt className="text-slate-500 dark:text-slate-400">学习范围</dt>
              <dd className="mt-0.5 font-bold text-slate-900 dark:text-slate-100 break-words">{state.plan.scope==='all'?'全部题目':state.plan.scope}</dd>
            </div>
            <div className="rounded-xl bg-slate-50/80 dark:bg-slate-800/50 px-3.5 py-2.5">
              <dt className="text-slate-500 dark:text-slate-400">目标保持率</dt>
              <dd className="mt-0.5 font-bold text-slate-900 dark:text-slate-100">{targetLabel(state.plan.target??.9)}</dd>
            </div>
          </dl>
        )}
      <div className="flex flex-col gap-2.5 pt-3.5 border-t border-slate-100 dark:border-slate-800">
        {!plan&&(
          <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed [text-wrap:pretty]">
            首次直接背题，随后混合新题、即时检测与到期复习。
          </p>
        )}
        {showPlanForm?(
          <div className={`grid gap-2.5 ${plan?'grid-cols-2':'grid-cols-1'}`}>
            {plan&&(
              <button
                type="button"
                className={btnSecondary+' w-full'}
                disabled={locked}
                onClick={()=>{formDirty.current=false;setExam(state.plan.exam);setReserve(state.plan.reserve);setScope(state.plan.scope);setTarget(state.plan.target??.9);setEditingPlan(false);}}
              >
                取消
              </button>
            )}
            <button
              type="button"
              className={btnPrimary+' w-full'}
              disabled={locked||!exam||exam<localDay(now)||!Number.isInteger(reserve)||reserve<0||reserve>30}
              onClick={async()=>{if(await commit(event('plan',{plan:{exam,reserve,scope,target}})))setEditingPlan(false);}}
            >
              {plan?'保存修改':'保存学习计划'}
            </button>
          </div>
        ):(
          <button
            type="button"
            className={btnSecondary+' w-full'}
            disabled={locked}
            onClick={()=>{formDirty.current=false;setExam(state.plan.exam);setReserve(state.plan.reserve);setScope(state.plan.scope);setTarget(state.plan.target??.9);setEditingPlan(true);}}
          >
            编辑学习计划
          </button>
        )}
      </div>
    </section>
  );

  const syncLine=user&&!subject.startsWith('custom_')&&data?(
    `${data.events.filter(e=>!e.synced).length} 条待同步 · ${data.lastSyncAt?'上次同步 '+new Date(data.lastSyncAt).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'}):'尚未完成云同步'}${data.syncError?(data.events.some(e=>!e.synced)||data.hasMore?' · 自动退避重试':' · 拉取失败，可手动重试'):''}`
  ):'';

  return (
    <div ref={scrollRef} className="min-h-[100dvh] w-full overflow-y-auto">
      <main className="w-full max-w-[1520px] mx-auto px-3.5 py-4 md:px-6 md:py-6 space-y-5 animate-enter mobile-safe-bottom">
        <header className="flex flex-wrap items-center justify-between gap-3 bg-white/85 dark:bg-slate-900/85 backdrop-blur-md border border-slate-200/80 dark:border-slate-800 rounded-[1.5rem] px-4 py-3 sm:px-5 shadow-sm">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <button
              type="button"
              disabled={locked}
              aria-label="返回"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-indigo-600 transition-colors disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              onClick={leave}
            >
              <ArrowLeft size={18} aria-hidden="true"/>
            </button>
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm shadow-indigo-500/25">
              <Brain size={20} aria-hidden="true"/>
            </span>
            <div className="min-w-0">
              <h1 className="text-base sm:text-xl font-bold text-slate-900 dark:text-slate-100 [text-wrap:balance]">智能学习</h1>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 break-words">{subjectName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
            {(syncMessage||(syncLine&&!data?.syncError))&&!error&&(
              <span role="status" className="hidden md:inline-flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300">
                <CheckCircle2 size={14} className="text-emerald-500 shrink-0" aria-hidden="true"/>
                <span>{syncMessage||syncLine}</span>
              </span>
            )}
            {user&&!subject.startsWith('custom_')&&(
              <button
                type="button"
                disabled={locked||syncing||!data}
                onClick={()=>sync('manual')}
                className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 hover:text-indigo-600 transition-colors disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                <RefreshCw className={syncing?'animate-spin':''} size={14} aria-hidden="true"/>
                <span>{syncing?'同步中…':'同步进度'}</span>
              </button>
            )}
          </div>
        </header>

        {draftWarning&&(
          <div role="status" className="flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-medium text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
            <AlertCircle size={15} className="shrink-0" aria-hidden="true"/>
            <span>当前浏览器无法保存未提交的答题草稿，已提交学习记录不受影响。</span>
          </div>
        )}

        {error&&(
          <div role="alert" className="flex items-center gap-2.5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
            <AlertCircle size={18} className="shrink-0" aria-hidden="true"/>
            <span>{error}</span>
          </div>
        )}

        {(syncMessage||syncLine)&&!error&&(
          <div role="status" className="md:hidden flex items-center gap-2 rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-2 text-xs font-medium text-slate-600 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-300">
            <CheckCircle2 size={15} className="text-emerald-500 shrink-0" aria-hidden="true"/>
            <span>{syncMessage||syncLine}</span>
          </div>
        )}

        {!data?(
          <section className={surface+' flex items-center justify-center gap-3 py-12 text-slate-500 dark:text-slate-400'}>
            <RefreshCw size={20} className="animate-spin text-indigo-500" aria-hidden="true"/>
            <span className="text-sm font-medium">正在读取学习记录…</span>
          </section>
        ):(
          <>
            {plan?(
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                <div className="lg:col-span-7 xl:col-span-8 space-y-5 min-w-0">
                  <section className={surface+' relative overflow-hidden'}>
                    <div className="pointer-events-none absolute -top-20 -right-20 h-56 w-56 rounded-full bg-indigo-100/70 blur-3xl dark:bg-indigo-950/30" aria-hidden="true"/>
                    <div className="relative z-10 space-y-5">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                        {[
                          ['距离考试',plan.days+' 天'],
                          ['今日新题',plan.todayNew+' / '+Math.max(plan.quota,plan.todayNew)],
                          ['今日复习',completedReviews+' / '+(completedReviews+due)],
                          ['待巩固',pending+' 题'],
                        ].map(([label,value])=>(
                          <article key={label} className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-800/40 min-w-0">
                            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</p>
                            <p className="mt-1.5 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100 tabular-nums">{value}</p>
                          </article>
                        ))}
                      </div>

                      <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/30 space-y-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                          <span className="inline-flex items-center gap-2">
                            <Layers size={16} className="text-indigo-500 shrink-0" aria-hidden="true"/>
                            已学习 {covered} / {ids.length} 题（进入复习 {covered-pending} 题）
                          </span>
                          <span className="text-indigo-600 dark:text-indigo-400 tabular-nums">{coveragePct}%</span>
                        </div>
                        <div className="h-3 w-full rounded-full bg-slate-200/80 dark:bg-slate-800 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-blue-500 to-violet-500 transition-all duration-500"
                            style={{width:coveragePct+'%'}}
                          />
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500 dark:text-slate-400">
                          <span>预测记忆率：<strong className="text-slate-800 dark:text-slate-200">{avgRecall!==null?avgRecall+'%':'暂无'}</strong></span>
                          <span>预计今日还需 ≥{estimatedMinutes} 分钟</span>
                        </div>
                        {plan.days===0&&(
                          <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
                            已进入考试日或考试日期已过，可继续冲刺或调整考试日期。
                          </p>
                        )}
                      </div>
                    </div>
                  </section>

                  <div className="grid sm:grid-cols-2 gap-3 lg:hidden">
                    <button
                      type="button"
                      className={btnPrimary+' py-4 text-base'}
                      disabled={locked}
                      onClick={()=>start(false)}
                    >
                      <Play size={18} aria-hidden="true"/>
                      <span>{canResume?'继续上次学习':'开始今日学习'}</span>
                    </button>
                    <button
                      type="button"
                      className={btnSecondary+' py-4 text-base'}
                      disabled={locked||!plan.unseen.length}
                      onClick={()=>start(true)}
                    >
                      <PlusCircle size={18} aria-hidden="true"/>
                      <span>额外学习新题{plan.unseen.length?`（余 ${plan.unseen.length} 题）`:''}</span>
                    </button>
                  </div>

                  <section className={surface}>
                    <div className="flex items-center justify-between gap-2 mb-4">
                      <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 [text-wrap:balance]">未来 7 天到期复习</h2>
                      <span className="text-sm text-slate-400 dark:text-slate-500">每日待复习题数</span>
                    </div>
                    <div className="grid grid-cols-7 gap-1.5 sm:gap-3">
                      {forecast.days.map(({day,count,isToday})=>{
                        const barHeight=count===0?6:Math.max(18,Math.round((count/forecast.max)*100));
                        return (
                          <div
                            key={day}
                            className={`min-w-0 flex flex-col items-center rounded-xl sm:rounded-2xl px-1 py-2.5 sm:p-3 border transition-colors ${
                              isToday
                                ?'border-indigo-200 bg-indigo-50/70 dark:border-indigo-800/70 dark:bg-indigo-950/30'
                                :'border-slate-100 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-800/40'
                            }`}
                          >
                            <span className={`text-sm sm:text-lg font-bold tabular-nums ${
                              isToday?'text-indigo-700 dark:text-indigo-300':'text-slate-800 dark:text-slate-200'
                            }`}>
                              {count}
                            </span>
                            <div className="my-2 flex h-12 sm:h-16 w-2.5 sm:w-4 items-end rounded-full bg-slate-200/70 dark:bg-slate-700/60 overflow-hidden">
                              <div
                                className={`w-full rounded-full transition-all duration-300 ${
                                  count===0
                                    ?'bg-slate-300/60 dark:bg-slate-600/50'
                                    :isToday
                                      ?'bg-indigo-600 dark:bg-indigo-400'
                                      :'bg-blue-500/80 dark:bg-blue-400/80'
                                }`}
                                style={{height:barHeight+'%'}}
                              />
                            </div>
                            <span className={`text-xs sm:text-sm font-semibold tabular-nums ${
                              isToday?'text-indigo-600 dark:text-indigo-400':'text-slate-500 dark:text-slate-400'
                            }`}>
                              {isToday?'今天':day.slice(5)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                </div>

                <aside className="lg:col-span-5 xl:col-span-4 flex flex-col gap-5 min-w-0">
                  <section className={surface+' hidden lg:block space-y-3.5'}>
                    <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 [text-wrap:balance]">今日学习任务</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400 [text-wrap:pretty]">
                      {due>0||pending>0
                        ?`当前有 ${due} 道到期复习与 ${pending} 道待巩固题目`
                        :plan.remainingNew>0
                          ?`今日还需学习 ${plan.remainingNew} 道新题`
                          :'今日计划已达标，可继续额外学习新题'}
                    </p>
                    <button
                      type="button"
                      className={btnPrimary+' w-full py-3.5 text-base'}
                      disabled={locked}
                      onClick={()=>start(false)}
                    >
                      <Play size={18} aria-hidden="true"/>
                      <span>{canResume?'继续上次学习':'开始今日学习'}</span>
                    </button>
                    <button
                      type="button"
                      className={btnSecondary+' w-full py-3 text-sm'}
                      disabled={locked||!plan.unseen.length}
                      onClick={()=>start(true)}
                    >
                      <PlusCircle size={17} aria-hidden="true"/>
                      <span>额外学习新题{plan.unseen.length?`（余 ${plan.unseen.length} 题）`:''}</span>
                    </button>
                  </section>

                  {planSection}
                </aside>
              </div>
            ):(
              <div className="max-w-3xl mx-auto">{planSection}</div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2.5 pt-1">
              {plan&&(
                <button
                  type="button"
                  aria-expanded={showReport}
                  onClick={()=>setShowReport(v=>!v)}
                  className={btnSecondary}
                >
                  {showReport?'收起记忆分析':'记忆分析与热力图'}
                </button>
              )}
              <button
                type="button"
                aria-expanded={showBackup}
                onClick={()=>setShowBackup(v=>!v)}
                className={btnSecondary}
              >
                {showBackup?'收起备份与恢复':'学习记录备份 / 恢复'}
              </button>
            </div>

            {plan&&showReport&&<MemoryReport ids={ids} cards={state.cards} activity={activity} bank={map} now={now} exam={state.plan.exam} onPractice={id=>start(false,id)}/>}

            {showBackup&&(
              <section className={surface}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">学习记录备份</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">导入只合并本课程的学习事件，不覆盖已有事件。请仅导入自己的备份。</p>
                  </div>
                  <div className="flex flex-wrap gap-2.5 shrink-0">
                    <button type="button" className={btnSecondary} disabled={locked} onClick={download}>
                      <Download size={16} aria-hidden="true"/>
                      <span>导出 JSON</span>
                    </button>
                    <button type="button" className={btnSecondary} disabled={locked} onClick={()=>fileRef.current?.click()}>
                      <Upload size={16} aria-hidden="true"/>
                      <span>导入备份</span>
                    </button>
                    <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={readBackup}/>
                  </div>
                </div>
                {backupPreview&&(
                  <div className="mt-4 rounded-2xl border border-indigo-200 bg-indigo-50/50 dark:border-indigo-900/50 dark:bg-indigo-950/20 p-4">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200 mb-3">
                      已验证 {backupPreview.length} 条事件。确认合并至当前{user?'账号':'游客'}的学习记录？
                    </p>
                    <div className="flex gap-2.5">
                      <button type="button" className={btnPrimary} disabled={locked} onClick={restore}>确认合并</button>
                      <button type="button" className={btnSecondary} onClick={()=>setBackupPreview(null)}>取消</button>
                    </div>
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function SmartLearningSession({
  q,task,card,plan,due,pending,completedReviews,waitUntil,now,busy,error,draftWarning,answer,
  isHistory=false,historyRating=null,historyPos=null,canPrev=false,canNext=false,onPrev,onNext,onCurrent,
  onAnswer,onExit,onDone,
}){
  useEffect(()=>{
    const onKey=e=>{
      if(busy||ignoreQuizShortcut(e))return;
      if(e.key==='Escape'){e.preventDefault();onExit();return;}
      if(e.key==='ArrowLeft'&&canPrev){e.preventDefault();onPrev?.();return;}
      if(e.key==='ArrowRight'&&canNext){e.preventDefault();onNext?.();}
    };
    window.addEventListener('keydown',onKey);
    return ()=>window.removeEventListener('keydown',onKey);
  },[busy,onExit,canPrev,canNext,onPrev,onNext]);

  return (
    <div className="h-[100dvh] flex flex-col md:flex-row bg-slate-100 dark:bg-slate-900">
      {/* Desktop sidebar matching QuizSidebar */}
      <aside className="hidden md:flex w-72 bg-white border-r border-slate-200 flex-col dark:bg-slate-900 dark:border-slate-800 shrink-0">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center dark:border-slate-800">
          <button
            type="button"
            disabled={busy}
            onClick={onExit}
            className="flex items-center gap-2 text-slate-500 hover:text-slate-800 transition-colors font-medium dark:text-slate-400 dark:hover:text-slate-200 disabled:opacity-50"
          >
            <RotateCcw size={18} aria-hidden="true"/> 返回计划
          </button>
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
            <Brain size={16} aria-hidden="true"/>
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {plan&&(
            <div className="space-y-2.5">
              <div className="px-1 text-xs font-semibold text-slate-400 dark:text-slate-500">今日进度</div>
              <div className="grid grid-cols-1 gap-2">
                {[
                  ['今日新题',`${plan.todayNew} / ${Math.max(plan.quota,plan.todayNew)}`],
                  ['今日复习',`${completedReviews} / ${completedReviews+due}`],
                  ['待巩固',`${pending} 题`],
                ].map(([label,val])=>(
                  <div key={label} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5 text-xs dark:border-slate-800 dark:bg-slate-950/50">
                    <span className="text-slate-500 dark:text-slate-400 font-medium">{label}</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200 tabular-nums">{val}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-100 text-xs text-center text-slate-400 dark:border-slate-800 dark:text-slate-500">
          智能学习模式
        </div>
      </aside>

      <div className="flex-1 flex flex-col h-[100dvh] relative min-w-0">
        {/* Mobile top bar matching QuizMobileTopBar */}
        <div className="md:hidden p-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center shadow-sm z-10">
          <button
            type="button"
            disabled={busy}
            aria-label="返回计划"
            onClick={onExit}
            className="p-2 -ml-2 text-slate-600 dark:text-slate-300 disabled:opacity-50"
          >
            <RotateCcw size={20} aria-hidden="true"/>
          </button>
          <span className="font-bold text-sm text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
            智能学习
          </span>
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 tabular-nums">
            待学 {due+pending}
          </span>
        </div>

        {/* Main quiz scroll area matching renderCard */}
        <div className="flex-1 overflow-y-auto px-4 pt-2 pb-28 md:px-8 md:pt-4 md:pb-8 flex justify-center mobile-safe-bottom">
          <div className="w-full max-w-5xl space-y-2 md:space-y-3">
            {draftWarning&&(
              <div role="status" className="flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-medium text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
                <AlertCircle size={15} className="shrink-0" aria-hidden="true"/>
                <span>当前浏览器无法保存未提交的答题草稿，已提交学习记录不受影响。</span>
              </div>
            )}
            {error&&(
              <div role="alert" className="flex items-center gap-2.5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
                <AlertCircle size={18} className="shrink-0" aria-hidden="true"/>
                <span>{error}</span>
              </div>
            )}

            {q?(
              <SmartLearningQuestion
                key={(isHistory?'hist:'+historyPos+':':'')+task.kind+':'+q.id}
                q={q}
                task={task}
                card={card}
                now={now}
                busy={busy}
                answer={answer}
                isHistory={isHistory}
                historyRating={historyRating}
                historyPos={historyPos}
                canPrev={canPrev}
                canNext={canNext}
                onPrev={onPrev}
                onNext={onNext}
                onCurrent={onCurrent}
                onAnswer={onAnswer}
                onDone={onDone}
              />
            ):(
              <div className="bg-white rounded-[1.5rem] md:rounded-[2rem] p-6 md:p-10 shadow-sm border border-slate-200 text-center dark:bg-slate-900 dark:border-slate-800">
                <div className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
                  {pending?<Clock size={28} aria-hidden="true"/>:<CheckCircle2 size={28} aria-hidden="true"/>}
                </div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 [text-wrap:balance]">
                  {pending?'暂时没有可立即学习的题目':'本轮学习完成'}
                </h2>
                <p className="mx-auto mt-2 max-w-md text-sm text-slate-500 dark:text-slate-400 leading-relaxed [text-wrap:pretty]">
                  {pending?(waitUntil&&waitUntil>now?'下次可巩固约 '+Math.ceil((waitUntil-now)/60000)+' 分钟后，可稍后继续。':'待巩固题会在间隔满足后再次出现，可等待或稍后继续。'):'已自动安排后续复习。'}
                </p>
                <button type="button" className={btnPrimary+' mt-6'} disabled={busy} onClick={onExit}>
                  返回学习计划
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function QuestionStageProgress({card,now,isHistory,historyPos}){
  const stage=questionMemoryStage(card,now);
  const tone=stage.index===1?'bg-amber-500 dark:bg-amber-400':stage.index>=3?'bg-emerald-500 dark:bg-emerald-400':'bg-indigo-500 dark:bg-indigo-400';
  return (
    <div className="flex items-center gap-2 sm:gap-3 min-w-0 px-1 text-xs leading-5" title={MEMORY_STAGES.join(' → ')+'；'+stage.detail}>
      <span className="inline-flex items-center gap-1 shrink-0 font-semibold text-slate-700 dark:text-slate-200">
        <Brain size={13} aria-hidden="true" className="text-indigo-500"/>
        {stage.label}
      </span>
      <div role="progressbar" aria-label="本题记忆阶段进度" aria-valuemin={1} aria-valuemax={MEMORY_STAGES.length} aria-valuenow={stage.index+1} aria-valuetext={stage.label} className="grid grid-cols-5 gap-1 w-20 sm:w-28 shrink-0">
        {MEMORY_STAGES.map((label,i)=>(
          <div key={label} title={label} aria-hidden="true" className={'h-1.5 rounded-full '+(i<=stage.index?tone:'bg-slate-200 dark:bg-slate-700')}/>
        ))}
      </div>
      <span className="shrink-0 tabular-nums text-slate-500 dark:text-slate-400">{stage.index+1}/{MEMORY_STAGES.length}</span>
      {isHistory&&<span className="ml-auto truncate text-slate-500 dark:text-slate-400">回顾 {historyPos}</span>}
    </div>
  );
}

function SmartLearningQuestion({
  q,task,card,now,busy,answer,
  isHistory=false,historyRating=null,historyPos=null,canPrev=false,canNext=false,onPrev,onNext,onCurrent,
  onAnswer,onDone,
}){
  const intro=task.kind==='intro';
  const selected=answer.selected||[],inputs=answer.inputs||[],result=answer.result||null;
  const show=isHistory||intro||result!==null;
  const big=q.type==='big';
  const patch=p=>{if(!busy&&!isHistory)onAnswer({...answer,...p});};
  const submit=(v=selected)=>{
    if(show||busy||isHistory||!v.length)return;
    const a=correctIndices(q);
    patch({selected:v,result:a.length===v.length&&a.every(x=>v.includes(x))?'correct':'wrong'});
  };
  const solution=q.type==='fill'?parseFillAnswer(q.options?.[0],q.question).map(x=>x.join(' / ')).join('；'):big?q.options?.join('\n')||String(q.rawAnswer??''):correctIndices(q).map(i=>q.options?.[i]).filter(Boolean).join('；');

  const ratingButtons=useMemo(()=>result==='wrong'||result==='forgot'
    ?[[1,'重新学习','border-red-200 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300']]
    :result==='hint'
      ?[
        [1,'依赖提示','border-red-200 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300'],
        [2,'模糊','border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300'],
      ]
      :[
        [1,'忘记 / 蒙对','border-red-200 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300'],
        [2,'模糊','border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300'],
        [3,'记得','border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-300'],
        [4,'很熟悉','border-transparent bg-gradient-to-r from-blue-500 to-blue-700 hover:from-blue-600 hover:to-blue-800 text-white shadow-md'],
      ],[result]);

  useEffect(()=>{
    const onKey=e=>{
      if(busy||isHistory||ignoreQuizShortcut(e))return;
      const key=e.key;
      if(intro){
        if(key==='Enter'||key===' '){e.preventDefault();onDone();}
        else if(key==='1'){e.preventDefault();onDone(1);}
        return;
      }
      if(!show){
        if(!big&&q.type!=='fill'&&Array.isArray(q.options)){
          const idx=optionShortcutIndex(key,q.options.length);
          if(idx>=0){
            e.preventDefault();
            if(q.type==='multiple')patch({selected:selected.includes(idx)?selected.filter(x=>x!==idx):[...selected,idx]});
            else submit([idx]);
            return;
          }
        }
        if(key==='Enter'&&q.type==='multiple'&&selected.length>0){
          e.preventDefault();submit();return;
        }
        if(key===' '||key==='f'||key==='F'){
          e.preventDefault();patch({result:big?'self':'forgot'});
        }
        return;
      }
      if(/^[1-4]$/.test(key)){
        const r=Number(key);
        if(ratingButtons.some(([val])=>val===r)){e.preventDefault();onDone(r);}
        return;
      }
      if(key==='Enter'||key===' '){
        e.preventDefault();
        if(ratingButtons.length===1)onDone(ratingButtons[0][0]);
        else if(ratingButtons.some(([val])=>val===3))onDone(3);
        else onDone(ratingButtons[ratingButtons.length-1][0]);
      }
    };
    window.addEventListener('keydown',onKey);
    return ()=>window.removeEventListener('keydown',onKey);
  });

  const kbdClass='hidden md:inline-flex items-center justify-center rounded-md border px-1.5 py-0.5 text-[10px] font-mono font-bold leading-none opacity-75';
  const ratingText=intro?(historyRating===1?'比较难记':'已记忆'):({1:'忘记 / 蒙对',2:'模糊',3:'记得',4:'很熟悉'}[historyRating]||'已记录');

  const mobileControls=isHistory?(
    <div className="flex items-center gap-2 w-full">
      <button type="button" disabled={busy||!canPrev} onClick={onPrev} aria-label="上一题" className="px-3 py-3 rounded-xl text-sm font-bold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 disabled:opacity-40 inline-flex items-center gap-1 shrink-0">
        <ChevronLeft size={16} aria-hidden="true"/> 上一题
      </button>
      <button type="button" disabled={busy} onClick={onCurrent} className="flex-1 px-3 py-3 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-blue-500 to-blue-700 shadow-md disabled:opacity-50">
        回到当前题
      </button>
      <button type="button" disabled={busy||!canNext} onClick={onNext} aria-label="下一题" className="px-3 py-3 rounded-xl text-sm font-bold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 disabled:opacity-40 inline-flex items-center gap-1 shrink-0">
        下一题 <ChevronRight size={16} aria-hidden="true"/>
      </button>
    </div>
  ):intro?(
    <div className="flex items-center gap-2 w-full">
      <button type="button" disabled={busy||!canPrev} onClick={onPrev} aria-label="上一题" className="px-3 py-3 rounded-xl text-sm font-bold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 disabled:opacity-40 shrink-0">
        <ChevronLeft size={16} aria-hidden="true"/>
      </button>
      <button type="button" disabled={busy} onClick={()=>onDone(1)} className="flex-1 px-3 py-3 rounded-xl text-sm font-bold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 disabled:opacity-50">
        比较难记
      </button>
      <button type="button" disabled={busy} onClick={()=>onDone()} className="flex-1 px-3 py-3 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-blue-500 to-blue-700 shadow-md disabled:opacity-50">
        已记忆，继续
      </button>
    </div>
  ):!show?(
    <div className="flex items-center gap-2 w-full">
      <button type="button" disabled={busy||!canPrev} onClick={onPrev} aria-label="上一题" className="px-3 py-3 rounded-xl text-sm font-bold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 disabled:opacity-40 inline-flex items-center gap-1 shrink-0">
        <ChevronLeft size={16} aria-hidden="true"/> 上一题
      </button>
      <button type="button" disabled={busy} onClick={()=>patch({result:big?'self':'forgot'})} className="flex-1 px-4 py-3 rounded-xl text-sm font-bold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm disabled:opacity-50">
        {big?'展示参考答案':'忘记了，查看答案'}
      </button>
    </div>
  ):(
    <div className={`grid gap-2 w-full ${ratingButtons.length===1?'grid-cols-1':ratingButtons.length===2?'grid-cols-2':'grid-cols-4'}`}>
      {ratingButtons.map(([r,t,tone])=>(
        <button key={r} type="button" disabled={busy} onClick={()=>onDone(r)} className={`px-2 py-2.5 rounded-xl text-xs font-bold border transition-all disabled:opacity-50 ${tone}`}>
          {t}
        </button>
      ))}
    </div>
  );

  const desktopControls=isHistory?(
    <div className="flex flex-col gap-3 w-full">
      <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-3.5 py-3 text-center dark:border-slate-700 dark:bg-slate-800/60">
        <div className="text-xs text-slate-500 dark:text-slate-400">上次评分记录</div>
        <div className="mt-1 text-sm font-bold text-slate-800 dark:text-slate-100">{ratingText}</div>
      </div>
      <button type="button" disabled={busy} onClick={onCurrent} className="w-full min-h-[44px] px-4 py-3 rounded-2xl text-sm font-bold text-white bg-gradient-to-r from-blue-500 to-blue-700 hover:from-blue-600 hover:to-blue-800 shadow-md transition-all disabled:opacity-50">
        回到当前学习
      </button>
    </div>
  ):intro?(
    <div className="flex flex-col gap-2.5 w-full">
      <button type="button" disabled={busy} onClick={()=>onDone()} className="w-full min-h-[44px] px-4 py-3.5 rounded-2xl text-sm font-bold text-white bg-gradient-to-r from-blue-500 to-blue-700 hover:from-blue-600 hover:to-blue-800 shadow-md transition-all disabled:opacity-50 inline-flex items-center justify-between">
        <span>已记忆，继续</span>
        <kbd aria-hidden="true" className={kbdClass+' border-white/30 bg-white/15 text-white'}>Space</kbd>
      </button>
      <button type="button" disabled={busy} onClick={()=>onDone(1)} className="w-full min-h-[44px] px-4 py-3 rounded-2xl text-sm font-bold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition-all disabled:opacity-50 inline-flex items-center justify-between">
        <span>比较难记</span>
        <kbd aria-hidden="true" className={kbdClass+' border-slate-300 bg-slate-100 text-slate-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300'}>1</kbd>
      </button>
    </div>
  ):!show?(
    <button type="button" disabled={busy} onClick={()=>patch({result:big?'self':'forgot'})} className="w-full min-h-[44px] px-4 py-3.5 rounded-2xl text-sm font-bold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 shadow-sm transition-all disabled:opacity-50 inline-flex items-center justify-center gap-2">
      <span>{big?'展示参考答案':'忘记了，查看答案'}</span>
      <kbd aria-hidden="true" className={kbdClass+' border-slate-300 bg-slate-100 text-slate-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300'}>Space</kbd>
    </button>
  ):(
    <div className="flex flex-col gap-2.5 w-full">
      {ratingButtons.map(([r,t,tone])=>(
        <button key={r} type="button" disabled={busy} onClick={()=>onDone(r)} className={`w-full min-h-[44px] px-4 py-3 rounded-2xl text-sm font-bold border transition-all disabled:opacity-50 inline-flex items-center justify-between ${tone}`}>
          <span>{t}</span>
          <kbd aria-hidden="true" className={`${kbdClass} ${r===4?'border-white/30 bg-white/15 text-white':'border-current/25 bg-white/60 dark:bg-black/20'}`}>{r}</kbd>
        </button>
      ))}
    </div>
  );

  return (
    <>
      <QuestionStageProgress card={card} now={now} isHistory={isHistory} historyPos={historyPos}/>

      <div className="grid md:grid-cols-3 gap-4 md:gap-6 items-stretch">
        {big?(
          <div className="md:col-span-2 bg-white rounded-[1.5rem] md:rounded-[2rem] p-5 md:p-8 shadow-sm border border-slate-200 animate-enter h-full flex flex-col dark:bg-slate-900 dark:border-slate-800">
            <div className="flex items-center gap-3 mb-4 md:mb-6">
              <span className="px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider shrink-0 bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300">
                简答题
              </span>
              {q.category&&<span className="text-slate-400 text-xs md:text-sm font-medium truncate dark:text-slate-500">{q.category}</span>}
            </div>
            <h2 className="font-bold text-lg md:text-2xl leading-relaxed text-slate-800 dark:text-slate-100 [text-wrap:balance]">{q.question}</h2>
            {!show&&(
              <textarea
                value={answer.text||''}
                onChange={e=>patch({text:e.target.value})}
                aria-label="先独立回忆，可在此输入要点" placeholder="先独立回忆，可在此输入要点…"
                className="mt-5 w-full rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-sm text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:bg-slate-800"
                rows={5}
              />
            )}
          </div>
        ):(
          <QuizQuestionPanel
            currentQ={q}
            isQuiz={!intro&&!(result==='forgot')}
            isAnswered={show}
            selectedIndices={selected}
            fillInputs={inputs}
            onOptionClick={i=>{if(show||busy||isHistory)return;if(q.type==='multiple')patch({selected:selected.includes(i)?selected.filter(x=>x!==i):[...selected,i]});else submit([i]);}}
            onSubmit={()=>submit()}
            onFillInputChange={(i,v)=>{if(isHistory)return;const next=[...inputs];next[i]=v;patch({inputs:next});}}
            onFillSubmit={({usedHint}={})=>{if(show||busy||isHistory)return;patch({usedHint:!!usedHint,result:gradeFill(inputs,parseFillAnswer(q.options?.[0],q.question)).isCorrect?(usedHint?'hint':'correct'):'wrong'});}}
          />
        )}

        <div className="md:hidden fixed bottom-0 left-0 right-0 z-40">
          <div className="flex items-center justify-center bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 px-3 py-3 w-full mobile-safe-bottom">
            {mobileControls}
          </div>
        </div>

        <div className="hidden md:flex h-full flex-col justify-between bg-white dark:bg-slate-900 rounded-[1.5rem] md:rounded-[2rem] shadow-sm border border-slate-200 dark:border-slate-800 p-5 md:p-6 animate-enter gap-4">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{isHistory?'历史答题':intro?'记忆确认':!show?'独立回忆':'记忆评分'}</span>
           </div>

          <div className="my-auto">
            {desktopControls}
          </div>

          <div className="space-y-3 border-t border-slate-100 dark:border-slate-800 pt-3">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={busy||!canPrev}
                onClick={onPrev}
                className="min-h-[40px] px-3 py-2 rounded-xl text-xs font-bold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none transition-all inline-flex items-center justify-center gap-1 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <ChevronLeft size={14} aria-hidden="true"/>
                <span>上一题</span>
              </button>
              <button
                type="button"
                disabled={busy||!canNext}
                onClick={onNext}
                className="min-h-[40px] px-3 py-2 rounded-xl text-xs font-bold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none transition-all inline-flex items-center justify-center gap-1 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <span>下一题</span>
                <ChevronRight size={14} aria-hidden="true"/>
              </button>
            </div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 text-center leading-relaxed">
              {isHistory?'← / → 切换历史题 · Esc 返回计划':intro?'Space 继续 · 1 难记 · ←/→ 切题':!show?'1-4/A-D 选答案 · Space 看答案':'1-4 评分 · Space 记得 · ←/→ 切题'}
            </p>
          </div>
        </div>
      </div>

      {show&&(
        <div className="bg-white rounded-[1.5rem] md:rounded-[2rem] p-5 md:p-8 shadow-sm border border-slate-200 animate-enter space-y-4 dark:bg-slate-900 dark:border-slate-800">
          {!intro&&result!=='self'&&(
            <div
              role="status"
              className={`inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-bold ${
                result==='correct'
                  ?'bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300'
                  :'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
              }`}
            >
              {result==='correct'?<CheckCircle2 size={15} aria-hidden="true"/>:<AlertCircle size={15} aria-hidden="true"/>}
              <span>{result==='correct'?'回答正确':result==='hint'?'使用提示后答对':'需要重新巩固'}</span>
            </div>
          )}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-green-600 dark:text-green-400">参考答案</h3>
            <div className="mt-1.5 whitespace-pre-wrap text-sm sm:text-base font-medium leading-relaxed text-slate-800 dark:text-slate-100 break-words">
              {solution}
            </div>
          </div>
          {q.explanation&&(
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 text-sm text-slate-600 dark:text-slate-300">
              <Markdown content={q.explanation}/>
            </div>
          )}
        </div>
      )}
    </>
  );
}
