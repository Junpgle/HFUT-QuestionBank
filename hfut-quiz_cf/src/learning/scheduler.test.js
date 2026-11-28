import test from 'node:test';
import assert from 'node:assert/strict';
import {DAY,rateCard,recallProbability,intervalDays,dailyPlan,replayEvents,chooseNext,localDay,isReviewDue,memoryLevel,dayStart,nextShortTime,FIRST_RECALL_DELAY,questionMemoryStage,todayQuestionIds,learningGridStatus,chooseEarlyRecall} from './scheduler.js';
const t=new Date(2026,10,28,10).getTime();
const p={exam:'2026-12-15',reserve:3,scope:'all'};
const ev=(id,kind,fields={},at=t)=>({id,kind,at,day:localDay(at),...fields});
test('FSRS reference curve and interval',()=>{
  const c=rateCard({},3,t);
  assert.equal(c.stability,3.7145);
  assert.ok(Math.abs(recallProbability(c,t+c.stability*DAY)-.9)<1e-12);
  assert.equal(intervalDays(10),10);
  assert.equal(c.due,t+DAY);
});
test('forgetting and same-day retry',()=>{
  const c=rateCard({},3,t);
  const fail=rateCard(c,1,t+DAY);
  assert.ok(fail.stability<=c.stability);
  assert.equal(fail.phase,'relearning');
  assert.equal(rateCard(fail,3,t+DAY+300000).stability,fail.stability);
});
test('daily quota stays stable after introducing a card',()=>{
  const ids=Array.from({length:254},(_,i)=>String(i));
  const empty=dailyPlan(ids,{},p,t);
  assert.equal(empty.quota,19);
  const cards={'0':{introducedDay:localDay(t)}};
  assert.equal(dailyPlan(ids,cards,p,t).remainingNew,18);
});
test('introduction does not rate memory; dedup and interleave',()=>{
  const intro=ev('b','intro',{questionId:'a'});
  const state=replayEvents([ev('a','plan',{plan:p}),intro,intro]);
  assert.equal(state.cards.a.stability,undefined);
  assert.equal(state.step,1);
  assert.deepEqual(chooseNext({ids:['a','b'],state,now:t,extra:true}),{id:'b',kind:'intro'});
  const rated=replayEvents([ev('a','plan',{plan:p}),intro,ev('c','rate',{questionId:'a',rating:3},t+180000)]);
  assert.equal(rated.cards.a.phase,'learning');
  assert.equal(rated.cards.a.strengthCount,1);
  assert.equal(rated.cards.a.reps,1);
});
test('one-question queue respects short delay then resumes',()=>{
  const state=replayEvents([ev('a','plan',{plan:p}),ev('b','intro',{questionId:'x'})]);
  assert.equal(chooseNext({ids:['x'],state,now:t}),null);
  assert.equal(chooseNext({ids:['x'],state,now:t+FIRST_RECALL_DELAY-1}),null);
  assert.equal(nextShortTime(['x'],state,t),t+FIRST_RECALL_DELAY);
  assert.deepEqual(chooseNext({ids:['x'],state,now:t+FIRST_RECALL_DELAY}),{id:'x',kind:'recall'});
});

test('quota catches up on exam day instead of silently discarding unseen cards',()=>{
  const x=dailyPlan(['a','b'],{},p,dayStart(p.exam));
  assert.equal(x.remainingNew,2);
});
test('review queue alternates with new cards and includes overdue cards',()=>{
  const events=[ev('a','plan',{plan:p}),ev('b','intro',{questionId:'x'}),ev('c','rate',{questionId:'x',rating:3},t+180000),ev('c2','rate',{questionId:'x',rating:3},t+240000),ev('c3','rate',{questionId:'x',rating:3},t+360000),ev('d','intro',{questionId:'y'},t+DAY)];
  const state=replayEvents(events);
  const now=t+DAY+180000;
  assert.ok(isReviewDue(state.cards.x,p,now));
  assert.deepEqual(chooseNext({ids:['x','y','z','w','v','u','s','r','q','p','o','n','m','l','k','j','i','h','g','f'],state,now}),{id:'x',kind:'review'});
});
test('calendar day is deterministic across device time zones',()=>{
  assert.equal(localDay(Date.parse('2026-11-28T16:00:00Z')),'2026-11-29');
  assert.equal(dayStart('2026-11-29'),Date.parse('2026-11-28T16:00:00Z'));
});
test('same-day successful repeat does not extend the real review',()=>{
  const initial=[ev('a','plan',{plan:p}),ev('b','intro',{questionId:'x'}),ev('c','rate',{questionId:'x',rating:3},t+180000),ev('c2','rate',{questionId:'x',rating:3},t+240000),ev('c3','rate',{questionId:'x',rating:3},t+360000)];
  const before=replayEvents(initial);
  const after=replayEvents([...initial,ev('d','rate',{questionId:'x',rating:4},t+600000)]);
  assert.deepEqual(before.cards.x,after.cards.x);
});
test('four unsuccessful attempts defer until next day, without losing the card',()=>{
  const state=replayEvents([ev('a','plan',{plan:p}),ev('b','intro',{questionId:'x'}),...[1,2,3,4].map(i=>ev('r'+i,'rate',{questionId:'x',rating:1,relearned:true},t+i*600000))]);
  assert.equal(memoryLevel(state.cards.x,t+2400000),'weak');
  assert.equal(chooseNext({ids:['x'],state,now:t+3600000}),null);
  assert.ok(nextShortTime(['x'],state,t+3600000)>t+3600000);
  assert.equal(chooseNext({ids:['x'],state,now:t+DAY})?.kind,'recall');
});
test('exam sprint includes early review only if estimated exam recall is low',()=>{
  const now=dayStart('2026-12-13')+8*3600000;
  const card={phase:'review',lastReview:now-DAY,stability:1,due:now+3*DAY,reps:2};
  assert.ok(isReviewDue(card,p,now));
  assert.equal(isReviewDue({...card,stability:100},p,now),false);
});

test('target retention changes future intervals and scope metrics are independent',async()=>{
  const {scopedActivity}=await import('./scheduler.js');
  const c=rateCard({},3,t);
  assert.ok(rateCard(c,3,t+DAY,.95).due<rateCard(c,3,t+DAY,.85).due);
  const events=[ev('a','plan',{plan:p}),ev('b','intro',{questionId:'x'}),ev('c','intro',{questionId:'y'}),ev('d','rate',{questionId:'x',rating:3},t+180000)];
  const state=replayEvents(events);
  assert.equal(scopedActivity(['x'],state.byQuestion)[localDay(t)].new,1);
  assert.equal(scopedActivity(['y'],state.byQuestion)[localDay(t)].attempts,0);
});

test('fast new-card sessions interleave first recall before finishing a ten-card quota',()=>{
 const ids=Array.from({length:10},(_,i)=>'q'+i);
 const plan={...p,exam:localDay(t),reserve:0};
 const events=[ev('plan','plan',{plan})],sequence=[];
 for(let i=0;i<40;i++){
   let now=Math.max(t+i*1000,events.at(-1).at+1000);const state=replayEvents(events);
   let task=chooseNext({ids,state,now});
   if(!task){assert.equal(dailyPlan(ids,state.cards,plan,now).remainingNew,0);now=Math.max(now,nextShortTime(ids,state,now));task=chooseNext({ids,state,now});}
   assert.ok(task,'every introduced card eventually receives recall');
   sequence.push(task);
   if(task.kind==='intro')events.push(ev('e'+i,'intro',{questionId:task.id},now));
   else events.push(ev('e'+i,'rate',{questionId:task.id,rating:3},now));
   const after=replayEvents(events);
   assert.ok(ids.filter(id=>after.cards[id]&&!after.cards[id].lastReview).length<=3);
 }
 assert.deepEqual(sequence.slice(0,6),[
   {id:'q0',kind:'intro'},{id:'q1',kind:'intro'},{id:'q2',kind:'intro'},
   {id:'q0',kind:'recall'},{id:'q1',kind:'recall'},{id:'q2',kind:'recall'}
 ]);
 assert.equal(sequence.filter(x=>x.kind==='intro').length,10);
 assert.equal(sequence.filter(x=>x.kind==='recall').length,30);
 assert.ok(ids.every(id=>replayEvents(events).cards[id].phase==='review'));
});
test('hard first exposure returns after one other task, slow sessions use time instead',()=>{
 const ids=['a','b','c','d'],plan={...p,exam:localDay(t)};
 const events=[ev('p','plan',{plan}),ev('a','intro',{questionId:'a',difficult:true}),ev('b','intro',{questionId:'b'},t+1000)];
 assert.deepEqual(chooseNext({ids,state:replayEvents(events),now:t+1000}),{id:'a',kind:'recall'});
 const normal=events.map(x=>x.kind==='intro'?{...x,difficult:false}:x);
 assert.deepEqual(chooseNext({ids,state:replayEvents(normal),now:t+1000}),{id:'c',kind:'intro'});
 assert.deepEqual(chooseNext({ids,state:replayEvents(normal),now:t+FIRST_RECALL_DELAY}),{id:'a',kind:'recall'});
});
test('failed recall returns after two intervening tasks, without a time delay',()=>{
 const ids=['a','b','c','d'],plan={...p,exam:localDay(t)};
 const events=[ev('p','plan',{plan}),ev('a','intro',{questionId:'a'}),ev('b','intro',{questionId:'b'},t+1000),ev('c','intro',{questionId:'c'},t+2000),ev('r','rate',{questionId:'a',rating:1,relearned:true},t+3000)];
 const state=replayEvents(events);
 assert.notEqual(chooseNext({ids,state,now:t+4000})?.id,'a');
 assert.equal(state.cards.a.due,t+3000);
 assert.equal(state.cards.a.eligibleStep,state.step+2);
 const later=[...events,ev('rb','rate',{questionId:'b',rating:3},t+4000),ev('rc','rate',{questionId:'c',rating:3},t+5000)];
 const after=replayEvents(later);
 assert.deepEqual(chooseNext({ids,state:after,now:t+5000}),{id:'a',kind:'recall'});
});

test('question memory stages reflect persisted learning, review, maturity and setbacks',()=>{
 assert.equal(questionMemoryStage(undefined,t).index,0);
 assert.equal(questionMemoryStage({phase:'learning',firstSeen:t},t).index,1);
 const card=rateCard({},3,t);
 assert.equal(questionMemoryStage(card,t).index,2);
 assert.equal(questionMemoryStage({...card,stability:7},t).index,3);
 assert.equal(questionMemoryStage({...card,stability:30,successfulDays:2},t).index,3);
 assert.equal(questionMemoryStage({...card,stability:30,successfulDays:3},t).index,4);
 assert.equal(questionMemoryStage({...card,stability:30,successfulDays:3},t+100*DAY).index,2);
 const fail=rateCard(card,1,t+DAY);
 assert.equal(questionMemoryStage(fail,t+DAY).index,1);
 assert.equal(questionMemoryStage(fail,t+DAY).label,'重新巩固');
});

test('daily grid uses scoped quota and retains studied and due questions',()=>{
 const ids=['a','b','c','d','e','f','g','h','i','j'];
 const plan={...p,exam:localDay(t+3*DAY),reserve:0};
 const state=replayEvents([ev('p','plan',{plan}),ev('a','intro',{questionId:'a'})]);
 const items=todayQuestionIds({ids,state,now:t,priorityIds:['j','i','h']});
 assert.deepEqual(items,['a','h','i','j']);
 assert.equal(learningGridStatus(state.cards.a,plan,t),'pending');
 assert.equal(learningGridStatus(undefined,plan,t),'new');
 const rated=replayEvents([ev('p','plan',{plan}),ev('a','intro',{questionId:'a'}),ev('r','rate',{questionId:'a',rating:3},t+30000)]);
 assert.equal(learningGridStatus(rated.cards.a,plan,t+30000),'pending');
 const graduated=replayEvents([ev('p','plan',{plan}),ev('a','intro',{questionId:'a'}),ev('r','rate',{questionId:'a',rating:3},t+30000),ev('r2','rate',{questionId:'a',rating:3},t+90000),ev('r3','rate',{questionId:'a',rating:3},t+210000)]);
 assert.equal(learningGridStatus(graduated.cards.a,plan,t+210000),'complete');
 assert.equal(learningGridStatus(graduated.cards.a,plan,t+DAY+210000),'due');
});

test('optional early recall avoids mandatory idle time without bypassing daily cap',()=>{
 const plan={...p,exam:localDay(t+10*DAY),reserve:0};
 const state=replayEvents([ev('p','plan',{plan}),ev('a','intro',{questionId:'a'})]);
 assert.equal(chooseNext({ids:['a','b'],state,now:t+1000}),null);
 assert.deepEqual(chooseEarlyRecall({ids:['a','b'],state,now:t+1000}),{id:'a',kind:'recall'});
 assert.deepEqual(chooseNext({ids:['a','b'],state,now:t+1000,extra:true}),{id:'b',kind:'intro'});
 const capped=replayEvents([ev('p','plan',{plan}),ev('a','intro',{questionId:'a'}),...[1,2,3,4].map(i=>ev('r'+i,'rate',{questionId:'a',rating:1,relearned:true},t+i*600000))]);
 assert.equal(chooseEarlyRecall({ids:['a'],state:capped,now:t+2400000}),null);
});

test('fuzzy recall in learning stage returns after three intervening tasks',()=>{
 const ids=['a','b','c','d','e','f'],plan={...p,exam:localDay(t)};
 const events=[ev('p','plan',{plan}),...['a','b','c','d'].map((id,i)=>ev('i'+id,'intro',{questionId:id},t+i*1000)),ev('ra','rate',{questionId:'a',rating:2},t+4000)];
 const afterFuzzy=replayEvents(events);
 assert.equal(afterFuzzy.cards.a.eligibleStep,afterFuzzy.step+3);
 assert.equal(afterFuzzy.cards.a.due,t+4000);
 for(let i=0;i<3;i++){
   const state=replayEvents(events);
   assert.notEqual(chooseNext({ids,state,now:t+5000+i*1000})?.id,'a');
   events.push(ev('r'+i,'rate',{questionId:['b','c','d'][i],rating:3},t+5000+i*1000));
 }
 assert.deepEqual(chooseNext({ids,state:replayEvents(events),now:t+7000}),{id:'a',kind:'recall'});
});
test('short queue can alternate pending cards without a clock and single rated card offers early recall',()=>{
 const plan={...p,exam:localDay(t),reserve:0};
 const events=[ev('p','plan',{plan}),ev('a','intro',{questionId:'a'}),ev('b','intro',{questionId:'b'},t+1000),ev('ra','rate',{questionId:'a',rating:1,relearned:true},t+2000),ev('rb','rate',{questionId:'b',rating:2},t+3000)];
 const state=replayEvents(events);
 assert.deepEqual(chooseNext({ids:['a','b'],state,now:t+3000}),{id:'a',kind:'recall'});
 assert.equal(chooseNext({ids:['b'],state,now:t+3000}),null);
 assert.equal(nextShortTime(['b'],state,t+3000),null);
 assert.deepEqual(chooseEarlyRecall({ids:['b'],state,now:t+3000}),{id:'b',kind:'recall'});
});

test('legacy unresolved failures require one explicit relearn before another recall without counting an attempt',()=>{
 const plan={...p,exam:localDay(t),reserve:0};
 const events=[ev('p','plan',{plan}),ev('i','intro',{questionId:'a'}),ev('f','rate',{questionId:'a',rating:1},t+1000)];
 const old=replayEvents(events);
 assert.equal(old.cards.a.pendingRelearn,'f');
 assert.deepEqual(chooseNext({ids:['a','b','c'],state:old,now:t+1000}),{id:'a',kind:'relearn'});
 const confirmed=replayEvents([...events,ev('c','intro',{questionId:'a',relearnOf:'f'},t+2000)]);
 assert.equal(confirmed.cards.a.pendingRelearn,null);
 assert.equal(confirmed.cards.a.reps,old.cards.a.reps);
 assert.equal(confirmed.cards.a.stability,old.cards.a.stability);
 assert.equal(confirmed.activity[localDay(t)].attempts,1);
 assert.equal(confirmed.activity[localDay(t)].new,1);
 assert.equal(confirmed.cards.a.eligibleStep,confirmed.step+2);
 assert.deepEqual(chooseNext({ids:['a','b','c'],state:confirmed,now:t+2000}),{id:'b',kind:'intro'});
 const passed=replayEvents([...events,ev('s','rate',{questionId:'a',rating:3},t+3000)]);
 assert.equal(passed.cards.a.pendingRelearn,null);
 assert.equal(passed.cards.a.phase,'learning');
 assert.equal(passed.cards.a.strengthCount,1);
 const modern=replayEvents([events[0],events[1],{...events[2],relearned:true}]);
 assert.equal(modern.cards.a.pendingRelearn,null);
});

test('historical relearning is interleaved with recall, not a large separate batch',()=>{
 const ids=['a','b','c','d','e'],plan={...p,exam:localDay(t),reserve:0};
 const events=[ev('p','plan',{plan}),...ids.flatMap((id,i)=>[ev('i'+id,'intro',{questionId:id},t+i*2000),ev('f'+id,'rate',{questionId:id,rating:1},t+i*2000+1000)])];
 for(let i=0;i<3;i++){
   const state=replayEvents(events);
   const task=chooseNext({ids,state,now:t+10000+i*1000});
   assert.deepEqual(task,{id:ids[i],kind:'relearn'});
   events.push(ev('c'+i,'intro',{questionId:task.id,relearnOf:'f'+task.id},t+10000+i*1000));
 }
 assert.deepEqual(chooseNext({ids,state:replayEvents(events),now:t+13000}),{id:'a',kind:'recall'});
});

test('legacy one-pass mastery is recalculated; unspaced repeats never graduate a card',()=>{
 const plan={...p,exam:localDay(t+10*DAY),reserve:0};
 const base=[ev('p','plan',{plan}),ev('i','intro',{questionId:'a'}),ev('r1','rate',{questionId:'a',rating:4},t+1000)];
 const old=replayEvents(base);
 assert.equal(old.cards.a.phase,'learning');assert.equal(old.cards.a.strengthCount,1);
 assert.equal(old.cards.a.eligibleStep,old.step+7);
 assert.equal(chooseNext({ids:['a'],state:old,now:t+1001}),null);
 assert.equal(chooseEarlyRecall({ids:['a'],state:old,now:t+1001}),null);
 assert.equal(nextShortTime(['a'],old,t+1001),t+61000);
 const immediate=replayEvents([...base,ev('r2','rate',{questionId:'a',rating:4},t+2000),ev('r3','rate',{questionId:'a',rating:4},t+3000)]);
 assert.equal(immediate.cards.a.strengthCount,1);
 const past=[...base,ev('r2','rate',{questionId:'a',rating:3},t+DAY),ev('r3','rate',{questionId:'a',rating:3},t+2*DAY)];
 const completed=replayEvents(past);
 assert.equal(completed.cards.a.strengthCount,3);assert.equal(completed.cards.a.phase,'review');
 assert.equal(completed.cards.a.successfulDays,3);
 const failed=replayEvents([...past,ev('f','rate',{questionId:'a',rating:1,relearned:true},t+3*DAY)]);
 assert.equal(failed.cards.a.strengthCount,0);assert.equal(failed.cards.a.phase,'relearning');
});
test('successful rounds do not consume the consecutive-failure allowance and fuzzy review requires recheck',()=>{
 const plan={...p,exam:localDay(t+10*DAY),reserve:0};
 const events=[ev('p','plan',{plan}),ev('i','intro',{questionId:'a'}),ev('r1','rate',{questionId:'a',rating:3},t+1000),ev('r2','rate',{questionId:'a',rating:3},t+61000),ev('f','rate',{questionId:'a',rating:2},t+181000),ev('r3','rate',{questionId:'a',rating:3},t+301000)];
 const passed=replayEvents(events);
 assert.equal(passed.cards.a.phase,'review');assert.equal(passed.cards.a.failureStreak,0);
 assert.equal(passed.cards.a.attempts,4);
 assert.equal(passed.cards.a.strengthCount,3);
 const fuzzy=replayEvents([...events,ev('rf','rate',{questionId:'a',rating:2},t+DAY+301000)]);
 assert.equal(fuzzy.cards.a.phase,'relearning');assert.equal(fuzzy.cards.a.strengthCount,2);
});

test('fuzzy feedback cannot bypass spacing after earlier success',()=>{
 const plan={...p,exam:localDay(t+10*DAY),reserve:0};
 const events=[ev('p','plan',{plan}),ev('i','intro',{questionId:'a'}),ev('r','rate',{questionId:'a',rating:3},t+1000),ev('f','rate',{questionId:'a',rating:2},t+2000)];
 const state=replayEvents(events);
 assert.equal(state.cards.a.strengthCount,1);
 assert.equal(chooseEarlyRecall({ids:['a'],state,now:t+2001}),null);
 const immediate=replayEvents([...events,ev('again','rate',{questionId:'a',rating:4},t+3000)]);
 assert.equal(immediate.cards.a.strengthCount,1);
});
test('near exam extends consecutive failure allowance but keeps graduation requirement',()=>{
 const plan={...p,exam:localDay(t+2*DAY),reserve:0};
 const events=[ev('p','plan',{plan}),ev('i','intro',{questionId:'a'}),...[1,2,3,4].map(i=>ev('f'+i,'rate',{questionId:'a',rating:1,relearned:true},t+i*1000))];
 const four=replayEvents(events);
 assert.equal(four.cards.a.strengthCount,0);
 assert.ok(chooseEarlyRecall({ids:['a'],state:four,now:t+4000}));
 const six=replayEvents([...events,ev('f5','rate',{questionId:'a',rating:1,relearned:true},t+5000),ev('f6','rate',{questionId:'a',rating:1,relearned:true},t+6000)]);
 assert.equal(chooseEarlyRecall({ids:['a'],state:six,now:t+6000}),null);
});

test('grid differentiates relearning, daily deferral and ordinary strengthening',()=>{
 const plan={...p,exam:localDay(t+10*DAY),reserve:0};
 const intro=[ev('p','plan',{plan}),ev('i','intro',{questionId:'a'})];
 const failed=replayEvents([...intro,ev('f','rate',{questionId:'a',rating:1},t+1000)]);
 assert.equal(learningGridStatus(failed.cards.a,plan,t+1000),'relearn');
 const confirmed=replayEvents([...intro,ev('f','rate',{questionId:'a',rating:1,relearned:true},t+1000)]);
 assert.equal(learningGridStatus(confirmed.cards.a,plan,t+1000),'pending');
 const deferred=replayEvents([...intro,...[1,2,3,4].map(i=>ev('f'+i,'rate',{questionId:'a',rating:1,relearned:true},t+i*1000))]);
 assert.equal(learningGridStatus(deferred.cards.a,plan,t+4000),'deferred');
 assert.equal(learningGridStatus(deferred.cards.a,plan,t+DAY),'pending');
});
