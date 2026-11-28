import {BATCH_SIZE,pendingEvents} from './sync-policy.js';
const plain=e=>{const x={...e};delete x.synced;return x;};
const verify=(r,uid)=>{if(!r?.success||String(r.userId)!==String(uid))throw Error('云端账号或响应验证失败');};
function verifyPage(r,uid,after){
  verify(r,uid);
  if(!Array.isArray(r.events)||!Number.isSafeInteger(r.cursor)||r.cursor<after||(r.more&&r.cursor===after))throw Error('学习记录增量响应无效');
}
export async function exchangePages({data,subject,uid,request,checkpoint,legacy=false,onLegacy=()=>{},keepalive=false,maxPages=100}){
  const pending=pendingEvents(data);let cursor=data.cursor||0,offset=0,more=true;
  for(let i=0;i<maxPages&&(offset<pending.length||more);i++){
    const batch=pending.slice(offset,offset+BATCH_SIZE),events=batch.map(plain);
    let res;
    if(!legacy){
      try{res=await request('/learning/exchange','POST',{subject,after:cursor,events},{keepalive});}
      catch(e){if(e.status!==404&&e.status!==405)throw e;legacy=true;onLegacy();}
    }
    if(legacy){
      if(batch.length){
        const ack=await request('/learning/events','POST',{subject,events},{keepalive});
        verify(ack,uid);
        // Persist acknowledged uploads even if the subsequent pull fails.
        await checkpoint({ack:batch,remote:[],cursor,more:true,complete:false});
      }
      res=await request('/learning/events?subject='+encodeURIComponent(subject)+'&after='+cursor,'GET',null,{keepalive});
    }
    verifyPage(res,uid,cursor);
    if(!legacy&&(!Array.isArray(res.ack)||batch.some(e=>!res.ack.includes(e.id))))throw Error('云端未确认全部上传事件');
    offset+=batch.length;cursor=res.cursor;more=!!res.more;
    const complete=offset>=pending.length&&!more;
    await checkpoint({ack:batch,remote:res.events,cursor,more:!complete,complete});
  }
  if(offset<pending.length||more)throw Error('学习记录分页尚未完成，将继续同步');
}
