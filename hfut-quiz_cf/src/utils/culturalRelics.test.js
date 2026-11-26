import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCulturalRelicsJson, RELICS_SUBJECT_ID } from './culturalRelics.js';
import { getQuestionSubjectId, normalizeQuestionId } from './questionId.js';
import { SUBJECTS } from '../config/quizConfig.js';

const source = JSON.parse(readFileSync(new URL('../../public/cultural-relics.json', import.meta.url), 'utf8'));

test('built-in relics bank retains all 254 source questions and answers', () => {
  const bank = parseCulturalRelicsJson(source);
  const questions = bank[1];
  assert.equal(questions.length, 254);
  assert.deepEqual(questions.reduce((counts,q) => ({...counts,[q.type]:(counts[q.type]||0)+1}),{}),
    {single:126,multiple:19,fill:9,judgment:95,big:5});
  assert.equal(new Set(questions.map(q=>q.id)).size,254);
  for (const [i,q] of questions.entries()) {
    const src=source[i];
    assert.equal(q.id,'RELICS-'+(i+1));
    assert.equal(normalizeQuestionId(q.id),q.id);
    assert.equal(getQuestionSubjectId(q.id),RELICS_SUBJECT_ID);
    assert.equal(q.question,src.question);
    assert.equal(q.explanation,src.explanation);
    assert.ok(q.explanation.trim());
    if (q.type==='judgment') assert.equal(q.rawAnswer[0],src.answer?0:1);
    else if (q.type==='fill'||q.type==='big') assert.deepEqual(q.options,[src.answer]);
    else {
      assert.deepEqual(q.options,src.options);
      assert.deepEqual(q.rawAnswer,src.answer);
    }
  }
  const subject=SUBJECTS.find(s=>s.id===RELICS_SUBJECT_ID);
  assert.equal(subject.name,'文物精品与中华文明');
  assert.equal(subject.isCustom,undefined);
  assert.deepEqual(subject.getChapters(bank),[{id:1,name:'全部题目'}]);
  assert.equal(getQuestionSubjectId('L1-0'),'innovation');
  assert.equal(getQuestionSubjectId('MG-1'),'maogai');
  assert.equal(getQuestionSubjectId('ENG-CUL-1'),'english-culture');
  assert.equal(getQuestionSubjectId('HGD-MG-1'),'hgdmy-maogai');
});

test('invalid source answers fail instead of guessing',()=>{
  assert.throws(()=>parseCulturalRelicsJson([{...source[0],answer:[99]}]),/答案下标无效/);
  const judge=source.find(q=>q.type==='judgment');
  assert.throws(()=>parseCulturalRelicsJson([{...judge,answer:'错'}]),/布尔值/);
});
