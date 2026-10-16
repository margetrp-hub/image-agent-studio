// CanvasNodeCard — renders a single node on the infinite canvas. Pure
// presentation: all handlers (drag, resize, link, editor actions, toolbar
// actions) are passed in from CreationDesk so the card itself stays free of
// business logic and state ownership. Geometry helpers come from
// canvasGeometry.js, asset/download helpers from the shared util modules.

import { memo, useLayoutEffect, useMemo, useRef } from 'react';
import { Copy, Download, ImageIcon, Ratio, Redo2, Search, Share2, Shuffle, Sparkles, SquarePen, Trash2, X } from 'lucide-react';

import { ProtectedStudioImage } from './media.jsx';
import { displayResultUrl } from '../util/assets.js';
import { compact } from '../util/formatters.js';
import { buildStudioDownloadFilename, resultExtension, resultVideoExtension } from '../util/resultFiles.js';
import { nodeHeight, nodeWidth } from '../util/canvasGeometry.js';
import { buildCanvasContinuationPlan } from '../generation/promptComposition.js';

function workflowLabelForMode(mode, t) {
  if (mode === 'video') return t('canvas.workflowVideo', '视频');
  if (mode === 'edit') return t('canvas.workflowEdit', '参考编辑');
  return t('canvas.workflowImage', '图片');
}

function workflowArrowSummary(lineage = [], t) {
  if (!lineage.length) return t('canvas.workflowSingle', '#1');
  return lineage.map((step, index) => `#${step.index || index + 1}`).join(' → ');
}

function workflowRowsForNode(node, instruction, mode, t) {
  const plan = (mode === 'image' || mode === 'video')
    ? buildCanvasContinuationPlan(node, instruction, { mode })
    : null;
  const workflow = plan?.workflow || node.workflow || null;
  const lineage = Array.isArray(plan?.lineage)
    ? plan.lineage
    : Array.isArray(workflow?.lineage)
      ? workflow.lineage
      : [];
  const rootPrompt = plan?.rootPrompt || workflow?.rootPrompt || node.generationPrompt || node.prompt || '';
  const previousPrompt = plan?.previousPrompt || node.generationPrompt || node.prompt || '';
  const changePrompt = plan?.changePrompt || instruction || '';
  const generationPrompt = plan?.generationPrompt || node.generationPrompt || node.prompt || '';
  const rows = [
    [t('canvas.workflowRoot', 'Root'), rootPrompt],
    [t('canvas.workflowPrevious', 'Previous'), previousPrompt],
    [t('canvas.workflowChange', 'This change'), changePrompt || t('canvas.workflowChangeEmpty', '输入本轮修改后会写入链路')],
    [t('canvas.workflowFinal', 'Final prompt'), generationPrompt]
  ].filter(([, value]) => String(value || '').trim());
  return {
    mode: plan?.mode || mode || node.kind || 'image',
    lineage,
    rows
  };
}

const CARD_ACTIONS = [
  'onStartNodeDrag', 'onStartNodeResize', 'onFinishCanvasLink', 'onStartCanvasLink',
  'onMediaClick', 'onOpenEditor', 'onCloseEditor', 'onEditorPromptChange', 'onEditorModeChange',
  'onPreview', 'onShare', 'onSetAsReference', 'onCopyPrompt', 'onDelete', 'onGenerateFromEditor', 'onReroll'
];
const EMPTY_OPTIONS = [];

function CanvasNodePlaceholder({ node }) {
  return <div className="canvasNodePlaceholder">
    <ImageIcon size={20} />
    <strong>#{node.canvasIndex || ''}</strong>
    <span>{compact(node.prompt || node.title || '', 32)}</span>
  </div>;
}

export function CanvasNodeCard(props) {
  const latestProps = useRef(props);
  useLayoutEffect(() => { latestProps.current = props; });
  const actions = useMemo(() => Object.fromEntries(CARD_ACTIONS.map((name) => [name, (...args) => {
    const current = latestProps.current;
    if (name === 'onShare') args[2] ||= current.node.downloadMeta || current.currentDownloadMeta;
    return current[name]?.(...args);
  }])), []);
  const { node, canvasZoom = 1 } = props;
  const selected = props.selectedCanvasNodeId === node.id;
  const editing = props.canvasEditorNodeId === node.id;
  const downloadMeta = node.downloadMeta || props.currentDownloadMeta;
  const nodeDownloadName = useMemo(() => buildStudioDownloadFilename({
    ...(downloadMeta || {}),
    mode: node.kind === 'video' ? 'video' : 'image',
    index: Math.max(0, (node.canvasIndex || 1) - 1),
    extension: node.kind === 'video' ? resultVideoExtension(node.url) : resultExtension(node.url, props.outputFormat)
  }), [downloadMeta, node.kind, node.canvasIndex, node.url, props.outputFormat]);

  // Project global selection/visibility sets into scalars. Unrelated camera,
  // editor and progress changes can then skip the expensive card subtree.
  return <MemoizedCanvasNodeCard
    {...actions}
    node={node}
    nodeDownloadName={nodeDownloadName}
    nodeIsVirtualized={props.canvasPerformanceMode && !props.visibleCanvasNodeIds.has(node.id)}
    mediaIsPlaceholder={canvasZoom < 0.2 && !selected && !editing}
    selected={selected}
    child={props.childNodeIds.has(node.id)}
    parent={props.parentNodeIds.has(node.id)}
    linked={props.linkedNodeIds.has(node.id)}
    linkingSource={props.canvasLinkDraft?.fromId === node.id}
    showNextHint={props.selectedCanvasNodeId === node.id && !props.childNodeIds.size}
    editing={editing}
    canvasEditorPrompt={editing ? props.canvasEditorPrompt : ''}
    canvasEditorMode={editing ? props.canvasEditorMode : ''}
    status={editing ? props.status : ''}
    generationActionClass={editing ? props.generationActionClass : ''}
    generationActionDisabled={editing ? props.generationActionDisabled : false}
    generationActionLabel={editing ? props.generationActionLabel : ''}
    imageAspectOptions={editing ? props.imageAspectOptions || EMPTY_OPTIONS : EMPTY_OPTIONS}
    onShare={props.onShare ? actions.onShare : undefined}
    onReroll={props.onReroll ? actions.onReroll : undefined}
    t={props.t}
  />;
}

const MemoizedCanvasNodeCard = memo(function CanvasNodeContent({
  node,
  nodeDownloadName,
  nodeIsVirtualized,
  mediaIsPlaceholder,
  selected,
  child,
  parent,
  linked,
  linkingSource,
  showNextHint,
  editing,
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
  onShare,
  onSetAsReference,
  onCopyPrompt,
  onDelete,
  onGenerateFromEditor,
  onReroll,
  imageAspectOptions = []
}) {
  const nodeIndex = Math.max(0, (node.canvasIndex || 1) - 1);
  const currentNodeWidth = nodeWidth(node);
  const currentNodeHeight = nodeHeight(node);
  const workflowPreview = editing
    ? workflowRowsForNode(node, canvasEditorPrompt, canvasEditorMode, t)
    : null;

  return (
    <div
      className={`canvasNode resultNode graphNode ${selected ? 'selected' : ''} ${child ? 'lineageChild' : ''} ${parent ? 'lineageParent' : ''} ${linked ? 'linkingRelated' : ''} ${linkingSource ? 'linkingSource' : ''} ${editing ? 'editing' : ''} ${nodeIsVirtualized ? 'virtualized' : ''}`}
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
      {nodeIsVirtualized ? (
        <div className="canvasNodeMedia">
          <CanvasNodePlaceholder node={node} />
        </div>
      ) : <>
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
        {mediaIsPlaceholder ? <CanvasNodePlaceholder node={node} /> : node.kind === 'video' ? (
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
        {onShare ? (
          <button type="button" onClick={() => onShare(node.url, nodeIndex, node.downloadMeta)} aria-label={`${t('canvas.shareResult', '分享生成结果')} #${node.canvasIndex || ''}`} title={t('canvas.shareResult', '分享生成结果')}>
            <Share2 size={13} />
          </button>
        ) : null}
        <button type="button" onClick={() => onDelete(node)} aria-label={`${t('canvas.delete', '删除')} #${node.canvasIndex || ''}`} title={t('canvas.delete', '删除')}>
          <Trash2 size={13} />
        </button>
      </div>
      {editing ? (
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
          {workflowPreview ? (
            <details className="canvasWorkflowPreview">
              <summary>
                <span>{t('canvas.workflowTitle', '提示词链路')}</span>
                <em>{workflowArrowSummary(workflowPreview.lineage, t)} · {workflowLabelForMode(workflowPreview.mode, t)}</em>
              </summary>
              <div className="canvasWorkflowRows">
                {workflowPreview.rows.map(([label, value]) => (
                  <section key={label}>
                    <span>{label}</span>
                    <p title={String(value || '')}>{value}</p>
                  </section>
                ))}
              </div>
              {workflowPreview.lineage.length > 1 ? (
                <div className="canvasWorkflowTimeline">
                  <span className="canvasWorkflowTimelineTitle">{t('canvas.workflowTimeline', '版本演进')}</span>
                  <ol>
                    {workflowPreview.lineage.map((step, index) => {
                      const stepIndex = step.index || index + 1;
                      const isLatest = index === workflowPreview.lineage.length - 1;
                      return (
                        <li key={`${stepIndex}-${index}`} className={isLatest ? 'latest' : ''}>
                          <em>#{stepIndex} · {workflowLabelForMode(step.mode, t)}{isLatest ? ` · ${t('canvas.workflowTimelineLatest', '本轮')}` : ''}</em>
                          <p title={String(step.prompt || '')}>{step.prompt}</p>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              ) : null}
            </details>
          ) : null}
          <div className="canvasInlineModes" role="group" aria-label={t('canvas.continueMode', '续作方式')}>
            <button type="button" className={canvasEditorMode === 'image' ? 'active' : ''} onClick={() => onEditorModeChange('image')}>{t('canvas.derive', '衍生')}</button>
            <button type="button" className={canvasEditorMode === 'edit' ? 'active' : ''} onClick={() => onEditorModeChange('edit')}>{t('canvas.referenceEdit', '参考编辑')}</button>
            <button type="button" className={canvasEditorMode === 'mask' ? 'active' : ''} onClick={() => onEditorModeChange('mask')}>Mask</button>
          </div>
          {canvasEditorMode === 'image' ? <p>{t('canvas.deriveHint', '只继承提示词和画布关系，不把原图作为参考图。')}</p> : null}
          {canvasEditorMode === 'edit' ? <p>{t('canvas.editHint', '会把这张图作为参考图，调用 /v1/images/edits。')}</p> : null}
          {canvasEditorMode === 'mask' ? <p>{t('canvas.maskHint', '先在 Mask 面板涂抹要重绘的区域，再用这个节点继续生成。')}</p> : null}
          {node.kind !== 'video' && onReroll ? (
            <div className="canvasInlineReroll">
              <span className="canvasInlineRerollLabel">{t('canvas.rerollTitle', '快捷重出（沿用本图提示词，不写入本轮修改）')}</span>
              <div className="canvasInlineRerollActions">
                <button
                  type="button"
                  onClick={() => onReroll(node, {})}
                  disabled={generationActionDisabled}
                  title={t('canvas.rerollVariantHint', '用相同提示词与比例再生成一张，得到不同结果')}
                >
                  <Shuffle size={13} />
                  {t('canvas.rerollVariant', '生成变体')}
                </button>
                {imageAspectOptions
                  .filter((option) => option.value !== 'custom')
                  .map((option) => (
                    <button
                      type="button"
                      key={option.value}
                      onClick={() => onReroll(node, { aspect: option.value })}
                      disabled={generationActionDisabled}
                      title={t('canvas.rerollAspectHint', '换成 {label} 比例重出', { label: option.label })}
                    >
                      <Ratio size={13} />
                      {option.label}
                    </button>
                  ))}
              </div>
            </div>
          ) : null}
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
      {showNextHint ? (
        <div className="canvasNextHint">
          <strong>{t('canvas.continueTitle', '继续这张图')}</strong>
          <span>{t('canvas.continueHint', '在下方会话补充要求，或点右上角继续优化。')}</span>
        </div>
      ) : null}
      </>}
    </div>
  );
});
