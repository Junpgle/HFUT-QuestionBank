import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mergeUserProgress,validateOps,diffProgress} from './progress-merge.js';
function fixture(){
 const sql=new DatabaseSync(':memory:');
 sql.exec('CREATE TABLE UserProgress(user_id INTEGER PRIMARY KEY,brushed_ids TEXT,memorized_ids TEXT,mastered_ids TEXT,wrong_ids TEXT,favorite_ids TEXT,history TEXT,updated_at TEXT)');
 const db={prepare(query){return {bind(...args){return {first:async()=>sql.prepare(query).get(...args),run:async()=>({meta:{changes:Number(sql.prepare(query).run(...args).changes)}})};}};}};
 return {db,sql};
}
test('concurrent devices merge rather than replace; explicit removals supported',async()=>{
 const {db,sql}=fixture();
 await Promise.all([mergeUserProgress(db,1,{ops:diffProgress({}, {brushedIds:['MG-1'],wrongIds:['MG-1']})}),mergeUserProgress(db,1,{ops:diffProgress({}, {brushedIds:['MG-2'],favoriteIds:['MG-2']})})]);
 const before=await mergeUserProgress(db,1);
 assert.deepEqual(before.brushedIds,['MG-1','MG-2']);
 const after=await mergeUserProgress(db,1,{ops:diffProgress(before,{...before,wrongIds:[],favoriteIds:[]})});
 assert.deepEqual(after.wrongIds,[]);assert.deepEqual(after.favoriteIds,[]);
 await mergeUserProgress(db,1,{legacy:{brushedIds:['MG-3']}});
 assert.deepEqual((await mergeUserProgress(db,1)).brushedIds,['MG-1','MG-2','MG-3']);
 assert.deepEqual((await mergeUserProgress(db,2)).brushedIds,[]);sql.close();
});
test('reject unknown fields and custom IDs before write',()=>{
 assert.throws(()=>validateOps([{id:crypto.randomUUID(),field:'wrongIds',key:'custom_x-Q1',value:'custom_x-Q1'}]));
 assert.throws(()=>validateOps([{id:crypto.randomUUID(),field:'bad',key:'MG-1',value:null}]));
 assert.equal(validateOps(diffProgress({}, {wrongIds:['MG-1']})).length,1);
});
