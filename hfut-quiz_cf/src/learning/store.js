import localforage from 'localforage';
import { api } from '../api';
const db=localforage.createInstance({name:'qbank-smart-learning',storeName:'learning_v1'});
const key=(user,subject)=>String(user?.id??'guest')+':'+subject;
export async function loadLearning(user,subject) {
  return (await db.getItem(key(user,subject)))||{events:[],cursor:0};
}
export async function saveLearning(user,subject,data) {
  await db.setItem(key(user,subject),data);
}
export function unionEvents(...lists) {
  const events=new Map();
  for(const list of lists)for(const e of list||[])if(e?.id)events.set(e.id,e);
  return [...events.values()];
}
export async function exchangeLearning(user,subject,data) {
  if(!user||subject.startsWith('custom_'))return data;
  let cursor=data.cursor||0;
  let events=data.events;
  // Server deduplicates retries by event ID; send unsynced events in bounded batches.
  const pending=events.filter(e=>!e.synced);
  for(let i=0;i<pending.length;i+=50){
    const res=await api.request('/learning/events','POST',{subject,events:pending.slice(i,i+50).map(e=>{const copy={...e};delete copy.synced;return copy;})});
    if(!res?.success)throw new Error('学习记录上传未确认');
  }
  for(let page=0;page<100;page++){
    const res=await api.request('/learning/events?subject='+encodeURIComponent(subject)+'&after='+cursor);
    if(!res?.success||!Array.isArray(res.events))throw new Error('学习记录下载未确认');
    events=unionEvents(events,res.events.map(e=>({...e,synced:true})));
    cursor=res.cursor;
    if(!res.more)break;
  }
  return {events,cursor};
}
