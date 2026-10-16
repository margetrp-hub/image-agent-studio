// galleryWorkspace — the inspiration / template / history library views shown
// in the workspace shell. Bundles four card components (CaseCard,
// PromptCaseCard, VideoInspirationCard, HistoryCard), a HistoryDetailPanel,
// and the GalleryWorkspacePanel orchestrator that switches between
// "inspiration" mode (cases + video inspirations) and "history" mode.
//
// Pulled out of studio.jsx as part of the small-cuts refactor — these
// components only depend on shared util/* helpers and the ProtectedStudioImage
// / Lightbox / ResultGrid / VideoResultGrid / PromptSectionList / ProtectedHistoryThumb
// primitives, so they extract cleanly.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  Filter,
  History,
  ImageIcon,
  Info,
  MessageSquareText,
  Search,
  Share2,
  Sparkles,
  Star,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Upload,
  Video,
  X
} from 'lucide-react';
import '../../styles/studio.gallery-cards.css';

import { compact, templateKey } from '../util/formatters.js';
import { displayResultUrl } from '../util/assets.js';
import { prepareCommunityInspirationDraft } from '../util/share.js';
import { COMMUNITY_LICENSE_NOTICE } from '../util/library.js';
import {
  groupHistorySessions,
  historyResultItems,
  safeImageCandidate
} from '../util/historyView.js';
import {
  buildStudioDownloadFilename,
  downloadMetaFromHistoryItem,
  formatHistoryTime,
  OUTPUT_FORMAT_LABELS,
  QUALITY_LABELS,
  RESOLUTION_TIER_LABELS,
  resultExtension,
  resultVideoExtension
} from '../util/resultFiles.js';
import { VIDEO_ASPECT_OPTIONS, VIDEO_MOTIONS } from '../util/videoOptions.js';
import {
  caseCardMeta,
  hasLibraryPreviewImage,
  imageFallback,
  riskLabel,
  templatePreviewImage,
  templateThumbnail
} from '../util/templates.js';

import { ProtectedHistoryThumb, ProtectedStudioImage } from './media.jsx';
import '../../styles/studio.gallery-filters.css';
import '../../styles/studio.gallery-cards-responsive.css';
import { Lightbox, ResultGrid, VideoLightbox, VideoResultGrid } from './resultDisplay.jsx';

const INITIAL_TEMPLATE_LIMIT = 12;
const TEMPLATE_PAGE_SIZE = 12;

function isUserSubmittedCase(item) {
  const id = String(item?.id || '').toLowerCase();
  const sourceName = String(item?.sourceName || '').toLowerCase();
  return Boolean(
    item?.kind === 'community-prompt'
      || item?.userSubmitted
      || id.startsWith('share-')
      || sourceName === 'user shared'
      || sourceName === '用户分享'
  );
}

function GalleryThumbnail({ src, fallbackSrc, alt }) {
  const holder = useRef(null);
  const [visible, setVisible] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!('IntersectionObserver' in window)) {
      setVisible(true);
      return undefined;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: '160px' });
    observer.observe(holder.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={holder} className={`galleryThumbnail ${loaded ? 'isLoaded' : 'isPending'}`} onLoadCapture={() => setLoaded(true)}>
      {visible ? <ProtectedStudioImage src={src} fallbackSrc={fallbackSrc} alt={alt} fallback={<ImageIcon size={22} />} /> : <ImageIcon size={22} aria-hidden="true" />}
    </div>
  );
}

function CaseCard({ item, selected, onPreview, favorite, onToggleFavorite, onAppend, onReact, t = (key, fallback) => fallback || key }) {
  const image = templateThumbnail(item);
  const fallback = imageFallback(item);
  const meta = caseCardMeta(item);
  const risks = Array.isArray(item.riskTags) ? item.riskTags.slice(0, 3) : [];
  const promptPreview = item.promptPreview || item.prompt || item.summary || '';
  return (
    <div className={`caseTile ${selected ? 'selected' : ''}`}>
      <button
        className="caseTileMain"
        type="button"
        onClick={() => onPreview(item)}
        aria-label={`${t('gallery.preview', '查看')} ${item.title}`}
      >
        <div className="caseMedia">
          {item.generation?.mode === 'video' ? <Video size={24} /> : (image || fallback) ? (
            <GalleryThumbnail
              key={image || fallback}
              src={image || fallback}
              fallbackSrc={image && fallback !== image ? fallback : ''}
              alt={item.imageAlt || item.title}
            />
          ) : null}
        </div>
        <strong>{item.title}</strong>
        {meta ? <em>{meta}</em> : null}
        {risks.length ? (
          <small>{risks.map(riskLabel).join(' / ')}</small>
        ) : null}
      </button>
      {promptPreview ? (
        <button
          type="button"
          className="casePromptButton"
          onClick={(event) => {
            event.stopPropagation();
            onPreview?.(item);
          }}
          aria-label={t('gallery.viewPrompt', '查看提示词')}
          title={t('gallery.viewPrompt', '查看提示词')}
        >
          <Info size={12} />
          <p>{compact(promptPreview, 112)}</p>
        </button>
      ) : null}
      <div className="caseTileActions">
        {item.canWithdraw ? (
          <button type="button" onClick={() => onReact?.(item, 'withdraw')} aria-label={t('gallery.withdrawPublication', '撤回公开分享')} title={t('gallery.withdrawPublication', '撤回公开分享')}>
            <Trash2 size={13} />
          </button>
        ) : null}
        <button type="button" onClick={() => onReact?.(item, 'share')} aria-label={t('gallery.shareToLibrary', '分享到灵感库')} title={t('gallery.shareToLibrary', '分享到灵感库')}>
          <Share2 size={13} />
        </button>
        {onAppend ? (
          <button
            type="button"
            className="appendMiniButton"
            onClick={(event) => {
              event.stopPropagation();
              onAppend(item);
            }}
            aria-label={t('gallery.useTemplate', '选用这个模板')}
            title={t('gallery.useTemplateHint', '选用后带入底部对话框')}
          >
            <Check size={13} />
          </button>
        ) : null}
        <button
          type="button"
          className={`favoriteMiniButton ${favorite ? 'active' : ''}`}
          onClick={(event) => {
            event.stopPropagation();
            onToggleFavorite(item);
          }}
          aria-label={favorite ? t('gallery.unfavoriteTemplate', '取消收藏模板') : t('gallery.favoriteTemplate', '收藏模板')}
          title={favorite ? t('gallery.unfavorite', '取消收藏') : t('gallery.favoriteTemplate', '收藏模板')}
          aria-pressed={favorite}
        >
          <Star size={13} />
        </button>
      </div>
    </div>
  );
}

function PromptCaseCard({ item, selected, onSelect, onPreview, favorite, onToggleFavorite, onAppend, onReact, t = (key, fallback) => fallback || key }) {
  const meta = caseCardMeta(item);
  const promptPreview = item.promptPreview || item.summary || item.prompt || '';
  return (
    <div className={`caseTile promptOnly ${selected ? 'selected' : ''}`}>
      <button className="caseTileMain promptCaseMain" type="button" aria-label={`${t('gallery.viewPrompt', '查看提示词')} ${item.title}`} onClick={() => (onPreview ? onPreview(item) : onSelect(item))}>
        <strong>{item.title}</strong>
        <p className="casePromptExcerpt">{compact(promptPreview, 180) || t('gallery.promptOnlyHint', '这条灵感暂时没有可用图片，但提示词仍可预览和选用。')}</p>
        {meta ? <em>{meta}</em> : null}
      </button>
      <div className="communityPromptStats">
        {item.canWithdraw ? (
          <button type="button" onClick={() => onReact?.(item, 'withdraw')} aria-label={t('gallery.withdrawPublication', '撤回公开分享')} title={t('gallery.withdrawPublication', '撤回公开分享')}>
            <Trash2 size={12} />
          </button>
        ) : null}
        <button type="button" aria-label={t('gallery.upvotePrompt', 'Upvote prompt')} title={t('gallery.upvotePrompt', 'Upvote prompt')} aria-pressed={item.userReaction === 'up'} className={item.userReaction === 'up' ? 'active' : ''} onClick={(event) => { event.stopPropagation(); onReact?.(item, 'up'); }}>
          <ThumbsUp size={12} />
          {item.reactions?.up || 0}
        </button>
        <button type="button" aria-label={t('gallery.downvotePrompt', 'Downvote prompt')} title={t('gallery.downvotePrompt', 'Downvote prompt')} aria-pressed={item.userReaction === 'down'} className={item.userReaction === 'down' ? 'active' : ''} onClick={(event) => { event.stopPropagation(); onReact?.(item, 'down'); }}>
          <ThumbsDown size={12} />
          {item.reactions?.down || 0}
        </button>
        <button type="button" aria-label={t('gallery.copyPrompt', 'Copy prompt')} title={t('gallery.copyPrompt', 'Copy prompt')} onClick={(event) => { event.stopPropagation(); onReact?.(item, 'copy'); }}>
          <Copy size={12} />
          {item.copied || 0}
        </button>
        <button type="button" aria-label={t('gallery.sharePrompt', 'Share prompt')} title={t('gallery.sharePrompt', 'Share prompt')} onClick={(event) => { event.stopPropagation(); onReact?.(item, 'share'); }}>
          <Share2 size={12} />
          {item.shared || 0}
        </button>
      </div>
      <div className="caseTileActions">
        {onAppend ? (
          <button
            type="button"
            className="appendMiniButton promptUseButton"
            onClick={(event) => {
              event.stopPropagation();
              onAppend(item);
            }}
            aria-label={t('gallery.useTemplate', '选用这个模板')}
            title={t('gallery.useTemplateHint', '选用后带入底部对话框')}
          >
            <Check size={13} />
            <span>{t('gallery.usePrompt', '使用提示词')}</span>
          </button>
        ) : null}
        <button
          type="button"
          className={`favoriteMiniButton ${favorite ? 'active' : ''}`}
          onClick={(event) => {
            event.stopPropagation();
            onToggleFavorite(item);
          }}
          aria-label={favorite ? t('gallery.unfavoriteTemplate', '取消收藏模板') : t('gallery.favoriteTemplate', '收藏模板')}
          title={favorite ? t('gallery.unfavorite', '取消收藏') : t('gallery.favoriteTemplate', '收藏模板')}
          aria-pressed={favorite}
        >
          <Star size={13} />
        </button>
      </div>
    </div>
  );
}

function VideoInspirationCard({ item, selected, onSelect }) {
  const meta = [
    item.intent,
    VIDEO_ASPECT_OPTIONS.find((option) => option.value === item.videoAspect)?.label,
    item.videoDuration ? `${item.videoDuration}s` : '',
    VIDEO_MOTIONS.find((option) => option.value === item.videoMotion)?.label
  ].filter(Boolean);
  return (
    <button className={`videoInspirationTile ${selected ? 'selected' : ''}`} type="button" onClick={() => onSelect(item)}>
      <div className="videoInspirationIcon">
        <Video size={18} />
      </div>
      <div>
        <span>{meta.join(' · ')}</span>
        <strong>{item.title}</strong>
        <p>{item.summary}</p>
      </div>
    </button>
  );
}

function HistoryCard({ item, selected, onSelect, onDelete, onShare, t = (key, fallback) => fallback || key }) {
  const resultItems = historyResultItems(item);
  const resultUrl = resultItems[0]?.displayUrl || resultItems[0]?.url || item.displayResultUrls?.[0] || item.resultUrls?.[0] || '';
  const thumbnail = safeImageCandidate(resultUrl || item.case?.image || '');
  const resultCount = resultItems.length || (item.displayResultUrls?.length || item.resultUrls?.length || 0);
  const usage = item.usageSummary || item.costSummary || '';
  const isVideo = item.mode === 'video' || item.kind === 'video';
  const firstResultMeta = downloadMetaFromHistoryItem(resultItems[0] || item, isVideo);
  const extension = isVideo ? resultVideoExtension(resultUrl) : resultExtension(resultUrl, item.outputFormat || 'png');
  const downloadName = buildStudioDownloadFilename({
    ...firstResultMeta,
    index: 0,
    extension
  });
  const meta = isVideo
    ? [item.model, item.aspectRatio || item.aspect, item.duration ? `${item.duration}s` : '', item.fps ? `${item.fps}fps` : '', usage].filter(Boolean)
    : [item.model, item.resolutionTier ? (RESOLUTION_TIER_LABELS[item.resolutionTier] || item.resolutionTier) : item.size, item.quality ? QUALITY_LABELS[item.quality] || item.quality : '', item.outputFormat ? OUTPUT_FORMAT_LABELS[item.outputFormat] || item.outputFormat : '', usage].filter(Boolean);
  return (
    <div className={`historyTile ${selected ? 'selected' : ''}`}>
      <button className="historyOpen" type="button" onClick={() => onSelect(item)}>
        <div className={`historyThumb ${isVideo ? 'videoThumb' : ''}`}>
          {thumbnail && !isVideo ? (
            <ProtectedHistoryThumb
              src={thumbnail}
              alt={item.case?.title || 'History'}
              fallback={<span className="historyThumbFallback"><History size={22} /></span>}
            />
          ) : isVideo ? <Video size={22} /> : <History size={22} />}
          <small>{isVideo ? t('rail.video', '视频') : t('rail.imageCount', '{count} 张', { count: Math.max(1, resultCount) })}</small>
        </div>
        <div>
          <span>{formatHistoryTime(item.createdAt)} · {t('rail.session', '会话')} · {isVideo ? t('rail.video', '视频') : t('rail.imageCount', '{count} 张', { count: Math.max(1, resultCount) })}</span>
          <strong>{isVideo ? t('rail.videoGeneration', '视频生成') : item.case?.title || compact(item.prompt, 24)}</strong>
          <p>{compact(item.prompt, 74)}</p>
          <em>{meta.join(' · ')}</em>
        </div>
      </button>
      <div className="historyActions">
        {resultUrl ? (
          <a href={displayResultUrl(resultUrl)} download={downloadName} onClick={(event) => event.stopPropagation()}>
            <Download size={14} /> {t('canvas.download', '下载')}
          </a>
        ) : null}
        {resultUrl && onShare ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onShare(resultUrl, 0, firstResultMeta);
            }}
            aria-label={t('lightbox.share', '分享到灵感库')}
            title={t('lightbox.share', '分享到灵感库')}
          >
            <Share2 size={14} /> {t('lightbox.share', '分享')}
          </button>
        ) : null}
        <button type="button" onClick={() => onDelete(item)}>
          <Trash2 size={14} /> {t('canvas.delete', '删除')}
        </button>
      </div>
    </div>
  );
}

function HistoryPromptDisclosure({ prompt, onPreview, t = (key, fallback) => fallback || key }) {
  const value = String(prompt || '').trim();
  if (!value) {
    return <p className="promptEmptyText">{t('gallery.promptUnavailable', '暂无可用提示词')}</p>;
  }
  return (
    <div className="historyPromptDisclosure">
      <button
        type="button"
        className="historyPromptToggle"
        aria-haspopup="dialog"
        onClick={onPreview}
      >
        <span>{t('gallery.expandPrompt', '查看完整提示词')}</span>
        <MessageSquareText size={14} />
      </button>
      <p className="historyPromptExcerpt">{compact(value, 280)}</p>
    </div>
  );
}

function HistoryDetailPanel({ item, onOpenWorkspace, onShare, t = (key, fallback) => fallback || key }) {
  const [preview, setPreview] = useState(null);
  useEffect(() => setPreview(null), [item?.id]);

  if (!item) {
    return (
      <section className="workspaceEmptyPanel">
        <History size={34} />
        <h2>{t('gallery.selectHistory', '选择历史图库')}</h2>
        <p>{t('gallery.selectHistoryHint', '左侧会显示图片和视频生成结果。选中后可以查看结果，也可以回到对应创作区继续调整。')}</p>
      </section>
    );
  }

  const isVideo = item.mode === 'video' || item.kind === 'video';
  const resultItems = historyResultItems(item);
  const urls = resultItems.map((result) => result.displayUrl || result.url).filter(Boolean);
  const downloadMeta = downloadMetaFromHistoryItem(item, isVideo);
  const resultMetadata = resultItems.map((result) => downloadMetaFromHistoryItem(result, isVideo));
  const previewMeta = resultMetadata[preview?.index] || downloadMeta;
  const promptItems = resultItems.length ? resultItems : [{ id: item.id, prompt: item.prompt || item.generationPrompt || '' }];
  const meta = isVideo
    ? [item.model, item.aspectRatio || item.aspect, item.duration ? `${item.duration}s` : '', item.fps ? `${item.fps}fps` : ''].filter(Boolean)
    : [item.model, item.resolutionTier ? (RESOLUTION_TIER_LABELS[item.resolutionTier] || item.resolutionTier) : item.size, item.quality ? QUALITY_LABELS[item.quality] || item.quality : '', item.outputFormat ? OUTPUT_FORMAT_LABELS[item.outputFormat] || item.outputFormat : ''].filter(Boolean);
  const openPreview = (url, index) => setPreview({ url, index });
  const movePreview = (direction) => {
    setPreview((current) => {
      if (!current) return current;
      const nextIndex = current.index + direction;
      if (nextIndex < 0 || nextIndex >= urls.length) return current;
      return {
        ...current,
        index: nextIndex,
        url: urls[nextIndex]
      };
    });
  };

  return (
    <section className="historyWorkspacePanel">
      <div className="historyWorkspaceHero">
        <div>
          <span>{isVideo ? t('gallery.videoTask', '视频任务') : t('gallery.imageTask', '图片任务')} · {formatHistoryTime(item.createdAt)}</span>
          <h2>{isVideo ? t('rail.videoGeneration', '视频生成') : item.case?.title || t('gallery.imageGeneration', '图片生成')}</h2>
          <div className="historyPromptSection">
            {promptItems.slice(0, 6).map((result, index) => (
              <article className="historyPromptItem" key={result.id || `${result.displayUrl || result.url || 'prompt'}-${index}`}>
                <strong>#{index + 1}</strong>
                <HistoryPromptDisclosure prompt={result.generationPrompt || result.prompt || item.generationPrompt || item.prompt} onPreview={() => setPreview({ index, promptOnly: true })} t={t} />
              </article>
            ))}
          </div>
          <em>{meta.join(' · ') || t('gallery.historyMetaFallback', '参数以历史图库记录为准')}</em>
        </div>
        <button type="button" className="primaryAction" onClick={() => onOpenWorkspace(isVideo ? 'video' : 'image')}>
          {isVideo ? <Video size={17} /> : <ImageIcon size={17} />}
          {isVideo ? t('gallery.openVideoCreate', '打开视频创作') : t('gallery.openImageCreate', '打开图片创作')}
        </button>
      </div>
      {isVideo ? (
        <VideoResultGrid urls={urls} downloadMeta={downloadMeta} resultMetadata={resultMetadata} onPreview={openPreview} onShare={onShare} t={t} />
      ) : (
        <ResultGrid urls={urls} outputFormat={item.outputFormat || 'png'} downloadMeta={downloadMeta} resultMetadata={resultMetadata} onPreview={openPreview} onShare={onShare} t={t} />
      )}
      {preview ? (
        isVideo && !preview.promptOnly ? (
          <VideoLightbox
            url={preview.url}
            index={preview.index}
            total={urls.length}
            downloadMeta={previewMeta}
            onShare={onShare}
            onPrevious={preview.index > 0 ? () => movePreview(-1) : undefined}
            onNext={preview.index < urls.length - 1 ? () => movePreview(1) : undefined}
            onClose={() => setPreview(null)}
            t={t}
          />
        ) : (
          <Lightbox
            url={preview.url}
            promptOnly={preview.promptOnly}
            index={preview.index}
            total={urls.length}
            outputFormat={previewMeta.outputFormat || item.outputFormat || 'png'}
            downloadMeta={previewMeta}
            onShare={onShare}
            onPrevious={preview.index > 0 ? () => movePreview(-1) : undefined}
            onNext={preview.index < urls.length - 1 ? () => movePreview(1) : undefined}
            onClose={() => setPreview(null)}
            t={t}
          />
        )
      ) : null}
    </section>
  );
}

export function GalleryWorkspacePanel({
  type,
  cases,
  categoryGroups,
  selected,
  onSelect,
  query,
  setQuery,
  category,
  setCategory,
  totalCaseCount,
  loading,
  videoInspirations,
  historyItems,
  historyStatus,
  historyHasMore,
  historyLoadingMore,
  selectedHistoryId,
  onSelectHistory,
  onDeleteHistory,
  onClearHistory,
  onLoadMoreHistory,
  favoriteTemplates,
  showFavoritesOnly,
  onToggleFavoritesOnly,
  onToggleTemplateFavorite,
  onReactTemplate,
  onAppendTemplate,
  onOpenUpload,
  onShareResult,
  licenseNotice,
  onOpenWorkspace,
  t = (key, fallback) => fallback || key
}) {
  const [visibleLimit, setVisibleLimit] = useState(INITIAL_TEMPLATE_LIMIT);
  const [promptLimit, setPromptLimit] = useState(6);
  const [activeKind, setActiveKind] = useState('image');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [galleryPreview, setGalleryPreview] = useState(null);
  const searchInput = useRef(null);
  const isHistory = type === 'history';
  const isVideo = activeKind === 'video';
  const filteredSourceCases = useMemo(() => {
    if (sourceFilter === 'all') return cases;
    return cases.filter((item) => sourceFilter === 'user' ? isUserSubmittedCase(item) : !isUserSubmittedCase(item));
  }, [cases, sourceFilter]);
  const sourceCounts = useMemo(() => ({
    all: cases.length,
    original: cases.filter((item) => !isUserSubmittedCase(item)).length,
    user: cases.filter(isUserSubmittedCase).length
  }), [cases]);
  const [imageCases, promptOnlyCases] = useMemo(() => {
    const images = [];
    const prompts = [];
    filteredSourceCases.forEach((item) => (hasLibraryPreviewImage(item) ? images : prompts).push(item));
    return [images, prompts];
  }, [filteredSourceCases]);
  const visibleCases = imageCases.slice(0, visibleLimit);
  const promptVisibleLimit = imageCases.length ? promptLimit : Math.max(INITIAL_TEMPLATE_LIMIT, promptLimit);
  const visiblePromptCases = promptOnlyCases.slice(0, promptVisibleLimit);
  const visibleLibraryCaseCount = visibleCases.length + visiblePromptCases.length;
  const videoNeedle = query.trim().toLowerCase();
  const visibleVideoInspirations = (videoInspirations || []).filter((item) => {
    if (!videoNeedle) return true;
    return `${item.title} ${item.intent} ${item.summary}`.toLowerCase().includes(videoNeedle);
  });
  const visibleVideoItems = visibleVideoInspirations.slice(0, visibleLimit);
  const videoLocalHasMore = visibleLimit < visibleVideoInspirations.length;
  const historySessionItems = useMemo(() => groupHistorySessions(historyItems || []), [historyItems]);
  const visibleHistoryItems = historySessionItems.slice(0, visibleLimit);
  const historyLocalHasMore = visibleLimit < historySessionItems.length;
  const selectedHistoryItem = useMemo(() => {
    if (!isHistory || !selectedHistoryId) return null;
    return historySessionItems.find((item) => (
      selectedHistoryId === item.id
      || selectedHistoryId === item.sessionId
      || item.recordIds?.includes?.(selectedHistoryId)
    )) || null;
  }, [historySessionItems, isHistory, selectedHistoryId]);

  async function handleGalleryShare(url, index, meta) {
    if (!onShareResult) return;
    const draft = await prepareCommunityInspirationDraft({ url, index, meta });
    onShareResult(draft);
  }

  useEffect(() => {
    setVisibleLimit(INITIAL_TEMPLATE_LIMIT);
    setPromptLimit(6);
  }, [category, query, activeKind, sourceFilter, type, showFavoritesOnly]);

  const resetFilters = () => {
    setQuery('');
    setCategory('All');
    setSourceFilter('all');
    if (showFavoritesOnly) onToggleFavoritesOnly();
    searchInput.current?.focus();
  };

  const useLibraryItem = (item) => {
    onSelect(item);
    onAppendTemplate?.(item);
    onOpenWorkspace?.(item?.kind === 'video-inspiration' || item?.generation?.mode === 'video' ? 'video' : 'image');
  };
  const selectLibraryItem = (item) => {
    openTemplatePreview(item);
  };
  const openTemplatePreview = (item) => {
    const preview = templatePreviewImage(item);
    const fallback = templateThumbnail(item);
    const url = preview || fallback;
    if (!url || item?.imageUnavailable) {
      setGalleryPreview({
        url: '',
        promptOnly: true,
        item,
        index: typeof item?.id === 'number' ? Math.max(0, item.id - 1) : 0,
        downloadMeta: {
          mode: 'library-reference',
          providerId: item?.generation?.providerId || item?.generation?.model || 'library',
          title: item?.title || t('gallery.preview', '查看'),
          prompt: item?.prompt || item?.promptPreview || item?.summary || '',
          generationPrompt: item?.generationPrompt || item?.generation?.generationPrompt || '',
          ...(item?.generation || {}),
          createdAt: item?.createdAt || item?.updatedAt || ''
        }
      });
      return;
    }
    const fallbackUrl = preview && fallback && fallback !== preview ? fallback : '';
    setGalleryPreview({
      url,
      fallbackSrc: fallbackUrl,
      item,
      index: typeof item?.id === 'number' ? Math.max(0, item.id - 1) : 0,
      downloadMeta: {
        mode: 'library-reference',
        providerId: item?.generation?.providerId || item?.generation?.model || 'library',
        title: item?.title || t('gallery.preview', '查看'),
        prompt: item?.prompt || item?.promptPreview || item?.summary || '',
        generationPrompt: item?.generationPrompt || item?.generation?.generationPrompt || '',
        ...(item?.generation || {}),
        createdAt: item?.createdAt || item?.updatedAt || ''
      }
    });
  };

  if (isHistory) {
    return (
      <section className="galleryWorkspacePanel historyGalleryWorkspace" aria-label={t('workspace.history', '历史图库')}>
        <div className="galleryWorkspaceHead">
          <div>
            <span>{t('workspace.history', '历史图库')}</span>
            <h2>{t('gallery.historyTitle', '按会话保留每一次生成')}</h2>
            <p>{t('gallery.historyHint', '点击任意记录会把图片放回画布，并继续基于这一轮创作。')}</p>
          </div>
          <div className="galleryWorkspaceActions">
            {historyItems.length ? (
              <button type="button" className="secondaryButton" onClick={onClearHistory}>
                <Trash2 size={15} />
                {t('gallery.clear', '清空')}
              </button>
            ) : null}
            <button type="button" className="primaryAction" onClick={() => onOpenWorkspace?.('image')}>
              <Sparkles size={16} />
              {t('gallery.backToCreate', '回到创作')}
            </button>
          </div>
        </div>
        {historyItems.length ? (
          <div className="historyGalleryGrid">
            {visibleHistoryItems.map((item) => (
              <HistoryCard
                item={item}
                selected={selectedHistoryId === item.id || selectedHistoryId === item.sessionId}
                onSelect={onSelectHistory}
                onDelete={onDeleteHistory}
                onShare={handleGalleryShare}
                t={t}
                key={item.id}
              />
            ))}
            {historyLocalHasMore || historyHasMore ? (
              <button
                type="button"
                className="loadMoreButton galleryLoadMore"
                onClick={() => {
                  if (historyLocalHasMore) {
                    setVisibleLimit((value) => value + TEMPLATE_PAGE_SIZE);
                    return;
                  }
                  onLoadMoreHistory?.();
                }}
                disabled={!historyLocalHasMore && historyLoadingMore}
              >
                {historyLoadingMore ? t('gallery.loading', '正在加载') : t('gallery.loadMoreHistory', '加载更多历史')}
              </button>
            ) : null}
          </div>
        ) : (
          <div className="workspaceEmptyPanel">
            <History size={34} />
            <h2>{historyStatus === 'loading' ? t('gallery.loadingHistory', '正在加载历史图库') : t('gallery.noHistory', '还没有历史图片')}</h2>
            <p>{t('gallery.noHistoryHint', '生成完成后会自动出现在当前会话和历史图库里。')}</p>
          </div>
        )}
        {historyItems.length ? (
          <HistoryDetailPanel item={selectedHistoryItem} onOpenWorkspace={onOpenWorkspace} onShare={handleGalleryShare} t={t} />
        ) : null}
      </section>
    );
  }

  return (
    <section className="galleryWorkspacePanel inspirationWorkspace" aria-label={t('workspace.inspiration', '灵感库')}>
      <div className="galleryWorkspaceHead">
        <div>
          <h2>{t('gallery.inspirationSquare', '灵感广场')}</h2>
        </div>
        <div className="galleryWorkspaceActions">
          <div className="galleryKindSwitch" role="group" aria-label={t('gallery.inspirationType', '灵感类型')}>
            <button type="button" className={!isVideo ? 'active' : ''} aria-pressed={!isVideo} onClick={() => setActiveKind('image')}>
              <ImageIcon size={15} />
              {t('workspace.image', '图片创作')}
            </button>
            <button type="button" className={isVideo ? 'active' : ''} aria-pressed={isVideo} onClick={() => setActiveKind('video')}>
              <Video size={15} />
              {t('workspace.video', '视频创作')}
            </button>
          </div>
          <button type="button" className="primaryAction" onClick={() => onOpenWorkspace?.(isVideo ? 'video' : 'image')}>
            <MessageSquareText size={16} />
            {t('gallery.openConversation', '打开会话')}
          </button>
        </div>
      </div>
      <div className="galleryWorkspaceToolbar">
        <div className="gallerySearch">
          <Search size={16} />
          <input ref={searchInput} type="search" value={query} onChange={(event) => setQuery(event.target.value)} aria-label={isVideo ? t('gallery.searchVideo', '搜索视频灵感') : t('gallery.searchImage', '搜索图片模板')} placeholder={isVideo ? t('gallery.searchVideo', '搜索视频灵感') : t('gallery.searchImage', '搜索图片模板')} />
          {query ? <button type="button" onClick={() => { setQuery(''); searchInput.current?.focus(); }} aria-label={t('gallery.clear', '清空')} title={t('gallery.clear', '清空')}><X size={15} /></button> : null}
        </div>
        {!isVideo ? (
          <>
            <div className="gallerySourceSwitch" role="group" aria-label={t('gallery.sourceFilter', '灵感来源')}>
              {[
                ['all', t('gallery.sourceAll', '全部'), sourceCounts.all],
                ['original', t('gallery.sourceOriginal', '原始灵感'), sourceCounts.original],
                ['user', t('gallery.sourceUser', '用户上传'), sourceCounts.user]
              ].map(([value, label, count]) => (
                <button
                  type="button"
                  className={sourceFilter === value ? 'active' : ''}
                  key={value}
                  onClick={() => setSourceFilter(value)}
                  aria-pressed={sourceFilter === value}
                >
                  {label}<em>{count}</em>
                </button>
              ))}
            </div>
            <label className="galleryCategoryFilter">
              <Filter size={15} />
              <select value={category} onChange={(event) => setCategory(event.target.value)} aria-label={t('gallery.categoryFilter', '分类筛选')}>
                <option value="All">{t('gallery.allCategories', '全部分类')}</option>
                {categoryGroups.map((group) => <option value={group.id} key={group.id}>{group.label} · {group.count}</option>)}
              </select>
            </label>
            <button
              type="button"
              className="galleryFilterButton uploadInspirationButton"
              onClick={onOpenUpload}
            >
              <Upload size={15} />
              {t('gallery.uploadInspiration', '上传灵感')}
            </button>
            <button
              type="button"
              className={`galleryFilterButton galleryFavoritesFilter ${showFavoritesOnly ? 'active' : ''}`}
              onClick={onToggleFavoritesOnly}
              aria-pressed={showFavoritesOnly}
            >
              <Star size={15} />
              {showFavoritesOnly ? t('gallery.favorited', '已收藏') : t('gallery.favoriteCount', '收藏 {count}', { count: favoriteTemplates.size })}
            </button>
          </>
        ) : null}
      </div>
      <div className="galleryResultsSummary" role="status" aria-live="polite" aria-atomic="true">
        {isVideo ? <Video size={14} /> : <ImageIcon size={14} />}
        <span>{isVideo ? `${visibleVideoItems.length} / ${visibleVideoInspirations.length}` : `${visibleLibraryCaseCount} / ${filteredSourceCases.length}`}</span>
        {(query || (!isVideo && (category !== 'All' || sourceFilter !== 'all' || showFavoritesOnly))) ? (
          <button type="button" onClick={resetFilters}><X size={13} />{t('canvas.reset', '重置')}</button>
        ) : null}
      </div>
      <div className="inspirationCanvasGrid">
        {loading ? (
          <div className="workspaceEmptyPanel">
            <ImageIcon size={34} />
            <h2>{t('gallery.loadingInspiration', '正在加载灵感')}</h2>
            <p>{t('gallery.loadingInspirationHint', '素材库和提示词加载完成后会出现在这里。')}</p>
          </div>
        ) : isVideo ? (
          visibleVideoInspirations.length ? (
            <>
              {visibleVideoItems.map((item) => (
            <VideoInspirationCard item={item} selected={selected?.id === item.id} onSelect={selectLibraryItem} key={item.id} />
              ))}
              {videoLocalHasMore ? (
                <button type="button" className="loadMoreButton galleryLoadMore" onClick={() => setVisibleLimit((value) => value + TEMPLATE_PAGE_SIZE)}>
                  {t('gallery.loadMoreCount', '加载更多 {visible}/{total}', { visible: Math.min(visibleLimit, visibleVideoInspirations.length), total: visibleVideoInspirations.length })}
                </button>
              ) : null}
            </>
          ) : (
            <div className="workspaceEmptyPanel">
              <Video size={34} />
              <h2>{t('gallery.noVideoMatch', '没有匹配的视频灵感')}</h2>
              <p>{t('gallery.tryAnotherKeyword', '换一个关键词再试试。')}</p>
            </div>
          )
        ) : filteredSourceCases.length ? (
          <>
            {visibleCases.map((item) => (
              <CaseCard
                item={item}
                selected={selected?.id === item.id}
                onPreview={openTemplatePreview}
                favorite={favoriteTemplates.has(templateKey(item))}
                onToggleFavorite={onToggleTemplateFavorite}
                onAppend={useLibraryItem}
                onReact={onReactTemplate}
                t={t}
                key={item.id}
              />
            ))}
            {visibleCases.length < imageCases.length ? (
              <button type="button" className="loadMoreButton galleryLoadMore galleryImageLoadMore" onClick={() => setVisibleLimit((value) => value + TEMPLATE_PAGE_SIZE)}>
                {t('gallery.loadMoreCount', '加载更多 {visible}/{total}', { visible: visibleCases.length, total: imageCases.length })}
              </button>
            ) : null}
            {promptOnlyCases.length ? (
              <section className="promptOnlyZone" aria-label={t('gallery.promptZone', '提示词专区')}>
                <div className="promptOnlyZoneHead">
                  <div>
                    <MessageSquareText size={16} />
                    <h3>{t('gallery.promptZone', '提示词专区')}</h3>
                  </div>
                  <em>{promptOnlyCases.length}</em>
                </div>
                <div className="promptOnlyGrid">
                  {visiblePromptCases.map((item) => (
                    <PromptCaseCard
                      item={item}
                      selected={selected?.id === item.id}
                      onSelect={selectLibraryItem}
                      onPreview={openTemplatePreview}
                      favorite={favoriteTemplates.has(templateKey(item))}
                      onToggleFavorite={onToggleTemplateFavorite}
                      onReact={onReactTemplate}
                      onAppend={useLibraryItem}
                      t={t}
                      key={item.id}
                    />
                  ))}
                </div>
                {visiblePromptCases.length < promptOnlyCases.length ? (
                  <button type="button" className="loadMoreButton galleryLoadMore galleryPromptLoadMore" onClick={() => setPromptLimit(promptVisibleLimit + 6)}>
                    {t('gallery.loadMoreCount', '加载更多 {visible}/{total}', { visible: visiblePromptCases.length, total: promptOnlyCases.length })}
                  </button>
                ) : null}
              </section>
            ) : null}
          </>
        ) : (
          <div className="workspaceEmptyPanel galleryEmptyState">
            <Search size={28} />
            <h2>{t('gallery.tryAnotherKeyword', '换一个关键词再试试。')}</h2>
            <button type="button" className="secondaryButton" onClick={resetFilters}>{t('canvas.reset', '重置')}</button>
          </div>
        )}
      </div>
      {!isVideo ? (
        <div className="galleryLicenseLine">
          <span>{licenseNotice?.name || COMMUNITY_LICENSE_NOTICE.name}</span>
          <p>{licenseNotice?.notice || licenseNotice?.text || COMMUNITY_LICENSE_NOTICE.text}</p>
          <a href={licenseNotice?.url || COMMUNITY_LICENSE_NOTICE.url} target="_blank" rel="noreferrer">CC BY 4.0</a>
          <strong>{`${filteredSourceCases.length}/${totalCaseCount}`}</strong>
        </div>
      ) : null}
      <Lightbox
        url={galleryPreview?.url}
        promptOnly={galleryPreview?.promptOnly}
        fallbackSrc={galleryPreview?.fallbackSrc || ''}
        index={galleryPreview?.index || 0}
        downloadMeta={galleryPreview?.downloadMeta}
        onShare={handleGalleryShare}
        onUse={galleryPreview?.item ? () => {
          const item = galleryPreview.item;
          setGalleryPreview(null);
          useLibraryItem(item);
        } : undefined}
        t={t}
        onClose={() => setGalleryPreview(null)}
      />
    </section>
  );
}
