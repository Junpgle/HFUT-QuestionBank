export const getQuestionSubjectId = (questionId) => {
  const qid = String(questionId || '');
  if (!qid) return null;
  if (qid.startsWith('custom_')) {
    const idx = qid.lastIndexOf('-Q');
    return idx > 0 ? qid.slice(0, idx) : null;
  }
  if (qid.startsWith('RELICS-')) return 'cultural-relics';
  if (qid.startsWith('ENG-CUL-')) return 'english-culture';
  if (qid.startsWith('HGD-MG-')) return 'hgdmy-maogai';
  if (qid.startsWith('MG-')) return 'maogai';
  if (/^(OLD-|L\d+-)/.test(qid)) return 'innovation';
  return 'innovation';
};

export const normalizeQuestionId = (id) => {
  if (!id) return id;
  const s = String(id).trim();
  if (s.startsWith('MG-') || s.startsWith('MG')) {
    const numStr = s.startsWith('MG-') ? s.substring(3) : s.substring(2);
    const num = Number.parseInt(numStr, 10);
    if (!Number.isNaN(num)) {
      return num > 188439 ? `MG-${num - 188439}` : `MG-${num}`;
    }
  }
  if (/^\d+$/.test(s)) {
    const num = Number.parseInt(s, 10);
    if (!Number.isNaN(num)) {
      return num > 188439 ? `MG-${num - 188439}` : `MG-${num}`;
    }
  }
  return id;
};

export const normalizeSet = (value) => {
  if (!value) return new Set();
  const setObj = Array.isArray(value)
    ? new Set(value)
    : value instanceof Set
      ? value
      : new Set(Array.from(value));

  const normalized = new Set();
  setObj.forEach((item) => {
    normalized.add(normalizeQuestionId(item));
  });
  return normalized;
};
