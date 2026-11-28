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
  assert.equal(rated.cards.a.phase,'review');
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
  const events=[ev('a','plan',{plan:p}),ev('b','intro',{questionId:'x'}),ev('c','rate',{questionId:'x',rating:3},t+180000),ev('d','intro',{questionId:'y'},t+DAY)];
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
  const initial=[ev('a','plan',{plan:p}),ev('b','intro',{questionId:'x'}),ev('c','rate',{questionId:'x',rating:3},t+180000)];
  const before=replayEvents(initial);
  const after=replayEvents([...initial,ev('d','rate',{questionId:'x',rating:4},t+600000)]);
  assert.deepEqual(before.cards.x,after.cards.x);
});
test('four unsuccessful attempts defer until next day, without losing the card',()=>{
  const state=replayEvents([ev('a','plan',{plan:p}),ev('b','intro',{questionId:'x'}),...[1,2,3,4].map(i=>ev('r'+i,'rate',{questionId:'x',rating:1},t+i*600000))]);
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
 for(let i=0;i<20;i++){
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
 assert.equal(sequence.filter(x=>x.kind==='recall').length,10);
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
 const events=[ev('p','plan',{plan}),ev('a','intro',{questionId:'a'}),ev('b','intro',{questionId:'b'},t+1000),ev('c','intro',{questionId:'c'},t+2000),ev('r','rate',{questionId:'a',rating:1},t+3000)];
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
 assert.equal(learningGridStatus(rated.cards.a,plan,t+30000),'complete');
 assert.equal(learningGridStatus(rated.cards.a,plan,t+DAY+30000),'due');
});

test('optional early recall avoids mandatory idle time without bypassing daily cap',()=>{
 const plan={...p,exam:localDay(t+10*DAY),reserve:0};
 const state=replayEvents([ev('p','plan',{plan}),ev('a','intro',{questionId:'a'})]);
 assert.equal(chooseNext({ids:['a','b'],state,now:t+1000}),null);
 assert.deepEqual(chooseEarlyRecall({ids:['a','b'],state,now:t+1000}),{id:'a',kind:'recall'});
 assert.deepEqual(chooseNext({ids:['a','b'],state,now:t+1000,extra:true}),{id:'b',kind:'intro'});
 const capped=replayEvents([ev('p','plan',{plan}),ev('a','intro',{questionId:'a'}),...[1,2,3,4].map(i=>ev('r'+i,'rate',{questionId:'a',rating:1},t+i*600000))]);
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
 const events=[ev('p','plan',{plan}),ev('a','intro',{questionId:'a'}),ev('b','intro',{questionId:'b'},t+1000),ev('ra','rate',{questionId:'a',rating:1},t+2000),ev('rb','rate',{questionId:'b',rating:2},t+3000)];
 const state=replayEvents(events);
 assert.deepEqual(chooseNext({ids:['a','b'],state,now:t+3000}),{id:'a',kind:'recall'});
 assert.equal(chooseNext({ids:['b'],state,now:t+3000}),null);
 assert.equal(nextShortTime(['b'],state,t+3000),null);
 assert.deepEqual(chooseEarlyRecall({ids:['b'],state,now:t+3000}),{id:'b',kind:'recall'});
});
