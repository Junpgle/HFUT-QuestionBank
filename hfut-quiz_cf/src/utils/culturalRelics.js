// Stable IDs use source order: append new questions rather than reordering existing rows.
export const RELICS_SUBJECT_ID = 'cultural-relics';
export const RELICS_CHAPTERS = [{ id: 1, name: '全部题目' }];

export function parseCulturalRelicsJson(data) {
  if (!Array.isArray(data) || !data.length) throw new Error('文物题库为空或格式不正确');
  return { 1: data.map((q, i) => {
    const fail = reason => { throw new Error('文物题库第 ' + (i + 1) + ' 题：' + reason); };
    if (!q || typeof q.question !== 'string' || !q.question.trim()) fail('缺少题干');
    if (!['single', 'multiple', 'judgment', 'fill', 'big'].includes(q.type)) fail('题型不支持');
    if (typeof q.explanation !== 'string' || !q.explanation.trim()) fail('缺少解析');
    let options, rawAnswer;
    if (q.type === 'judgment') {
      if (typeof q.answer !== 'boolean') fail('判断答案必须为布尔值');
      options = ['正确', '错误'];
      rawAnswer = [q.answer ? 0 : 1];
    } else if (q.type === 'fill' || q.type === 'big') {
      if (typeof q.answer !== 'string' || !q.answer.trim()) fail('缺少参考答案');
      options = [q.answer];
      rawAnswer = [0];
    } else {
      if (!Array.isArray(q.options) || !q.options.length || q.options.some(o => typeof o !== 'string' || !o.trim())) fail('选项无效');
      if (!Array.isArray(q.answer) || !q.answer.length || q.answer.some(a => !Number.isInteger(a) || a < 0 || a >= q.options.length)) fail('答案下标无效');
      if (q.type === 'single' && q.answer.length !== 1) fail('单选题只能有一个答案');
      if (new Set(q.answer).size !== q.answer.length) fail('答案下标重复');
      options = [...q.options];
      rawAnswer = [...q.answer];
    }
    return {
      id: 'RELICS-' + (i + 1),
      type: q.type, question: q.question, options, rawAnswer,
      explanation: q.explanation, category: RELICS_CHAPTERS[0].name, lectureId: 1,
    };
  }) };
}
