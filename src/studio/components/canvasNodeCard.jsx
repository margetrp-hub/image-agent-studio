// CanvasNodeCard — renders a single node on the infinite canvas. Pure
// presentation: all handlers (drag, resize, link, editor actions, toolbar
// actions) are passed in from CreationDesk so the card itself stays free of
// business logic and state ownership. Geometry helpers come from
// canvasGeometry.js, asset/download helpers from the shared util modules.

import { Copy, Download, ImageIcon, Redo2, Search, Sparkles, SquarePen, Trash2, X } from 'lucide-react';

import { ProtectedStudioImage } from './media.jsx';
import { displayResultUrl } from '../util/assets.js';
import { compact } from '../util/formatters.js';
import { buildStudioDownloadFilename, resultExtension, resultVideoExtension } from '../util/resultFiles.js';
import { nodeHeight, nodeWidth } from '../util/canvasGeometry.js';

export function CanvasNodeCard({
  node,
  outputFormat,
  currentDownloadMeta,
  visibleCanvasNodeIds,
  canvasPerformanceMode,
  selectedCanvasNodeId,
  childNodeIds,
  parentNodeIds,
  linkedNodeIds,
  canvasLinkDraft,
  canvasEditorNodeId,
  canvasEditorPrompt,
  canvasEditorMode,
  status,
  generationActionClass,
  generationActionDisabled,
  generationActionLabel,
  t,
  onStartNodeDrag,
  onStartNodeResize,
  onFinishCanvasLink,
  onStartCanvasLink,
  onMediaClick,
  onOpenEditor,
  onCloseEditor,
  onEditorPromptChange,
  onEditorModeChange,
  onPreview,
  onSetAsReference,
  onCopyPrompt,
  onDelete,
  onGenerateFromEditor
}) {
  const nodeIndex = Math.max(0, (node.canvasIndex || 1) - 1);
  const currentNodeWidth = nodeWidth(node);
  const currentNodeHeight = nodeHeight(node);
  const nodeIsVisible = visibleCanvasNodeIds.has(node.id);
  const nodeIsVirtualized = canvasPerformanceMode && !nodeIsVisible;
  const nodeExtension = node.kind === 'video' ? resultVideoExtension(node.url) : resultExtension(node.url, outputFormat);
  const nodeDownloadName = buildStudioDownloadFilename({
    ...(node.downloadMeta || currentDownloadMeta || {}),
    mode: node.kind === 'video' ? 'video' : 'image',
    index: nodeIndex,
    extension: nodeExtension
  });

  return (
    <div
      className={`canvasNode resultNode graphNode ${selectedCanvasNodeId === node.id ? 'selected' : ''} ${childNodeIds.has(node.id) ? 'lineageChild' : ''} ${parentNodeIds.has(node.id) ? 'lineageParent' : ''} ${linkedNodeIds.has(node.id) ? 'linkingRelated' : ''} ${canvasLinkDraft?.fromId === node.id ? 'linkingSource' : ''} ${canvasEditorNodeId === node.id ? 'editing' : ''} ${nodeIsVirtualized ? 'virtualized' : ''}`}
      key={node.id}
      style={{
        left: `calc(50% + ${node.x}px)`,
        top: `calc(50% + ${node.y}px)`,
        width: currentNodeWidth,
        height: currentNodeHeight
      }}
      data-node-id={node.id}
      onPointerDown={(event) => onStartNodeDrag(event, node)}
      onDoubleClick={(event) => {
        event.stopPropagation();
        onOpenEditor(node);
      }}
    >
      <button
        type="button"
        className="canvasPort canvasPortIn"
        data-node-id={node.id}
        onPointerDown={(event) => onFinishCanvasLink(event, node)}
        aria-label={`${t('canvas.connectTo', '连接到这张图')} #${node.canvasIndex || ''}`}
        title={t('canvas.connectTo', '连接到这张图')}
      />
      <button
        type="button"
        className="canvasPort canvasPortOut"
        data-node-id={node.id}
        onPointerDown={(event) => onStartCanvasLink(event, node)}
        aria-label={`${t('canvas.dragConnect', '拖到另一张图建立关联')} #${node.canvasIndex || ''}`}
        title={t('canvas.dragConnect', '拖到另一张图建立关联')}
      />
      <button
        type="button"
        className="canvasNodeMedia"
        onClick={(event) => onMediaClick(event, node)}
        onDoubleClick={(event) => {
          event.stopPropagation();
          onOpenEditor(node);
        }}
      >
        {nodeIsVirtualized ? (
          <div className="canvasNodePlaceholder">
            <ImageIcon size={20} />
            <strong>#{node.canvasIndex || ''}</strong>
            <span>{compact(node.prompt || node.title || '', 32)}</span>
          </div>
        ) : node.kind === 'video' ? (
          <video src={displayResultUrl(node.url)} playsInline preload="metadata" />
        ) : (
          <>
            <ProtectedStudioImage
              src={displayResultUrl(node.url)}
              alt={node.title}
              fallback={<span className="canvasNodeMissing">{t('canvas.recovering', '图片正在恢复，若仍为空请从历史图库重新打开本次会话')}</span>}
            />
          </>
        )}
      </button>
      <span className="canvasNodeLabel">#{node.canvasIndex || ''}</span>
      <button
        type="button"
        className="canvasNodeContinue"
        onClick={(event) => {
          event.stopPropagation();
          onOpenEditor(node);
        }}
      >
        <SquarePen size={13} />
        {t('canvas.continueEdit', '继续优化')}
      </button>
      <div className="canvasNodeToolbar" onClick={(event) => event.stopPropagation()}>
        <button type="button" onClick={() => onPreview(node)} aria-label={`${t('canvas.preview', '预览')} #${node.canvasIndex || ''}`} title={t('canvas.preview', '预览')}>
          <Search size={13} />
        </button>
        <button type="button" onClick={() => onOpenEditor(node)} aria-label={`${t('canvas.continueEdit', '继续优化')} #${node.canvasIndex || ''}`} title={t('canvas.continueEdit', '继续优化')}>
          <SquarePen size={13} />
        </button>
        {node.kind !== 'video' ? (
          <button type="button" onClick={() => onSetAsReference(node)} aria-label={`${t('canvas.setReference', '设为参考')} #${node.canvasIndex || ''}`} title={t('canvas.setReference', '设为参考')}>
            <ImageIcon size={13} />
          </button>
        ) : null}
        <button type="button" onClick={() => onCopyPrompt(node)} disabled={!node.prompt} aria-label={`${t('canvas.copyPrompt', '复制提示词')} #${node.canvasIndex || ''}`} title={t('canvas.copyPrompt', '复制提示词')}>
          <Copy size={13} />
        </button>
        <a href={displayResultUrl(node.url)} download={nodeDownloadName} aria-label={`${t('canvas.download', '下载')} #${node.canvasIndex || ''}`} title={t('canvas.download', '下载')}>
          <Download size={13} />
        </a>
        <button type="button" onClick={() => onDelete(node)} aria-label={`${t('canvas.delete', '删除')} #${node.canvasIndex || ''}`} title={t('canvas.delete', '删除')}>
          <Trash2 size={13} />
        </button>
      </div>
      {canvasEditorNodeId === node.id ? (
        <div className="canvasInlineEditor" onClick={(event) => event.stopPropagation()}>
          <div className="canvasInlineEditorHead">
            <strong>{t('canvas.inlineContinue', '#{index} 继续优化', { index: node.canvasIndex || '' })}</strong>
            <button type="button" onClick={onCloseEditor} aria-label={t('settings.close', '关闭')}>
              <X size={13} />
            </button>
          </div>
          <textarea
            value={canvasEditorPrompt}
            onChange={(event) => onEditorPromptChange(event.target.value)}
            placeholder={t('canvas.inlinePlaceholder', '输入这一轮要补充、调整或重绘的地方')}
            autoFocus
          />
          <div className="canvasInlineModes" role="group" aria-label={t('canvas.continueMode', '续作方式')}>
            <button type="button" className={canvasEditorMode === 'image' ? 'active' : ''} onClick={() => onEditorModeChange('image')}>{t('canvas.derive', '衍生')}</button>
            <button type="button" className={canvasEditorMode === 'edit' ? 'active' : ''} onClick={() => onEditorModeChange('edit')}>{t('canvas.referenceEdit', '参考编辑')}</button>
            <button type="button" className={canvasEditorMode === 'mask' ? 'active' : ''} onClick={() => onEditorModeChange('mask')}>Mask</button>
          </div>
          {canvasEditorMode === 'image' ? <p>{t('canvas.deriveHint', '只继承提示词和画布关系，不把原图作为参考图。')}</p> : null}
          {canvasEditorMode === 'edit' ? <p>{t('canvas.editHint', '会把这张图作为参考图，调用 /v1/images/edits。')}</p> : null}
          {canvasEditorMode === 'mask' ? <p>{t('canvas.maskHint', '先在 Mask 面板涂抹要重绘的区域，再用这个节点继续生成。')}</p> : null}
          <button
            type="button"
            className={`canvasInlineGenerate ${generationActionClass}`}
            onClick={() => onGenerateFromEditor(node)}
            disabled={generationActionDisabled}
          >
            {status === 'error' ? <Redo2 size={14} /> : <Sparkles size={14} />}
            {generationActionLabel}
          </button>
        </div>
      ) : null}
      <button
        type="button"
        className="canvasNodeResize"
        onPointerDown={(event) => onStartNodeResize(event, node)}
        aria-label={`${t('canvas.resize', '拖拽调整窗口大小')} #${node.canvasIndex || ''}`}
        title={t('canvas.resize', '拖拽调整窗口大小')}
      />
      <small>{compact(node.prompt, 46)}</small>
      {selectedCanvasNodeId === node.id && !childNodeIds.size ? (
        <div className="canvasNextHint">
          <strong>{t('canvas.continueTitle', '继续这张图')}</strong>
          <span>{t('canvas.continueHint', '在下方会话补充要求，或点右上角继续优化。')}</span>
        </div>
      ) : null}
    </div>
  );
}
