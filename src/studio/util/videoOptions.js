// Video-generation parameter vocabularies + normalizers. Mirrors the shape of
// imageOptions.js so the request builder can treat both modalities uniformly.
// Aspect entries carry concrete pixel sizes because some video providers want
// width/height instead of the aspect string.

export const VIDEO_ASPECT_OPTIONS = Object.freeze([
  { value: '16:9', label: '16:9', width: 1280, height: 720 },
  { value: '9:16', label: '9:16', width: 720, height: 1280 },
  { value: '1:1', label: '1:1', width: 1024, height: 1024 }
]);

export const VIDEO_DURATIONS = Object.freeze([4, 5, 8, 10, 12]);
export const VIDEO_FPS_OPTIONS = Object.freeze([24, 30]);

export const VIDEO_MOTIONS = Object.freeze([
  { value: 'auto', label: '自动' },
  { value: 'push_in', label: '推近' },
  { value: 'pull_out', label: '拉远' },
  { value: 'orbit', label: '环绕' },
  { value: 'pan', label: '横移' },
  { value: 'static', label: '固定' }
]);

export const VIDEO_STYLES = Object.freeze([
  { value: 'cinematic', label: '电影感' },
  { value: 'product_ad', label: '产品广告' },
  { value: 'realistic', label: '写实' },
  { value: 'animation', label: '动画' }
]);

export const VIDEO_QUALITY = Object.freeze(['auto', 'standard', 'high']);

export function normalizeVideoAspect(value) {
  return VIDEO_ASPECT_OPTIONS.some((item) => item.value === value) ? value : '16:9';
}

export function normalizeVideoDuration(value) {
  const next = Math.round(Number(value));
  return VIDEO_DURATIONS.includes(next) ? next : 5;
}

export function normalizeVideoFps(value) {
  const next = Math.round(Number(value));
  return VIDEO_FPS_OPTIONS.includes(next) ? next : 24;
}

export function normalizeVideoMotion(value) {
  return VIDEO_MOTIONS.some((item) => item.value === value) ? value : 'auto';
}

export function normalizeVideoStyle(value) {
  return VIDEO_STYLES.some((item) => item.value === value) ? value : 'cinematic';
}

export function normalizeVideoQuality(value) {
  return VIDEO_QUALITY.includes(value) ? value : 'auto';
}

// Returns the full aspect record (with width/height) so callers can pass
// concrete pixel dimensions to providers that need them.
export function videoSizeFromAspect(aspect) {
  return VIDEO_ASPECT_OPTIONS.find((item) => item.value === aspect) || VIDEO_ASPECT_OPTIONS[0];
}
