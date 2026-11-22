const STORAGE_KEY = 'app_ai_api_settings';

export const loadApiSettings = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

export const saveApiSettings = (settings) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
};
