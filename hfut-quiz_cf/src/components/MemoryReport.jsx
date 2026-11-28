import {useMemo,useState} from 'react';
import {memoryLevel,recallProbability,dayStart,localDay,DAY} from '../learning/scheduler';
const labels={new:'未学习',weak:'待巩固 / 薄弱',learning:'巩固中',stable:'记忆稳定',long:'长期记忆'};
const colors={new:'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200',weak:'bg-rose-600 text-white',learning:'bg-amber-400 text-slate-950',stable:'bg-emerald-500 text-slate-950',long:'bg-emerald-800 text-white'};
export default function MemoryReport({ids,cards,activity,bank,now,exam,onPractice}){
  const [filter,setFilter]=useState('all'),[selected,setSelected]=useState(null),[page,setPage]=useState(0);
  const entries=useMemo(()=>ids.map((id,i)=>({id,i,level:memoryLevel(cards[id],now),category:bank.get(id)?.category||'未分类'})),[ids,cards,bank,now]);
  const groups=Object.fromEntries(Object.keys(labels).map(k=>[k,entries.filter(e=>e.level===k).length]));
  const visible=entries.filter(e=>filter==='all'||e.level===filter);
  const currentPage=Math.min(page,Math.max(0,Math.ceil(visible.length/120)-1));
  const detail=selected&&bank.get(selected);
  const card=selected&&cards[selected];
  const estimated=ids.reduce((n,id)=>n+(recallProbability(cards[id],dayStart(exam)+DAY/2)||0),0)/Math.max(1,ids.length);
  const cross=Object.values(activity).reduce((a,r)=>[a[0]+r.crossSuccess,a[1]+r.crossDay],[0,0]);
  const chapters=Object.entries(entries.reduce((a,e)=>{const row=a[e.category]??={total:0,stable:0};row.total++;if(e.level==='stable'||e.level==='long')row.stable++;return a;},Object.create(null)));
  return <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 dark:border-slate-800 dark:bg-slate-900 space-y-5">
    <h2 className="text-lg font-bold">记忆分析</h2>
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      <div><p className="text-xs text-slate-500">全题库长期记忆</p><b className="text-xl">{groups.long}/{ids.length}</b></div>
      <div><p className="text-xs text-slate-500">跨天回忆成功率</p><b className="text-xl">{cross[1]?Math.round(100*cross[0]/cross[1])+'%':'—'}</b></div>
      <div><p className="text-xs text-slate-500">考试日预计记忆水平</p><b className="text-xl">{Math.round(100*estimated)}%</b></div>
    </div>
    <p className="text-xs text-slate-500">跨天成功指自评记得或很熟悉；预测按当前状态且不再复习估算，未检测题按零计，并非考试成绩。</p>
    <div><h3 className="font-bold mb-2">最近 7 天学习活动</h3><div className="grid grid-cols-7 gap-1">{Array.from({length:7},(_,i)=>{const d=localDay(now-(6-i)*DAY),r=activity[d];return <div key={d} className="bg-slate-50 dark:bg-slate-800 rounded-lg p-2 text-center"><b>{r?.attempts||0}</b><p className="text-xs text-slate-500">{d.slice(5)}</p><p className="text-xs text-indigo-600 dark:text-indigo-300">+{r?.new||0}</p></div>;})}</div><p className="text-xs text-slate-500 mt-1">上：回忆次数 · 下：新题数</p></div>
    <div><h3 className="font-bold mb-2">章节稳定记忆进度</h3><div className="space-y-2">{chapters.map(([name,row])=><div key={name}><div className="flex justify-between text-xs mb-1"><span>{name}</span><span>{row.stable}/{row.total}</span></div><div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden"><div className="bg-emerald-500 h-full" style={{width:100*row.stable/row.total+'%'}}/></div></div>)}</div></div>
    <div><div className="flex flex-wrap items-center justify-between gap-2 mb-3"><h3 className="font-bold">全题库记忆热力图</h3><label className="text-sm">筛选 <select className="border rounded-lg p-1 bg-transparent dark:bg-slate-900" value={filter} onChange={e=>{setFilter(e.target.value);setPage(0);setSelected(null);}}><option value="all">全部</option>{Object.entries(labels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label></div>
      <div className="flex flex-wrap gap-2 mb-3">{Object.entries(labels).map(([k,v])=><span key={k} className="text-xs flex items-center gap-1"><span className={'w-3 h-3 rounded '+colors[k]}/>{v} {groups[k]}</span>)}</div>
      <div className="grid grid-cols-8 sm:grid-cols-12 gap-1.5">{visible.slice(currentPage*120,(currentPage+1)*120).map(e=><button key={e.id} title={e.id+' '+labels[e.level]} aria-label={'第'+(e.i+1)+'题 '+labels[e.level]} aria-pressed={selected===e.id} onClick={()=>setSelected(e.id)} className={'rounded-md min-h-9 text-xs font-bold '+colors[e.level]+(selected===e.id?' ring-2 ring-indigo-600 ring-offset-1':'')}>{e.i+1}</button>)}</div>
      {visible.length>120&&<div className="flex justify-between items-center mt-3 text-sm"><button disabled={!currentPage} className="disabled:opacity-30" onClick={()=>setPage(currentPage-1)}>上一页</button><span>{currentPage+1}/{Math.ceil(visible.length/120)}</span><button disabled={(currentPage+1)*120>=visible.length} className="disabled:opacity-30" onClick={()=>setPage(currentPage+1)}>下一页</button></div>}
      {!visible.length&&<p className="text-sm text-slate-500">当前分类暂无题目</p>}
      {detail&&<div className="mt-3 border rounded-xl p-3 dark:border-slate-700 space-y-2"><p className="text-xs text-slate-500">{selected} · {labels[memoryLevel(card,now)]}</p><p className="font-medium">{detail.question}</p><p className="text-sm">预计记忆率：{card?.stability?Math.round(100*recallProbability(card,now))+'%':'暂无'} · 下次复习：{card?new Date(card.due).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'}):'未安排'}</p><p className="text-xs text-slate-500">检测 {card?.reps||0} 次 · 跨期遗忘 {card?.lapses||0} 次</p><button className="text-indigo-600 dark:text-indigo-300 font-bold text-sm" onClick={()=>onPractice(selected)}>{card?'立即强化':'学习此题'}</button></div>}
    </div>
  </section>;
}
