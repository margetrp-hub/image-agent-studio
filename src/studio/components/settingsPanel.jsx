import { useEffect } from 'react';
import { KeyRound } from 'lucide-react';
import '../../styles/studio.provider-settings.css';

import { getConfiguredBaseUrls } from '../../aiGatewayClient';
import { IMAGE_PROVIDER_REGISTRY, getImageProvider } from '../providers/index.js';
import {
  apiKeyDisplay,
  apiKeyMeta,
  defaultProviderGatewayBaseUrl,
  usesGatewayAccount
} from '../util/providerSettings.js';

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
  const providerCapabilityText = [
    currentProvider?.capabilities?.textToImage ? t('settings.capTextToImage', '生图') : '',
    currentProvider?.capabilities?.imageEdit ? t('settings.capEdit', '编辑') : '',
    currentProvider?.capabilities?.mask ? 'Mask' : '',
    currentProvider?.capabilities?.modelSync ? t('settings.capModelSync', '模型同步') : ''
  ].filter(Boolean).join(' · ');
  const modelSyncLabel = modelsStatus === 'loading'
    ? t('settings.modelsSyncing', '正在从上游同步模型')
    : modelsStatus === 'ready'
      ? t('settings.modelsSynced', '上游模型已同步')
      : modelsStatus === 'fallback'
        ? t('settings.modelsFallback', '未读取到上游模型，暂用默认列表')
        : t('settings.modelsIdle', '填写接口和密钥后自动同步模型');
  const modelSyncMeta = t('settings.modelsSyncMeta', '图片 {image} · 对话 {responses} · 视频 {video}', {
    image: modelOptions.image?.length || 0,
    responses: modelOptions.responses?.length || 0,
    video: modelOptions.video?.length || 0
  });
  const providerChoiceOrder = ['official-openai', 'openai-compatible', 'newapi-compatible', 'gateway-account', 'nano-banana-compatible', 'video-compatible'];
  const providerChoices = [...IMAGE_PROVIDER_REGISTRY]
    .sort((left, right) => providerChoiceOrder.indexOf(left.id) - providerChoiceOrder.indexOf(right.id))
    .map((provider) => ({
      ...provider,
      active: provider.id === currentProvider?.id,
      nextApiKeySource: provider.authMode
    }));
  const baseUrlPlaceholder = providerDescriptor.baseUrlExample || defaultProviderGatewayBaseUrl(providerSettings);
  const providerSetupHint = providerDescriptor.setupHint
    ? t(`settings.providerSetupHint.${currentProvider?.id}`, providerDescriptor.setupHint)
    : t('settings.providerSetupHint.default', '填写接口地址和密钥后，会从 /v1/models 同步模型，并按当前模式调用图片或视频接口。');
  const providerRouteHint = t('settings.providerRouteHint', '实际路径：模型 /v1/models · 生图 /v1/images/generations · 编辑 /v1/images/edits');

  return (
    <div className="settingsOverlay" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="settingsDialog">
        <div className="settingsTitle">
          <h2>{t('settings.title', '连接')}</h2>
          <button type="button" className="iconButton" onClick={onClose} aria-label={t('settings.close', '关闭')}>×</button>
        </div>

        <div className="settingsGroup providerSettingsGroup">
          <label className="settingsSelectField">
            <small>{t('settings.providerFamily', '接口类型')}</small>
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
                  {provider.label} · {provider.authMode === 'manual' ? t('settings.providerManual', '手动密钥') : t('settings.providerGateway', '网关账号')}
                </option>
              ))}
            </select>
            <em>{providerSetupHint}</em>
          </label>
        </div>

        <div className="providerSummary">
          <span>{t('settings.provider', 'Provider')}</span>
          <strong>{currentProvider?.label || providerSettings.providerId || 'Gateway Account'}</strong>
          <em>{currentProvider?.authMode === 'manual' ? t('settings.providerManual', '手动密钥') : t('settings.providerGateway', '网关账号')}</em>
          <small>{providerCapabilityText || t('settings.providerCompatible', 'OpenAI 兼容接口')}</small>
        </div>

        {usesGatewayAccount(providerSettings) ? (
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
              <small>{providerRouteHint}</small>
            </label>
            <label>
              <span>{t('settings.key', '密钥')}</span>
              <input
                type="password"
                value={providerSettings.manualApiKey}
                onChange={(event) => onProviderChange({ ...providerSettings, manualApiKey: event.target.value })}
                placeholder="sk-..."
              />
              <small>{t('settings.sessionOnlyKey', '仅保存在当前浏览器会话，不写入 localStorage。')}</small>
            </label>
          </div>
        )}

        <div className="manualFields">
          <p className="settingsHint">{t('settings.hint', '接口会自动选择：普通生图走 /v1/images/generations；参考图编辑和 Mask 走 /v1/images/edits。助手模型只用于底部提示词优化，会消耗当前 Key 额度。')}</p>
          <div className="settingsCallConfig">
            <div className="settingsCallConfigHead">
              <strong>{t('settings.modelCallSettings', '模型调用设置')}</strong>
              <span>{t('settings.modelCallHint', '为生图、编辑、视频和提示词助手预留不同模型；例如 nano-banana、gpt-image-2、veo3。')}</span>
            </div>
            <div className="settingsCallGrid">
              <label>
                <span>{t('settings.imageGenerationModel', '生图模型')}</span>
                <input value={providerSettings.imageGenerationModel || ''} onChange={(event) => onProviderChange({ ...providerSettings, imageGenerationModel: event.target.value })} placeholder="gpt-image-2 / nano-banana" />
              </label>
              <label>
                <span>{t('settings.imageEditModel', '编辑 / Mask 模型')}</span>
                <input value={providerSettings.imageEditModel || ''} onChange={(event) => onProviderChange({ ...providerSettings, imageEditModel: event.target.value })} placeholder={providerSettings.imageGenerationModel || 'gpt-image-2'} />
              </label>
              <label>
                <span>{t('settings.videoModel', '视频模型')}</span>
                <input value={providerSettings.videoModel || ''} onChange={(event) => onProviderChange({ ...providerSettings, videoModel: event.target.value })} placeholder="veo3 / kling / runway" />
              </label>
              <label>
                <span>{t('settings.videoGateway', '视频接口 URL')}</span>
                <input value={providerSettings.videoGatewayBaseUrl || ''} onChange={(event) => onProviderChange({ ...providerSettings, videoGatewayBaseUrl: event.target.value })} placeholder={providerSettings.manualGatewayBaseUrl || getConfiguredBaseUrls().gatewayBaseUrl} />
              </label>
            </div>
          </div>
          <div className={`settingsModelSync ${modelsStatus}`}>
            <span>{modelSyncLabel}</span>
            <em>{modelSyncMeta}</em>
            <small>{providerDescriptor.modelSync?.endpoint
              ? t('settings.modelsProviderHintWithEndpoint', '当前接口通过 {endpoint} 同步模型；失败时会保留默认模型供手动填写。', { endpoint: providerDescriptor.modelSync.endpoint })
              : t('settings.modelsProviderHint', '兼容 OpenAI / NewAPI 风格的上游；后续可继续扩展为多 Provider 调用策略。')}</small>
          </div>
          <label>
            <span>{t('settings.assistantModel', '助手模型')}</span>
            <input
              value={providerSettings.responsesModel}
              onChange={(event) => onProviderChange({ ...providerSettings, responsesModel: event.target.value })}
            />
          </label>
          <label>
            <span>{t('settings.previewFrames', '预览帧')}</span>
            <input
              type="number"
              min="0"
              max="3"
              value={providerSettings.partialImages}
              onChange={(event) => onProviderChange({ ...providerSettings, partialImages: event.target.value })}
            />
          </label>
        </div>

        <div className="settingsActions">
          <button type="button" onClick={() => onProviderChange({
            ...providerSettings,
            manualApiKey: '',
            manualGatewayBaseUrl: '',
            apiKeySource: gatewayAccountDisabled ? 'manual' : 'gateway',
            providerId: gatewayAccountDisabled ? 'openai-compatible' : 'gateway-account'
          })}>
            {t('settings.clear', '清除')}
          </button>
          <button type="button" className="primaryAction" onClick={onClose}>{t('settings.done', '完成')}</button>
        </div>
      </section>
    </div>
  );
}
