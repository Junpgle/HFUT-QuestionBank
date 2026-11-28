import test from 'node:test';
import assert from 'node:assert/strict';
import {makeJournal,observeJournal,acknowledgeOps,reconcileProgress,applyOps,mergeLegacy,historyKey} from './progressSync.js';
const h=(id,q='MG-1')=>({id,questionId:q,timestamp:'2026-11-28T00:00:00Z'});
test('first migration adds local records, never infers deletion of unseen cloud rows',()=>{
 const j=makeJournal({brushedIds:['MG-1','custom_x-Q1']});
 const cloud=applyOps({brushedIds:['MG-2']},j.pending);
 assert.deepEqual(cloud.brushedIds,['MG-1','MG-2']);
});
test('upload acknowledgement cannot discard edits made during request',()=>{
 const j=makeJournal({wrongIds:['MG-1']});
 const sent=j.pending.map(o=>o.id);
 const next=observeJournal(j,{wrongIds:[],favoriteIds:['MG-2']});
 const remaining=acknowledgeOps(next.pending,sent);
 assert.equal(remaining.length,2);
 const view=reconcileProgress({wrongIds:['MG-1'],brushedIds:['MG-3']},next.view,remaining);
 assert.deepEqual(view.wrongIds,[]);assert.deepEqual(view.favoriteIds,['MG-2']);assert.deepEqual(view.brushedIds,['MG-3']);
});
test('legacy snapshot cannot erase records and distinct history survives timestamp collision',()=>{
 const x=mergeLegacy({brushedIds:['MG-1'],history:[h(1)]},{brushedIds:['MG-2'],history:[h(1,'MG-2')]});
 assert.deepEqual(x.brushedIds,['MG-1','MG-2']);assert.equal(x.history.length,2);
 assert.notEqual(historyKey(x.history[0]),historyKey(x.history[1]));
});
