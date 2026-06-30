// MaskEditor — the inline mask painter used by the image-mode composer for
// inpainting. Renders three stacked canvases (image, mask, cursor) plus a
// toolbar; exposes `exportMask()` via ref so the parent can attach the
// generated PNG to a generation request without re-reading the canvas.
//
// The component owns its own undo/redo history (via createMaskState +
// pushHistory). State is mirrored into `stateRef` so pointer handlers can
// read the latest state without waiting for a re-render — important because
// pointermove fires faster than React commits.

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  Brush,
  Download,
  Eraser,
  FlipHorizontal,
  LoaderCircle,
  Redo2,
  ScanLine,
  Sparkles,
  Trash2,
  Undo2,
  Upload
} from 'lucide-react';

import { clamp } from '../util/formatters.js';
import {
  MASK_FILL_COLOR,
  MASK_HISTORY_LIMIT,
  createMaskSnapshot,
  createMaskState,
  dataUrlToFile,
  drawMaskSnapshot,
  loadImageDimensions,
  maskSnapshotToImageData,
  restoreMaskSnapshot
} from '../util/mask.js';

export const MaskEditor = forwardRef(function MaskEditor({
  imageFile,
  imagePreview,
  onUpload,
  onClearImage,
  onExportReady,
  onError,
  onGenerate,
  generating = false,
  t = (key, fallback) => fallback || key
}, ref) {
  const imageCanvasRef = useRef(null);
  const maskCanvasRef = useRef(null);
  const cursorCanvasRef = useRef(null);
  const wrapRef = useRef(null);
  const stateRef = useRef(createMaskState());
  const drawingRef = useRef(false);
  const [maskState, setMaskState] = useState(() => createMaskState());

  const syncState = (updater) => {
    const current = stateRef.current;
    const next = typeof updater === 'function' ? updater(current) : updater;
    stateRef.current = next;
    setMaskState(next);
    return next;
  };

  const pushHistory = (base = stateRef.current) => {
    const snapshot = createMaskSnapshot(base);
    const history = base.history.slice(0, base.historyIndex + 1);
    history.push(snapshot);
    const trimmed = history.slice(-MASK_HISTORY_LIMIT);
    return {
      ...base,
      history: trimmed,
      historyIndex: trimmed.length - 1
    };
  };

  const redraw = (state = stateRef.current) => {
    const imageCanvas = imageCanvasRef.current;
    const maskCanvas = maskCanvasRef.current;
    const cursorCanvas = cursorCanvasRef.current;
    const { width, height } = state.imageSize;
    if (!imageCanvas || !maskCanvas || !width || !height) return;
    for (const canvas of [imageCanvas, maskCanvas, cursorCanvas].filter(Boolean)) {
      canvas.width = width;
      canvas.height = height;
      canvas.style.width = `${Math.round(width * state.zoom)}px`;
      canvas.style.height = `${Math.round(height * state.zoom)}px`;
    }
    const imageContext = imageCanvas.getContext('2d');
    const maskContext = maskCanvas.getContext('2d');
    if (!imageContext || !maskContext) return;
    const image = new Image();
    image.onload = () => {
      imageContext.clearRect(0, 0, width, height);
      imageContext.drawImage(image, 0, 0, width, height);
      maskContext.clearRect(0, 0, width, height);
      maskContext.globalAlpha = clamp(Number(state.overlayAlpha) || 50, 10, 100) / 100;
      if (state.inverted) {
        maskContext.fillStyle = MASK_FILL_COLOR;
        maskContext.fillRect(0, 0, width, height);
      }
      drawMaskSnapshot(maskContext, state);
      maskContext.globalAlpha = 1;
    };
    image.src = state.imageUrl;
  };

  useEffect(() => {
    if (!imageFile || !imagePreview) {
      syncState(createMaskState());
      return;
    }
    let cancelled = false;
    loadImageDimensions(imagePreview).then((imageSize) => {
      if (cancelled) return;
      const next = pushHistory({
        ...createMaskState(),
        imageUrl: imagePreview,
        imageName: imageFile.name || '参考图',
        imageSize,
        zoom: imageSize.width > 1400 ? 0.5 : imageSize.width > 900 ? 0.7 : 1
      });
      syncState(next);
      requestAnimationFrame(() => redraw(next));
    });
    return () => {
      cancelled = true;
    };
  }, [imageFile, imagePreview]);

  useEffect(() => {
    redraw(maskState);
  }, [maskState.brushSize, maskState.hardness, maskState.overlayAlpha, maskState.zoom, maskState.tool, maskState.inverted, maskState.strokes.length]);

  useImperativeHandle(ref, () => ({
    exportMask() {
      return exportMaskFile();
    }
  }), []);

  function exportMaskFile() {
    const state = stateRef.current;
    if (!state.inverted && !state.strokes.length && !state.currentStroke) return null;
    const dataUrl = maskSnapshotToImageData(state);
    if (!dataUrl) return null;
    return dataUrlToFile(dataUrl, 'mask.png');
  }

  const canvasPoint = (event) => {
    const canvas = maskCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((event.clientY - rect.top) / rect.height) * canvas.height;
    return {
      x: clamp(x, 0, canvas.width),
      y: clamp(y, 0, canvas.height)
    };
  };

  const startStroke = (event) => {
    const point = canvasPoint(event);
    if (!point || !maskState.imageUrl) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drawingRef.current = true;
    const next = {
      ...stateRef.current,
      currentStroke: {
        tool: stateRef.current.tool,
        size: stateRef.current.brushSize,
        hardness: stateRef.current.hardness,
        points: [point]
      }
    };
    syncState(next);
    redraw(next);
  };

  const moveStroke = (event) => {
    if (!drawingRef.current) return;
    const point = canvasPoint(event);
    if (!point) return;
    event.preventDefault();
    const next = {
      ...stateRef.current,
      currentStroke: {
        ...stateRef.current.currentStroke,
        points: [...(stateRef.current.currentStroke?.points || []), point]
      }
    };
    syncState(next);
    redraw(next);
  };

  const finishStroke = (event) => {
    if (!drawingRef.current) return;
    event?.preventDefault?.();
    drawingRef.current = false;
    const currentStroke = stateRef.current.currentStroke;
    if (!currentStroke?.points?.length) {
      syncState({ ...stateRef.current, currentStroke: null });
      return;
    }
    const next = pushHistory({
      ...stateRef.current,
      strokes: [...stateRef.current.strokes, currentStroke],
      currentStroke: null
    });
    syncState(next);
    redraw(next);
  };

  const updateMaskState = (patch) => {
    const next = { ...stateRef.current, ...patch };
    syncState(next);
    redraw(next);
  };

  const undo = () => {
    const current = stateRef.current;
    if (current.historyIndex <= 0) return;
    const snapshot = current.history[current.historyIndex - 1];
    const restored = restoreMaskSnapshot(snapshot);
    restored.history = current.history;
    restored.historyIndex = current.historyIndex - 1;
    syncState(restored);
    requestAnimationFrame(() => redraw(restored));
  };

  const redo = () => {
    const current = stateRef.current;
    if (current.historyIndex >= current.history.length - 1) return;
    const snapshot = current.history[current.historyIndex + 1];
    const restored = restoreMaskSnapshot(snapshot);
    restored.history = current.history;
    restored.historyIndex = current.historyIndex + 1;
    syncState(restored);
    requestAnimationFrame(() => redraw(restored));
  };

  const clearMask = () => {
    const next = pushHistory({ ...stateRef.current, strokes: [], currentStroke: null, inverted: false });
    syncState(next);
    redraw(next);
  };

  const invertMask = () => {
    const next = pushHistory({ ...stateRef.current, inverted: !stateRef.current.inverted, currentStroke: null });
    syncState(next);
    redraw(next);
  };

  const exportMask = () => {
    const file = exportMaskFile();
    if (!file) {
      onError?.(t('mask.needImage', '请先上传参考图并绘制 mask。'));
      return;
    }
    const url = URL.createObjectURL(file);
    onExportReady?.(url, file);
  };

  const canUndo = maskState.historyIndex > 0;
  const canRedo = maskState.historyIndex < maskState.history.length - 1;

  return (
    <div className="maskEditorPanel">
      <div className="maskToolbar">
        <div className="maskToolGroup">
          <label className="uploadMaskSource">
            <Upload size={15} />
            <span>{imageFile ? t('mask.replaceReference', '替换参考图') : t('mask.uploadReference', '上传参考图')}</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => {
                onUpload?.(event.target.files);
                event.target.value = '';
              }}
            />
          </label>
          {imageFile ? (
            <button type="button" onClick={onClearImage}>
              <Trash2 size={15} />
              {t('settings.clear', '清除')}
            </button>
          ) : null}
        </div>
        <div className="maskToolGroup">
          <button type="button" className={maskState.tool === 'brush' ? 'active' : ''} onClick={() => updateMaskState({ tool: 'brush' })}>
            <Brush size={15} />
            {t('mask.brush', '涂抹')}
          </button>
          <button type="button" className={maskState.tool === 'eraser' ? 'active' : ''} onClick={() => updateMaskState({ tool: 'eraser' })}>
            <Eraser size={15} />
            {t('mask.eraser', '橡皮')}
          </button>
        </div>
        <label className="maskRange">
          <span>{t('mask.brushSize', '笔刷 {value}px', { value: maskState.brushSize })}</span>
          <input type="range" min="6" max="220" value={maskState.brushSize} onChange={(event) => updateMaskState({ brushSize: Number(event.target.value) })} />
        </label>
        <label className="maskRange">
          <span>{t('mask.previewAlpha', '预览 {value}%', { value: maskState.overlayAlpha })}</span>
          <input type="range" min="15" max="90" value={maskState.overlayAlpha} onChange={(event) => updateMaskState({ overlayAlpha: Number(event.target.value) })} />
        </label>
        <label className="maskRange">
          <span>{t('mask.canvasZoom', '画布 {value}%', { value: Math.round(maskState.zoom * 100) })}</span>
          <input type="range" min="20" max="140" value={Math.round(maskState.zoom * 100)} onChange={(event) => updateMaskState({ zoom: clamp(Number(event.target.value) / 100, 0.2, 1.4) })} />
        </label>
        <div className="maskToolGroup">
          <button type="button" onClick={undo} disabled={!canUndo} aria-label={t('mask.undo', '撤销 mask')}>
            <Undo2 size={15} />
          </button>
          <button type="button" onClick={redo} disabled={!canRedo} aria-label={t('mask.redo', '重做 mask')}>
            <Redo2 size={15} />
          </button>
          <button type="button" onClick={invertMask} disabled={!imageFile}>
            <FlipHorizontal size={15} />
            {t('mask.invert', '反转')}
          </button>
          <button type="button" onClick={clearMask} disabled={!imageFile}>
            {t('gallery.clear', '清空')}
          </button>
        </div>
        <div className="maskToolGroup maskExportGroup">
          <button type="button" onClick={exportMask} disabled={!imageFile}>
            <Download size={15} />
            {t('mask.export', '导出 mask')}
          </button>
          {onGenerate ? (
            <button type="button" className="maskGenerateButton" onClick={onGenerate} disabled={!imageFile || generating}>
              {generating ? <LoaderCircle className="spin" size={15} /> : <Sparkles size={15} />}
              {t('mask.generateWithMask', '用这个生成')}
            </button>
          ) : null}
        </div>
      </div>
      <div className="maskCanvasWrap" ref={wrapRef}>
        {imageFile ? (
          <div className="maskCanvasStack">
            <canvas ref={imageCanvasRef} />
            <canvas
              ref={maskCanvasRef}
              className="maskPaintCanvas"
              onPointerDown={startStroke}
              onPointerMove={moveStroke}
              onPointerUp={finishStroke}
              onPointerCancel={finishStroke}
              onPointerLeave={finishStroke}
            />
            <canvas ref={cursorCanvasRef} className="maskCursorCanvas" />
          </div>
        ) : (
          <div className="maskCanvasEmpty">
            <ScanLine size={30} />
            <strong>{t('mask.emptyTitle', '上传一张参考图开始制作 mask')}</strong>
            <span>{t('mask.emptyHint', '涂抹区域会在生成时被重绘，未涂区域会保留。')}</span>
          </div>
        )}
      </div>
      <div className="maskMetaLine">
        <span>{imageFile ? `${maskState.imageName} · ${maskState.imageSize.width}×${maskState.imageSize.height}` : t('mask.sizeAuto', 'Mask 尺寸会自动匹配当前参考图')}</span>
        <span>{t('mask.transparentMeansRedraw', '透明区 = 要重绘')}</span>
      </div>
    </div>
  );
});
