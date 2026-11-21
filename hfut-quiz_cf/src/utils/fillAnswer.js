export const parseFillAnswer = (answerStr, questionText = '') => {
  const s = String(answerStr || '').trim();
  const labelPattern = /填空\s*\d+\s*[：:]/;
  let rawParts;

  if (labelPattern.test(s)) {
    rawParts = s
      .split(labelPattern)
      .map((part) => part.replace(/[；;]+$/g, '').trim())
      .filter(Boolean);
  } else {
    const blankMatches = String(questionText || '').match(/\[填空\d+\]|[（(]\s*[)）]|_{3,}/g);
    const blankCount = blankMatches ? blankMatches.length : 0;
    const semiParts = s
      .split(/[；;]/)
      .map((part) => part.trim())
      .filter(Boolean);
    if (blankCount > 1 && semiParts.length === blankCount) {
      rawParts = semiParts;
    } else {
      rawParts = [s];
    }
  }

  const blanks = rawParts
    .map((part) =>
      part
        .split(/\s*\/\s*|\s*\|\s*/)
        .map((ans) => ans.trim())
        .filter(Boolean)
    )
    .filter((arr) => arr.length > 0);

  return blanks.length > 0 ? blanks : [['']];
};

export const normalizeFillText = (str) => {
  const normalized = String(str || '')
    .normalize('NFKC')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/^the\s+/, '');

  return normalized.replace(/[\s.,;:!?'"“”‘’()（）《》<>[\]{}、。，；：！？·\-—_]/g, '');
};

export const isFillBlankCorrect = (userInput, acceptedList) => {
  const normInput = normalizeFillText(userInput);
  if (!normInput) return false;
  return (acceptedList || []).some((ans) => {
    const normAns = normalizeFillText(ans);
    return Boolean(normAns) && normInput === normAns;
  });
};

export const gradeFill = (userInputs, blanks) => {
  const safeBlanks = Array.isArray(blanks) && blanks.length > 0 ? blanks : [['']];
  const inputs = safeBlanks.map((_, i) => (Array.isArray(userInputs) ? userInputs[i] : '') || '');
  const perBlank = safeBlanks.map((accepted, i) => isFillBlankCorrect(inputs[i], accepted));

  if (perBlank.every(Boolean)) {
    return { isCorrect: true, perBlank };
  }

  if (safeBlanks.length >= 2) {
    const used = new Array(safeBlanks.length).fill(false);
    let allMatched = true;
    for (let i = 0; i < safeBlanks.length; i++) {
      const idx = safeBlanks.findIndex((accepted, j) => !used[j] && isFillBlankCorrect(inputs[i], accepted));
      if (idx === -1) {
        allMatched = false;
        break;
      }
      used[idx] = true;
    }
    if (allMatched) {
      return { isCorrect: true, perBlank: safeBlanks.map(() => true) };
    }
  }

  return { isCorrect: false, perBlank };
};
