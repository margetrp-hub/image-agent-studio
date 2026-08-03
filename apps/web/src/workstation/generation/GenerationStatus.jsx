import { CircleAlert, Clock3, Download, LoaderCircle, Square, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useWorkstationI18n } from '../i18n.jsx';
import './generationStatus.css';

const activeStatuses = new Set(['queued', 'dispatching', 'gateway', 'upstream', 'image', 'video', 'saving']);

function elapsedSince(value, now) {
  const started = Date.parse(value || '');
  if (!Number.isFinite(started)) return '';
  const seconds = Math.max(0, Math.floor((now - started) / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export function GenerationStatus({ error = '', job, onCancel, onDismiss, resultImages = [] }) {
  const { t } = useWorkstationI18n();
  const [now, setNow] = useState(Date.now());
  const status = job?.stage || job?.status || '';
  const cancelable = activeStatuses.has(job?.status);
  const active = cancelable && !error;

  useEffect(() => {
    if (!active) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);

  if (!job && !error) return null;

  return (
    <section aria-live="polite" className={`pw-generation-status is-${job?.status || 'error'}`}>
      <div className="pw-generation-status-line">
        <span className="pw-generation-state-icon">
          {active ? <LoaderCircle className="is-spinning" size={16} /> : job?.status === 'failed' || error ? <CircleAlert size={16} /> : <Clock3 size={16} />}
        </span>
        <div>
          <strong>{error ? t('generation.couldNotStart') : t(`status.${status}`)}</strong>
          <span>{active ? t('generation.waiting', { elapsed: elapsedSince(job?.createdAt, now) ? ` · ${elapsedSince(job.createdAt, now)}` : '' }) : job?.error?.message || error || t('generation.saved')}</span>
        </div>
        {cancelable && <button aria-label={t('generation.cancel')} onClick={onCancel} title={t('generation.cancel')} type="button"><Square size={14} /></button>}
        {!cancelable && <button aria-label={t('generation.dismiss')} onClick={onDismiss} title={t('generation.dismiss')} type="button"><X size={15} /></button>}
      </div>

      {resultImages.length > 0 && (
        <div className="pw-generation-results">
          {resultImages.map((image, index) => (
            <article key={image.url}>
              <button aria-label={t('generation.openResult', { number: index + 1 })} onClick={() => window.open(image.objectUrl, '_blank', 'noopener,noreferrer')} type="button">
                {image.mediaType?.startsWith('video/')
                  ? <video aria-label={t('generation.resultAlt', { number: index + 1 })} muted playsInline preload="metadata" src={image.objectUrl} />
                  : <img alt={t('generation.resultAlt', { number: index + 1 })} src={image.objectUrl} />}
              </button>
              <a download={image.filename || `generated-${index + 1}.png`} href={image.objectUrl} title={t('generation.download')}><Download size={14} /></a>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
