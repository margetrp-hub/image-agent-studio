import { useState } from 'react';
import { LoaderCircle, Upload, X } from 'lucide-react';
import '../../styles/studio.provider-settings.css';

export function InspirationUploadDialog({ open, onClose, onSubmit, t = (key, fallback) => fallback || key }) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Community Prompts');
  const [prompt, setPrompt] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const canSubmit = prompt.trim().length >= 8;

  if (!open) return null;

  async function submit(event) {
    event.preventDefault();
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit({
        title: title.trim() || prompt.trim().slice(0, 52),
        category: category.trim() || 'Community Prompts',
        prompt: prompt.trim(),
        note: note.trim()
      });
      setTitle('');
      setCategory('Community Prompts');
      setPrompt('');
      setNote('');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="settingsOverlay inspirationUploadOverlay" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <form className="providerSettingsPanel inspirationUploadPanel" onSubmit={submit}>
        <div className="settingsHeader">
          <div>
            <span>{t('gallery.uploadInspiration', '上传灵感')}</span>
            <h2>{t('gallery.uploadTitle', '分享一个好提示词')}</h2>
            <p>{t('gallery.uploadHint', '先保存到你的个人灵感广场，后续可以再做公开审核和精选。')}</p>
          </div>
          <button type="button" className="iconButton" onClick={onClose} aria-label={t('settings.close', '关闭')}>
            <X size={18} />
          </button>
        </div>
        <label>
          <span>{t('gallery.promptTitle', '标题')}</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t('gallery.promptTitlePlaceholder', '例如：电商主图质感提示词')} />
        </label>
        <label>
          <span>{t('gallery.promptCategory', '分类')}</span>
          <input value={category} onChange={(event) => setCategory(event.target.value)} placeholder="Community Prompts" />
        </label>
        <label>
          <span>{t('gallery.promptContent', '提示词')}</span>
          <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={8} placeholder={t('gallery.promptContentPlaceholder', '粘贴你觉得值得复用的完整提示词...')} />
        </label>
        <label>
          <span>{t('gallery.promptNote', '说明')}</span>
          <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} placeholder={t('gallery.promptNotePlaceholder', '适合什么场景、需要注意什么，可选')} />
        </label>
        <div className="settingsActions">
          <button type="button" onClick={onClose}>{t('settings.cancel', '取消')}</button>
          <button type="submit" className="primaryAction" disabled={!canSubmit || submitting}>
            {submitting ? <LoaderCircle size={16} className="spin" /> : <Upload size={16} />}
            {t('gallery.publishPrompt', '保存到广场')}
          </button>
        </div>
      </form>
    </div>
  );
}
