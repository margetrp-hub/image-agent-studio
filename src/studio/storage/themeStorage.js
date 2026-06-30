// Persists the studio light/dark theme preference. Falls back to the OS
// `prefers-color-scheme` hint when nothing is stored, defaulting to dark.
// Reads tolerate the legacy ohlaoo-* key from the pre-rename build.

const THEME_KEY = 'image-sub2api-studio:theme:v1';
const LEGACY_THEME_KEY = 'ohlaoo-studio:theme:v1';

export function loadTheme() {
  try {
    const stored = localStorage.getItem(THEME_KEY) || localStorage.getItem(LEGACY_THEME_KEY);
    if (stored === 'dark' || stored === 'light') return stored;
  } catch {
    // Ignore storage failures and fall back to a stable default.
  }
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches) {
    return 'light';
  }
  return 'dark';
}

export function saveTheme(theme) {
  if (theme !== 'dark' && theme !== 'light') return;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Theme is a UI preference; don't break rendering if storage is unavailable.
  }
}
