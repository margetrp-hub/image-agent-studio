import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Bot, Check, KeyRound, Link2, Pencil, Plus, RefreshCw, Rocket, Save, Search, Server, Trash2, X } from 'lucide-react';
import '../../styles/studio.provider-settings.css';
import '../../styles/studio.provider-settings-responsive.css';
import '../../styles/studio.provider-settings-sync.css';
import '../../styles/studio.provider-library.css';
import '../../styles/studio.provider-connections.css';

import { getConfiguredBaseUrls, STUDIO_STANDALONE } from '../../aiGatewayClient';
import {
  DEFAULT_IMAGE_PROVIDER_ID,
  DEFAULT_MANUAL_IMAGE_PROVIDER_ID,
  DEFAULT_PROVIDER_CONNECTION_TYPE,
  getImageProvider,
  orderedImageProviders,
  providerAccountBindingTypes,
  providerConnectionTypeLabel,
  providerForConnectionType,
  providerModelSlots as providerModelSlotDefinitions
} from '../providers/index.js';
import {
  apiKeyDisplay,
  apiKeyMeta,
  defaultProviderGatewayBaseUrl,
  usesGatewayAccount
} from '../util/providerSettings.js';
import { modelOptionsForProfile, providerSettingsFromProfile } from '../util/providerLibrary.js';

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
        aria-label={t('settings.modelSelection', '模型选择')}
      >
        {current && !currentIsSynced ? <option value={MANUAL_MODEL_OPTION}>{current}</option> : null}
        {choices.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        <option value={MANUAL_MODEL_OPTION}>{t('settings.modelManualChoice', '手动填写模型名')}</option>
      </select>
      {!currentIsSynced ? (
        <input
          value={current}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          aria-label={t('settings.customModelId', '自定义模型 ID')}
        />
      ) : null}
    </>
  );
}

function providerModelDefaults(provider) {
  const defaults = {
    imageGenerationModel: '',
    imageEditModel: '',
    videoModel: '',
    videoGatewayBaseUrl: '',
    responsesModel: ''
  };
  for (const slot of provider?.descriptor?.modelSlots || []) {
    if (slot.key in defaults) defaults[slot.key] = slot.defaultModel || '';
  }
  return defaults;
}

function blankProviderSettings(providerId = DEFAULT_MANUAL_IMAGE_PROVIDER_ID) {
  const provider = getImageProvider(providerId, 'manual');
  return {
    providerProfileId: '',
    providerId: provider?.id || providerId,
    apiKeySource: 'manual',
    manualApiKey: '',
    manualGatewayBaseUrl: '',
    ...providerModelDefaults(provider),
    partialImages: 2
  };
}

function profileEndpoint(profile) {
  return profile.manualGatewayBaseUrl || profile.providerId || '未配置地址';
}

export function SettingsPanel({
  open,
  onClose,
  apiKey,
  keys,
  onSelectKey,
  providerSettings,
  onProviderChange,
  providerProfiles = [],
  activeProviderProfileId,
  assistantProviderProfileId = '',
  assistantModel = '',
  onAssistantConfigChange,
  onSelectProvider,
  onSaveProvider,
  onDeleteProvider,
  providerConnections = [],
  providerConnectionsEnabled = false,
  onBindProvider,
  onDeleteProviderConnection,
  onTestProviderConnection,
  modelOptions = { image: [], responses: [], video: [] },
  modelsStatus = 'idle',
  modelSyncError = null,
  onSyncModels,
  onOpenOnboarding,
  isAuthenticated,
  onLogin,
  t
}) {
  const [selectedProfileId, setSelectedProfileId] = useState('');
  const [draft, setDraft] = useState(providerSettings);
  const [draftName, setDraftName] = useState('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [bindingProviderType, setBindingProviderType] = useState(DEFAULT_PROVIDER_CONNECTION_TYPE);
  const [bindingBaseUrl, setBindingBaseUrl] = useState('');
  const [bindingIdentifier, setBindingIdentifier] = useState('');
  const [bindingPassword, setBindingPassword] = useState('');
  const [bindingBusy, setBindingBusy] = useState(false);
  const [bindingFeedback, setBindingFeedback] = useState('');

  const activeId = activeProviderProfileId || providerSettings.providerProfileId || providerProfiles[0]?.id || '';
  const selectedProfile = providerProfiles.find((profile) => profile.id === selectedProfileId) || null;
  const currentProvider = getImageProvider(draft.providerId, draft.apiKeySource);
  const providerDescriptor = currentProvider?.descriptor || {};
  const providerChoices = orderedImageProviders()
    .filter((provider) => !STUDIO_STANDALONE || provider.authMode === 'manual')
    .map((provider) => ({ ...provider, nextApiKeySource: provider.authMode }));
  const selectedModels = selectedProfileId
    ? selectedProfileId !== activeId
      ? modelOptionsForProfile(selectedProfile)
      : modelOptions
    : { image: [], responses: [], video: [] };
  const baseUrlPlaceholder = providerDescriptor.baseUrlExample || defaultProviderGatewayBaseUrl(draft);
  const generationModelSlots = new Set((providerDescriptor.modelSlots || [])
    .map((slot) => slot.key)
    .filter((key) => key !== 'responsesModel'));
  const accountBindingTypes = STUDIO_STANDALONE ? providerAccountBindingTypes(currentProvider) : [];
  const supportsAccountBinding = accountBindingTypes.length > 0;
  const usesLinkedProvider = draft.apiKeySource === 'linked';
  const compatibleProviderConnections = providerConnections.filter((connection) => accountBindingTypes.includes(connection.providerType));
  const filteredProfiles = useMemo(() => {
    const query = String(search || '').trim().toLowerCase();
    if (!query) return providerProfiles;
    return providerProfiles.filter((profile) => `${profile.name} ${profile.manualGatewayBaseUrl} ${profile.providerId}`.toLowerCase().includes(query));
  }, [providerProfiles, search]);
  const assistantProfiles = useMemo(() => providerProfiles.filter((profile) => (
    providerModelSlotDefinitions(profile.providerId).some((slot) => slot.key === 'responsesModel')
  )), [providerProfiles]);
  const assistantProfile = assistantProfiles.find((profile) => profile.id === assistantProviderProfileId)
    || assistantProfiles[0]
    || null;
  const assistantModels = assistantProfile?.id === activeId
    ? modelOptions.responses
    : modelOptionsForProfile(assistantProfile).responses;
  const assistantModelDefault = assistantModels[0]?.id
    || providerModelSlotDefinitions(assistantProfile?.providerId).find((slot) => slot.key === 'responsesModel')?.defaultModel
    || '';
  const isActiveDraft = Boolean(editing && selectedProfileId && selectedProfileId === activeId);
  const gatewayAccountDisabled = draft.apiKeySource === 'manual';

  useEffect(() => {
    if (!open) return undefined;
    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    setSelectedProfileId('');
    setDraft(blankProviderSettings());
    setDraftName('');
    setEditing(false);
    setFeedback('');
    setBindingProviderType(DEFAULT_PROVIDER_CONNECTION_TYPE);
    setBindingBaseUrl('');
    setBindingIdentifier('');
    setBindingPassword('');
    setBindingBusy(false);
    setBindingFeedback('');
  }, [open]);

  if (!open) return null;

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
    image: selectedModels.image?.length || 0,
    responses: selectedModels.responses?.length || 0,
    video: selectedModels.video?.length || 0
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

  const updateDraft = (patch) => {
    setDraft((current) => ({ ...current, ...patch }));
    setFeedback('');
    setEditing(true);
  };

  const handleProviderTypeChange = (providerId) => {
    const nextProvider = providerChoices.find((provider) => provider.id === providerId) || providerChoices[0];
    setBindingProviderType(providerAccountBindingTypes(nextProvider)[0] || DEFAULT_PROVIDER_CONNECTION_TYPE);
    updateDraft({
      providerProfileId: '',
      providerId: nextProvider.id,
      apiKeySource: nextProvider.nextApiKeySource,
      manualApiKey: '',
      manualGatewayBaseUrl: '',
      ...providerModelDefaults(nextProvider)
    });
  };

  const selectProfileForEditing = (profile) => {
    setSelectedProfileId(profile.id);
    setDraft(providerSettingsFromProfile(profile));
    setDraftName(profile.name);
    setFeedback('');
    setEditing(true);
  };

  const handleNewProvider = () => {
    setSelectedProfileId('');
    setDraft(blankProviderSettings());
    setDraftName('');
    setFeedback('');
    setBindingFeedback('');
    setEditing(true);
  };

  const selectBoundConnection = (connection) => {
    updateDraft({
      providerProfileId: connection.id,
      providerId: providerForConnectionType(connection.providerType)?.id || currentProvider?.id || DEFAULT_MANUAL_IMAGE_PROVIDER_ID,
      apiKeySource: 'linked',
      providerName: connection.externalUsername || connection.baseUrl,
      manualApiKey: '',
      manualGatewayBaseUrl: ''
    });
    if (!draftName.trim()) setDraftName(connection.externalUsername || connection.baseUrl || '绑定供应商');
    setBindingFeedback('');
  };

  const handleBindProvider = async () => {
    if (!bindingBaseUrl.trim() || !bindingIdentifier.trim() || !bindingPassword) {
      setBindingFeedback(t('settings.providerBindingRequired', '请填写地址、账号和密码。'));
      return;
    }
    setBindingBusy(true);
    setBindingFeedback('');
    try {
      const connection = await onBindProvider?.({
        providerType: bindingProviderType,
        baseUrl: bindingBaseUrl.trim(),
        identifier: bindingIdentifier.trim(),
        password: bindingPassword
      });
      if (!connection) throw new Error('PROVIDER_CONNECTION_EMPTY');
      selectBoundConnection(connection);
      setBindingPassword('');
      setBindingFeedback(t('settings.providerBindingSuccess', '账号已绑定，请保存供应商配置。'));
    } catch (error) {
      setBindingFeedback(String(error?.message || 'PROVIDER_BIND_FAILED'));
    } finally {
      setBindingBusy(false);
    }
  };

  const handleRemoveBoundConnection = async (connection) => {
    if (!window.confirm(t('settings.deleteProviderConnectionConfirm', '解除这个账号绑定？'))) return;
    try {
      await onDeleteProviderConnection?.(connection.id);
      if (draft.providerProfileId === connection.id) {
        updateDraft({ providerProfileId: '', apiKeySource: 'manual', providerId: DEFAULT_MANUAL_IMAGE_PROVIDER_ID });
      }
    } catch (error) {
      setBindingFeedback(String(error?.message || 'PROVIDER_UNBIND_FAILED'));
    }
  };

  const handleTestBoundConnection = async (connection) => {
    setBindingFeedback('');
    try {
      await onTestProviderConnection?.(connection.id);
      setBindingFeedback(t('settings.providerConnectionTested', '连接测试成功。'));
    } catch (error) {
      setBindingFeedback(String(error?.message || 'PROVIDER_CONNECTION_TEST_FAILED'));
    }
  };

  const handleSave = () => {
    const name = String(draftName || '').trim();
    if (!name) {
      setFeedback(t('settings.providerNameRequired', '请先填写供应商名称。'));
      return;
    }
    if (draft.apiKeySource === 'manual' && !String(draft.manualGatewayBaseUrl || '').trim()) {
      setFeedback(t('settings.providerUrlRequired', '请先填写接口地址。'));
      return;
    }
    if (draft.apiKeySource === 'linked' && !String(draft.providerProfileId || '').trim()) {
      setFeedback(t('settings.providerConnectionRequired', '请先绑定供应商账号。'));
      return;
    }
    const profileId = selectedProfileId || draft.providerProfileId || '';
    onSaveProvider?.({
      id: profileId,
      name,
      settings: { ...draft, providerProfileId: profileId },
      activate: true
    });
    setFeedback(t('settings.providerSaved', '供应商已保存并启用。'));
    setEditing(false);
  };

  const handleActivate = (profile) => {
    onSelectProvider?.(profile.id);
    setSelectedProfileId('');
    setDraft(blankProviderSettings());
    setDraftName('');
    setFeedback(t('settings.providerActivated', '已切换到该供应商。'));
    setEditing(false);
  };

  const handleDelete = (profile) => {
    if (providerProfiles.length <= 1) {
      setFeedback(t('settings.providerKeepOne', '至少保留一个供应商。'));
      return;
    }
    if (!window.confirm(t('settings.deleteProviderConfirm', `确定删除“${profile.name}”？`))) return;
    onDeleteProvider?.(profile.id);
    setSelectedProfileId('');
    setDraft(blankProviderSettings());
    setDraftName('');
    setEditing(false);
  };

  const handleCancelEditing = () => {
    setSelectedProfileId('');
    setDraft(blankProviderSettings());
    setDraftName('');
    setFeedback('');
    setEditing(false);
  };

  const handleAssistantProviderChange = (providerProfileId) => {
    const profile = assistantProfiles.find((item) => item.id === providerProfileId);
    const options = profile?.id === activeId ? modelOptions.responses : modelOptionsForProfile(profile).responses;
    const model = options[0]?.id
      || providerModelSlotDefinitions(profile?.providerId).find((slot) => slot.key === 'responsesModel')?.defaultModel
      || '';
    setFeedback('');
    onAssistantConfigChange?.({ providerProfileId, model });
  };

  return (
    <div className="settingsOverlay" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="settingsDialog">
        <div className={`settingsTitle ${editing ? 'isEditing' : ''}`}>
          {editing ? (
            <button type="button" className="providerEditorBack" onClick={handleCancelEditing} aria-label={t('settings.backToLibrary', '返回供应商库')} title={t('settings.backToLibrary', '返回供应商库')}>
              <ArrowLeft size={17} />
            </button>
          ) : null}
          <div className="settingsTitleText">
            <h2>{editing
              ? selectedProfile
                ? t('settings.providerEditor', '编辑供应商')
                : t('settings.providerEditorNew', '新增供应商')
              : STUDIO_STANDALONE
                ? t('settings.serviceTitle', '生成服务')
                : t('settings.title', '连接')}</h2>
          </div>
          <button type="button" className="iconButton" onClick={onClose} aria-label={t('settings.close', '关闭')} title={t('settings.close', '关闭')}><X size={17} /></button>
        </div>

        {!editing ? <section className="providerLibrary" aria-label={t('settings.libraryTitle', '供应商库')}>
          <div className="providerLibraryHead">
            <div>
              <strong>{t('settings.libraryTitle', '供应商库')}</strong>
              <span>{t('settings.libraryCount', '{count} 个已保存供应商', { count: providerProfiles.length })}</span>
            </div>
            <div className="providerLibraryHeadActions">
              {onOpenOnboarding ? <button type="button" className="providerLibraryStartButton" onClick={onOpenOnboarding}>
                <Rocket size={14} />
                {t('settings.quickStart', '快速开始')}
              </button> : null}
              <button type="button" className="providerLibraryNewButton" onClick={handleNewProvider}>
                <Plus size={14} />
                {t('settings.newProvider', '新增供应商')}
              </button>
            </div>
          </div>
          <label className="providerLibrarySearch">
            <Search size={15} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('settings.providerSearch', '搜索名称、地址或类型')} aria-label={t('settings.providerSearch', '搜索供应商')} />
          </label>
          <div className="providerLibraryList">
            {filteredProfiles.length ? filteredProfiles.map((profile) => {
              const active = profile.id === activeId;
              const selected = profile.id === selectedProfileId;
              return (
                <article className={`providerLibraryItem ${active ? 'isActive' : ''} ${selected ? 'isSelected' : ''}`} key={profile.id}>
                  <button type="button" className="providerLibraryItemMain" onClick={() => selectProfileForEditing(profile)}>
                    <span className="providerLibraryItemIcon"><Server size={15} /></span>
                    <span className="providerLibraryItemText">
                      <strong>{profile.name}</strong>
                      <small>{getImageProvider(profile.providerId, profile.apiKeySource)?.label || profile.providerId} · {profileEndpoint(profile)}</small>
                    </span>
                    {active ? <span className="providerLibraryActive"><Check size={13} />{t('settings.activeProvider', '使用中')}</span> : null}
                  </button>
                  <div className="providerLibraryItemActions">
                    {!active ? <button type="button" onClick={() => handleActivate(profile)} aria-label={t('settings.useProvider', '使用供应商')} title={t('settings.useProvider', '使用供应商')}><Check size={14} /></button> : null}
                    <button type="button" onClick={() => selectProfileForEditing(profile)} aria-label={t('settings.editProvider', '编辑供应商')} title={t('settings.editProvider', '编辑供应商')}><Pencil size={14} /></button>
                    <button type="button" className="danger" onClick={() => handleDelete(profile)} aria-label={t('settings.deleteProvider', '删除供应商')} title={t('settings.deleteProvider', '删除供应商')}><Trash2 size={14} /></button>
                  </div>
                </article>
              );
            }) : (
              <div className="providerLibraryEmpty">{t('settings.noProviders', '还没有保存的供应商。')}</div>
            )}
          </div>
          {assistantProfile ? <section className="providerAssistantRoute" aria-label={t('settings.assistantRoute', '助手配置')}>
            <div className="providerAssistantRouteHead">
              <span><Bot size={15} /></span>
              <strong>{t('settings.assistantRoute', '助手配置')}</strong>
            </div>
            <div className="providerAssistantRouteFields">
              <label>
                <span>{t('settings.assistantProvider', '助手供应商')}</span>
                <select value={assistantProfile.id} onChange={(event) => handleAssistantProviderChange(event.target.value)}>
                  {assistantProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
                </select>
              </label>
              <label>
                <span>{t('settings.assistantModel', '助手模型')}</span>
                <ModelSettingControl
                  value={assistantModel || assistantModelDefault}
                  options={assistantModels}
                  onChange={(model) => {
                    setFeedback('');
                    onAssistantConfigChange?.({ providerProfileId: assistantProfile.id, model });
                  }}
                  placeholder={assistantModelDefault || 'gpt-5.5'}
                  t={t}
                />
              </label>
            </div>
          </section> : null}
        </section> : null}

        {!editing && feedback ? <div className="providerLibraryFeedback" role="status">{feedback}</div> : null}

        {editing ? <>
        {feedback ? <div className="providerEditorFeedback" role="status">{feedback}</div> : null}
        <div className="settingsGroup providerSettingsGroup">
          <label className="settingsSelectField">
            <small>{t('settings.providerFamily', '接口类型')}</small>
            <select
              className="providerTypeSelect"
              value={currentProvider?.id || draft.providerId}
              onChange={(event) => handleProviderTypeChange(event.target.value)}
            >
              {providerChoices.map((provider) => <option key={provider.id} value={provider.id}>{provider.label}</option>)}
            </select>
          </label>
        </div>

        <div className="manualFields providerIdentityFields">
          <label className="providerNameField">
            <span>{t('settings.providerName', '供应商名称')}</span>
            <input value={draftName} onChange={(event) => { setDraftName(event.target.value); setEditing(true); }} placeholder={t('settings.providerNamePlaceholder', '例如：Fast 图片接口')} />
          </label>
        </div>

        {supportsAccountBinding ? (
          <div className="providerAuthMode">
            <span>{t('settings.providerAuthMode', '认证方式')}</span>
            <div role="group" aria-label={t('settings.providerAuthMode', '认证方式')}>
              <button type="button" className={!usesLinkedProvider ? 'isActive' : ''} onClick={() => updateDraft({ apiKeySource: 'manual', providerProfileId: '' })}>
                <KeyRound size={14} />{t('settings.providerManual', '手动密钥')}
              </button>
              <button type="button" className={usesLinkedProvider ? 'isActive' : ''} onClick={() => updateDraft({ apiKeySource: 'linked', manualApiKey: '', manualGatewayBaseUrl: '' })} disabled={!providerConnectionsEnabled}>
                <Link2 size={14} />{t('settings.providerConnections', '账号绑定')}
              </button>
            </div>
          </div>
        ) : null}

        {supportsAccountBinding && usesLinkedProvider ? (
          <section className="providerConnectionBox">
            <div className="providerConnectionBoxHead">
              <div>
                <strong><Link2 size={15} />{t('settings.providerConnections', '账号绑定')}</strong>
              </div>
              <em className={providerConnectionsEnabled ? 'isReady' : ''}>{providerConnectionsEnabled ? t('settings.providerConnectionsReady', '已启用') : t('settings.providerConnectionsUnavailable', '未配置')}</em>
            </div>
            {compatibleProviderConnections.length ? (
              <div className="providerConnectionList">
                {compatibleProviderConnections.map((connection) => (
                  <div className={`providerConnectionRow ${draft.providerProfileId === connection.id ? 'isSelected' : ''}`} key={connection.id}>
                    <button type="button" className="providerConnectionPick" onClick={() => selectBoundConnection(connection)}>
                      <strong>{connection.externalUsername || connection.baseUrl}</strong>
                      <small>{providerConnectionTypeLabel(connection.providerType)} · {connection.baseUrl}</small>
                    </button>
                    <div className="providerConnectionActions">
                      <button type="button" onClick={() => handleTestBoundConnection(connection)} aria-label={t('settings.testProviderConnection', '测试连接')} title={t('settings.testProviderConnection', '测试连接')}><RefreshCw size={13} /></button>
                      <button type="button" className="danger" onClick={() => handleRemoveBoundConnection(connection)} aria-label={t('settings.deleteProviderConnection', '解除绑定')} title={t('settings.deleteProviderConnection', '解除绑定')}><Trash2 size={13} /></button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="providerBindingFields">
              <label>
                <span>{t('settings.bindingProviderType', '平台')}</span>
                <select value={bindingProviderType} onChange={(event) => setBindingProviderType(event.target.value)} disabled={!providerConnectionsEnabled || bindingBusy}>
                  {accountBindingTypes.map((providerType) => <option key={providerType} value={providerType}>{providerConnectionTypeLabel(providerType)}</option>)}
                </select>
              </label>
              <label>
                <span>{t('settings.bindingBaseUrl', '地址')}</span>
                <input value={bindingBaseUrl} onChange={(event) => setBindingBaseUrl(event.target.value)} placeholder="https://example.com" disabled={!providerConnectionsEnabled || bindingBusy} />
              </label>
              <label>
                <span>{t('settings.bindingAccount', '账号')}</span>
                <input value={bindingIdentifier} onChange={(event) => setBindingIdentifier(event.target.value)} placeholder="email / username" disabled={!providerConnectionsEnabled || bindingBusy} />
              </label>
              <label>
                <span>{t('settings.bindingPassword', '密码')}</span>
                <input type="password" value={bindingPassword} onChange={(event) => setBindingPassword(event.target.value)} placeholder={t('settings.bindingPasswordPlaceholder', '输入平台密码')} disabled={!providerConnectionsEnabled || bindingBusy} />
              </label>
            </div>
            <div className="providerConnectionBoxFoot">
              {bindingFeedback ? <small>{bindingFeedback}</small> : <span />}
              <button type="button" className="secondaryAction" onClick={handleBindProvider} disabled={!providerConnectionsEnabled || bindingBusy}><Link2 size={14} />{bindingBusy ? t('settings.binding', '绑定中') : t('settings.bindProvider', '绑定账号')}</button>
            </div>
          </section>
        ) : null}

        {usesLinkedProvider && STUDIO_STANDALONE ? (
          <div className="settingsEmpty providerLinkedState">{t('settings.providerLinked', '账号已绑定')}</div>
        ) : draft.apiKeySource !== 'manual' && STUDIO_STANDALONE ? (
          <div className="settingsEmpty">{t('settings.noBrowserSecrets', '浏览器不保存服务密钥或调用地址。')}</div>
        ) : usesGatewayAccount(draft) ? (
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
            {isAuthenticated && !keys.length ? <div className="settingsEmpty">{t('settings.noKey', '暂无可用 Key')}</div> : null}
          </div>
        ) : (
          <div className="manualFields">
            <label>
              <span>{t('settings.gateway', '接口地址')}</span>
              <input className="providerGatewayInput" value={draft.manualGatewayBaseUrl} onChange={(event) => updateDraft({ manualGatewayBaseUrl: event.target.value })} placeholder={baseUrlPlaceholder} />
            </label>
            <label>
              <span>{t('settings.key', '密钥')}</span>
              <input type="password" value={draft.manualApiKey} onChange={(event) => updateDraft({ manualApiKey: event.target.value })} placeholder="sk-..." />
            </label>
          </div>
        )}

        <div className="manualFields">
          {(!STUDIO_STANDALONE || draft.apiKeySource !== 'gateway') && generationModelSlots.size ? <div className="settingsCallConfig">
            <div className="settingsCallConfigHead">
              <strong>{t('settings.modelCallSettings', '模型')}</strong>
            </div>
            <div className="settingsCallGrid">
              {generationModelSlots.has('imageGenerationModel') ? <label className="providerImageGenerationModelField">
                <span>{t('settings.imageGenerationModel', '生图模型')}</span>
                <ModelSettingControl value={draft.imageGenerationModel} options={selectedModels.image} onChange={(value) => updateDraft({ imageGenerationModel: value })} placeholder="gpt-image-2 / nano-banana" t={t} />
              </label> : null}
              {generationModelSlots.has('imageEditModel') ? <label className="providerImageEditModelField">
                <span>{t('settings.imageEditModel', '编辑 / Mask 模型')}</span>
                <ModelSettingControl value={draft.imageEditModel} options={selectedModels.image} onChange={(value) => updateDraft({ imageEditModel: value })} placeholder={draft.imageGenerationModel || 'gpt-image-2'} t={t} />
              </label> : null}
              {generationModelSlots.has('videoModel') ? <label className="providerVideoModelField">
                <span>{t('settings.videoModel', '视频模型')}</span>
                <ModelSettingControl value={draft.videoModel} options={selectedModels.video} onChange={(value) => updateDraft({ videoModel: value })} placeholder="veo3 / grok-imagine-video / runway" t={t} />
              </label> : null}
              {generationModelSlots.has('videoModel') ? <label className="providerVideoGatewayField">
                <span>{t('settings.videoGateway', '视频接口 URL')}</span>
                <input value={draft.videoGatewayBaseUrl || ''} onChange={(event) => updateDraft({ videoGatewayBaseUrl: event.target.value })} placeholder={draft.manualGatewayBaseUrl || getConfiguredBaseUrls().gatewayBaseUrl} />
              </label> : null}
              {generationModelSlots.has('imageGenerationModel') ? <label className="providerPreviewFramesField">
                <span>{t('settings.previewFrames', '预览帧')}</span>
                <input type="number" min="0" max="3" value={draft.partialImages} onChange={(event) => updateDraft({ partialImages: event.target.value })} />
              </label> : null}
            </div>
          </div> : null}
          {providerDescriptor.modelSync?.supported ? <div className={`settingsModelSync ${modelsStatus}`}>
            <div className="settingsModelSyncText">
              <span>{modelSyncLabel}</span>
              <em>{modelSyncMeta}</em>
              {modelSyncError ? <small className="settingsModelSyncError" title={modelSyncErrorDetails}>{modelSyncErrorLabel} · {modelSyncErrorDetails}</small> : null}
            </div>
            {onSyncModels ? (
              <button type="button" className="settingsModelSyncButton" onClick={() => onSyncModels()} disabled={!isActiveDraft || modelsStatus === 'loading'} aria-label={t('settings.modelsSyncNowAria', '同步模型')}>
                <RefreshCw size={14} />
                <span>{t('settings.modelsSyncNow', '同步')}</span>
              </button>
            ) : null}
          </div> : null}
        </div>

        <div className="settingsActions">
          {!STUDIO_STANDALONE ? <button type="button" className="secondaryAction" onClick={() => updateDraft({ manualApiKey: '', manualGatewayBaseUrl: '', apiKeySource: gatewayAccountDisabled ? 'manual' : 'gateway', providerId: gatewayAccountDisabled ? DEFAULT_MANUAL_IMAGE_PROVIDER_ID : DEFAULT_IMAGE_PROVIDER_ID })}>{t('settings.clear', '清除')}</button> : null}
          <button type="button" className="secondaryAction" onClick={handleCancelEditing}>{t('settings.cancel', '取消')}</button>
          <button type="button" className="primaryAction" onClick={handleSave}><Save size={14} />{t('settings.saveProvider', '保存供应商')}</button>
        </div>
        </> : null}
      </section>
    </div>
  );
}
