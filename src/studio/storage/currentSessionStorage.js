// Persists the "currently open canvas" session — prompt, results, queue,
// canvas nodes — so a refresh restores what the user was working on. Stored
// at a scoped `:<sessionId>` key whenever a session id exists. The unscoped
// key is reserved for anonymous/local drafts only, so authenticated sessions
// and separate desk sessions do not accidentally pick up each other's canvas.
//
// Implemented as a factory because the normalize/prepare helpers come from
// `createCurrentSessionSerializers`, which is configured at runtime with the
// current model lists and option normalizers — we can't import them as
// statics here.

export function createCurrentSessionStorage({
  storageKey,
  normalizeCachedCurrentSession,
  prepareCurrentSessionForServer
}) {
  const activeSessionKey = `${storageKey}:active`;

  function scopedCurrentSessionKey(sessionId) {
    return sessionId ? `${storageKey}:${sessionId}` : storageKey;
  }

  function loadCurrentSession(expectedSessionId = '') {
    try {
      const activeSessionId = expectedSessionId ? '' : localStorage.getItem(activeSessionKey);
      const raw = expectedSessionId
        ? localStorage.getItem(scopedCurrentSessionKey(expectedSessionId)) || localStorage.getItem(storageKey)
        : (activeSessionId ? localStorage.getItem(scopedCurrentSessionKey(activeSessionId)) : '') || localStorage.getItem(storageKey);
      const session = JSON.parse(raw || 'null');
      if (!session || typeof session !== 'object') return null;
      const normalized = normalizeCachedCurrentSession(session);
      if (expectedSessionId && normalized?.sessionId !== expectedSessionId) return null;
      if (activeSessionId && normalized?.sessionId !== activeSessionId) return null;
      return normalized;
    } catch {
      return null;
    }
  }

  function loadActiveCurrentSession() {
    try {
      const activeSessionId = localStorage.getItem(activeSessionKey);
      if (!activeSessionId) return null;
      return loadCurrentSession(activeSessionId);
    } catch {
      return null;
    }
  }

  function saveCurrentSession(session) {
    const createdAt = session?.createdAt || new Date().toISOString();
    const nextSession = {
      ...(normalizeCachedCurrentSession(session) || session),
      createdAt,
      updatedAt: new Date().toISOString()
    };
    try {
      if (nextSession.sessionId) {
        localStorage.setItem(scopedCurrentSessionKey(nextSession.sessionId), JSON.stringify(nextSession));
        localStorage.setItem(activeSessionKey, nextSession.sessionId);
      } else {
        localStorage.setItem(storageKey, JSON.stringify(nextSession));
        localStorage.removeItem(activeSessionKey);
      }
    } catch {
      // The active canvas is a convenience cache; generation/history still work if storage is full.
    }
    return nextSession;
  }

  function clearCurrentSessionCache(sessionId = '') {
    try {
      if (sessionId) localStorage.removeItem(scopedCurrentSessionKey(sessionId));
      localStorage.removeItem(storageKey);
      if (!sessionId || localStorage.getItem(activeSessionKey) === sessionId) {
        localStorage.removeItem(activeSessionKey);
      }
    } catch {
      // A new canvas should still open even if browser storage is unavailable.
    }
  }

  // Stable, comparable encoding of the server-relevant slice of a session.
  // Used to dedupe the `onSessionSnapshot` callback so we don't spam the
  // remote sync with unchanged payloads.
  function sessionSnapshotComparePayload(session) {
    const payload = prepareCurrentSessionForServer(session);
    return payload ? JSON.stringify(payload) : '';
  }

  return {
    scopedCurrentSessionKey,
    loadCurrentSession,
    loadActiveCurrentSession,
    saveCurrentSession,
    clearCurrentSessionCache,
    sessionSnapshotComparePayload
  };
}
