import localforage from 'localforage';

const TRANSLATE_ENABLED_KEY = 'hf_offline_translate_enabled';
const FULL_DICT_STORAGE_KEY = 'hf_full_en_zh_dict_v1';
const FULL_DICT_URL = './dict/en-zh-full.json';

let builtinDictPromise = null;
let fullDictPromise = null;
let cachedDict = null;
let cachedSource = 'none'; // 'none' | 'builtin' | 'full'

export const getTranslateEnabled = () => {
  try {
    return localStorage.getItem(TRANSLATE_ENABLED_KEY) === 'true';
  } catch {
    return false;
  }
};

export const setTranslateEnabled = (enabled) => {
  try {
    localStorage.setItem(TRANSLATE_ENABLED_KEY, enabled ? 'true' : 'false');
  } catch {
    // Ignore storage quota/privacy mode errors
  }
};

const loadBuiltinDict = async () => {
  if (!builtinDictPromise) {
    builtinDictPromise = import('../data/enZhDict.json').then((mod) => mod.default || mod);
  }
  return builtinDictPromise;
};

/**
 * Load the best locally available offline dictionary (cached full dict if present, otherwise built-in).
 */
export const loadOfflineDict = async () => {
  if (cachedDict && cachedSource === 'full') {
    return { dict: cachedDict, source: 'full', count: Object.keys(cachedDict).length };
  }

  try {
    const storedFull = await localforage.getItem(FULL_DICT_STORAGE_KEY);
    if (storedFull && typeof storedFull === 'object' && Object.keys(storedFull).length > 1000) {
      cachedDict = storedFull;
      cachedSource = 'full';
      return { dict: cachedDict, source: 'full', count: Object.keys(cachedDict).length };
    }
  } catch {
    // Ignore IndexedDB read errors and fall back to built-in dict
  }

  const builtin = await loadBuiltinDict();
  cachedDict = builtin;
  cachedSource = 'builtin';
  return { dict: builtin, source: 'builtin', count: Object.keys(builtin).length };
};

/**
 * Download and cache the full offline dictionary (~34,000+ entries) in IndexedDB.
 */
export const downloadFullOfflineDict = async () => {
  if (cachedDict && cachedSource === 'full') {
    return { dict: cachedDict, source: 'full', count: Object.keys(cachedDict).length };
  }

  if (!fullDictPromise) {
    fullDictPromise = (async () => {
      try {
        const storedFull = await localforage.getItem(FULL_DICT_STORAGE_KEY);
        if (storedFull && typeof storedFull === 'object' && Object.keys(storedFull).length > 1000) {
          cachedDict = storedFull;
          cachedSource = 'full';
          return { dict: cachedDict, source: 'full', count: Object.keys(cachedDict).length };
        }
      } catch {
        // Continue to network fetch
      }

      const res = await fetch(FULL_DICT_URL);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      if (!data || typeof data !== 'object' || Object.keys(data).length === 0) {
        throw new Error('Invalid dictionary payload');
      }
      cachedDict = data;
      cachedSource = 'full';
      try {
        await localforage.setItem(FULL_DICT_STORAGE_KEY, data);
      } catch {
        // Keep in-memory dictionary even if IndexedDB persistence fails
      }
      return { dict: data, source: 'full', count: Object.keys(data).length };
    })().finally(() => {
      fullDictPromise = null;
    });
  }

  return fullDictPromise;
};

const getCandidateStems = (word) => {
  const w = String(word || '').toLowerCase().replace(/^['’]+|['’]+$/g, '');
  if (!w) return [];
  const candidates = [w];

  if (w.endsWith("'s") || w.endsWith('’s')) {
    candidates.push(w.slice(0, -2));
  }
  if (w.endsWith('ies') && w.length > 4) {
    candidates.push(`${w.slice(0, -3)}y`);
  }
  if (w.endsWith('es') && w.length > 3) {
    candidates.push(w.slice(0, -2));
    candidates.push(w.slice(0, -1));
  }
  if (w.endsWith('s') && w.length > 2 && !w.endsWith('ss')) {
    candidates.push(w.slice(0, -1));
  }
  if (w.endsWith('ied') && w.length > 4) {
    candidates.push(`${w.slice(0, -3)}y`);
  }
  if (w.endsWith('ed') && w.length > 3) {
    candidates.push(w.slice(0, -2));
    candidates.push(w.slice(0, -1));
  }
  if (w.endsWith('ing') && w.length > 4) {
    candidates.push(w.slice(0, -3));
    candidates.push(`${w.slice(0, -3)}e`);
  }
  if (w.endsWith('ly') && w.length > 3) {
    candidates.push(w.slice(0, -2));
  }
  if (w.endsWith('er') && w.length > 3) {
    candidates.push(w.slice(0, -2));
    candidates.push(w.slice(0, -1));
  }
  if (w.endsWith('est') && w.length > 4) {
    candidates.push(w.slice(0, -3));
    candidates.push(w.slice(0, -2));
  }

  return Array.from(new Set(candidates)).filter(Boolean);
};

/**
 * Look up a single English word or short multi-word selection in the offline dictionary.
 */
export const lookupOfflineText = (rawText, dict) => {
  const trimmed = String(rawText || '').trim();
  if (!trimmed || !dict) return null;

  const tokens = trimmed.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g);
  if (!tokens || tokens.length === 0) return null;

  if (tokens.length === 1) {
    const token = tokens[0];
    const candidates = getCandidateStems(token);
    for (const stem of candidates) {
      const entry = dict[stem];
      if (entry) {
        return {
          query: token,
          headword: entry.w || stem,
          phonetic: entry.p || '',
          meaning: entry.m,
          found: true,
        };
      }
    }
    return {
      query: token,
      headword: token,
      phonetic: '',
      meaning: '离线词典暂未收录该词',
      found: false,
    };
  }

  // Multi-word selection (up to 6 words)
  const limited = tokens.slice(0, 6);
  const parts = limited.map((tok) => {
    const res = lookupOfflineText(tok, dict);
    return res?.found ? `${tok}: ${res.meaning}` : `${tok}: (未收录)`;
  });
  return {
    query: limited.join(' '),
    headword: limited.join(' '),
    phonetic: '',
    meaning: parts.join(' ｜ '),
    found: parts.some((p) => !p.includes('(未收录)')),
  };
};
