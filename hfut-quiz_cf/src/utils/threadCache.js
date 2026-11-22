const THREAD_CACHE_KEY = 'app_thread_cache_v1';
const REPORT_BUNDLE_CACHE_KEY = 'app_report_bundle_cache_v1';
const THREAD_TTL_MS = 2 * 60 * 60 * 1000; // 2 小时持久化缓存
const MAX_CACHE_ENTRIES = 400;

function readThreadStore() {
  try {
    const raw = localStorage.getItem(THREAD_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const now = Date.now();
    const cleaned = {};
    for (const [qid, entry] of Object.entries(parsed)) {
      if (entry && entry.data && typeof entry.ts === 'number' && now - entry.ts < THREAD_TTL_MS) {
        cleaned[qid] = entry;
      }
    }
    return cleaned;
  } catch {
    return {};
  }
}

function writeThreadStore(store) {
  try {
    const entries = Object.entries(store);
    if (entries.length > MAX_CACHE_ENTRIES) {
      entries.sort((a, b) => (b[1]?.ts || 0) - (a[1]?.ts || 0));
      const trimmed = Object.fromEntries(entries.slice(0, MAX_CACHE_ENTRIES));
      localStorage.setItem(THREAD_CACHE_KEY, JSON.stringify(trimmed));
      return;
    }
    localStorage.setItem(THREAD_CACHE_KEY, JSON.stringify(store));
  } catch {
    // 若超出 localStorage 配额则缩小保留最近 100 条重试一次
    try {
      const entries = Object.entries(store)
        .sort((a, b) => (b[1]?.ts || 0) - (a[1]?.ts || 0))
        .slice(0, 100);
      localStorage.setItem(THREAD_CACHE_KEY, JSON.stringify(Object.fromEntries(entries)));
    } catch {
      // 忽略缓存写入异常
    }
  }
}

export function getCachedThread(questionId) {
  if (!questionId) return null;
  const store = readThreadStore();
  const entry = store[questionId];
  if (!entry || !entry.data) return null;
  return entry.data;
}

export function setCachedThread(questionId, threadData) {
  if (!questionId || !threadData) return;
  const store = readThreadStore();
  store[questionId] = { ts: Date.now(), data: threadData };
  writeThreadStore(store);
}

export function setCachedThreadsBatch(threadsMap) {
  if (!threadsMap || typeof threadsMap !== 'object') return;
  const entries = Object.entries(threadsMap);
  if (entries.length === 0) return;
  const store = readThreadStore();
  const now = Date.now();
  for (const [qid, data] of entries) {
    if (qid && data) {
      store[qid] = { ts: now, data };
    }
  }
  writeThreadStore(store);
}

export function invalidateCachedThread(questionId) {
  if (!questionId) return;
  const store = readThreadStore();
  if (Object.prototype.hasOwnProperty.call(store, questionId)) {
    delete store[questionId];
    writeThreadStore(store);
  }
}

export function getReportBundleCacheKey() {
  return REPORT_BUNDLE_CACHE_KEY;
}

export function invalidateReportBundleCache() {
  try {
    sessionStorage.removeItem(REPORT_BUNDLE_CACHE_KEY);
  } catch {
    // 忽略 sessionStorage 异常
  }
}

export function clearAllInteractionCaches() {
  try {
    localStorage.removeItem(THREAD_CACHE_KEY);
  } catch {
    // 忽略 localStorage 异常
  }
  try {
    sessionStorage.removeItem(REPORT_BUNDLE_CACHE_KEY);
    sessionStorage.removeItem('last_initial_sync_at');
  } catch {
    // 忽略 sessionStorage 异常
  }
}
