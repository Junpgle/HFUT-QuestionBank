import test from 'node:test';
import assert from 'node:assert/strict';
import {learningAttempt} from './attempt.js';
const q={id:'MG-1',question:'题目',type:'single'},e={id:'id1',at:Date.now()},task={kind:'recall'};
test('first exposure never counts; each independent wrong recall counts',()=>{
 assert.equal(learningAttempt(q,{kind:'intro'},{result:'wrong'},1,e),null);
 for(const kind of ['recall','review']){const a=learningAttempt(q,{kind},{result:'wrong',selected:[1]},1,e);assert.equal(a.objective,true);assert.equal(a.isCorrect,false);assert.equal(a.personalCorrect,false);}
});
test('guessing right separates objective result and personal memory; hints and self assessment excluded',()=>{
 const guess=learningAttempt(q,task,{result:'correct',selected:[0]},1,e);
 assert.equal(guess.isCorrect,true);assert.equal(guess.personalCorrect,false);
 assert.equal(learningAttempt({...q,type:'fill'},task,{result:'hint',usedHint:true},2,e).objective,false);
 assert.equal(learningAttempt({...q,type:'big'},task,{result:'self'},3,e).objective,false);
 assert.equal(learningAttempt(q,task,{result:'forgot'},1,e).isCorrect,false);
});
