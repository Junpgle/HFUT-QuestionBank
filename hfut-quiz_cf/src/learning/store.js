import localforage from 'localforage';
import { api } from '../api';
import { localDay,replayEvents } from './scheduler';
import {mergeBackup} from './backup';
import {cardVersion} from './session';
import {nextSyncAt,shouldSync,retryDelay} from './sync-policy';
import {exchangePages} from './sync-transport';
const db=localforage.createInstance({name:'qbank-smart-learning',storeName:'learning_v1'});
const key=(user,subject)=>String(user?.id??'guest')+':'+subject;
const queues=new Map(), exchanges=new Map(), subscribers=new Map();
const channel=typeof BroadcastChannel!=='undefined'?new BroadcastChannel('qbank-learning-v1'):null;
function notify(k){for(const cb of subscribers.get(k)||[])cb();}
if(channel)channel.onmessage=e=>{if(typeof e.data==='string')notify(e.data);};
export function subscribeLearning(user,subject,cb){const k=key(user,subject);if(!subscribers.has(k))subscribers.set(k,new Set());const set=subscribers.get(k);set.add(cb);return ()=>{set.delete(cb);if(!set.size)subscribers.delete(k);};}
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
    if(next!==old){await db.setItem(key(user,subject),next);notify(key(user,subject));channel?.postMessage(key(user,subject));}
    return next;
  });
}
export function appendLearning(user,subject,e,expected=null){
  return updateLearning(user,subject,old=>{
    if(expected){const state=replayEvents(old.events);if(cardVersion(state.cards[e.questionId])!==expected.version||state.plan?.scope!==expected.scope||state.plan?.exam!==expected.exam){const error=Error('题目已在其他窗口或设备更新，请继续最新学习任务');error.code='STALE_CARD';throw error;}}
    // Give successive local events deterministic chronological order even within a millisecond.
    const max=old.events.reduce((n,x)=>x.at<=e.at+1000?Math.max(n,x.at):n,0);
    const at=Math.max(e.at,max+1);
    return {...old,events:unionEvents(old.events,[{...e,at,day:localDay(at)}])};
  });
}
function checkAccount(user){
  if(String(api.getCurrentUser()?.id)!==String(user.id))throw Error('账号已切换，请重新同步');
}
const timers=new Map(),known=new Map();
let legacyUntil=0;
function remember(user,subject){if(user&&!subject.startsWith('custom_'))known.set(key(user,subject),{user,subject});}
function clearTimer(k){if(timers.has(k)){clearTimeout(timers.get(k));timers.delete(k);}}
function online(){return globalThis.navigator?.onLine!==false;}
export function exchangeLearning(user,subject,reason='manual'){
  if(!user||subject.startsWith('custom_'))return loadLearning(user,subject);
  remember(user,subject);
  const k=key(user,subject);
  if(exchanges.has(k))return exchanges.get(k);
  const run=()=>performExchange(user,subject,reason);
  // Distinct lock from local writes: only one tab performs network exchange at once.
  const work=globalThis.navigator?.locks?navigator.locks.request('qbank-learning-network:'+k,run):run();
  const p=work.finally(()=>{exchanges.delete(k);scheduleLearningSync(user,subject).catch(()=>{});});
  exchanges.set(k,p);return p;
}
async function performExchange(user,subject,reason){
  const k=key(user,subject);
  checkAccount(user);
  const snapshot=await loadLearning(user,subject);
  if(!online()){if(reason==='manual')throw Error('当前网络离线，本地学习记录仍保留');return snapshot;}
  if(!shouldSync(snapshot,reason,Date.now()))return snapshot;
  clearTimer(k);
  let result=snapshot;
  const request=async(...args)=>{checkAccount(user);const r=await api.request(...args);checkAccount(user);return r;};
  try{
    await exchangePages({
      data:snapshot,subject,uid:user.id,request,legacy:Date.now()<legacyUntil,
      onLegacy:()=>{legacyUntil=Date.now()+5*60000;},
      keepalive:reason==='hidden',
      checkpoint:async({ack,remote,cursor,more,complete})=>{
        checkAccount(user);
        result=await updateLearning(user,subject,old=>({...old,
          events:unionEvents(old.events,ack.map(e=>({...e,synced:true})),remote.map(e=>({...e,synced:true}))),
          cursor:Math.max(old.cursor||0,cursor),hasMore:more,
          ...(complete?{lastSyncAt:Date.now(),retryAt:0,syncFailures:0,syncError:null}:{})
        }));
      }
    });
    return result;
  }catch(err){
    if(String(api.getCurrentUser()?.id)===String(user.id)){
      await updateLearning(user,subject,old=>{const n=(old.syncFailures||0)+1;return {...old,syncFailures:n,retryAt:Date.now()+retryDelay(n),syncError:'云同步暂不可用，本地记录仍保留。'};});
    }
    throw err;
  }
}
// No network polling: only pending events arm a one-shot timer.
export async function scheduleLearningSync(user,subject){
  if(!user||subject.startsWith('custom_'))return;
  remember(user,subject);
  const k=key(user,subject);
  const data=await loadLearning(user,subject);
  clearTimer(k);
  if(!online()||exchanges.has(k)||String(api.getCurrentUser()?.id)!==String(user.id))return;
  const due=nextSyncAt(data,Date.now());
  if(due===null)return;
  timers.set(k,setTimeout(()=>{
    timers.delete(k);
    exchangeLearning(user,subject,'timer').catch(e=>console.warn('智能学习同步延后',e));
  },Math.max(0,due-Date.now())));
}
function flushKnown(reason){
  for(const {user,subject} of known.values())if(String(api.getCurrentUser()?.id)===String(user.id)){
    exchangeLearning(user,subject,reason).catch(()=>{});
  }
}
if(typeof window!=='undefined'){
  window.addEventListener('online',()=>flushKnown('online'));
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flushKnown('hidden');});
  window.addEventListener('pagehide',()=>flushKnown('hidden'));
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
    if(rating===3&&((card.phase==='review'&&card.lastReview&&localDay(card.lastReview)===localDay(at))||card.due>at&&card.phase!=='review'))return old;
    changed=true;
    return {...old,events:unionEvents(old.events,[makeLearningEvent('rate',{questionId,rating,source:'practice'},at)])};
  });
  if(changed&&user&&!subject.startsWith('custom_'))scheduleLearningSync(user,subject).catch(()=>{});
  return changed?next:null;
}

export async function importLearning(user,subject,events){
  const next=await updateLearning(user,subject,old=>({...old,events:mergeBackup(old.events,events)}));
  scheduleLearningSync(user,subject).catch(()=>{});
  return next;
}
