import { useCallback, useEffect, useState } from 'react';

const EMPTY = { creditsEnabled: false, providers: [] };

export function usePlatformCatalog(client, enabled, refreshKey) {
  const [catalog, setCatalog] = useState(EMPTY);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((current) => current + 1), []);
  useEffect(() => {
    if (!enabled) {
      setCatalog(EMPTY);
      setStatus('idle');
      return undefined;
    }
    const controller = new AbortController();
    setStatus('loading');
    setError(false);
    client.listPlatformModels({ signal: controller.signal }).then((result) => {
      if (controller.signal.aborted) return;
      setCatalog({ creditsEnabled: result.creditsEnabled === true, providers: result.creditsEnabled === true && Array.isArray(result.providers) ? result.providers : [] });
      setStatus('ready');
    }).catch(() => {
      if (controller.signal.aborted) return;
      setCatalog(EMPTY);
      setError(true);
      setStatus('error');
    });
    return () => controller.abort();
  }, [client, enabled, refreshKey, revision]);
  return { catalog, status, error, refresh };
}
