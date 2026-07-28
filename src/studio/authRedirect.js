export function safeSameOriginRedirect(value, { origin, fallback } = {}) {
  const safeOrigin = new URL(origin || window.location.origin).origin;
  const safeFallback = String(fallback || '/studio.html');
  const candidate = String(value || '').trim();
  if (!candidate.startsWith('/') || candidate.startsWith('//')) return safeFallback;

  try {
    const url = new URL(candidate, safeOrigin);
    if (url.origin !== safeOrigin) return safeFallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return safeFallback;
  }
}
