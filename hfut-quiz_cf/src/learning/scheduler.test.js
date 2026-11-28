import test from 'node:test';
import assert from 'node:assert/strict';
import {DAY,rateCard,recallProbability,intervalDays,dailyPlan,replayEvents,chooseNext,localDay,isReviewDue,memoryLevel,dayStart,nextShortTime} from './scheduler.js';
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
  assert.deepEqual(chooseNext({ids:['x'],state,now:t+180000}),{id:'x',kind:'recall'});
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
