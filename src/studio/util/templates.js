// Presentation helpers for library / inspiration templates and history risk
// tags. Pure functions only — keep this module free of React/DOM deps so it
// stays easy to reuse from both the gallery component file and the inline
// CreationDesk callsites in studio.jsx.

function isLikelyGarbledText(value) {
  const text = String(value || '').trim();
  if (!text) return false;
  if (/[\u0000-\u001f\u007f\ufffd]/.test(text)) return true;
  if (/[\u00c2\u00c3][\u0080-\u00bf]|(?:\u00e2\u20ac[\u0098-\u009d\u0153\u2122])|(?:[\u00e4-\u00e9][\u0080-\u00ff]{1,3}){2,}/.test(text)) return true;
  const latin = (text.match(/[A-Za-z]/g) || []).length;
  const cjk = (text.match(/[\u3400-\u9fff]/g) || []).length;
  const hasSeparator = /[\s/|.,:;()[\]{}_+\-·，。：；（）【】]/.test(text);
  if (latin > 0 && cjk >= 2 && !hasSeparator) return true;
  const useful = (text.match(/[A-Za-z0-9\u3400-\u9fff]/g) || []).length;
  return text.length >= 4 && useful / text.length < 0.45;
}

function cleanGalleryMetaText(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text && !isLikelyGarbledText(text) ? text : '';
}

export function caseCardMeta(item) {
  return cleanGalleryMetaText(item?.sourceLabel) || cleanGalleryMetaText(item?.sourceName);
}

export function templateThumbnail(item) {
  if (!item) return '';
  if (item.thumbnail || item.thumb || item.thumbnail_url || item.thumbnailUrl) {
    return item.thumbnail || item.thumb || item.thumbnail_url || item.thumbnailUrl;
  }
  const image = item.image || item.image_url || '';
  if (/^\/images\/[^/]+\.(jpe?g|png)$/i.test(image)) {
    return image.replace(/^\/images\/(.+)\.(jpe?g|png)$/i, '/images/thumbs/$1.webp');
  }
  return '';
}

export function imageFallback(item) {
  return item?.image || item?.image_url || '';
}

export function templatePreviewImage(item) {
  return imageFallback(item) || templateThumbnail(item);
}

export function hasLibraryPreviewImage(item) {
  return Boolean(item && !item.imageUnavailable && (templateThumbnail(item) || imageFallback(item)));
}

export function templateReferenceThumb(item) {
  return templateThumbnail(item) || templatePreviewImage(item);
}

export function templateReferenceFullImage(item) {
  return templatePreviewImage(item) || templateThumbnail(item);
}

export function libraryFallbackImage(item) {
  return hasLibraryPreviewImage(item) ? templateThumbnail(item) || imageFallback(item) : '';
}

const RISK_LABELS = {
  'brand-risk': '品牌',
  celebrity: '名人',
  medical: '医疗',
  political: '政治',
  'adult-risk': '成人',
  'copyright-style': '版权风格',
  'license-review': '授权待核'
};

export function riskLabel(value) {
  return RISK_LABELS[value] || value;
}
