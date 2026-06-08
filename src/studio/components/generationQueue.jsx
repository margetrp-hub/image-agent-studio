import React from 'react';
import { Redo2, X } from 'lucide-react';

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
    return formatError({
      ...item.error,
      message: item.error.message || item.summary || 'GENERATION_JOB_FAILED',
      status: item.error.status,
      requestId: item.error.requestId || item.requestIds?.[0] || ''
    }, t);
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
  if (done) parts.push(t('composer.queueDoneNotice', '{count} 个完成提示', { count: done }));
  if (!queued && !failed && !unknown && !canceled && !done) parts.push(t('composer.queueWaiting', '{count} 个排队', { count: 0 }));
  return parts.join(' · ');
}

export function GenerationQueueDock({
  items,
  t,
  formatError,
  onAcknowledge,
  onCancel,
  onRetry
}) {
  const queueItems = Array.isArray(items) ? items : [];
  if (!queueItems.length) return null;

  return (
    <div className="canvasQueueDock" aria-label={t('composer.queue', '生成队列')} onPointerDown={(event) => event.stopPropagation()}>
      <div className="canvasQueueHead">
        <strong>{t('composer.queue', '生成队列')}</strong>
        <span>{queueHeadline(queueItems, t)}</span>
      </div>
      <div className="canvasQueueList">
        {queueItems.slice(0, 5).map((item, index) => {
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
                  aria-label={t('composer.retryTask', '重试这个任务')}
                  title={t('composer.retryTask', '重试这个任务')}
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
        })}
      </div>
    </div>
  );
}
