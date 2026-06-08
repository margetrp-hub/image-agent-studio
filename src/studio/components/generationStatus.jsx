import { Clock, Redo2, X } from 'lucide-react';

function formatDuration(ms) {
  if (!Number.isFinite(Number(ms)) || Number(ms) < 0) return '--';
  const value = Number(ms);
  if (value < 1000) return `${Math.round(value)}ms`;
  if (value < 60000) return `${(value / 1000).toFixed(value < 10000 ? 1 : 0)}s`;
  const minutes = Math.floor(value / 60000);
  const seconds = Math.round((value % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

export function progressText(progress, fallbackMessage, t = (key, fallback) => fallback || key) {
  if (!progress || progress.stage === 'idle') return fallbackMessage || '';
  if (progress.stage === 'request') return t('progress.submitted', '已提交');
  if (progress.stage === 'connected') return t('progress.connected', '已连接');
  if (progress.stage === 'queued') return t('progress.queued', '排队中');
  if (progress.stage === 'dispatching') return t('progress.dispatching', '提交上游');
  if (progress.stage === 'upstream') return t('progress.generating', '生成中');
  if (progress.stage === 'video') return t('progress.videoGenerating', '视频生成中');
  if (progress.stage === 'partial') return t('progress.preview', '预览 {count}', { count: progress.partials || 1 });
  if (progress.stage === 'pending_review') return t('progress.review', '待确认');
  if (progress.stage === 'image') return `${progress.completed || 1}/${progress.total || 1}`;
  if (progress.stage === 'saving') return t('progress.saving', '保存中');
  if (progress.stage === 'completed') return t('progress.completed', '完成');
  if (progress.stage === 'succeeded') return t('progress.completed', '完成');
  if (progress.stage === 'canceled') return t('progress.canceled', '已取消');
  if (progress.stage === 'failed') return t('progress.failed', '已停止');
  return fallbackMessage || '';
}

export function ProgressBar({ progress, active, t = (key, fallback) => fallback || key }) {
  if (!progress) return null;
  if (!active && progress.stage !== 'completed' && progress.stage !== 'failed' && progress.stage !== 'pending_review') return null;
  const percent = Math.max(0, Math.min(100, Number(progress.percent || 0)));
  const steps = [
    { key: 'request', label: t('progress.stepSubmit', '提交') },
    { key: 'queued', label: t('progress.stepQueue', '排队') },
    { key: 'image', label: t('progress.stepGenerate', '生成') },
    { key: 'saving', label: t('progress.stepSave', '保存') },
    { key: 'completed', label: t('progress.stepDone', '完成') }
  ];
  const stageOrder = {
    idle: -1,
    request: 0,
    connected: 0,
    queued: 1,
    dispatching: 1,
    upstream: 2,
    video: 2,
    partial: 2,
    image: 2,
    saving: 3,
    completed: 4,
    succeeded: 4,
    canceled: 2,
    failed: 2,
    pending_review: 3
  };
  const activeIndex = stageOrder[progress.stage] ?? 0;
  return (
    <div className={`generationProgress ${progress.stage === 'failed' ? 'failed' : ''} ${progress.stage === 'pending_review' ? 'pendingReview' : ''}`} aria-label={t('progress.aria', '生成进度')}>
      <div>
        <span>{progressText(progress, '', t)}</span>
        <strong>{percent}%</strong>
      </div>
      <div className="progressTrack">
        <i style={{ width: `${percent}%` }} />
      </div>
      <div className="progressSteps" aria-hidden="true">
        {steps.map((step, index) => (
          <span className={index <= activeIndex ? 'active' : ''} key={step.key}>{step.label}</span>
        ))}
      </div>
    </div>
  );
}

export function GenerationTimingPanel({ timing, t = (key, fallback) => fallback || key }) {
  if (!timing) return null;
  const firstMs = timing.firstByteAt ? timing.firstByteAt - timing.startedAt : null;
  const totalMs = (timing.completedAt || Date.now()) - timing.startedAt;
  const title = timing.status === 'running' ? t('timing.running', '生成计时中') : timing.status === 'failed' ? t('timing.failed', '生成已停止') : t('timing.done', '生成完成');
  return (
    <div className="generationTimingPanel">
      <div>
        <Clock size={15} />
        <strong>{title}</strong>
        <span>{t('timing.hint', '响应=首次收到上游数据；总用时=点击生成到当前状态')}</span>
      </div>
      <dl>
        <div>
          <dt>{t('timing.response', '响应')}</dt>
          <dd>{firstMs === null ? t('timing.waiting', '等待中') : formatDuration(firstMs)}</dd>
        </div>
        <div>
          <dt>{t('timing.total', '总用时')}</dt>
          <dd>{formatDuration(totalMs)}</dd>
        </div>
        <div>
          <dt>{t('params.model', '模型')}</dt>
          <dd>{timing.model || '--'}</dd>
        </div>
        <div>
          <dt>{t('timing.spec', '规格')}</dt>
          <dd>{timing.spec || '--'}</dd>
        </div>
      </dl>
    </div>
  );
}

export function ComposerLiveStatus({
  progress,
  status,
  message,
  timing,
  modelLabel,
  routeLabel,
  isGenerating,
  onStop,
  onRetry,
  now,
  stallNoticeMs = 90 * 1000,
  t = (key, fallback) => fallback || key
}) {
  const percent = Math.max(0, Math.min(100, Number(progress?.percent || 0)));
  const elapsedMs = timing?.startedAt ? Math.max(0, (timing.completedAt || now || Date.now()) - timing.startedAt) : null;
  const stageKey = progress?.stage || 'idle';
  const activeWaiting = status === 'loading' || isGenerating;
  const slowWaiting = status === 'loading' && elapsedMs !== null && elapsedMs >= stallNoticeMs;
  const verySlowWaiting = status === 'loading' && elapsedMs !== null && elapsedMs >= stallNoticeMs * 3;
  const displayPercent = status === 'loading' && stageKey === 'request' && elapsedMs !== null
    ? Math.max(percent, Math.min(22, 8 + Math.floor(elapsedMs / 15000) * 2))
    : percent;
  const displayProgress = {
    ...progress,
    percent: displayPercent,
    stage: slowWaiting && stageKey === 'request' ? 'queued' : stageKey
  };
  const stage = verySlowWaiting
    ? t('composer.liveVerySlowStage', '仍在等待上游')
    : slowWaiting
      ? t('composer.liveSlowStage', '上游排队或生成中')
      : progressText(displayProgress, status === 'error' ? t('composer.statusError', '生成异常') : t('composer.status', '生成状态'), t);
  const isReview = progress?.stage === 'pending_review';
  const isFailed = status === 'error' || progress?.stage === 'failed';
  const liveHint = activeWaiting
    ? verySlowWaiting
      ? t('composer.liveVerySlowHint', '页面仍在监听；如需离开，请稍后回历史图库确认')
      : slowWaiting
      ? t('composer.liveSlowHint', '仍在等待上游返回，不代表已经失败')
      : t('composer.liveListeningHint', '正在监听上游结果')
    : isReview
      ? t('composer.liveReviewHint', '请先确认历史图库/当前画布后再重试')
      : status === 'success'
        ? t('composer.liveDoneHint', '结果已写入当前画布')
        : isFailed
          ? t('composer.liveFailedHint', '这次生成没有拿到可用结果')
          : t('composer.liveIdleHint', '等待下一次生成');
  return (
    <div className={`composerLiveStatus ${status} ${activeWaiting ? 'isRunning' : ''} ${slowWaiting ? 'isSlowWaiting' : ''} ${isReview ? 'needsReview' : ''}`} aria-live="polite">
      <div className="composerLiveMain">
        <div className="composerLiveHeader">
          <span className="composerLivePulse" aria-hidden="true" />
          <strong>{activeWaiting ? t('composer.statusGenerating', '正在生成') : status === 'success' ? t('composer.statusDone', '生成完成') : isReview ? t('composer.statusReview', '需要确认') : isFailed ? t('composer.statusError', '生成异常') : t('composer.status', '生成状态')}</strong>
          <em>{stage}{displayPercent ? ` · ${displayPercent}%` : ''}</em>
        </div>
        <ProgressBar progress={displayProgress} active />
        <div className="composerLiveMeta">
          <span>{elapsedMs === null ? t('timing.waiting', '等待中') : t('composer.liveElapsed', '已等待 {time}', { time: formatDuration(elapsedMs) })}</span>
          <span>{liveHint}</span>
          <span>{modelLabel || '--'}</span>
          <span>{routeLabel}</span>
        </div>
        {message ? <p className={`statusLine ${status}`}>{message}</p> : null}
      </div>
      <div className="composerLiveActions">
        {isGenerating ? (
          <button type="button" className="composerStopAction" onClick={onStop}>
            <X size={14} />
            <span>{t('composer.stopWaiting', '停止当前等待')}</span>
          </button>
        ) : isFailed || isReview ? (
          <button type="button" className="composerRetryAction" onClick={onRetry}>
            <Redo2 size={14} />
            <span>{isReview ? t('composer.confirmRetry', '确认重试') : t('composer.retry', '重试')}</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}
