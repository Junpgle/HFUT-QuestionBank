import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api';
import * as XLSX from 'xlsx';
import {
  ChevronLeft, Calendar, CheckCircle, XCircle, Clock, ArrowRight, BookOpen,
  Zap, Eye, X, MessageCircle, RefreshCw, Sun, Moon, Monitor
} from 'lucide-react';
import './index.css';
import {
  parseEnglishCultureJson,
  parseMaogaiJson,
  parseHgdmyMaogaiJson,
  parseExcelData,
  parseOldFormatData
} from './maogaiParser';
import {
  LECTURES,
  MAOGAO_CHAPTERS,
  ENGLISH_CULTURE_CHAPTERS,
  SUBJECTS,
  BANK_CACHE_VERSION,
  getBankCacheKey,
  getBankCacheVersionKey
} from './config/quizConfig';
import { Markdown } from './components/Markdown';
import { formatDate } from './utils/date';
import { normalizeQuestionId } from './utils/questionId';
import { parseCulturalRelicsJson, RELICS_SUBJECT_ID, RELICS_CHAPTERS } from './utils/culturalRelics.js';
import { safeGet, safeSet } from './utils/storage';
import {
  getCachedThread,
  setCachedThread,
  invalidateCachedThread,
  getReportBundleCacheKey,
  invalidateReportBundleCache
} from './utils/threadCache';
import {
  getThemeMode,
  applyTheme,
  initThemeListener,
  destroyThemeListener,
  setThemeMode
} from './utils/theme';

const REPORT_BUNDLE_TTL_MS = 3 * 60 * 1000;

const safeText = (v) => (typeof v === 'string' ? v : (v ? String(v) : ''));

const fetchLectureArrayBuffer = async (lecture) => {
  const url = `/${encodeURIComponent(lecture.file)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
};

const getSubjectBadge = (questionId) => {
  const normId = String(normalizeQuestionId(questionId) || '');
  if (normId.startsWith('RELICS-')) {
    return { label: '文物精品', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300' };
  }
  if (normId.startsWith('ENG-CUL-')) {
    return { label: '英美文化', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400' };
  }
  if (normId.startsWith('HGD-MG-')) {
    return { label: '马院毛概', cls: 'bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400' };
  }
  if (normId.startsWith('MG-')) {
    return { label: '毛概', cls: 'bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400' };
  }
  return { label: '创新创业', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400' };
};

function Report() {
  const [themeMode, setThemeModeState] = useState(getThemeMode());
  const [currentUser] = useState(() => api.getCurrentUser());

  useEffect(() => {
    applyTheme(getThemeMode());
    initThemeListener();

    const handleThemeChanged = (e) => {
      setThemeModeState(e.detail);
    };
    window.addEventListener('app_theme_changed', handleThemeChanged);

    return () => {
      destroyThemeListener();
      window.removeEventListener('app_theme_changed', handleThemeChanged);
    };
  }, []);

  const [ready, setReady] = useState(false);
  const [refreshingCloud, setRefreshingCloud] = useState(false);
  const [customSubjects, setCustomSubjects] = useState([]);
  const allSubjects = useMemo(() => [...SUBJECTS, ...customSubjects], [customSubjects]);
  const [customBanks, setCustomBanks] = useState({});

  const [selectedSubject, setSelectedSubject] = useState(() => {
    const hash = window.location.hash;
    const queryIndex = hash.indexOf('?');
    if (queryIndex !== -1) {
      const searchParams = new URLSearchParams(hash.substring(queryIndex));
      const sub = searchParams.get('subject');
      if (sub) return sub;
    }
    return 'innovation';
  });
  const [data, setData] = useState(null);

  const [innovationBank, setInnovationBank] = useState({});
  const [maogaiBank, setMaogaiBank] = useState({});
  const [hgdmyMaogaiBank, setHgdmyMaogaiBank] = useState({});
  const [englishCultureBank, setEnglishCultureBank] = useState({});
  const [culturalRelicsBank, setCulturalRelicsBank] = useState({});

  const [selectedDate, setSelectedDate] = useState(null);
  const [viewingQuestion, setViewingQuestion] = useState(null);

  // 评论与解析相关
  const [userExplanations, setUserExplanations] = useState({});
  const [editingExpId, setEditingExpId] = useState(null);
  const [editingExpContent, setEditingExpContent] = useState('');

  const [localProgress, setLocalProgress] = useState({ history: [], brushedIds: [], masteredIds: [] });

  // 个人中心数据 (我的评论与我的解析)
  const [userComments, setUserComments] = useState([]);
  const [userExplList, setUserExplList] = useState([]);
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [editingCommentContent, setEditingCommentContent] = useState('');

  // UI 状态
  const [showModal, setShowModal] = useState(null); // 'comments' or 'explanations'
  const [commentPage, setCommentPage] = useState(1);
  const [explanationPage, setExplanationPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  const loadReportBundle = useCallback(async (force = false) => {
    if (!currentUser) return;
    const cacheKey = getReportBundleCacheKey();
    if (!force) {
      try {
        const raw = sessionStorage.getItem(cacheKey);
        if (raw) {
          const cached = JSON.parse(raw);
          if (cached && Date.now() - cached.ts < REPORT_BUNDLE_TTL_MS && cached.data) {
            setData(cached.data.progress || null);
            setUserComments(Array.isArray(cached.data.comments) ? cached.data.comments : []);
            setUserExplList(Array.isArray(cached.data.explanations) ? cached.data.explanations : []);
            return;
          }
        }
      } catch {
        // 忽略缓存解析错误
      }
    }

    try {
      const bundle = await api.getReportBundle();
      if (bundle) {
        setData(bundle.progress || null);
        setUserComments(Array.isArray(bundle.comments) ? bundle.comments : []);
        setUserExplList(Array.isArray(bundle.explanations) ? bundle.explanations : []);
        try {
          sessionStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data: bundle }));
        } catch {
          // 忽略 sessionStorage 异常
        }
      }
    } catch (e) {
      console.error('Report bundle fetch error', e);
    }
  }, [currentUser]);

  useEffect(() => {
    const init = async () => {
      // 1. 登录用户用 1 次 3 合 1 请求拉取（进度 + 我的评论 + 我的解析）
      const cloudPromise = loadReportBundle(false);

      // 2. 加载创新创业题库（统一使用 getBankCacheKey）
      const loadInnovation = async () => {
        try {
          const cacheKey = getBankCacheKey('innovation');
          const verKey = getBankCacheVersionKey('innovation');
          const [cached, cachedVer] = await Promise.all([safeGet(cacheKey), safeGet(verKey)]);
          if (cached && Number(cachedVer) === BANK_CACHE_VERSION && Object.keys(cached).length > 0) {
            setInnovationBank(cached);
          } else {
            const newBank = {};
            await Promise.all(LECTURES.map(async (lecture) => {
              try {
                const buf = await fetchLectureArrayBuffer(lecture);
                const wb = XLSX.read(buf, { type: 'array' });
                const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
                newBank[lecture.id] = lecture.id === 99
                  ? parseOldFormatData(raw, lecture.id, lecture.name)
                  : parseExcelData(raw, lecture.id, lecture.name);
              } catch (e) {
                console.warn('Innovation bank load error', lecture.file, e);
              }
            }));
            setInnovationBank(newBank);
            if (Object.keys(newBank).length > 0) {
              await safeSet(cacheKey, newBank);
              await safeSet(verKey, BANK_CACHE_VERSION);
            }
          }
        } catch (e) {
          console.warn('Innovation bank load error', e);
        }
      };

      // 3. 加载毛概题库
      const loadMaogai = async () => {
        try {
          const cacheKey = getBankCacheKey('maogai');
          const verKey = getBankCacheVersionKey('maogai');
          const [cachedM, cachedVer] = await Promise.all([safeGet(cacheKey), safeGet(verKey)]);
          if (cachedM && Number(cachedVer) === BANK_CACHE_VERSION && Object.keys(cachedM).length > 0) {
            setMaogaiBank(cachedM);
          } else {
            const res = await fetch('/maogai_full.json');
            if (res.ok) {
              const rawJson = await res.json();
              const parsed = parseMaogaiJson(rawJson);
              setMaogaiBank(parsed);
              await safeSet(cacheKey, parsed);
              await safeSet(verKey, BANK_CACHE_VERSION);
            }
          }
        } catch (e) {
          console.warn('Maogai bank load error', e);
        }
      };

      // 4. 加载马院毛概题库
      const loadHgdmy = async () => {
        try {
          const cacheKey = getBankCacheKey('hgdmy-maogai');
          const verKey = getBankCacheVersionKey('hgdmy-maogai');
          const [cachedH, cachedVer] = await Promise.all([safeGet(cacheKey), safeGet(verKey)]);
          if (cachedH && Number(cachedVer) === BANK_CACHE_VERSION && Object.keys(cachedH).length > 0) {
            setHgdmyMaogaiBank(cachedH);
          } else {
            const res = await fetch('/hgdmy-maogai.json');
            if (res.ok) {
              const rawJson = await res.json();
              const parsed = parseHgdmyMaogaiJson(rawJson);
              setHgdmyMaogaiBank(parsed);
              await safeSet(cacheKey, parsed);
              await safeSet(verKey, BANK_CACHE_VERSION);
            }
          }
        } catch (e) {
          console.warn('Hgdmy maogai bank load error', e);
        }
      };

      // 5. 加载英语国家社会与文化题库
      const loadEnglishCulture = async () => {
        try {
          const cacheKey = getBankCacheKey('english-culture');
          const verKey = getBankCacheVersionKey('english-culture');
          const [cachedE, cachedVer] = await Promise.all([safeGet(cacheKey), safeGet(verKey)]);
          if (cachedE && Number(cachedVer) === BANK_CACHE_VERSION && Object.keys(cachedE).length > 0) {
            setEnglishCultureBank(cachedE);
          } else {
            const res = await fetch('/english-culture.json');
            if (res.ok) {
              const rawJson = await res.json();
              const parsed = parseEnglishCultureJson(rawJson);
              setEnglishCultureBank(parsed);
              await safeSet(cacheKey, parsed);
              await safeSet(verKey, BANK_CACHE_VERSION);
            }
          }
        } catch (e) {
          console.warn('English culture bank load error', e);
        }
      };

      // 加载文物精品与中华文明题库
      const loadCulturalRelics = async () => {
        try {
          const cacheKey = getBankCacheKey(RELICS_SUBJECT_ID);
          const verKey = getBankCacheVersionKey(RELICS_SUBJECT_ID);
          const [cachedR, cachedVer] = await Promise.all([safeGet(cacheKey), safeGet(verKey)]);
          if (cachedR && Number(cachedVer) === BANK_CACHE_VERSION && Object.keys(cachedR).length > 0) {
            setCulturalRelicsBank(cachedR);
          } else {
            const res = await fetch('/cultural-relics.json');
            if (res.ok) {
              const rawJson = await res.json();
              const parsed = parseCulturalRelicsJson(rawJson);
              setCulturalRelicsBank(parsed);
              await safeSet(cacheKey, parsed);
              await safeSet(verKey, BANK_CACHE_VERSION);
            }
          }
        } catch (e) {
          console.warn('Cultural relics bank load error', e);
        }
      };

      // 6. 加载自定义学科列表与本地自定义题库
      const loadCustom = async () => {
        try {
          const cSubs = await safeGet('custom_subjects_list', []);
          const validSubs = Array.isArray(cSubs) ? cSubs : [];
          setCustomSubjects(validSubs);
          const cBanks = {};
          await Promise.all(validSubs.map(async (sub) => {
            try {
              const cachedBank = await safeGet(getBankCacheKey(sub.id));
              if (cachedBank && Object.keys(cachedBank).length > 0) {
                cBanks[sub.id] = cachedBank;
              }
            } catch (e) {
              console.warn('Load custom bank fail', sub.id, e);
            }
          }));
          setCustomBanks(cBanks);
        } catch (e) {
          console.warn('Load custom subjects fail', e);
        }
      };

      // 7. 加载本地进度
      const loadLocalProgress = async () => {
        try {
          const [localHist, localBrushed, localMastered] = await Promise.all([
            safeGet('app_history', []),
            safeGet('app_brushedIds', []),
            safeGet('app_masteredIds', []),
          ]);
          setLocalProgress({
            history: Array.isArray(localHist) ? localHist : [],
            brushedIds: Array.isArray(localBrushed) ? localBrushed : [],
            masteredIds: Array.isArray(localMastered) ? localMastered : [],
          });
        } catch (e) {
          console.warn('Load local progress fail', e);
        }
      };

      await Promise.all([
        cloudPromise,
        loadInnovation(),
        loadMaogai(),
        loadHgdmy(),
        loadEnglishCulture(),
        loadCulturalRelics(),
        loadCustom(),
        loadLocalProgress()
      ]);

      setReady(true);
    };
    init();
  }, [loadReportBundle]);

  // 统一按学科过滤并归一化题目 ID
  const mergedHistory = useMemo(() => {
    let remoteHistory = [];
    if (data?.history) {
      remoteHistory = typeof data.history === 'string' ? JSON.parse(data.history) : data.history;
    }

    const local = Array.isArray(localProgress.history) ? localProgress.history : [];
    const map = new Map();

    [...remoteHistory, ...local].forEach((h, idx) => {
      if (!h || !h.timestamp) return;
      const normalizedQid = normalizeQuestionId(h.questionId);
      const key = `${h.timestamp}-${normalizedQid || idx}-${h.action || ''}`;
      if (!map.has(key)) {
        map.set(key, { ...h, questionId: normalizedQid });
      }
    });
    return [...map.values()].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }, [data, localProgress]);

  const normalizedBrushed = useMemo(() => {
    const remote = data?.brushedIds ? (typeof data.brushedIds === 'string' ? JSON.parse(data.brushedIds) : data.brushedIds) : [];
    const local = localProgress.brushedIds || [];
    return new Set([...remote, ...local].map(normalizeQuestionId));
  }, [data, localProgress]);

  const matchesSubject = (questionId) => {
    const qid = String(questionId || '');
    const isMaogai = qid.startsWith('MG-');
    const isHgdmy = qid.startsWith('HGD-MG-') || qid.startsWith('HGD-MG');
    const isEnglishCulture = qid.startsWith('ENG-CUL-');
    const isCulturalRelics = qid.startsWith('RELICS-');
    const isCustom = qid.startsWith('custom_');
    if (selectedSubject && selectedSubject.startsWith('custom_')) {
      return qid.startsWith(selectedSubject);
    }
    if (selectedSubject === 'maogai') return isMaogai && !isHgdmy;
    if (selectedSubject === 'hgdmy-maogai') return isHgdmy;
    if (selectedSubject === 'english-culture') return isEnglishCulture;
    if (selectedSubject === RELICS_SUBJECT_ID) return isCulturalRelics;
    return !isMaogai && !isHgdmy && !isEnglishCulture && !isCustom && !isCulturalRelics;
  };

  const activeHistory = useMemo(
    () => mergedHistory.filter((h) => matchesSubject(h.questionId)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mergedHistory, selectedSubject]
  );

  const activeBrushed = useMemo(
    () => new Set([...normalizedBrushed].filter((id) => matchesSubject(id))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [normalizedBrushed, selectedSubject]
  );

  // 日期提取
  const dates = useMemo(() => {
    const uniqueDates = new Set();
    activeHistory.forEach((h) => {
      if (h && h.timestamp) {
        uniqueDates.add(new Date(h.timestamp).toLocaleDateString());
      }
    });
    const sortedDates = [...uniqueDates].sort((a, b) => new Date(b) - new Date(a));
    return sortedDates.length ? sortedDates : [new Date().toLocaleDateString()];
  }, [activeHistory]);

  // 保证选中的日期一定在可用日期列表中
  useEffect(() => {
    if (dates.length > 0 && (!selectedDate || !dates.includes(selectedDate))) {
      const timer = setTimeout(() => {
        setSelectedDate(dates[0]);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [dates, selectedDate]);

  const dailyRecords = useMemo(() => {
    if (!selectedDate) return [];
    return activeHistory
      .filter((h) => new Date(h.timestamp).toLocaleDateString() === selectedDate)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .map((h) => ({ ...h, questionTitle: safeText(h.questionTitle), userAnswer: safeText(h.userAnswer) }));
  }, [activeHistory, selectedDate]);

  const dailyStats = useMemo(() => {
    const total = dailyRecords.filter((h) => h.action === 'answer').length;
    const correct = dailyRecords.filter((h) => h.action === 'answer' && h.isCorrect).length;
    const mastered = new Set(dailyRecords.filter((h) => h.isCorrect).map((h) => h.questionId)).size;
    return { total, correct, rate: total ? Math.round((correct / total) * 100) : 0, mastered };
  }, [dailyRecords]);

  // 跨学科全局题目智能查找器
  const getQuestionDetails = (qid) => {
    if (!qid) return null;
    const normalizedQid = String(normalizeQuestionId(qid));
    if (normalizedQid.startsWith('custom_')) {
      for (const subId in customBanks) {
        if (normalizedQid.startsWith(subId)) {
          const bank = customBanks[subId];
          for (const chId in bank) {
            const q = bank[chId]?.find((i) => i.id === normalizedQid);
            if (q) return q;
          }
        }
      }
    } else if (normalizedQid.startsWith('RELICS-')) {
      for (const chId in culturalRelicsBank) {
        const q = culturalRelicsBank[chId]?.find((i) => i.id === normalizedQid);
        if (q) return q;
      }
    } else if (normalizedQid.startsWith('ENG-CUL-')) {
      for (const chId in englishCultureBank) {
        const q = englishCultureBank[chId]?.find((i) => i.id === normalizedQid);
        if (q) return q;
      }
    } else if (normalizedQid.startsWith('HGD-MG-') || normalizedQid.startsWith('HGD-MG')) {
      for (const chId in hgdmyMaogaiBank) {
        const q = hgdmyMaogaiBank[chId]?.find((i) => i.id === normalizedQid);
        if (q) return q;
      }
    } else if (normalizedQid.startsWith('MG-')) {
      for (const chId in maogaiBank) {
        const q = maogaiBank[chId]?.find((i) => i.id === normalizedQid);
        if (q) return q;
      }
    } else {
      for (const lid in innovationBank) {
        const q = innovationBank[lid]?.find((i) => i.id === normalizedQid);
        if (q) return q;
      }
    }
    return null;
  };

  const loadQuestionExplanations = async (questionId) => {
    if (!questionId || String(questionId).startsWith('custom_')) return;
    if (userExplanations[questionId]) return;

    const cachedThread = getCachedThread(questionId);
    if (cachedThread && Array.isArray(cachedThread.explanations)) {
      setUserExplanations((prev) => ({ ...prev, [questionId]: cachedThread.explanations }));
      return;
    }

    try {
      const list = await api.getExplanations(questionId);
      const safeList = Array.isArray(list) ? list : [];
      setUserExplanations((prev) => ({ ...prev, [questionId]: safeList }));
      const existing = cachedThread || { comments: [], explanations: [] };
      setCachedThread(questionId, { ...existing, explanations: safeList });
    } catch (e) {
      console.warn('load explanations fail', e);
    }
  };

  const handleUpdateExp = async (questionId) => {
    const trimmed = editingExpContent.trim();
    if (!editingExpId || !trimmed) return;
    const targetId = editingExpId;
    try {
      await api.request(`/explanations/${targetId}`, 'PUT', { content: trimmed });
      setEditingExpId(null);
      setEditingExpContent('');
      setUserExplanations((prev) => {
        const nextList = (prev[questionId] || []).map((e) => (e.id === targetId ? { ...e, content: trimmed } : e));
        const cached = getCachedThread(questionId) || { comments: [], explanations: [] };
        setCachedThread(questionId, { ...cached, explanations: nextList });
        return { ...prev, [questionId]: nextList };
      });
      setUserExplList((prev) => prev.map((e) => (e.id === targetId ? { ...e, content: trimmed } : e)));
      invalidateReportBundleCache();
    } catch (e) {
      alert('更新解析失败: ' + e.message);
    }
  };

  const invalidateQuestionCaches = (rawQid) => {
    invalidateReportBundleCache();
    if (!rawQid) return;
    const normQid = normalizeQuestionId(rawQid);
    invalidateCachedThread(rawQid);
    if (normQid && normQid !== rawQid) invalidateCachedThread(normQid);
    setUserExplanations((prev) => {
      if (!prev[rawQid] && (!normQid || !prev[normQid])) return prev;
      const next = { ...prev };
      delete next[rawQid];
      if (normQid) delete next[normQid];
      return next;
    });
  };

  const handleUpdateComment = async (commentId) => {
    const trimmed = editingCommentContent.trim();
    if (!editingCommentId || !trimmed) return;
    const target = userComments.find((c) => c.id === commentId);
    try {
      await api.request(`/comments/${commentId}`, 'PUT', { content: trimmed });
      setEditingCommentId(null);
      setEditingCommentContent('');
      setUserComments((prev) => prev.map((c) => (c.id === commentId ? { ...c, content: trimmed } : c)));
      invalidateQuestionCaches(target?.questionId);
    } catch (e) {
      alert('更新评论失败: ' + e.message);
    }
  };

  const handleDeleteComment = async (commentId) => {
    if (!confirm('确定删除此评论吗？')) return;
    const target = userComments.find((c) => c.id === commentId);
    try {
      await api.request(`/comments/${commentId}`, 'DELETE');
      setUserComments((prev) => prev.filter((c) => c.id !== commentId));
      invalidateQuestionCaches(target?.questionId);
    } catch (e) {
      alert('删除失败: ' + e.message);
    }
  };

  const handleDeleteExplanation = async (explanationId) => {
    if (!confirm('确定删除此解析吗？')) return;
    const target = userExplList.find((e) => e.id === explanationId);
    try {
      await api.request(`/explanations/${explanationId}`, 'DELETE');
      setUserExplList((prev) => prev.filter((e) => e.id !== explanationId));
      invalidateQuestionCaches(target?.questionId);
    } catch (e) {
      alert('删除失败: ' + e.message);
    }
  };

  const openQuestion = (qid) => {
    const normalized = normalizeQuestionId(qid);
    const q = getQuestionDetails(normalized);
    if (!q) {
      alert('题库中未找到该题（当前可能尚未加载完整）');
      return;
    }
    const formatted = {
      ...q,
      question: safeText(q.question),
      explanation: safeText(q.explanation),
      options: Array.isArray(q.options) ? q.options.map(safeText) : [],
      rawAnswer: Array.isArray(q.rawAnswer) ? q.rawAnswer : [],
    };
    setViewingQuestion(formatted);
    loadQuestionExplanations(formatted.id);
  };

  const renderUserExps = (questionId) => {
    const list = userExplanations[questionId];
    if (!list || !list.length) return null;
    return (
      <div className="mt-4 rounded-xl bg-slate-50 border border-slate-200 p-3 space-y-3 dark:bg-slate-900/60 dark:border-slate-800">
        <div className="text-xs font-semibold text-slate-600 flex items-center gap-2 dark:text-slate-300">
          <BookOpen size={14} /> 用户提供的解析
        </div>
        {list.map((exp) => {
          const isOwner = currentUser && exp.authorId === currentUser.id;
          const isEditing = editingExpId === exp.id;
          return (
            <div key={exp.id} className="bg-white border border-slate-100 p-3 rounded-lg space-y-2 dark:bg-slate-900 dark:border-slate-800">
              <div className="text-xs text-slate-500 flex items-center justify-between dark:text-slate-400">
                <span>{exp.author} · {formatDate(exp.createdAt)}</span>
                {isOwner && !isEditing && (
                  <button
                    onClick={() => {
                      setEditingExpId(exp.id);
                      setEditingExpContent(exp.content);
                    }}
                    className="text-blue-600 text-xs dark:text-blue-400"
                  >
                    编辑
                  </button>
                )}
              </div>
              {isEditing ? (
                <div className="space-y-2">
                  <textarea value={editingExpContent} onChange={(e) => setEditingExpContent(e.target.value)} rows={3} className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm dark:bg-slate-950 dark:border-slate-700 dark:text-slate-200" />
                  <div className="flex justify-end gap-2 text-xs">
                    <button onClick={() => handleUpdateExp(questionId)} className="px-3 py-1 bg-blue-600 text-white rounded-lg">保存</button>
                    <button onClick={() => { setEditingExpId(null); setEditingExpContent(''); }} className="px-3 py-1 bg-slate-200 text-slate-700 rounded-lg dark:bg-slate-800 dark:text-slate-300">取消</button>
                  </div>
                </div>
              ) : (
                <>
                  <Markdown content={exp.content} />
                  <div className="text-xs text-amber-600 dark:text-amber-400">👍 {exp.votes || 0}</div>
                </>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const renderMyCommentsSection = () => (
    <button
      onClick={() => {
        if (!currentUser) {
          alert('请登录后查看您的云端评论');
          return;
        }
        setShowModal('comments');
        setCommentPage(1);
      }}
      className="glass-card rounded-2xl p-6 w-full hover:shadow-lg transition-shadow bg-white border border-slate-200 dark:bg-slate-900 dark:border-slate-800"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <MessageCircle size={24} className="text-blue-600 dark:text-blue-400" />
          <div className="text-left">
            <div className="font-bold text-slate-800 dark:text-slate-200">我的评论</div>
            <div className="text-sm text-slate-500 dark:text-slate-400">
              {currentUser ? `共 ${userComments.length} 条` : '登录后查看'}
            </div>
          </div>
        </div>
        <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
          {currentUser ? userComments.length : '-'}
        </div>
      </div>
    </button>
  );

  const renderMyExplanationsSection = () => (
    <button
      onClick={() => {
        if (!currentUser) {
          alert('请登录后查看您的云端解析');
          return;
        }
        setShowModal('explanations');
        setExplanationPage(1);
      }}
      className="glass-card rounded-2xl p-6 w-full hover:shadow-lg transition-shadow bg-white border border-slate-200 dark:bg-slate-900 dark:border-slate-800"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Zap size={24} className="text-yellow-600 dark:text-amber-500" />
          <div className="text-left">
            <div className="font-bold text-slate-800 dark:text-slate-200">我的解析</div>
            <div className="text-sm text-slate-500 dark:text-slate-400">
              {currentUser ? `共 ${userExplList.length} 条` : '登录后查看'}
            </div>
          </div>
        </div>
        <div className="text-2xl font-bold text-yellow-600 dark:text-amber-500">
          {currentUser ? userExplList.length : '-'}
        </div>
      </div>
    </button>
  );

  const renderCommentsModal = () => {
    const paginatedComments = userComments.slice((commentPage - 1) * ITEMS_PER_PAGE, commentPage * ITEMS_PER_PAGE);
    const totalPages = Math.ceil(userComments.length / ITEMS_PER_PAGE);

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={() => setShowModal(null)}>
        <div className="bg-white rounded-2xl w-full max-w-5xl max-h-[80vh] shadow-2xl flex flex-col dark:bg-slate-900 dark:border dark:border-slate-800" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-800">
            <h2 className="font-bold text-slate-800 flex items-center gap-2 dark:text-slate-100"><MessageCircle size={20} className="text-blue-600 dark:text-blue-400" />我的评论</h2>
            <button onClick={() => setShowModal(null)} className="p-1 hover:bg-slate-100 rounded-full dark:hover:bg-slate-800 dark:text-slate-400"><X size={20} /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-6 space-y-3">
            {userComments.length === 0 ? <p className="text-center text-slate-400 dark:text-slate-500">暂无评论</p> : paginatedComments.map((comment) => {
              const isEditing = editingCommentId === comment.id;
              const normId = normalizeQuestionId(comment.questionId);
              const badge = getSubjectBadge(normId);
              return (
                <div key={comment.id} className="bg-slate-50 border border-slate-200 p-4 rounded-lg space-y-2 dark:bg-slate-950 dark:border-slate-800">
                  <div className="flex justify-between">
                    <p className="text-sm font-medium text-slate-700 cursor-pointer hover:text-blue-600 dark:text-slate-300 dark:hover:text-blue-400" onClick={() => { openQuestion(comment.questionId); setShowModal(null); }}>
                      <span className={`px-1.5 py-0.5 rounded text-xs mr-2 font-bold ${badge.cls}`}>
                        {badge.label}
                      </span>
                      ID: {normId}
                    </p>
                    <span className="text-xs text-amber-600 dark:text-amber-500">👍 {comment.likes}</span>
                  </div>
                  {isEditing ? (
                    <div className="space-y-2">
                      <textarea value={editingCommentContent} onChange={(e) => setEditingCommentContent(e.target.value)} className="w-full p-2 border rounded text-sm dark:bg-slate-900 dark:border-slate-800 dark:text-slate-200" />
                      <div className="flex justify-end gap-2 text-xs">
                        <button onClick={() => handleUpdateComment(comment.id)} className="text-blue-600 dark:text-blue-400">保存</button>
                        <button onClick={() => setEditingCommentId(null)} className="text-slate-500 dark:text-slate-400">取消</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex justify-between items-end">
                      <p className="text-sm text-slate-600 dark:text-slate-300">{comment.content}</p>
                      <div className="flex gap-2 text-xs">
                        <button onClick={() => { setEditingCommentId(comment.id); setEditingCommentContent(comment.content); }} className="text-blue-600 dark:text-blue-400">编辑</button>
                        <button onClick={() => handleDeleteComment(comment.id)} className="text-red-600 dark:text-red-400">删除</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {totalPages > 1 && (
            <div className="flex justify-between p-6 border-t border-slate-200 dark:border-slate-800">
              <button onClick={() => setCommentPage((p) => Math.max(1, p - 1))} disabled={commentPage === 1} className="text-sm disabled:opacity-50 dark:text-slate-400 dark:disabled:opacity-20">上一页</button>
              <span className="text-sm dark:text-slate-300">{commentPage} / {totalPages}</span>
              <button onClick={() => setCommentPage((p) => Math.min(totalPages, p + 1))} disabled={commentPage === totalPages} className="text-sm disabled:opacity-50 dark:text-slate-400 dark:disabled:opacity-20">下一页</button>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderExplanationsModal = () => {
    const paginated = userExplList.slice((explanationPage - 1) * ITEMS_PER_PAGE, explanationPage * ITEMS_PER_PAGE);
    const totalPages = Math.ceil(userExplList.length / ITEMS_PER_PAGE);

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={() => setShowModal(null)}>
        <div className="bg-white rounded-2xl w-full max-w-5xl max-h-[80vh] shadow-2xl flex flex-col dark:bg-slate-900 dark:border dark:border-slate-800" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-800">
            <h2 className="font-bold text-slate-800 flex items-center gap-2 dark:text-slate-100"><Zap size={20} className="text-yellow-600 dark:text-amber-500" />我的解析</h2>
            <button onClick={() => setShowModal(null)} className="p-1 hover:bg-slate-100 rounded-full dark:hover:bg-slate-800 dark:text-slate-400"><X size={20} /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-6 space-y-3">
            {userExplList.length === 0 ? <p className="text-center text-slate-400 dark:text-slate-500">暂无解析</p> : paginated.map((exp) => {
              const normId = normalizeQuestionId(exp.questionId);
              const badge = getSubjectBadge(normId);
              return (
                <div key={exp.id} className="bg-indigo-50 border border-indigo-200 p-4 rounded-lg space-y-2 dark:bg-indigo-950/20 dark:border-indigo-900/30">
                  <div className="flex justify-between">
                    <p className="text-sm font-medium text-indigo-900 cursor-pointer hover:text-indigo-600 dark:text-indigo-300 dark:hover:text-indigo-400" onClick={() => { openQuestion(exp.questionId); setShowModal(null); }}>
                      <span className={`px-1.5 py-0.5 rounded text-xs mr-2 font-bold ${badge.cls}`}>
                        {badge.label}
                      </span>
                      ID: {normId}
                    </p>
                    <span className="text-xs text-amber-600 dark:text-amber-500">👍 {exp.votes}</span>
                  </div>
                  <div className="text-sm text-indigo-900 line-clamp-3 dark:text-indigo-200"><Markdown content={exp.content} /></div>
                  <div className="flex justify-end gap-2 text-xs">
                    <button onClick={() => handleDeleteExplanation(exp.id)} className="text-red-600 dark:text-red-400">删除</button>
                  </div>
                </div>
              );
            })}
          </div>
          {totalPages > 1 && (
            <div className="flex justify-between p-6 border-t border-slate-200 dark:border-slate-800">
              <button onClick={() => setExplanationPage((p) => Math.max(1, p - 1))} disabled={explanationPage === 1} className="text-sm disabled:opacity-50 dark:text-slate-400 dark:disabled:opacity-20">上一页</button>
              <span className="text-sm dark:text-slate-300">{explanationPage} / {totalPages}</span>
              <button onClick={() => setExplanationPage((p) => Math.min(totalPages, p + 1))} disabled={explanationPage === totalPages} className="text-sm disabled:opacity-50 dark:text-slate-400 dark:disabled:opacity-20">下一页</button>
            </div>
          )}
        </div>
      </div>
    );
  };

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
        <div className="flex items-center gap-2 text-slate-500 text-sm dark:text-slate-400"><RefreshCw className="animate-spin" size={16} /> 正在同步数据...</div>
      </div>
    );
  }

  const currentSubjectObj = allSubjects.find((sub) => sub.id === selectedSubject);

  const activeBank = selectedSubject && selectedSubject.startsWith('custom_')
    ? (customBanks[selectedSubject] || {})
    : (selectedSubject === 'maogai' ? maogaiBank : selectedSubject === 'hgdmy-maogai' ? hgdmyMaogaiBank : selectedSubject === 'english-culture' ? englishCultureBank : selectedSubject === RELICS_SUBJECT_ID ? culturalRelicsBank : innovationBank);

  const activeChapters = selectedSubject && selectedSubject.startsWith('custom_')
    ? (currentSubjectObj?.lectures || [])
    : (selectedSubject === 'maogai' ? MAOGAO_CHAPTERS : selectedSubject === 'hgdmy-maogai' ? [{ id: 1, name: '全部题目' }] : selectedSubject === 'english-culture' ? ENGLISH_CULTURE_CHAPTERS : selectedSubject === RELICS_SUBJECT_ID ? RELICS_CHAPTERS : LECTURES);

  const nextModeMap = {
    system: 'light',
    light: 'dark',
    dark: 'auto',
    auto: 'system'
  };

  const getThemeIcon = () => {
    switch (themeMode) {
      case 'light': return <Sun size={18} className="text-amber-500" />;
      case 'dark': return <Moon size={18} className="text-indigo-400" />;
      case 'auto': return <Clock size={18} className="text-emerald-500" />;
      default: return <Monitor size={18} className="text-slate-500" />;
    }
  };

  const getThemeTitle = () => {
    switch (themeMode) {
      case 'light': return '主题: 极简日间 (点击切换)';
      case 'dark': return '主题: 护眼夜间 (点击切换)';
      case 'auto': return '主题: 自动切换 (18:00-06:00夜间, 点击切换)';
      default: return '主题: 跟随系统 (点击切换)';
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col dark:bg-slate-950 transition-colors duration-300">
      <div className="sticky top-0 bg-white border-b border-slate-200 z-10 px-4 py-3 flex items-center justify-between shadow-sm dark:bg-slate-900 dark:border-slate-800">
        <button onClick={() => { window.location.hash = '/'; }} className="p-2 -ml-2 text-slate-600 hover:bg-slate-50 rounded-full flex items-center gap-1 dark:text-slate-300 dark:hover:bg-slate-800">
          <ChevronLeft size={20} /> <span className="text-sm font-bold">返回主页</span>
        </button>
        <h1 className="font-bold text-slate-800 dark:text-slate-100">学习数据报表</h1>

        <div className="flex items-center gap-1">
          {currentUser && (
            <button
              onClick={async () => {
                if (refreshingCloud) return;
                setRefreshingCloud(true);
                try {
                  await loadReportBundle(true);
                } finally {
                  setRefreshingCloud(false);
                }
              }}
              disabled={refreshingCloud}
              className="p-2 text-slate-600 hover:bg-slate-50 rounded-full flex items-center justify-center dark:text-slate-300 dark:hover:bg-slate-800 disabled:opacity-50"
              title="刷新云端数据"
            >
              <RefreshCw size={18} className={refreshingCloud ? 'animate-spin text-blue-500' : ''} />
            </button>
          )}
          <button
            onClick={() => {
              const next = nextModeMap[themeMode] || 'system';
              setThemeModeState(next);
              setThemeMode(next);
            }}
            className="p-2 text-slate-600 hover:bg-slate-50 rounded-full flex items-center justify-center dark:text-slate-300 dark:hover:bg-slate-800"
            title={getThemeTitle()}
          >
            {getThemeIcon()}
          </button>
        </div>
      </div>

      <div className="flex-1 max-w-3xl mx-auto w-full p-4 space-y-6">
        {/* 学科切换选项卡 */}
        <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200 overflow-x-auto no-scrollbar dark:bg-slate-900 dark:border-slate-800">
          {allSubjects.map((sub) => (
            <button
              key={sub.id}
              onClick={() => { setSelectedSubject(sub.id); setSelectedDate(null); }}
              className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 min-w-[100px] ${
                selectedSubject === sub.id
                  ? 'bg-white shadow text-blue-600 dark:bg-slate-950 dark:text-blue-400 dark:shadow-indigo-950/20'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
              }`}
            >
              <span>{sub.icon}</span>
              <span>{sub.shortName || sub.name}</span>
            </button>
          ))}
        </div>

        {/* 日期选择器 */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-slate-500 px-2 dark:text-slate-400">选择学习记录日期 ({dates.length} 天)</div>
          <div className="overflow-x-auto no-scrollbar -mx-4 px-4">
            <div className="flex gap-2 w-max">
              {dates.map((d) => (
                <button
                  key={d}
                  onClick={() => setSelectedDate(d)}
                  className={`px-4 py-2 rounded-full text-sm font-bold transition-all border flex-shrink-0 ${selectedDate === d ? 'bg-blue-600 text-white border-blue-600 shadow-md dark:bg-blue-700 dark:border-blue-700' : 'bg-white text-slate-500 border-slate-200 dark:bg-slate-900 dark:text-slate-400 dark:border-slate-800'}`}
                >
                  {d === new Date().toLocaleDateString() ? '今天' : d.split('/')[1] + '.' + d.split('/')[2]}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 个人评论与解析入口 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {renderMyCommentsSection()}
          {renderMyExplanationsSection()}
        </div>

        {/* 核心统计卡片 */}
        <div className="bg-gradient-to-br from-blue-600 to-indigo-600 rounded-[2rem] p-6 text-white shadow-lg">
          <div className="flex items-center gap-2 mb-6 opacity-90">
            <Calendar size={18} /> <span className="font-bold">{selectedDate} · {currentSubjectObj?.shortName || currentSubjectObj?.name || '未知学科'} 概览</span>
          </div>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div><div className="text-blue-100 text-xs mb-1">刷题量</div><div className="text-3xl font-bold">{dailyStats.total}</div></div>
            <div><div className="text-blue-100 text-xs mb-1">正确率</div><div className="text-3xl font-bold">{dailyStats.rate}%</div></div>
            <div><div className="text-blue-100 text-xs mb-1">新掌握</div><div className="text-3xl font-bold">{dailyStats.mastered}</div></div>
          </div>
        </div>

        {/* 章节进度 */}
        <div>
          <h3 className="text-slate-500 font-bold text-sm mb-3 ml-1 dark:text-slate-400">{currentSubjectObj?.shortName || currentSubjectObj?.name || '未知学科'} 章节统计</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {activeChapters.map((l) => {
              const total = activeBank[l.id]?.length || 0;
              const done = [...activeBrushed].filter((id) => {
                if (selectedSubject && selectedSubject.startsWith('custom_')) {
                  const qDetails = getQuestionDetails(id);
                  return qDetails && qDetails.category === l.name;
                }
                if (selectedSubject === 'maogai' || selectedSubject === 'english-culture' || selectedSubject === RELICS_SUBJECT_ID) {
                  const qDetails = getQuestionDetails(id);
                  return qDetails && qDetails.category === l.name;
                }
                if (selectedSubject === 'hgdmy-maogai') {
                  return id.startsWith('HGD-MG-') || id.startsWith('HGD-MG');
                }
                return l.id === 99 ? id.startsWith('OLD-') : id.startsWith(`L${l.id}-`);
              }).length;
              const pct = total ? Math.round((done / total) * 100) : 0;
              return (
                <div key={l.id} className="bg-white border border-slate-200 p-4 rounded-xl flex items-center justify-between dark:bg-slate-900 dark:border-slate-800">
                  <div className="flex-1 mr-4">
                    <div className="font-bold text-slate-700 text-sm truncate dark:text-slate-300">{safeText(l.name.includes('：') ? l.name.split('：')[1] : l.name)}</div>
                    <div className="mt-2 w-full bg-slate-100 h-1.5 rounded-full overflow-hidden dark:bg-slate-800">
                      <div className="h-full bg-blue-500 rounded-full dark:bg-blue-600" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-slate-800 dark:text-slate-200">{pct}%</div>
                    <div className="text-xs text-slate-400 dark:text-slate-500">{done}/{total}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 详细记录列表 */}
        <div className="bg-white border border-slate-200 rounded-[2rem] p-4 sm:p-6 shadow-sm dark:bg-slate-900 dark:border-slate-800">
          <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2 dark:text-slate-100"><Clock size={18} /> 详细做题记录</h3>
          <div className="space-y-4">
            {dailyRecords.length === 0 ? <p className="text-center text-slate-400 py-8 dark:text-slate-500">本日暂无记录</p> : dailyRecords.map((h) => (
              <div key={h.id} onClick={() => openQuestion(h.questionId)} className="flex gap-3 pb-3 border-b border-slate-50 last:border-0 last:pb-0 cursor-pointer hover:bg-slate-50 p-2 -mx-2 rounded-lg transition-colors dark:border-slate-800 dark:hover:bg-slate-800/60">
                <div className={`mt-0.5 ${h.isCorrect ? 'text-green-500' : 'text-red-500'}`}>
                  {h.action === 'memorize' ? <Eye size={18} className="text-purple-500 dark:text-purple-400" /> : (h.isCorrect ? <CheckCircle size={18} className="dark:text-green-400" /> : <XCircle size={18} className="dark:text-red-400" />)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-800 line-clamp-2 dark:text-slate-200">{safeText(h.questionTitle)}</div>
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                    {h.action === 'answer' && <span className={`px-1.5 py-0.5 rounded border ${h.isCorrect ? 'bg-green-50 border-green-200 text-green-700 dark:bg-green-950/20 dark:border-green-900/30 dark:text-green-400' : 'bg-red-50 border-red-200 text-red-700 dark:bg-red-950/20 dark:border-red-900/30 dark:text-red-400'}`}>选 {safeText(h.userAnswer)}</span>}
                    {h.action === 'memorize' && <span className="text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-100 dark:bg-purple-950/20 dark:border-purple-900/30 dark:text-purple-400">背题模式</span>}
                    <span className="ml-auto text-slate-400 dark:text-slate-500">{formatDate(h.timestamp).split(' ')[1]}</span>
                  </div>
                </div>
                <ArrowRight size={16} className="self-center text-slate-300 dark:text-slate-600" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {viewingQuestion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={() => setViewingQuestion(null)}>
          <div className="bg-white w-full max-w-7xl max-h-[90vh] overflow-y-auto rounded-3xl p-6 shadow-2xl dark:bg-slate-900 dark:border dark:border-slate-800" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <span className="text-xs px-2 py-1 bg-slate-100 text-slate-500 rounded dark:bg-slate-800 dark:text-slate-400">{safeText(viewingQuestion.id)}</span>
              <button onClick={() => setViewingQuestion(null)} className="p-1 hover:bg-slate-100 rounded-full dark:hover:bg-slate-800 dark:text-slate-400"><X size={20} /></button>
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-6 dark:text-slate-100">{safeText(viewingQuestion.question)}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                {viewingQuestion.options.map((opt, i) => {
                  const isCorrect = viewingQuestion.rawAnswer.includes(i);
                  return (
                    <div key={i} className={`p-3 rounded-xl border text-sm flex gap-3 ${isCorrect ? 'bg-green-50 border-green-200 text-green-800 dark:bg-green-950/20 dark:border-green-900/40 dark:text-green-200' : 'bg-white border-slate-100 text-slate-600 dark:bg-slate-800/50 dark:border-slate-700 dark:text-slate-300'}`}>
                      <span className={`font-bold ${isCorrect ? 'text-green-600 dark:text-green-400' : 'text-slate-400 dark:text-slate-500'}`}>{String.fromCharCode(65 + i)}.</span>
                      <span>{safeText(opt)}</span>
                      {isCorrect && <CheckCircle size={16} className="ml-auto text-green-600 dark:text-green-400" />}
                    </div>
                  );
                })}
              </div>
              <div className="space-y-4">
                <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 dark:bg-indigo-950/20 dark:border-indigo-900/30">
                  <div className="flex items-center gap-2 mb-2 text-indigo-900 font-bold text-sm dark:text-indigo-300"><Zap size={16} /> 解析</div>
                  <Markdown content={safeText(viewingQuestion.explanation)} />
                </div>
                {renderUserExps(viewingQuestion.id)}
              </div>
            </div>
          </div>
        </div>
      )}

      {showModal === 'comments' && renderCommentsModal()}
      {showModal === 'explanations' && renderExplanationsModal()}
    </div>
  );
}

export default Report;
