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

/**
 * Compute progressive character hints for fill-in-the-blank answers.
 * Whitespace characters are skipped when counting steps so every click reveals a visible character.
 */
export const getFillHint = (blanks, hintCount) => {
  const safeBlanks = Array.isArray(blanks) && blanks.length > 0 ? blanks : [];
  const targets = safeBlanks.map((accepted) => String(accepted?.[0] || '').trim());
  const totalChars = targets.reduce((sum, text) => {
    let count = 0;
    for (const ch of text) {
      if (!/\s/.test(ch)) count += 1;
    }
    return sum + count;
  }, 0);

  const clampedCount = Math.max(0, Math.min(hintCount, totalChars));
  let remaining = clampedCount;

  const hints = targets.map((text) => {
    if (remaining <= 0 || !text) return '';
    let nonSpaceSeen = 0;
    let endIdx = 0;
    const chars = Array.from(text);
    for (let i = 0; i < chars.length; i++) {
      if (!/\s/.test(chars[i])) {
        nonSpaceSeen += 1;
        endIdx = i + 1;
        if (nonSpaceSeen >= remaining) {
          break;
        }
      }
    }
    remaining -= nonSpaceSeen;
    return chars.slice(0, endIdx).join('');
  });

  return {
    hints,
    revealedCount: clampedCount,
    totalChars,
    hasMore: clampedCount < totalChars,
  };
};
