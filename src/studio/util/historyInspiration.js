// Turns the user's own generation history into inspiration-wall cases so the
// gallery can surface their best past work alongside the community library.
//
// The app has no explicit per-result "like" button, so "high-liked" is derived
// from the signals that actually indicate a result was valued: how many times
// the user iterated on it (lineage/workflow depth), how many results the
// session produced, and how recent it is. A result someone refined five times
// and returned to is a stronger endorsement than a one-off generation, so those
// float to the top. Pure module — no React/DOM/storage deps — so it can be unit
// tested and reused from both studio.jsx and any future service-side ranker.

import { historyResultItems, safeImageCandidate } from './historyView.js';

// Category bucket the derived cases live under. Kept distinct from the
// community categories so the UI can label/filter it separately and it never
// collides with a real library category id.
export const HISTORY_INSPIRATION_CATEGORY = 'My Highlights';

// Prefix on generated case ids so downstream code can tell a history-derived
// case from a community/library one (e.g. to skip server resolution, which only
// applies to real library cases).
const HISTORY_CASE_ID_PREFIX = 'history-highlight-';

export function isHistoryInspirationCase(item) {
  return String(item?.id || '').startsWith(HISTORY_CASE_ID_PREFIX);
}

// Depth of the refine chain for a result: how many lineage steps it carries.
// A bare result with no workflow counts as depth 1 (the original prompt).
function lineageDepth(result) {
  const lineage = Array.isArray(result?.workflow?.lineage) ? result.workflow.lineage : [];
  return Math.max(1, lineage.length);
}

// Engagement score for a single history result. Iteration depth dominates
// because it is the clearest "the user cared about this one" signal; result
// clustering and recency are gentle tiebreakers so a fresh, rich session edges
// out an older sparse one at the same depth.
function scoreResult(result, sessionResultCount, now) {
  const depth = lineageDepth(result);
  const createdAt = Date.parse(result?.createdAt || '') || 0;
  // Recency decays over ~30 days to a floor of 0, so old work still ranks on
  // its own merits (depth) rather than being buried entirely.
  const ageDays = createdAt ? Math.max(0, (now - createdAt) / (24 * 60 * 60 * 1000)) : 45;
  const recencyBonus = Math.max(0, 1 - ageDays / 30);
  const richnessBonus = Math.min(3, Math.max(0, sessionResultCount - 1)) * 0.5;
  return depth * 3 + richnessBonus + recencyBonus;
}

// Builds a gallery-case object from a scored history result. Mirrors the fields
// the gallery reads (`image`/`thumbnail` for the preview, `prompt`/
// `promptPreview` for the body, `sourceLabel` for the meta chip) so the derived
// card renders through the exact same CaseCard path as a community case.
function resultToCase(result, index, t) {
  const prompt = String(result?.generationPrompt || result?.prompt || '').trim();
  const image = safeImageCandidate(result?.displayUrl || result?.url || '');
  const title = deriveTitle(prompt, index, t);
  return {
    id: `${HISTORY_CASE_ID_PREFIX}${result.id || `${result.recordId || 'r'}-${index}`}`,
    title,
    category: HISTORY_INSPIRATION_CATEGORY,
    prompt,
    promptPreview: prompt,
    image,
    image_url: image,
    thumbnail: image,
    sourceLabel: t('gallery.historyHighlightSource', '来自你的历史'),
    // Featured so orderTemplates keeps these ahead of unfeatured community
    // cases if they ever share a view, and flagged as history-derived so
    // resolveLibraryCase skips the server round-trip meant for real cases.
    featured: true,
    staticLibrary: true,
    historyHighlight: true,
    createdAt: result?.createdAt || ''
  };
}

function deriveTitle(prompt, index, t) {
  const firstLine = String(prompt || '').split('\n').map((line) => line.trim()).find(Boolean) || '';
  const compacted = firstLine.replace(/\s+/g, ' ').slice(0, 40);
  if (compacted) return compacted;
  return t('gallery.historyHighlightFallbackTitle', '历史高赞 #{index}', { index: index + 1 });
}

// Main entry: rank the user's history results by engagement and return the top
// `limit` as inspiration cases. Dedupes by prompt signature so the same prompt
// refined repeatedly contributes one strong card rather than crowding the wall.
export function buildHistoryInspirationCases(historyItems, { limit = 8, t = (key, fallback) => fallback || key } = {}) {
  const items = Array.isArray(historyItems) ? historyItems : [];
  if (!items.length) return [];
  const now = Date.now();
  const scored = [];
  for (const item of items) {
    if (item?.mode === 'video' || item?.kind === 'video') continue;
    const results = historyResultItems(item);
    if (!results.length) continue;
    for (const result of results) {
      const image = safeImageCandidate(result?.displayUrl || result?.url || '');
      const prompt = String(result?.generationPrompt || result?.prompt || '').trim();
      if (!image || !prompt) continue;
      scored.push({ result, score: scoreResult(result, results.length, now) });
    }
  }
  if (!scored.length) return [];
  scored.sort((left, right) => right.score - left.score);

  const seenPrompts = new Set();
  const cases = [];
  for (const entry of scored) {
    const signature = String(entry.result?.generationPrompt || entry.result?.prompt || '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 96);
    if (seenPrompts.has(signature)) continue;
    seenPrompts.add(signature);
    cases.push(resultToCase(entry.result, cases.length, t));
    if (cases.length >= limit) break;
  }
  return cases;
}

// Merges history-highlight cases into an existing case list, replacing any
// prior highlights (so re-running after new generations refreshes the set
// rather than accumulating stale duplicates) and keeping them at the front.
export function mergeHistoryInspirationCases(existingCases, highlightCases) {
  const base = (Array.isArray(existingCases) ? existingCases : []).filter((item) => !isHistoryInspirationCase(item));
  const highlights = Array.isArray(highlightCases) ? highlightCases : [];
  return [...highlights, ...base];
}
