import { Copy, Download, ImageIcon, Video, X } from 'lucide-react';
import { PromptSectionList } from './promptTools.jsx';
import {
  buildStudioDownloadFilename,
  formatHistoryTime,
  RESOLUTION_TIER_LABELS,
  resultExtension,
  resultVideoExtension
} from '../util/resultFiles.js';

export function Lightbox({ url, index, outputFormat = 'png', downloadMeta, onClose, t = (key, fallback) => fallback || key }) {
  if (!url) return null;
  const isReferencePreview = downloadMeta?.mode === 'reference';
  const extension = resultExtension(url, outputFormat);
  const downloadName = buildStudioDownloadFilename({
    ...(downloadMeta || {}),
    mode: 'image',
    index,
    extension
  });
  const promptText = downloadMeta?.prompt || downloadMeta?.generationPrompt || '';
  const meta = [
    downloadMeta?.providerId,
    downloadMeta?.size,
    downloadMeta?.resolutionTier ? RESOLUTION_TIER_LABELS[downloadMeta.resolutionTier] || downloadMeta.resolutionTier : '',
    downloadMeta?.quality ? downloadMeta.quality : '',
    downloadMeta?.createdAt ? formatHistoryTime(downloadMeta.createdAt) : ''
  ].filter(Boolean);
  return (
    <div className="lightboxOverlay" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <figure className="lightboxPanel">
        <button type="button" className="iconButton" onClick={onClose} aria-label={t('settings.close', '关闭')}>
          <X size={18} />
        </button>
        <div className="lightboxImageStage">
          <img src={url} alt={`${isReferencePreview ? t('references.title', '参考图') : t('lightbox.imageAlt', '生成结果')} ${index + 1}`} />
        </div>
        <aside className="lightboxPromptPanel">
          <div className="lightboxPromptHead">
            <div>
              <span>{isReferencePreview ? t('references.preview', '查看参考图') : t('lightbox.promptLabel', '完整提示词')}</span>
              <strong>{isReferencePreview ? t('references.referenceIndex', '参考 {index}', { index: index + 1 }) : `#${index + 1}`}</strong>
            </div>
            {promptText ? (
              <button type="button" onClick={() => navigator.clipboard?.writeText(promptText)}>
                <Copy size={14} />
                {t('lightbox.copyPrompt', '复制')}
              </button>
            ) : null}
          </div>
          {meta.length ? (
            <div className="lightboxMetaChips">
              {meta.map((item) => <span key={item}>{item}</span>)}
            </div>
          ) : null}
          <PromptSectionList prompt={promptText} t={t} />
        </aside>
        <figcaption>
          <span>{isReferencePreview ? t('references.referenceIndex', '参考 {index}', { index: index + 1 }) : `#${index + 1}`}</span>
          <a href={url} download={downloadName}>
            <Download size={16} />
            下载
          </a>
        </figcaption>
      </figure>
    </div>
  );
}

export function VideoLightbox({ url, index = 0, downloadMeta, onClose, t = (key, fallback) => fallback || key }) {
  if (!url) return null;
  const extension = resultVideoExtension(url);
  const downloadName = buildStudioDownloadFilename({
    ...(downloadMeta || {}),
    mode: 'video',
    index,
    extension
  });
  return (
    <div className="lightboxOverlay" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <figure className="lightboxPanel videoLightboxPanel">
        <button type="button" className="iconButton" onClick={onClose} aria-label={t('settings.close', '关闭')}>
          <X size={18} />
        </button>
        <video src={url} controls playsInline />
        <figcaption>
          <span>{t('canvas.videoResult', '视频结果')}</span>
          <a href={url} download={downloadName}>
            <Download size={16} />
            {t('canvas.download', '下载')}
          </a>
        </figcaption>
      </figure>
    </div>
  );
}

export function ResultGrid({ urls, outputFormat = 'png', downloadMeta, onPreview, t = (key, fallback) => fallback || key }) {
  if (!urls.length) {
    return (
      <div className="emptyResult">
        <ImageIcon size={32} />
        <p>{t('composer.resultTitle', '生成结果')}</p>
      </div>
    );
  }
  return (
    <div className="resultGrid">
      {urls.map((url, index) => (
        <figure key={`${url}-${index}`}>
          <button type="button" className="resultPreviewButton" onClick={() => onPreview(url, index)}>
            <img src={url} alt={`${t('lightbox.imageAlt', '生成结果')} ${index + 1}`} />
          </button>
          <a href={url} download={buildStudioDownloadFilename({
            ...(downloadMeta || {}),
            mode: 'image',
            index,
            extension: resultExtension(url, outputFormat)
          })}>
            <Download size={16} />
            {t('canvas.download', '下载')}
          </a>
        </figure>
      ))}
    </div>
  );
}

export function VideoResultGrid({ urls, downloadMeta, onPreview, t = (key, fallback) => fallback || key }) {
  if (!urls.length) {
    return (
      <div className="emptyResult">
        <Video size={32} />
        <p>{t('canvas.videoResult', '视频结果')}</p>
      </div>
    );
  }
  return (
    <div className="resultGrid videoResultGrid">
      {urls.map((url, index) => (
        <figure key={`${url}-${index}`}>
          <button type="button" className="resultPreviewButton" onClick={() => onPreview(url, index)}>
            <video src={url} muted playsInline preload="metadata" />
          </button>
          <a href={url} download={buildStudioDownloadFilename({
            ...(downloadMeta || {}),
            mode: 'video',
            index,
            extension: resultVideoExtension(url)
          })}>
            <Download size={16} />
            {t('canvas.download', '下载')}
          </a>
        </figure>
      ))}
    </div>
  );
}

export function WorkPreviewResultActions({ url, index = 0, outputFormat = 'png', isVideo = false, downloadMeta, onPreview }) {
  if (!url) return null;
  const extension = isVideo ? resultVideoExtension(url) : resultExtension(url, outputFormat);
  const downloadName = buildStudioDownloadFilename({
    ...(downloadMeta || {}),
    mode: isVideo ? 'video' : 'image',
    index,
    extension
  });
  return (
    <div className="workPreviewActions">
      <button type="button" onClick={onPreview}>
        {isVideo ? <Video size={15} /> : <ImageIcon size={15} />}
        预览
      </button>
      <a href={url} download={downloadName}>
        <Download size={15} />
        下载
      </a>
    </div>
  );
}
