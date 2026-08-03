import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWorkstationI18n } from '../i18n.jsx';
import { modelsForMode } from './modelCapabilities.js';

const activeStatuses = new Set(['queued', 'dispatching', 'gateway', 'upstream', 'image', 'video', 'saving']);

function normalizeModels(payload) {
  return (payload?.models || [])
    .map((model) => typeof model === 'string' ? { id: model, label: model } : {
      ...model,
      id: model?.id || model?.name || '',
      label: model?.label || model?.name || model?.id || ''
    })
    .filter((model) => model.id);
}

function nextJobId() {
  const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `job_${id}`;
}

export function useGenerationWorkspace({ api, authState, mode = 'single' }) {
  const { t } = useWorkstationI18n();
  const [connections, setConnections] = useState([]);
  const [sharedProviders, setSharedProviders] = useState([]);
  const [modelsByProvider, setModelsByProvider] = useState({});
  const [selectedProviderId, setSelectedProviderId] = useState('');
  const [selectedModels, setSelectedModels] = useState({ image: '', video: '' });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [providerBusy, setProviderBusy] = useState(false);
  const [providerError, setProviderError] = useState('');
  const [generationBusy, setGenerationBusy] = useState(false);
  const [generationError, setGenerationError] = useState('');
  const [job, setJob] = useState(null);
  const [resultImages, setResultImages] = useState([]);
  const providerEpochRef = useRef(0);

  const providers = useMemo(() => [
    ...connections.map((provider) => ({ ...provider, scope: 'personal' })),
    ...sharedProviders.map((provider) => ({ ...provider, scope: 'shared' }))
  ], [connections, sharedProviders]);
  const selectedProvider = providers.find((provider) => provider.id === selectedProviderId) || null;
  const mediaMode = mode === 'video' ? 'video' : 'image';
  const providerModels = selectedProvider ? modelsByProvider[selectedProvider.id] || [] : [];
  const models = useMemo(() => modelsForMode(providerModels, mediaMode), [mediaMode, providerModels]);
  const selectedModel = selectedModels[mediaMode] || '';

  const setSelectedModel = useCallback((value) => {
    setSelectedModels((current) => ({
      ...current,
      [mediaMode]: typeof value === 'function' ? value(current[mediaMode] || '') : value
    }));
  }, [mediaMode]);

  const syncProvider = useCallback(async (providerId, requestedScope = '') => {
    const provider = providers.find((item) => item.id === providerId);
    const scope = requestedScope || provider?.scope;
    if (!providerId || !scope) return { models: [] };
    const epoch = providerEpochRef.current;
    setProviderBusy(true);
    setProviderError('');
    try {
      const payload = scope === 'shared'
        ? await api.syncSharedProviderModels(providerId)
        : await api.syncProviderConnectionModels(providerId);
      const syncedModels = normalizeModels(payload);
      if (epoch !== providerEpochRef.current) return { ...payload, models: syncedModels };
      setModelsByProvider((current) => ({ ...current, [providerId]: syncedModels }));
      if (providerId === selectedProviderId || !selectedProviderId) {
        setSelectedProviderId(providerId);
        const compatible = modelsForMode(syncedModels, mediaMode);
        setSelectedModel((current) => compatible.some((model) => model.id === current) ? current : compatible[0]?.id || '');
      }
      return { ...payload, models: syncedModels };
    } catch (error) {
      if (epoch === providerEpochRef.current) setProviderError(error.message);
      throw error;
    } finally {
      if (epoch === providerEpochRef.current) setProviderBusy(false);
    }
  }, [api, mediaMode, providers, selectedProviderId, setSelectedModel]);

  const loadProviders = useCallback(async () => {
    const epoch = providerEpochRef.current;
    setProviderBusy(true);
    setProviderError('');
    try {
      const [connectionPayload, sharedPayload] = await Promise.all([
        api.listProviderConnections(),
        api.listSharedProviders()
      ]);
      const nextConnections = connectionPayload.connections || [];
      const nextShared = sharedPayload.providers || [];
      if (epoch !== providerEpochRef.current) return;
      setConnections(nextConnections);
      setSharedProviders(nextShared);
      const available = [
        ...nextConnections.map((provider) => ({ ...provider, scope: 'personal' })),
        ...nextShared.map((provider) => ({ ...provider, scope: 'shared' }))
      ];
      setSelectedProviderId((current) => {
        const nextProvider = available.find((provider) => provider.id === current) || available[0] || null;
        if (!nextProvider) setSelectedModels({ image: '', video: '' });
        return nextProvider?.id || '';
      });
    } catch (error) {
      if (epoch === providerEpochRef.current) setProviderError(error.message);
    } finally {
      if (epoch === providerEpochRef.current) setProviderBusy(false);
    }
  }, [api]);

  useEffect(() => {
    providerEpochRef.current += 1;
  }, [authState]);

  useEffect(() => {
    if (authState !== 'authenticated') return;
    loadProviders();
  }, [authState, loadProviders]);

  useEffect(() => {
    if (!selectedProvider || modelsByProvider[selectedProvider.id]) return;
    syncProvider(selectedProvider.id, selectedProvider.scope).catch(() => {});
  }, [modelsByProvider, selectedProvider, syncProvider]);

  useEffect(() => {
    setSelectedModel((current) => models.some((model) => model.id === current) ? current : models[0]?.id || '');
  }, [models, setSelectedModel]);

  useEffect(() => {
    if (!job?.id || !activeStatuses.has(job.status) || authState !== 'authenticated') return undefined;
    const controller = new AbortController();
    const jobId = job.id;
    let disposed = false;
    let lastEvent = 0;

    async function followJob() {
      for (let attempt = 0; attempt < 3 && !disposed; attempt += 1) {
        let terminal = false;
        try {
          await api.streamJobEvents(jobId, {
            after: lastEvent,
            signal: controller.signal,
            onEvent: (event) => {
              const sequence = Number(event.id);
              if (Number.isFinite(sequence)) lastEvent = Math.max(lastEvent, sequence);
              const nextJob = event.type === 'snapshot' ? event.data : event.data?.data;
              if (nextJob?.id !== jobId) return;
              setGenerationError('');
              setJob((current) => current?.id === jobId ? nextJob : current);
              if (!activeStatuses.has(nextJob.status)) {
                terminal = true;
                controller.abort();
              }
            }
          });
        } catch (error) {
          if (disposed || terminal || error.name === 'AbortError') return;
        }
        if (disposed || terminal) return;

        try {
          const payload = await api.getJob(jobId);
          const currentJob = payload.job;
          if (currentJob?.id === jobId) {
            setJob((current) => current?.id === jobId ? currentJob : current);
            if (!activeStatuses.has(currentJob.status)) return;
          }
        } catch {
          // The bounded reconnect below remains the recovery path.
        }
        if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 500 * (2 ** attempt)));
      }
      if (!disposed) setGenerationError(t('generation.connectionInterrupted'));
    }

    followJob();
    return () => {
      disposed = true;
      controller.abort();
    };
  }, [api, authState, job?.id, t]);

  useEffect(() => {
    let disposed = false;
    const objectUrls = [];
    async function loadResults() {
      if (job?.status !== 'completed' || !job.resultUrls?.length) {
        setResultImages([]);
        return;
      }
      const images = await Promise.all(job.resultUrls.map(async (url, index) => {
        const video = job.mode === 'video';
        if (/^https?:\/\//i.test(url)) return { url, objectUrl: url, filename: `generated-${index + 1}.${video ? 'mp4' : 'png'}`, mediaType: video ? 'video/mp4' : 'image/png' };
        const blob = await api.readAsset(url);
        const objectUrl = URL.createObjectURL(blob);
        objectUrls.push(objectUrl);
        return { url, objectUrl, filename: `generated-${index + 1}.${blob.type.split('/')[1] || (video ? 'mp4' : 'png')}`, mediaType: blob.type || (video ? 'video/mp4' : 'image/png') };
      }));
      if (disposed) {
        objectUrls.forEach((url) => URL.revokeObjectURL(url));
        return;
      }
      setResultImages(images);
    }
    loadResults().catch((error) => !disposed && setGenerationError(t('generation.previewFailed', { message: error.message })));
    return () => {
      disposed = true;
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [api, job?.id, job?.status, JSON.stringify(job?.resultUrls || []), t]);

  async function createConnection(input) {
    const epoch = providerEpochRef.current;
    setProviderBusy(true);
    setProviderError('');
    try {
      const payload = await api.createProviderConnection(input);
      const connection = payload.connection;
      if (epoch !== providerEpochRef.current) return payload;
      setConnections((current) => [connection, ...current]);
      setSelectedProviderId(connection.id);
      setSelectedModels({ image: '', video: '' });
      return payload;
    } catch (error) {
      if (epoch === providerEpochRef.current) setProviderError(error.message);
      throw error;
    } finally {
      if (epoch === providerEpochRef.current) setProviderBusy(false);
    }
  }

  async function deleteConnection(connectionId) {
    const epoch = providerEpochRef.current;
    setProviderBusy(true);
    setProviderError('');
    try {
      const payload = await api.deleteProviderConnection(connectionId);
      if (epoch !== providerEpochRef.current) return payload;
      setConnections((current) => current.filter((connection) => connection.id !== connectionId));
      setModelsByProvider((current) => {
        const next = { ...current };
        delete next[connectionId];
        return next;
      });
      if (selectedProviderId === connectionId) {
        setSelectedProviderId('');
        setSelectedModels({ image: '', video: '' });
      }
      return payload;
    } catch (error) {
      if (epoch === providerEpochRef.current) setProviderError(error.message);
      throw error;
    } finally {
      if (epoch === providerEpochRef.current) setProviderBusy(false);
    }
  }

  function selectProvider(providerId, modelId = '') {
    setSelectedProviderId(providerId);
    const availableModels = modelsForMode(modelsByProvider[providerId] || [], mediaMode);
    setSelectedModel(availableModels.some((model) => model.id === modelId) ? modelId : availableModels[0]?.id || modelId);
  }

  function requestGeneration() {
    setGenerationError('');
    if (!selectedProvider) {
      setProviderError(t('generation.needProvider'));
      setSettingsOpen(true);
      return;
    }
    if (!selectedModel) {
      setProviderError(t('generation.needModel'));
      setSettingsOpen(true);
      return;
    }
    setConfirmationOpen(true);
  }

  async function confirmGeneration({ projectId, prompt, mode = 'single', options }) {
    setGenerationBusy(true);
    setGenerationError('');
    try {
      const id = nextJobId();
      const video = mode === 'video';
      const request = {
        id,
        sessionId: projectId,
        mode: video ? 'video' : 'image',
        route: video ? 'video' : 'generations',
        providerId: selectedProvider.id,
        model: options.model || selectedModel,
        prompt,
        generationPrompt: prompt,
        ...(video ? {
          aspectRatio: options.aspectRatio,
          duration: options.duration,
          fps: options.fps,
          height: options.height,
          motion: options.motion,
          videoQuality: options.videoQuality,
          videoStyle: options.videoStyle,
          width: options.width
        } : {
          size: options.size,
          quality: options.quality,
          count: options.count,
          n: options.count
        })
      };
      const created = await api.createGenerationJob({ request });
      setJob(created.job);
      setConfirmationOpen(false);
      const executed = await api.executeJob(created.job.id);
      setJob(executed.job);
      return executed.job;
    } catch (error) {
      setGenerationError(error.message);
      throw error;
    } finally {
      setGenerationBusy(false);
    }
  }

  async function cancelGeneration() {
    if (!job?.id) return;
    try {
      const payload = await api.cancelJob(job.id);
      setJob(payload.job);
    } catch (error) {
      setGenerationError(error.message);
    }
  }

  function reset() {
    providerEpochRef.current += 1;
    setConnections([]);
    setSharedProviders([]);
    setModelsByProvider({});
    setSelectedProviderId('');
    setSelectedModels({ image: '', video: '' });
    setJob(null);
    setResultImages([]);
    setProviderError('');
    setGenerationError('');
  }

  return {
    cancelGeneration,
    confirmationOpen,
    confirmGeneration,
    connections,
    createConnection,
    deleteConnection,
    dismissGeneration: () => { setJob(null); setGenerationError(''); },
    generationBusy,
    generationError,
    job,
    models,
    providerBusy,
    providerError,
    requestGeneration,
    reset,
    resultImages,
    selectedModel,
    selectedProvider,
    selectedProviderId,
    selectProvider,
    setConfirmationOpen,
    setJob,
    setSettingsOpen,
    settingsOpen,
    sharedProviders,
    syncProvider
  };
}
