import { Film, Image, LoaderCircle, WandSparkles, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useWorkstationI18n } from '../i18n.jsx';
import { imageOptionsForModel, videoOptionsForModel } from './modelCapabilities.js';
import './generationConfirmDialog.css';

const videoAspects = [
  { value: '16:9', width: 1280, height: 720 },
  { value: '9:16', width: 720, height: 1280 },
  { value: '1:1', width: 1024, height: 1024 }
];
const videoMotions = ['auto', 'push_in', 'pull_out', 'orbit', 'pan', 'static'];
const videoStyles = ['cinematic', 'product_ad', 'realistic', 'animation'];

export function GenerationConfirmDialog({
  busy = false,
  error = '',
  models = [],
  mode = 'single',
  onClose,
  onConfirm,
  open,
  prompt,
  provider,
  selectedModel = ''
}) {
  const { t } = useWorkstationI18n();
  const [model, setModel] = useState(selectedModel);
  const [quality, setQuality] = useState('auto');
  const [size, setSize] = useState('1024x1024');
  const [count, setCount] = useState('1');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [duration, setDuration] = useState('5');
  const [fps, setFps] = useState('24');
  const [motion, setMotion] = useState('auto');
  const [videoStyle, setVideoStyle] = useState('cinematic');
  const [videoQuality, setVideoQuality] = useState('auto');
  const videoMode = mode === 'video';
  const selectedModelRecord = models.find((item) => (item.id || item.name) === model);
  const invocationAdapter = selectedModelRecord?.invocations?.[videoMode ? 'video' : 'image']?.adapter || '';
  const imageProfile = useMemo(() => imageOptionsForModel(provider?.providerType, model, invocationAdapter), [invocationAdapter, model, provider?.providerType]);
  const videoProfile = useMemo(() => videoOptionsForModel(provider?.providerType, model, invocationAdapter), [invocationAdapter, model, provider?.providerType]);
  const aspectOptions = videoAspects.filter((item) => videoProfile.aspects.includes(item.value));

  useEffect(() => {
    if (!open) return;
    setModel(selectedModel || models[0]?.id || models[0]?.name || '');
    setQuality('auto');
    setSize('1024x1024');
    setCount('1');
    setAspectRatio('16:9');
    setDuration('5');
    setFps('24');
    setMotion('auto');
    setVideoStyle('cinematic');
    setVideoQuality('auto');
  }, [models, open, selectedModel, videoMode]);

  useEffect(() => {
    if (!open) return;
    setSize((current) => imageProfile.sizes.includes(current) ? current : imageProfile.sizes[0] || '');
    setQuality((current) => imageProfile.qualities.includes(current) ? current : imageProfile.qualities[0] || '');
    setCount((current) => imageProfile.counts.includes(Number(current)) ? current : String(imageProfile.counts[0] || 1));
    setAspectRatio((current) => videoProfile.aspects.includes(current) ? current : videoProfile.aspects[0] || '16:9');
    setDuration((current) => videoProfile.durations.includes(Number(current)) ? current : String(videoProfile.durations[0] || 4));
    setFps((current) => videoProfile.fps.includes(Number(current)) ? current : String(videoProfile.fps[0] || ''));
  }, [imageProfile, open, videoProfile]);

  if (!open) return null;

  const modelOptions = models.length ? models : model ? [{ id: model }] : [];

  return (
    <div className="pw-dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <section aria-labelledby="generation-confirm-title" aria-modal="true" className="pw-generation-dialog" role="dialog">
        <header>
          <span className="pw-generation-dialog-icon"><WandSparkles size={18} /></span>
          <div><span>{t('confirm.ready')}</span><h2 id="generation-confirm-title">{t('confirm.title')}</h2></div>
          <button aria-label={t('confirm.close')} disabled={busy} onClick={onClose} type="button"><X size={18} /></button>
        </header>

        <div className="pw-generation-summary">
          {videoMode ? <Film size={16} /> : <Image size={16} />}
          <p>{prompt}</p>
        </div>

        <form onSubmit={(event) => {
          event.preventDefault();
          if (videoMode) {
            const aspect = videoAspects.find((item) => item.value === aspectRatio) || videoAspects[0];
            onConfirm({ aspectRatio, duration: Number(duration), fps: Number(fps), height: aspect.height, model, motion, videoQuality, videoStyle, width: aspect.width });
            return;
          }
          onConfirm({ count: Number(count), model, quality, size });
        }}>
          <div className="pw-generation-fields">
            <label><span>{t('confirm.connection')}</span><input readOnly value={provider?.label || t('confirm.noConnection')} /></label>
            <label><span>{t('confirm.model')}</span><select disabled={busy || !modelOptions.length} onChange={(event) => setModel(event.target.value)} required value={model}>
              {modelOptions.map((item) => {
                const value = item.id || item.name;
                return <option key={value} value={value}>{value}</option>;
              })}
            </select></label>
            {videoMode ? <>
              <label><span>{t('confirm.aspectRatio')}</span><select disabled={busy} onChange={(event) => setAspectRatio(event.target.value)} value={aspectRatio}>{aspectOptions.map((item) => <option key={item.value}>{item.value}</option>)}</select></label>
              <label><span>{t('confirm.duration')}</span><select disabled={busy} onChange={(event) => setDuration(event.target.value)} value={duration}>{videoProfile.durations.map((item) => <option key={item} value={item}>{item}s</option>)}</select></label>
              {videoProfile.fps.length > 0 && <label><span>{t('confirm.fps')}</span><select disabled={busy} onChange={(event) => setFps(event.target.value)} value={fps}>{videoProfile.fps.map((item) => <option key={item} value={item}>{item} FPS</option>)}</select></label>}
              <label><span>{t('confirm.motion')}</span><select disabled={busy} onChange={(event) => setMotion(event.target.value)} value={motion}>{videoMotions.map((item) => <option key={item} value={item}>{t(`motion.${item}`)}</option>)}</select></label>
              <label><span>{t('confirm.style')}</span><select disabled={busy} onChange={(event) => setVideoStyle(event.target.value)} value={videoStyle}>{videoStyles.map((item) => <option key={item} value={item}>{t(`videoStyle.${item}`)}</option>)}</select></label>
              <label><span>{t('confirm.quality')}</span><select disabled={busy} onChange={(event) => setVideoQuality(event.target.value)} value={videoQuality}>{['auto', 'standard', 'high'].map((item) => <option key={item} value={item}>{t(`quality.${item}`)}</option>)}</select></label>
            </> : <>
              {imageProfile.sizes.length > 0 && <label><span>{t('confirm.size')}</span><select disabled={busy} onChange={(event) => setSize(event.target.value)} value={size}>{imageProfile.sizes.map((item) => <option key={item}>{item}</option>)}</select></label>}
              {imageProfile.qualities.length > 0 && <label><span>{t('confirm.quality')}</span><select disabled={busy} onChange={(event) => setQuality(event.target.value)} value={quality}>{imageProfile.qualities.map((item) => <option key={item} value={item}>{t(`quality.${item}`)}</option>)}</select></label>}
              <label><span>{t('confirm.images')}</span><select disabled={busy} onChange={(event) => setCount(event.target.value)} value={count}>{imageProfile.counts.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
            </>}
          </div>
          {error && <p className="pw-generation-error" role="alert">{error}</p>}
          <footer>
            <button disabled={busy} onClick={onClose} type="button">{t('common.cancel')}</button>
            <button className="is-primary" disabled={busy || !provider || !model || !prompt.trim()} type="submit">
              {busy ? <LoaderCircle className="is-spinning" size={17} /> : <WandSparkles size={17} />}
              {busy ? t('confirm.starting') : t('confirm.start')}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
