import { Focus, Maximize2, Minus, Plus, RotateCcw } from 'lucide-react';
import '../../styles/studio.canvas-view-toolbar.css';

export function CanvasViewToolbar({ zoom, hasNodes, hasSelection, onZoom, onReset, onFit, onFocus, t }) {
  return <div className="canvasViewToolbar" role="group" aria-label={t('canvas.toolbar', '画布工具')}>
    <button type="button" onClick={() => onZoom((value) => value - 0.1)} aria-label={t('canvas.zoomOut', '缩小画布')} title={`${t('canvas.zoomOut', '缩小画布')} Ctrl/Cmd + -`}><Minus size={15} /></button>
    <span>{Math.round(zoom * 100)}%</span>
    <button type="button" onClick={() => onZoom((value) => value + 0.1)} aria-label={t('canvas.zoomIn', '放大画布')} title={`${t('canvas.zoomIn', '放大画布')} Ctrl/Cmd + +`}><Plus size={15} /></button>
    <button type="button" onClick={onReset} aria-label={t('canvas.reset', '重置')} title={`${t('canvas.reset', '重置')} Ctrl/Cmd + 0`}><RotateCcw size={15} /></button>
    <button type="button" onClick={onFit} disabled={!hasNodes} aria-label={t('canvas.fitAll', '显示全部图片')} title={t('canvas.fitAll', '显示全部图片')}><Maximize2 size={15} /></button>
    <button type="button" onClick={onFocus} disabled={!hasSelection} aria-label={t('canvas.focusSelected', '定位选中图片')} title={t('canvas.focusSelected', '定位选中图片')}><Focus size={15} /></button>
  </div>;
}
