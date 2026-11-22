import { MAOGAO_CHAPTERS, ENGLISH_CULTURE_CHAPTERS, LECTURES } from './config/quizConfig';

export const parseEnglishCultureJson = (data) => {
  const questions = data?.questions || data || [];
  if (!Array.isArray(questions)) return {};

  const chapterIdByName = {};
  ENGLISH_CULTURE_CHAPTERS.forEach((ch) => { chapterIdByName[ch.name] = ch.id; });

  const chapters = {};
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    if (!q || !q.question) continue;

    const categoryName = q.category || '作业一';
    const chId = chapterIdByName[categoryName] || 1;
    const chKey = String(chId);
    if (!chapters[chKey]) chapters[chKey] = [];

    let type = 'single';
    if (q.type === 'multiple') type = 'multiple';
    else if (q.type === 'judgment' || q.type === 'judge') type = 'judgment';
    else if (q.type === 'fill') type = 'fill';

    let options = [];
    const rawAnswer = [];

    if (type === 'judgment') {
      options = ['正确', '错误'];
      const ansStr = String(q.answer || '').trim();
      rawAnswer.push(
        ansStr === '正确' || ansStr === '对' || ansStr.toUpperCase() === 'TRUE' || q.answer === true
          ? 0
          : 1
      );
    } else if (type === 'fill') {
      options = [String(q.answer || '')];
      rawAnswer.push(0);
    } else {
      options = Array.isArray(q.options) ? q.options : [];
      const ansStr = String(q.answer || '').trim().toUpperCase();
      const letters = ansStr.split(/[^A-Z]+/).filter(Boolean);
      letters.forEach((ch) => {
        const idx = ch.charCodeAt(0) - 65;
        if (idx >= 0 && idx < options.length) rawAnswer.push(idx);
      });
      rawAnswer.sort((a, b) => a - b);
    }

    const qIdNum = q.source_problem_id || (i + 1);
    chapters[chKey].push({
      id: `ENG-CUL-${qIdNum}`,
      type,
      question: q.question || '',
      options,
      rawAnswer,
      explanation: q.explanation || '暂无解析',
      category: categoryName,
      lectureId: chId,
    });
  }

  return chapters;
};

export const parseHgdmyMaogaiJson = (data) => {
  const questions = data?.questions || data || [];
  if (!Array.isArray(questions)) return { '1': [] };

  const list = [];

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    if (!q || !q.stem) continue;

    let type = 'single';
    if (q.type === 'multiple') type = 'multiple';
    else if (q.type === 'judge') type = 'judgment';

    let options = [];
    let rawAnswer = [];

    if (type === 'judgment') {
      options = ['正确', '错误'];
      rawAnswer = q.answer === true ? [0] : [1];
    } else {
      options = Array.isArray(q.options) ? q.options : [];
      const ans = q.answer;
      if (typeof ans === 'number') {
        rawAnswer = [ans];
      } else if (Array.isArray(ans)) {
        rawAnswer = ans.filter((a) => typeof a === 'number').sort((a, b) => a - b);
      }
    }

    list.push({
      id: `HGD-MG-${i + 1}`,
      type,
      question: q.stem || '',
      options,
      rawAnswer,
      explanation: q.analysis || '暂无解析',
      category: '全部题目',
      lectureId: 1,
    });
  }

  return { '1': list };
};

export const parseMaogaiJson = (data) => {
  const chapters = {};
  const chapterMap = {};
  MAOGAO_CHAPTERS.forEach((ch) => { chapterMap[String(ch.id)] = ch.name; });

  const srcToChId = {};
  srcToChId['0（题库更新时间:2025-5-6）'] = 1;
  for (let i = 1; i <= 8; i++) srcToChId[String(i)] = i + 1;

  for (const q of data) {
    let chId = 1;
    if (q['章节ID'] !== undefined) {
      const tempChId = Number(q['章节ID']);
      if (tempChId > 0 && tempChId <= 9) {
        chId = tempChId;
      } else {
        chId = (tempChId - 1467 > 0 && tempChId - 1467 <= 9) ? (tempChId - 1467) : 1;
      }
    } else {
      const rawCh = String(q['来源章节请求'] || '0（题库更新时间:2025-5-6）');
      chId = srcToChId[rawCh] || 1;
    }

    const chKey = String(chId);
    if (!chapters[chKey]) chapters[chKey] = [];

    let type = 'single';
    const rawTypeName = String(q['题型名称'] || q['题型'] || '');
    if (/(多选|多项|多项选择)/.test(rawTypeName) || rawTypeName === '2') {
      type = 'multiple';
    } else if (/(判断|是非)/.test(rawTypeName) || rawTypeName === '4') {
      type = 'judgment';
    } else if (rawTypeName.includes('填空') || rawTypeName === '7') {
      type = 'fill';
    } else {
      type = 'single';
    }

    const optionsObj = q['选项'] || {};
    let options = [];
    let rawAnswer = [];

    if (type === 'judgment') {
      options = ['正确', '错误'];
      const ans = String(q['正确答案'] || '').trim().toUpperCase();
      if (/^(对|√|TRUE|T)$/.test(ans)) {
        rawAnswer = [0];
      } else if (/^(错|×|FALSE|F)$/.test(ans)) {
        rawAnswer = [1];
      } else if (ans === 'A') {
        // 毛概题库中 A/B 与“正确/错误”语义相反：A=错误，B=正确
        rawAnswer = [1];
      } else if (ans === 'B') {
        rawAnswer = [0];
      } else {
        rawAnswer = [0];
      }
    } else if (type === 'fill') {
      options = [q['正确答案'] || ''];
      rawAnswer = [0];
    } else {
      const keys = Object.keys(optionsObj).sort();
      options = keys.map((k) => optionsObj[k]);
      const answerStr = q['正确答案'] || '';
      const parts = answerStr.split('、').map((s) => s.trim()).filter(Boolean);
      if (parts.length > 0) {
        parts.forEach((ch) => {
          const idx = keys.indexOf(ch);
          if (idx >= 0) rawAnswer.push(idx);
        });
      }
      if (rawAnswer.length === 0 && Array.isArray(q['原始answer'])) {
        rawAnswer = [...q['原始answer']];
      }
      if (type === 'single' && rawAnswer.length > 1) {
        type = 'multiple';
      }
    }

    const rawQId = String(q['题目ID'] || '');
    let finalId = rawQId;
    if (!rawQId.startsWith('MG-')) {
      if (rawQId.startsWith('MG')) {
        finalId = 'MG-' + rawQId.substring(2);
      } else {
        finalId = `MG-${rawQId}`;
      }
    }

    chapters[chKey].push({
      id: finalId,
      type,
      question: q['题干'] || '',
      options,
      rawAnswer: rawAnswer.sort((a, b) => a - b),
      explanation: q['解析'] || '暂无解析',
      category: chapterMap[chKey] || `第${chKey}章`,
      lectureId: chId,
    });
  }

  return chapters;
};

export const parseOldFormatData = (rows, lectureId, lectureName) => {
  const fallbackName = lectureName || LECTURES.find((l) => l.id === lectureId)?.name || '经典旧题库 (综合)';
  const cleanRows = rows.filter((r) => r && r.length > 0);
  if (cleanRows.length === 0) return [];
  let startIndex = 0;
  const h = cleanRows[0];
  if (h && (String(h[0]).includes('目录') || String(h[1]).includes('题目类型'))) startIndex = 1;
  const questions = [];
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
      else type = 'single';
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
    if (!displayCat) displayCat = fallbackName;

    questions.push({
      id: `OLD-${lectureId}-${i}`,
      type,
      question: qText,
      options,
      rawAnswer,
      explanation: exp || '暂无解析',
      category: displayCat,
      lectureId,
    });
  }
  return questions;
};

export const parseExcelData = (rows, lectureId, lectureName) => {
  const resolvedName = lectureName || LECTURES.find((l) => l.id === lectureId)?.name || `章节${lectureId}`;
  const cleanRows = rows.filter((r) => r && r.length > 0);
  if (cleanRows.length === 0) return [];
  const questions = [];
  let startIndex = 0;
  const headerStr = JSON.stringify(cleanRows[0]);
  if (headerStr.includes('题型') || headerStr.includes('题干')) startIndex = 1;

  for (let i = startIndex; i < cleanRows.length; i++) {
    const row = cleanRows[i];
    const typeRaw = String(row[0] || '').trim();
    const content = String(row[1] || '').trim();
    const answerRaw = String(row[2] || '').trim();
    const explanation = String(row[3] || '').trim();
    if (!content) continue;

    let type = 'single';
    if (/(多选|多项|多项选择)/.test(typeRaw)) type = 'multiple';
    else if (/(判断|是非)/.test(typeRaw)) type = 'judgment';

    let options = [];
    let correctAnswers = [];
    if (type === 'judgment') {
      options = ['正确', '错误'];
      if (/^[对TtA√]/.test(answerRaw)) correctAnswers = [0];
      else if (/^[错FfB×]/.test(answerRaw)) correctAnswers = [1];
      else correctAnswers = [0];
    } else {
      options = [row[6], row[7], row[8], row[9], row[10]]
        .map((v) => String(v || '').trim())
        .filter(Boolean);
      const normalizedAns = answerRaw.toUpperCase().replace(/[^A-H]/g, '');
      for (const char of normalizedAns) {
        const idx = char.charCodeAt(0) - 65;
        if (idx >= 0 && idx < options.length) correctAnswers.push(idx);
      }
      if (type === 'single' && correctAnswers.length > 1) {
        type = 'multiple';
      }
    }

    if (options.length === 0) continue;
    questions.push({
      id: `L${lectureId}-${i}`,
      type,
      question: content,
      options,
      rawAnswer: correctAnswers.sort((a, b) => a - b),
      explanation: explanation || '暂无解析',
      category: resolvedName,
      lectureId,
    });
  }
  return questions;
};
