export const FIELDS=['brushedIds','memorizedIds','masteredIds','wrongIds','favoriteIds'];
export const isOfficial=id=>typeof id==='string'&&id.length>0&&id.length<=160&&!id.startsWith('custom_');
export const historyKey=h=>JSON.stringify([String(h?.id??''),String(h?.questionId??''),String(h?.timestamp??'')]);
const validHistory=h=>h&&isOfficial(h.questionId)&&typeof h.timestamp==='string'&&Number.isFinite(Date.parse(h.timestamp));
export function normalizeProgress(input={},limit=Infinity){
  input=input||{};
  const out={};
  for(const k of FIELDS)out[k]=[...new Set(Array.from(input[k]||[]).filter(isOfficial))].sort();
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

const COLS=['brushed_ids','memorized_ids','mastered_ids','wrong_ids','favorite_ids','history'];
const parse=x=>{try{return JSON.parse(x||'[]');}catch{return [];}};
const rowProgress=row=>normalizeProgress(Object.fromEntries([...FIELDS,'history'].map((k,i)=>[k,parse(row?.[COLS[i]])])),500);
export function validateOps(ops){
  if(!Array.isArray(ops)||ops.length>15000)throw Error('无效进度增量');
  const ids=new Set();
  return ops.map(o=>{
    if(!o||typeof o.id!=='string'||!/^[a-f0-9-]{36}$/i.test(o.id)||ids.has(o.id)||typeof o.key!=='string'||o.key.length>500||![...FIELDS,'history'].includes(o.field))throw Error('无效进度事件');
    ids.add(o.id);
    if(o.field==='history'){
      if(o.value!==null&&(!validHistory(o.value)||historyKey(o.value)!==o.key||JSON.stringify(o.value).length>16000))throw Error('无效历史记录');
    }else if(!isOfficial(o.key)||(o.value!==null&&o.value!==o.key))throw Error('无效题目状态');
    return {id:o.id,field:o.field,key:o.key,value:o.value};
  });
}
// Compare-and-swap protects the existing UserProgress table from concurrent stale overwrites.
// updated_at advances monotonically per user, including simultaneous writes in the same millisecond.
export async function mergeUserProgress(db,uid,{ops=null,legacy=null}={}){
  for(let attempt=0;attempt<8;attempt++){
    const row=await db.prepare('SELECT * FROM UserProgress WHERE user_id=?').bind(uid).first();
    const before=rowProgress(row);
    if(!ops?.length&&!legacy)return before;
    const after=ops?applyOps(before,ops,500):mergeLegacy(before,legacy,500);
    if(row&&JSON.stringify(before)===JSON.stringify(after))return after;
    const ts=new Date(Math.max(Date.now(),(Date.parse(row?.updated_at)||0)+1)).toISOString();
    const values=[...FIELDS,'history'].map(k=>JSON.stringify(after[k]));
    const result=row?await db.prepare('UPDATE UserProgress SET brushed_ids=?,memorized_ids=?,mastered_ids=?,wrong_ids=?,favorite_ids=?,history=?,updated_at=? WHERE user_id=? AND updated_at IS ?').bind(...values,ts,uid,row.updated_at).run():
      await db.prepare('INSERT INTO UserProgress(user_id,brushed_ids,memorized_ids,mastered_ids,wrong_ids,favorite_ids,history,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO NOTHING').bind(uid,...values,ts).run();
    if(result.meta?.changes===1)return after;
  }
  throw Error('进度正在并发更新，请稍后重试');
}
