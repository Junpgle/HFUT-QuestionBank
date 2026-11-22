const parseOldFormatData = (rows, subjectId) => {
  const cleanRows = rows.filter((r) => r && r.length > 0);
  if (cleanRows.length === 0) return {};
  let startIndex = 0;
  const h = cleanRows[0];
  if (h && (String(h[0]).includes('目录') || String(h[1]).includes('题目类型'))) startIndex = 1;

  const parsedBank = {};
  for (let i = startIndex; i < cleanRows.length; i++) {
    const row = cleanRows[i];
    if (!row || row.length < 2) continue;
    const categoryRaw = String(row[0] || '').trim();
    const mainType = String(row[1] || '').trim();
    const bigQ = String(row[2] || '').trim();
    const subType = String(row[3] || '').trim();
    const subQ = String(row[4] || '').trim();
    const ansRaw = String(row[5] || '').trim();
    const exp = String(row[6] || '').trim();
    if (!subQ && !bigQ) continue;

    let type = 'single';
    const typeCheck = mainType + subType;
    if (/(多选|多项|多项选择)/.test(typeCheck)) type = 'multiple';
    else if (/(判断|是非)/.test(typeCheck)) type = 'judgment';
    const isFill = typeCheck.includes('填空');
    const isBig = typeCheck.includes('大题') || mainType.includes('大题') || typeCheck.includes('简答') || mainType.includes('简答');

    let qText = subQ;
    if (bigQ && bigQ !== subQ) {
      if (!subQ) qText = bigQ;
      else qText = `【背景】${bigQ}\n\n${subQ}`;
    }
    if (!qText && bigQ) qText = bigQ;
    if (!qText) qText = '题目内容缺失';

    let options = [];
    let rawAnswer = [];
    if (isFill || isBig) {
      const fillAns = String(row[11] || '').trim();
      const explicitAns = fillAns || ansRaw;
      options = [explicitAns || '（暂无标准答案，点击查看解析）'];
      rawAnswer = [0];
      if (isFill) type = 'fill';
      else if (isBig) type = 'big';
    } else if (type === 'judgment') {
      const optA = String(row[11] || '').trim();
      const optB = String(row[12] || '').trim();
      if (optA || optB) {
        if (optA) options.push(optA);
        if (optB) options.push(optB);
      } else {
        options = ['正确', '错误'];
      }
      if (/^[对TtA√Yes]/.test(ansRaw) || ansRaw === '正确') rawAnswer = [0];
      else if (/^[错FfB×No]/.test(ansRaw) || ansRaw === '错误') rawAnswer = [1];
      else if (ansRaw.toUpperCase() === 'A') rawAnswer = [0];
      else rawAnswer = [1];
    } else {
      const optIndices = [11, 12, 13, 14, 15, 16, 17, 18];
      options = optIndices.map((idx) => String(row[idx] || '').trim()).filter(Boolean);
      if (options.length === 0) continue;
      const normalized = ansRaw.toUpperCase().replace(/[^A-H]/g, '');
      for (const char of normalized) {
        const idx = char.charCodeAt(0) - 65;
        if (idx >= 0 && idx < options.length) rawAnswer.push(idx);
      }
      rawAnswer.sort((a, b) => a - b);
      if (type === 'single' && rawAnswer.length > 1) {
        type = 'multiple';
      }
    }

    let displayCat = categoryRaw;
    if (displayCat.includes('/')) {
      const parts = displayCat.split('/');
      if (parts.length > 0) displayCat = parts[parts.length - 1];
    }
    if (!displayCat) displayCat = '默认章节';

    if (!parsedBank[displayCat]) parsedBank[displayCat] = [];
    parsedBank[displayCat].push({
      id: `${subjectId}-Q${i}`,
      type,
      question: qText,
      options,
      rawAnswer,
      explanation: exp || '暂无解析',
      category: displayCat,
    });
  }
  return parsedBank;
};

export const parseCustomJson = (jsonData, subjectId) => {
  const parsedBank = {};
  let questionIndex = 1;

  const processQuestion = (q, index) => {
    const questionText = String(
      q.question || q.题干 || q.stem || q.content || q.title || q.text || q.题目 || ''
    ).trim();
    if (!questionText) return null;

    let type = 'single';
    const typeRaw = String(
      q.type || q.题型 || q.题型名称 || q.questionType || q.category || ''
    ).trim().toLowerCase();

    if (typeRaw.includes('多选') || typeRaw.includes('multiple') || typeRaw === '2') {
      type = 'multiple';
    } else if (typeRaw.includes('判断') || typeRaw.includes('judge') || typeRaw.includes('judgment') || typeRaw === '4') {
      type = 'judgment';
    } else if (typeRaw.includes('填空') || typeRaw.includes('fill') || typeRaw === '7') {
      type = 'fill';
    } else if (typeRaw.includes('大题') || typeRaw.includes('简答') || typeRaw.includes('essay') || typeRaw.includes('big')) {
      type = 'big';
    }

    let options = [];
    let rawAnswer = [];

    const rawOpts = q.options || q.选项 || q.choices || q.answers || null;
    let optionsKeys = [];
    if (Array.isArray(rawOpts)) {
      options = rawOpts.map(String).map((s) => s.trim());
    } else if (typeof rawOpts === 'object' && rawOpts !== null) {
      optionsKeys = Object.keys(rawOpts).sort();
      options = optionsKeys.map((k) => String(rawOpts[k] || '').trim());
    }

    if (options.length === 0) {
      const tempOpts = [];
      const possibleKeys = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
      possibleKeys.forEach((k) => {
        const val = q[k] || q[`选项${k}`] || q[`opt${k}`] || q[`option${k}`];
        if (val !== undefined && val !== null) {
          const strVal = String(val).trim();
          if (strVal !== '') {
            tempOpts.push({ key: k, value: strVal });
          }
        }
      });
      if (tempOpts.length > 0) {
        optionsKeys = tempOpts.map((o) => o.key);
        options = tempOpts.map((o) => o.value);
      }
    }

    const ansRaw = (q.answer !== undefined && q.answer !== null) ? q.answer
      : ((q.正确答案 !== undefined && q.正确答案 !== null) ? q.正确答案
        : ((q.rawAnswer !== undefined && q.rawAnswer !== null) ? q.rawAnswer
          : ((q.答案 !== undefined && q.答案 !== null) ? q.答案 : '')));

    if (type === 'judgment') {
      options = ['正确', '错误'];
      const ansStr = String(ansRaw).trim().toUpperCase();
      if (ansStr === 'B' || /^(对|√|正确|TRUE|T)$/.test(ansStr) || ansRaw === true || ansRaw === 0) {
        rawAnswer = [0];
      } else if (ansStr === 'A' || /^(错|×|错误|FALSE|F)$/.test(ansStr) || ansRaw === false || ansRaw === 1) {
        rawAnswer = [1];
      } else {
        rawAnswer = [0];
      }
    } else if (type === 'fill' || type === 'big') {
      options = [String(ansRaw || q.解析 || q.explanation || '点击查看解析')];
      rawAnswer = [0];
    } else {
      if (typeof ansRaw === 'number') {
        rawAnswer = [ansRaw];
      } else if (Array.isArray(ansRaw)) {
        rawAnswer = ansRaw.map(Number).filter((n) => !Number.isNaN(n));
      } else {
        const ansStr = String(ansRaw).trim().toUpperCase();
        if (optionsKeys.length > 0) {
          const parts = ansStr.split(/[^a-zA-Z0-9]+/).map((s) => s.trim()).filter(Boolean);
          parts.forEach((part) => {
            const idx = optionsKeys.indexOf(part);
            if (idx >= 0) rawAnswer.push(idx);
          });

          if (rawAnswer.length === 0) {
            for (let i = 0; i < ansStr.length; i++) {
              const char = ansStr[i];
              const idx = optionsKeys.indexOf(char);
              if (idx >= 0) rawAnswer.push(idx);
            }
          }
        }

        if (rawAnswer.length === 0) {
          const parts = ansStr.split(/[^a-zA-Z0-9]+/).map((s) => s.trim()).filter(Boolean);
          parts.forEach((part) => {
            if (part.length === 1 && part >= 'A' && part <= 'H') {
              const idx = part.charCodeAt(0) - 65;
              if (idx >= 0 && idx < options.length) rawAnswer.push(idx);
            }
          });

          if (rawAnswer.length === 0) {
            const letters = ansStr.replace(/[^A-H]/g, '');
            for (let i = 0; i < letters.length; i++) {
              const idx = letters.charCodeAt(i) - 65;
              if (idx >= 0 && idx < options.length) rawAnswer.push(idx);
            }
          }
        }

        if (rawAnswer.length === 0) {
          const numMatch = ansStr.match(/\d+/g);
          if (numMatch) {
            rawAnswer = numMatch.map(Number).filter((n) => n >= 0 && n < options.length);
          }
        }
      }

      if (type === 'single' && rawAnswer.length > 1) {
        type = 'multiple';
      }
    }

    const category = String(q.category || q.章节 || q.章节名称 || q.分类 || q.来源章节 || '默认章节').trim();
    const explanation = String(q.explanation || q.解析 || q.答案解析 || q.analysis || q.详解 || '暂无解析').trim();

    return {
      id: `${subjectId}-Q${index}`,
      type,
      question: questionText,
      options,
      rawAnswer: Array.from(new Set(rawAnswer)).sort((a, b) => a - b),
      explanation,
      category,
    };
  };

  let questionsList = [];
  if (jsonData && Array.isArray(jsonData.questions)) {
    questionsList = jsonData.questions;
  } else if (Array.isArray(jsonData)) {
    questionsList = jsonData;
  } else if (typeof jsonData === 'object' && jsonData !== null) {
    Object.keys(jsonData).forEach((cat) => {
      const qs = jsonData[cat];
      if (Array.isArray(qs)) {
        qs.forEach((q) => {
          const parsedQ = processQuestion(q, questionIndex++);
          if (parsedQ) {
            const finalCat = String(q.category || q.章节 || q.章节名称 || q.分类 || cat).trim();
            if (!parsedBank[finalCat]) parsedBank[finalCat] = [];
            parsedBank[finalCat].push({ ...parsedQ, category: finalCat });
          }
        });
      }
    });
    return parsedBank;
  }

  questionsList.forEach((q) => {
    const parsedQ = processQuestion(q, questionIndex++);
    if (parsedQ) {
      const cat = parsedQ.category;
      if (!parsedBank[cat]) parsedBank[cat] = [];
      parsedBank[cat].push(parsedQ);
    }
  });

  return parsedBank;
};

export const parseCustomExcel = (rawData, subjectId) => {
  const cleanRows = rawData.filter((r) => r && r.length > 0);
  if (cleanRows.length === 0) return {};

  const firstRowStr = JSON.stringify(cleanRows[0]);
  const isOldFormat = cleanRows[0] && (
    String(cleanRows[0][0] || '').includes('目录')
    || String(cleanRows[0][1] || '').includes('题目类型')
    || firstRowStr.includes('题目小题')
  );
  if (isOldFormat) {
    return parseOldFormatData(cleanRows, subjectId);
  }

  const parsedBank = {};
  let startIndex = 0;

  if (firstRowStr.includes('题型') || firstRowStr.includes('题干') || firstRowStr.includes('题目') || firstRowStr.includes('类型') || firstRowStr.includes('答案')) {
    startIndex = 1;
  }

  let typeCol = 0;
  let questionCol = 1;
  let answerCol = 2;
  let strictCorrectAnswerCol = -1;
  let explanationCol = -1;
  let categoryCol = -1;
  const optionCols = [];
  let questionCandidates = [];

  if (startIndex === 1) {
    const header = cleanRows[0].map((v) => String(v || '').trim());

    header.forEach((val, idx) => {
      const vUpper = val.toUpperCase();
      if ((val.includes('题型') || val.includes('类型') || vUpper.includes('TYPE')) && !val.includes('选项') && !val.includes('答案')) {
        typeCol = idx;
      } else if (val.includes('题干') || val.includes('题目') || val.includes('内容') || val.includes('问题') || vUpper.includes('STEM') || vUpper.includes('QUESTION')) {
        questionCol = idx;
        questionCandidates.push(idx);
      } else if ((val.includes('正确答案') || vUpper.includes('CORRECTANSWER') || vUpper.includes('RIGHTANSWER')) && !val.includes('选项')) {
        strictCorrectAnswerCol = idx;
        answerCol = idx;
      } else if ((val.includes('答案') || vUpper.includes('ANSWER')) && !val.includes('选项')) {
        if (strictCorrectAnswerCol === -1 && !val.includes('我的答案')) {
          answerCol = idx;
        }
      } else if (val.includes('解析') || val.includes('详解') || vUpper.includes('EXPLANATION') || vUpper.includes('ANALYSIS')) {
        explanationCol = idx;
      } else if (val.includes('章节') || val.includes('分类') || val.includes('课时') || vUpper.includes('CATEGORY')) {
        categoryCol = idx;
      }
    });

    header.forEach((val, idx) => {
      const vUpper = val.toUpperCase();
      if (val.includes('选项') || /^[A-H]$/.test(vUpper) || vUpper.startsWith('OPT') || vUpper.startsWith('CHOICE')) {
        optionCols.push(idx);
      }
    });
    optionCols.sort((a, b) => a - b);
    if (!questionCandidates.length) questionCandidates = [questionCol];
  }

  const isPlaceholderText = (s) => /^[_\-—=~·•.。]+$/.test(s) || /^(暂无|无|n\/a|null)$/i.test(s);
  const normalizeQuestionText = (s) => String(s || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^(\d+\s*[.、:：)]\s*)/, '')
    .replace(/^\(?\s*(单选题|多选题|判断题|填空题|简答题)\s*\)?/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const pickQuestionContent = (row) => {
    const indices = Array.from(new Set([questionCol, ...questionCandidates, 1, 2]));
    for (const idx of indices) {
      if (idx < 0 || idx >= row.length) continue;
      const normalized = normalizeQuestionText(row[idx]);
      if (!normalized || isPlaceholderText(normalized)) continue;
      return normalized;
    }
    return '';
  };
  const normalizeAnswerText = (s) => String(s || '')
    .replace(/[Ａ-Ｈａ-ｈ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 65248))
    .replace(/\s+/g, '')
    .trim();
  const parseChoiceAnswer = (raw, optionsLen) => {
    const ans = normalizeAnswerText(raw);
    if (!ans) return [];
    const tail = ans.replace(/^(?:我的答案|正确答案|参考答案|答案)[:：]*/i, '');
    const fromLetters = (tail.match(/[A-H]/gi) || []).map((ch) => ch.toUpperCase().charCodeAt(0) - 65);
    if (fromLetters.length) {
      return Array.from(new Set(fromLetters)).filter((i) => i >= 0 && i < Math.max(optionsLen, 8)).sort((a, b) => a - b);
    }
    const nums = (tail.match(/\d+/g) || []).map((n) => Number(n));
    if (nums.length) {
      const mapped = nums.map((n) => n - 1).filter((i) => i >= 0 && i < optionsLen);
      return Array.from(new Set(mapped)).sort((a, b) => a - b);
    }
    return [];
  };
  const pickAnswerRaw = (row) => {
    const direct = answerCol < row.length ? String(row[answerCol] || '').trim() : '';
    if (direct && !/^(?:我的答案[:：]?)?$/i.test(direct.replace(/\s+/g, ''))) return direct;
    for (let i = 0; i < row.length; i++) {
      const cell = String(row[i] || '').trim();
      if (!cell) continue;
      if (/(?:^|\s)(?:正确答案|参考答案|答案)\s*[:：]/.test(cell) && !/^我的答案/.test(cell)) {
        return cell;
      }
    }
    return direct;
  };

  for (let i = startIndex; i < cleanRows.length; i++) {
    const row = cleanRows[i];
    if (!row || row.length === 0) continue;

    const typeRaw = typeCol < row.length ? String(row[typeCol] || '').trim() : '';
    const content = pickQuestionContent(row);
    const answerRaw = pickAnswerRaw(row);
    const explanation = (explanationCol !== -1 && explanationCol < row.length)
      ? String(row[explanationCol] || '').trim()
      : '';
    const category = (categoryCol !== -1 && categoryCol < row.length) ? String(row[categoryCol] || '默认章节').trim() : '默认章节';

    if (!content) continue;

    let type = 'single';
    if (typeRaw.includes('多选') || typeRaw.includes('multiple')) type = 'multiple';
    else if (typeRaw.includes('判断') || typeRaw.includes('judgment') || typeRaw.includes('judge')) type = 'judgment';
    else if (typeRaw.includes('填空') || typeRaw.includes('fill')) type = 'fill';
    else if (typeRaw.includes('简答') || typeRaw.includes('大题') || typeRaw.includes('essay') || typeRaw.includes('big')) type = 'big';

    let options = [];
    let correctAnswers = [];

    if (type === 'judgment') {
      options = ['正确', '错误'];
      const ansStr = normalizeAnswerText(answerRaw).replace(/^(?:我的答案|正确答案|参考答案|答案)[:：]*/i, '').toUpperCase();
      if (/^(对|√|正确|TRUE|T)$/.test(ansStr) || ansStr === 'B') {
        correctAnswers = [0];
      } else if (/^(错|×|错误|FALSE|F)$/.test(ansStr) || ansStr === 'A') {
        correctAnswers = [1];
      } else {
        correctAnswers = [0];
      }
    } else if (type === 'fill' || type === 'big') {
      options = [answerRaw || '（暂无标准答案，点击查看解析）'];
      correctAnswers = [0];
    } else {
      if (optionCols.length > 0) {
        options = optionCols.map((idx) => (idx < row.length ? String(row[idx] || '').trim() : '')).filter(Boolean);
      } else {
        let col = Math.max(typeCol, questionCol, answerCol, explanationCol) + 1;
        if (col < row.length) {
          while (col < row.length && row[col] !== undefined && row[col] !== null && String(row[col]).trim() !== '') {
            options.push(String(row[col]).trim());
            col++;
          }
        }
        if (options.length === 0) {
          const defaultOptIndices = [6, 7, 8, 9, 10];
          options = defaultOptIndices.map((idx) => (idx < row.length ? String(row[idx] || '').trim() : '')).filter(Boolean);
        }
      }

      if (options.length === 1) {
        const merged = String(options[0] || '');
        const m = merged.match(/(?:^|\n|\s)[A-H]\s*[.．、:：)]\s*[\s\S]+/);
        if (m) {
          const split = [];
          const optionRegex = /(?:^|\n|\s)([A-H])\s*[.．、:：)]\s*([\s\S]*?)(?=(?:\s+[A-H]\s*[.．、:：)])|$)/g;
          let om;
          while ((om = optionRegex.exec(merged)) !== null) {
            const txt = String(om[2] || '').replace(/\s+/g, ' ').trim();
            if (txt) split.push(txt);
          }
          if (split.length >= 2) options = split;
        }
      }

      if (options.length === 0) continue;

      correctAnswers = parseChoiceAnswer(answerRaw, options.length);

      if (type === 'single' && correctAnswers.length > 1) {
        type = 'multiple';
      }
    }

    if (!parsedBank[category]) parsedBank[category] = [];
    parsedBank[category].push({
      id: `${subjectId}-Q${i}`,
      type,
      question: content,
      options,
      rawAnswer: Array.from(new Set(correctAnswers)).sort((a, b) => a - b),
      explanation: explanation || '暂无解析',
      category,
    });
  }

  return parsedBank;
};

export const extractDocxRawTextFallback = async (arrayBuffer) => {
  try {
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(arrayBuffer);
    const candidates = [
      'word/document.xml',
      'word/footnotes.xml',
      'word/endnotes.xml',
    ];
    let merged = '';
    for (const p of candidates) {
      const f = zip.file(p);
      if (!f) continue;
      const xml = await f.async('string');
      const withBreaks = xml
        .replace(/<\/w:p>/g, '\n')
        .replace(/<w:br[^>]*\/>/g, '\n')
        .replace(/<w:tab[^>]*\/>/g, '\t');
      const texts = [];
      const re = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;
      let m;
      while ((m = re.exec(withBreaks)) !== null) {
        texts.push(String(m[1] || ''));
      }
      merged += '\n' + texts.join('');
    }
    return merged
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\r/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  } catch {
    return '';
  }
};

export const parseCustomDocxText = (text, subjectId) => {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((s) => s.trim());
  if (!lines.length) return {};

  const parsedBank = {};
  let currentCategory = '默认章节';
  let currentType = 'single';
  let qIndex = 1;
  let currentBlock = [];
  let currentBlockHasAnswerLine = false;

  const normalizeTypeByText = (s = '') => {
    const t = String(s);
    if (/多选|多项/.test(t)) return 'multiple';
    if (/判断|是非|对错/.test(t)) return 'judgment';
    if (/填空/.test(t)) return 'fill';
    if (/简答|论述|大题|问答/.test(t)) return 'big';
    return 'single';
  };

  const parseAnswerToken = (token, qType) => {
    const ans = String(token || '').trim();
    if (!ans) return [];
    if (qType === 'judgment') {
      const u = ans.toUpperCase();
      if (/^(正确|对|√|T|TRUE|YES)$/.test(u)) return [0];
      if (/^(错误|错|×|F|FALSE|NO)$/.test(u)) return [1];
      return [];
    }
    const normalized = ans.toUpperCase().replace(/[^A-H]/g, '');
    if (!normalized) return [];
    return Array.from(new Set(normalized.split('').map((ch) => ch.charCodeAt(0) - 65)))
      .filter((i) => i >= 0 && i < 8)
      .sort((a, b) => a - b);
  };

  const extractAnswerFromBlock = (blockText) => {
    const ansLine = blockText.match(/(?:^|\n)\s*(?:答案|参考答案|正确答案)\s*[:：]\s*([A-Ha-h]{1,8}|正确|错误|对|错|√|×|T|F)\s*$/m);
    if (ansLine) return String(ansLine[1] || '').trim();
    const bracket = blockText.match(/[（(]\s*([A-Ha-h]{1,8}|正确|错误|对|错|√|×|T|F)\s*[)）]/);
    if (bracket) return String(bracket[1] || '').trim();
    return '';
  };

  const pushQuestionBlock = (blockLines) => {
    if (!blockLines.length) return;
    const merged = blockLines.join('\n').trim();
    if (!merged) return;

    const numberMatch = merged.match(/^\s*(?:第?\d+\s*[题.、:]|\d+\s*[.、:）)]|[（(]?\d+[)）])\s*/);
    const body = numberMatch ? merged.slice(numberMatch[0].length).trim() : merged;
    if (!body) return;

    const ansRaw = extractAnswerFromBlock(body);
    const bodyNoAnswer = body
      .replace(/[（(]\s*([A-Ha-h]{1,8}|正确|错误|对|错|√|×|T|F)\s*[)）]/g, '（  ）')
      .replace(/(?:^|\n)\s*(?:答案|参考答案|正确答案)\s*[:：]\s*([A-Ha-h]{1,8}|正确|错误|对|错|√|×|T|F)\s*$/gm, '')
      .trim();

    const optionStart = bodyNoAnswer.search(/(?:^|\n|\s)([A-H])\s*[.．、:：)]\s*/);
    let questionText = bodyNoAnswer;
    let optionsPart = '';
    if (optionStart >= 0) {
      questionText = bodyNoAnswer.slice(0, optionStart).trim();
      optionsPart = bodyNoAnswer.slice(optionStart).trim();
    }

    let type = currentType;
    let options = [];
    let rawAnswer = [];

    if (type === 'judgment') {
      options = ['正确', '错误'];
      rawAnswer = parseAnswerToken(ansRaw, 'judgment');
      if (!rawAnswer.length && /(正确|对|√)\s*$/.test(body)) rawAnswer = [0];
      else if (!rawAnswer.length && /(错误|错|×)\s*$/.test(body)) rawAnswer = [1];
      if (!rawAnswer.length) rawAnswer = [0];
    } else if (type === 'fill' || type === 'big') {
      const explicitAns = String(ansRaw || '').trim();
      options = [explicitAns || '（暂无标准答案，点击查看解析）'];
      rawAnswer = [0];
    } else {
      if (optionsPart) {
        const optionRegex = /(?:^|\n|\s)([A-H])\s*[.．、:：)]\s*([\s\S]*?)(?=(?:\s+[A-H]\s*[.．、:：)])|$)/g;
        let m;
        while ((m = optionRegex.exec(optionsPart)) !== null) {
          const optText = String(m[2] || '').replace(/\s+/g, ' ').trim();
          if (optText) options.push(optText);
        }
      }
      if (!options.length) {
        const inline = bodyNoAnswer.match(/([A-H])\s*[.．、:：)]\s*([^A-H]+)(?=(?:\s+[A-H]\s*[.．、:：)])|$)/g) || [];
        options = inline.map((v) => v.replace(/^[A-H]\s*[.．、:：)]\s*/, '').trim()).filter(Boolean);
      }
      if (!options.length && /判断|是非|对错/.test(currentCategory + questionText)) {
        type = 'judgment';
        options = ['正确', '错误'];
        rawAnswer = parseAnswerToken(ansRaw, 'judgment');
        if (!rawAnswer.length) rawAnswer = [0];
      } else {
        rawAnswer = parseAnswerToken(ansRaw, type);
        if (type === 'single' && rawAnswer.length > 1) type = 'multiple';
        if (!options.length && (type === 'single' || type === 'multiple')) return;
      }
    }

    questionText = questionText
      .replace(/\s+/g, ' ')
      .replace(/(?:^|\s)(?:A|B|C|D|E|F|G|H)\s*[.．、:：)]\s*$/, '')
      .trim();

    if (!questionText) return;
    if (!parsedBank[currentCategory]) parsedBank[currentCategory] = [];
    parsedBank[currentCategory].push({
      id: `${subjectId}-Q${qIndex++}`,
      type,
      question: questionText,
      options,
      rawAnswer,
      explanation: '暂无解析',
      category: currentCategory,
    });
  };

  for (const line of lines) {
    const isBlank = !line;
    const isSeparator = /^=+$/.test(line);
    const isAnswerLine = /^(?:答案|参考答案|正确答案)\s*[:：]/.test(line);
    const isOptionLine = /^[A-H]\s*[.．、:：)]\s*/.test(line);
    const isLikelyQuestionStartNoNumber = !isOptionLine && !isAnswerLine && !isSeparator
      && /[。？！?）)]\s*$/.test(line)
      && line.length >= 8;

    if (isSeparator) {
      if (currentBlock.length) {
        pushQuestionBlock(currentBlock);
        currentBlock = [];
        currentBlockHasAnswerLine = false;
      }
      continue;
    }

    if (/^[一二三四五六七八九十]+[、.．]/.test(line) && /题|选择|判断|填空|简答|论述|问答/.test(line)) {
      if (currentBlock.length) {
        pushQuestionBlock(currentBlock);
        currentBlock = [];
        currentBlockHasAnswerLine = false;
      }
      currentCategory = line;
      currentType = normalizeTypeByText(line);
      continue;
    }

    if (/^\s*(?:第?\d+\s*[题.、:]|\d+\s*[.、:）)]|[（(]?\d+[)）])\s*/.test(line)) {
      if (currentBlock.length) pushQuestionBlock(currentBlock);
      currentBlock = [line];
      currentBlockHasAnswerLine = false;
    } else if (currentBlock.length) {
      if ((isBlank || isLikelyQuestionStartNoNumber) && currentBlockHasAnswerLine) {
        pushQuestionBlock(currentBlock);
        currentBlock = isBlank ? [] : [line];
        currentBlockHasAnswerLine = false;
        continue;
      }
      if (!isBlank) currentBlock.push(line);
      if (isAnswerLine) currentBlockHasAnswerLine = true;
    } else if (!isBlank && (/[A-H]\s*[.．、:：)]/.test(line) || /(?:答案|参考答案|正确答案)\s*[:：]/.test(line) || isLikelyQuestionStartNoNumber)) {
      currentBlock = [line];
      currentBlockHasAnswerLine = isAnswerLine;
    }
  }
  if (currentBlock.length) pushQuestionBlock(currentBlock);

  if (Object.values(parsedBank).flat().length === 0) {
    const paragraphs = String(text || '').split(/\n\s*\n+/).map((p) => p.trim()).filter(Boolean);
    for (const p of paragraphs) {
      if (/^\s*(?:第?\d+\s*[题.、:]|\d+\s*[.、:）)]|[（(]?\d+[)）])/.test(p) || /[A-H]\s*[.．、:：)]/.test(p)) {
        pushQuestionBlock([p]);
      }
    }
  }

  return parsedBank;
};

export const decodeLegacyDocBuffer = (arrayBuffer) => {
  const tryDecode = (encoding) => {
    try {
      return new TextDecoder(encoding, { fatal: false }).decode(arrayBuffer);
    } catch {
      return '';
    }
  };
  const scoreText = (s) => {
    if (!s) return -1e9;
    const len = s.length || 1;
    const cjk = (s.match(/[\u4e00-\u9fff]/g) || []).length;
    const bad = (s.match(/\uFFFD/g) || []).length;
    let ctrl = 0;
    for (let i = 0; i < s.length; i++) {
      const code = s.charCodeAt(i);
      if ((code >= 0 && code <= 8) || code === 11 || code === 12 || (code >= 14 && code <= 31)) {
        ctrl++;
      }
    }
    return (cjk / len) * 3 - (bad / len) * 8 - (ctrl / len) * 2;
  };
  const candidates = [
    tryDecode('utf-8'),
    tryDecode('gb18030'),
    tryDecode('gbk'),
    tryDecode('utf-16le'),
  ];
  candidates.sort((a, b) => scoreText(b) - scoreText(a));
  return String(candidates[0] || '')
    .replace(/\0/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};
