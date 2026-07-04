import React, { useEffect } from 'react';
import { CheckCircle2, Clock3, ImageIcon, Layers3, Route, SlidersHorizontal, Sparkles, X } from 'lucide-react';
import '../../styles/studio.generation-confirm-dialog.css';

export function GenerationConfirmDialog({
  open,
  billingLabel,
  confirmLabel,
  countLabel,
  modeLabel,
  modelLabel,
  onAdjustParams,
  onClose,
  onConfirm,
  outputLabel,
  prompt,
  providerLabel,
  queueLabel,
  referenceLabel,
  routeLabel,
  t = (key, fallback) => fallback || key
}) {
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const rows = [
    [t('composer.confirmMode', '模式'), modeLabel],
    [t('composer.confirmModel', '模型'), modelLabel],
    [t('composer.confirmRoute', '接口'), routeLabel],
    [t('composer.confirmOutput', '输出'), outputLabel],
    [t('composer.confirmCount', '数量'), countLabel],
    [t('composer.confirmReferences', '参考'), referenceLabel],
    [t('composer.confirmBilling', '计费口径'), billingLabel],
    [t('composer.confirmProvider', '连接'), providerLabel],
    [t('composer.confirmQueue', '队列'), queueLabel]
  ].filter(([, value]) => Boolean(value));

  const promptPreview = String(prompt || '').trim();
  const primaryRows = rows.slice(0, 4);
  const secondaryRows = rows.slice(4);
  const checkpoints = [
    {
      icon: <Route size={14} />,
      title: t('composer.confirmCheckpointRoute', '调用路径'),
      text: routeLabel || t('composer.confirmCheckpointRouteAuto', '按当前模式自动选择')
    },
    {
      icon: <ImageIcon size={14} />,
      title: t('composer.confirmCheckpointOutput', '输出规格'),
      text: outputLabel || countLabel || t('composer.confirmCheckpointOutputAuto', '使用当前输出设置')
    },
    {
      icon: <Layers3 size={14} />,
      title: t('composer.confirmCheckpointReferences', '参考与队列'),
      text: [referenceLabel, queueLabel].filter(Boolean).join(' · ') || t('composer.confirmCheckpointReady', '确认后加入当前队列')
    }
  ];

  return (
    <div className="generationConfirmBackdrop" role="presentation" onClick={onClose}>
      <div
        className="generationConfirmDialog"
        role="dialog"
        aria-modal="true"
        aria-label={t('composer.confirmGenerateTitle', '确认本次生成')}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="generationConfirmHead">
          <div className="generationConfirmTitle">
            <span><Sparkles size={16} /></span>
            <div>
              <strong>{t('composer.confirmGenerateTitle', '确认本次生成')}</strong>
              <p>{t('composer.confirmGenerateHint', '最后核对提示词、模型和调用路径，确认后才会进入生成队列。')}</p>
            </div>
          </div>
          <button type="button" className="generationConfirmClose" onClick={onClose} aria-label={t('settings.close', '关闭')}>
            <X size={15} />
          </button>
        </div>

        <div className="generationConfirmBody">
          <section className="generationConfirmChecklist" aria-label={t('composer.confirmChecklist', '生成检查单')}>
            {checkpoints.map((item) => (
              <div className="generationConfirmCheck" key={item.title}>
                <span>{item.icon}</span>
                <div>
                  <strong>{item.title}</strong>
                  <em>{item.text}</em>
                </div>
              </div>
            ))}
          </section>

          <section className="generationConfirmPrompt">
            <div className="generationConfirmSectionHead">
              <strong>{t('composer.currentPrompt', '当前提示词')}</strong>
              <span>{promptPreview.length ? t('composer.confirmPromptReady', '将按下面内容生成') : t('composer.confirmPromptEmpty', '还没有提示词')}</span>
            </div>
            <pre>{promptPreview || t('composer.example', '例如：基于 #1 保留人物，换成清晨城市背景，画面更安静。')}</pre>
          </section>

          <section className="generationConfirmSummary" aria-label={t('params.current', '当前参数')}>
            <div className="generationConfirmPrimaryRows">
              {primaryRows.map(([label, value]) => (
                <div className="generationConfirmRow" key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
            {secondaryRows.length ? (
              <div className="generationConfirmSecondaryRows">
                {secondaryRows.map(([label, value]) => (
                  <div className="generationConfirmMiniRow" key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          <p className="generationConfirmNotice">
            <Clock3 size={14} />
            <span>{t('composer.confirmGenerateNotice', '如果上游很慢，页面会继续监听；刷新后请先查看历史图库或当前画布，再决定是否重试。')}</span>
          </p>
        </div>

        <div className="generationConfirmFoot">
          <button type="button" className="generationConfirmAdjust" onClick={onAdjustParams}>
            <SlidersHorizontal size={14} />
            <span>{t('composer.confirmAdjustParams', '调整参数')}</span>
          </button>
          <div>
            <button type="button" className="generationConfirmSecondary" onClick={onClose}>{t('settings.cancel', '取消')}</button>
            <button type="button" className="generationConfirmPrimary" onClick={onConfirm}>
              <CheckCircle2 size={15} />
              <span>{confirmLabel || t('composer.confirmGeneratePrimary', '确认生成')}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
