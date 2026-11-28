import localforage from 'localforage';
import { api } from '../api';
import { localDay,replayEvents } from './scheduler';
const db=localforage.createInstance({name:'qbank-smart-learning',storeName:'learning_v1'});
const key=(user,subject)=>String(user?.id??'guest')+':'+subject;
const queues=new Map();
export function makeLearningEvent(kind,fields={},at=Date.now()){
  return {id:crypto.randomUUID(),kind,at,day:localDay(at),...fields};
}
export async function loadLearning(user,subject) {
  return (await db.getItem(key(user,subject)))||{events:[],cursor:0};
}
function exclusive(k,fn){
  if(globalThis.navigator?.locks)return navigator.locks.request('qbank-learning:'+k,fn);
  const prev=queues.get(k)||Promise.resolve();
  const next=prev.catch(()=>{}).then(fn);
  queues.set(k,next);
  return next.finally(()=>{if(queues.get(k)===next)queues.delete(k);});
}
export function unionEvents(...lists) {
  const events=new Map();
  for(const list of lists)for(const e of list||[])if(e?.id){
    const prev=events.get(e.id);
    if(!prev||e.synced||!prev.synced)events.set(e.id,e);
  }
  return [...events.values()];
}
export async function updateLearning(user,subject,mutate){
  return exclusive(key(user,subject),async()=>{
    const old=await loadLearning(user,subject);
    const next=mutate(old);
    if(next!==old)await db.setItem(key(user,subject),next);
    return next;
  });
}
export function appendLearning(user,subject,e){
  return updateLearning(user,subject,old=>{
    // Give successive local events deterministic chronological order even within a millisecond.
    const max=old.events.reduce((n,x)=>x.at<=e.at+1000?Math.max(n,x.at):n,0);
    const at=Math.max(e.at,max+1);
    return {...old,events:unionEvents(old.events,[{...e,at,day:localDay(at)}])};
  });
}
function checkAccount(user){
  if(String(api.getCurrentUser()?.id)!==String(user.id))throw Error('账号已切换，请重新同步');
}
export async function exchangeLearning(user,subject){
  if(!user||subject.startsWith('custom_'))return loadLearning(user,subject);
  checkAccount(user);
  const snapshot=await loadLearning(user,subject);
  let cursor=snapshot.cursor||0;
  const pending=snapshot.events.filter(e=>!e.synced);
  const ack=[];
  for(let i=0;i<pending.length;i+=50){
    checkAccount(user);
    const batch=pending.slice(i,i+50);
    const res=await api.request('/learning/events','POST',{subject,events:batch.map(e=>{const copy={...e};delete copy.synced;return copy;})});
    if(!res?.success)throw new Error('学习记录上传未确认');
    ack.push(...batch.map(e=>({...e,synced:true})));
  }
  const remote=[];
  for(let page=0;page<100;page++){
    checkAccount(user);
    const res=await api.request('/learning/events?subject='+encodeURIComponent(subject)+'&after='+cursor);
    if(!res?.success||!Array.isArray(res.events)||!Number.isSafeInteger(res.cursor)||res.cursor<cursor)throw new Error('学习记录下载未确认');
    remote.push(...res.events.map(e=>({...e,synced:true})));
    cursor=res.cursor;
    if(!res.more)break;
  }
  checkAccount(user);
  // Re-read under lock: network response must not overwrite answers written by another tab.
  return updateLearning(user,subject,old=>({...old,events:unionEvents(old.events,ack,remote),cursor:Math.max(old.cursor||0,cursor)}));
}
// Ordinary practice can strengthen an enrolled card, but never invent historical ratings.
export async function recordPractice(user,subject,questionId,isCorrect,usedHint=false){
  const at=Date.now();
  let changed=false;
  const next=await updateLearning(user,subject,old=>{
    const {plan,cards}=replayEvents(old.events);
    const card=cards[questionId];
    if(!plan||!card)return old;
    const rating=!isCorrect||usedHint?1:3;
    if(rating===3&&((card.lastReview&&localDay(card.lastReview)===localDay(at))||card.due>at&&card.phase!=='review'))return old;
    changed=true;
    return {...old,events:unionEvents(old.events,[makeLearningEvent('rate',{questionId,rating,source:'practice'},at)])};
  });
  if(changed&&user&&!subject.startsWith('custom_'))scheduleLearningSync(user,subject);
  return changed?next:null;
}

// One timer per subject/account; no request per answer. Offline failures retain pending events.
const timers=new Map();
export function scheduleLearningSync(user,subject){
  if(!user||subject.startsWith('custom_'))return;
  const k=key(user,subject);
  if(timers.has(k))return;
  const timer=setTimeout(()=>{
    timers.delete(k);
    exchangeLearning(user,subject).catch(e=>console.warn('智能学习同步延后',e));
  },15000);
  timers.set(k,timer);
}
