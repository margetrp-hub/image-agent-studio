import { orderTemplates, templateKey } from './formatters.js';

function normalizeSearchText(value) {
  return String(value || '').normalize('NFKC').toLowerCase();
}

// Sort and normalize once per catalog change, not on every search keystroke.
export function buildLibrarySearchIndex(cases, categoryLabel = (value) => value) {
  return orderTemplates(cases).map((item) => ({
    item,
    key: templateKey(item),
    text: normalizeSearchText([
      item.title, item.category, categoryLabel(item.category),
      item.sourceLabel, item.sourceName, item.promptPreview, item.prompt,
      item.summary, ...[item.tags, item.styles, item.scenes].flatMap((value) => Array.isArray(value) ? value : [value || ''])
    ].join(' '))
  }));
}

export function searchLibraryIndex(index, { query = '', category = 'All', favorites = new Set(), favoritesOnly = false } = {}) {
  const terms = normalizeSearchText(query).trim().split(/\s+/).filter(Boolean);
  return index.filter(({ item, key, text }) => (
    (category === 'All' || item.category === category)
    && (!favoritesOnly || favorites.has(key))
    && terms.every((term) => text.includes(term))
  )).map(({ item }) => item);
}
