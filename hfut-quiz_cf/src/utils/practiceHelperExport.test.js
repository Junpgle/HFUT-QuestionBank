import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildPracticeHelperExport} from './practiceHelperExport.js';

const subject = {id:'demo', name:'测试课程', lectures:[{id:1,name:'第一章'}]};
test('convert all five question types and preserve option index semantics', () => {
  const records = [
    {id:'1',type:'single',question:'单选',options:['A','A'],rawAnswer:[1]},
    {id:'2',type:'multiple',question:'多选',options:['甲、乙','B','C'],rawAnswer:[0,2]},
    {id:'3',type:'judgment',question:'判断',options:['正确','错误'],rawAnswer:[1]},
    {id:'4',type:'fill',question:'填空',options:['填空1：甲/乙；填空2：丙'],rawAnswer:[0]},
    {id:'5',type:'big',question:'简答',options:['甲、乙；丙，丁'],rawAnswer:[0],explanation:'解释'},
    {id:'6',type:'single',question:'缺答案',options:['甲','乙'],rawAnswer:[99]},
  ];
  const {questions,missingAnswers} = buildPracticeHelperExport([subject],{demo:{1:records}});
  assert.equal(questions.length,6);
  assert.deepEqual(questions.map(q=>q.type),['single','multiple','judge','blank','text','single']);
  assert.deepEqual(questions.map(q=>q.answer),[['B.A'],['A.甲、乙','C.C'],['B.错误'],['填空1：甲/乙；填空2：丙'],['甲、乙；丙，丁'],[]]);
  assert.deepEqual(questions[0].tags,['测试课程','第一章']);
  assert.equal(questions[4].analysis,'解释');
  assert.equal(missingAnswers.length,1);
  assert.equal(new Set(questions.map(q=>q.id)).size,6);
  assert.throws(()=>buildPracticeHelperExport([subject],{}),/题库未加载/);
});
test('same source IDs in different subjects are namespaced',()=>{
  const row={id:'1',type:'single',question:'单选',options:['甲','乙'],rawAnswer:[0]};
  const other={id:'other',name:'另一课程'};
  const {questions}=buildPracticeHelperExport([subject,other],{demo:{1:[row]},other:{1:[row]}});
  assert.notEqual(questions[0].id,questions[1].id);
});
