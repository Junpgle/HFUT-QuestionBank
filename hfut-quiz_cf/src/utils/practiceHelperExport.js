// Export the normalized Qbank cache to Study Practice Helper's JSON array.
// No account information or practice history is included.
const TYPES = {
  single: 'single', multiple: 'multiple',
  judgment: 'judge', judge: 'judge',
  fill: 'blank', blank: 'blank',
  big: 'text', text: 'text',
};

export function buildPracticeHelperExport(subjects, banks) {
  const questions = [];
  const missingAnswers = [];
  const ids = new Set();
  const clean = value => String(value ?? '').trim();
  for (const subject of subjects) {
    const bank = banks[subject.id];
    if (!bank || !Object.values(bank).some(list => Array.isArray(list) && list.length)) {
      throw new Error('题库未加载：' + subject.name);
    }
    for (const [chapterId, list] of Object.entries(bank)) {
      if (!Array.isArray(list)) throw new Error('题库章节格式异常：' + subject.name + ' / ' + chapterId);
      for (const [index, q] of list.entries()) {
        const location = subject.name + ' / ' + chapterId + ' / ' + (q?.id ?? index + 1);
        const type = TYPES[q?.type];
        const question = clean(q?.question);
        if (!type || !question) throw new Error('无法转换题型或空题干：' + location);
        const rawOptions = Array.isArray(q.options) ? q.options.map(clean) : [];
        let options = [];
        let answer = [];
        if (type === 'blank' || type === 'text') {
          // Qbank stores text answers in options[0] and rawAnswer=[0].
          // Keep punctuation, multiple blanks and alternative-answer notation intact.
          const reference = rawOptions[0] || '';
          if (reference && !/^(?:点击查看解析|（暂无标准答案，点击查看解析）|暂无解析|暂无标准答案)$/.test(reference)) {
            answer = [reference];
          }
        } else {
          if (!rawOptions.length || rawOptions.some(opt => !opt)) {
            throw new Error('选择题选项缺失：' + location);
          }
          // Full option labels avoid ambiguous duplicates or options that themselves
          // look like answer letters. Match the original Qbank option order.
          options = rawOptions.map((opt, i) => (i < 26 ? String.fromCharCode(65 + i) : String(i + 1)) + '.' + opt);
          const indexes = Array.isArray(q.rawAnswer) ? [...new Set(q.rawAnswer)] : [];
          if (indexes.length && indexes.every(i => Number.isInteger(i) && i >= 0 && i < options.length)
              && (type === 'multiple' || indexes.length === 1)) {
            answer = indexes.map(i => options[i]);
          }
        }
        const baseId = 'qbank:' + [subject.id, chapterId, q.id ?? index + 1].map(v => encodeURIComponent(String(v))).join(':');
        let id = baseId;
        for (let suffix = 2; ids.has(id); suffix++) id = baseId + ':' + suffix;
        ids.add(id);
        const chapter = clean(q.category) || clean((subject.lectures || subject.chapters || []).find(ch => String(ch.id) === chapterId)?.name) || '章节 ' + chapterId;
        const analysis = clean(q.explanation);
        questions.push({
          id, type, question, options, answer,
          analysis: analysis === '暂无解析' ? '' : analysis,
          tags: [...new Set([subject.name, chapter].filter(Boolean))],
          course: subject.name,
          ...(subject.semester ? { semester: String(subject.semester) } : {}),
          source: 'HFUT-QuestionBank',
        });
        if (!answer.length) missingAnswers.push(location);
      }
    }
  }
  return { questions, missingAnswers };
}
