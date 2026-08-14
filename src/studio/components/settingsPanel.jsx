import { useEffect } from 'react';
import { KeyRound, RefreshCw } from 'lucide-react';
import '../../styles/studio.provider-settings.css';
import '../../styles/studio.provider-settings-responsive.css';
import '../../styles/studio.provider-settings-sync.css';

import { getConfiguredBaseUrls, STUDIO_STANDALONE } from '../../aiGatewayClient';
import { getImageProvider, orderedImageProviders } from '../providers/index.js';
import {
  apiKeyDisplay,
  apiKeyMeta,
  defaultProviderGatewayBaseUrl,
  usesGatewayAccount
} from '../util/providerSettings.js';

const MANUAL_MODEL_OPTION = '__manual_model__';

function normalizedModelOptions(items) {
  return (Array.isArray(items) ? items : [])
    .map((item) => {
      if (typeof item === 'string') return { id: item, label: item };
      const id = String(item?.id || item?.name || item?.model || '').trim();
      return id ? { id, label: String(item?.label || id).trim() || id } : null;
    })
    .filter(Boolean)
    .filter((item, index, list) => list.findIndex((candidate) => candidate.id === item.id) === index);
}

function ModelSettingControl({ value, options, placeholder, onChange, t }) {
  const current = String(value || '');
  const choices = normalizedModelOptions(options);
  const hasChoices = choices.length > 0;
  const currentIsSynced = choices.some((item) => item.id === current);

  if (!hasChoices) {
    return <input value={current} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />;
  }

  return (
    <>
      <select
        value={currentIsSynced ? current : MANUAL_MODEL_OPTION}
        onChange={(event) => onChange(event.target.value === MANUAL_MODEL_OPTION ? '' : event.target.value)}
        aria-label="Model selection"
      >
        {current && !currentIsSynced ? <option value={MANUAL_MODEL_OPTION}>{current}</option> : null}
        {choices.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        <option value={MANUAL_MODEL_OPTION}>{t('settings.modelManualChoice', 'Manual model ID')}</option>
      </select>
      {!currentIsSynced ? (
        <input
          value={current}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          aria-label="Custom model ID"
        />
      ) : null}
    </>
  );
}

export function SettingsPanel({
  open,
  onClose,
  apiKey,
  keys,
  onSelectKey,
  providerSettings,
  onProviderChange,
  modelOptions = { image: [], responses: [], video: [] },
  modelsStatus = 'idle',
  modelSyncError = null,
  onSyncModels,
  isAuthenticated,
  onLogin,
  t
}) {
  useEffect(() => {
    if (!open) return undefined;
    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const gatewayAccountDisabled = providerSettings.apiKeySource === 'manual';
  const currentProvider = getImageProvider(providerSettings.providerId, providerSettings.apiKeySource);
  const providerDescriptor = currentProvider?.descriptor || {};
  const modelSyncLabel = modelsStatus === 'loading'
    ? t('settings.modelsSyncing', '正在从上游同步模型')
    : modelsStatus === 'ready'
      ? t('settings.modelsSynced', '上游模型已同步')
      : modelsStatus === 'fallback'
        ? t('settings.modelsFallback', '未读取到上游模型，暂用默认列表')
        : modelsStatus === 'empty'
          ? t('settings.modelsEmpty', '上游返回了空模型列表')
        : t('settings.modelsIdle', '填写接口和密钥后自动同步模型');
  const modelSyncMeta = t(STUDIO_STANDALONE ? 'settings.studioModelsSyncMeta' : 'settings.modelsSyncMeta', STUDIO_STANDALONE
    ? '图片 {image} · 提示词 {responses}'
    : '图片 {image} · 对话 {responses} · 视频 {video}', {
    image: modelOptions.image?.length || 0,
    responses: modelOptions.responses?.length || 0,
    video: modelOptions.video?.length || 0
  });
  const modelSyncErrorLabel = modelSyncError
    ? t(`settings.modelSyncErrors.${modelSyncError.code || 'unknown'}`, t('settings.modelSyncErrors.unknown', '模型同步失败'))
    : '';
  const modelSyncErrorDetails = modelSyncError
    ? [
      modelSyncError.status ? `HTTP ${modelSyncError.status}` : '',
      modelSyncError.endpoint || '',
      modelSyncError.message || ''
    ].filter(Boolean).join(' · ')
    : '';
  const providerChoices = orderedImageProviders()
    .filter((provider) => !STUDIO_STANDALONE || provider.authMode === 'manual')
    .filter(Boolean)
    .map((provider) => ({
      ...provider,
      active: provider.id === currentProvider?.id,
      nextApiKeySource: provider.authMode
    }));
  const baseUrlPlaceholder = providerDescriptor.baseUrlExample || defaultProviderGatewayBaseUrl(providerSettings);

  return (
    <div className="settingsOverlay" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="settingsDialog">
        <div className="settingsTitle">
          <h2>{STUDIO_STANDALONE ? t('settings.serviceTitle', '生成服务') : t('settings.title', '连接')}</h2>
          <button type="button" className="iconButton" onClick={onClose} aria-label={t('settings.close', '关闭')}>×</button>
        </div>

        <div className="settingsGroup providerSettingsGroup">
          <label className="settingsSelectField">
            <small>{STUDIO_STANDALONE ? t('settings.serviceTitle', '生成服务') : t('settings.providerFamily', '接口类型')}</small>
            <select
              value={currentProvider?.id || providerSettings.providerId}
              onChange={(event) => {
                const nextProvider = providerChoices.find((provider) => provider.id === event.target.value) || providerChoices[0];
                onProviderChange({
                  ...providerSettings,
                  apiKeySource: nextProvider.nextApiKeySource,
                  providerId: nextProvider.id
                });
              }}
            >
              {providerChoices.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.id === 'gateway-account'
                    ? t('settings.studioManagedProvider', '服务端托管')
                    : provider.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="providerSummary">
          <span>{STUDIO_STANDALONE ? t('settings.serviceTitle', '生成服务') : t('settings.provider', 'Provider')}</span>
          <strong>{providerSettings.apiKeySource !== 'manual'
            ? t('settings.studioManagedProvider', '服务端托管')
            : (currentProvider?.label || providerSettings.providerId || 'Custom API')}</strong>
          <em>{providerSettings.apiKeySource !== 'manual'
            ? t('settings.serverManagedCredentials', 'Credentials are managed by the server')
            : t('settings.providerManual', '手动密钥')}</em>
        </div>

        {providerSettings.apiKeySource !== 'manual' && STUDIO_STANDALONE ? (
          <div className="settingsEmpty">{t('settings.noBrowserSecrets', 'No provider key or gateway URL is stored in this browser.')}</div>
        ) : usesGatewayAccount(providerSettings) ? (
          <div className="keyList">
            {isAuthenticated ? keys.map((item) => (
              <button type="button" className={item.id === apiKey?.id ? 'active' : ''} key={item.id} onClick={() => onSelectKey(item)}>
                <KeyRound size={16} />
                <span>{item.name}</span>
                <em>{apiKeyDisplay(item)} · {apiKeyMeta(item)}</em>
              </button>
            )) : (
              <button type="button" className="loginInlineButton" onClick={onLogin}>
                <KeyRound size={16} />
                {t('settings.login', '登录')}
              </button>
            )}
            {isAuthenticated && !keys.length ? (
              <div className="settingsEmpty">{t('settings.noKey', '暂无可用 Key')}</div>
            ) : null}
          </div>
        ) : (
          <div className="manualFields">
            <label>
              <span>{t('settings.gateway', '接口地址')}</span>
              <input
                value={providerSettings.manualGatewayBaseUrl}
                onChange={(event) => onProviderChange({ ...providerSettings, manualGatewayBaseUrl: event.target.value })}
                placeholder={baseUrlPlaceholder}
              />
            </label>
            <label>
              <span>{t('settings.key', '密钥')}</span>
              <input
                type="password"
                value={providerSettings.manualApiKey}
                onChange={(event) => onProviderChange({ ...providerSettings, manualApiKey: event.target.value })}
                placeholder="sk-..."
              />
            </label>
          </div>
        )}

        <div className="manualFields">
          {(!STUDIO_STANDALONE || providerSettings.apiKeySource === 'manual') ? <div className="settingsCallConfig">
            <div className="settingsCallConfigHead">
              <strong>{t('settings.modelCallSettings', '模型')}</strong>
            </div>
            <div className="settingsCallGrid">
              <label>
                <span>{t('settings.imageGenerationModel', '生图模型')}</span>
                <ModelSettingControl value={providerSettings.imageGenerationModel} options={modelOptions.image} onChange={(value) => onProviderChange({ ...providerSettings, imageGenerationModel: value })} placeholder="gpt-image-2 / nano-banana" t={t} />
              </label>
              <label>
                <span>{t('settings.imageEditModel', '编辑 / Mask 模型')}</span>
                <ModelSettingControl value={providerSettings.imageEditModel} options={modelOptions.image} onChange={(value) => onProviderChange({ ...providerSettings, imageEditModel: value })} placeholder={providerSettings.imageGenerationModel || 'gpt-image-2'} t={t} />
              </label>
              <label>
                <span>{t('settings.videoModel', '视频模型')}</span>
                <ModelSettingControl value={providerSettings.videoModel} options={modelOptions.video} onChange={(value) => onProviderChange({ ...providerSettings, videoModel: value })} placeholder="veo3 / grok-imagine-video / runway" t={t} />
              </label>
              <label>
                <span>{t('settings.videoGateway', '视频接口 URL')}</span>
                <input value={providerSettings.videoGatewayBaseUrl || ''} onChange={(event) => onProviderChange({ ...providerSettings, videoGatewayBaseUrl: event.target.value })} placeholder={providerSettings.manualGatewayBaseUrl || getConfiguredBaseUrls().gatewayBaseUrl} />
              </label>
            </div>
          </div> : null}
          <div className={`settingsModelSync ${modelsStatus}`}>
            <div className="settingsModelSyncText">
              <span>{modelSyncLabel}</span>
              <em>{modelSyncMeta}</em>
              {modelSyncError ? <small className="settingsModelSyncError" title={modelSyncErrorDetails}>
                {modelSyncErrorLabel} · {modelSyncErrorDetails}
              </small> : null}
            </div>
            {onSyncModels ? (
              <button
                type="button"
                className="settingsModelSyncButton"
                onClick={() => onSyncModels()}
                disabled={modelsStatus === 'loading'}
                aria-label={t('settings.modelsSyncNowAria', '同步模型')}
              >
                <RefreshCw size={14} />
                <span>{t('settings.modelsSyncNow', '同步')}</span>
              </button>
            ) : null}
          </div>
          {(!STUDIO_STANDALONE || providerSettings.apiKeySource === 'manual') ? <label>
            <span>{t('settings.assistantModel', '助手模型')}</span>
            <ModelSettingControl value={providerSettings.responsesModel} options={modelOptions.responses} onChange={(value) => onProviderChange({ ...providerSettings, responsesModel: value })} placeholder="gpt-5.5" t={t} />
          </label> : null}
          {(!STUDIO_STANDALONE || providerSettings.apiKeySource === 'manual') ? <label>
            <span>{t('settings.previewFrames', '预览帧')}</span>
            <input
              type="number"
              min="0"
              max="3"
              value={providerSettings.partialImages}
              onChange={(event) => onProviderChange({ ...providerSettings, partialImages: event.target.value })}
            />
          </label> : null}
        </div>

        <div className="settingsActions">
          {!STUDIO_STANDALONE ? <button type="button" onClick={() => onProviderChange({
            ...providerSettings,
            manualApiKey: '',
            manualGatewayBaseUrl: '',
            apiKeySource: gatewayAccountDisabled ? 'manual' : 'gateway',
            providerId: gatewayAccountDisabled ? 'openai-compatible' : 'gateway-account'
          })}>
            {t('settings.clear', '清除')}
          </button> : null}
          <button type="button" className="primaryAction" onClick={onClose}>{t('settings.done', '完成')}</button>
        </div>
      </section>
    </div>
  );
}
