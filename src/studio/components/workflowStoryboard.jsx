import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Film,
  ImageIcon,
  Images,
  Play,
  Search,
  Sparkles,
  Video
} from 'lucide-react';

import { buildWorkflowScenes, workflowStats } from '../workflow/storyboard.js';
import { ProtectedStudioImage } from './media.jsx';
import { displayResultUrl } from '../util/assets.js';
import { compact } from '../util/formatters.js';

export function WorkflowStoryboard({
  nodes = [],
  queueItems = [],
  selectedNodeId = '',
  videoModel = '',
  videoAspect = '',
  videoDuration = '',
  t,
  onSelect,
  onPreview,
  onContinue,
  onPrepareVideo,
  onStartImageBatch,
  onBatchVideo
}) {
  const scenes = useMemo(() => buildWorkflowScenes(nodes), [nodes]);
  const stats = useMemo(() => workflowStats(nodes, queueItems), [nodes, queueItems]);
  const [checkedIds, setCheckedIds] = useState(() => new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const imageNodes = useMemo(() => nodes.filter((node) => node.kind !== 'video' && node.url), [nodes]);

  useEffect(() => {
    const available = new Set(imageNodes.map((node) => node.id));
    setCheckedIds((current) => new Set([...current].filter((id) => available.has(id))));
  }, [imageNodes]);

  const checkedImages = imageNodes.filter((node) => checkedIds.has(node.id));
  const batchTargets = checkedImages.length ? checkedImages : imageNodes;

  const toggleChecked = (nodeId) => {
    setCheckedIds((current) => {
      const next = new Set(current);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };

  return (
    <section className="workflowStoryboard" aria-label={t('workflow.aria', '创作工作流分镜视图')}>
      <header className="workflowStoryboardHead">
        <div>
          <span className="workflowEyebrow">{t('workflow.stage', '创作工作流')}</span>
          <strong>{t('workflow.title', '分镜与批量生成')}</strong>
        </div>
        <div className="workflowStats" aria-label={t('workflow.stats', '工作流统计')}>
          <span><ImageIcon size={13} />{stats.imageCount}</span>
          <span><Video size={13} />{stats.videoCount}</span>
          {stats.activeCount ? <span className="isActive"><Sparkles size={13} />{stats.activeCount}</span> : null}
        </div>
        <div className="workflowPrimaryActions">
          <button type="button" onClick={onStartImageBatch}>
            <Images size={15} />
            {t('workflow.batchImages', '批量生图')}
          </button>
          <button
            type="button"
            className="primary"
            disabled={!imageNodes.length}
            onClick={() => setConfirmOpen(true)}
          >
            <Film size={15} />
            {t('workflow.batchVideo', '批量视频')}
          </button>
        </div>
      </header>

      <div className="workflowStageTrack" aria-hidden="true">
        <span className="done"><Check size={12} />{t('workflow.promptStage', '提示词')}</span>
        <i />
        <span className={stats.imageCount ? 'done' : ''}><ImageIcon size={12} />{t('workflow.keyframeStage', '关键帧')}</span>
        <i />
        <span className={stats.videoCount ? 'done' : ''}><Video size={12} />{t('workflow.videoStage', '视频')}</span>
        <i />
        <span><CheckCircle2 size={12} />{t('workflow.reviewStage', '审核')}</span>
      </div>

      {scenes.length ? (
        <div className="workflowScenes">
          {scenes.map((scene) => (
            <section className="workflowScene" key={scene.id}>
              <div className="workflowSceneHead">
                <div>
                  <span>{t('workflow.scene', '场景 {number}', { number: scene.index })}</span>
                  <strong>{compact(scene.root.prompt || scene.root.title || t('workflow.untitledScene', '未命名场景'), 56)}</strong>
                </div>
                <em>{t('workflow.shotCount', '{count} 个镜头', { count: scene.nodes.length })}</em>
              </div>
              <div className="workflowShotRail">
                {scene.nodes.map((node, index) => {
                  const isVideo = node.kind === 'video';
                  const selected = selectedNodeId === node.id;
                  const checked = checkedIds.has(node.id);
                  return (
                    <article className={`workflowShot${selected ? ' selected' : ''}`} key={node.id}>
                      <button
                        type="button"
                        className="workflowShotMedia"
                        onClick={() => onSelect(node)}
                        aria-label={t('workflow.selectShot', '选择镜头 {number}', { number: node.canvasIndex || index + 1 })}
                      >
                        {isVideo ? (
                          <video src={displayResultUrl(node.url)} muted playsInline preload="metadata" />
                        ) : (
                          <ProtectedStudioImage src={displayResultUrl(node.url)} alt={node.title || ''} />
                        )}
                        <span>#{node.canvasIndex || index + 1}</span>
                        <em>{isVideo ? t('workflow.video', '视频') : t('workflow.keyframe', '关键帧')}</em>
                      </button>
                      {!isVideo ? (
                        <button
                          type="button"
                          className={`workflowShotCheck${checked ? ' checked' : ''}`}
                          onClick={() => toggleChecked(node.id)}
                          aria-label={checked ? t('workflow.unselectBatch', '取消批量选择') : t('workflow.selectBatch', '加入批量选择')}
                          aria-pressed={checked}
                        >
                          <Check size={13} />
                        </button>
                      ) : null}
                      <div className="workflowShotBody">
                        <strong>{node.title || t('workflow.shot', '镜头 {number}', { number: node.canvasIndex || index + 1 })}</strong>
                        <p>{compact(node.prompt || t('workflow.noPrompt', '暂无提示词'), 90)}</p>
                      </div>
                      <div className="workflowShotActions">
                        <button type="button" onClick={() => onPreview(node)} title={t('canvas.preview', '预览')}>
                          <Search size={13} />
                        </button>
                        <button type="button" onClick={() => onContinue(node)}>
                          <Sparkles size={13} />
                          {t('workflow.continue', '继续')}
                        </button>
                        {!isVideo ? (
                          <button type="button" className="primary" onClick={() => onPrepareVideo(node)}>
                            <Play size={13} />
                            {t('workflow.toVideo', '转视频')}
                          </button>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="workflowEmpty">
          <span><Film size={24} /></span>
          <strong>{t('workflow.emptyTitle', '从第一个关键帧开始')}</strong>
          <button type="button" onClick={onStartImageBatch}>
            <Sparkles size={15} />
            {t('workflow.createFirst', '创建图片镜头')}
          </button>
        </div>
      )}

      {confirmOpen ? (
        <div className="workflowBatchBackdrop" role="presentation" onMouseDown={() => setConfirmOpen(false)}>
          <section className="workflowBatchDialog" role="dialog" aria-modal="true" aria-labelledby="workflow-batch-title" onMouseDown={(event) => event.stopPropagation()}>
            <div>
              <span><Film size={18} /></span>
              <div>
                <strong id="workflow-batch-title">{t('workflow.batchConfirmTitle', '确认批量生成视频')}</strong>
                <p>{t('workflow.batchConfirmCount', '将为 {count} 个关键帧分别创建视频任务。', { count: batchTargets.length })}</p>
              </div>
            </div>
            <dl>
              <div><dt>{t('workflow.model', '模型')}</dt><dd>{videoModel || '-'}</dd></div>
              <div><dt>{t('workflow.spec', '规格')}</dt><dd>{videoAspect || '-'} · {videoDuration || '-'}</dd></div>
            </dl>
            <footer>
              <button type="button" onClick={() => setConfirmOpen(false)}>{t('settings.cancel', '取消')}</button>
              <button
                type="button"
                className="primary"
                onClick={() => {
                  setConfirmOpen(false);
                  onBatchVideo(batchTargets);
                }}
              >
                <Play size={14} />
                {t('workflow.confirmBatch', '开始批量生成')}
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </section>
  );
}
