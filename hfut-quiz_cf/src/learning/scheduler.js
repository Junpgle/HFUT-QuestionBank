// FSRS-4.5 memory equations; fixed published default weights.
// https://open-spaced-repetition.github.io/ts-fsrs/guide/model/fsrs-4dot5
// Intra-day learning steps and exam deadlines are separate product policies.
export const DAY = 86400000;
export const FIRST_RECALL_DELAY = 30000;
const FIRST_RECALL_STEPS=2;
const HARD_FIRST_RECALL_STEPS=1;
const FAILED_RECALL_STEPS=2;
const FUZZY_RECALL_STEPS=3;
export const REQUIRED_STRENGTHENING=3;
const strengtheningGap=(count,rating)=>count===1?(rating===4?7:5):(rating===4?15:10);
const smallQueueDelay=count=>count===1?60000:120000;
const failureLimit=(plan,now)=>plan&&daysUntil(plan.exam,now)<=3?6:4;
const hasStrengthSpacing=(c,step,lastId,id,now)=>!c.strengthAt||localDay(c.strengthAt)!==localDay(now)||now>=c.minRecallAt||(step>c.strengthStep&&lastId!==id);
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
export function rateCard(card, rating, now, target=0.9) {
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
  const short=rating===1 || (rating===2 && card.phase!=='review');
  const initial=first || card.phase==='learning' || card.phase==='relearning';
  return {...card,difficulty:d,stability:s,lastReview:now,reps:(card.reps||0)+1,
    lapses:(card.lapses||0)+(rating===1&&!first&&card.phase==='review'?1:0),
    successfulDays:(card.successfulDays||0)+(rating>=3&&card.lastSuccessDay!==localDay(now)?1:0),
    lastSuccessDay:rating>=3?localDay(now):card.lastSuccessDay,
    phase:short?(card.phase==='review'||card.phase==='relearning'?'relearning':'learning'):'review',
    due:now+(short?0:(initial?1:intervalDays(s,target))*DAY),model:MODEL};
}
export function localDay(t=Date.now()) {
  // All Qbank exam plans use China Standard Time for consistent cross-device study days.
  return new Date(t+8*3600000).toISOString().slice(0,10);
}
const dayNumber = s => Date.parse(s+'T00:00:00Z')/DAY;
export const dayStart = day => Date.parse(day+'T00:00:00+08:00');
export const nextDay = t => dayStart(localDay(t))+DAY;
export function daysUntil(exam,now) {return Math.max(0,dayNumber(exam)-dayNumber(localDay(now))||0);}
export function dailyPlan(ids,cards,plan,now) {
  const day=localDay(now);
  const todayNew=ids.filter(id=>cards[id]?.introducedDay===day).length;
  const unseen=ids.filter(id=>!cards[id]);
  const days=daysUntil(plan.exam,now);
  const reserve=Math.min(plan.reserve,Math.max(0,days-1));
  const remainingDays=Math.max(1,days-reserve);
  const quota=Math.ceil((unseen.length+todayNew)/remainingDays);
  return {days,reserve,quota,todayNew,unseen,remainingNew:Math.min(unseen.length,Math.max(0,quota-todayNew))};
}
export function replayEvents(events) {
  const cards=Object.create(null);
  const seen=new Set();
  let plan=null, step=0,lastId=null;
  const todayCounts=Object.create(null);
  const activity=Object.create(null);
  const byQuestion=Object.create(null);
  for(const e of [...events].sort((a,b)=>a.at-b.at||a.id.localeCompare(b.id))) {
    if(seen.has(e.id))continue;
    seen.add(e.id);
    if(e.kind==='plan'){plan=e.plan;continue;}
    const id=e.questionId;
    if(e.kind==='intro'){
      if(e.relearnOf){
        const old=cards[id];
        if(!old||old.phase==='review'||old.pendingRelearn!==e.relearnOf)continue;
        step++;lastId=id;
        cards[id]={...old,pendingRelearn:null,relearnedAt:e.at,eligibleStep:step+FAILED_RECALL_STEPS,due:Math.max(old.due,e.at)};
        continue;
      }
      if(cards[id])continue;
      step++;lastId=id;
      const d=localDay(e.at);
      cards[id]={phase:'learning',introducedDay:d,firstSeen:e.at,due:e.at+FIRST_RECALL_DELAY,eligibleStep:step+(e.difficult?HARD_FIRST_RECALL_STEPS:FIRST_RECALL_STEPS),attempts:0,strengthCount:0};
      (activity[d]??={new:0,attempts:0,success:0,crossDay:0,crossSuccess:0}).new++;
      (byQuestion[id]??=[]).push({day:d,kind:'intro',at:e.at});
    }else if(e.kind==='rate'&&cards[id]){
      const old=cards[id],previousId=lastId,previousStep=step;
      step++;lastId=id;
      const attemptDay=localDay(e.at);
      // Preserve the established FSRS rule for redundant positive same-day reviews.
      if(old.phase==='review'&&e.rating>=3&&localDay(old.lastReview)===attemptDay)continue;
      const attempts=old.attemptDay===attemptDay?(old.attempts||0)+1:1;
      const failureStreak=e.rating>=3?0:(old.attemptDay===attemptDay?(old.failureStreak||0):0)+1;
      const next=rateCard(old,e.rating,e.at,plan?.target??.9);
      let strengthCount=old.strengthCount||0,strengthAt=old.strengthAt||0,strengthStep=old.strengthStep||0,minRecallAt=old.minRecallAt||0;
      let eligibleStep=step,phase=next.phase,due=next.due;
      if(e.rating===1){
        strengthCount=0;strengthAt=0;strengthStep=0;minRecallAt=0;eligibleStep=step+FAILED_RECALL_STEPS;
      }else if(e.rating===2){
        // A fuzzy review is not a clean success: require another independent check today.
        if(old.phase==='review')strengthCount=REQUIRED_STRENGTHENING-1;
        phase=old.phase==='review'||old.phase==='relearning'?'relearning':'learning';
        due=e.at;eligibleStep=step+FUZZY_RECALL_STEPS;
        // Preserve earned progress, but seeing the answer starts a fresh spacing interval.
        strengthAt=strengthCount?e.at:0;strengthStep=strengthCount?step:0;minRecallAt=strengthCount?e.at+smallQueueDelay(strengthCount):0;
      }else if(old.phase!=='review'){
        // Replay existing events as evidence too, but reject consecutive unspaced positives.
        if(!old.pendingRelearn&&hasStrengthSpacing(old,previousStep,previousId,id,e.at)){
          strengthCount=Math.min(REQUIRED_STRENGTHENING,strengthCount+1);
          strengthAt=e.at;strengthStep=step;
          minRecallAt=e.at+smallQueueDelay(strengthCount);
        }else if(old.pendingRelearn){
          // A genuine positive historical recall supersedes the obsolete missing relearn step.
          strengthCount=1;strengthAt=e.at;strengthStep=step;minRecallAt=e.at+smallQueueDelay(1);
        }
        if(strengthCount<REQUIRED_STRENGTHENING){
          phase=old.phase==='relearning'?'relearning':'learning';
          due=e.at;eligibleStep=Math.max(step+1,strengthStep+strengtheningGap(strengthCount,e.rating));
        }else{phase='review';due=e.at+DAY;minRecallAt=0;}
      }else{strengthCount=REQUIRED_STRENGTHENING;minRecallAt=0;}
      const defer=failureStreak>=failureLimit(plan,e.at)&&phase!=='review';
      cards[id]={...next,phase,strengthCount,strengthAt,strengthStep,minRecallAt,pendingRelearn:e.rating===1&&!e.relearned?e.id:null,relearnedAt:e.rating===1&&e.relearned?e.at:null,attemptDay,attempts,failureStreak,deferredDay:defer?attemptDay:null,eligibleStep,due:defer?Math.max(due,nextDay(e.at)):due};
      const row=activity[attemptDay]??={new:0,attempts:0,success:0,crossDay:0,crossSuccess:0};
      row.attempts++;if(e.rating>=3)row.success++;
      (byQuestion[id]??=[]).push({day:attemptDay,kind:'rate',at:e.at,rating:e.rating,crossDay:old.phase==='review'&&localDay(old.lastReview)!==attemptDay});
      if(old.phase==='review'){
        (todayCounts[attemptDay]??=new Set()).add(id);
        if(localDay(old.lastReview)!==attemptDay){row.crossDay++;if(e.rating>=3)row.crossSuccess++;}
      }
    }
  }
  return {cards,plan,step,lastId,todayCounts,activity,byQuestion};
}
export function isReviewDue(card,plan,now){
  if(card?.phase!=='review'||localDay(card.lastReview)===localDay(now))return false;
  if(localDay(card.due)<=localDay(now))return true;
  const days=daysUntil(plan.exam,now);
  return days<=plan.reserve&&localDay(now)<=plan.exam&&recallProbability(card,dayStart(plan.exam)+DAY/2)<(plan.target??.9);
}
export function memoryLevel(card,now){
  if(!card)return 'new';
  if(!card.stability||card.phase!=='review'||recallProbability(card,now)<.8)return 'weak';
  if(card.stability>=30&&(card.successfulDays||0)>=3&&recallProbability(card,now)>=.9)return 'long';
  if(card.stability>=7&&recallProbability(card,now)>=.9)return 'stable';
  return 'learning';
}
// A stage is a categorical memory milestone, not a percentage of mastery.
export const MEMORY_STAGES=['首次学习','短时巩固','间隔复习','稳定记忆','长期记忆'];
export function questionMemoryStage(card,now){
  if(!card)return {index:0,label:MEMORY_STAGES[0],detail:'尚未完成首次学习'};
  if(card.pendingRelearn)return {index:1,label:'待重新学习',detail:'先重新记忆正确答案，再安排独立回忆'};
  if(card.phase==='relearning')return {index:1,label:'重新巩固',detail:'回忆失败后重新建立记忆'};
  if(card.phase!=='review')return {index:1,label:MEMORY_STAGES[1],detail:card.lastReview?'仍需短时强化':'已学习，等待首次独立回忆'};
  const level=memoryLevel(card,now);
  if(level==='long')return {index:4,label:MEMORY_STAGES[4],detail:'已达到长期记忆条件'};
  if(level==='stable')return {index:3,label:MEMORY_STAGES[3],detail:'当前记忆保持较稳定'};
  return {index:2,label:MEMORY_STAGES[2],detail:level==='weak'?'记忆已减弱，需及时复习':'已进入跨天间隔复习'};
}
const firstRecall=c=>c?.phase==='learning'&&!c.lastReview&&!c.stability;
export const canRetryToday=(c,now)=>c?.deferredDay!==localDay(now);
export function nextShortTime(ids,state,now){
  const times=ids.flatMap(id=>{
    const c=state.cards[id];if(!c||c.phase==='review')return [];
    if(!canRetryToday(c,now))return [Math.max(c.due,nextDay(now))];
    if(c.due>now)return [c.due];
    if(c.minRecallAt>now&&!hasStrengthSpacing(c,state.step,state.lastId,id,now))return [c.minRecallAt];
    // Rated short steps are task-based, not waiting for a wall-clock deadline.
    return [];
  });
  return times.length?Math.min(...times):null;
}
// Explicit, optional early reinforcement when the normal queue is empty.
export function chooseEarlyRecall({ids,state,now}){
  if(!state.plan)return null;
  const eligible=ids.filter(id=>{
    const c=state.cards[id];
    return c&&c.phase!=='review'&&canRetryToday(c,now)&&localDay(c.due)<=localDay(now)&&(c.pendingRelearn||hasStrengthSpacing(c,state.step,state.lastId,id,now));
  }).sort((a,b)=>Number(a===state.lastId)-Number(b===state.lastId)||state.cards[a].due-state.cards[b].due);
  return eligible.length?{id:eligible[0],kind:state.cards[eligible[0]].pendingRelearn?'relearn':'recall'}:null;
}
export function chooseNext({ids,state,now,extra=false,priorityIds=[]}) {
  const {cards,plan,step,lastId}=state;
  if(!plan)return null;
  const p=dailyPlan(ids,cards,plan,now);
  const relearn=ids.filter(id=>cards[id]?.pendingRelearn&&cards[id].phase!=='review'&&canRetryToday(cards[id],now)&&cards[id].due<=now).sort((a,b)=>cards[a].lastReview-cards[b].lastReview);
  // Exclude immediate same-day repeats, not the last question from a previous day.
  const candidates=ids.filter(id=>id!==lastId||(cards[id]&&localDay(cards[id].relearnedAt||cards[id].lastReview||cards[id].firstSeen)!==localDay(now)));
  const short=candidates.filter(id=>{
    const c=cards[id];
    if(!c||c.pendingRelearn||c.phase==='review'||!canRetryToday(c,now))return false;
    // First exposure: spacing by intervening completed tasks OR time, not both.
    // Two normal intervening tasks (one for hard cards) ensure fast learners
    // never have to finish the whole new-card quota before testing recall.
    if(firstRecall(c))return c.eligibleStep<=step||c.due<=now;
    return c.due<=now&&hasStrengthSpacing(c,step,lastId,id,now)&&(c.eligibleStep<=step||localDay(c.relearnedAt||c.lastReview||c.firstSeen)!==localDay(now));
  });
  short.sort((a,b)=>cards[a].due-cards[b].due);
  const due=candidates.filter(id=>isReviewDue(cards[id],plan,now)).sort((a,b)=>recallProbability(cards[a],now)-recallProbability(cards[b],now));
  const priority=new Map([...new Set(priorityIds)].map((id,i)=>[id,i]));
  const fresh=p.unseen.sort((a,b)=>(priority.get(a)??Infinity)-(priority.get(b)??Infinity))[0];
  const allowNew=fresh&&(extra||p.remainingNew>0);
  if(short.length)return {id:short[0],kind:'recall'};
  // Mix backfilled relearning with recall instead of batching all old failures.
  if(relearn.length)return {id:relearn[0],kind:'relearn'};
  // Alternate review and introduction while both are available.
  if(due.length&&(!allowNew||step%2===1))return {id:due[0],kind:'review'};
  if(allowNew)return {id:fresh,kind:'intro'};
  if(due.length)return {id:due[0],kind:'review'};
  // A due cross-day review takes precedence over shortening same-day spacing.
  const single=ids.find(id=>id===lastId&&isReviewDue(cards[id],plan,now));
  if(single)return {id:single,kind:'review'};
  // If no other planned work remains, shorten the gap for a *different*
  // pending question rather than forcing a timed wait. Never auto-repeat
  // the very same rated card; explicit early recall remains available.
  const fallback=candidates.filter(id=>{
    const c=cards[id];
    return c&&!c.pendingRelearn&&c.phase!=='review'&&!firstRecall(c)&&c.due<=now&&canRetryToday(c,now)&&hasStrengthSpacing(c,step,lastId,id,now);
  }).sort((a,b)=>cards[a].eligibleStep-cards[b].eligibleStep||cards[a].due-cards[b].due);
  if(fallback.length)return {id:fallback[0],kind:'recall'};
  // On a short queue, a different first-exposure card can be recalled early
  // after another task, rather than waiting out the full 30 seconds.
  const earlyIntro=candidates.find(id=>{const c=cards[id];return firstRecall(c)&&canRetryToday(c,now)&&c.eligibleStep>step&&c.eligibleStep-step<FIRST_RECALL_STEPS;});
  if(earlyIntro)return {id:earlyIntro,kind:'recall'};
  // Single first exposure can still return after its short time delay.
  const introFallback=ids.find(id=>firstRecall(cards[id])&&cards[id].due<=now&&canRetryToday(cards[id],now));
  if(introFallback)return {id:introFallback,kind:'recall'};
  const delayed=ids.find(id=>{const c=cards[id];return c&&c.phase!=='review'&&!c.pendingRelearn&&c.strengthCount>0&&c.minRecallAt>0&&c.minRecallAt<=now&&c.due<=now&&canRetryToday(c,now);});
  if(delayed)return {id:delayed,kind:'recall'};
  // If spacing is the only obstacle, use a different already-learned card
  // as a real intervening retrieval task. Do not introduce extra new cards
  // or repeatedly rehearse the same card in isolation.
  const pending=ids.filter(id=>{const c=cards[id];return c&&c.phase!=='review'&&canRetryToday(c,now)&&localDay(c.due)<=localDay(now);});
  if(pending.length){
    const bridge=ids.filter(id=>id!==lastId&&cards[id]?.phase==='review').sort((a,b)=>recallProbability(cards[a],now)-recallProbability(cards[b],now)||cards[a].lastReview-cards[b].lastReview)[0];
    if(bridge)return {id:bridge,kind:'review',bridge:true};
  }
  return null;
}

export function scopedActivity(ids,byQuestion){
  const out=Object.create(null);
  for(const id of ids)for(const e of byQuestion[id]||[]){
    const r=out[e.day]??={new:0,attempts:0,success:0,crossDay:0,crossSuccess:0};
    if(e.kind==='intro')r.new++;
    else {r.attempts++;if(e.rating>=3)r.success++;if(e.crossDay){r.crossDay++;if(e.rating>=3)r.crossSuccess++;}}
  }
  return out;
}


// Today's planned question IDs, not a fixed answer sequence. New introductions
// use the same priority as chooseNext; repeated recalls keep the original ID.
export function todayQuestionIds({ids,state,now,priorityIds=[]}){
  const {cards,plan,todayCounts}=state;
  if(!plan)return [];
  const day=localDay(now),p=dailyPlan(ids,cards,plan,now);
  const priority=new Map([...new Set(priorityIds)].map((id,i)=>[id,i]));
  const fresh=[...p.unseen].sort((a,b)=>(priority.get(a)??Infinity)-(priority.get(b)??Infinity)).slice(0,p.remainingNew);
  const assigned=new Set(fresh);
  for(const id of ids){
    const c=cards[id];
    if(c&&(c.introducedDay===day||c.phase!=='review'||isReviewDue(c,plan,now)||todayCounts[day]?.has(id)||localDay(c.lastReview||c.firstSeen)===day))assigned.add(id);
  }
  return ids.filter(id=>assigned.has(id));
}

export function learningGridStatus(card,plan,now){
  if(!card)return 'new';
  if(card.phase!=='review'){
    if(!canRetryToday(card,now)||localDay(card.due)>localDay(now))return 'deferred';
    if(card.pendingRelearn)return 'relearn';
    return 'pending';
  }
  return isReviewDue(card,plan,now)?'due':'complete';
}
