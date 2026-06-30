import React from 'react';
import { ArrowDown, ArrowUp, SlidersHorizontal, Video } from 'lucide-react';

export function ComposerParamShelf({
  activeWorkspace,
  aspect,
  aspectLabel,
  countValue,
  deskModeLabel,
  deskModes,
  hasVideoModels,
  imageAspectOptions,
  imageCountRange,
  imageCountSuffix,
  imageModelOptions,
  imageQualityOptions,
  imageResolutionTierOptions,
  layoutSections,
  mode,
  model,
  onAspectChange,
  onCountChange,
  onModeChange,
  onModelChange,
  onQualityChange,
  onResolutionTierChange,
  onVideoAspectChange,
  onVideoDurationChange,
  onVideoModelChange,
  quality,
  qualityLabel,
  resolutionTier,
  resolutionTierLabel,
  resolutionTierLabels,
  setCustomSize,
  t = (key, fallback) => fallback || key,
  toggleLayoutSection,
  updateLayoutSections,
  videoAspect,
  videoAspectOptions,
  videoDuration,
  videoDurations,
  videoModel,
  videoModelOptions
}) {
  const parametersExpanded = layoutSections.composerParameters !== false;
  const compactSummary = mode === 'video'
    ? `${videoAspect} / ${videoDuration}s`
    : `${aspect} / ${resolutionTierLabels[resolutionTier]} / ${qualityLabel(quality)} / ${countValue}${imageCountSuffix}`;

  return (
    <div className={`composerParamShelf ${parametersExpanded ? 'isExpanded' : 'isCollapsed'}`} aria-label={t('params.current', '当前参数')}>
      {!parametersExpanded ? (
        <button
          type="button"
          className="composerParamSummary"
          onClick={() => updateLayoutSections({ composerFolded: false, composerParameters: true })}
          aria-label={t('params.expand', '展开参数')}
          aria-expanded="false"
          title={t('params.expand', '展开参数')}
        >
          <SlidersHorizontal size={14} />
          <span>{mode === 'video' ? t('workspace.video', '视频创作') : deskModeLabel(mode) || t('workspace.image', '图片创作')}</span>
          <em>{mode === 'video' ? videoModel : model}</em>
          <strong>{compactSummary}</strong>
          <ArrowUp size={13} />
        </button>
      ) : (
        <>
          <button
            type="button"
            className="composerParamFoldButton"
            onClick={() => toggleLayoutSection('composerParameters')}
            aria-label={t('params.collapse', '收起参数')}
            aria-expanded="true"
            title={t('params.collapse', '收起参数')}
          >
            <ArrowDown size={13} />
          </button>
          <div className="composerParamLane primary">
            {activeWorkspace === 'image' ? (
              <div className="composerModeSegment composerParamGroup composerParamModeGroup" role="group" aria-label={t('workspace.image', '图片创作')}>
                {deskModes.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button type="button" className={mode === item.value ? 'active' : ''} key={item.value} onClick={() => onModeChange(item.value)}>
                      <Icon size={14} />
                      <span>{deskModeLabel(item.value)}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="composerModeSegment singleMode composerParamGroup composerParamModeGroup">
                <Video size={14} />
                <span>{t('workspace.video', '视频创作')}</span>
              </div>
            )}
            {mode === 'video' ? (
              <label className="composerParamField wide composerParamGroup composerParamModelGroup">
                <span>{t('params.videoModel', '视频模型')}</span>
                <select value={hasVideoModels ? videoModel : ''} onChange={(event) => onVideoModelChange(event.target.value)} disabled={!hasVideoModels}>
                  {hasVideoModels ? videoModelOptions.map((item) => <option key={item.id} value={item.id}>{item.label || item.id}</option>) : (
                    <option value="">{t('params.currentKeyNoVideo', '当前 Key 未开放视频模型')}</option>
                  )}
                </select>
              </label>
            ) : (
              <label className="composerParamField wide composerParamGroup composerParamModelGroup">
                <span>{t('params.imageModel', '图片模型')}</span>
                <select value={model} onChange={(event) => onModelChange(event.target.value)}>
                  {imageModelOptions.map((item) => <option key={item.id} value={item.id}>{item.label || item.id}</option>)}
                </select>
              </label>
            )}
            {mode === 'video' ? (
              <div className="composerMiniSegment composerParamGroup">
                {videoAspectOptions.map((item) => (
                  <button type="button" className={videoAspect === item.value ? 'active' : ''} key={item.value} onClick={() => onVideoAspectChange(item.value)}>
                    {aspectLabel(item)}
                  </button>
                ))}
              </div>
            ) : (
              <div className="composerMiniSegment composerParamGroup">
                {imageAspectOptions.map((item) => (
                  <button
                    type="button"
                    className={aspect === item.value ? 'active' : ''}
                    key={item.value}
                    onClick={() => {
                      onAspectChange(item.value);
                      if (item.value !== 'custom') setCustomSize(item.size);
                    }}
                  >
                    {aspectLabel(item)}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="composerParamLane secondary">
            {mode === 'video' ? (
              <div className="composerMiniSegment composerParamGroup">
                {videoDurations.map((item) => (
                  <button type="button" className={videoDuration === item ? 'active' : ''} key={item} onClick={() => onVideoDurationChange(item)}>
                    {item}s
                  </button>
                ))}
              </div>
            ) : (
              <>
                <div className="composerMiniSegment composerParamGroup">
                  {imageQualityOptions.map((item) => (
                    <button type="button" className={quality === item ? 'active' : ''} key={item} onClick={() => onQualityChange(item)}>
                      {qualityLabel(item)}
                    </button>
                  ))}
                </div>
                <div className="composerMiniSegment composerParamGroup">
                  {imageResolutionTierOptions.map((item) => (
                    <button type="button" className={resolutionTier === item.value ? 'active' : ''} key={item.value} onClick={() => onResolutionTierChange(item.value)}>
                      {resolutionTierLabel(item)}
                    </button>
                  ))}
                </div>
                <label className="composerCountField composerParamGroup composerParamCountGroup">
                  <span>{t('params.count', '数量')}</span>
                  <input type="range" min={imageCountRange.min} max={imageCountRange.max} value={countValue} onChange={(event) => onCountChange(event.target.value)} />
                  <strong>{countValue}</strong>
                </label>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
