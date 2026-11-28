import {localDay} from './scheduler.js';
export const FORMAT='qbank-smart-learning-v1';
export const LIMIT=20*1024*1024;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const day=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
export function makeBackup(subject,events,now=Date.now()){
  return {format:FORMAT,subject,exportedAt:now,events:events.map(e=>{const x={...e};delete x.synced;return x;})};
}
export function parseBackup(raw,subject,ids,now=Date.now()){
  if(typeof raw!=='string'||raw.length>LIMIT)throw Error('备份文件超过 20 MB 上限');
  const x=JSON.parse(raw);
  if(x?.format!==FORMAT||x.subject!==subject||!Array.isArray(x.events)||x.events.length>100000)throw Error('备份格式或科目不匹配');
  const validIds=new Set(ids),seen=new Set(),events=[];
  for(const e of x.events){
    if(!e||!uuid.test(e.id)||!Number.isSafeInteger(e.at)||e.at<1577836800000||e.at>now+86400000||!day(e.day)||seen.has(e.id))throw Error('备份包含无效或重复事件');
    seen.add(e.id);
    const base={id:e.id,at:e.at,day:localDay(e.at),kind:e.kind};
    if(e.kind==='plan'){
      const p=e.plan;
      if(!p||!day(p.exam)||!Number.isInteger(p.reserve)||p.reserve<0||p.reserve>30||typeof p.scope!=='string'||p.scope.length>200||![undefined,.85,.9,.95].includes(p.target))throw Error('备份计划无效');
      events.push({...base,plan:{exam:p.exam,reserve:p.reserve,scope:p.scope,target:p.target??.9}});
    }else{
      if(!validIds.has(e.questionId))throw Error('备份含当前题库不存在的题目，请先恢复相应题库版本');
      if(e.kind==='intro')events.push({...base,questionId:e.questionId,...(e.difficult===true?{difficult:true}:{})});
      else if(e.kind==='rate'&&[1,2,3,4].includes(e.rating))events.push({...base,questionId:e.questionId,rating:e.rating,...(e.source==='practice'?{source:'practice'}:{})});
      else throw Error('备份学习事件无效');
    }
  }
  return events;
}
// Existing local/remote events are authoritative on identical IDs.
export function mergeBackup(existing,imported){
  const seen=new Set(existing.map(e=>e.id));
  return [...existing,...imported.filter(e=>!seen.has(e.id))];
}
