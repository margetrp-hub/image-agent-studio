// Generic formatting and small collection helpers used across the studio UI.
// All functions are pure: no React, no DOM, no module-level state.

export function compact(value, length = 180) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > length ? `${text.slice(0, length)}...` : text;
}

export function formatFileSize(value) {
  const size = Number(value || 0);
  if (!Number.isFinite(size) || size <= 0) return '';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 102.4) / 10} KB`;
  return `${Math.round(size / (1024 * 102.4)) / 10} MB`;
}

export function formatMoney(value) {
  if (!Number.isFinite(Number(value))) return '--';
  return `$${Number(value).toFixed(2)}`;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function textSignature(value, length = 72) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .slice(0, length);
}

export function wantsPromptRewrite(value) {
  return /(?:重写|重新写|从头|不要基于|不基于|抛开原图|完全换成|换一个全新|重新设计)/.test(String(value || ''));
}

export function templateKey(item) {
  return String(item?.id ?? item?.title ?? '').trim();
}

export function storedResultUrls(urls) {
  return urls.slice(0, 4);
}

export function orderTemplates(cases) {
  return [...cases].sort((left, right) => {
    if (Boolean(left.featured) !== Boolean(right.featured)) {
      return left.featured ? -1 : 1;
    }
    const leftId = Number(left.id);
    const rightId = Number(right.id);
    if (Number.isFinite(leftId) && Number.isFinite(rightId)) return leftId - rightId;
    if (Number.isFinite(leftId)) return -1;
    if (Number.isFinite(rightId)) return 1;
    return String(left.title || '').localeCompare(String(right.title || ''), 'zh-CN');
  });
}
