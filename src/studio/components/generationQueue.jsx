import React, { useEffect, useState } from 'react';
import { ListTodo, Redo2, TimerReset, X } from 'lucide-react';
import { ProgressBar, progressText } from './generationStatus.jsx';

function queueStatusLabel(status, t) {
  if (status === 'running') return t('composer.queueStatusRunning', '生成中');
  if (status === 'done') return t('composer.queueStatusDone', '完成');
  if (status === 'failed') return t('composer.queueStatusFailed', '已中断');
  if (status === 'canceled') return t('composer.queueStatusCanceled', '已取消');
  if (status === 'unknown') return t('composer.queueStatusUnknown', '结果未知');
  return t('composer.queueStatusQueued', '排队中');
}

function queueSummary(item, t, formatError) {
  if (item?.status === 'failed' && item?.error && typeof formatError === 'function') {
    const message = formatError({
      ...item.error,
      message: item.error.message || item.summary || 'GENERATION_JOB_FAILED',
      status: item.error.status,
      requestId: item.error.requestId || item.requestIds?.[0] || ''
    }, t);
    if (message) return message;
  }
  return item?.summary || '';
}

function queueHeadline(items, t) {
  const countStatus = (status) => items.filter((item) => item?.status === status).length;
  const running = countStatus('running');
  const queued = countStatus('queued');
  const failed = countStatus('failed');
  const unknown = countStatus('unknown');
  const canceled = countStatus('canceled');
  const done = countStatus('done');
  const parts = [];
  parts.push(running ? t('composer.queueRunning', '1 个生成中') : t('composer.queueIdle', '当前空闲'));
  if (queued) parts.push(t('composer.queueWaiting', '{count} 个排队', { count: queued }));
  if (failed + unknown) parts.push(t('composer.queueNeedsReview', '{count} 个需确认', { count: failed + unknown }));
  if (canceled) parts.push(t('composer.queueCanceledNotice', '{count} 个已取消', { count: canceled }));
  if (done) parts.push(t('composer.queueDoneNotice', '{count} 个已完成', { count: done }));
  if (!queued && !failed && !unknown && !canceled && !done) parts.push(t('composer.queueWaiting', '{count} 个排队', { count: 0 }));
  return parts.join(' · ');
}

function progressTitle({ isGenerating, progress, status, t }) {
  if (isGenerating) return t('composer.statusGenerating', '正在生成');
  if (status === 'success' || progress?.stage === 'completed' || progress?.stage === 'succeeded') return t('composer.statusDone', '生成完成');
  if (progress?.stage === 'pending_review') return t('composer.statusReview', '需要确认');
  if (status === 'error' || progress?.stage === 'failed') return t('composer.statusError', '生成异常');
  return t('composer.status', '生成状态');
}

function progressVisible(progress, status, message, isGenerating) {
  return Boolean(
    progress
    && (
      progress.stage !== 'idle'
      || isGenerating
      || status === 'success'
      || status === 'error'
      || message
    )
  );
}

export function GenerationQueueDock({
  items,
  progress,
  status,
  message,
  timing,
  isGenerating,
  t,
  formatError,
  onAcknowledge,
  onCancel,
  onRetry,
  onRegenerate,
  onStop
}) {
  const queueItems = Array.isArray(items) ? items : [];
  const showProgress = progressVisible(progress, status, message, isGenerating);
  const hasDock = queueItems.length || showProgress;
  const [activeTab, setActiveTab] = useState(queueItems.length ? 'queue' : 'progress');

  useEffect(() => {
    if (queueItems.length) {
      setActiveTab('queue');
      return;
    }
    if (showProgress) {
      setActiveTab('progress');
    }
  }, [queueItems.length, showProgress]);

  if (!hasDock) return null;

  const elapsedMs = timing?.startedAt ? Math.max(0, (timing.completedAt || Date.now()) - timing.startedAt) : null;
  const currentProgressTitle = progressTitle({ isGenerating, progress, status, t });
  const currentProgressLine = showProgress
    ? progressText(progress, status === 'error' ? t('composer.statusError', 'Generation issue') : currentProgressTitle, t)
    : '';
  const multipleTabs = queueItems.length && showProgress;
  const renderQueueItems = (limit = 5) => (
    queueItems.slice(0, limit).map((item, index) => {
      const canCancel = item.status === 'queued' || item.status === 'running';
      const canRetry = item.status === 'failed' && !item.remote && item.restorable !== false;
      const canAcknowledge = item.status === 'failed' || item.status === 'unknown' || item.status === 'canceled' || item.status === 'done';
      const cancelLabel = item.status === 'running'
        ? t('composer.cancelRunningTask', '停止当前任务')
        : t('composer.cancelQueuedTask', '取消排队任务');

      return (
        <div className={`canvasQueueItem ${item.status}`} key={item.id}>
          <b>#{index + 1}</b>
          <span>{queueStatusLabel(item.status, t)}</span>
          <p>{queueSummary(item, t, formatError)}</p>
          {canCancel ? (
            <button
              type="button"
              onClick={() => onCancel(item.id)}
              aria-label={cancelLabel}
              title={cancelLabel}
            >
              <X size={13} />
            </button>
          ) : null}
          {canRetry ? (
            <button
              type="button"
              className="retryQueueAction"
              onClick={() => onRetry(item.id)}
              aria-label={t('composer.regenerateTask', '重新生成这个任务')}
              title={t('composer.regenerateTask', '重新生成这个任务')}
            >
              <Redo2 size={13} />
            </button>
          ) : null}
          {canAcknowledge ? (
            <button
              type="button"
              onClick={() => onAcknowledge(item.id)}
              aria-label={t('composer.dismissQueueNotice', '收起队列提示')}
              title={t('composer.dismissQueueNotice', '收起队列提示')}
            >
              <X size={13} />
            </button>
          ) : null}
        </div>
      );
    })
  );

  return (
    <div className="canvasQueueDock" aria-label={t('composer.queuePanel', '生成面板')} onPointerDown={(event) => event.stopPropagation()}>
      <div className="canvasQueueHead">
        <strong>{t('composer.queuePanel', '生成面板')}</strong>
        <span>{activeTab === 'progress' && showProgress ? currentProgressTitle : queueHeadline(queueItems, t)}</span>
      </div>
      {multipleTabs ? (
        <div className="canvasQueueTabs" role="tablist" aria-label={t('composer.queuePanelTabs', '生成面板标签')}>
          <button
            type="button"
            role="tab"
            className={activeTab === 'queue' ? 'active' : ''}
            aria-selected={activeTab === 'queue'}
            onClick={() => setActiveTab('queue')}
          >
            <ListTodo size={13} />
            <span>{t('composer.queue', '生成队列')}</span>
            <em>{queueItems.length}</em>
          </button>
          <button
            type="button"
            role="tab"
            className={activeTab === 'progress' ? 'active' : ''}
            aria-selected={activeTab === 'progress'}
            onClick={() => setActiveTab('progress')}
          >
            <TimerReset size={13} />
            <span>{t('composer.progressTab', '进度')}</span>
          </button>
        </div>
      ) : null}
      {(activeTab === 'progress' || !queueItems.length) && showProgress ? (
        <div className="canvasProgressPanel">
          <div className="canvasProgressSummary">
            <strong>{currentProgressTitle}</strong>
            <span>{currentProgressLine}</span>
          </div>
          <ProgressBar progress={progress} active t={t} />
          {message ? <p className="canvasProgressMessage">{message}</p> : null}
          <div className="canvasProgressMeta">
            {timing?.model ? <span>{timing.model}</span> : null}
            {timing?.spec ? <span>{timing.spec}</span> : null}
            {elapsedMs !== null ? <span>{t('composer.liveElapsed', '已等待 {time}', { time: `${Math.max(1, Math.round(elapsedMs / 1000))}s` })}</span> : null}
          </div>
          {isGenerating ? (
            <div className="canvasProgressActions">
              <button type="button" className="stop" onClick={onStop}>
                <X size={13} />
                <span>{t('composer.stopWaiting', '停止当前等待')}</span>
              </button>
            </div>
          ) : status === 'error' || progress?.stage === 'failed' || progress?.stage === 'pending_review' ? (
            <div className="canvasProgressActions">
              <button type="button" className="retry" onClick={onRegenerate}>
                <Redo2 size={13} />
                <span>{t('composer.regenerate', '重新生成')}</span>
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      {(activeTab === 'queue' || !showProgress) && queueItems.length ? (
        <div className="canvasQueueList">
          {renderQueueItems(5)}
        </div>
      ) : null}
    </div>
  );
}
