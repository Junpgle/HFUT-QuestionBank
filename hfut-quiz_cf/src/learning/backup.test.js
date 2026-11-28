import test from 'node:test';
import assert from 'node:assert/strict';
import {makeBackup,parseBackup,mergeBackup} from './backup.js';
import {validDraft,cardVersion} from './session.js';
const t=Date.parse('2026-11-28T02:00:00Z');
const e={id:'00000000-0000-4000-8000-000000000001',kind:'intro',at:t,day:'2026-11-28',questionId:'MG-1',synced:true};
const p={exam:'2026-12-15',scope:'all'};
test('backup roundtrip, merge idempotency, strip cloud acknowledgment',()=>{
 const raw=JSON.stringify(makeBackup('maogai',[e],t));
 const result=parseBackup(raw,'maogai',['MG-1'],t);
 assert.equal(result[0].synced,undefined);
 assert.deepEqual(mergeBackup([e],result),[e]);
 assert.deepEqual(mergeBackup([],result),result);
});
test('reject different course, unknown IDs, corrupted or duplicate events',()=>{
 const raw=JSON.stringify(makeBackup('maogai',[e],t));
 assert.throws(()=>parseBackup(raw,'innovation',['MG-1'],t));
 assert.throws(()=>parseBackup(raw,'maogai',[],t));
 assert.throws(()=>parseBackup(JSON.stringify(makeBackup('maogai',[e,e],t)),'maogai',['MG-1'],t));
});
test('draft only resumes while its card and scope are still current',()=>{
 const draft={task:{id:'MG-1',kind:'intro'},version:'new',exam:p.exam,scope:p.scope};
 assert.ok(validDraft(draft,['MG-1'],{},p));
 assert.ok(!validDraft(draft,['MG-1'],{'MG-1':{firstSeen:t}},p));
 assert.ok(!validDraft(draft,['MG-1'],{},{...p,scope:'chapter'}));
 assert.equal(cardVersion(null),'new');
});
