import { useEffect, useRef, useState } from 'react';
import { AiGatewayClient, clearSession, getLoginUrl, loadSession, STUDIO_STANDALONE } from '../aiGatewayClient.js';
import { DEFAULT_SETTINGS, getErrorMessage } from './adminShared.js';

const INITIAL_DATA = { stats: {}, users: [], codes: [], update: {}, system: null };

export function useAdminData() {
  const [client] = useState(() => new AiGatewayClient({ session: loadSession() }));
  const [user, setUser] = useState(null);
  const [data, setData] = useState(INITIAL_DATA);
  const [settings, setSettings] = useState({ saved: DEFAULT_SETTINGS, draft: DEFAULT_SETTINGS });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [resourceErrors, setResourceErrors] = useState({});
  const mounted = useRef(true);
  const busy = useRef(false);
  const refreshId = useRef(0);

  function mergeSettings(next) {
    setSettings((current) => {
      const saved = { ...DEFAULT_SETTINGS, ...next };
      const draft = { ...saved };
      for (const key of Object.keys(current.draft)) {
        if (current.draft[key] !== current.saved[key]) draft[key] = current.draft[key];
      }
      return { saved, draft };
    });
  }

  async function refresh() {
    const id = ++refreshId.current;
    setLoading(true);
    const requests = {
      stats: () => client.getAdminBillingStats(),
      settings: () => client.getAdminBillingSettings(),
      users: () => client.listAdminUsers(),
      codes: () => client.listAdminCreditCodes(),
      update: () => client.getAdminUpdateStatus(),
      system: async () => (await client.request('/auth/admin/system')).system
    };
    const entries = Object.entries(requests);
    const results = await Promise.allSettled(entries.map(([, request]) => request()));
    if (!mounted.current || refreshId.current !== id) return;
    const next = {};
    const errors = {};
    results.forEach((result, index) => {
      const key = entries[index][0];
      if (result.status === 'fulfilled') {
        if (key === 'settings') mergeSettings(result.value);
        else next[key] = result.value;
      } else errors[key] = getErrorMessage(result.reason);
    });
    setData((current) => ({ ...current, ...next }));
    setResourceErrors(errors);
    setLoading(false);
  }

  useEffect(() => {
    mounted.current = true;
    if (!STUDIO_STANDALONE) { window.location.replace('./studio.html'); return; }
    if (!loadSession()?.accessToken) { window.location.replace(getLoginUrl()); return; }
    client.me().then(async (nextUser) => {
      if (!mounted.current) return;
      if (nextUser?.role !== 'admin') {
        setError('当前账号没有管理员权限，请返回工作台。');
        setLoading(false);
        return;
      }
      setUser(nextUser);
      await refresh();
    }).catch((loadError) => {
      if (!mounted.current) return;
      if (loadError?.status === 401) { clearSession(); window.location.replace(getLoginUrl()); }
      else { setError(getErrorMessage(loadError)); setLoading(false); }
    });
    return () => { mounted.current = false; };
  }, [client]);

  function changeSetting(key, value) {
    setStatus('');
    setSettings((current) => ({ ...current, draft: { ...current.draft, [key]: value } }));
  }

  function discardSettings(keys) {
    setSettings((current) => ({ ...current, draft: { ...current.draft, ...Object.fromEntries(keys.map((key) => [key, current.saved[key]])) } }));
  }

  async function saveSettings(keys) {
    if (busy.current) return;
    busy.current = true;
    setSaving(true); setError(''); setStatus('');
    const patch = Object.fromEntries(keys.filter((key) => settings.draft[key] !== settings.saved[key]).map((key) => [key, settings.draft[key]]));
    try {
      const result = await client.updateAdminBillingSettings(patch);
      if (!mounted.current) return;
      setSettings((current) => {
        const saved = { ...DEFAULT_SETTINGS, ...result };
        const draft = { ...saved };
        for (const key of Object.keys(current.draft)) {
          if (key in patch ? current.draft[key] !== patch[key] : current.draft[key] !== current.saved[key]) draft[key] = current.draft[key];
        }
        return { saved, draft };
      });
      setStatus('设置已保存。');
    } catch (saveError) { setError(getErrorMessage(saveError)); }
    finally { busy.current = false; if (mounted.current) setSaving(false); }
  }

  async function mutate(action, message, { refreshData = true } = {}) {
    if (busy.current) return;
    busy.current = true;
    setSaving(true); setError(''); setStatus('');
    try {
      const result = await action();
      if (refreshData) await refresh();
      if (mounted.current) setStatus(message);
      return result;
    } catch (mutationError) {
      if (mounted.current) setError(getErrorMessage(mutationError));
      throw mutationError;
    } finally { busy.current = false; if (mounted.current) setSaving(false); }
  }

  const dirty = Object.keys(settings.draft).some((key) => settings.saved[key] !== settings.draft[key]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  return { client, user, data, setData, settings, dirty, loading, saving, error, setError, status, setStatus,
    resourceErrors, refresh, changeSetting, discardSettings, saveSettings, mutate };
}
