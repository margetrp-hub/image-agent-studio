// Library/inspiration data loader. Pulls cases.json + inspirations.json from
// the public dir, merges them into the shape the gallery expects, and snaps
// missing fields onto safe defaults so the rail can render even when one of
// the sources is unreachable.

import { publicJsonPath } from './assets.js';

export const EMPTY_SITE_DATA = Object.freeze({
  totalCases: 0,
  categories: [],
  styles: [],
  scenes: [],
  inspirationSources: [],
  inspirationErrors: [],
  promptPresets: [],
  videoInspirations: [],
  cases: []
});

// Surfaced in the gallery footer when community templates are shown so the
// CC-BY attribution is always visible to users browsing the public set.
export const COMMUNITY_LICENSE_NOTICE = Object.freeze({
  name: '社区提示词模板 · CC BY 4.0',
  url: 'https://creativecommons.org/licenses/by/4.0/',
  text: '提示词模板内容来自公开社区，遵循 CC BY 4.0 许可证；使用和改编时请保留原作者或来源归属。'
});

// Merges the local cases payload with the community-inspirations payload.
// Categories/styles/scenes are deduped+sorted across both sources so the
// gallery filters reflect the full union of available tags.
export function mergeSiteData(localData, inspirationData) {
  const localCases = Array.isArray(localData?.cases) ? localData.cases : [];
  const inspirationCases = Array.isArray(inspirationData?.cases) ? inspirationData.cases : [];
  const cases = [...localCases, ...inspirationCases];
  return {
    ...(localData || {}),
    inspirationSources: inspirationData?.sources || [],
    inspirationErrors: inspirationData?.errors || [],
    totalCases: cases.length,
    categories: [...new Set([
      ...(localData?.categories || []),
      ...(inspirationData?.categories || []),
      ...cases.map((item) => item.category).filter(Boolean)
    ])].sort(),
    styles: [...new Set(cases.flatMap((item) => item.styles || []))].sort(),
    scenes: [...new Set(cases.flatMap((item) => item.scenes || []))].sort(),
    cases
  };
}

// Pads a partial library payload with safe defaults. `promptPresets` and
// `videoInspirations` fall back to caller-supplied lists rather than being
// hard-coded here, so embedding apps can ship their own seed content.
export function normalizeLibraryPayload(payload, {
  promptPresets: defaultPromptPresets = [],
  videoInspirations: defaultVideoInspirations = []
} = {}) {
  const cases = Array.isArray(payload?.cases) ? payload.cases : [];
  const promptPresets = Array.isArray(payload?.promptPresets) ? payload.promptPresets : defaultPromptPresets;
  const videoInspirations = Array.isArray(payload?.videoInspirations) ? payload.videoInspirations : defaultVideoInspirations;
  return {
    ...EMPTY_SITE_DATA,
    ...(payload || {}),
    totalCases: Number(payload?.totalCases || cases.length),
    categories: Array.isArray(payload?.categories) ? payload.categories : [...new Set(cases.map((item) => item.category).filter(Boolean))].sort(),
    styles: Array.isArray(payload?.styles) ? payload.styles : [...new Set(cases.flatMap((item) => item.styles || []))].sort(),
    scenes: Array.isArray(payload?.scenes) ? payload.scenes : [...new Set(cases.flatMap((item) => item.scenes || []))].sort(),
    license: payload?.license || COMMUNITY_LICENSE_NOTICE,
    promptPresets,
    videoInspirations,
    cases
  };
}

// Tries the asset-versioned URL first, then the bare `/<file>` path. The two
// candidates exist because the asset hash isn't always present in dev builds
// and we want production caching without breaking local dev.
export async function fetchPublicJson(fileName, fallback = {}) {
  const candidates = [publicJsonPath(fileName), `/${fileName}`]
    .filter((value, index, list) => value && list.indexOf(value) === index);
  for (const url of candidates) {
    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/json' }
      });
      if (!response.ok) {
        throw new Error(`HTTP_${response.status}`);
      }
      return await response.json();
    } catch {
      // Try the next deployment path before falling back to an empty payload.
    }
  }
  return fallback;
}

// Loads + merges the static library payloads in parallel and tags every case
// with `staticLibrary: true` so downstream code can distinguish bundled cases
// from user-saved ones.
export async function loadStaticLibraryData(options = {}) {
  const [localData, inspirationData] = await Promise.all([
    fetchPublicJson('cases.json', { cases: [] }),
    fetchPublicJson('inspirations.json', { cases: [] })
  ]);
  const data = normalizeLibraryPayload(mergeSiteData(localData, inspirationData), options);
  return {
    ...data,
    cases: data.cases.map((item) => ({ ...item, staticLibrary: true }))
  };
}
