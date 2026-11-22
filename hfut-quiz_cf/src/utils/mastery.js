export const DEFAULT_MASTER_THRESHOLD = 2;
export const MIN_MASTER_THRESHOLD = 1;
export const MAX_MASTER_THRESHOLD = 99;
const MASTER_THRESHOLD_KEY = 'app_masterThreshold';
const AUTO_MASTER_NOTICE_KEY = 'app_autoMasterNotified';
const AUTO_UNMASTER_NOTICE_KEY = 'app_autoUnmasterNotified';

export function hasSeenAutoMasterNotice() {
  try {
    return localStorage.getItem(AUTO_MASTER_NOTICE_KEY) === '1';
  } catch {
    return false;
  }
}

export function markAutoMasterNoticeSeen() {
  try {
    localStorage.setItem(AUTO_MASTER_NOTICE_KEY, '1');
  } catch {
    // ignore storage errors
  }
}

export function clearAutoMasterNoticeSeen() {
  try {
    localStorage.removeItem(AUTO_MASTER_NOTICE_KEY);
  } catch {
    // ignore storage errors
  }
}

export function hasSeenAutoUnmasterNotice() {
  try {
    return localStorage.getItem(AUTO_UNMASTER_NOTICE_KEY) === '1';
  } catch {
    return false;
  }
}

export function markAutoUnmasterNoticeSeen() {
  try {
    localStorage.setItem(AUTO_UNMASTER_NOTICE_KEY, '1');
  } catch {
    // ignore storage errors
  }
}

export function clearAutoUnmasterNoticeSeen() {
  try {
    localStorage.removeItem(AUTO_UNMASTER_NOTICE_KEY);
  } catch {
    // ignore storage errors
  }
}

export function clampMasterThreshold(value) {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10);
  if (!Number.isFinite(parsed) || parsed < MIN_MASTER_THRESHOLD) {
    return DEFAULT_MASTER_THRESHOLD;
  }
  return Math.min(MAX_MASTER_THRESHOLD, parsed);
}

export function loadMasterThreshold() {
  try {
    const raw = localStorage.getItem(MASTER_THRESHOLD_KEY);
    if (raw === null || raw === '') return DEFAULT_MASTER_THRESHOLD;
    return clampMasterThreshold(raw);
  } catch {
    return DEFAULT_MASTER_THRESHOLD;
  }
}

export function saveMasterThreshold(value) {
  const clamped = clampMasterThreshold(value);
  try {
    localStorage.setItem(MASTER_THRESHOLD_KEY, String(clamped));
  } catch {
    // ignore storage errors
  }
  return clamped;
}

export function normalizeCorrectStreaks(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const result = {};
  for (const [key, val] of Object.entries(raw)) {
    if (!key) continue;
    const num = Number.parseInt(String(val), 10);
    if (Number.isFinite(num) && num > 0) {
      result[key] = num;
    }
  }
  return result;
}
