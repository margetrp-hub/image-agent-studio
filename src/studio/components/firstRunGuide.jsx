import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Image as ImageIcon, KeyRound, Link2, Sparkles, X } from 'lucide-react';
import '../../styles/studio.first-run.css';

import { orderedImageProviders, providerModelSlots } from '../providers/index.js';

function providerDefaults(providerId) {
  const slots = providerModelSlots(providerId);
  return {
    imageGenerationModel: slots.find((slot) => slot.key === 'imageGenerationModel')?.defaultModel || 'gpt-image-2',
    imageEditModel: slots.find((slot) => slot.key === 'imageEditModel')?.defaultModel || ''
  };
}

function validEndpoint(value) {
  try {
    const url = new URL(String(value || '').trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function FirstRunGuide({ open, onClose, onComplete, t = (key, fallback) => fallback || key }) {
  const providers = useMemo(() => orderedImageProviders().filter((provider) => provider.authMode === 'manual'), []);
  const initialProvider = providers.find((provider) => provider.id === 'openai-compatible') || providers[0];
  const initialModels = providerDefaults(initialProvider?.id);
  const [step, setStep] = useState(0);
  const [providerId, setProviderId] = useState(initialProvider?.id || 'openai-compatible');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [imageModel, setImageModel] = useState(initialModels.imageGenerationModel);
  const [prompt, setPrompt] = useState('');
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const currentProvider = providers.find((provider) => provider.id === providerId) || initialProvider;
  const endpointPlaceholder = currentProvider?.descriptor?.baseUrlExample || 'https://gateway.example.com/v1';

  const handleProviderChange = (nextProviderId) => {
    const defaults = providerDefaults(nextProviderId);
    setProviderId(nextProviderId);
    setImageModel(defaults.imageGenerationModel);
    setFeedback('');
  };

  const goToPrompt = () => {
    if (!validEndpoint(baseUrl)) {
      setFeedback(t('onboarding.urlInvalid', '请输入有效的 HTTP(S) 接口地址。'));
      return;
    }
    if (!apiKey.trim()) {
      setFeedback(t('onboarding.keyRequired', '请输入 API Key。'));
      return;
    }
    if (!imageModel.trim()) {
      setFeedback(t('onboarding.modelRequired', '请输入图片模型。'));
      return;
    }
    setFeedback('');
    setStep(1);
  };

  const startGeneration = async () => {
    if (!prompt.trim()) {
      setFeedback(t('onboarding.promptRequired', '请输入第一张图片的提示词。'));
      return;
    }
    setBusy(true);
    setFeedback('');
    try {
      const defaults = providerDefaults(providerId);
      await onComplete?.({
        providerId,
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim(),
        imageGenerationModel: imageModel.trim(),
        imageEditModel: defaults.imageEditModel || imageModel.trim(),
        prompt: prompt.trim()
      });
    } catch (error) {
      setFeedback(String(error?.message || t('onboarding.startFailed', '保存失败，请检查配置。')));
      setBusy(false);
    }
  };

  return (
    <div className="firstRunBackdrop" role="presentation">
      <section className="firstRunDialog" role="dialog" aria-modal="true" aria-label={t('onboarding.title', '创建第一张图片')}>
        <header className="firstRunHeader">
          <div className="firstRunBrand">
            <span><Sparkles size={17} /></span>
            <div>
              <strong>{t('onboarding.title', '创建第一张图片')}</strong>
              <div className="firstRunProgress" aria-label={t('onboarding.progress', '引导进度')}>
                <i className="isActive" />
                <i className={step === 1 ? 'isActive' : ''} />
              </div>
            </div>
          </div>
          <button type="button" className="firstRunClose" onClick={onClose} aria-label={t('settings.close', '关闭')} title={t('settings.close', '关闭')}><X size={17} /></button>
        </header>

        {step === 0 ? (
          <div className="firstRunBody">
            <div className="firstRunStepTitle">
              <span><Link2 size={16} /></span>
              <strong>{t('onboarding.connectTitle', '连接图片供应商')}</strong>
            </div>
            <div className="firstRunFields">
              <label className="firstRunWideField">
                <span>{t('settings.providerFamily', '接口类型')}</span>
                <select value={providerId} onChange={(event) => handleProviderChange(event.target.value)}>
                  {providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.label}</option>)}
                </select>
              </label>
              <label>
                <span>{t('settings.gateway', '接口地址')}</span>
                <input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder={endpointPlaceholder} autoComplete="url" />
              </label>
              <label>
                <span>{t('settings.key', '密钥')}</span>
                <div className="firstRunSecretField">
                  <KeyRound size={15} />
                  <input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="sk-..." autoComplete="off" />
                </div>
              </label>
              <label className="firstRunWideField">
                <span>{t('settings.imageGenerationModel', '生图模型')}</span>
                <input value={imageModel} onChange={(event) => setImageModel(event.target.value)} placeholder="gpt-image-2" />
              </label>
            </div>
            <div className="firstRunSecurity"><Check size={13} />{t('onboarding.sessionKey', 'Key 仅保留在本次浏览器会话')}</div>
          </div>
        ) : (
          <div className="firstRunBody">
            <div className="firstRunStepTitle">
              <span><ImageIcon size={16} /></span>
              <strong>{t('onboarding.promptTitle', '描述第一张图片')}</strong>
            </div>
            <div className="firstRunConnectionSummary">
              <span>{currentProvider?.label}</span>
              <strong>{imageModel}</strong>
            </div>
            <label className="firstRunPromptField">
              <span>{t('single.promptLabel', '描述')}</span>
              <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={t('onboarding.promptPlaceholder', '例如：雨后的东京街道，电影感，柔和霓虹，16:9')} autoFocus />
            </label>
          </div>
        )}

        {feedback ? <div className="firstRunFeedback" role="alert">{feedback}</div> : null}

        <footer className="firstRunActions">
          {step === 1 ? <button type="button" className="firstRunBack" onClick={() => { setStep(0); setFeedback(''); }} disabled={busy}><ArrowLeft size={15} />{t('onboarding.back', '返回')}</button> : <span />}
          {step === 0 ? <button type="button" className="firstRunPrimary" onClick={goToPrompt}>{t('onboarding.next', '下一步')}<ArrowRight size={15} /></button> : (
            <button type="button" className="firstRunPrimary" onClick={startGeneration} disabled={busy}>
              <Sparkles size={15} />{busy ? t('onboarding.starting', '正在开始') : t('onboarding.generateFirst', '生成第一张')}
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}
