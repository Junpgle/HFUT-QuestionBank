/* eslint-disable react-hooks/exhaustive-deps */
/*
* version: 5.2.6 (Cloudflare Migration)
* */
import {useState, useEffect, useRef, useMemo} from 'react';
import {flushSync} from 'react-dom';
import {api} from './api';
import localforage from 'localforage';
import {
    BookOpen, CheckCircle, Brain, Settings,
    ChevronRight, Layers, Loader2,
    AlertTriangle, PieChart, BarChart3, Zap,
    Bookmark, Eye, TrendingUp, ThumbsUp, X, Star
} from 'lucide-react';
import {validateContent} from './contentFilter.js';
import {
    parseEnglishCultureJson,
    parseMaogaiJson,
    parseHgdmyMaogaiJson,
    parseExcelData,
    parseOldFormatData
} from './maogaiParser';
import {Markdown} from './components/Markdown';
import {LoginScreen} from './components/LoginScreen';
import {QuestionDetailModal} from './components/QuestionDetailModal';
import {RankingPage} from './components/RankingPage';
import {SubjectSelector} from './SubjectSelector';
import {ResetConfirmModal} from './components/ResetConfirmModal';
import {UpdateNoticeModal} from './components/UpdateNoticeModal';
import {DashboardHeader} from './components/DashboardHeader';
import {DashboardSearchPanel} from './components/DashboardSearchPanel';
import {DashboardPage} from './components/DashboardPage';
import {DashboardMainContentShell} from './components/DashboardMainContentShell';
import {QuizSidebar} from './components/QuizSidebar';
import {QuizMobileTopBar} from './components/QuizMobileTopBar';
import {QuizNavControls} from './components/QuizNavControls';
import {QuizQuestionPanel} from './components/QuizQuestionPanel';
import SmartLearning from './components/SmartLearning';
import {QuizDiscussionPanel} from './components/QuizDiscussionPanel';
import {AutoMasterNoticeToast} from './components/AutoMasterNoticeToast';
import {
    BANK_CACHE_VERSION,
    CURRENT_APP_VERSION,
    getBankCacheKey,
    getBankCacheVersionKey,
    LECTURES,
    LEADERBOARD_LIMIT,
    SUBJECTS
} from './config/quizConfig';
import {formatDate} from './utils/date';
import {safeGet, safeSet} from './utils/storage';
import {normalizeSet, getQuestionSubjectId} from './utils/questionId';
import {
    normalizeLastSession,
    shouldPersistSession,
    loadSubjectLastSession,
    saveSubjectLastSession,
    removeSubjectLastSession,
    migrateLegacyLastSession,
    clearAllLastSessions
} from './utils/lastSession';
import {forceAppReload, isNewerVersion} from './utils/appUpdate';
import {parseFillAnswer, gradeFill} from './utils/fillAnswer';
import {parseCulturalRelicsJson, RELICS_SUBJECT_ID} from './utils/culturalRelics.js';
import {
    getCachedThread,
    setCachedThread,
    setCachedThreadsBatch,
    invalidateReportBundleCache
} from './utils/threadCache';
import {
    loadMasterThreshold,
    saveMasterThreshold,
    normalizeCorrectStreaks,
    clampMasterThreshold,
    hasSeenAutoMasterNotice,
    markAutoMasterNoticeSeen,
    clearAutoMasterNoticeSeen,
    hasSeenAutoUnmasterNotice,
    markAutoUnmasterNoticeSeen,
    clearAutoUnmasterNoticeSeen
} from './utils/mastery';
import {getSubjectById, getSubjectChapterOptions} from './utils/subjectAdapter';
import {
    getThemeMode,
    setThemeMode as saveThemeMode,
    applyTheme,
    initThemeListener,
    destroyThemeListener
} from './utils/theme';

function App() {
    const initialUser = api.getCurrentUser();
    const [currentUser, setCurrentUser] = useState(initialUser);
    const [showLoginScreen, setShowLoginScreen] = useState(false);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [authLoading, setAuthLoading] = useState(false);
    const [authError, setAuthError] = useState(null);
    const [isFullscreen, setIsFullscreen] = useState(false);

    // 🌗 全局日夜模式偏好状态
    const [themeMode, setThemeModeState] = useState(getThemeMode());

    const setThemeMode = (mode) => {
        setThemeModeState(mode);
        saveThemeMode(mode);
    };

    // 学科选择
    const [history, setHistory] = useState([]);
    const [brushedIds, setBrushedIds] = useState(new Set());
    const [memorizedIds, setMemorizedIds] = useState(new Set());
    const [masteredIds, setMasteredIds] = useState(new Set());
    const [correctStreaks, setCorrectStreaks] = useState({});
    const [masterThreshold, setMasterThreshold] = useState(() => loadMasterThreshold());
    const [customThresholdInput, setCustomThresholdInput] = useState(() => String(loadMasterThreshold()));
    const [autoMasterNotice, setAutoMasterNotice] = useState(null);
    const [wrongIds, setWrongIds] = useState(new Set());
    const [favoriteIds, setFavoriteIds] = useState(new Set());
    const [customSubjectCounts, setCustomSubjectCounts] = useState({});
    const [customSubjects, setCustomSubjects] = useState([]);
    const allSubjects = useMemo(() => {
        const baseList = [...SUBJECTS, ...customSubjects];
        return baseList.map(s => {
            const subjectHistory = history.filter(h => h && h.questionId && getQuestionSubjectId(h.questionId) === s.id);
            let lastBrushed = null;
            if (subjectHistory.length > 0) {
                lastBrushed = subjectHistory[0].timestamp;
            }

            // 计算已刷题数与已掌握题数
            const brushedCount = Array.from(brushedIds).filter(id => id && getQuestionSubjectId(id) === s.id).length;
            const masteredCount = Array.from(masteredIds).filter(id => id && getQuestionSubjectId(id) === s.id).length;

            // 计算总题数
            let totalCount = 0;
            if (s.id === 'innovation') totalCount = 1575;
            else if (s.id === 'maogai') totalCount = 1084;
            else if (s.id === 'hgdmy-maogai') totalCount = 583;
            else if (s.id === 'english-culture') totalCount = 169;
            else if (s.id === RELICS_SUBJECT_ID) totalCount = 254;
            else {
                totalCount = s.questionCount || customSubjectCounts[s.id] || 0;
            }

            return {
                ...s,
                lastBrushedTime: lastBrushed,
                brushedCount,
                masteredCount,
                totalCount
            };
        });
    }, [customSubjects, history, brushedIds, masteredIds, customSubjectCounts]);
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [showAiModal, setShowAiModal] = useState(false);
    const [showApiSettingsModal, setShowApiSettingsModal] = useState(false);
    const [selectedSubject, setSelectedSubject] = useState(null);
    const lastSelectedSubjectRef = useRef(null);
    const currentSubject = getSubjectById(allSubjects, selectedSubject);
    // 题库状态
    const [allQuestionBank, setAllQuestionBank] = useState({});
    const [bankStatus, setBankStatus] = useState('idle');
    const [bankProgress, setBankProgress] = useState("");
    const [bankPercent, setBankPercent] = useState(0);
    const [errorMsg, setErrorMsg] = useState(null);
    // 学习数据
    // 动态计算当前选中学科下的错题数量，实现错题卡片学科隔离
    const currentWrongCount = useMemo(() => {
        if (!allQuestionBank) return 0;
        const currentQs = Object.values(allQuestionBank).flat();
        return currentQs.filter(q => wrongIds.has(q.id)).length;
    }, [allQuestionBank, wrongIds]);
    const [lastSessions, setLastSessions] = useState({});
    const loadedSessionSubjectsRef = useRef(new Set());
    const mutatedSessionSubjectsRef = useRef(new Set());
    const sessionAutoSaveTimerRef = useRef(null);
    const lastSession = selectedSubject ? (lastSessions[selectedSubject] || null) : null;

    const setSubjectLastSession = (subjectId, session) => {
        if (!subjectId) return;
        if (sessionAutoSaveTimerRef.current) {
            clearTimeout(sessionAutoSaveTimerRef.current);
            sessionAutoSaveTimerRef.current = null;
        }
        const normalized = session ? normalizeLastSession(session, subjectId) : null;
        loadedSessionSubjectsRef.current.add(subjectId);
        mutatedSessionSubjectsRef.current.add(subjectId);
        setLastSessions(prev => {
            const next = { ...prev };
            if (normalized) next[subjectId] = normalized;
            else delete next[subjectId];
            return next;
        });
        if (normalized) {
            saveSubjectLastSession(subjectId, normalized).catch(console.error);
        } else {
            removeSubjectLastSession(subjectId).catch(console.error);
        }
    };
    const [hydrated, setHydrated] = useState(false);

    // 新增：根据当前选中学科加载的题库，实现对已掌握、已背诵、已刷过题目以及历史记录的 100% 精准学科隔离
    const currentSubjectQids = useMemo(() => {
        if (!allQuestionBank) return new Set();
        const ids = Object.values(allQuestionBank).flat().map(q => q.id);
        return new Set(ids);
    }, [allQuestionBank]);

    const currentMasteredIds = useMemo(() => {
        const filtered = Array.from(masteredIds).filter(id => currentSubjectQids.has(id));
        return new Set(filtered);
    }, [masteredIds, currentSubjectQids]);

    const currentMemorizedIds = useMemo(() => {
        const filtered = Array.from(memorizedIds).filter(id => currentSubjectQids.has(id));
        return new Set(filtered);
    }, [memorizedIds, currentSubjectQids]);

    const currentBrushedIds = useMemo(() => {
        const filtered = Array.from(brushedIds).filter(id => currentSubjectQids.has(id));
        return new Set(filtered);
    }, [brushedIds, currentSubjectQids]);

    const currentFavoriteIds = useMemo(() => {
        const filtered = Array.from(favoriteIds).filter(id => currentSubjectQids.has(id));
        return new Set(filtered);
    }, [favoriteIds, currentSubjectQids]);

    const toggleFavorite = (questionId) => {
        if (!questionId) return;
        setFavoriteIds(prev => {
            const next = new Set(prev);
            if (next.has(questionId)) next.delete(questionId);
            else next.add(questionId);
            return next;
        });
    };

    const toggleMastered = (questionId) => {
        if (!questionId) return;
        const currentlyMastered = masteredIds.has(questionId);
        setMasteredIds(prev => {
            const next = new Set(prev);
            if (currentlyMastered) next.delete(questionId);
            else next.add(questionId);
            return next;
        });
        if (currentlyMastered) {
            setCorrectStreaks(prev => {
                if (!prev[questionId]) return prev;
                const next = {...prev};
                delete next[questionId];
                return next;
            });
        } else {
            setWrongIds(prev => {
                if (!prev.has(questionId)) return prev;
                const next = new Set(prev);
                next.delete(questionId);
                return next;
            });
        }
    };

    const handleMasterThresholdChange = (rawVal) => {
        const nextThreshold = saveMasterThreshold(rawVal);
        setMasterThreshold(nextThreshold);
        setCustomThresholdInput(String(nextThreshold));
    };

    const currentHistory = useMemo(() => {
        return history.filter(h => h && h.questionId && currentSubjectQids.has(h.questionId));
    }, [history, currentSubjectQids]);
    const filterProgressBySubject = (items = [], subjectId = 'all') => {
        if (subjectId === 'all') return items;
        return items.filter(item => getQuestionSubjectId(item) === subjectId);
    };
    const filterHistoryBySubject = (items = [], subjectId = 'all') => {
        if (subjectId === 'all') return items;
        return items.filter(h => h && h.questionId && getQuestionSubjectId(h.questionId) === subjectId);
    };
    const sanitizeCloudIds = (ids = []) => itemsWithoutCustom(filterProgressBySubject(ids, 'all'));
    const sanitizeCloudHistory = (items = []) => filterHistoryBySubject(items, 'all').filter(h => h && h.questionId && !String(h.questionId).startsWith('custom_'));
    const itemsWithoutCustom = (items = []) => items.filter(id => id && !String(id).startsWith('custom_'));
    const getProgressSnapshot = (subjectId = 'all') => {
        const brushed = filterProgressBySubject(Array.from(brushedIds), subjectId);
        const memorized = filterProgressBySubject(Array.from(memorizedIds), subjectId);
        const mastered = filterProgressBySubject(Array.from(masteredIds), subjectId);
        const wrong = filterProgressBySubject(Array.from(wrongIds), subjectId);
        const favorite = filterProgressBySubject(Array.from(favoriteIds), subjectId);
        const hist = filterHistoryBySubject(history, subjectId);
        return { brushed, memorized, mastered, wrong, favorite, history: hist };
    };
    const dedupeAndSortHistory = (items = []) => {
        const seen = new Set();
        return (items || []).filter(h => {
            if (!h) return false;
            const key = h.id || `${h.timestamp}-${h.questionId}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        }).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    };
    const toStorableCustomSubject = (s) => ({
        id: s?.id,
        name: s?.name || s?.shortName || s?.id || '自定义题库',
        shortName: s?.shortName || s?.name || s?.id || '自定义',
        icon: s?.icon || '📚',
        category: s?.category || '自建题库',
        isCustom: true,
        lectures: Array.isArray(s?.lectures)
            ? s.lectures.map((l, i) => ({ id: l?.id ?? (i + 1), name: l?.name || `章节${l?.id ?? (i + 1)}` }))
            : []
    });
    const normalizeCustomSubjects = (list = []) => {
        if (!Array.isArray(list)) return [];
        return list.filter(s => s && s.id && s.isCustom).map(toStorableCustomSubject);
    };

    // 交互状态
    const [quizConfig, setQuizConfig] = useState({lectureId: 0, count: 20, type: 'all', filter: 'all'});
    const [questions, setQuestions] = useState([]);
    const [syncStatus, setSyncStatus] = useState(null);
    const [syncMsg, setSyncMsg] = useState("");
    const [showResetModal, setShowResetModal] = useState(false);
    const [currentMode, setCurrentMode] = useState('dashboard');
    const [currentIndex, setCurrentIndex] = useState(0);
    const [showExplanation, setShowExplanation] = useState(false);
    const [selectedIndices, setSelectedIndices] = useState([]);
    const [selectedByQuestion, setSelectedByQuestion] = useState({});
    const [fillInputs, setFillInputs] = useState([]);
    const [fillInputsByQuestion, setFillInputsByQuestion] = useState({});
    const [isAnswered, setIsAnswered] = useState(false);
    const [answerResults, setAnswerResults] = useState({});
    // 在线人数统计
    const [onlineCount, setOnlineCount] = useState(null);
    // 新功能状态
    const [wrongQuestionRanking, setWrongQuestionRanking] = useState([]);
    const [viewingRankQuestion, setViewingRankQuestion] = useState(null);
    // 统一管理评论和解析的状态：{ [questionId]: { comments: [], explanations: [] } }
    const [questionThread, setQuestionThread] = useState({});
    const [showExplanationForm, setShowExplanationForm] = useState(false);
    const [newComment, setNewComment] = useState('');
    const [newExplanation, setNewExplanation] = useState('');
    const [customNotes, setCustomNotes] = useState({});
    const [editingCommentId, setEditingCommentId] = useState(null);
    const [editingCommentContent, setEditingCommentContent] = useState('');
    const [editingExplanationId, setEditingExplanationId] = useState(null);
    const [editingExplanationContent, setEditingExplanationContent] = useState('');
    const commentSectionRef = useRef(null);
    const searchSectionRef = useRef(null);
    const runTransition = (callback) => {
        if (document.startViewTransition) {
            document.startViewTransition(() => {
                flushSync(callback);
            });
        } else {
            callback();
        }
    };
    // 版本状态
    const [showUpdateModal, setShowUpdateModal] = useState(false);
    const [remoteVersionInfo, setRemoteVersionInfo] = useState({version: '', log: ''});
    // API 额度受限状态
    const [apiLimitReached, setApiLimitReached] = useState(false);
    const [selectorModal, setSelectorModal] = useState({
        open: false,
        title: '',
        description: '',
        allowMulti: false,
        options: [],
        selectedValues: []
    });
    const selectorResolveRef = useRef(null);
    // 批量发送题目状态策略（随 sync-all 合并发送，攒够 40 题或切后台/定时同步时统一提交）
    const statsBuffer = useRef([]);
    const BATCH_THRESHOLD = 40;
    const VERSION_CHECK_INTERVAL = 12 * 60 * 60 * 1000;
    const INITIAL_SYNC_COOLDOWN = 2 * 60 * 1000;
    const HEARTBEAT_IDLE_LIMIT = 15 * 60 * 1000;
    const lastActiveAtRef = useRef(Date.now());
    const lastHeartbeatAtRef = useRef(0);
    const inflightThreadIdsRef = useRef(new Set());
    // 统一处理 API 限制错误 (适配 Cloudflare 429 错误)
    const checkApiLimitError = (error) => {
        if (!error) return;
        // 如果后端返回 429 或者错误信息包含 limit
        if (error.status === 429 || (error.message && error.message.toLowerCase().includes('limit'))) {
            setApiLimitReached(true);
            console.error("API Daily Limit Exceeded");
        }
    };
    useEffect(() => {
        if (selectedSubject) {
            lastSelectedSubjectRef.current = selectedSubject;
        }
    }, [selectedSubject]);
    useEffect(() => {
        // 兜底恢复：如果学科被异常清空，但仍有练习会话，则恢复到上一次有效学科
        if (!selectedSubject && questions.length > 0 && ['quiz', 'memorize', 'mistakes', 'favorites', 'dashboard'].includes(currentMode)) {
            const fallback = lastSelectedSubjectRef.current;
            if (fallback) {
                setSelectedSubject(fallback);
            }
        }
    }, [selectedSubject, questions.length, currentMode]);
    const openSubjectSelectorModal = ({title, description, options, allowMulti = false, defaultValues = []}) => {
        return new Promise((resolve) => {
            selectorResolveRef.current = resolve;
            setSelectorModal({
                open: true,
                title: title || '选择题库',
                description: description || '',
                allowMulti,
                options: options || [],
                selectedValues: Array.isArray(defaultValues) ? defaultValues : []
            });
        });
    };
    const closeSubjectSelectorModal = (result = null) => {
        setSelectorModal(prev => ({...prev, open: false}));
        if (selectorResolveRef.current) {
            selectorResolveRef.current(result);
            selectorResolveRef.current = null;
        }
    };
    // ==========================================
    // 🚀 优化逻辑 2: 多合一聚合同步 (心跳 + 进度双向同步 + 答题统计 + 版本检查)
    // ==========================================
    const progressDirtyRef = useRef(false);
    const dirtyInitDoneRef = useRef(false);
    const suppressDirtyRef = useRef(false);
    const hasInitialSyncRef = useRef(false);
    const latestSyncDataRef = useRef(null);

    const applyRemoteVersion = (versionRes) => {
        try {
            localStorage.setItem('app_version_checked_at', String(Date.now()));
        } catch {
            // 忽略 localStorage 异常
        }
        if (versionRes && versionRes.success) {
            const latestVersion = String(versionRes.value || versionRes.version || versionRes.data?.value || '').trim();
            const changelog = versionRes.changelog || versionRes.data?.changelog || '修复了一些已知问题并提升了稳定性。';
            if (isNewerVersion(latestVersion, CURRENT_APP_VERSION)) {
                setRemoteVersionInfo({
                    version: latestVersion,
                    log: changelog
                });
                setShowUpdateModal(true);
            }
        }
    };

    const needsVersionCheck = () => {
        try {
            const lastChecked = Number(localStorage.getItem('app_version_checked_at') || 0);
            return Date.now() - lastChecked >= VERSION_CHECK_INTERVAL;
        } catch {
            return false;
        }
    };

    const performGlobalSync = async ({
        includeProgress = false,
        includeStats = false,
        pullProgress = false,
        checkVersion = false,
        heartbeat = true,
        keepalive = false
    } = {}) => {
        const snapshot = latestSyncDataRef.current;
        if (!snapshot?.currentUser || !snapshot?.hydrated || snapshot?.apiLimitReached) return null;

        const shouldSendProgress = includeProgress && progressDirtyRef.current;
        const pendingStats = includeStats && statsBuffer.current.length > 0
            ? [...statsBuffer.current]
            : null;

        if (!shouldSendProgress && !pendingStats && !pullProgress && !checkVersion && !heartbeat) {
            return null;
        }

        if (pendingStats) {
            statsBuffer.current = [];
        }

        const payload = {
            heartbeat,
            pullProgress,
            checkVersion,
            stats: pendingStats,
            progress: shouldSendProgress ? {
                brushedIds: Array.from(snapshot.brushedIds).filter(id => id && !id.startsWith('custom_')),
                memorizedIds: Array.from(snapshot.memorizedIds).filter(id => id && !id.startsWith('custom_')),
                masteredIds: Array.from(snapshot.masteredIds).filter(id => id && !id.startsWith('custom_')),
                wrongIds: Array.from(snapshot.wrongIds).filter(id => id && !id.startsWith('custom_')),
                favoriteIds: Array.from(snapshot.favoriteIds).filter(id => id && !id.startsWith('custom_')),
                history: snapshot.history.filter(h => h && h.questionId && !h.questionId.startsWith('custom_')).slice(0, 500)
            } : null
        };

        try {
            if (shouldSendProgress && !keepalive) {
                setSyncStatus('uploading');
                setSyncMsg("同步中...");
            }
            const res = await api.syncAll(payload, keepalive ? { keepalive: true } : {});
            if (res && res.success) {
                if (res.onlineCount !== undefined) setOnlineCount(res.onlineCount);
                if (heartbeat) lastHeartbeatAtRef.current = Date.now();
                if (shouldSendProgress) {
                    progressDirtyRef.current = false;
                    invalidateReportBundleCache();
                    if (!keepalive) {
                        setSyncStatus('success');
                        setSyncMsg("备份成功");
                    }
                }
                if (pullProgress && res.progress) {
                    await mergeCloudProgress(res.progress);
                }
                if (checkVersion && res.appVersion) {
                    applyRemoteVersion(res.appVersion);
                }
            }
            return res;
        } catch (e) {
            checkApiLimitError(e);
            if (pendingStats && !keepalive) {
                statsBuffer.current = [...pendingStats, ...statsBuffer.current];
            }
            console.error("同步失败", e);
            if (shouldSendProgress && !keepalive) {
                setSyncStatus('error');
                setSyncMsg("同步失败");
            }
            return null;
        }
    };
    // 初始化日夜模式监听器与时钟轮询（仅挂载时执行一次）
    useEffect(() => {
        // 挂载时应用一次当前主题
        applyTheme(getThemeMode());
        initThemeListener();

        // 监听系统/自动切换抛出的事件，同步 React state
        const handleThemeChanged = (e) => {
            setThemeModeState(e.detail);
        };
        window.addEventListener('app_theme_changed', handleThemeChanged);

        return () => {
            destroyThemeListener();
            window.removeEventListener('app_theme_changed', handleThemeChanged);
        };
    }, []); // ⚠️ 仅执行一次，手动切换时 setThemeMode 会直接调用 applyTheme

    useEffect(() => {
        latestSyncDataRef.current = {
            currentUser,
            hydrated,
            apiLimitReached,
            brushedIds,
            memorizedIds,
            masteredIds,
            wrongIds,
            favoriteIds,
            history
        };
    }, [currentUser, hydrated, apiLimitReached, brushedIds, memorizedIds, masteredIds, wrongIds, favoriteIds, history]);

    useEffect(() => {
        if (!hydrated) return;
        if (!dirtyInitDoneRef.current) {
            dirtyInitDoneRef.current = true;
            return;
        }
        if (suppressDirtyRef.current) {
            suppressDirtyRef.current = false;
            return;
        }
        progressDirtyRef.current = true;
    }, [brushedIds, memorizedIds, masteredIds, wrongIds, favoriteIds, history, hydrated]);

    useEffect(() => {
        if (!currentUser || !hydrated) return;
        // 1. 首次水合完成时用 1 次 /sync-all 合并完成：心跳 + 拉取云端进度 + 按需检查版本（短时刷新直接跳过）
        if (!hasInitialSyncRef.current) {
            hasInitialSyncRef.current = true;
            let skipInitial = false;
            try {
                const lastInitial = Number(sessionStorage.getItem('last_initial_sync_at') || 0);
                if (Date.now() - lastInitial < INITIAL_SYNC_COOLDOWN) {
                    skipInitial = true;
                }
            } catch {
                // 忽略 sessionStorage 异常
            }
            if (!skipInitial) {
                try {
                    sessionStorage.setItem('last_initial_sync_at', String(Date.now()));
                } catch {
                    // 忽略 sessionStorage 异常
                }
                performGlobalSync({
                    heartbeat: true,
                    pullProgress: true,
                    checkVersion: needsVersionCheck()
                });
            }
        }

        // 记录用户近期交互时间，长时挂机不再白发心跳
        const markActive = () => {
            lastActiveAtRef.current = Date.now();
        };
        window.addEventListener('pointerdown', markActive, { passive: true });
        window.addEventListener('keydown', markActive, { passive: true });

        // 2. 每 10 分钟定时检查：优先同步脏进度/答题统计，无变更且活跃时每 15 分钟发一次心跳
        const timer = setInterval(() => {
            if (typeof document !== 'undefined' && document.hidden) return;
            const hasDirty = progressDirtyRef.current || statsBuffer.current.length > 0;
            if (hasDirty) {
                performGlobalSync({ includeProgress: true, includeStats: true, heartbeat: true });
                return;
            }
            const now = Date.now();
            const recentlyActive = now - lastActiveAtRef.current < HEARTBEAT_IDLE_LIMIT;
            const heartbeatDue = now - lastHeartbeatAtRef.current >= HEARTBEAT_IDLE_LIMIT;
            if (recentlyActive && heartbeatDue) {
                performGlobalSync({ includeProgress: false, includeStats: false, heartbeat: true });
            }
        }, 10 * 60 * 1000);

        // 3. 切到后台或关闭页面时，用 keepalive 兜底提交未落盘的脏进度与统计
        const flushOnLeave = () => {
            if (progressDirtyRef.current || statsBuffer.current.length > 0) {
                performGlobalSync({
                    includeProgress: true,
                    includeStats: true,
                    heartbeat: false,
                    keepalive: true
                });
            }
        };
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') {
                flushOnLeave();
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('pagehide', flushOnLeave);

        return () => {
            clearInterval(timer);
            window.removeEventListener('pointerdown', markActive);
            window.removeEventListener('keydown', markActive);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('pagehide', flushOnLeave);
        };
    }, [currentUser, hydrated]);
    // ==========================================
    // 🚀 优化逻辑 3: 互动内容批量滑窗加载 + 2小时持久化缓存
    // ==========================================
    const isCustomQuestionId = (questionId) => String(questionId || '').startsWith('custom_');
    const loadQuestionThreadsBatch = async (questionIds) => {
        if (!currentUser || apiLimitReached) return;
        const candidates = Array.from(
            new Set((Array.isArray(questionIds) ? questionIds : []).filter((id) => id && !isCustomQuestionId(id)))
        );
        if (candidates.length === 0) return;

        const cacheHits = {};
        const missingIds = [];
        for (const qid of candidates) {
            if (questionThread[qid]) continue;
            const cached = getCachedThread(qid);
            if (cached) {
                cacheHits[qid] = cached;
            } else if (!inflightThreadIdsRef.current.has(qid)) {
                missingIds.push(qid);
            }
        }

        if (Object.keys(cacheHits).length > 0) {
            setQuestionThread((prev) => ({ ...prev, ...cacheHits }));
        }

        if (missingIds.length === 0) return;

        const batch = missingIds.slice(0, 30);
        batch.forEach((id) => inflightThreadIdsRef.current.add(id));
        try {
            const res = await api.batchGetThreads(batch);
            const serverThreads = (res && typeof res.threads === 'object' && res.threads) ? res.threads : {};
            const normalizedThreads = {};
            for (const qid of batch) {
                const entry = serverThreads[qid];
                normalizedThreads[qid] = {
                    comments: Array.isArray(entry?.comments) ? entry.comments : [],
                    explanations: Array.isArray(entry?.explanations) ? entry.explanations : []
                };
            }
            setCachedThreadsBatch(normalizedThreads);
            setQuestionThread((prev) => ({ ...prev, ...normalizedThreads }));
        } catch (e) {
            checkApiLimitError(e);
            console.error("批量加载互动内容失败", e);
            const fallbackThreads = {};
            for (const qid of batch) {
                fallbackThreads[qid] = { comments: [], explanations: [] };
            }
            setQuestionThread((prev) => ({ ...prev, ...fallbackThreads }));
        } finally {
            batch.forEach((id) => inflightThreadIdsRef.current.delete(id));
        }
    };
    const loadQuestionThread = async (questionId, force = false) => {
        if (!questionId || !currentUser || isCustomQuestionId(questionId)) return;
        if (!force) {
            await loadQuestionThreadsBatch([questionId]);
            return;
        }
        try {
            const res = await api.request(`/thread/${questionId}`);
            const safeRes = (res && typeof res === 'object') ? res : {};
            const threadData = {
                comments: Array.isArray(safeRes.comments) ? safeRes.comments : [],
                explanations: Array.isArray(safeRes.explanations) ? safeRes.explanations : []
            };
            setCachedThread(questionId, threadData);
            setQuestionThread(prev => ({
                ...prev,
                [questionId]: threadData
            }));
        } catch (e) {
            console.error("加载互动内容失败", e);
        }
    };
    // 搜索功能状态
    const [searchKeyword, setSearchKeyword] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [showSearchResults, setShowSearchResults] = useState(false);
    const [searchFilters, setSearchFilters] = useState({
        lectureId: 0,
        type: 'all',
        includeAnswered: true,
        includeUnanswered: true,
        onlyFavorites: false
    });
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    // --- 数据加载工具 ---
    const MAX_EXCEL_FILE_SIZE = 5 * 1024 * 1024;
    const EXCEL_PARSE_TIMEOUT = 10000;
    const safeParseXLSX = async (data) => {
        if (data.byteLength > MAX_EXCEL_FILE_SIZE) {
            throw new Error(`File too large: ${data.byteLength} bytes (max: ${MAX_EXCEL_FILE_SIZE})`);
        }
        const XLSX = await import('xlsx');
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                reject(new Error('Excel parsing timeout - possible ReDoS attack'));
            }, EXCEL_PARSE_TIMEOUT);
            try {
                const workbook = XLSX.read(data, {type: 'array'});
                const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                const rawData = XLSX.utils.sheet_to_json(worksheet, {header: 1});
                clearTimeout(timeoutId);
                resolve(rawData);
            } catch (error) {
                clearTimeout(timeoutId);
                reject(error);
            }
        });
    };
    const fetchLectureArrayBuffer = async (lecture) => {
        // 直接读取同源本地 public 目录，几十毫秒内极速完成，抛弃外部 GitHub 和云存储链接
        const urls = [`/${encodeURIComponent(lecture.file)}`];
        const errors = [];
        for (const url of urls) {
            if (!url) continue;
            try {
                const res = await fetch(url);
                if (!res.ok) {
                    errors.push(`HTTP ${res.status}`);
                    continue;
                }
                const arrayBuffer = await res.arrayBuffer();
                return new Uint8Array(arrayBuffer);
            } catch (e) {
                errors.push(e.message);
            }
        }
        return Promise.reject(new Error(`所有本地题库源均不可用: ${errors.join(' | ')}`));
    };
    useEffect(() => {
        // 已登录用户的版本检查已合并进 login 与首次 sync-all，此处仅负责游客端兜底检查
        if (currentUser || apiLimitReached) return;
        const checkVersion = async () => {
            if (apiLimitReached || !needsVersionCheck()) return;
            try {
                const res = await api.getSystemConfig('app_version');
                applyRemoteVersion(res);
            } catch (e) {
                console.warn('[Version Check] 检查更新跳过:', e.message);
            }
        };
        const timer = setTimeout(checkVersion, 3000);
        return () => clearTimeout(timer);
    }, [currentUser, apiLimitReached]);
    // --- Hooks (本地数据加载) ---
    useEffect(() => {
        const loadLocal = async () => {
            try {
                const getSet = async (k) => {
                    const val = await safeGet(k);
                    return Array.isArray(val) ? new Set(val) : (val instanceof Set ? val : new Set());
                }
                setBrushedIds(normalizeSet(await getSet('app_brushedIds')));
                setMemorizedIds(normalizeSet(await getSet('app_memorizedIds')));
                setMasteredIds(normalizeSet(await getSet('app_masteredIds')));
                setCorrectStreaks(normalizeCorrectStreaks(await safeGet('app_correctStreaks', {})));
                setWrongIds(normalizeSet(await getSet('app_wrongIds')));
                setFavoriteIds(normalizeSet(await getSet('app_favoriteIds')));
                const hist = await safeGet('app_history');
                if (hist) setHistory(hist);
                const notes = await safeGet('app_custom_notes', {});
                if (notes && typeof notes === 'object') setCustomNotes(notes);
                const migratedSess = await migrateLegacyLastSession();
                if (migratedSess?.subjectId) {
                    loadedSessionSubjectsRef.current.add(migratedSess.subjectId);
                    setLastSessions(prev => (
                        mutatedSessionSubjectsRef.current.has(migratedSess.subjectId)
                            ? prev
                            : { ...prev, [migratedSess.subjectId]: migratedSess }
                    ));
                }
                const customSubs = normalizeCustomSubjects(await safeGet('custom_subjects_list', []));
                setCustomSubjects(customSubs);

                // 异步补全遗留自定义学科的总题数 questionCount 并缓存
                const counts = {};
                let hasChanges = false;
                for (const s of customSubs) {
                    if (s && s.id) {
                        if (s.questionCount) {
                            counts[s.id] = s.questionCount;
                        } else {
                            try {
                                const data = await localforage.getItem(getBankCacheKey(s.id));
                                if (data) {
                                    const total = Object.values(data).flat().length;
                                    counts[s.id] = total;
                                    s.questionCount = total;
                                    hasChanges = true;
                                }
                            } catch (err) {
                                console.warn('Failed to load count for custom subject:', s.id, err);
                            }
                        }
                    }
                }
                setCustomSubjectCounts(counts);
                if (hasChanges) {
                    await safeSet('custom_subjects_list', customSubs);
                    setCustomSubjects([...customSubs]);
                }

                setHydrated(true);
            } catch (e) {
                console.error(e);
                setHydrated(true);
            }
        };
        loadLocal();
    }, []);

    const handleDeleteCustomSubject = async (e, subjectId) => {
        e.stopPropagation();
        if (!confirm("确定要删除该自定义学科吗？此操作不可恢复，且该学科的本地刷题进度也会被清除。")) return;
        const updated = customSubjects.filter(s => s.id !== subjectId);
        setCustomSubjects(updated);
        await safeSet('custom_subjects_list', normalizeCustomSubjects(updated));
        await localforage.removeItem(getBankCacheKey(subjectId)).catch(console.warn);
        await localforage.removeItem(getBankCacheVersionKey(subjectId)).catch(console.warn);
        try {
            localStorage.removeItem(getBankCacheKey(subjectId));
            localStorage.removeItem(getBankCacheVersionKey(subjectId));
        } catch {
            // 忽略 localStorage 清理异常
        }
        
        // 物理清理本地进度中该学科的题目
        const updatedBrushed = new Set(Array.from(brushedIds).filter(id => id && !id.startsWith(subjectId)));
        const updatedMemorized = new Set(Array.from(memorizedIds).filter(id => id && !id.startsWith(subjectId)));
        const updatedMastered = new Set(Array.from(masteredIds).filter(id => id && !id.startsWith(subjectId)));
        const updatedWrong = new Set(Array.from(wrongIds).filter(id => id && !id.startsWith(subjectId)));
        const updatedFavorite = new Set(Array.from(favoriteIds).filter(id => id && !id.startsWith(subjectId)));
        const updatedHistory = history.filter(h => h && h.questionId && !h.questionId.startsWith(subjectId));
        setBrushedIds(updatedBrushed);
        setMemorizedIds(updatedMemorized);
        setMasteredIds(updatedMastered);
        setCorrectStreaks(prev => {
            const next = {};
            for (const [qid, count] of Object.entries(prev)) {
                if (qid && !qid.startsWith(subjectId)) next[qid] = count;
            }
            return next;
        });
        setWrongIds(updatedWrong);
        setFavoriteIds(updatedFavorite);
        setHistory(updatedHistory);
        setSubjectLastSession(subjectId, null);

        if (selectedSubject === subjectId) {
            setSelectedSubject(null);
            setAllQuestionBank({});
            setBankStatus('idle');
        }
    };
    // 保存本地数据 (Hooks)
    useEffect(() => {
        if (hydrated) safeSet('app_brushedIds', Array.from(brushedIds));
    }, [brushedIds, hydrated]);
    useEffect(() => {
        if (hydrated) safeSet('app_memorizedIds', Array.from(memorizedIds));
    }, [memorizedIds, hydrated]);
    useEffect(() => {
        if (hydrated) safeSet('app_masteredIds', Array.from(masteredIds));
    }, [masteredIds, hydrated]);
    useEffect(() => {
        if (hydrated) safeSet('app_correctStreaks', correctStreaks);
    }, [correctStreaks, hydrated]);
    useEffect(() => {
        if (hydrated) safeSet('app_wrongIds', Array.from(wrongIds));
    }, [wrongIds, hydrated]);
    useEffect(() => {
        if (hydrated) safeSet('app_favoriteIds', Array.from(favoriteIds));
    }, [favoriteIds, hydrated]);
    useEffect(() => {
        if (hydrated) safeSet('app_history', history);
    }, [history, hydrated]);
    useEffect(() => {
        if (hydrated) safeSet('app_custom_notes', customNotes);
    }, [customNotes, hydrated]);
    useEffect(() => {
        if (!hydrated || !selectedSubject) return;
        if (loadedSessionSubjectsRef.current.has(selectedSubject)) return;
        let cancelled = false;
        const targetSubjectId = selectedSubject;
        loadSubjectLastSession(targetSubjectId)
            .then((sess) => {
                if (cancelled || mutatedSessionSubjectsRef.current.has(targetSubjectId)) return;
                loadedSessionSubjectsRef.current.add(targetSubjectId);
                if (sess) {
                    setLastSessions(prev => ({ ...prev, [targetSubjectId]: sess }));
                }
            })
            .catch(console.error);
        return () => {
            cancelled = true;
        };
    }, [selectedSubject, hydrated]);
    useEffect(() => {
        if (!hydrated) return;
        const targetSubjectId = selectedSubject || lastSelectedSubjectRef.current;
        if (!targetSubjectId) return;
        if (!shouldPersistSession({ mode: currentMode, questions, currentIndex, answerResults })) return;
        if (sessionAutoSaveTimerRef.current) {
            clearTimeout(sessionAutoSaveTimerRef.current);
        }
        const snapshot = {
            subjectId: targetSubjectId,
            mode: currentMode,
            questions,
            currentIndex,
            quizConfig,
            answerResults,
            selectedByQuestion,
            fillInputsByQuestion,
            updatedAt: Date.now()
        };
        sessionAutoSaveTimerRef.current = setTimeout(() => {
            sessionAutoSaveTimerRef.current = null;
            setSubjectLastSession(targetSubjectId, snapshot);
        }, 500);
        return () => {
            if (sessionAutoSaveTimerRef.current) {
                clearTimeout(sessionAutoSaveTimerRef.current);
                sessionAutoSaveTimerRef.current = null;
            }
        };
    }, [hydrated, selectedSubject, currentMode, questions, currentIndex, quizConfig, answerResults, selectedByQuestion, fillInputsByQuestion]);
    // 迁移旧缓存 (to subject-specific keys)
    useEffect(() => {
        (async () => {
            try {
                const oldKeys = ['hf_question_bank', 'hf_bank_version'];
                for (const k of oldKeys) {
                    const val = await localforage.getItem(k);
                    if (val) {
                        if (k === 'hf_question_bank' && typeof val === 'object') {
                            const newKey = getBankCacheKey('innovation');
                            const existing = await safeGet(newKey);
                            if (!existing) {
                                await safeSet(newKey, val);
                                await safeSet(getBankCacheVersionKey('innovation'), BANK_CACHE_VERSION);
                            }
                        }
                        await localforage.removeItem(k).catch(() => {});
                        try {
                            localStorage.removeItem(k);
                        } catch {
                            // 忽略 localStorage 清理异常
                        }
                    }
                }
            } catch (err) {
                console.warn('Migration step failed', err);
            }
        })();
    }, []);
    // 加载题库 (subject-aware)
    useEffect(() => {
        if (!selectedSubject) return;
        const cacheKey = getBankCacheKey(selectedSubject);
        const cacheVerKey = getBankCacheVersionKey(selectedSubject);
        const subject = getSubjectById(allSubjects, selectedSubject);
        if (!subject) return;
        const isValidBank = (bank) => {
            if (!bank || typeof bank !== 'object') return false;
            const chapters = Object.values(bank);
            if (!chapters.length) return false;
            const firstChapter = chapters[0];
            if (!Array.isArray(firstChapter) || firstChapter.length === 0) return false;
            const item = firstChapter[0];
            return !!(item && typeof item === 'object' && item.id && Array.isArray(item.options));
        };
        const tryRepairBank = (bank) => {
            try {
                const repaired = {};
                Object.keys(bank || {}).forEach(k => {
                    const arr = Array.isArray(bank[k]) ? bank[k] : [];
                    repaired[k] = arr.map((x, i) => ({
                        id: x.id || `L${k}-${i}`,
                        type: x.type || 'single',
                        question: x.question || String(x.q || x.title || ''),
                        options: Array.isArray(x.options) ? x.options : (Array.isArray(x.opts) ? x.opts : []),
                        rawAnswer: Array.isArray(x.rawAnswer) ? x.rawAnswer : (Array.isArray(x.answer) ? x.answer : []),
                        explanation: x.explanation || x.exp || '',
                        category: x.category || '',
                        lectureId: Number(k)
                    })).filter(q => q.question && q.options && q.options.length > 0);
                });
                return repaired;
            } catch {
                return null;
            }
        };
        const loadBankData = async () => {
            await new Promise(r => setTimeout(r, 100));
            setBankStatus('loading');
            setBankPercent(0);
            try {
                setBankProgress("检查本地缓存...");
                const cachedBank = await safeGet(cacheKey);
                const cachedVer = await safeGet(cacheVerKey);
                
                if (subject.isCustom) {
                    if (cachedBank && isValidBank(cachedBank)) {
                        setAllQuestionBank(cachedBank);
                        setBankStatus('ready');
                        setBankProgress('题库已就绪');
                        setBankPercent(100);
                        return;
                    }
                    if (subject.questionBank && isValidBank(subject.questionBank)) {
                        setAllQuestionBank(subject.questionBank);
                        setBankStatus('ready');
                        await safeSet(cacheKey, subject.questionBank);
                        setBankProgress('题库已就绪');
                        setBankPercent(100);
                        return;
                    }
                    throw new Error("自定义题库本地缓存为空或已损坏，请重新上传。");
                }
                
                if (cachedBank && Number(cachedVer) === BANK_CACHE_VERSION) {
                    if (isValidBank(cachedBank)) {
                        setAllQuestionBank(cachedBank);
                        setBankStatus('ready');
                        setBankProgress('题库已就绪');
                        setBankPercent(100);
                        return;
                    } else {
                        const repaired = tryRepairBank(cachedBank);
                        if (repaired && isValidBank(repaired)) {
                            setAllQuestionBank(repaired);
                            setBankStatus('ready');
                            await safeSet(cacheKey, repaired);
                            await safeSet(cacheVerKey, BANK_CACHE_VERSION);
                            setBankProgress('题库已就绪');
                            setBankPercent(100);
                            return;
                        }
                    }
                }
                if (subject.id === 'maogai') {
                    setBankProgress('正在加载毛概题库...');
                    try {
                        const url = '/maogai_full.json';
                        const res = await fetch(url);
                        if (!res.ok) throw new Error(`HTTP ${res.status}`);
                        const rawJson = await res.json();
                        const parsed = parseMaogaiJson(rawJson);
                        if (Object.keys(parsed).length > 0) {
                            setAllQuestionBank(parsed);
                            setBankStatus('ready');
                            await safeSet(cacheKey, parsed);
                            await safeSet(cacheVerKey, BANK_CACHE_VERSION);
                            setBankProgress('题库已就绪');
                            setBankPercent(100);
                        } else {
                            throw new Error('解析结果为空');
                        }
                    } catch (error) {
                        console.warn('毛概题库加载失败', error);
                        setBankStatus('error');
                        setErrorMsg("毛概题库加载失败: " + error.message);
                        setBankPercent(0);
                    }
                    return;
                }
                if (subject.id === 'hgdmy-maogai') {
                    setBankProgress('正在加载马院毛概题库...');
                    try {
                        const url = '/hgdmy-maogai.json';
                        const res = await fetch(url);
                        if (!res.ok) throw new Error(`HTTP ${res.status}`);
                        const rawJson = await res.json();
                        const parsed = parseHgdmyMaogaiJson(rawJson);
                        if (Object.keys(parsed).length > 0) {
                            setAllQuestionBank(parsed);
                            setBankStatus('ready');
                            await safeSet(cacheKey, parsed);
                            await safeSet(cacheVerKey, BANK_CACHE_VERSION);
                            setBankProgress('题库已就绪');
                            setBankPercent(100);
                        } else {
                            throw new Error('解析结果为空');
                        }
                    } catch (error) {
                        console.warn('马院毛概题库加载失败', error);
                        setBankStatus('error');
                        setErrorMsg("马院毛概题库加载失败: " + error.message);
                        setBankPercent(0);
                    }
                    return;
                }
                if (subject.id === 'english-culture') {
                    setBankProgress('正在加载英语国家社会与文化题库...');
                    try {
                        const url = '/english-culture.json';
                        const res = await fetch(url);
                        if (!res.ok) throw new Error(`HTTP ${res.status}`);
                        const rawJson = await res.json();
                        const parsed = parseEnglishCultureJson(rawJson);
                        if (Object.keys(parsed).length > 0) {
                            setAllQuestionBank(parsed);
                            setBankStatus('ready');
                            await safeSet(cacheKey, parsed);
                            await safeSet(cacheVerKey, BANK_CACHE_VERSION);
                            setBankProgress('题库已就绪');
                            setBankPercent(100);
                        } else {
                            throw new Error('解析结果为空');
                        }
                    } catch (error) {
                        console.warn('英语国家社会与文化题库加载失败', error);
                        setBankStatus('error');
                        setErrorMsg("英语国家社会与文化题库加载失败: " + error.message);
                        setBankPercent(0);
                    }
                    return;
                }
                if (subject.id === RELICS_SUBJECT_ID) {
                    setBankProgress('正在加载文物精品与中华文明题库...');
                    try {
                        const url = '/cultural-relics.json';
                        const res = await fetch(url);
                        if (!res.ok) throw new Error(`HTTP ${res.status}`);
                        const rawJson = await res.json();
                        const parsed = parseCulturalRelicsJson(rawJson);
                        if (Object.keys(parsed).length > 0) {
                            setAllQuestionBank(parsed);
                            setBankStatus('ready');
                            await safeSet(cacheKey, parsed);
                            await safeSet(cacheVerKey, BANK_CACHE_VERSION);
                            setBankProgress('题库已就绪');
                            setBankPercent(100);
                        } else {
                            throw new Error('解析结果为空');
                        }
                    } catch (error) {
                        console.warn('文物精品与中华文明题库加载失败', error);
                        setBankStatus('error');
                        setErrorMsg("文物精品与中华文明题库加载失败: " + error.message);
                        setBankPercent(0);
                    }
                    return;
                }
                const lectures = subject.lectures || LECTURES;
                const total = lectures.length;
                const newBank = {};
                let loaded = 0;
                const loadPromises = lectures.map(async (lecture) => {
                    try {
                        const data = await fetchLectureArrayBuffer(lecture);
                        const rawData = await safeParseXLSX(data);
                        let parsed = [];
                        if (lecture.id === 99) {
                            parsed = parseOldFormatData(rawData, lecture.id, lecture.name);
                        } else {
                            parsed = parseExcelData(rawData, lecture.id, lecture.name);
                        }
                        if (parsed.length > 0) {
                            newBank[lecture.id] = parsed;
                        }
                    } catch (error) {
                        console.warn(`Load failed: ${lecture.file}`, error);
                    } finally {
                        loaded++;
                        setBankPercent(Math.round((loaded / total) * 100));
                        setBankProgress(`正在加载题库 (${loaded}/${total})...`);
                    }
                });
                setBankProgress(`正在加载题库 (0/${total})...`);
                await Promise.all(loadPromises);
                if (Object.keys(newBank).length > 0) {
                    setAllQuestionBank(newBank);
                    setBankStatus('ready');
                    await safeSet(cacheKey, newBank);
                    await safeSet(cacheVerKey, BANK_CACHE_VERSION);
                    setBankProgress('题库已更新');
                    setBankPercent(100);
                } else {
                    setBankStatus('error');
                    setErrorMsg("无法加载任何题库，请检查网络连接");
                    setBankPercent(0);
                }
            } catch (error) {
                setBankStatus('error');
                setErrorMsg("题库初始化失败: " + error.message);
                setBankPercent(0);
            }
        };
        loadBankData();
    }, [selectedSubject]);
    // 消息提示清除
    useEffect(() => {
        if (syncMsg) {
            const timer = setTimeout(() => {
                setSyncMsg("");
                setSyncStatus(null);
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [syncMsg]);
    const refreshBankFromServer = async () => {
        if (!selectedSubject) return;
        const cacheKey = getBankCacheKey(selectedSubject);
        const cacheVerKey = getBankCacheVersionKey(selectedSubject);
        const subject = getSubjectById(allSubjects, selectedSubject);
        if (!subject) return;
        if (subject.isCustom) return; // 自定义学科纯离线，不需要强制从网络更新
        setBankStatus('loading');
        setBankProgress('正在强制更新题库... (0%)');
        setBankPercent(0);
        if (subject.id === 'maogai') {
            try {
                const url = '/maogai_full.json';
                const res = await fetch(url);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const rawJson = await res.json();
                const parsed = parseMaogaiJson(rawJson);
                if (Object.keys(parsed).length > 0) {
                    setAllQuestionBank(parsed);
                    setBankStatus('ready');
                    await safeSet(cacheKey, parsed);
                    await safeSet(cacheVerKey, BANK_CACHE_VERSION);
                    setBankProgress('题库已更新');
                    setBankPercent(100);
                    return;
                }
            } catch (error) {
                console.warn('毛概题库强制更新失败', error);
                setBankStatus('error');
                setErrorMsg("毛概题库强制更新失败: " + error.message);
                setBankPercent(0);
                return;
            }
        }
        if (subject.id === 'hgdmy-maogai') {
            try {
                const url = '/hgdmy-maogai.json';
                const res = await fetch(url);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const rawJson = await res.json();
                const parsed = parseHgdmyMaogaiJson(rawJson);
                if (Object.keys(parsed).length > 0) {
                    setAllQuestionBank(parsed);
                    setBankStatus('ready');
                    await safeSet(cacheKey, parsed);
                    await safeSet(cacheVerKey, BANK_CACHE_VERSION);
                    setBankProgress('题库已更新');
                    setBankPercent(100);
                    return;
                }
            } catch (error) {
                console.warn('马院毛概题库强制更新失败', error);
                setBankStatus('error');
                setErrorMsg("马院毛概题库强制更新失败: " + error.message);
                setBankPercent(0);
                return;
            }
        }
        if (subject.id === 'english-culture') {
            try {
                const url = '/english-culture.json';
                const res = await fetch(url);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const rawJson = await res.json();
                const parsed = parseEnglishCultureJson(rawJson);
                if (Object.keys(parsed).length > 0) {
                    setAllQuestionBank(parsed);
                    setBankStatus('ready');
                    await safeSet(cacheKey, parsed);
                    await safeSet(cacheVerKey, BANK_CACHE_VERSION);
                    setBankProgress('题库已更新');
                    setBankPercent(100);
                    return;
                }
            } catch (error) {
                console.warn('英语国家社会与文化题库强制更新失败', error);
                setBankStatus('error');
                setErrorMsg("英语国家社会与文化题库强制更新失败: " + error.message);
                setBankPercent(0);
                return;
            }
        }
        if (subject.id === RELICS_SUBJECT_ID) {
            try {
                const url = '/cultural-relics.json';
                const res = await fetch(url);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const rawJson = await res.json();
                const parsed = parseCulturalRelicsJson(rawJson);
                if (Object.keys(parsed).length > 0) {
                    setAllQuestionBank(parsed);
                    setBankStatus('ready');
                    await safeSet(cacheKey, parsed);
                    await safeSet(cacheVerKey, BANK_CACHE_VERSION);
                    setBankProgress('题库已更新');
                    setBankPercent(100);
                    return;
                }
                throw new Error('解析结果为空');
            } catch (error) {
                console.warn('文物精品与中华文明题库强制更新失败', error);
                setBankStatus('error');
                setErrorMsg("文物精品与中华文明题库强制更新失败: " + error.message);
                setBankPercent(0);
                return;
            }
        }
        const lectures = subject.lectures || LECTURES;
        const total = lectures.length;
        const newBank = {};
        let loaded = 0;
        const loadPromises = lectures.map(async (lecture) => {
            try {
                const data = await fetchLectureArrayBuffer(lecture);
                const rawData = await safeParseXLSX(data);
                let parsed = [];
                if (lecture.id === 99) {
                    parsed = parseOldFormatData(rawData, lecture.id, lecture.name);
                } else {
                    parsed = parseExcelData(rawData, lecture.id, lecture.name);
                }
                if (parsed.length > 0) {
                    newBank[lecture.id] = parsed;
                }
            } catch (error) {
                console.warn(`Load failed: ${lecture.file}`, error);
            } finally {
                loaded++;
                setBankPercent(Math.round((loaded / total) * 100));
                setBankProgress(`正在更新题库 (${loaded}/${total})...`);
            }
        });
        setBankProgress(`正在更新题库 (0/${total})...`);
        await Promise.all(loadPromises);
        if (Object.keys(newBank).length > 0) {
            setAllQuestionBank(newBank);
            setBankStatus('ready');
            await safeSet(cacheKey, newBank);
            await safeSet(cacheVerKey, BANK_CACHE_VERSION);
            setBankProgress('题库已更新');
            setBankPercent(100);
        } else {
            setBankStatus('error');
            setErrorMsg('强制更新失败：所有来源均不可用');
            setBankPercent(0);
        }
    };
    const forceUpdateBank = async () => {
        await refreshBankFromServer();
    };
    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(e => console.log(e));
            setIsFullscreen(true);
        } else {
            if (document.exitFullscreen) document.exitFullscreen();
            setIsFullscreen(false);
        }
    };
    // ✅ 改动：手动同步 (适配 Cloudflare 后端 secureSync)
    const handleManualSync = async (silent = false) => {
        if (!currentUser) return;
        if (!silent) {
            const ok = window.confirm(
                "将备份到云端的内容：\n- 内置题库（含文物精品与中华文明）的答题状态（已刷/已背/已掌握/错题/收藏）\n- 历史记录（最多500条）\n\n不会备份：\n- 自定义题库及其进度（仅保留本地）\n\n是否继续备份？"
            );
            if (!ok) return;
        }
        if (!silent) {
            setSyncStatus('uploading');
            setSyncMsg("备份中...");
        }
        try {
            // Cloudflare 模式下，currentUser 是普通对象
            const email = currentUser.email;
            if (!email) {
                if (!silent) {
                    setSyncStatus('error');
                    setSyncMsg("需绑定邮箱");
                    alert("同步失败：\n为了您的数据安全，系统要求必须绑定邮箱才能进行云端备份。\n\n请在注册/设置中绑定邮箱。");
                }
                return;
            }
            // 调用后端
            const snapshot = getProgressSnapshot('all');
            const response = await api.request('/secureSync', 'POST', {
                brushedIds: sanitizeCloudIds(snapshot.brushed),
                memorizedIds: sanitizeCloudIds(snapshot.memorized),
                masteredIds: sanitizeCloudIds(snapshot.mastered),
                wrongIds: sanitizeCloudIds(snapshot.wrong),
                favoriteIds: sanitizeCloudIds(snapshot.favorite),
                history: sanitizeCloudHistory(snapshot.history).slice(0, 500) // 限制长度
            });
            if (response && response.success) {
                progressDirtyRef.current = false;
                invalidateReportBundleCache();
                if (!silent) {
                    setSyncStatus('success');
                    setSyncMsg("备份成功");
                    alert("备份完成：已将全部内置题库的答题状态与历史记录同步到云端；自定义题库未上传。");
                }
            } else {
                return Promise.reject(new Error(response ? response.message : "云端未返回成功状态"));
            }
        } catch (e) {
            checkApiLimitError(e);
            if (!silent) {
                setSyncStatus('error');
                let displayMsg = "备份失败";
                const serverMsg = e.message || "";
                if (serverMsg.includes("邮箱")) {
                    displayMsg = "需验证邮箱";
                    alert("同步失败：\n" + serverMsg);
                } else if (serverMsg.includes("速度过快") || serverMsg.includes("异常")) {
                    displayMsg = "被拦截";
                    alert("同步被拒绝：\n" + serverMsg);
                } else if (serverMsg.includes("Forbidden") || e.code === 403) {
                    displayMsg = "权限不足";
                }
                setSyncMsg(displayMsg);
            }
            console.error("云同步失败:", e);
        }
    };
    // 如果您需要此功能，请在后端添加 GET 接口。
    const mergeCloudProgress = async (data) => {
        if (!data) return false;
        const latest = latestSyncDataRef.current;
        let newBrushed = new Set(latest?.brushedIds || brushedIds);
        let newMemorized = new Set(latest?.memorizedIds || memorizedIds);
        let newMastered = new Set(latest?.masteredIds || masteredIds);
        let newWrong = new Set(latest?.wrongIds || wrongIds);
        let newFavorite = new Set(latest?.favoriteIds || favoriteIds);
        let newHistory = [...(latest?.history || history)];
        const getArr = (v) => {
            if (Array.isArray(v)) return v;
            if (typeof v === 'string') {
                try {
                    return JSON.parse(v);
                } catch {
                    return [];
                }
            }
            return [];
        };
        const cloudBrushed = itemsWithoutCustom(getArr(data.brushedIds));
        const cloudMemorized = itemsWithoutCustom(getArr(data.memorizedIds));
        const cloudMastered = itemsWithoutCustom(getArr(data.masteredIds));
        const cloudWrong = itemsWithoutCustom(getArr(data.wrongIds));
        const cloudFavorite = itemsWithoutCustom(getArr(data.favoriteIds));
        const cloudHistory = getArr(data.history).filter(h => h && h.questionId && !String(h.questionId).startsWith('custom_'));
        if (cloudBrushed.length) newBrushed = new Set([...newBrushed, ...cloudBrushed]);
        if (cloudMemorized.length) newMemorized = new Set([...newMemorized, ...cloudMemorized]);
        if (cloudMastered.length) newMastered = new Set([...newMastered, ...cloudMastered]);
        if (cloudWrong.length) newWrong = new Set([...newWrong, ...cloudWrong]);
        if (cloudFavorite.length) newFavorite = new Set([...newFavorite, ...cloudFavorite]);
        if (cloudHistory.length) {
            const existingIds = new Set(newHistory.map(h => h.id));
            newHistory = [...cloudHistory.filter(h => !existingIds.has(h.id)), ...newHistory]
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        }
        if (!progressDirtyRef.current) {
            suppressDirtyRef.current = true;
        }
        setBrushedIds(newBrushed);
        setMemorizedIds(newMemorized);
        setMasteredIds(newMastered);
        setWrongIds(newWrong);
        setFavoriteIds(newFavorite);
        setHistory(newHistory);
        await Promise.all([
            safeSet('app_brushedIds', Array.from(newBrushed)),
            safeSet('app_memorizedIds', Array.from(newMemorized)),
            safeSet('app_masteredIds', Array.from(newMastered)),
            safeSet('app_wrongIds', Array.from(newWrong)),
            safeSet('app_favoriteIds', Array.from(newFavorite)),
            safeSet('app_history', newHistory)
        ]);
        return true;
    };

    const handleManualRestore = async (silent = false) => {
        if (!currentUser) return;
        if (!silent) {
            const ok = window.confirm(
                "将从云端恢复的内容：\n- 内置题库（含文物精品与中华文明）的答题状态（已刷/已背/已掌握/错题/收藏）\n- 历史记录\n\n恢复方式：与本地合并去重，不会覆盖自定义题库。\n\n是否继续恢复？"
            );
            if (!ok) return;
        }
        if (!silent) {
            setSyncStatus('downloading');
            setSyncMsg("恢复中...");
        }
        try {
            const result = await api.request(`/userProgress?_t=${Date.now()}`);
            if (result && result.progress) {
                await mergeCloudProgress(result.progress);
                if (!silent) {
                    setSyncStatus('success');
                    setSyncMsg("同步完成");
                    alert("恢复完成：已从云端合并恢复全部内置题库的答题状态与历史记录；自定义题库未受影响。");
                }
            } else {
                if (!silent) {
                    setSyncMsg("无数据");
                    setSyncStatus(null);
                    alert("云端暂无备份数据。\n请确认已在电脑端点击「备份」并提示成功，且手机端登录的是同一个账号。");
                }
            }
        } catch (e) {
            console.error(e);
            if (!silent) {
                setSyncStatus('error');
                setSyncMsg("失败");
                alert("恢复失败：" + (e.message || "网络异常，请稍后重试"));
            }
        }
    };
    /**
     * 【新增】本地刷题记录导出为 JSON 文件
     */
    const handleExportProgress = async () => {
        try {
            const action = await openSubjectSelectorModal({
                title: '导出类型',
                description: '请选择要导出的内容',
                allowMulti: false,
                options: [
                    {value: 'progress', label: '答题状态'},
                    {value: 'raw_bank', label: '原始题库'},
                    {value: 'bundle', label: '题库+答题状态（一体包）'}
                ],
                defaultValues: ['progress']
            });
            if (!action || !action.length) return;
            const exportType = action[0];
            const chosenSubjects = await openSubjectSelectorModal({
                title: '选择题库',
                description: '支持单选/多选；手机端可滚动勾选',
                allowMulti: true,
                options: allSubjects.map(s => ({value: s.id, label: s.name})),
                defaultValues: selectedSubject ? [selectedSubject] : allSubjects.map(s => s.id)
            });
            if (!chosenSubjects || !chosenSubjects.length) {
                alert("请至少选择一个题库。");
                return;
            }
            const isAll = chosenSubjects.length === allSubjects.length;
            const scopeSnapshot = {
                brushed: [],
                memorized: [],
                mastered: [],
                wrong: [],
                favorite: [],
                history: []
            };
            chosenSubjects.forEach(subId => {
                const one = getProgressSnapshot(subId);
                scopeSnapshot.brushed.push(...one.brushed);
                scopeSnapshot.memorized.push(...one.memorized);
                scopeSnapshot.mastered.push(...one.mastered);
                scopeSnapshot.wrong.push(...one.wrong);
                scopeSnapshot.favorite.push(...one.favorite);
                scopeSnapshot.history.push(...one.history);
            });
            if (exportType === 'progress') {
                const data = {
                    header: {
                        appName: "HFUT Innovation & Entrepreneurship Question Bank (CF)",
                        version: CURRENT_APP_VERSION,
                        exportDate: new Date().toISOString(),
                        userId: currentUser?.id || 'guest',
                        exportType: 'progress',
                        scopeSubjectIds: chosenSubjects,
                        scopeMode: isAll ? 'all' : 'partial'
                    },
                    payload: {
                        brushedIds: Array.from(new Set(scopeSnapshot.brushed)),
                        memorizedIds: Array.from(new Set(scopeSnapshot.memorized)),
                        masteredIds: Array.from(new Set(scopeSnapshot.mastered)),
                        wrongIds: Array.from(new Set(scopeSnapshot.wrong)),
                        favoriteIds: Array.from(new Set(scopeSnapshot.favorite)),
                        history: dedupeAndSortHistory(scopeSnapshot.history)
                    }
                };
                const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `HFUT_Quiz_CF_Progress_${isAll ? 'all' : chosenSubjects.join('_')}_${new Date().toISOString().split('T')[0]}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                setSyncStatus('success');
                setSyncMsg("导出成功");
                return;
            }
            const subjectList = allSubjects.filter(s => chosenSubjects.includes(s.id));
            const banks = {};
            for (const sub of subjectList) {
                const key = getBankCacheKey(sub.id);
                const cached = await safeGet(key, null);
                if (cached && Object.keys(cached).length > 0) {
                    banks[sub.id] = cached;
                } else if (sub.id === selectedSubject && allQuestionBank && Object.keys(allQuestionBank).length > 0) {
                    banks[sub.id] = allQuestionBank;
                }
            }
            if (!Object.keys(banks).length) {
                throw new Error("未找到可导出的题库缓存，请先进入对应题库页面完成加载。");
            }
            if (exportType === 'bundle') {
                const bundleData = {
                    header: {
                        appName: "HFUT Innovation & Entrepreneurship Question Bank (CF)",
                        version: CURRENT_APP_VERSION,
                        exportDate: new Date().toISOString(),
                        userId: currentUser?.id || 'guest',
                        exportType: 'bundle',
                        scopeSubjectIds: chosenSubjects,
                        scopeMode: isAll ? 'all' : 'partial'
                    },
                    subjects: subjectList.map(s => ({
                        id: s.id,
                        name: s.name,
                        isCustom: !!s.isCustom,
                        shortName: s.shortName || '',
                        icon: s.icon || '',
                        lectures: s.lectures || []
                    })),
                    banks,
                    payload: {
                        brushedIds: Array.from(new Set(scopeSnapshot.brushed)),
                        memorizedIds: Array.from(new Set(scopeSnapshot.memorized)),
                        masteredIds: Array.from(new Set(scopeSnapshot.mastered)),
                        wrongIds: Array.from(new Set(scopeSnapshot.wrong)),
                        favoriteIds: Array.from(new Set(scopeSnapshot.favorite)),
                        history: dedupeAndSortHistory(scopeSnapshot.history)
                    }
                };
                const blob = new Blob([JSON.stringify(bundleData, null, 2)], {type: 'application/json'});
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `HFUT_Quiz_CF_Bundle_${isAll ? 'all' : chosenSubjects.join('_')}_${new Date().toISOString().split('T')[0]}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                setSyncStatus('success');
                setSyncMsg("导出成功");
                return;
            }
            const rawData = {
                header: {
                    appName: "HFUT Innovation & Entrepreneurship Question Bank (CF)",
                    version: CURRENT_APP_VERSION,
                    exportDate: new Date().toISOString(),
                    userId: currentUser?.id || 'guest',
                    exportType: 'raw_bank',
                    scopeSubjectIds: chosenSubjects,
                    scopeMode: isAll ? 'all' : 'partial'
                },
                subjects: subjectList.map(s => ({
                    id: s.id,
                    name: s.name,
                    isCustom: !!s.isCustom,
                    shortName: s.shortName || '',
                    icon: s.icon || ''
                })),
                banks
            };
            const blob = new Blob([JSON.stringify(rawData, null, 2)], {type: 'application/json'});
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `HFUT_Quiz_CF_RawBank_${isAll ? 'all' : chosenSubjects.join('_')}_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            setSyncStatus('success');
            setSyncMsg("导出成功");

        } catch (err) {
            console.error('Export failed', err);
            setSyncStatus('error');
            setSyncMsg("导出失败");
        }
    };
    /**
     * 【新增】从 JSON 文件恢复本地刷题记录
     */
    const handleImportProgress = (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = JSON.parse(e.target.result);
                const exportType = data?.header?.exportType || (data?.banks ? 'raw_bank' : 'progress');
                const fileScopeIds = Array.isArray(data?.header?.scopeSubjectIds)
                    ? data.header.scopeSubjectIds
                    : (data?.header?.scopeSubjectId ? [data.header.scopeSubjectId] : []);
                const subjectMetaMap = new Map();
                (Array.isArray(data?.subjects) ? data.subjects : []).forEach(s => {
                    if (s && s.id) subjectMetaMap.set(s.id, s);
                });
                const idsFromBanks = data?.banks && typeof data.banks === 'object' ? Object.keys(data.banks) : [];
                const idsFromPayload = (() => {
                    const p = data?.payload || data?.progress || {};
                    const allIds = [
                        ...(Array.isArray(p.brushedIds) ? p.brushedIds : []),
                        ...(Array.isArray(p.memorizedIds) ? p.memorizedIds : []),
                        ...(Array.isArray(p.masteredIds) ? p.masteredIds : []),
                        ...(Array.isArray(p.wrongIds) ? p.wrongIds : []),
                        ...(Array.isArray(p.favoriteIds) ? p.favoriteIds : []),
                        ...((Array.isArray(p.history) ? p.history : []).map(h => h?.questionId).filter(Boolean))
                    ];
                    return Array.from(new Set(allIds.map(id => getQuestionSubjectId(id)).filter(Boolean)));
                })();
                const importScopeIds = Array.from(new Set([
                    ...fileScopeIds,
                    ...idsFromBanks,
                    ...idsFromPayload
                ]));
                const importScopeOptions = importScopeIds.map(id => {
                    const meta = subjectMetaMap.get(id);
                    const local = allSubjects.find(s => s.id === id);
                    return {
                        value: id,
                        label: meta?.name || local?.name || id
                    };
                });
                if (!importScopeOptions.length) {
                    throw new Error("导入文件中未解析到题库范围信息。");
                }
                const chosenSubjects = await openSubjectSelectorModal({
                    title: '导入目标题库',
                    description: '支持单选/多选，只导入到你选中的题库范围',
                    allowMulti: true,
                    options: importScopeOptions,
                    defaultValues: importScopeIds
                });
                if (!chosenSubjects || !chosenSubjects.length) {
                    event.target.value = '';
                    return;
                }
                const importBanks = exportType === 'raw_bank' || exportType === 'bundle' || !!data?.banks;
                if (importBanks && data?.banks && typeof data.banks === 'object') {
                    const importedSubjects = Array.isArray(data.subjects) ? data.subjects : [];
                    const importedCustomSubs = importedSubjects
                        .filter(s => s && s.isCustom && chosenSubjects.includes(s.id))
                        .map(s => {
                            const lectures = Array.isArray(s.lectures) && s.lectures.length
                                ? s.lectures
                                : (data?.banks?.[s.id] ? Object.keys(data.banks[s.id]).map((k, i) => ({ id: Number(k) || (i + 1), name: `章节${k}` })) : []);
                            return toStorableCustomSubject({
                                id: s.id,
                                name: s.name,
                                shortName: s.shortName || s.name,
                                icon: s.icon || '📚',
                                isCustom: true,
                                lectures
                            });
                        });
                    const missingCustomFromBanks = chosenSubjects
                        .filter(id => String(id).startsWith('custom_'))
                        .filter(id => !importedCustomSubs.find(s => s.id === id))
                        .map(id => {
                            const bank = data?.banks?.[id] || {};
                            const lectures = Object.keys(bank).map((k, i) => ({ id: Number(k) || (i + 1), name: `章节${k}` }));
                            return toStorableCustomSubject({
                                id,
                                name: subjectMetaMap.get(id)?.name || id,
                                shortName: subjectMetaMap.get(id)?.shortName || subjectMetaMap.get(id)?.name || id,
                                icon: subjectMetaMap.get(id)?.icon || '📚',
                                isCustom: true,
                                lectures
                            });
                        });
                    const nextImportedCustoms = [...importedCustomSubs, ...missingCustomFromBanks];
                    if (nextImportedCustoms.length) {
                        const mergedCustom = [...customSubjects];
                        nextImportedCustoms.forEach(sub => {
                            const idx = mergedCustom.findIndex(x => x.id === sub.id);
                            if (idx >= 0) mergedCustom[idx] = sub;
                            else mergedCustom.push(sub);
                        });
                        const normalizedMergedCustom = normalizeCustomSubjects(mergedCustom);
                        setCustomSubjects(normalizedMergedCustom);
                        await safeSet('custom_subjects_list', normalizedMergedCustom);
                    }
                    for (const subId of chosenSubjects) {
                        if (data.banks[subId]) {
                            await safeSet(getBankCacheKey(subId), data.banks[subId]);
                            if (subId === selectedSubject) {
                                setAllQuestionBank(data.banks[subId]);
                                setBankStatus('ready');
                            }
                        }
                    }
                }
                const hasProgress = exportType === 'progress' || exportType === 'bundle' || !!data?.payload || !!data?.progress;
                if (!hasProgress) {
                    setSyncStatus('success');
                    setSyncMsg("题库导入完成");
                    alert("题库导入完成，可直接开始刷题。");
                    event.target.value = '';
                    return;
                }
                // 允许一些宽松的格式检查
                const p = data.payload || data.progress || data;
                if (!p.brushedIds && !p.history) {
                    setSyncStatus('success');
                    setSyncMsg("题库导入完成");
                    alert("题库导入完成（该文件不包含答题状态）。");
                    event.target.value = '';
                    return;
                }
                const importedBrushed = filterProgressBySubject(Array.from(normalizeSet(p.brushedIds)), 'all')
                    .filter(id => chosenSubjects.includes(getQuestionSubjectId(id)));
                const importedMemorized = filterProgressBySubject(Array.from(normalizeSet(p.memorizedIds)), 'all')
                    .filter(id => chosenSubjects.includes(getQuestionSubjectId(id)));
                const importedMastered = filterProgressBySubject(Array.from(normalizeSet(p.masteredIds)), 'all')
                    .filter(id => chosenSubjects.includes(getQuestionSubjectId(id)));
                const importedWrong = filterProgressBySubject(Array.from(normalizeSet(p.wrongIds)), 'all')
                    .filter(id => chosenSubjects.includes(getQuestionSubjectId(id)));
                const importedFavorite = filterProgressBySubject(Array.from(normalizeSet(p.favoriteIds)), 'all')
                    .filter(id => chosenSubjects.includes(getQuestionSubjectId(id)));
                const importedHistory = dedupeAndSortHistory(filterHistoryBySubject(p.history || [], 'all')
                    .filter(h => chosenSubjects.includes(getQuestionSubjectId(h.questionId))));
                const confirmMerge = window.confirm("发现有效数据。点击'确定'将新数据与当前进度【合并】，点击'取消'则【覆盖】当前进度。");
                if (confirmMerge) {
                    setBrushedIds(prev => new Set([...prev, ...importedBrushed]));
                    setMemorizedIds(prev => new Set([...prev, ...importedMemorized]));
                    setMasteredIds(prev => new Set([...prev, ...importedMastered]));
                    setWrongIds(prev => new Set([...prev, ...importedWrong]));
                    setFavoriteIds(prev => new Set([...prev, ...importedFavorite]));
                    setHistory(prev => {
                        const combined = [...importedHistory, ...prev];
                        return dedupeAndSortHistory(combined);
                    });
                } else {
                    if (window.confirm("❗ 警告：完全覆盖将清空当前所有本地进度及历史，确定继续吗？")) {
                        if (chosenSubjects.length === allSubjects.length) {
                            setBrushedIds(new Set(importedBrushed));
                            setMemorizedIds(new Set(importedMemorized));
                            setMasteredIds(new Set(importedMastered));
                            setWrongIds(new Set(importedWrong));
                            setFavoriteIds(new Set(importedFavorite));
                            setHistory(dedupeAndSortHistory(importedHistory));
                        } else {
                            setBrushedIds(prev => new Set([
                                ...filterProgressBySubject(Array.from(prev), 'all').filter(id => !chosenSubjects.includes(getQuestionSubjectId(id))),
                                ...importedBrushed
                            ]));
                            setMemorizedIds(prev => new Set([
                                ...filterProgressBySubject(Array.from(prev), 'all').filter(id => !chosenSubjects.includes(getQuestionSubjectId(id))),
                                ...importedMemorized
                            ]));
                            setMasteredIds(prev => new Set([
                                ...filterProgressBySubject(Array.from(prev), 'all').filter(id => !chosenSubjects.includes(getQuestionSubjectId(id))),
                                ...importedMastered
                            ]));
                            setWrongIds(prev => new Set([
                                ...filterProgressBySubject(Array.from(prev), 'all').filter(id => !chosenSubjects.includes(getQuestionSubjectId(id))),
                                ...importedWrong
                            ]));
                            setFavoriteIds(prev => new Set([
                                ...filterProgressBySubject(Array.from(prev), 'all').filter(id => !chosenSubjects.includes(getQuestionSubjectId(id))),
                                ...importedFavorite
                            ]));
                            setHistory(prev => {
                                const remained = prev.filter(h => !h?.questionId || !chosenSubjects.includes(getQuestionSubjectId(h.questionId)));
                                return dedupeAndSortHistory([...remained, ...importedHistory]);
                            });
                        }
                    } else {
                        event.target.value = '';
                        return;
                    }
                }
                setSyncStatus('success');
                setSyncMsg("导入完成");
                if (importBanks) {
                    alert("导入完成：题库与答题状态均已处理，可直接使用。");
                }
            } catch (err) {
                console.error('Import failed', err);
                alert("导入失败: " + err.message);
                setSyncStatus('error');
                setSyncMsg("导入出错");
            }
        };
        reader.readAsText(file);
        // 清空 input 确保同一个文件能多次触发
        event.target.value = '';
    };
    const performReset = () => {
        if (sessionAutoSaveTimerRef.current) {
            clearTimeout(sessionAutoSaveTimerRef.current);
            sessionAutoSaveTimerRef.current = null;
        }
        setBrushedIds(new Set());
        setMemorizedIds(new Set());
        setMasteredIds(new Set());
        setCorrectStreaks({});
        setWrongIds(new Set());
        setFavoriteIds(new Set());
        setHistory([]);
        setLastSessions({});
        loadedSessionSubjectsRef.current.clear();
        mutatedSessionSubjectsRef.current.clear();
        
        // 同时物理清理 IndexedDB (localforage) 与 localStorage 的进度缓存，确保重置彻底干净
        localforage.removeItem('app_brushedIds').catch(console.warn);
        localforage.removeItem('app_memorizedIds').catch(console.warn);
        localforage.removeItem('app_masteredIds').catch(console.warn);
        localforage.removeItem('app_correctStreaks').catch(console.warn);
        localforage.removeItem('app_wrongIds').catch(console.warn);
        localforage.removeItem('app_favoriteIds').catch(console.warn);
        localforage.removeItem('app_history').catch(console.warn);
        clearAllLastSessions(allSubjects.map(s => s.id)).catch(console.error);

        localStorage.removeItem('app_brushedIds');
        localStorage.removeItem('app_memorizedIds');
        localStorage.removeItem('app_masteredIds');
        localStorage.removeItem('app_correctStreaks');
        localStorage.removeItem('app_wrongIds');
        localStorage.removeItem('app_favoriteIds');
        localStorage.removeItem('app_history');
        clearAutoMasterNoticeSeen();
        clearAutoUnmasterNoticeSeen();
        setAutoMasterNotice(null);
        
        setShowResetModal(false);
        setSyncMsg("进度已重置");
        setSyncStatus("success");
    };
    const generateAndStartQuiz = (mode = 'quiz') => {
        if (bankStatus !== 'ready') return;
        let sourcePool = quizConfig.lectureId === 0 ? Object.values(allQuestionBank).flat() : (allQuestionBank[quizConfig.lectureId] || []);
        if (quizConfig.type !== 'all') {
            sourcePool = sourcePool.filter(q => q.type === quizConfig.type);
        }
        if (quizConfig.filter === 'new') {
            const doneIds = mode === 'memorize' ? memorizedIds : brushedIds;
            sourcePool = sourcePool.filter(q => !doneIds.has(q.id));
        }
        else if (quizConfig.filter === 'wrong') sourcePool = sourcePool.filter(q => wrongIds.has(q.id));
        else if (quizConfig.filter === 'favorite') sourcePool = sourcePool.filter(q => favoriteIds.has(q.id));
        else if (quizConfig.filter === 'unmastered') sourcePool = sourcePool.filter(q => !masteredIds.has(q.id));
        else if (quizConfig.filter === 'mastered') sourcePool = sourcePool.filter(q => masteredIds.has(q.id));
        if (sourcePool.length === 0) {
            alert("该条件下没有可用题目");
            return;
        }
        setCurrentIndex(0);
        setSubjectLastSession(selectedSubject, null);
        const shuffled = [...sourcePool].sort(() => 0.5 - Math.random());
        const limit = quizConfig.count === 'all' ? shuffled.length : Number(quizConfig.count);
        setQuestions(shuffled.slice(0, limit));
        setAnswerResults({});
        setSelectedByQuestion({});
        setFillInputsByQuestion({});
        setFillInputs([]);
        startMode(mode);
    };
    const resumeLastSession = () => {
        const session = lastSession;
        if (!session) return;
        const restoredAnswers = session.answerResults || {};
        const restoredSelections = session.selectedByQuestion || {};
        const restoredFillInputs = session.fillInputsByQuestion || {};
        const currentQ = session.questions?.[session.currentIndex];
        const currentQid = currentQ?.id;
        const currentSelection = currentQid ? (restoredSelections[currentQid] || []) : [];
        const currentFillInput = currentQid ? (restoredFillInputs[currentQid] || []) : [];
        const answered = currentQid ? Object.prototype.hasOwnProperty.call(restoredAnswers, currentQid) : false;

        runTransition(() => {
            setQuestions(session.questions);
            setCurrentIndex(session.currentIndex);
            if (session.quizConfig) setQuizConfig(session.quizConfig);
            setAnswerResults(restoredAnswers);
            setSelectedByQuestion(restoredSelections);
            setFillInputsByQuestion(restoredFillInputs);
            setSelectedIndices(currentSelection);
            setFillInputs(currentFillInput);
            setIsAnswered(answered);
            setShowExplanation(answered);
            setCurrentMode(session.mode);
        });
    };
    const startMistakeNotebook = () => {
        if (bankStatus !== 'ready') return;
        const allQs = Object.values(allQuestionBank).flat();
        const wrongQs = allQs.filter(q => wrongIds.has(q.id));
        if (wrongQs.length === 0) {
            alert("暂无错题记录，继续保持！");
            return;
        }
        setCurrentIndex(0);
        setSubjectLastSession(selectedSubject, null);
        wrongQs.sort(() => 0.5 - Math.random());
        setQuestions(wrongQs);
        setAnswerResults({});
        setSelectedByQuestion({});
        setFillInputsByQuestion({});
        setFillInputs([]);
        startMode('mistakes');
    };
    const startFavoriteNotebook = () => {
        if (bankStatus !== 'ready') return;
        const allQs = Object.values(allQuestionBank).flat();
        const favQs = allQs.filter(q => favoriteIds.has(q.id));
        if (favQs.length === 0) {
            alert("暂无收藏题目，做题时点击星标即可收藏！");
            return;
        }
        setCurrentIndex(0);
        setSubjectLastSession(selectedSubject, null);
        favQs.sort(() => 0.5 - Math.random());
        setQuestions(favQs);
        setAnswerResults({});
        setSelectedByQuestion({});
        setFillInputsByQuestion({});
        setFillInputs([]);
        startMode('favorites');
    };
    const performSearch = (keyword = searchKeyword) => {
        if (bankStatus !== 'ready') return;
        if (!keyword.trim() && !searchFilters.onlyFavorites) {
            setSearchResults([]);
            setShowSearchResults(false);
            return;
        }
        const allQs = Object.values(allQuestionBank).flat();
        const lowerKeyword = keyword.toLowerCase().trim();
        let results = lowerKeyword
            ? allQs.filter(q => {
                const questionMatch = q.question?.toLowerCase().includes(lowerKeyword) || false;
                const optionsMatch = q.options?.some(opt => opt && opt.toLowerCase().includes(lowerKeyword)) || false;
                const explanationMatch = q.explanation?.toLowerCase().includes(lowerKeyword) || false;
                return questionMatch || optionsMatch || explanationMatch;
            })
            : [...allQs];
        if (searchFilters.lectureId !== 0) {
            results = results.filter(q => q.lectureId === searchFilters.lectureId);
        }
        if (searchFilters.type !== 'all') {
            results = results.filter(q => q.type === searchFilters.type);
        }
        if (searchFilters.onlyFavorites) {
            results = results.filter(q => favoriteIds.has(q.id));
        }
        if (searchFilters.includeAnswered || searchFilters.includeUnanswered) {
            if (!searchFilters.includeAnswered) {
                results = results.filter(q => !brushedIds.has(q.id));
            }
            if (!searchFilters.includeUnanswered) {
                results = results.filter(q => brushedIds.has(q.id));
            }
        }
        setSearchResults(results);
        setShowSearchResults(true);
    };
    // ✅ 提交问题结果 (推入缓冲池，攒够 40 题随 sync-all 合并上报)
    const submitQuestionResult = async (questionId, isCorrect, questionTitle, category, userAnswer = '') => {
        if (questionId && questionId.startsWith('custom_')) return; // 自定义离线题库不提交结果
        if (!currentUser) return;
        statsBuffer.current.push({
            questionId,
            isCorrect,
            questionTitle,
            category,
            userAnswer
        });
        if (statsBuffer.current.length >= BATCH_THRESHOLD) {
            await performGlobalSync({ includeProgress: true, includeStats: true, heartbeat: true });
        }
    };
    const getQuestionDetails = (questionId) => {
        for (const lectureId in allQuestionBank) {
            const questions = allQuestionBank[lectureId];
            const question = questions.find(q => q.id === questionId);
            if (question) return question;
        }
        return null;
    };
    // ✅ 改动：加载排行榜 (仅官方题库可用，带 30 分钟本地持久化缓存)
    const rankingCacheRef = useRef({});
    const RANKING_CACHE_TTL = 30 * 60 * 1000;
    const loadWrongQuestionRanking = async (subjectId = selectedSubject, force = false) => {
        if (!subjectId || subjectId.startsWith('custom_')) {
            setWrongQuestionRanking([]);
            return;
        }
        if (!force) {
            const memCached = rankingCacheRef.current[subjectId];
            if (memCached && Date.now() - memCached.ts < RANKING_CACHE_TTL) {
                setWrongQuestionRanking(memCached.data);
                return;
            }
            try {
                const raw = localStorage.getItem(`app_ranking_cache_${subjectId}`);
                if (raw) {
                    const diskCached = JSON.parse(raw);
                    if (diskCached && Date.now() - diskCached.ts < RANKING_CACHE_TTL && Array.isArray(diskCached.data)) {
                        rankingCacheRef.current[subjectId] = diskCached;
                        setWrongQuestionRanking(diskCached.data);
                        return;
                    }
                }
            } catch {
                // 忽略本地排行榜缓存解析异常
            }
        }
        setWrongQuestionRanking([]);
        try {
            const result = await api.getWrongQuestionRanking(LEADERBOARD_LIMIT, subjectId, force);
            if (result && Array.isArray(result.ranking)) {
                const parsedRanking = result.ranking
                    .filter(item => item && getQuestionSubjectId(item.questionId) === subjectId)
                    .map(item => ({
                        ...item,
                        questionId: item.questionId
                    }));
                const cacheEntry = { ts: Date.now(), data: parsedRanking };
                rankingCacheRef.current[subjectId] = cacheEntry;
                try {
                    localStorage.setItem(`app_ranking_cache_${subjectId}`, JSON.stringify(cacheEntry));
                } catch {
                    // 忽略 localStorage 异常
                }
                setWrongQuestionRanking(parsedRanking);
            }
        } catch (e) {
            console.error('加载错题排行榜失败:', e);
        }
    };
    const openRankingQuestion = (rankItem) => {
        const questionDetail = getQuestionDetails(rankItem.questionId);
        if (questionDetail) {
            setViewingRankQuestion({...questionDetail, rankInfo: rankItem});
            loadQuestionThread(questionDetail.id);
        } else {
            alert('题库中未找到该题');
        }
    };
    const openSearchQuestion = (param) => {
        let questionItem = null;
        if (typeof param === 'number') {
            if (typeof searchResults !== 'undefined' && searchResults[param]) {
                questionItem = searchResults[param];
            }
        } else {
            questionItem = param;
        }
        if (!questionItem || !questionItem.id) {
            console.error("无法打开题目：题目数据不完整或 ID 缺失", param);
            return;
        }
        const existingRankData = (typeof wrongQuestionRanking !== 'undefined' && Array.isArray(wrongQuestionRanking))
            ? wrongQuestionRanking.find(r => r.questionId === questionItem.id)
            : null;
        const safeQuestion = {
            ...questionItem,
            options: Array.isArray(questionItem.options) ? questionItem.options : [],
            rawAnswer: Array.isArray(questionItem.rawAnswer) ? questionItem.rawAnswer : [],
            explanation: questionItem.explanation || "暂无解析",
            rankInfo: existingRankData ? {
                ...existingRankData,
                rank: `榜单 #${existingRankData.rank}`
            } : {
                rank: '搜索预览',
                errorCount: '-',
                totalAttempts: '-',
                errorRate: '-',
                optionStats: {}
            }
        };
        if (typeof setViewingRankQuestion === 'function') {
            setViewingRankQuestion(safeQuestion);
        }
        // 触发数据加载（使用聚合接口 /thread/:id）
        loadQuestionThread(questionItem.id);
    };
    // --- 交互逻辑重构 (本地乐观更新) ---
    // 提交评论
    const submitComment = async (questionId) => {
        if (!currentUser || !newComment.trim()) return;
        const validation = validateContent(newComment.trim());
        if (!validation.valid) {
            alert(validation.message);
            setSyncMsg(validation.message);
            setSyncStatus('error');
            return;
        }
        const tempId = 'temp_' + Date.now();
        const commentPayload = {
            id: tempId,
            questionId,
            content: newComment.trim(),
            author: currentUser.username || '我',
            authorId: currentUser.id,
            createdAt: new Date().toISOString(),
            likes: 0,
            liked: false,
            isTemp: true
        };
        // 乐观更新 UI
        setQuestionThread(prev => {
            const thread = prev[questionId] || {comments: [], explanations: []};
            return {
                ...prev,
                [questionId]: {
                    ...thread,
                    comments: [commentPayload, ...thread.comments]
                }
            };
        });
        setNewComment('');
        try {
            // 发送请求，直接用返回值原地替换 tempId，0 二次 GET
            const res = await api.postComment(questionId, commentPayload.content);
            setSyncMsg('评论发布成功');
            setSyncStatus('success');
            if (res?.comment) {
                setQuestionThread(prev => {
                    const thread = prev[questionId] || { comments: [], explanations: [] };
                    const nextThread = {
                        ...thread,
                        comments: thread.comments.map(c => (c.id === tempId ? res.comment : c))
                    };
                    setCachedThread(questionId, nextThread);
                    return { ...prev, [questionId]: nextThread };
                });
                invalidateReportBundleCache();
            } else {
                await loadQuestionThread(questionId, true);
            }
        } catch (e) {
            console.error('发布评论失败:', e);
            setSyncMsg('评论发布失败');
            setSyncStatus('error');
            // 回滚
            setQuestionThread(prev => {
                const thread = prev[questionId];
                if (!thread) return prev;
                return {
                    ...prev,
                    [questionId]: {
                        ...thread,
                        comments: thread.comments.filter(c => c.id !== tempId)
                    }
                };
            });
        }
    };
    // 点赞评论
    const handleLikeComment = async (questionId, comment) => {
        if (!currentUser || !comment?.id) return;
        if (comment.authorId && comment.authorId === currentUser.id) {
            alert("不能给自己点赞哦");
            return;
        }
        // 乐观更新
        const originalLiked = comment.liked;
        const originalLikes = comment.likes;
        setQuestionThread(prev => {
            const thread = prev[questionId];
            if (!thread) return prev;
            const newComments = thread.comments.map(c => {
                if (c.id === comment.id) {
                    return {
                        ...c,
                        liked: !originalLiked,
                        likes: originalLiked ? Math.max(0, originalLikes - 1) : originalLikes + 1
                    };
                }
                return c;
            });
            return {...prev, [questionId]: {...thread, comments: newComments}};
        });
        try {
            const result = await api.likeComment(comment.id);
            // 使用服务器返回的准确计数校准
            setQuestionThread(prev => {
                const thread = prev[questionId];
                if (!thread) return prev;
                const updatedThread = {
                    ...thread,
                    comments: thread.comments.map(c =>
                        c.id === comment.id
                            ? {
                                ...c,
                                likes: typeof result?.likes === 'number' ? result.likes : c.likes,
                                liked: typeof result?.liked === 'boolean' ? result.liked : c.liked
                            }
                            : c
                    )
                };
                setCachedThread(questionId, updatedThread);
                return {
                    ...prev,
                    [questionId]: updatedThread
                };
            });
        } catch (e) {
            console.error('点赞操作失败', e);
            // 回滚
            setQuestionThread(prev => {
                const thread = prev[questionId];
                if (!thread) return prev;
                return {
                    ...prev,
                    [questionId]: {
                        ...thread,
                        comments: thread.comments.map(c =>
                            c.id === comment.id ? {...c, likes: originalLikes, liked: originalLiked} : c
                        )
                    }
                };
            });
        }
    };
    // 删除评论
    const handleDeleteComment = async (questionId, comment) => {
        if (!currentUser || !comment?.id || comment.authorId !== currentUser.id) return;
        if (!window.confirm('确定删除这条评论吗？')) return;
        const prevComments = questionThread[questionId]?.comments || [];
        // 乐观更新：直接移除
        setQuestionThread(prev => {
            const thread = prev[questionId];
            if (!thread) return prev;
            return {
                ...prev,
                [questionId]: {
                    ...thread,
                    comments: thread.comments.filter(c => c.id !== comment.id)
                }
            };
        });
        setEditingCommentId(null);
        setEditingCommentContent('');
        try {
            await api.request(`/comments/${comment.id}`, 'DELETE');
            setQuestionThread(prev => {
                const thread = prev[questionId];
                if (thread) setCachedThread(questionId, thread);
                return prev;
            });
            invalidateReportBundleCache();
        } catch (e) {
            console.error('删除评论失败', e);
            alert("删除失败，请重试");
            setQuestionThread(prev => {
                const thread = prev[questionId];
                if (!thread) return prev;
                return { ...prev, [questionId]: { ...thread, comments: prevComments } };
            });
        }
    };
    const handleStartEditComment = (comment) => {
        setEditingCommentId(comment.id);
        setEditingCommentContent(comment.content);
    };
    // 更新评论
    const handleUpdateComment = async (questionId) => {
        if (!editingCommentId) return;
        const content = editingCommentContent.trim();
        if (!content) return;
        const validation = validateContent(content);
        if (!validation.valid) {
            setSyncMsg(validation.message);
            setSyncStatus('error');
            return;
        }
        const prevComments = questionThread[questionId]?.comments || [];
        // 乐观更新
        setQuestionThread(prev => {
            const thread = prev[questionId];
            if (!thread) return prev;
            return {
                ...prev,
                [questionId]: {
                    ...thread,
                    comments: thread.comments.map(c =>
                        c.id === editingCommentId ? {...c, content: content} : c
                    )
                }
            };
        });
        const originalId = editingCommentId;
        setEditingCommentId(null);
        setEditingCommentContent('');
        try {
            await api.request(`/comments/${originalId}`, 'PUT', {content});
            setQuestionThread(prev => {
                const thread = prev[questionId];
                if (thread) setCachedThread(questionId, thread);
                return prev;
            });
            invalidateReportBundleCache();
            setSyncStatus('success');
            setSyncMsg('评论已更新');
        } catch (e) {
            console.error('更新评论失败', e);
            setSyncStatus('error');
            setSyncMsg('更新失败');
            setQuestionThread(prev => {
                const thread = prev[questionId];
                if (!thread) return prev;
                return { ...prev, [questionId]: { ...thread, comments: prevComments } };
            });
        }
    };
    // 解析点赞
    const handleLikeExplanation = async (questionId, explanation) => {
        if (!currentUser || !explanation?.id) return;
        if (explanation.authorId && explanation.authorId === currentUser.id) return;
        const prevExplanations = questionThread[questionId]?.explanations || [];
        const originalVotes = explanation.votes || 0;
        setQuestionThread(prev => {
            const thread = prev[questionId];
            if (!thread) return prev;
            const newExps = thread.explanations.map(e => {
                if (e.id === explanation.id) {
                    const isLiked = !!e.liked;
                    return {
                        ...e,
                        liked: !isLiked,
                        votes: isLiked ? Math.max(0, originalVotes - 1) : originalVotes + 1
                    };
                }
                return e;
            });
            return {...prev, [questionId]: {...thread, explanations: newExps}};
        });
        try {
            const result = await api.voteExplanation(explanation.id);
            setQuestionThread(prev => {
                const thread = prev[questionId];
                if (!thread) return prev;
                const updatedThread = {
                    ...thread,
                    explanations: thread.explanations.map(e =>
                        e.id === explanation.id
                            ? {
                                ...e,
                                votes: typeof result?.votes === 'number' ? result.votes : e.votes,
                                liked: typeof result?.liked === 'boolean' ? result.liked : e.liked
                            }
                            : e
                    )
                };
                setCachedThread(questionId, updatedThread);
                return {
                    ...prev,
                    [questionId]: updatedThread
                };
            });
        } catch (e) {
            console.error('解析点赞失败', e);
            setQuestionThread(prev => {
                const thread = prev[questionId];
                if (!thread) return prev;
                return { ...prev, [questionId]: { ...thread, explanations: prevExplanations } };
            });
        }
    };
    // 提交解析
    const submitUserExplanation = async (questionId) => {
        if (!currentUser || !newExplanation.trim()) return;
        const validation = validateContent(newExplanation.trim());
        if (!validation.valid) {
            alert(validation.message);
            setSyncMsg(validation.message);
            setSyncStatus('error');
            return;
        }
        const tempId = 'temp_exp_' + Date.now();
        const expPayload = {
            id: tempId,
            questionId,
            content: newExplanation.trim(),
            author: currentUser.username || '我',
            authorId: currentUser.id,
            createdAt: new Date().toISOString(),
            votes: 0,
            liked: false
        };
        setQuestionThread(prev => {
            const thread = prev[questionId] || {comments: [], explanations: []};
            return {
                ...prev,
                [questionId]: {
                    ...thread,
                    explanations: [expPayload, ...thread.explanations]
                }
            };
        });
        setNewExplanation('');
        setShowExplanationForm(false);
        try {
            const res = await api.postExplanation(questionId, expPayload.content);
            setSyncMsg('解析提交成功');
            setSyncStatus('success');
            if (res?.explanation) {
                setQuestionThread(prev => {
                    const thread = prev[questionId] || { comments: [], explanations: [] };
                    const nextThread = {
                        ...thread,
                        explanations: thread.explanations.map(e => (e.id === tempId ? res.explanation : e))
                    };
                    setCachedThread(questionId, nextThread);
                    return { ...prev, [questionId]: nextThread };
                });
                invalidateReportBundleCache();
            } else {
                await loadQuestionThread(questionId, true);
            }
        } catch (e) {
            console.error('提交解析失败:', e);
            alert("提交解析失败: " + (e.message || "未知错误"));
            setSyncMsg('解析提交失败');
            setSyncStatus('error');
            setQuestionThread(prev => {
                const thread = prev[questionId];
                if (!thread) return prev;
                return {
                    ...prev,
                    [questionId]: {
                        ...thread,
                        explanations: thread.explanations.filter(item => item.id !== tempId)
                    }
                };
            });
        }
    };
    const handleUpdateExplanation = async (questionId) => {
        if (!editingExplanationId) return;
        const content = editingExplanationContent.trim();
        if (!content) return;
        const validation = validateContent(content);
        if (!validation.valid) {
            setSyncMsg(validation.message);
            setSyncStatus('error');
            return;
        }
        const prevExplanations = questionThread[questionId]?.explanations || [];
        setQuestionThread(prev => {
            const thread = prev[questionId];
            if (!thread) return prev;
            return {
                ...prev,
                [questionId]: {
                    ...thread,
                    explanations: thread.explanations.map(e =>
                        e.id === editingExplanationId ? {...e, content: content} : e
                    )
                }
            };
        });
        const originalId = editingExplanationId;
        setEditingExplanationId(null);
        setEditingExplanationContent('');
        try {
            await api.request(`/explanations/${originalId}`, 'PUT', {content});
            setQuestionThread(prev => {
                const thread = prev[questionId];
                if (thread) setCachedThread(questionId, thread);
                return prev;
            });
            invalidateReportBundleCache();
            setSyncStatus('success');
            setSyncMsg('解析已更新');
        } catch (e) {
            console.error('更新解析失败:', e);
            setSyncStatus('error');
            setSyncMsg('更新解析失败');
            setQuestionThread(prev => {
                const thread = prev[questionId];
                if (!thread) return prev;
                return { ...prev, [questionId]: { ...thread, explanations: prevExplanations } };
            });
        }
    };
    const renderUserExplanations = (questionId) => {
        // 安全引用
        const list = questionThread[questionId]?.explanations;
        if (!list || list.length === 0) return null;
        return (
            <div className="mt-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-3 space-y-2">
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-2">
                    <BookOpen size={14}/> 用户提供的解析
                </p>
                {list.map((exp) => {
                    const isOwner = exp.authorId === currentUser?.id;
                    const isEditing = editingExplanationId === exp.id;
                    return (
                        <div key={exp.id} className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 space-y-2">
                            <div className="text-xs text-slate-500 dark:text-slate-400 flex justify-between items-center">
                                <span>{exp.author} · {formatDate(exp.createdAt)}</span>
                                {isOwner && !isEditing && (
                                    <button onClick={() => {
                                        setEditingExplanationId(exp.id);
                                        setEditingExplanationContent(exp.content);
                                    }} className="text-blue-600 dark:text-blue-400 text-xs">编辑</button>
                                )}
                            </div>
                            {isEditing ? (
                                <div className="space-y-2">
                                <textarea
                                    value={editingExplanationContent}
                                    onChange={(e) => setEditingExplanationContent(e.target.value)}
                                    className="w-full p-2 border border-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                                    rows={4}
                                />
                                    <div className="flex gap-2 justify-end text-xs">
                                        <button onClick={() => handleUpdateExplanation(questionId)}
                                                className="px-3 py-1 bg-blue-600 text-white rounded-lg">保存
                                        </button>
                                        <button onClick={() => {
                                            setEditingExplanationId(null);
                                            setEditingExplanationContent('');
                                        }} className="px-3 py-1 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg">取消
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <Markdown content={exp.content}/>
                                    <div className="flex items-center gap-3 text-xs">
                                        {isOwner ? (
                                            <div className="text-amber-600 flex items-center gap-1">
                                                <ThumbsUp size={12}/> {exp.votes || 0}
                                            </div>
                                        ) : (
                                            <button onClick={() => handleLikeExplanation(questionId, exp)}
                                                    className="flex items-center gap-1 text-amber-600 hover:text-amber-700">
                                                <ThumbsUp size={12}
                                                          fill={exp.liked ? "currentColor" : "none"}/> {exp.votes || 0}
                                            </button>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    );
                })}
            </div>
        );
    };
    const submitLocalNote = (questionId) => {
        const content = String(newComment || '').trim();
        if (!questionId || !content) return;
        const note = {
            id: Date.now(),
            content,
            createdAt: new Date().toISOString(),
            author: '本地备注'
        };
        setCustomNotes(prev => ({
            ...prev,
            [questionId]: [note, ...(Array.isArray(prev[questionId]) ? prev[questionId] : [])]
        }));
        setNewComment('');
        setSyncStatus('success');
        setSyncMsg('备注已保存（本地）');
    };
    const handleOptionClick = (idx) => {
        // 如果是背题模式，或者已经作答过了，点击无效
        if (currentMode === 'memorize' || isAnswered) return;
        const currentQ = questions[currentIndex];
        if (currentQ.type === 'fill' && currentMode !== 'memorize') return;
        // 多选题逻辑：点击只是选中/取消选中，不自动提交
        if (currentQ.type === 'multiple') {
            setSelectedIndices(prev =>
                prev.includes(idx)
                    ? prev.filter(i => i !== idx)
                    : [...prev, idx]
            );
        } else {
            // 单选/判断：点击立即执行提交逻辑
            submitAnswer([idx]);
        }
    };
    const normalizeAnswerIndices = (value) => {
        if (Array.isArray(value)) {
            return value.map(v => Number(v)).filter(v => Number.isInteger(v) && v >= 0);
        }
        if (value instanceof Set) {
            return Array.from(value).map(v => Number(v)).filter(v => Number.isInteger(v) && v >= 0);
        }
        if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
            return [value];
        }
        if (typeof value === 'string') {
            const letters = value.toUpperCase().match(/[A-H]/g);
            if (letters?.length) {
                return letters.map(ch => ch.charCodeAt(0) - 65);
            }
            const nums = value.split(/[^0-9]+/).map(v => Number(v)).filter(v => Number.isInteger(v) && v >= 0);
            return nums;
        }
        return [];
    };
    const applyResultStats = (questionId, isCorrect, {countMastered = true} = {}) => {
        setBrushedIds(prev => new Set(prev).add(questionId));
        if (isCorrect) {
            setWrongIds(prev => {
                const n = new Set(prev);
                n.delete(questionId);
                return n;
            });
            if (countMastered) {
                const nextCount = (correctStreaks[questionId] || 0) + 1;
                setCorrectStreaks(prev => ({...prev, [questionId]: nextCount}));
                if (nextCount >= masterThreshold) {
                    const wasAlreadyMastered = masteredIds.has(questionId);
                    setMasteredIds(prev => new Set(prev).add(questionId));
                    if (!wasAlreadyMastered && !hasSeenAutoMasterNotice()) {
                        markAutoMasterNoticeSeen();
                        setAutoMasterNotice({ type: 'master', threshold: masterThreshold });
                    }
                }
            }
            setAnswerResults(prev => ({...prev, [questionId]: 'correct'}));
        } else {
            const wasMastered = masteredIds.has(questionId);
            setMasteredIds(prev => {
                const n = new Set(prev);
                n.delete(questionId);
                return n;
            });
            if (wasMastered && !hasSeenAutoUnmasterNotice()) {
                markAutoUnmasterNoticeSeen();
                setAutoMasterNotice({ type: 'unmaster', threshold: masterThreshold });
            }
            setCorrectStreaks(prev => {
                if (!prev[questionId]) return prev;
                const next = {...prev};
                delete next[questionId];
                return next;
            });
            setWrongIds(prev => new Set(prev).add(questionId));
            setAnswerResults(prev => ({...prev, [questionId]: 'wrong'}));
        }
    };
    // ✅ 优化版：提交答案 (移除冗余加载逻辑)
    const submitAnswer = (finalSelection = selectedIndices) => {
        const normalizedSelection = normalizeAnswerIndices(finalSelection);
        if (normalizedSelection.length === 0) return;
        const currentQ = questions[currentIndex];
        // 1. 判定对错
        const correctSet = new Set(normalizeAnswerIndices(currentQ.rawAnswer));
        const userSet = new Set(normalizedSelection);
        const isCorrect = correctSet.size === userSet.size && [...correctSet].every(x => userSet.has(x));
        const answerText = [...normalizedSelection]
            .sort((a, b) => a - b)
            .map(i => String.fromCharCode(65 + i))
            .join('');
        // 2. 更新基础交互状态
        setIsAnswered(true);
        setSelectedIndices(normalizedSelection);
        setSelectedByQuestion(prev => ({...prev, [currentQ.id]: normalizedSelection}));
        setShowExplanation(true); // 💡 这一步会触发我们之前写的 useEffect，自动去加载互动数据
        // 3. 更新统计数据 (本地 Set 操作)
        applyResultStats(currentQ.id, isCorrect);
        // 4. 提交到缓冲区 (由 flushStats 批量发送，不会导致 API 爆炸)
        submitQuestionResult(currentQ.id, isCorrect, currentQ.question, currentQ.category, answerText);
        // 5. 记录本地历史
        setHistory(prev => [{
            id: Date.now(),
            questionId: currentQ.id,
            questionTitle: currentQ.question,
            action: 'answer',
            isCorrect,
            userAnswer: answerText,
            timestamp: new Date().toISOString(),
        }, ...prev]);
    };
    const submitFillAnswer = ({usedHint = false} = {}) => {
        if (isAnswered) return;
        const currentQ = questions[currentIndex];
        if (!currentQ) return;
        const blanks = parseFillAnswer(currentQ.options?.[0], currentQ.question);
        const inputs = blanks.map((_, i) => String(fillInputs[i] || '').trim());
        if (inputs.every(v => !v)) return;
        const {isCorrect} = gradeFill(inputs, blanks);
        const answerText = inputs.join('；');
        setIsAnswered(true);
        setFillInputs(inputs);
        setFillInputsByQuestion(prev => ({...prev, [currentQ.id]: inputs}));
        setSelectedIndices([]);
        setSelectedByQuestion(prev => ({...prev, [currentQ.id]: []}));
        setShowExplanation(true);
        applyResultStats(currentQ.id, isCorrect, {countMastered: !usedHint});
        submitQuestionResult(currentQ.id, isCorrect, currentQ.question, currentQ.category, answerText.slice(0, 60));
        setHistory(prev => [{
            id: Date.now(),
            questionId: currentQ.id,
            questionTitle: currentQ.question,
            action: 'answer',
            isCorrect,
            userAnswer: answerText.slice(0, 200),
            timestamp: new Date().toISOString(),
        }, ...prev]);
    };
    const handleMemorizeCheck = () => {
        setMemorizedIds(prev => new Set(prev).add(questions[currentIndex].id));
        setHistory(prev => [{
            id: Date.now(),
            questionId: questions[currentIndex].id,
            questionTitle: questions[currentIndex].question,
            action: 'memorize',
            timestamp: new Date().toISOString(),
        }, ...prev]);
        setTimeout(() => nextQuestion(), 400);
    };
    const startMode = (mode) => {
        const action = () => {
            setCurrentMode(mode);
            if (mode !== currentMode) {
                setSelectedIndices([]);
                setSelectedByQuestion({});
                setFillInputsByQuestion({});
                setFillInputs([]);
                setIsAnswered(false);
                setShowExplanation(false);
            }
        };
        runTransition(action);
    };
    const changeQuestion = (idx) => {
        const q = questions[idx];
        const qid = q?.id;
        const restored = qid ? (selectedByQuestion[qid] || []) : [];
        const restoredFill = qid ? (fillInputsByQuestion[qid] || []) : [];
        const answered = qid ? Object.prototype.hasOwnProperty.call(answerResults, qid) : false;
        setCurrentIndex(idx);
        setSelectedIndices(restored);
        setFillInputs(restoredFill);
        setIsAnswered(answered);
        setShowExplanation(answered);
    };
    const nextQuestion = () => {
        if (currentIndex < questions.length - 1) changeQuestion(currentIndex + 1);
        else {
            if (sessionAutoSaveTimerRef.current) {
                clearTimeout(sessionAutoSaveTimerRef.current);
                sessionAutoSaveTimerRef.current = null;
            }
            const targetSubjectId = selectedSubject || lastSelectedSubjectRef.current;
            alert("本组练习完成！");
            runTransition(() => {
                setSubjectLastSession(targetSubjectId, null);
                setQuestions([]);
                setCurrentIndex(0);
                setCurrentMode('dashboard');
            });
        }
    };
    const prevQuestion = () => {
        if (currentIndex > 0) changeQuestion(currentIndex - 1);
    };
    const exitToDashboard = () => {
        if (sessionAutoSaveTimerRef.current) {
            clearTimeout(sessionAutoSaveTimerRef.current);
            sessionAutoSaveTimerRef.current = null;
        }
        const targetSubjectId = selectedSubject || lastSelectedSubjectRef.current;
        const persistable = shouldPersistSession({
            mode: currentMode,
            questions,
            currentIndex,
            answerResults
        });
        const snapshot = persistable ? {
            subjectId: targetSubjectId,
            mode: currentMode,
            questions,
            currentIndex,
            quizConfig,
            answerResults,
            selectedByQuestion,
            fillInputsByQuestion,
            updatedAt: Date.now()
        } : null;
        runTransition(() => {
            setSubjectLastSession(targetSubjectId, snapshot);
            setCurrentMode('dashboard');
        });
    };
    const switchSubject = () => {
        if (sessionAutoSaveTimerRef.current) {
            clearTimeout(sessionAutoSaveTimerRef.current);
            sessionAutoSaveTimerRef.current = null;
        }
        const targetSubjectId = selectedSubject || lastSelectedSubjectRef.current;
        if (targetSubjectId && shouldPersistSession({
            mode: currentMode,
            questions,
            currentIndex,
            answerResults
        })) {
            setSubjectLastSession(targetSubjectId, {
                subjectId: targetSubjectId,
                mode: currentMode,
                questions,
                currentIndex,
                quizConfig,
                answerResults,
                selectedByQuestion,
                fillInputsByQuestion,
                updatedAt: Date.now()
            });
        }
        runTransition(() => {
            setSelectedSubject(null);
            setAllQuestionBank({});
            setBankStatus('idle');
            setCurrentMode('dashboard');
            setQuestions([]);
            setCurrentIndex(0);
            setAnswerResults({});
            setSelectedByQuestion({});
            setFillInputsByQuestion({});
            setSelectedIndices([]);
            setFillInputs([]);
            setIsAnswered(false);
            setShowExplanation(false);
            setQuizConfig(prev => ({ ...prev, lectureId: 0 }));
        });
    };
    const renderSubjectSelector = () => (
        <>
            <SubjectSelector
                allSubjects={allSubjects}
                showUploadModal={showUploadModal}
                setShowUploadModal={setShowUploadModal}
                showAiModal={showAiModal}
                setShowAiModal={setShowAiModal}
                showApiSettingsModal={showApiSettingsModal}
                setShowApiSettingsModal={setShowApiSettingsModal}
                setSelectedSubject={(id) => {
                    runTransition(() => {
                        setSelectedSubject(id);
                        setBankStatus('idle');
                        setAllQuestionBank({});
                    });
                }}
                handleDeleteCustomSubject={handleDeleteCustomSubject}
                customSubjects={customSubjects}
                setCustomSubjects={setCustomSubjects}
                safeSet={safeSet}
                getBankCacheKey={getBankCacheKey}
                currentUser={currentUser}
                themeMode={themeMode}
                setThemeMode={setThemeMode}
                syncStatus={syncStatus}
                onManualSync={() => handleManualSync()}
                onManualRestore={() => handleManualRestore()}
                onExport={handleExportProgress}
                onImport={handleImportProgress}
                onRequireLogin={() => setShowLoginScreen(true)}
                onLogout={() => {
                    api.logout();
                    setCurrentUser(null);
                    setShowLoginScreen(false);
                }}
                isFullscreen={isFullscreen}
                onToggleFullscreen={toggleFullscreen}
                onlineCount={onlineCount}
            />
            {renderSubjectSelectionModal()}
        </>
    );
    const renderDashboard = () => (
        <div style={{ viewTransitionName: `card-${selectedSubject}` }} className="h-full">
            <DashboardPage
            header={
                <DashboardHeader
                    appVersion={CURRENT_APP_VERSION}
                    currentSubject={currentSubject}
                    currentUser={currentUser}
                    syncMsg={syncMsg}
                    syncStatus={syncStatus}
                    themeMode={themeMode}
                    setThemeMode={setThemeMode}
                    onSwitchSubject={switchSubject}
                    onToggleSearch={() => setIsSearchOpen(!isSearchOpen)}
                    onForceRefresh={() => {
                        localStorage.removeItem('app_version_checked_at');
                        return forceAppReload();
                    }}
                />
            }
            searchPanel={
                <DashboardSearchPanel
                    open={isSearchOpen}
                    searchSectionRef={searchSectionRef}
                    searchKeyword={searchKeyword}
                    setSearchKeyword={setSearchKeyword}
                    searchFilters={searchFilters}
                    setSearchFilters={setSearchFilters}
                    chapterOptions={getSubjectChapterOptions(currentSubject)}
                    performSearch={performSearch}
                    searchResults={searchResults}
                    showSearchResults={showSearchResults}
                    setSearchResults={setSearchResults}
                    setShowSearchResults={setShowSearchResults}
                    openSearchQuestion={openSearchQuestion}
                    setIsSearchOpen={setIsSearchOpen}
                    favoriteIds={favoriteIds}
                />
            }
            resetModal={
                <ResetConfirmModal
                    open={showResetModal}
                    currentUser={currentUser}
                    onCancel={() => setShowResetModal(false)}
                    onConfirm={performReset}
                />
            }
            updateModal={
                <UpdateNoticeModal
                    open={showUpdateModal}
                    currentVersion={CURRENT_APP_VERSION}
                    remoteVersionInfo={remoteVersionInfo}
                    onReload={forceAppReload}
                    onClose={() => setShowUpdateModal(false)}
                />
            }
        >
            <DashboardMainContentShell>
                    {/* 左侧主内容 */}
                    <div className="lg:col-span-8 space-y-6">
                        <div
                            className="bg-white rounded-[1.5rem] md:rounded-[2rem] shadow-sm border border-slate-200 p-5 md:p-8 relative overflow-hidden dark:bg-slate-900 dark:border-slate-800">
                            <div
                                className="absolute top-0 right-0 w-64 h-64 bg-blue-50 rounded-full -mr-16 -mt-16 opacity-50 blur-3xl dark:bg-blue-950/20"/>
                            <div className="relative z-10 space-y-6">
                                <div className="flex items-center gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
                                    <div className="p-2 bg-blue-100 text-blue-600 rounded-lg dark:bg-blue-950/40 dark:text-blue-400"><Settings size={20}/>
                                    </div>
                                    <div>
                                        <h2 className="font-bold text-lg md:text-xl text-slate-800 dark:text-slate-100">开始新的练习</h2>
                                        <p className="text-xs md:text-sm text-slate-400 dark:text-slate-500">自定义你的刷题计划</p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                                    <div className="md:col-span-2">
                                        <label
                                            className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block ml-1 dark:text-slate-500">题库章节</label>
                                        <select value={quizConfig.lectureId} onChange={e => setQuizConfig({
                                            ...quizConfig,
                                            lectureId: Number(e.target.value)
                                        })}
                                                className="w-full p-3 md:p-4 bg-slate-50 border-0 rounded-2xl text-slate-800 text-sm md:text-base font-medium focus:ring-2 focus:ring-blue-500 transition-all hover:bg-slate-100 appearance-none dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800">
                                            <option value={0}>📚 综合练习 (所有章节)</option>
                                            {getSubjectChapterOptions(currentSubject).map(l => <option key={l.id}
                                                                         value={l.id}>{l.name} ({allQuestionBank[l.id]?.length || 0}题)</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label
                                            className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block ml-1 dark:text-slate-500">题目数量</label>
                                        <div className="grid grid-cols-4 gap-2 bg-slate-50 p-1.5 rounded-2xl dark:bg-slate-950">
                                            {[10, 20, 50, 'all'].map(n => (
                                                <button key={n}
                                                        onClick={() => setQuizConfig({...quizConfig, count: n})}
                                                        className={`py-2 rounded-xl text-xs md:text-sm font-bold transition-all ${quizConfig.count === n ? 'bg-white shadow text-blue-600 dark:bg-slate-900 dark:text-blue-400 dark:shadow-indigo-950/45' : 'text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300'}`}>{n === 'all' ? '全部' : n}</button>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <label
                                            className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block ml-1 dark:text-slate-500">题目类型</label>
                                        <div
                                            className="grid grid-cols-3 md:grid-cols-6 gap-2 bg-slate-50 p-1.5 rounded-2xl dark:bg-slate-950">
                                            {[
                                                {v: 'all', l: '全部'},
                                                {v: 'single', l: '单选'},
                                                {v: 'multiple', l: '多选'},
                                                {v: 'judgment', l: '判断'},
                                                {v: 'fill', l: '填空'},
                                                {v: 'big', l: '简答'}
                                            ].map(t => (
                                                <button key={t.v}
                                                        onClick={() => setQuizConfig({...quizConfig, type: t.v})}
                                                        className={`py-2 rounded-xl text-xs md:text-sm font-bold transition-all ${quizConfig.type === t.v ? 'bg-white shadow text-blue-600 dark:bg-slate-900 dark:text-blue-400 dark:shadow-indigo-950/45' : 'text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300'}`}>{t.l}</button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="md:col-span-2">
                                        <label
                                            className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block ml-1 dark:text-slate-500">模式</label>
                                        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 bg-slate-50 p-1.5 rounded-2xl dark:bg-slate-950">
                                            {[
                                                {v: 'all', l: '随机'},
                                                {v: 'new', l: '未做'},
                                                {v: 'unmastered', l: '未掌握'},
                                                {v: 'mastered', l: '已掌握'},
                                                {v: 'wrong', l: '错题'},
                                                {v: 'favorite', l: '收藏'}
                                            ].map(m => (
                                                <button key={m.v}
                                                        type="button"
                                                        aria-pressed={quizConfig.filter === m.v}
                                                        onClick={() => setQuizConfig({...quizConfig, filter: m.v})}
                                                        className={`py-2 rounded-xl text-xs md:text-sm font-bold transition-all ${quizConfig.filter === m.v ? 'bg-white shadow text-blue-600 dark:bg-slate-900 dark:text-blue-400 dark:shadow-indigo-950/45' : 'text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300'}`}>{m.l}</button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="md:col-span-2">
                                        <div className="flex items-center justify-between gap-2 mb-2 ml-1">
                                            <label
                                                htmlFor="master-threshold-input"
                                                className="text-xs font-bold text-slate-400 uppercase tracking-wider dark:text-slate-500">自动掌握阈值</label>
                                            <span id="master-threshold-help" className="text-[11px] text-slate-400 dark:text-slate-500">
                                                连续答对 {masterThreshold} 遍自动掌握（答错重置）
                                            </span>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2 bg-slate-50 p-1.5 rounded-2xl dark:bg-slate-950">
                                            {[1, 2, 3, 5].map(n => (
                                                <button
                                                    key={n}
                                                    type="button"
                                                    onClick={() => handleMasterThresholdChange(n)}
                                                    aria-pressed={masterThreshold === n}
                                                    className={`flex-1 min-w-[3.5rem] py-2 px-2 rounded-xl text-xs md:text-sm font-bold transition-all ${masterThreshold === n ? 'bg-white shadow text-green-600 dark:bg-slate-900 dark:text-green-400 dark:shadow-indigo-950/45' : 'text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300'}`}
                                                >
                                                    {n === 2 ? '2遍(默认)' : `${n}遍`}
                                                </button>
                                            ))}
                                            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-white rounded-xl border border-slate-200 dark:bg-slate-900 dark:border-slate-800">
                                                <span className="text-xs font-bold text-slate-400 dark:text-slate-500">自定义</span>
                                                <input
                                                    id="master-threshold-input"
                                                    type="text"
                                                    inputMode="numeric"
                                                    pattern="[0-9]*"
                                                    maxLength={2}
                                                    aria-describedby="master-threshold-help"
                                                    value={customThresholdInput}
                                                    onChange={(e) => {
                                                        const digits = e.target.value.replace(/[^0-9]/g, '');
                                                        setCustomThresholdInput(digits);
                                                        if (digits) {
                                                            const parsed = Number.parseInt(digits, 10);
                                                            if (parsed >= 1) {
                                                                const clamped = clampMasterThreshold(parsed);
                                                                saveMasterThreshold(clamped);
                                                                setMasterThreshold(clamped);
                                                            }
                                                        }
                                                    }}
                                                    onBlur={() => handleMasterThresholdChange(customThresholdInput)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') {
                                                            e.preventDefault();
                                                            handleMasterThresholdChange(customThresholdInput);
                                                            e.currentTarget.blur();
                                                        }
                                                    }}
                                                    className="w-10 text-center text-base md:text-sm font-bold text-slate-800 bg-transparent border-b border-slate-300 focus:border-green-500 focus:outline-none dark:text-slate-100 dark:border-slate-700"
                                                />
                                                <span className="text-xs font-bold text-slate-400 dark:text-slate-500">遍</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <button type="button" disabled={bankStatus !== 'ready'} onClick={() => setCurrentMode('smart-learning')} className="w-full rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white p-4 font-bold disabled:opacity-50 flex justify-center items-center gap-2"><Brain size={20}/> 智能学习 · 考试计划</button>
                                <div className="grid grid-cols-2 gap-4 pt-2">
                                    <button onClick={() => generateAndStartQuiz('quiz')}
                                            disabled={bankStatus !== 'ready'}
                                            className="py-3 md:py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold shadow-lg shadow-blue-200 hover:shadow-xl hover:-translate-y-1 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm md:text-base inline-flex items-center justify-center gap-2 dark:shadow-indigo-900/10">
                                        {bankStatus === 'ready' ? <><Brain size={20}/> 开始刷题</> : <><Loader2
                                            size={20} className="animate-spin"/> {bankProgress}</>}
                                    </button>
                                    <button onClick={() => generateAndStartQuiz('memorize')}
                                            disabled={bankStatus !== 'ready'}
                                            className="py-3 md:py-4 bg-white border-2 border-slate-100 hover:border-indigo-200 text-slate-600 hover:text-indigo-600 rounded-2xl font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-50 text-sm md:text-base dark:bg-slate-900 dark:border-slate-800 dark:text-slate-300 dark:hover:text-indigo-400 dark:hover:border-indigo-900">
                                        <BookOpen size={20}/> 背题模式
                                    </button>
                                </div>
                                {bankStatus === 'loading' && (
                                    <div className="mt-3">
                                        <div className="flex items-center justify-between mb-1.5">
                                            <span className="text-xs text-slate-500 dark:text-slate-400">{bankProgress}</span>
                                            <span className="text-xs font-bold text-blue-600 dark:text-blue-400">{bankPercent}%</span>
                                        </div>
                                        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden dark:bg-slate-800">
                                            <div
                                                className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-300 ease-out"
                                                style={{ width: `${bankPercent}%` }}
                                            />
                                        </div>
                                    </div>
                                )}
                                {bankStatus === 'error' && errorMsg && (
                                    <div className="mt-3 p-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-xs dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-400">
                                        {errorMsg}
                                    </div>
                                )}
                                {bankStatus === 'ready' && (
                                    <div className="text-center">
                                        <button onClick={forceUpdateBank}
                                                className="text-xs text-slate-300 hover:text-blue-500 underline decoration-dotted dark:text-slate-600 dark:hover:text-blue-400">发现题库旧?
                                            点击强制更新缓存
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                            {[
                                {
                                    label: '总题库',
                                    val: bankStatus === 'ready' ? Object.values(allQuestionBank).flat().length : '-',
                                    icon: Layers,
                                    color: 'text-slate-600 dark:text-slate-300',
                                    bg: 'bg-slate-100 dark:bg-slate-800'
                                },
                                {
                                    label: '已掌握',
                                    val: currentMasteredIds.size,
                                    icon: CheckCircle,
                                    color: 'text-green-600 dark:text-green-400',
                                    bg: 'bg-green-50 dark:bg-green-950/30'
                                },
                                {
                                    label: '已背诵',
                                    val: currentMemorizedIds.size,
                                    icon: Eye,
                                    color: 'text-purple-600 dark:text-purple-400',
                                    bg: 'bg-purple-50 dark:bg-purple-950/30'
                                },
                                {
                                    label: '正确率',
                                    val: currentBrushedIds.size ? Math.round(currentMasteredIds.size / currentBrushedIds.size * 100) + '%' : '-',
                                    icon: BarChart3,
                                    color: 'text-orange-600 dark:text-orange-400',
                                    bg: 'bg-orange-50 dark:bg-orange-950/30'
                                }
                            ].map((item, i) => (
                                <div key={i}
                                     className="bg-white p-4 rounded-2xl border border-slate-100 flex items-center gap-4 shadow-sm transition-transform duration-300 ease-in-out dark:bg-slate-900 dark:border-slate-800">
                                    <div
                                        className={`w-12 h-12 rounded-xl flex items-center justify-center ${item.bg} ${item.color}`}>
                                        <item.icon size={20}/>
                                    </div>
                                    <div>
                                        <div
                                            className="text-xl md:text-2xl font-bold text-slate-800 leading-none mb-1 dark:text-slate-100">{item.val}</div>
                                        <span
                                            className="text-xs font-bold text-slate-400 uppercase dark:text-slate-500">{item.label}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    {/* 右侧栏：继续学习 + 错题/排行并排 + 数据报表 */}
                    <div className="lg:col-span-4 flex flex-col gap-6 h-full">
                        {lastSession && (
                            <div onClick={resumeLastSession}
                                 className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl sm:rounded-[2rem] p-4 sm:p-5 md:p-6 text-white shadow-lg cursor-pointer hover:scale-[1.01] transition-transform flex justify-between items-center animate-enter">
                                <div className="flex items-center gap-4">
                                    <div className="p-3 bg-white/20 backdrop-blur-md rounded-2xl"><Bookmark
                                        size={24}/></div>
                                    <div>
                                        <h3 className="font-bold text-lg">继续上次的学习</h3>
                                        <p className="text-indigo-100 text-xs md:text-sm">{lastSession.mode === 'memorize' ? '背题模式' : (lastSession.mode === 'mistakes' ? '错题攻坚' : (lastSession.mode === 'favorites' ? '我的收藏' : '刷题模式'))} ·
                                            剩余 {lastSession.questions.length - lastSession.currentIndex} 题</p>
                                    </div>
                                </div>
                                <div className="bg-white/20 p-2 rounded-full hover:bg-white/30 transition-colors">
                                    <ChevronRight size={24}/></div>
                            </div>
                        )}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div onClick={startMistakeNotebook}
                                 className="bg-gradient-to-br from-red-500 to-rose-600 p-4 sm:p-5 rounded-2xl sm:rounded-[2rem] shadow-lg shadow-red-200 text-white cursor-pointer hover:scale-[1.02] transition-transform duration-300 ease-in-out will-change-transform relative overflow-hidden group">
                                <div
                                    className="absolute right-0 top-0 w-32 h-32 bg-white opacity-10 rounded-full -mr-8 -mt-8"></div>
                                <div className="relative z-10 flex flex-col h-full justify-between gap-4">
                                    <div className="flex justify-between items-start">
                                        <div className="p-2.5 bg-white/20 rounded-xl backdrop-blur-sm">
                                            <AlertTriangle size={20}/></div>
                                        <span
                                            className="font-mono text-3xl font-bold opacity-90">{currentWrongCount}</span>
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold mb-0.5">错题攻坚</h3>
                                        <p className="text-red-100 text-xs opacity-90">点击开始专项复习</p>
                                    </div>
                                </div>
                            </div>

                            <div onClick={startFavoriteNotebook}
                                 className="bg-gradient-to-br from-amber-400 to-yellow-600 p-4 sm:p-5 rounded-2xl sm:rounded-[2rem] shadow-lg shadow-amber-200 dark:shadow-amber-950/30 text-white cursor-pointer hover:scale-[1.02] transition-transform duration-300 ease-in-out will-change-transform relative overflow-hidden group">
                                <div
                                    className="absolute right-0 top-0 w-32 h-32 bg-white opacity-10 rounded-full -mr-8 -mt-8"></div>
                                <div className="relative z-10 flex flex-col h-full justify-between gap-4">
                                    <div className="flex justify-between items-start">
                                        <div className="p-2.5 bg-white/20 rounded-xl backdrop-blur-sm">
                                            <Star size={20}/></div>
                                        <span
                                            className="font-mono text-3xl font-bold opacity-90">{currentFavoriteIds.size}</span>
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold mb-0.5">我的收藏</h3>
                                        <p className="text-amber-50 text-xs opacity-90">重点题目专项练习</p>
                                    </div>
                                </div>
                            </div>
                            
                            {!currentSubject?.isCustom && (
                                <div onClick={() => {
                                    runTransition(() => {
                                        setCurrentMode('ranking');
                                        loadWrongQuestionRanking();
                                    });
                                }}
                                     className="md:col-span-2 bg-gradient-to-br from-orange-500 to-amber-600 p-4 sm:p-5 rounded-2xl sm:rounded-[2rem] shadow-lg shadow-orange-200 text-white cursor-pointer hover:scale-[1.02] transition-transform duration-300 ease-in-out will-change-transform relative overflow-hidden group">
                                    <div
                                        className="absolute right-0 top-0 w-32 h-32 bg-white opacity-10 rounded-full -mr-8 -mt-8"></div>
                                    <div className="relative z-10 flex items-center justify-between gap-4">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2.5 bg-white/20 rounded-xl backdrop-blur-sm">
                                                <TrendingUp size={20}/>
                                            </div>
                                            <div>
                                                <h3 className="text-lg font-bold mb-0.5">易错题排行</h3>
                                                <p className="text-orange-100 text-xs opacity-90">查看全站最易错的题目</p>
                                            </div>
                                        </div>
                                        <span className="font-mono text-2xl font-bold opacity-90">📊</span>
                                    </div>
                                </div>
                            )}
                        </div>
                        <a href={`/#/report?subject=${selectedSubject}`}
                           className="bg-white p-5 rounded-[2rem] shadow-sm border border-slate-200 cursor-pointer hover:border-blue-300 transition-transform duration-300 ease-in-out will-change-transform flex flex-col no-underline group flex-1 min-h-0 dark:bg-slate-900 dark:border-slate-800 dark:hover:border-blue-900/60">
                            <div className="flex items-start justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl dark:bg-blue-950/40 dark:text-blue-400"><PieChart size={20}/>
                                    </div>
                                    <div>
                                        <div className="font-bold text-base text-slate-800 dark:text-slate-100">数据报表</div>
                                        <div className="text-xs text-slate-400 dark:text-slate-500">近7天学习趋势</div>
                                    </div>
                                </div>
                            </div>
                            <div className="flex gap-3 mb-4">
                                <div
                                    className="flex-1 bg-slate-50 rounded-xl p-3 text-center border border-slate-100 flex flex-col justify-center dark:bg-slate-950 dark:border-slate-850">
                                    <div className="text-[10px] text-slate-400 mb-1 uppercase font-bold dark:text-slate-500">累计已刷
                                    </div>
                                    <div
                                        className="font-bold text-xl text-slate-700 leading-none dark:text-slate-200">{currentBrushedIds.size}</div>
                                </div>
                                <div
                                    className="flex-1 bg-green-50 rounded-xl p-3 text-center border border-green-100 flex flex-col justify-center dark:bg-green-950/10 dark:border-green-900/20">
                                    <div className="text-[10px] text-green-600/70 mb-1 uppercase font-bold dark:text-green-500">已掌握
                                    </div>
                                    <div
                                        className="font-bold text-xl text-green-600 leading-none dark:text-green-400">{currentMasteredIds.size}</div>
                                </div>
                            </div>
                            <div
                                className="flex items-end justify-between gap-2 border-t border-slate-50 pt-4 flex-1 min-h-[80px] dark:border-slate-800">
                                {weeklyStats.data.map((day, idx) => {
                                    const rawPercent = (day.count / weeklyStats.max) * 100;
                                    const heightPercent = day.count === 0 ? 8 : Math.max(15, rawPercent);
                                    return (
                                        <div key={idx}
                                             className="flex-1 h-full flex flex-col justify-end items-center gap-1 group/bar">
                                            <div className="w-full flex items-end justify-center relative flex-1">
                                                {day.count > 0 && (
                                                    <div
                                                        className="absolute -top-7 opacity-0 group-hover/bar:opacity-100 transition-opacity bg-slate-800 text-white text-[10px] py-1 px-1.5 rounded mb-1 whitespace-nowrap z-10 pointer-events-none dark:bg-slate-950 dark:border dark:border-slate-800">
                                                        {day.count}题
                                                    </div>
                                                )}
                                                <div style={{height: `${heightPercent}%`}}
                                                     className={`w-3 md:w-3.5 rounded-t-[4px] transition-all duration-500 ease-out relative ${day.isToday ? 'bg-gradient-to-t from-blue-500 to-indigo-400 shadow-lg shadow-blue-200 dark:from-blue-600 dark:to-indigo-500 dark:shadow-indigo-900/20' : (day.count > 0 ? 'bg-blue-200 group-hover/bar:bg-blue-400 dark:bg-blue-950/60 dark:group-hover/bar:bg-blue-800' : 'bg-slate-100 dark:bg-slate-800')}`}></div>
                                            </div>
                                            <div
                                                className={`text-[10px] ${day.isToday ? 'font-bold text-blue-600 dark:text-blue-450' : 'text-slate-300 dark:text-slate-500'}`}>{day.date}</div>
                                        </div>
                                    );
                                })}
                            </div>
                        </a>
                    </div>
            </DashboardMainContentShell>
        </DashboardPage>
        </div>
    )
    // --- 修复版：计算最近7天刷题数据 ---
    const weeklyStats = (() => {
        const stats = [];
        const today = new Date();
        let maxCount = 5;
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(today.getDate() - i);
            d.setHours(0, 0, 0, 0);
            const dateStr = d.toLocaleDateString('zh-CN', {month: 'numeric', day: 'numeric'});
            const count = currentHistory.filter(h => {
                const hDate = new Date(h.timestamp);
                hDate.setHours(0, 0, 0, 0);
                return hDate.getTime() === d.getTime();
            }).length;
            if (count > maxCount) maxCount = count;
            stats.push({date: dateStr, count, isToday: i === 0});
        }
        return {data: stats, max: maxCount};
    })();
    const renderCard = () => {
        if (!questions.length) return <div
            className="h-screen flex items-center justify-center text-slate-400">题库为空</div>;
        const currentQ = questions[currentIndex];
        if (!currentQ) {
            return <div className="h-screen flex items-center justify-center text-slate-400">题目索引异常，请返回重试</div>;
        }
        const isQuiz = currentMode !== 'memorize';
        const showContent = !isQuiz || showExplanation;
        return (
            <div className="h-screen flex flex-col md:flex-row bg-slate-100 dark:bg-slate-900">
                <QuizSidebar
                    questions={questions}
                    currentIndex={currentIndex}
                    answerResults={answerResults}
                    currentMode={currentMode}
                    isQuiz={isQuiz}
                    isFullscreen={isFullscreen}
                    onExit={exitToDashboard}
                    onToggleFullscreen={toggleFullscreen}
                    onChangeQuestion={changeQuestion}
                />
                <div className="flex-1 flex flex-col h-screen relative">
                    <QuizMobileTopBar
                        currentIndex={currentIndex}
                        total={questions.length}
                        isFullscreen={isFullscreen}
                        onExit={exitToDashboard}
                        onToggleFullscreen={toggleFullscreen}
                    />
                    <div
                        className="flex-1 overflow-y-auto p-4 md:p-8 lg:p-12 flex justify-center pb-20 mobile-safe-bottom">
                        <div className="w-full max-w-5xl space-y-6 md:space-y-8">
                            <div className="grid md:grid-cols-3 gap-4 md:gap-6 items-start">
                                <QuizQuestionPanel
                                    currentQ={currentQ}
                                    isQuiz={isQuiz}
                                    isAnswered={isAnswered}
                                    selectedIndices={selectedIndices}
                                    fillInputs={fillInputs}
                                    isFavorited={favoriteIds.has(currentQ.id)}
                                    onToggleFavorite={() => toggleFavorite(currentQ.id)}
                                    isMastered={masteredIds.has(currentQ.id)}
                                    onToggleMastered={() => toggleMastered(currentQ.id)}
                                    correctStreak={correctStreaks[currentQ.id] || 0}
                                    masterThreshold={masterThreshold}
                                    onOptionClick={handleOptionClick}
                                    onSubmit={submitAnswer}
                                    onFillInputChange={(i, v) => setFillInputs(prev => {
                                        const n = [...prev];
                                        n[i] = v;
                                        return n;
                                    })}
                                    onFillSubmit={submitFillAnswer}
                                />
                                <QuizNavControls
                                    currentIndex={currentIndex}
                                    total={questions.length}
                                    isQuiz={isQuiz}
                                    onPrev={prevQuestion}
                                    onNext={nextQuestion}
                                    onMemorizeNext={handleMemorizeCheck}
                                />
                            </div>
                            {showContent && (
                                <QuizDiscussionPanel
                                    currentQ={currentQ}
                                    isCustomSubject={String(currentQ?.id || '').startsWith('custom_')}
                                    questionThread={questionThread}
                                    customNotes={customNotes}
                                    renderUserExplanations={renderUserExplanations}
                                    showExplanationForm={showExplanationForm}
                                    setShowExplanationForm={setShowExplanationForm}
                                    newExplanation={newExplanation}
                                    setNewExplanation={setNewExplanation}
                                    submitUserExplanation={submitUserExplanation}
                                    commentSectionRef={commentSectionRef}
                                    newComment={newComment}
                                    setNewComment={setNewComment}
                                    submitComment={submitComment}
                                    submitLocalNote={submitLocalNote}
                                    currentUser={currentUser}
                                    editingCommentId={editingCommentId}
                                    editingCommentContent={editingCommentContent}
                                    setEditingCommentId={setEditingCommentId}
                                    setEditingCommentContent={setEditingCommentContent}
                                    handleUpdateComment={handleUpdateComment}
                                    handleStartEditComment={handleStartEditComment}
                                    handleDeleteComment={handleDeleteComment}
                                    handleLikeComment={handleLikeComment}
                                    formatDate={formatDate}
                                />
                            )}
                        </div>
                    </div>
                </div>
            </div>
        )
    };
    // --- 登录界面 (适配 Cloudflare API) ---
    const renderLoginScreen = () => (
        <LoginScreen
            brushedCount={brushedIds.size}
            username={username}
            password={password}
            authLoading={authLoading}
            authError={authError}
            onUsernameChange={setUsername}
            onPasswordChange={setPassword}
            onSubmit={async (e) => {
                e.preventDefault();
                setAuthLoading(true);
                setAuthError(null);
                try {
                    const res = await api.loginWithProgress(username, password);
                    hasInitialSyncRef.current = true;
                    lastHeartbeatAtRef.current = Date.now();
                    try {
                        sessionStorage.setItem('last_initial_sync_at', String(Date.now()));
                    } catch {
                        // 忽略 sessionStorage 异常
                    }
                    setCurrentUser(res.user);
                    if (res.initialProgress) {
                        await mergeCloudProgress(res.initialProgress);
                    }
                    if (res.onlineCount !== undefined) {
                        setOnlineCount(res.onlineCount);
                    }
                    if (res.appVersion) {
                        applyRemoteVersion(res.appVersion);
                    }
                    setShowLoginScreen(false);
                    setAuthLoading(false);
                } catch (err) {
                    setAuthError(err.message || '登录失败');
                    setAuthLoading(false);
                }
            }}
        />
    );
// ✅ 优化版：自动加载互动数据 (优先读 2 小时本地持久化缓存，未命中时防抖并以滑窗 30 题批量预取)
    useEffect(() => {
        if (!questions.length || !currentUser) return;
        const q = questions[currentIndex];
        if (!q || !q.id || isCustomQuestionId(q.id)) return;
        const isMemorizeMode = currentMode === 'memorize';
        const shouldShowContent = isMemorizeMode || showExplanation;
        if (!shouldShowContent) return;

        if (!questionThread[q.id]) {
            const cached = getCachedThread(q.id);
            if (cached) {
                setQuestionThread((prev) => ({ ...prev, [q.id]: cached }));
                return;
            }
        }

        const windowIds = questions
            .slice(currentIndex, currentIndex + 30)
            .map((item) => item?.id)
            .filter((id) => id && !isCustomQuestionId(id) && !questionThread[id] && !getCachedThread(id));

        if (windowIds.length === 0) return;

        const timer = setTimeout(() => {
            loadQuestionThreadsBatch(windowIds);
        }, 300);
        return () => clearTimeout(timer);
    }, [currentIndex, showExplanation, currentMode, questions.length, currentUser]);
    const renderQuestionDetailModal = () => (
        <QuestionDetailModal
            viewingRankQuestion={viewingRankQuestion}
            onClose={() => setViewingRankQuestion(null)}
            renderUserExplanations={renderUserExplanations}
            isFavorited={viewingRankQuestion ? favoriteIds.has(viewingRankQuestion.id) : false}
            onToggleFavorite={() => viewingRankQuestion && toggleFavorite(viewingRankQuestion.id)}
            isMastered={viewingRankQuestion ? masteredIds.has(viewingRankQuestion.id) : false}
            onToggleMastered={() => viewingRankQuestion && toggleMastered(viewingRankQuestion.id)}
        />
    );
    // --- 排行榜页面 ---
    const renderRankingPage = () => (
        <RankingPage
            wrongQuestionRanking={wrongQuestionRanking.filter(item => item && getQuestionSubjectId(item.questionId) === selectedSubject)}
            onBack={() => runTransition(() => setCurrentMode('dashboard'))}
            onRefresh={() => {
                setWrongQuestionRanking([]);
                loadWrongQuestionRanking(selectedSubject, true);
            }}
            onOpenQuestion={openRankingQuestion}
        />
    );
    const renderSubjectSelectionModal = () => {
        if (!selectorModal.open) return null;
        const selectedSet = new Set(selectorModal.selectedValues || []);
        const toggleValue = (value) => {
            setSelectorModal(prev => {
                const current = new Set(prev.selectedValues || []);
                if (prev.allowMulti) {
                    if (current.has(value)) current.delete(value);
                    else current.add(value);
                    return {...prev, selectedValues: Array.from(current)};
                }
                return {...prev, selectedValues: [value]};
            });
        };
        const selectAll = () => {
            setSelectorModal(prev => ({...prev, selectedValues: prev.options.map(o => o.value)}));
        };
        const clearAll = () => setSelectorModal(prev => ({...prev, selectedValues: []}));
        return (
            <div style={{ viewTransitionName: 'modal' }} className="fixed inset-0 z-[120] bg-slate-900/45 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-4">
                <div className="w-full sm:max-w-lg bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 max-h-[82vh] flex flex-col">
                    <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800">
                        <h3 className="text-base sm:text-lg font-bold text-slate-800 dark:text-slate-100">{selectorModal.title}</h3>
                        {selectorModal.description && (
                            <p className="text-xs sm:text-sm mt-1 text-slate-500 dark:text-slate-400">{selectorModal.description}</p>
                        )}
                    </div>
                    <div className="px-4 sm:px-5 pt-3 flex items-center justify-between">
                        {selectorModal.allowMulti ? (
                            <div className="flex gap-2">
                                <button onClick={selectAll} className="px-2.5 py-1 text-xs rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400">全选</button>
                                <button onClick={clearAll} className="px-2.5 py-1 text-xs rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">清空</button>
                            </div>
                        ) : <div />}
                        <div className="text-xs text-slate-400 dark:text-slate-500">已选 {selectedSet.size}</div>
                    </div>
                    <div className="p-4 sm:p-5 overflow-y-auto space-y-2">
                        {selectorModal.options.map(opt => {
                            const active = selectedSet.has(opt.value);
                            return (
                                <button
                                    key={opt.value}
                                    onClick={() => toggleValue(opt.value)}
                                    className={`w-full text-left px-3.5 py-3 rounded-xl border text-sm font-medium transition ${active ? 'border-blue-400 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950/30 dark:text-blue-300' : 'border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800'}`}
                                >
                                    {opt.label}
                                </button>
                            );
                        })}
                    </div>
                    <div className="p-4 sm:p-5 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-3">
                        <button onClick={() => closeSubjectSelectorModal(null)} className="py-2.5 rounded-xl bg-slate-100 text-slate-700 font-semibold dark:bg-slate-800 dark:text-slate-200">取消</button>
                        <button onClick={() => closeSubjectSelectorModal(Array.from(selectedSet))} className="py-2.5 rounded-xl bg-blue-600 text-white font-semibold disabled:opacity-60" disabled={selectedSet.size === 0}>确定</button>
                    </div>
                </div>
            </div>
        );
    };
    if (!currentUser && showLoginScreen) return renderLoginScreen();
    const hasActiveQuizSession = ['quiz', 'memorize', 'mistakes', 'favorites'].includes(currentMode) && questions.length > 0;
    if (!selectedSubject && !hasActiveQuizSession) return renderSubjectSelector();
    return (
        <div className="h-full font-sans text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
            {currentMode === 'dashboard' && renderDashboard()}
            {currentMode === 'smart-learning' && selectedSubject && <SmartLearning key={String(currentUser?.id ?? 'guest') + ':' + selectedSubject} subject={selectedSubject} subjectName={currentSubject?.name || selectedSubject} bank={allQuestionBank} user={currentUser} wrongIds={wrongIds} brushedIds={brushedIds} onBack={() => setCurrentMode('dashboard')} />}
            {['quiz', 'memorize', 'mistakes', 'favorites'].includes(currentMode) && renderCard()}
            {currentMode === 'ranking' && renderRankingPage()}
            {viewingRankQuestion && renderQuestionDetailModal()}
            {renderSubjectSelectionModal()}
            <AutoMasterNoticeToast
                notice={autoMasterNotice}
                onDismiss={() => setAutoMasterNotice(null)}
            />
            {/* API 受限提示 */}
            {apiLimitReached && (
                <div className="fixed bottom-0 left-0 right-0 z-[100] animate-enter">
                    <div className="bg-red-600 text-white p-4 shadow-[0_-4px_20px_rgba(0,0,0,0.2)]">
                        <div className="max-w-4xl mx-auto flex items-start md:items-center gap-4">
                            <div className="p-2 bg-white/20 rounded-full shrink-0 animate-pulse"><Zap size={24}
                                                                                                      className="text-white"/>
                            </div>
                            <div className="flex-1">
                                <h3 className="font-bold text-lg flex items-center gap-2">服务受限</h3>
                                <p className="text-red-100 text-sm mt-1 leading-snug">
                                    API 请求过于频繁，云端同步等功能暂时不可用，本地刷题不受影响。
                                </p>
                            </div>
                            <button onClick={() => setApiLimitReached(false)}
                                    className="p-2 hover:bg-white/20 rounded-lg shrink-0"><X size={20}/></button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
export default App;
