export const IDLE_MS=30000, MAX_WAIT_MS=300000, PULL_COOLDOWN_MS=300000, BATCH_SIZE=50;
export const pendingEvents=data=>data.events.filter(e=>!e.synced);
export function retryDelay(failures){return Math.min(30*60000,30000*2**Math.min(10,Math.max(0,failures-1)));}
// The first dirty event sets a hard deadline; subsequent events only move the idle deadline.
export function nextSyncAt(data,now){
  const pending=pendingEvents(data);
  if(!pending.length&&!data.hasMore)return null;
  let due=now;
  if(pending.length&&pending.length<BATCH_SIZE&&!data.hasMore){
    let first=now,last=0;
    for(const e of pending){const at=Math.min(now,e.at);first=Math.min(first,at);last=Math.max(last,at);}
    due=Math.min(first+MAX_WAIT_MS,last+IDLE_MS);
  }
  return Math.max(now,due,data.retryAt||0);
}
export function shouldSync(data,reason,now){
  if(reason==='manual')return true;
  if((data.retryAt||0)>now)return false;
  const dirty=pendingEvents(data).length>0||data.hasMore;
  if(reason==='enter')return (!data.lastSyncAt||now-data.lastSyncAt>=PULL_COOLDOWN_MS);
  if(reason==='exit'||reason==='hidden'||reason==='online')return !!dirty;
  const at=nextSyncAt(data,now);
  return at!==null&&at<=now;
}
