// Mask editor state + canvas helpers. Pulled out of studio.jsx so the mask
// reducer and undo/redo flow can be tested without instantiating the whole
// Studio app. Most of these functions touch the DOM (Image, FileReader,
// canvas) — they're pure with respect to inputs but can't run server-side.

export const MASK_HISTORY_LIMIT = 6;
// Translucent crimson so the mask preview is visible against both light and
// dark photographs without dominating the image.
export const MASK_FILL_COLOR = 'rgba(178, 39, 50, 0.34)';

// Default, fully-empty mask state. Always start fresh from this — never
// mutate the returned object back into the function.
export function createMaskState() {
  return {
    imageUrl: '',
    imageName: '',
    imageSize: { width: 0, height: 0 },
    brushSize: 48,
    hardness: 100,
    overlayAlpha: 50,
    tool: 'brush',
    zoom: 1,
    inverted: false,
    strokes: [],
    history: [],
    historyIndex: -1
  };
}

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('MASK_FILE_READ_FAILED'));
    reader.readAsDataURL(file);
  });
}

// Resolves to {width:0,height:0} on load failure rather than rejecting so the
// caller can fall back to a placeholder without a try/catch around every use.
export function loadImageDimensions(dataUrl) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth || 0, height: image.naturalHeight || 0 });
    image.onerror = () => resolve({ width: 0, height: 0 });
    image.src = dataUrl;
  });
}

// Deep-clones the mutable bits (imageSize, strokes, currentStroke) so undo/redo
// snapshots can't be retroactively edited by later strokes.
export function createMaskSnapshot(base) {
  return {
    imageUrl: base.imageUrl,
    imageName: base.imageName,
    imageSize: { ...base.imageSize },
    brushSize: base.brushSize,
    hardness: base.hardness,
    overlayAlpha: base.overlayAlpha,
    tool: base.tool,
    zoom: base.zoom,
    inverted: Boolean(base.inverted),
    strokes: Array.isArray(base.strokes) ? base.strokes.map((stroke) => ({
      tool: stroke.tool,
      size: stroke.size,
      hardness: stroke.hardness,
      points: stroke.points.map((point) => ({ x: point.x, y: point.y }))
    })) : [],
    currentStroke: base.currentStroke ? {
      tool: base.currentStroke.tool,
      size: base.currentStroke.size,
      hardness: base.currentStroke.hardness,
      points: base.currentStroke.points.map((point) => ({ x: point.x, y: point.y }))
    } : null
  };
}

// Reverse of createMaskSnapshot — also recursively rehydrates `history` items
// so a restored state is usable as the live mask state immediately.
export function restoreMaskSnapshot(snapshot) {
  const next = createMaskState();
  if (!snapshot) return next;
  next.imageUrl = snapshot.imageUrl || '';
  next.imageName = snapshot.imageName || '';
  next.imageSize = snapshot.imageSize ? { ...snapshot.imageSize } : { width: 0, height: 0 };
  next.brushSize = Number(snapshot.brushSize) || 48;
  next.hardness = Number(snapshot.hardness) || 100;
  next.overlayAlpha = Number(snapshot.overlayAlpha) || 50;
  next.tool = snapshot.tool || 'brush';
  next.zoom = Number(snapshot.zoom) || 1;
  next.inverted = Boolean(snapshot.inverted);
  next.strokes = Array.isArray(snapshot.strokes) ? snapshot.strokes.map((stroke) => ({
    tool: stroke.tool || 'brush',
    size: Number(stroke.size) || 48,
    hardness: Number(stroke.hardness) || 100,
    points: Array.isArray(stroke.points) ? stroke.points.map((point) => ({ x: Number(point.x) || 0, y: Number(point.y) || 0 })) : []
  })) : [];
  next.currentStroke = snapshot.currentStroke ? {
    tool: snapshot.currentStroke.tool || 'brush',
    size: Number(snapshot.currentStroke.size) || 48,
    hardness: Number(snapshot.currentStroke.hardness) || 100,
    points: Array.isArray(snapshot.currentStroke.points) ? snapshot.currentStroke.points.map((point) => ({ x: Number(point.x) || 0, y: Number(point.y) || 0 })) : []
  } : null;
  next.history = Array.isArray(snapshot.history) ? snapshot.history.map((item) => restoreMaskSnapshot(item)) : [];
  next.historyIndex = Number.isFinite(Number(snapshot.historyIndex)) ? Number(snapshot.historyIndex) : -1;
  return next;
}

// Renders the live mask snapshot into a `<canvas>`. When `exportMask` is true
// we paint the mask in white-on-transparent so it can be POSTed as the alpha
// channel; when false we paint MASK_FILL_COLOR for the editor preview. The
// xor on `inverted` flips paint↔erase for inverted masks without forking the
// stroke loop.
export function drawMaskSnapshot(context, snapshot, { exportMask = false } = {}) {
  const width = Number(snapshot?.imageSize?.width || 0);
  const height = Number(snapshot?.imageSize?.height || 0);
  if (!width || !height) return;
  context.clearRect(0, 0, width, height);
  if (exportMask) {
    context.fillStyle = snapshot?.inverted ? 'rgba(255, 255, 255, 0)' : 'rgba(255, 255, 255, 1)';
    context.fillRect(0, 0, width, height);
  }
  for (const stroke of [...(snapshot?.strokes || []), snapshot?.currentStroke].filter(Boolean)) {
    const points = Array.isArray(stroke.points) ? stroke.points : [];
    if (!points.length) continue;
    const size = Number(stroke.size) || 48;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.lineWidth = size;
    if (exportMask) {
      const wantsTransparent = (stroke.tool !== 'eraser') !== Boolean(snapshot?.inverted);
      context.globalCompositeOperation = wantsTransparent ? 'destination-out' : 'source-over';
      context.strokeStyle = wantsTransparent ? 'rgba(255, 255, 255, 1)' : 'rgba(255, 255, 255, 1)';
    } else {
      const showPaint = (stroke.tool !== 'eraser') !== Boolean(snapshot?.inverted);
      context.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over';
      context.strokeStyle = showPaint ? MASK_FILL_COLOR : 'rgba(255, 255, 255, 0.55)';
    }
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    if (points.length === 1) {
      context.lineTo(points[0].x + 0.1, points[0].y + 0.1);
    } else {
      for (let i = 1; i < points.length; i += 1) {
        context.lineTo(points[i].x, points[i].y);
      }
    }
    context.stroke();
  }
  context.globalCompositeOperation = 'source-over';
}

// Renders the snapshot into an offscreen canvas and returns a PNG data URL.
// Returns '' for snapshots without a valid size so callers can short-circuit
// upload paths.
export function maskSnapshotToImageData(snapshot) {
  const width = Number(snapshot?.imageSize?.width || 0);
  const height = Number(snapshot?.imageSize?.height || 0);
  if (!width || !height) return '';
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return '';
  drawMaskSnapshot(context, snapshot, { exportMask: true });
  return canvas.toDataURL('image/png');
}

// Inverse of fileToDataUrl. Decodes a `data:` URL back into a File so the
// generated mask can be POSTed via the same multipart path used for uploads.
// The default filename ('mask.png') matches what the editor currently
// exports — callers can override for other use-cases.
export function dataUrlToFile(dataUrl, filename = 'mask.png') {
  const [prefix, base64 = ''] = String(dataUrl || '').split(',');
  const mime = prefix.match(/data:(.*?);/)?.[1] || 'image/png';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new File([bytes], filename, { type: mime });
}
