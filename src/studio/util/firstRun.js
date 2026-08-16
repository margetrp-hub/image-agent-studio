const FIRST_RUN_STATE_KEY = 'image-sub2api-studio:first-run:v1';

export function loadFirstRunState() {
  try {
    return localStorage.getItem(FIRST_RUN_STATE_KEY) || '';
  } catch {
    return '';
  }
}

export function saveFirstRunState(state) {
  try {
    localStorage.setItem(FIRST_RUN_STATE_KEY, String(state || ''));
  } catch {
    // First-run state is optional; the workspace remains usable without storage.
  }
}

export function shouldOpenFirstRun({ authenticated = false, connectionReady = false } = {}) {
  if (!authenticated || connectionReady) return false;
  return !['completed', 'dismissed'].includes(loadFirstRunState());
}
