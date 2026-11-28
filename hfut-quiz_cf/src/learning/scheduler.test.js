import test from 'node:test';
import assert from 'node:assert/strict';
import {DAY,rateCard,recallProbability,intervalDays,dailyPlan,replayEvents,chooseNext,localDay} from './scheduler.js';
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
  assert.deepEqual(chooseNext({ids:['a','b'],state,now:t}),{id:'b',kind:'intro'});
  const rated=replayEvents([ev('a','plan',{plan:p}),intro,ev('c','rate',{questionId:'a',rating:3},t+180000)]);
  assert.equal(rated.cards.a.phase,'review');
  assert.equal(rated.cards.a.reps,1);
});
test('one-question queue respects short delay then resumes',()=>{
  const state=replayEvents([ev('a','plan',{plan:p}),ev('b','intro',{questionId:'x'})]);
  assert.equal(chooseNext({ids:['x'],state,now:t}),null);
  assert.deepEqual(chooseNext({ids:['x'],state,now:t+180000}),{id:'x',kind:'recall'});
});
