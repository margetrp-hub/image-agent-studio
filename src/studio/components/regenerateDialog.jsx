import React from 'react';
import { Redo2, SlidersHorizontal, X } from 'lucide-react';
import { ProgressBar, progressText } from './generationStatus.jsx';
import '../../styles/studio.regenerate-dialog.css';

export function RegenerateDialog({
  open,
  mode,
  prompt,
  progress,
  status,
  message,
  isGenerating,
  imageAspectOptions,
  imageCountRange,
  imageModelOptions,
  imageQualityOptions,
  imageResolutionTierOptions,
  aspect,
  aspectLabel,
  countValue,
  model,
  onAspectChange,
  onCountChange,
  onConfirm,
  onModelChange,
  onOpenBottomParams,
  onQualityChange,
  onResolutionTierChange,
  onClose,
  quality,
  qualityLabel,
  resolutionTier,
  resolutionTierLabel,
  t = (key, fallback) => fallback || key,
  videoAspect,
  videoAspectOptions,
  videoDuration,
  videoDurations,
  videoModel,
  videoModelOptions,
  onVideoAspectChange,
  onVideoDurationChange,
  onVideoModelChange
}) {
  if (!open) return null;

  const progressVisible = Boolean(
    progress
    && (
      progress.stage !== 'idle'
      || isGenerating
      || status === 'success'
      || status === 'error'
      || message
    )
  );
  const promptPreview = String(prompt || '').trim();

  return (
    <div className="regenerateDialogBackdrop" role="presentation" onClick={onClose}>
      <div
        className="regenerateDialog"
        role="dialog"
        aria-modal="true"
        aria-label={t('composer.regenerateDialogTitle', '重新生成设置')}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="regenerateDialogHead">
          <div>
            <strong>{t('composer.regenerateDialogTitle', '重新生成设置')}</strong>
            <span>{t('composer.regenerateDialogHint', '先确认这次要沿用的参数，再重新生成。')}</span>
          </div>
          <button type="button" className="regenerateDialogClose" onClick={onClose} aria-label={t('settings.close', '关闭')}>
            <X size={15} />
          </button>
        </div>
        <div className="regenerateDialogBody">
          <section className="regenerateDialogBlock prompt">
            <div className="regenerateDialogBlockHead">
              <strong>{t('composer.currentPrompt', '当前提示词')}</strong>
            </div>
            <p>{promptPreview || t('composer.example', '先补充提示词再重新生成。')}</p>
          </section>
          {progressVisible ? (
            <section className="regenerateDialogBlock progress">
              <div className="regenerateDialogBlockHead">
                <strong>{t('composer.progressTab', '进度')}</strong>
                <span>{progressText(progress, status === 'error' ? t('composer.statusError', '生成异常') : t('composer.statusGenerating', '正在生成'), t)}</span>
              </div>
              <ProgressBar progress={progress} active t={t} />
              {message ? <p className="regenerateDialogMessage">{message}</p> : null}
            </section>
          ) : null}
          <section className="regenerateDialogBlock settings">
            <div className="regenerateDialogBlockHead">
              <strong>{t('params.current', '当前参数')}</strong>
              <button type="button" className="regenerateDialogLink" onClick={onOpenBottomParams}>
                <SlidersHorizontal size={13} />
                <span>{t('composer.openBottomParams', '打开底部参数')}</span>
              </button>
            </div>
            {mode === 'video' ? (
              <div className="regenerateDialogGrid">
                <label className="regenerateDialogField wide">
                  <span>{t('params.videoModel', '视频模型')}</span>
                  <select value={videoModel} onChange={(event) => onVideoModelChange(event.target.value)}>
                    {videoModelOptions.map((item) => <option key={item.id} value={item.id}>{item.label || item.id}</option>)}
                  </select>
                </label>
                <div className="regenerateDialogField">
                  <span>{t('params.videoAspect', '视频比例')}</span>
                  <div className="regenerateDialogSegment">
                    {videoAspectOptions.map((item) => (
                      <button type="button" className={videoAspect === item.value ? 'active' : ''} key={item.value} onClick={() => onVideoAspectChange(item.value)}>
                        {aspectLabel(item)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="regenerateDialogField">
                  <span>{t('params.duration', '时长')}</span>
                  <div className="regenerateDialogSegment">
                    {videoDurations.map((item) => (
                      <button type="button" className={videoDuration === item ? 'active' : ''} key={item} onClick={() => onVideoDurationChange(item)}>
                        {item}s
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="regenerateDialogGrid">
                <label className="regenerateDialogField wide">
                  <span>{t('params.imageModel', '图片模型')}</span>
                  <select value={model} onChange={(event) => onModelChange(event.target.value)}>
                    {imageModelOptions.map((item) => <option key={item.id} value={item.id}>{item.label || item.id}</option>)}
                  </select>
                </label>
                <div className="regenerateDialogField">
                  <span>{t('params.aspect', '尺寸比例')}</span>
                  <div className="regenerateDialogSegment">
                    {imageAspectOptions.map((item) => (
                      <button type="button" className={aspect === item.value ? 'active' : ''} key={item.value} onClick={() => onAspectChange(item.value)}>
                        {aspectLabel(item)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="regenerateDialogField">
                  <span>{t('params.quality', '质量')}</span>
                  <div className="regenerateDialogSegment">
                    {imageQualityOptions.map((item) => (
                      <button type="button" className={quality === item ? 'active' : ''} key={item} onClick={() => onQualityChange(item)}>
                        {qualityLabel(item)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="regenerateDialogField">
                  <span>{t('params.resolution', '分辨率')}</span>
                  <div className="regenerateDialogSegment">
                    {imageResolutionTierOptions.map((item) => (
                      <button type="button" className={resolutionTier === item.value ? 'active' : ''} key={item.value} onClick={() => onResolutionTierChange(item.value)}>
                        {resolutionTierLabel(item)}
                      </button>
                    ))}
                  </div>
                </div>
                <label className="regenerateDialogField">
                  <span>{t('params.imageCount', '图片数量')}</span>
                  <input type="range" min={imageCountRange.min} max={imageCountRange.max} value={countValue} onChange={(event) => onCountChange(event.target.value)} />
                  <strong>{countValue}</strong>
                </label>
              </div>
            )}
          </section>
        </div>
        <div className="regenerateDialogFoot">
          <button type="button" className="secondary" onClick={onClose}>{t('settings.close', '关闭')}</button>
          <button type="button" className="primary" onClick={onConfirm}>
            <Redo2 size={14} />
            <span>{isGenerating ? t('composer.queueMore', '加入队列') : t('composer.regenerate', '重新生成')}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
