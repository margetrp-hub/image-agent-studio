import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Cloud,
  KeyRound,
  Link2,
  LoaderCircle,
  Plus,
  RefreshCw,
  Server,
  Trash2,
  X
} from 'lucide-react';
import './providerSettingsDialog.css';
import { useWorkstationI18n } from '../i18n.jsx';

const providerFamilies = [
  { value: 'openai-compatible', label: 'OpenAI-compatible' },
  { value: 'newapi-compatible', label: 'NewAPI-compatible' },
  { value: 'sub2api-compatible', label: 'Sub2API-compatible' },
  { value: 'xai-compatible', label: 'xAI-compatible' }
];

const emptyForm = {
  providerType: 'openai-compatible',
  label: '',
  baseUrl: '',
  modelBaseUrl: '',
  apiKey: ''
};

function providerName(provider, fallback) {
  return provider.label || provider.name || provider.id || fallback;
}

function providerType(provider) {
  return provider.providerType || provider.family || provider.type || 'openai-compatible';
}

function providerModels(provider, syncedModels) {
  const source = syncedModels || provider.models || provider.availableModels || [];
  return source
    .map((model) => typeof model === 'string' ? { id: model, label: model } : {
      id: model?.id || model?.name || '',
      label: model?.label || model?.name || model?.id || ''
    })
    .filter((model) => model.id);
}

function familyLabel(value) {
  return providerFamilies.find((family) => family.value === value)?.label || value;
}

function providerKey(provider) {
  return `${provider.scope}:${provider.id}`;
}

function IconButton({ label, children, className = '', ...props }) {
  return (
    <button className={`psd-icon-button ${className}`} title={label} type="button" {...props}>
      {children}
      <span className="psd-sr-only">{label}</span>
    </button>
  );
}

/**
 * Controlled provider settings dialog.
 *
 * Callback contracts:
 * - onCreate(input)
 * - onDelete(connectionId)
 * - onSync(providerId, scope), optionally returning { models }
 * - onSelect(providerId, modelId, scope)
 */
export function ProviderSettingsDialog({
  open,
  onClose,
  connections = [],
  sharedProviders = [],
  availableModels = [],
  busy = false,
  error = '',
  onCreate,
  onDelete,
  onSync,
  onSelect,
  selectedProvider = '',
  selectedModel = ''
}) {
  const { t } = useWorkstationI18n();
  const dialogRef = useRef(null);
  const firstFieldRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const [form, setForm] = useState(emptyForm);
  const [pendingAction, setPendingAction] = useState('');
  const [localError, setLocalError] = useState('');
  const isBusy = busy || Boolean(pendingAction);

  const providers = useMemo(() => [
    ...connections.map((provider) => ({ ...provider, scope: 'personal' })),
    ...sharedProviders.map((provider) => ({ ...provider, scope: 'shared' }))
  ], [connections, sharedProviders]);
  const activeProvider = providers.find((provider) => provider.id === selectedProvider) || null;
  const models = activeProvider
    ? providerModels(activeProvider, availableModels)
    : [];

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    firstFieldRef.current?.focus();

    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current?.();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = [...dialogRef.current.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
      )];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function runAction(key, action) {
    setPendingAction(key);
    setLocalError('');
    try {
      return await action();
    } catch (actionError) {
      setLocalError(actionError?.message || t('provider.requestFailed'));
      return null;
    } finally {
      setPendingAction('');
    }
  }

  async function submitConnection(event) {
    event.preventDefault();
    const input = {
      providerType: form.providerType,
      label: form.label.trim(),
      enabled: true,
      baseUrl: form.baseUrl.trim(),
      modelBaseUrl: form.modelBaseUrl.trim(),
      accountMode: 'personal-api-key',
      apiKey: form.apiKey
    };
    const result = await runAction('create', () => onCreate?.(input));
    if (result !== null) setForm(emptyForm);
  }

  async function syncProvider(provider) {
    const key = providerKey(provider);
    await runAction(`sync:${key}`, () => onSync?.(provider.id, provider.scope));
  }

  function selectProvider(provider) {
    const nextModels = provider.id === selectedProvider ? models : providerModels(provider);
    const nextModel = provider.id === selectedProvider && nextModels.some((model) => model.id === selectedModel)
      ? selectedModel
      : nextModels[0]?.id || '';
    onSelect?.(provider.id, nextModel, provider.scope);
  }

  return (
    <div className="psd-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose?.();
    }}>
      <section
        aria-busy={isBusy}
        aria-describedby="provider-settings-description"
        aria-labelledby="provider-settings-title"
        aria-modal="true"
        className="psd-dialog"
        ref={dialogRef}
        role="dialog"
      >
        <header className="psd-header">
          <div>
            <span>{t('provider.connections')}</span>
            <h2 id="provider-settings-title">{t('provider.title')}</h2>
            <p id="provider-settings-description">{t('provider.description')}</p>
          </div>
          <IconButton label={t('provider.close')} onClick={onClose}><X size={18} /></IconButton>
        </header>

        <div className="psd-body">
          <form className="psd-create" onSubmit={submitConnection}>
            <div className="psd-section-heading">
              <div><Plus size={15} /><span>{t('provider.add')}</span></div>
              <small>{t('provider.secretNote')}</small>
            </div>

            <div className="psd-fields">
              <label>
                <span>{t('provider.family')}</span>
                <select
                  disabled={isBusy}
                  onChange={(event) => updateForm('providerType', event.target.value)}
                  ref={firstFieldRef}
                  value={form.providerType}
                >
                  {providerFamilies.map((family) => <option key={family.value} value={family.value}>{family.label}</option>)}
                </select>
              </label>
              <label>
                <span>{t('provider.label')}</span>
                <input disabled={isBusy} onChange={(event) => updateForm('label', event.target.value)} placeholder={t('provider.labelPlaceholder')} required value={form.label} />
              </label>
              <label className="psd-field-wide">
                <span>{t('provider.baseUrl')}</span>
                <div className="psd-input-with-icon"><Link2 size={15} /><input disabled={isBusy} inputMode="url" onChange={(event) => updateForm('baseUrl', event.target.value)} placeholder="https://api.example.com/v1" required type="url" value={form.baseUrl} /></div>
              </label>
              <label>
                <span>{t('provider.modelUrl')} <small>{t('common.optional')}</small></span>
                <input disabled={isBusy} inputMode="url" onChange={(event) => updateForm('modelBaseUrl', event.target.value)} placeholder={t('provider.modelUrlPlaceholder')} type="url" value={form.modelBaseUrl} />
              </label>
              <label>
                <span>{t('provider.apiKey')}</span>
                <div className="psd-input-with-icon"><KeyRound size={15} /><input autoComplete="new-password" disabled={isBusy} onChange={(event) => updateForm('apiKey', event.target.value)} placeholder={t('provider.apiKeyPlaceholder')} required type="password" value={form.apiKey} /></div>
              </label>
            </div>

            <div className="psd-create-footer">
              <span>{t('provider.httpsOnly')}</span>
              <button className="psd-primary-button" disabled={isBusy} type="submit">
                {pendingAction === 'create' ? <LoaderCircle className="psd-spin" size={15} /> : <Plus size={15} />}
                {t('provider.add')}
              </button>
            </div>
          </form>

          {(error || localError) && <p className="psd-error" role="alert">{error || localError}</p>}

          <section className="psd-section" aria-labelledby="personal-connections-title">
            <div className="psd-section-heading">
              <div><Server size={15} /><span id="personal-connections-title">{t('provider.personal')}</span></div>
              <small>{connections.length}</small>
            </div>
            <div className="psd-provider-list">
              {connections.map((connection) => {
                const scopedConnection = { ...connection, scope: 'personal' };
                const selected = connection.id === selectedProvider;
                return (
                  <div className={`psd-provider-row ${selected ? 'is-selected' : ''}`} key={connection.id}>
                    <button aria-pressed={selected} className="psd-provider-main" disabled={isBusy} onClick={() => selectProvider(scopedConnection)} type="button">
                      <span className="psd-provider-icon"><Server size={16} /></span>
                      <span className="psd-provider-copy">
                        <strong>{providerName(connection, t('provider.unnamed'))}</strong>
                        <small>{familyLabel(providerType(connection))} / {connection.apiKeyConfigured || connection.accessTokenConfigured ? t('provider.credentialSaved') : t('provider.credentialRequired')}</small>
                      </span>
                      {selected && <span className="psd-selected-mark"><Check size={13} />{t('common.selected')}</span>}
                    </button>
                    <div className="psd-provider-actions">
                      <IconButton disabled={isBusy} label={t('provider.syncFor', { name: providerName(connection, t('provider.unnamed')) })} onClick={() => syncProvider(scopedConnection)}>
                        <RefreshCw className={pendingAction === `sync:${providerKey(scopedConnection)}` ? 'psd-spin' : ''} size={16} />
                      </IconButton>
                      <IconButton className="is-danger" disabled={isBusy} label={t('provider.delete', { name: providerName(connection, t('provider.unnamed')) })} onClick={() => runAction(`delete:${connection.id}`, () => onDelete?.(connection.id))}>
                        <Trash2 size={16} />
                      </IconButton>
                    </div>
                  </div>
                );
              })}
              {!connections.length && <p className="psd-empty">{t('provider.noPersonal')}</p>}
            </div>
          </section>

          <section className="psd-section" aria-labelledby="shared-providers-title">
            <div className="psd-section-heading">
              <div><Cloud size={15} /><span id="shared-providers-title">{t('provider.shared')}</span></div>
              <small>{sharedProviders.length}</small>
            </div>
            <div className="psd-provider-list">
              {sharedProviders.map((provider) => {
                const scopedProvider = { ...provider, scope: 'shared' };
                const selected = provider.id === selectedProvider;
                return (
                  <div className={`psd-provider-row ${selected ? 'is-selected' : ''}`} key={provider.id}>
                    <button aria-pressed={selected} className="psd-provider-main" disabled={isBusy || provider.enabled === false} onClick={() => selectProvider(scopedProvider)} type="button">
                      <span className="psd-provider-icon"><Cloud size={16} /></span>
                      <span className="psd-provider-copy">
                        <strong>{providerName(provider, t('provider.unnamed'))}</strong>
                        <small>{familyLabel(providerType(provider))} / {provider.enabled === false ? t('common.unavailable') : t('provider.managed')}</small>
                      </span>
                      {selected && <span className="psd-selected-mark"><Check size={13} />{t('common.selected')}</span>}
                    </button>
                    <div className="psd-provider-actions">
                      <IconButton disabled={isBusy || provider.enabled === false} label={t('provider.syncFor', { name: providerName(provider, t('provider.unnamed')) })} onClick={() => syncProvider(scopedProvider)}>
                        <RefreshCw className={pendingAction === `sync:${providerKey(scopedProvider)}` ? 'psd-spin' : ''} size={16} />
                      </IconButton>
                    </div>
                  </div>
                );
              })}
              {!sharedProviders.length && <p className="psd-empty">{t('provider.noShared')}</p>}
            </div>
          </section>

          <section className="psd-model-section" aria-labelledby="model-selection-title">
            <div>
              <span id="model-selection-title">{t('provider.generationModel')}</span>
              <small>{activeProvider ? providerName(activeProvider, t('provider.unnamed')) : t('provider.selectFirst')}</small>
            </div>
            <select
              aria-label={t('provider.generationModel')}
              disabled={isBusy || !activeProvider || !models.length}
              onChange={(event) => onSelect?.(activeProvider.id, event.target.value, activeProvider.scope)}
              value={models.some((model) => model.id === selectedModel) ? selectedModel : models[0]?.id || ''}
            >
              {!models.length && <option value="">{activeProvider ? t('provider.syncContinue') : t('provider.noneSelected')}</option>}
              {models.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}
            </select>
          </section>
        </div>

        <footer className="psd-footer">
          <span>{isBusy ? t('provider.saving') : t('provider.isolated')}</span>
          <button className="psd-secondary-button" onClick={onClose} type="button">{t('common.done')}</button>
        </footer>
      </section>
    </div>
  );
}

export default ProviderSettingsDialog;
