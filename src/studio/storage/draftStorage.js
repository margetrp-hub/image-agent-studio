// Persists the current image-generation form draft (prompt + parameters) to
// localStorage so a refresh or accidental tab close doesn't lose what the user
// was typing. Reads still fall back to the legacy ohlaoo-* key for users
// upgrading from the pre-rename build.

const DRAFT_KEY = 'image-sub2api-studio:draft:v1';
const LEGACY_DRAFT_KEY = 'ohlaoo-studio:draft:v1';

export function loadDraft() {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_KEY) || localStorage.getItem(LEGACY_DRAFT_KEY) || 'null');
  } catch {
    return null;
  }
}

export function saveDraft(draft) {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

export function clearDraft() {
  localStorage.removeItem(DRAFT_KEY);
}
