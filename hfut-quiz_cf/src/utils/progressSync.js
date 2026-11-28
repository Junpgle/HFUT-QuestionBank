export const FIELDS=['brushedIds','memorizedIds','masteredIds','wrongIds','favoriteIds'];
export const isOfficial=id=>typeof id==='string'&&id.length>0&&id.length<=160&&!id.startsWith('custom_');
export const historyKey=h=>JSON.stringify([String(h?.id??''),String(h?.questionId??''),String(h?.timestamp??'')]);
const validHistory=h=>h&&isOfficial(h.questionId)&&typeof h.timestamp==='string'&&Number.isFinite(Date.parse(h.timestamp));
export function normalizeProgress(input={},limit=Infinity){
  input=input||{};
  const out={};
  for(const k of FIELDS)out[k]=[...new Set(Array.from(Array.isArray(input[k])||input[k] instanceof Set?input[k]:[]).filter(isOfficial))].sort();
  const map=new Map();
  for(const h of Array.isArray(input.history)?input.history:[])if(validHistory(h)&&!map.has(historyKey(h)))map.set(historyKey(h),h);
  out.history=[...map.values()].sort((a,b)=>Date.parse(b.timestamp)-Date.parse(a.timestamp)||historyKey(a).localeCompare(historyKey(b))).slice(0,limit);
  return out;
}
export function diffProgress(before,after,makeId=()=>crypto.randomUUID()){
  const a=normalizeProgress(before),b=normalizeProgress(after),ops=[];
  for(const field of [...FIELDS,'history']){
    const map=x=>new Map(x[field].map(v=>[field==='history'?historyKey(v):v,v]));
    const old=map(a),next=map(b);
    for(const [key,value] of next)if(!old.has(key))ops.push({id:makeId(),field,key,value});
    for(const key of old.keys())if(!next.has(key))ops.push({id:makeId(),field,key,value:null});
  }
  return ops;
}
export function applyOps(input,ops,limit=Infinity){
  const out=normalizeProgress(input);
  const maps=Object.fromEntries([...FIELDS,'history'].map(k=>[k,new Map(out[k].map(v=>[k==='history'?historyKey(v):v,v]))]));
  for(const o of ops){const m=maps[o.field];if(!m)continue;if(o.value===null)m.delete(o.key);else m.set(o.key,o.value);}
  for(const k of [...FIELDS,'history'])out[k]=[...maps[k].values()];
  return normalizeProgress(out,limit);
}
export function coalesceOps(...lists){
  const m=new Map();
  for(const list of lists)for(const o of list||[])m.set(JSON.stringify([o.field,o.key]),o);
  return [...m.values()];
}
export function acknowledgeOps(pending,ids){const ack=new Set(ids);return pending.filter(o=>!ack.has(o.id));}
export function mergeLegacy(a,b,limit=500){
  const x=normalizeProgress(a),y=normalizeProgress(b);
  return normalizeProgress(Object.fromEntries([...FIELDS,'history'].map(k=>[k,[...x[k],...y[k]]])),limit);
}
// The cloud stores the latest 500 histories. Preserve local records older than its window.
export function reconcileProgress(cloud,local,pending){
  const remote=normalizeProgress(cloud,500),old=normalizeProgress(local);
  if(remote.history.length>=500){
    const cutoff=Date.parse(remote.history.at(-1).timestamp);
    remote.history.push(...old.history.filter(h=>Date.parse(h.timestamp)<cutoff));
  }
  return applyOps(remote,pending);
}
export function makeJournal(view){
  const all=normalizeProgress(view);
  return {view:all,pending:diffProgress({},normalizeProgress(all,500)),lastPull:0};
}
export function observeJournal(journal,view){
  const next=normalizeProgress(view),delta=diffProgress(journal.view,next);
  if(!delta.length)return journal;
  return {...journal,view:next,pending:coalesceOps(journal.pending,delta)};
}

// Persist only newly observed operations, never replace another tab's dirty log.
// The server response is canonical; preserve all pending operations not acknowledged by ID.
export function mergeJournalWrite(stored,previous,next,mode='local',cloud=null,ack=[]){
  if(!stored?.view||!Array.isArray(stored.pending))return next;
  const oldIds=new Set((previous?.pending||[]).map(o=>o.id));
  const newOps=next.pending.filter(o=>!oldIds.has(o.id));
  if(mode==='remote'){
    const pending=coalesceOps(acknowledgeOps(stored.pending,ack),newOps);
    return {...stored,...next,pending,view:reconcileProgress(cloud,stored.view,pending)};
  }
  if(mode==='init'){
    // A concurrently opened tab may have already saved a journal during initialization.
    const pending=coalesceOps(stored.pending,next.pending);
    return {...stored,...next,pending,view:applyOps(stored.view,pending)};
  }
  const pending=coalesceOps(stored.pending,newOps);
  return {...stored,...next,pending,view:applyOps(stored.view,newOps)};
}
