// FSRS-4.5 memory equations; fixed published default weights.
// https://open-spaced-repetition.github.io/ts-fsrs/guide/model/fsrs-4dot5
// Intra-day learning steps and exam deadlines are separate product policies.
export const DAY = 86400000;
const W = [0.4872,1.4003,3.7145,13.8206,5.1618,1.2298,0.8975,0.031,1.6474,0.1367,1.0461,2.1072,0.0793,0.3246,1.587,0.2272,2.8755];
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
export const MODEL = 'fsrs-4.5-qbank-1';
export function recallProbability(card, now) {
  if (!card?.stability || !card.lastReview) return null;
  return Math.pow(1+19/81*Math.max(0,now-card.lastReview)/DAY/card.stability,-0.5);
}
export function intervalDays(stability, target=0.9) {
  return clamp(Math.round(81*stability/19*(Math.pow(clamp(target,.8,.97),-2)-1)),1,36500);
}
export function rateCard(card, rating, now) {
  if (![1,2,3,4].includes(rating)) throw new Error('Invalid rating');
  let d, s;
  const first = !card.stability;
  if (first) {
    d=clamp(W[4]-(rating-3)*W[5],1,10);
    s=W[rating-1];
  } else {
    const r=recallProbability(card,now);
    d=clamp(W[7]*W[4]+(1-W[7])*(card.difficulty-W[6]*(rating-3)),1,10);
    // FSRS 4.5 is a day-scale model. Do not inflate stability with immediate retries.
    if (rating===1) s=Math.min(card.stability,W[11]*Math.pow(card.difficulty,-W[12])*(Math.pow(card.stability+1,W[13])-1)*Math.exp(W[14]*(1-r)));
    else if (now-card.lastReview<DAY/2) s=card.stability;
    else s=card.stability*(1+Math.exp(W[8])*(11-card.difficulty)*Math.pow(card.stability,-W[9])*(Math.exp(W[10]*(1-r))-1)*(rating===2?W[15]:1)*(rating===4?W[16]:1));
  }
  s=clamp(s,.01,36500);
  const short=rating===1 || rating===2;
  const initial=first || card.phase==='learning' || card.phase==='relearning';
  return {...card,difficulty:d,stability:s,lastReview:now,reps:(card.reps||0)+1,
    lapses:(card.lapses||0)+(rating===1&&!first&&card.phase==='review'?1:0),
    phase:short?(card.phase==='review'||card.phase==='relearning'?'relearning':'learning'):'review',
    due:now+(short?(rating===1?5:10)*60000:(initial?1:intervalDays(s))*DAY),model:MODEL};
}
export function localDay(t=Date.now()) {
  const d=new Date(t);
  return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
}
const dayNumber = s => Date.parse(s+'T00:00:00Z')/DAY;
export function daysUntil(exam,now) {return Math.max(0,dayNumber(exam)-dayNumber(localDay(now))||0);}
export function dailyPlan(ids,cards,plan,now) {
  const day=localDay(now);
  const todayNew=ids.filter(id=>cards[id]?.introducedDay===day).length;
  const unseen=ids.filter(id=>!cards[id]);
  const days=daysUntil(plan.exam,now);
  const reserve=Math.min(plan.reserve,Math.max(0,days-1));
  const remainingDays=Math.max(1,days-reserve);
  const quota=days===0?0:Math.ceil((unseen.length+todayNew)/remainingDays);
  return {days,reserve,quota,todayNew,unseen,remainingNew:Math.min(unseen.length,Math.max(0,quota-todayNew))};
}
export function replayEvents(events) {
  const cards=Object.create(null);
  const seen=new Set();
  let plan=null, step=0,lastId=null;
  const todayCounts=Object.create(null);
  for(const e of [...events].sort((a,b)=>a.at-b.at||a.id.localeCompare(b.id))) {
    if(seen.has(e.id))continue;
    seen.add(e.id);
    if(e.kind==='plan'){plan=e.plan;continue;}
    const id=e.questionId;
    if(e.kind==='intro'){
      if(cards[id])continue;
      step++;lastId=id;
      cards[id]={phase:'learning',introducedDay:e.day,firstSeen:e.at,due:e.at,eligibleStep:step+3,attempts:0};
    }else if(e.kind==='rate'&&cards[id]){
      step++;lastId=id;
      const old=cards[id];
      const attemptDay=e.day;
      const attempts=old.attemptDay===attemptDay?(old.attempts||0)+1:1;
      const next=rateCard(old,e.rating,e.at);
      const nextDay=attempts>=4 && next.phase!=='review';
      const tomorrow=new Date(e.at);tomorrow.setHours(24,0,0,0);
      cards[id]={...next,attemptDay,attempts,eligibleStep:step+3,due:nextDay?Math.max(next.due,tomorrow.getTime()):next.due};
      if(old.phase==='review'){
        (todayCounts[e.day]??=new Set()).add(id);
      }
    }
  }
  return {cards,plan,step,lastId,todayCounts};
}
export function chooseNext({ids,state,now,extra=false,priorityIds=[]}) {
  const {cards,plan,step,lastId}=state;
  if(!plan)return null;
  const p=dailyPlan(ids,cards,plan,now);
  const candidates=ids.filter(id=>id!==lastId);
  const short=candidates.filter(id=>cards[id]&&cards[id].phase!=='review'&&cards[id].due<=now&&
    (cards[id].attemptDay!==localDay(now)||cards[id].attempts<4)&&
    (cards[id].eligibleStep<=step||localDay(cards[id].lastReview||cards[id].firstSeen)!==localDay(now)));
  short.sort((a,b)=>cards[a].due-cards[b].due);
  const examTime=new Date(plan.exam+'T00:00:00').getTime();
  const due=candidates.filter(id=>{
    const c=cards[id]; if(c?.phase!=='review')return false;
    return localDay(c.due)<=localDay(now) || (p.days<=plan.reserve&&p.days>0&&localDay(c.lastReview)!==localDay(now)&&recallProbability(c,examTime)<.9);
  }).sort((a,b)=>recallProbability(cards[a],now)-recallProbability(cards[b],now));
  const priority=new Map(priorityIds.map((id,i)=>[id,i]));
  const fresh=p.unseen.sort((a,b)=>(priority.get(a)??Infinity)-(priority.get(b)??Infinity))[0];
  const allowNew=fresh&&(extra||p.remainingNew>0);
  if(short.length)return {id:short[0],kind:'recall'};
  // Alternate review and introduction while both are available.
  if(due.length&&(!allowNew||step%2===1))return {id:due[0],kind:'review'};
  if(allowNew)return {id:fresh,kind:'intro'};
  if(due.length)return {id:due[0],kind:'review'};
  // At end of queue allow short steps after a real delay; never instantly repeat.
  const fallback=ids.filter(id=>{
    const c=cards[id];return c&&c.phase!=='review'&&c.due<=now&&now-(c.lastReview||c.firstSeen)>=180000&&(c.attemptDay!==localDay(now)||c.attempts<4);
  }).sort((a,b)=>cards[a].due-cards[b].due);
  if(fallback.length)return {id:fallback[0],kind:'recall'};
  // Single-question review sessions must still be usable on the next day.
  const single=ids.find(id=>id===lastId&&cards[id]?.phase==='review'&&localDay(cards[id].lastReview)!==localDay(now)&&localDay(cards[id].due)<=localDay(now));
  return single?{id:single,kind:'review'}:null;
}
