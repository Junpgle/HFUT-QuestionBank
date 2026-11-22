import localforage from 'localforage';
import { safeGet, safeSet } from './storage.js';
import { getQuestionSubjectId } from './questionId.js';

export const LEGACY_LAST_SESSION_KEY = 'app_lastSession';
export const LAST_SESSION_KEY_PREFIX = 'app_lastSession_';
export const VALID_SESSION_MODES = ['quiz', 'memorize', 'mistakes', 'favorites'];

export const getLastSessionKey = (subjectId) => (
  subjectId ? `${LAST_SESSION_KEY_PREFIX}${subjectId}` : ''
);

export const inferSessionSubjectId = (session) => {
  if (!session || typeof session !== 'object') return null;
  if (typeof session.subjectId === 'string' && session.subjectId.trim()) {
    return session.subjectId.trim();
  }
  if (Array.isArray(session.questions)) {
    const firstWithId = session.questions.find((q) => q && q.id);
    if (firstWithId) return getQuestionSubjectId(firstWithId.id);
  }
  return null;
};

export const normalizeLastSession = (raw, expectedSubjectId = null) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (!VALID_SESSION_MODES.includes(raw.mode)) return null;
  if (!Array.isArray(raw.questions) || raw.questions.length === 0) return null;
  if (!Number.isInteger(raw.currentIndex) || raw.currentIndex < 0 || raw.currentIndex >= raw.questions.length) {
    return null;
  }

  const inferred = inferSessionSubjectId(raw);
  if (expectedSubjectId) {
    if (raw.subjectId && raw.subjectId !== expectedSubjectId) return null;
    if (!raw.subjectId && inferred && inferred !== expectedSubjectId) return null;
  }

  const subjectId = expectedSubjectId || inferred;
  if (!subjectId) return null;

  return {
    subjectId,
    mode: raw.mode,
    questions: raw.questions,
    currentIndex: raw.currentIndex,
    quizConfig: raw.quizConfig && typeof raw.quizConfig === 'object' && !Array.isArray(raw.quizConfig) ? raw.quizConfig : null,
    answerResults: raw.answerResults && typeof raw.answerResults === 'object' && !Array.isArray(raw.answerResults) ? raw.answerResults : {},
    selectedByQuestion: raw.selectedByQuestion && typeof raw.selectedByQuestion === 'object' && !Array.isArray(raw.selectedByQuestion) ? raw.selectedByQuestion : {},
    fillInputsByQuestion: raw.fillInputsByQuestion && typeof raw.fillInputsByQuestion === 'object' && !Array.isArray(raw.fillInputsByQuestion) ? raw.fillInputsByQuestion : {},
    updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : Date.now(),
  };
};

export const shouldPersistSession = ({ mode, questions, currentIndex, answerResults }) => {
  if (!VALID_SESSION_MODES.includes(mode)) return false;
  if (!Array.isArray(questions) || questions.length === 0) return false;
  if (!Number.isInteger(currentIndex) || currentIndex < 0 || currentIndex >= questions.length) {
    return false;
  }

  const isLastQuestion = currentIndex === questions.length - 1;
  const results = answerResults && typeof answerResults === 'object' ? answerResults : {};
  const allAnswered =
    mode !== 'memorize' &&
    questions.every((q) => q?.id && Object.prototype.hasOwnProperty.call(results, q.id));

  return !(isLastQuestion && allAnswered);
};

let globalClearChain = Promise.resolve();
const subjectChains = new Map();

const enqueueSubjectOp = (subjectId, task) => {
  const prev = subjectChains.get(subjectId) || Promise.resolve();
  const next = prev
    .catch(() => {})
    .then(() => globalClearChain.catch(() => {}))
    .then(() => task());
  subjectChains.set(subjectId, next);
  const cleanup = () => {
    if (subjectChains.get(subjectId) === next) {
      subjectChains.delete(subjectId);
    }
  };
  next.then(cleanup, cleanup);
  return next;
};

export const loadSubjectLastSession = async (subjectId) => {
  if (!subjectId) return null;
  await globalClearChain.catch(() => {});
  await (subjectChains.get(subjectId) || Promise.resolve()).catch(() => {});
  const raw = await safeGet(getLastSessionKey(subjectId), null);
  return normalizeLastSession(raw, subjectId);
};

export const saveSubjectLastSession = async (subjectId, session) => {
  if (!subjectId) return null;
  const normalized = normalizeLastSession(session, subjectId);
  if (!normalized) {
    await removeSubjectLastSession(subjectId);
    return null;
  }
  await enqueueSubjectOp(subjectId, () => safeSet(getLastSessionKey(subjectId), normalized));
  return normalized;
};

export const removeSubjectLastSession = async (subjectId) => {
  if (!subjectId) return;
  const key = getLastSessionKey(subjectId);
  await enqueueSubjectOp(subjectId, async () => {
    await localforage.removeItem(key).catch(console.warn);
    try {
      localStorage.removeItem(key);
    } catch {
      // 忽略 localStorage 清理异常
    }
  });
};

export const migrateLegacyLastSession = async () => {
  const legacy = await safeGet(LEGACY_LAST_SESSION_KEY, null);
  if (!legacy) return null;

  const normalized = normalizeLastSession(legacy);
  let result = null;
  if (normalized) {
    const existing = await loadSubjectLastSession(normalized.subjectId);
    if (existing) {
      result = existing;
    } else {
      result = await saveSubjectLastSession(normalized.subjectId, normalized);
    }
  }

  await localforage.removeItem(LEGACY_LAST_SESSION_KEY).catch(console.warn);
  try {
    localStorage.removeItem(LEGACY_LAST_SESSION_KEY);
  } catch {
    // 忽略 localStorage 清理异常
  }
  return result;
};

export const clearAllLastSessions = (knownSubjectIds = []) => {
  const prevGlobal = globalClearChain;
  const pendingSubjectOps = Array.from(subjectChains.values()).map((p) => p.catch(() => {}));
  const nextGlobal = Promise.all([prevGlobal.catch(() => {}), ...pendingSubjectOps]).then(async () => {
    const keysToRemove = new Set([LEGACY_LAST_SESSION_KEY]);
    (Array.isArray(knownSubjectIds) ? knownSubjectIds : []).forEach((id) => {
      if (id) keysToRemove.add(getLastSessionKey(id));
    });

    try {
      const lfKeys = await localforage.keys();
      if (Array.isArray(lfKeys)) {
        lfKeys.forEach((k) => {
          if (k === LEGACY_LAST_SESSION_KEY || String(k).startsWith(LAST_SESSION_KEY_PREFIX)) {
            keysToRemove.add(k);
          }
        });
      }
    } catch (err) {
      console.warn('localforage.keys() 失败', err);
    }

    try {
      for (let i = 0; i < localStorage.length; i += 1) {
        const k = localStorage.key(i);
        if (k === LEGACY_LAST_SESSION_KEY || String(k).startsWith(LAST_SESSION_KEY_PREFIX)) {
          keysToRemove.add(k);
        }
      }
    } catch {
      // 忽略 localStorage 读取异常
    }

    await Promise.all(
      Array.from(keysToRemove).map((key) => localforage.removeItem(key).catch(console.warn))
    );
    try {
      keysToRemove.forEach((key) => localStorage.removeItem(key));
    } catch {
      // 忽略 localStorage 清理异常
    }
  });

  globalClearChain = nextGlobal.catch(() => {});
  return nextGlobal;
};
