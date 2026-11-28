import test from 'node:test';
import assert from 'node:assert/strict';
import {createForegroundClock,STAR_NOTICE_DELAY,readNoticeStorage,writeNoticeStorage} from './starNotice.js';

test('visible time accumulates across pauses and reaches five minutes only when active',()=>{
 let now=0;const clock=createForegroundClock(0,()=>now);
 clock.setActive(true);now=120000;clock.setActive(false);
 now=600000;assert.equal(clock.elapsed(),120000);
 clock.setActive(true);now+=179999;assert.equal(clock.remaining(),1);
 now++;assert.equal(clock.remaining(),0);clock.setActive(false);
 now+=900000;assert.equal(clock.elapsed(),STAR_NOTICE_DELAY);
});
test('reload restores elapsed time without duplicate starts or negative time',()=>{
 let now=100;const clock=createForegroundClock(240000,()=>now);
 clock.setActive(true);now+=30000;clock.setActive(true);now+=30000;
 assert.equal(clock.remaining(),0);
 assert.equal(createForegroundClock(-10).elapsed(),0);
 assert.equal(createForegroundClock(Infinity).elapsed(),0);
 assert.equal(createForegroundClock(999999).elapsed(),STAR_NOTICE_DELAY);
});
test('storage errors do not prevent dismissing or timing',()=>{
 const map=new Map(),storage=()=>({getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)});
 writeNoticeStorage(storage,'dismissed',1);assert.equal(readNoticeStorage(storage,'dismissed'),'1');
 const blocked=()=>{throw Error('storage denied')};
 assert.equal(readNoticeStorage(blocked,'dismissed'),null);
 assert.doesNotThrow(()=>writeNoticeStorage(blocked,'dismissed',1));
});
