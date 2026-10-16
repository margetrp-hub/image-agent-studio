import { useCallback, useEffect, useRef } from 'react';

// Camera movement and typing share one durable write after they settle.
// Bound the delay during long gestures and flush before the page goes away.
export function useSessionAutosave(persist) {
  const persistRef = useRef(persist);
  persistRef.current = persist;
  const pendingRef = useRef(null);
  const idleTimer = useRef(null);
  const maxTimer = useRef(null);

  const cancel = useCallback(() => {
    clearTimeout(idleTimer.current);
    clearTimeout(maxTimer.current);
    idleTimer.current = null;
    maxTimer.current = null;
    pendingRef.current = null;
  }, []);

  const flush = useCallback((publish = true) => {
    const snapshot = pendingRef.current;
    cancel();
    if (snapshot) persistRef.current(snapshot, publish);
  }, [cancel]);

  const schedule = useCallback((snapshot) => {
    pendingRef.current = snapshot;
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(flush, 250);
    if (maxTimer.current === null) maxTimer.current = setTimeout(flush, 1500);
  }, [flush]);

  useEffect(() => {
    const onLeave = () => flush();
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('pagehide', onLeave);
    window.addEventListener('beforeunload', onLeave);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', onLeave);
      window.removeEventListener('beforeunload', onLeave);
      document.removeEventListener('visibilitychange', onVisibility);
      // A departing desk must not publish its snapshot into the next session.
      flush(false);
    };
  }, [flush]);

  return { schedule, cancel };
}
