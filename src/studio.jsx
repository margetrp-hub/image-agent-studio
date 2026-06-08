import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Check,
  Copy,
  Download,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BotMessageSquare,
  Brush,
  Eraser,
  History,
  ImageIcon,
  Images,
  KeyRound,
  LoaderCircle,
  LogOut,
  Languages,
  MessageSquareText,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Server,
  SlidersHorizontal,
  Sparkles,
  Star,
  Sun,
  Undo2,
  Redo2,
  FlipHorizontal,
  ScanLine,
  SquarePen,
  WandSparkles,
  Trash2,
  Upload,
  Video,
  X
} from 'lucide-react';
import './studio.css';
import './styles/studio.left-rail.css';
import './styles/studio.composer-final-guards.css';
import './styles/studio.composer-shell.css';
import './styles/studio.queue-progress.css';
import './styles/studio.composer-layout.css';
import './styles/studio.reference-panel.css';
import './styles/studio.composer-conversation.css';
import './styles/studio.provider-settings.css';
import './styles/studio.interactions.css';
import './styles/studio.gallery-cards.css';
import './styles/studio.final-state.css';
import {
  AiGatewayClient,
  StudioHistoryClient,
  clearSession,
  getImageUrls,
  getVideoUrls,
  getConfiguredBaseUrls,
  getLoginUrl,
  loadProviderSettings,
  loadSession,
  saveProviderSettings,
  saveSelectedKeyId
} from './aiGatewayClient';
import { createTranslator, loadStudioLanguage, nextLanguage, saveStudioLanguage, SUPPORTED_LANGUAGES } from './studio/i18n.js';
import {
  IMAGE_PROVIDER_REGISTRY,
  clampCountForProvider,
  getImageProvider,
  providerAspectOptions,
  providerCountRange,
  providerCustomSizeOptions,
  providerParameterList
} from './studio/providers/index.js';
import { resolveProviderAdapter } from './studio/providers/adapters.js';
import {
  clearHistoryItems,
  deleteHistoryItem,
  loadHistoryItems,
  saveHistoryItems
} from './studio/storage/index.js';
import {
  assetPath,
  displayResultUrl,
  enqueueProtectedImageTask,
  publicJsonPath
} from './studio/util/assets.js';
import {
  ComposerLiveStatus,
  GenerationTimingPanel,
  ProgressBar,
  progressText
} from './studio/components/generationStatus.jsx';
import { BottomComposerPanel } from './studio/components/bottomComposerPanel.jsx';
import { ComposerParamShelf } from './studio/components/composerParamShelf.jsx';
import { ComposerPromptRow } from './studio/components/composerPromptRow.jsx';
import { ComposerThread } from './studio/components/composerThread.jsx';
import { GenerationQueueDock } from './studio/components/generationQueue.jsx';
import { RegenerateDialog } from './studio/components/regenerateDialog.jsx';
import { LeftRail } from './studio/components/leftRail.jsx';
import {
  CreativeRecipeBar,
  PromptSectionList
} from './studio/components/promptTools.jsx';
import {
  LazyImage,
  ProtectedHistoryThumb,
  ProtectedStudioImage
} from './studio/components/media.jsx';
import {
  Lightbox,
  ResultGrid,
  VideoLightbox,
  VideoResultGrid,
  WorkPreviewResultActions
} from './studio/components/resultDisplay.jsx';
import {
  buildStudioDownloadFilename,
  downloadMetaFromHistoryItem,
  formatHistoryTime,
  OUTPUT_FORMAT_LABELS,
  QUALITY_LABELS,
  RESOLUTION_TIER_LABELS,
  resultExtension,
  resultVideoExtension
} from './studio/util/resultFiles.js';
import {
  currentSessionProject,
  groupHistorySessions,
  historyResultItems,
  safeImageCandidate
} from './studio/util/historyView.js';
import {
  isActiveServerJobStatus,
  isFinalServerJobStatus,
  isRestorableQueueItem,
  isVisibleServerJob,
  normalizeQueueStatus,
  normalizeServerJobError,
  queueStatusFromServerJob
} from './studio/util/generationJobs.js';

const IMAGE_MODELS = ['gpt-image-2', 'gpt-image-1', 'gpt-image-1-mini'];
const RESPONSE_MODELS = ['gpt-5.5', 'gpt-5.2', 'gpt-5.1', 'gpt-4.1'];
const PROMPT_ASSISTANT_MODEL_EXCLUDE_PATTERN = /image|video|sora|runway|kling|veo|codex|review|audit|security|embed|rerank|tts|whisper/i;
const VIDEO_MODELS = [];
const IMAGE_GENERATION_ROUTE_LABEL = '自动选择';
const SIZES = ['auto', '1024x1024', '1536x1024', '1024x1536'];
const ASPECT_OPTIONS = [
  { value: '1:1', label: '1:1', size: '1024x1024' },
  { value: '16:9', label: '16:9', size: '1536x1024' },
  { value: '9:16', label: '9:16', size: '1024x1536' },
  { value: 'custom', label: '手动', size: '1024x1024' }
];
const CUSTOM_SIZE_OPTIONS = [
  { value: 'auto', label: '自动' },
  { value: '1024x1024', label: '1024 x 1024' },
  { value: '1536x1024', label: '1536 x 1024' },
  { value: '1024x1536', label: '1024 x 1536' }
];
const QUALITY = ['auto', 'low', 'medium', 'high'];
const RESOLUTION_TIERS = [
  { value: '1k', label: '1K' },
  { value: '2k', label: '2K' },
  { value: '4k', label: '4K' }
];
const OUTPUT_FORMATS = ['png', 'jpeg', 'webp'];
const MODERATION = ['auto', 'low'];
const IMAGE_MODEL_PATTERN = /(?:^|[^a-z0-9])(?:gpt-)?image[-_a-z0-9]*\d|(?:^|[^a-z0-9])dall[-_a-z0-9]*\d/i;
const IMAGE_REFERENCE_LIMIT = 4;
const SUPPORTED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const CANVAS_PLANE_WIDTH = 6000;
const CANVAS_PLANE_HEIGHT = 4200;
const CANVAS_NODE_WIDTH = 340;
const CANVAS_NODE_HEIGHT = 280;
const CANVAS_NODE_MIN_WIDTH = 240;
const CANVAS_NODE_MIN_HEIGHT = 200;
const CANVAS_NODE_MAX_WIDTH = 1280;
const CANVAS_NODE_MAX_HEIGHT = 960;
const CANVAS_NODE_HORIZONTAL_GAP = 170;
const CANVAS_NODE_VERTICAL_GAP = 88;
const CANVAS_DRAG_CLICK_TOLERANCE = 4;
const CANVAS_VIRTUALIZATION_MARGIN = 420;
const CANVAS_PERFORMANCE_NODE_THRESHOLD = 18;
const CANVAS_PERFORMANCE_EDGE_THRESHOLD = 24;
const CANVAS_PROTECTED_ASSET_RESOLVE_LIMIT = 24;
const GENERATION_STALL_NOTICE_MS = 90 * 1000;
const GENERATION_TIMEOUT_MS = 45 * 60 * 1000;
const GENERATION_QUEUE_LIMIT = 12;
const VISIBLE_GENERATION_QUEUE_STATUSES = ['queued', 'running', 'failed', 'canceled', 'unknown', 'done'];
const CURRENT_PROJECT_QUEUE_STATUSES = new Set(VISIBLE_GENERATION_QUEUE_STATUSES);
const VIDEO_ASPECT_OPTIONS = [
  { value: '16:9', label: '16:9', width: 1280, height: 720 },
  { value: '9:16', label: '9:16', width: 720, height: 1280 },
  { value: '1:1', label: '1:1', width: 1024, height: 1024 }
];
const VIDEO_DURATIONS = [5, 10];
const VIDEO_FPS_OPTIONS = [24, 30];
const VIDEO_MOTIONS = [
  { value: 'auto', label: '自动' },
  { value: 'push_in', label: '推近' },
  { value: 'pull_out', label: '拉远' },
  { value: 'orbit', label: '环绕' },
  { value: 'pan', label: '横移' },
  { value: 'static', label: '固定' }
];
const VIDEO_STYLES = [
  { value: 'cinematic', label: '电影感' },
  { value: 'product_ad', label: '产品广告' },
  { value: 'realistic', label: '写实' },
  { value: 'animation', label: '动画' }
];
const VIDEO_QUALITY = ['auto', 'standard', 'high'];
const WORKSPACES = [
  { value: 'image', label: '图片创作' },
  { value: 'inspiration', label: '灵感库' },
  { value: 'video', label: '视频创作' },
  { value: 'history', label: '历史图库' }
];
const DESK_MODES = [
  { value: 'image', label: '文生图', icon: ImageIcon },
  { value: 'edit', label: '参考图', icon: Images },
  { value: 'mask', label: 'Mask', icon: ScanLine }
];
const MASK_HISTORY_LIMIT = 6;
const MASK_FILL_COLOR = 'rgba(178, 39, 50, 0.34)';
const INITIAL_TEMPLATE_LIMIT = 12;
const TEMPLATE_PAGE_SIZE = 12;
const HISTORY_PAGE_SIZE = 20;
const CATEGORY_LABELS = {
  'Architecture & Spaces': '建筑空间',
  'Brand & Logos': '品牌标识',
  'Characters & People': '人物角色',
  'Charts & Infographics': '图表信息图',
  'Community Prompts': '社区灵感',
  'Documents & Publishing': '文档出版',
  'Fashion & Beauty': '时尚美妆',
  'Games & Entertainment': '游戏娱乐',
  'History & Classical Themes': '历史古风',
  'Illustration & Art': '插画艺术',
  'Other Use Cases': '其他场景',
  'Photography & Realism': '摄影写实',
  'Posters & Typography': '海报字体',
  'Products & E-commerce': '产品电商',
  'Scenes & Storytelling': '场景叙事',
  'UI & Interfaces': '界面交互'
};
const MODERATION_LABELS = {
  auto: '自动',
  low: '低'
};
const FALLBACK_PROMPT_PRESETS = [];
const FALLBACK_VIDEO_INSPIRATIONS = [];
const BASE_PATH = import.meta.env.BASE_URL || '/';
const STUDIO_BACK_URL = import.meta.env.VITE_STUDIO_BACK_URL || '/';
const LIBRARY_AUTH_REQUIRED = String(import.meta.env.VITE_STUDIO_LIBRARY_AUTH_REQUIRED || '').toLowerCase() === 'true';
const DRAFT_KEY = 'image-sub2api-studio:draft:v1';
const LEGACY_DRAFT_KEY = 'ohlaoo-studio:draft:v1';
const HISTORY_KEY = 'image-sub2api-studio:history:v1';
const LEGACY_HISTORY_KEY = 'ohlaoo-studio:history:v1';
const HISTORY_SCOPE_PREFIX = 'image-sub2api-studio:history:v2';
const LEGACY_HISTORY_SCOPE_PREFIX = 'ohlaoo-studio:history:v2';
const THEME_KEY = 'image-sub2api-studio:theme:v1';
const LEGACY_THEME_KEY = 'ohlaoo-studio:theme:v1';
const TEMPLATE_FAVORITES_KEY = 'image-sub2api-studio:template-favorites:v1';
const LEGACY_TEMPLATE_FAVORITES_KEY = 'ohlaoo-studio:template-favorites:v1';
const WORKBENCH_LAYOUT_KEY = 'image-sub2api-studio:workbench-layout:v5';
const CURRENT_SESSION_KEY = 'image-sub2api-studio:current-session:v1';
const LOCAL_HISTORY_LIMIT = 30;
const REFERENCE_ROLES = [
  { value: 'identity', label: '主体' },
  { value: 'style', label: '风格' },
  { value: 'composition', label: '构图' },
  { value: 'product', label: '产品' }
];
const EMPTY_SITE_DATA = {
  totalCases: 0,
  categories: [],
  styles: [],
  scenes: [],
  inspirationSources: [],
  inspirationErrors: [],
  promptPresets: [],
  videoInspirations: [],
  cases: []
};
const COMMUNITY_LICENSE_NOTICE = {
  name: '社区提示词模板 · CC BY 4.0',
  url: 'https://creativecommons.org/licenses/by/4.0/',
  text: '提示词模板内容来自公开社区，遵循 CC BY 4.0 许可证；使用和改编时请保留原作者或来源归属。'
};

const CATEGORY_COVERS = {
  'Architecture & Spaces': 'architecture',
  'Brand & Logos': 'brand',
  'Characters & People': 'character',
  'Charts & Infographics': 'infographic',
  'Community Prompts': 'latest',
  'Documents & Publishing': 'document',
  'Fashion & Beauty': 'photo',
  'Games & Entertainment': 'gallery',
  'History & Classical Themes': 'history',
  'Illustration & Art': 'illustration',
  'Other Use Cases': 'other',
  'Photography & Realism': 'photo',
  'Posters & Typography': 'poster',
  'Products & E-commerce': 'product',
  'Scenes & Storytelling': 'scene',
  'UI & Interfaces': 'ui'
};
const PROMPT_PRESETS = FALLBACK_PROMPT_PRESETS;
const CREATIVE_RECIPES = [
  {
    id: 'commerce-main',
    title: '电商主图',
    tone: '干净成交',
    size: '1024x1024',
    quality: 'high',
    resolutionTier: '2k',
    prompt: '商业产品摄影，主体居中，纯净浅色背景，柔和棚拍灯光，边缘高光清晰，材质纹理可见，留出少量促销文字空间，适合电商主图。'
  },
  {
    id: 'lifestyle-scene',
    title: '生活场景',
    tone: '真实氛围',
    size: '1024x1536',
    quality: 'high',
    resolutionTier: '2k',
    prompt: '生活方式摄影，把主体放在真实使用场景中，自然窗光，浅景深，温暖但克制的色彩，画面有故事感，像高端品牌社媒内容。'
  },
  {
    id: 'brand-poster',
    title: '品牌海报',
    tone: '强视觉',
    size: '1024x1536',
    quality: 'high',
    resolutionTier: '4k',
    prompt: '品牌视觉海报，强构图层级，清晰主标题留白区，主体与图形元素形成对角线动势，高级商业广告质感，适合活动推广。'
  },
  {
    id: 'ui-mockup',
    title: '界面样机',
    tone: '产品展示',
    size: '1536x1024',
    quality: 'medium',
    resolutionTier: '2k',
    prompt: '现代产品界面样机，真实设备或浏览器框架，界面信息清楚可读，背景简洁，光影克制，突出工作流和关键操作状态。'
  },
  {
    id: 'character-sheet',
    title: '角色设定',
    tone: '一致形象',
    size: '1024x1536',
    quality: 'high',
    resolutionTier: '2k',
    prompt: '角色设定图，同一角色的正面姿态，服装、配饰、表情特征清晰，干净背景，适合作为后续图像一致性参考。'
  },
  {
    id: 'editorial-cover',
    title: '封面大片',
    tone: '杂志感',
    size: '1024x1536',
    quality: 'high',
    resolutionTier: '4k',
    prompt: '杂志封面摄影，强烈但自然的主视觉，人物或主体占据第一视线，背景有层次，保留标题区，色彩具有高级编辑感。'
  }
];
const CREATIVE_RECIPE_PREFIX = '配方增强：';


function compact(value, length = 180) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > length ? `${text.slice(0, length)}...` : text;
}

function formatFileSize(value) {
  const size = Number(value || 0);
  if (!Number.isFinite(size) || size <= 0) return '';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 102.4) / 10} KB`;
  return `${Math.round(size / (1024 * 102.4)) / 10} MB`;
}

function stripCreativeRecipePrompt(value) {
  let next = String(value || '').trim();
  if (!next) return '';
  for (const recipe of CREATIVE_RECIPES) {
    if (next === recipe.prompt) return '';
    const markedPrompt = `${CREATIVE_RECIPE_PREFIX}${recipe.prompt}`;
    while (next.includes(markedPrompt)) {
      next = next
        .replace(`\n\n${markedPrompt}`, '')
        .replace(`\n${markedPrompt}`, '')
        .replace(markedPrompt, '')
        .trim();
    }
  }
  return next;
}

function formatMoney(value) {
  if (!Number.isFinite(Number(value))) return '--';
  return `$${Number(value).toFixed(2)}`;
}

function orderTemplates(cases) {
  return [...cases].sort((left, right) => {
    if (Boolean(left.featured) !== Boolean(right.featured)) {
      return left.featured ? -1 : 1;
    }
    const leftId = Number(left.id);
    const rightId = Number(right.id);
    if (Number.isFinite(leftId) && Number.isFinite(rightId)) return leftId - rightId;
    if (Number.isFinite(leftId)) return -1;
    if (Number.isFinite(rightId)) return 1;
    return String(left.title || '').localeCompare(String(right.title || ''), 'zh-CN');
  });
}

function loadDraft() {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_KEY) || localStorage.getItem(LEGACY_DRAFT_KEY) || 'null');
  } catch {
    return null;
  }
}

function saveDraft(draft) {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

function clearDraft() {
  localStorage.removeItem(DRAFT_KEY);
}

function loadCurrentSession() {
  try {
    const session = JSON.parse(localStorage.getItem(CURRENT_SESSION_KEY) || 'null');
    if (!session || typeof session !== 'object') return null;
    return normalizeCachedCurrentSession(session);
  } catch {
    return null;
  }
}

function saveCurrentSession(session) {
  const createdAt = session?.createdAt || new Date().toISOString();
  const nextSession = {
    ...(normalizeCachedCurrentSession(session) || session),
    createdAt,
    updatedAt: new Date().toISOString()
  };
  try {
    localStorage.setItem(CURRENT_SESSION_KEY, JSON.stringify(nextSession));
  } catch {
    // The active canvas is a convenience cache; generation/history still work if storage is full.
  }
  return nextSession;
}

function clearCurrentSessionCache() {
  try {
    localStorage.removeItem(CURRENT_SESSION_KEY);
  } catch {
    // A new canvas should still open even if browser storage is unavailable.
  }
}

function sessionUrlForServer(url, persistedUrl) {
  const value = String(url || '');
  if (value.startsWith('blob:') && persistedUrl) return persistedUrl;
  return value;
}

function normalizeCachedCurrentSession(session) {
  if (!session || typeof session !== 'object') return null;
  const persistedResults = Array.isArray(session.persistedResults) ? session.persistedResults : [];
  const persistedVideoResults = Array.isArray(session.persistedVideoResults) ? session.persistedVideoResults : [];
  const restoredQueueStatus = (item) => {
    if (item?.remote || item?.serverJobId) return item?.status;
    if (
      item?.status === 'queued'
      && item?.restorable !== false
      && !['edit', 'mask', 'video'].includes(item?.mode)
    ) {
      return 'queued';
    }
    if (item?.status === 'running') return 'failed';
    if (item?.status === 'queued') return 'failed';
    return item?.status;
  };
  const generationQueue = Array.isArray(session.generationQueue)
    ? session.generationQueue
      .filter((item) => item && typeof item === 'object')
      .slice(-GENERATION_QUEUE_LIMIT)
      .map((item) => ({
        ...item,
        status: restoredQueueStatus(item),
        restored: true,
        summary: String(item.summary || item.prompt || '').slice(0, 240)
      }))
    : [];
  return {
    ...session,
    results: Array.isArray(session.results)
      ? session.results.map((url, index) => sessionUrlForServer(url, persistedResults[index]))
      : [],
    videoResults: Array.isArray(session.videoResults)
      ? session.videoResults.map((url, index) => sessionUrlForServer(url, persistedVideoResults[index]))
      : [],
    canvasNodes: Array.isArray(session.canvasNodes)
      ? session.canvasNodes.map((node) => ({
        ...node,
        url: sessionUrlForServer(node?.url, node?.persistedUrl)
      }))
      : [],
    generationQueue
  };
}

function prepareCurrentSessionForServer(session) {
  if (!session || typeof session !== 'object') return null;
  const normalized = normalizeCachedCurrentSession(session);
  const persistedResults = Array.isArray(normalized.persistedResults) ? normalized.persistedResults : [];
  const persistedVideoResults = Array.isArray(normalized.persistedVideoResults) ? normalized.persistedVideoResults : [];
  const {
    persistedResults: _persistedResults,
    persistedVideoResults: _persistedVideoResults,
    updatedAt: _updatedAt,
    ...rest
  } = normalized;
  return {
    ...rest,
    results: Array.isArray(normalized.results)
      ? normalized.results.map((url, index) => sessionUrlForServer(url, persistedResults[index]))
      : [],
    videoResults: Array.isArray(normalized.videoResults)
      ? normalized.videoResults.map((url, index) => sessionUrlForServer(url, persistedVideoResults[index]))
      : [],
    canvasNodes: Array.isArray(normalized.canvasNodes)
      ? normalized.canvasNodes.map(({ persistedUrl, ...node }) => ({
        ...node,
        url: sessionUrlForServer(node.url, persistedUrl)
      }))
      : [],
    generationQueue: Array.isArray(normalized.generationQueue)
      ? normalized.generationQueue.map(serializeGenerationQueueItem).filter(Boolean)
      : []
  };
}

function sessionSnapshotComparePayload(session) {
  const payload = prepareCurrentSessionForServer(session);
  return payload ? JSON.stringify(payload) : '';
}

function hasMeaningfulSessionContent(session) {
  if (!session || typeof session !== 'object') return false;
  return Boolean(
    String(session.prompt || '').trim()
    || (Array.isArray(session.results) && session.results.length)
    || (Array.isArray(session.videoResults) && session.videoResults.length)
    || (Array.isArray(session.canvasNodes) && session.canvasNodes.length)
    || (Array.isArray(session.generationQueue) && session.generationQueue.length)
    || (Array.isArray(session.assistantMessages) && session.assistantMessages.length)
  );
}

function hasRestorableServerGeneration(session) {
  return Array.isArray(session?.generationQueue)
    && session.generationQueue.some(isRestorableQueueItem);
}

function serializeAssistantMessage(item) {
  if (!item || typeof item !== 'object') return null;
  const role = item.role === 'assistant' ? 'assistant' : 'user';
  return {
    id: String(item.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
    role,
    content: String(item.content || '').slice(0, 8000),
    finalPrompt: String(item.finalPrompt || '').slice(0, 12000),
    pending: Boolean(item.pending),
    failed: Boolean(item.failed)
  };
}

function serializePromptSuggestion(value) {
  if (!value || typeof value !== 'object') return null;
  return {
    subject: String(value.subject || '').slice(0, 2000),
    scene: String(value.scene || '').slice(0, 2000),
    composition: String(value.composition || '').slice(0, 2000),
    style: String(value.style || '').slice(0, 2000),
    lighting: String(value.lighting || '').slice(0, 2000),
    details: String(value.details || '').slice(0, 3000),
    textRules: String(value.textRules || '').slice(0, 2000),
    constraints: String(value.constraints || '').slice(0, 3000),
    finalPrompt: String(value.finalPrompt || '').slice(0, 12000),
    raw: String(value.raw || '').slice(0, 16000)
  };
}

function serializeGenerationQueueItem(item) {
  if (!item || typeof item !== 'object') return null;
  const safeStatus = normalizeQueueStatus(item.status);
  return {
    id: String(item.id || ''),
    status: safeStatus,
    createdAt: Number(item.createdAt || Date.now()),
    startedAt: item.startedAt ? Number(item.startedAt) : null,
    completedAt: item.completedAt ? Number(item.completedAt) : null,
    mode: item.mode || 'image',
    providerId: String(item.providerId || item.provider || ''),
    providerFamily: String(item.providerFamily || item.providerId || item.provider || ''),
    apiKeySource: String(item.apiKeySource || ''),
    providerLabel: String(item.providerLabel || ''),
    prompt: String(item.prompt || '').slice(0, 12000),
    model: String(item.model || IMAGE_MODELS[0]),
    aspect: item.aspect || item.aspectRatio || '1:1',
    aspectRatio: item.aspectRatio || item.aspect || '1:1',
    customSize: normalizeSize(item.customSize || item.size),
    size: normalizeSize(item.size),
    quality: normalizeQuality(item.quality),
    resolutionTier: normalizeResolutionTier(item.resolutionTier),
    outputFormat: normalizeOutputFormat(item.outputFormat),
    moderation: normalizeModeration(item.moderation),
    count: normalizeCount(item.count),
    videoModel: item.videoModel || VIDEO_MODELS[0],
    videoAspect: normalizeVideoAspect(item.videoAspect || item.videoAspectRatio),
    videoAspectRatio: normalizeVideoAspect(item.videoAspectRatio || item.videoAspect),
    videoDuration: normalizeVideoDuration(item.videoDuration || item.duration),
    duration: normalizeVideoDuration(item.duration || item.videoDuration),
    videoFps: normalizeVideoFps(item.videoFps || item.fps),
    fps: normalizeVideoFps(item.fps || item.videoFps),
    videoMotion: normalizeVideoMotion(item.videoMotion),
    videoStyle: normalizeVideoStyle(item.videoStyle),
    videoQuality: normalizeVideoQuality(item.videoQuality),
    negativePrompt: String(item.negativePrompt || '').slice(0, 4000),
    selectedCanvasNodeId: String(item.selectedCanvasNodeId || ''),
    selectedCanvasNodeSnapshot: item.selectedCanvasNodeSnapshot || null,
    referencesOpen: Boolean(item.referencesOpen),
    summary: String(item.summary || item.prompt || '').slice(0, 240),
    restorable: item.restorable !== false && !['edit', 'mask', 'video'].includes(item.mode),
    serverJobId: item.serverJobId || '',
    remote: Boolean(item.remote),
    restored: Boolean(item.restored),
    stage: String(item.stage || '').slice(0, 40),
    completed: Number(item.completed || 0),
    total: Number(item.total || item.count || 1),
    resultUrls: Array.isArray(item.resultUrls) ? item.resultUrls.slice(0, 4).map(String) : [],
    requestIds: Array.isArray(item.requestIds) ? item.requestIds.slice(0, 8).map(String) : [],
    error: item.error && typeof item.error === 'object'
      ? {
        code: String(item.error.code || '').slice(0, 120),
        status: item.error.status || null,
        requestId: String(item.error.requestId || '').slice(0, 160),
        message: String(item.error.message || '').slice(0, 1200)
      }
      : null
  };
}

function templateKey(item) {
  return String(item?.id ?? item?.title ?? '').trim();
}

function loadTemplateFavorites() {
  try {
    const items = JSON.parse(localStorage.getItem(TEMPLATE_FAVORITES_KEY) || localStorage.getItem(LEGACY_TEMPLATE_FAVORITES_KEY) || '[]');
    return new Set(Array.isArray(items) ? items.map(String) : []);
  } catch {
    return new Set();
  }
}

function saveTemplateFavorites(favorites) {
  try {
    localStorage.setItem(TEMPLATE_FAVORITES_KEY, JSON.stringify([...favorites]));
  } catch {
    // Favorite state is a convenience layer; Studio still works if storage is unavailable.
  }
}

function loadWorkbenchLayout() {
  try {
    const stored = JSON.parse(localStorage.getItem(WORKBENCH_LAYOUT_KEY) || 'null');
    return {
      prompt: stored?.prompt === true,
      references: stored?.references !== false,
      parameters: stored?.parameters !== false,
      parametersRail: stored?.parametersRail === true,
      bottomComposer: stored?.bottomComposer !== false,
      composerParameters: stored?.composerParameters === true,
      composerFolded: stored?.composerFolded === true
    };
  } catch {
    return {
      prompt: false,
      references: true,
      parameters: true,
      parametersRail: false,
      bottomComposer: true,
      composerParameters: false,
      composerFolded: false
    };
  }
}

function saveWorkbenchLayout(layout) {
  try {
    localStorage.setItem(WORKBENCH_LAYOUT_KEY, JSON.stringify(layout));
  } catch {
    // Layout state is optional; keep the in-memory UI responsive even if storage fails.
  }
}

function normalizeSize(value) {
  return SIZES.includes(value) ? value : '1024x1024';
}

function normalizeAspect(value, size) {
  if (ASPECT_OPTIONS.some((item) => item.value === value)) return value;
  const matched = ASPECT_OPTIONS.find((item) => item.value !== 'custom' && item.size === size);
  return matched?.value || '1:1';
}

function sizeFromAspect(aspect, customSize) {
  if (aspect === 'custom') return normalizeSize(customSize);
  return ASPECT_OPTIONS.find((item) => item.value === aspect)?.size || '1024x1024';
}

function normalizeQuality(value) {
  return QUALITY.includes(value) && value !== 'auto' ? value : 'medium';
}

function normalizeResolutionTier(value) {
  return RESOLUTION_TIERS.some((item) => item.value === value) ? value : '1k';
}

function withResolutionHint(prompt, resolutionTier, t = (key, fallback) => fallback || key) {
  const normalizedTier = normalizeResolutionTier(resolutionTier);
  const hint = t(`params.resolutionPromptHints.${normalizedTier}`, '');
  return hint ? `${prompt}\n\n${hint}` : prompt;
}

function textSignature(value, length = 72) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .slice(0, length);
}

function wantsPromptRewrite(value) {
  return /(?:重写|重新写|从头|不要基于|不基于|抛开原图|完全换成|换一个全新|重新设计)/.test(String(value || ''));
}

function normalizeOutputFormat(value) {
  return OUTPUT_FORMATS.includes(value) ? value : 'png';
}

function normalizeModeration(value) {
  return MODERATION.includes(value) ? value : 'auto';
}

function normalizeCount(value) {
  const next = Math.round(Number(value));
  if (!Number.isFinite(next)) return 1;
  return Math.min(10, Math.max(1, next));
}

function normalizeVideoAspect(value) {
  return VIDEO_ASPECT_OPTIONS.some((item) => item.value === value) ? value : '16:9';
}

function normalizeVideoDuration(value) {
  const next = Math.round(Number(value));
  return VIDEO_DURATIONS.includes(next) ? next : 5;
}

function normalizeVideoFps(value) {
  const next = Math.round(Number(value));
  return VIDEO_FPS_OPTIONS.includes(next) ? next : 24;
}

function normalizeVideoMotion(value) {
  return VIDEO_MOTIONS.some((item) => item.value === value) ? value : 'auto';
}

function normalizeVideoStyle(value) {
  return VIDEO_STYLES.some((item) => item.value === value) ? value : 'cinematic';
}

function normalizeVideoQuality(value) {
  return VIDEO_QUALITY.includes(value) ? value : 'auto';
}

function videoSizeFromAspect(aspect) {
  return VIDEO_ASPECT_OPTIONS.find((item) => item.value === aspect) || VIDEO_ASPECT_OPTIONS[0];
}

function loadTheme() {
  try {
    const stored = localStorage.getItem(THEME_KEY) || localStorage.getItem(LEGACY_THEME_KEY);
    if (stored === 'dark' || stored === 'light') return stored;
  } catch {
    // Ignore storage failures and fall back to a stable default.
  }
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches) {
    return 'light';
  }
  return 'dark';
}

function historyScopeFromIdentity(session, profile) {
  const identity = profile?.id || profile?.email || profile?.username || session?.user?.id || session?.user?.email || session?.user?.username || 'guest';
  return String(identity).toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
}

function historyStorageKey(scope) {
  return `${HISTORY_SCOPE_PREFIX}:${scope || 'guest'}`;
}

function legacyHistoryStorageKey(scope) {
  return `${LEGACY_HISTORY_SCOPE_PREFIX}:${scope || 'guest'}`;
}

function mergeHistoryRecords(primary, secondary = []) {
  const map = new Map();
  for (const item of [...secondary, ...primary]) {
    if (!item?.id) continue;
    const existing = map.get(item.id);
    if (!existing) {
      map.set(item.id, item);
      continue;
    }
    const existingTime = Date.parse(existing.createdAt || '') || 0;
    const itemTime = Date.parse(item.createdAt || '') || 0;
    if (itemTime >= existingTime) {
      map.set(item.id, { ...existing, ...item });
    }
  }
  return [...map.values()].sort((left, right) => {
    const leftTime = Date.parse(left.createdAt || '') || 0;
    const rightTime = Date.parse(right.createdAt || '') || 0;
    return rightTime - leftTime;
  });
}

function loadHistory(scope = 'guest') {
  try {
    const scopedKey = historyStorageKey(scope);
    const fallback = localStorage.getItem(scopedKey)
      || localStorage.getItem(legacyHistoryStorageKey(scope))
      || (scope === 'guest' ? localStorage.getItem(HISTORY_KEY) || localStorage.getItem(LEGACY_HISTORY_KEY) : null)
      || '[]';
    const parsed = JSON.parse(fallback);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function compactHistoryItem(item) {
  if (!item || typeof item !== 'object') return item;
  const resultUrls = Array.isArray(item.resultUrls)
    ? item.resultUrls.filter((url) => !String(url || '').startsWith('data:'))
    : [];
  const displayResultUrls = resultUrls.length
    ? []
    : Array.isArray(item.displayResultUrls)
      ? item.displayResultUrls.filter((url) => !String(url || '').startsWith('data:')).slice(0, 4)
      : [];
  return {
    ...item,
    displayResultUrls,
    resultUrls
  };
}

function mergeSiteData(localData, inspirationData) {
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

function normalizeLibraryPayload(payload) {
  const cases = Array.isArray(payload?.cases) ? payload.cases : [];
  const promptPresets = Array.isArray(payload?.promptPresets) ? payload.promptPresets : PROMPT_PRESETS;
  const videoInspirations = Array.isArray(payload?.videoInspirations) ? payload.videoInspirations : FALLBACK_VIDEO_INSPIRATIONS;
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

async function fetchPublicJson(fileName, fallback = {}) {
  const candidates = [publicJsonPath(fileName), `/${fileName}`].filter((value, index, list) => value && list.indexOf(value) === index);
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

async function loadStaticLibraryData() {
  const [localData, inspirationData] = await Promise.all([
    fetchPublicJson('cases.json', { cases: [] }),
    fetchPublicJson('inspirations.json', { cases: [] })
  ]);
  const data = normalizeLibraryPayload(mergeSiteData(localData, inspirationData));
  return {
    ...data,
    cases: data.cases.map((item) => ({ ...item, staticLibrary: true }))
  };
}

function saveHistory(items, scope = 'guest') {
  const nextItems = mergeHistoryRecords(items, []).slice(0, LOCAL_HISTORY_LIMIT).map(compactHistoryItem);
  try {
    localStorage.setItem(historyStorageKey(scope), JSON.stringify(nextItems));
    if (scope === 'guest') {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(nextItems));
    }
  } catch {
    try {
      localStorage.setItem(historyStorageKey(scope), JSON.stringify(nextItems.map((item) => ({ ...item, resultUrls: [] }))));
    } catch {
      localStorage.removeItem(historyStorageKey(scope));
    }
  }
  saveHistoryItems(scope, nextItems).catch(() => {
    // IndexedDB is an expanded local cache; localStorage remains the fallback.
  });
}

async function loadPersistedHistory(scope = 'guest') {
  try {
    const idbItems = await loadHistoryItems(scope);
    if (Array.isArray(idbItems) && idbItems.length) {
      return mergeHistoryRecords(idbItems, loadHistory(scope)).slice(0, LOCAL_HISTORY_LIMIT);
    }
  } catch {
    // Fall back to the existing localStorage cache when IndexedDB is unavailable.
  }
  return loadHistory(scope);
}

function deletePersistedHistory(recordId, scope = 'guest') {
  deleteHistoryItem(scope, recordId).catch(() => {
    // IndexedDB cleanup is best-effort; the server/localStorage paths still run.
  });
}

function clearPersistedHistory(scope = 'guest') {
  clearHistoryItems(scope).catch(() => {
    // IndexedDB cleanup is best-effort; the server/localStorage paths still run.
  });
}

function storedResultUrls(urls) {
  return urls.slice(0, 4);
}

function buildCanvasNodeFromHistoryItem(item, result, index = 0) {
  const resultItem = typeof result === 'string'
    ? { url: result, displayUrl: result }
    : (result || {});
  const url = resultItem.displayUrl || resultItem.url || '';
  const isVideo = item?.mode === 'video' || item?.kind === 'video';
  const prompt = resultItem.generationPrompt || resultItem.prompt || item?.generationPrompt || item?.prompt || item?.case?.promptPreview || '';
  const downloadMeta = {
    ...downloadMetaFromHistoryItem({
      ...item,
      id: resultItem.recordId || resultItem.id || item?.id,
      taskId: resultItem.taskId || item?.taskId,
      createdAt: resultItem.createdAt || item?.createdAt,
      generationPrompt: resultItem.generationPrompt || item?.generationPrompt,
      prompt: resultItem.prompt || item?.prompt,
      providerId: resultItem.providerId || item?.providerId,
      provider: resultItem.provider || item?.provider,
      model: resultItem.model || item?.model
    }, isVideo),
    model: resultItem.model || item?.model || ''
  };
  return {
    id: `history-${item?.id || Date.now()}-${resultItem.id || index}`,
    parentId: '',
    canvasIndex: index + 1,
    kind: isVideo ? 'video' : 'image',
    url,
    sourceUrl: resultItem.url || url,
    prompt,
    generationPrompt: resultItem.generationPrompt || prompt,
    downloadMeta,
    title: isVideo ? `#${index + 1}` : `#${index + 1}`,
    x: index * (CANVAS_NODE_WIDTH + CANVAS_NODE_HORIZONTAL_GAP),
    y: index % 2 ? 48 : -36,
    width: CANVAS_NODE_WIDTH,
    height: CANVAS_NODE_HEIGHT,
    createdAt: item?.createdAt || new Date().toISOString()
  };
}

function filePreviewUrl(file) {
  return file ? URL.createObjectURL(file) : '';
}

function supportedReferenceFiles(files, limit = IMAGE_REFERENCE_LIMIT) {
  return Array.from(files || [])
    .filter((file) => SUPPORTED_IMAGE_TYPES.has(file.type))
    .slice(0, limit);
}

function createReferenceItem(file, role = 'identity') {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    file,
    role
  };
}

function createMaskState() {
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

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('MASK_FILE_READ_FAILED'));
    reader.readAsDataURL(file);
  });
}

function loadImageDimensions(dataUrl) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth || 0, height: image.naturalHeight || 0 });
    image.onerror = () => resolve({ width: 0, height: 0 });
    image.src = dataUrl;
  });
}

function createMaskSnapshot(base) {
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

function restoreMaskSnapshot(snapshot) {
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

function maskSnapshotToImageData(snapshot) {
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

function drawMaskSnapshot(context, snapshot, { exportMask = false } = {}) {
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

function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason || new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = window.setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      window.clearTimeout(timer);
      reject(signal.reason || new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  });
}

function dataUrlToFile(dataUrl, filename = 'mask.png') {
  const [prefix, base64 = ''] = String(dataUrl || '').split(',');
  const mime = prefix.match(/data:(.*?);/)?.[1] || 'image/png';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new File([bytes], filename, { type: mime });
}

function imageMimeExtension(mime) {
  const value = String(mime || '').toLowerCase();
  if (value.includes('jpeg') || value.includes('jpg')) return 'jpg';
  if (value.includes('webp')) return 'webp';
  return 'png';
}

async function imageUrlToFile(url, filename = 'canvas-reference.png') {
  const source = String(url || '');
  if (!source) throw new Error('CANVAS_IMAGE_EMPTY');
  if (source.startsWith('data:')) return dataUrlToFile(source, filename);
  const response = await fetch(assetPath(source));
  if (!response.ok) throw new Error(`CANVAS_IMAGE_HTTP_${response.status}`);
  const blob = await response.blob();
  const type = blob.type || 'image/png';
  if (!SUPPORTED_IMAGE_TYPES.has(type)) throw new Error('CANVAS_IMAGE_UNSUPPORTED');
  const cleanName = filename.replace(/\.[a-z0-9]+$/i, '');
  return new File([blob], `${cleanName}.${imageMimeExtension(type)}`, { type });
}

function referenceRoleLabel(value) {
  return REFERENCE_ROLES.find((item) => item.value === value)?.label || REFERENCE_ROLES[0].label;
}

function collectStateBlobUrls({ results = [], videoResults = [], canvasNodes = [], previewImage = null, previewVideo = null } = {}) {
  const urls = new Set();
  const collect = (value) => {
    const url = String(value || '');
    if (url.startsWith('blob:')) urls.add(url);
  };
  results.forEach(collect);
  videoResults.forEach(collect);
  canvasNodes.forEach((node) => {
    collect(node?.url);
    collect(node?.fallbackUrl);
  });
  collect(previewImage?.url);
  collect(typeof previewVideo === 'string' ? previewVideo : previewVideo?.url);
  return urls;
}

function revokeBlobUrls(urls) {
  for (const url of urls || []) {
    if (String(url || '').startsWith('blob:')) URL.revokeObjectURL(url);
  }
}

function providerLabel(settings, apiKey) {
  if (settings.apiKeySource === 'manual') return settings.manualGatewayBaseUrl ? '自定义 API' : '自定义连接';
  return apiKey?.name || 'Gateway Account';
}

function maskApiKey(value) {
  const key = String(value || '').trim();
  if (!key) return '';
  if (/[*•]/.test(key) || key.includes('...')) return key;
  if (key.length <= 8) return `${key.slice(0, 2)}...${key.slice(-2)}`;
  return `${key.slice(0, 6)}...${key.slice(-4)}`;
}

function apiKeyDisplay(apiKey) {
  const display = apiKey?.displayKey || apiKey?.key || apiKey?.plain || apiKey?.mask;
  return display ? maskApiKey(display) : apiKey?.name || '选择密钥';
}

function workspaceConnectionLabel(activeWorkspace, settings) {
  if (activeWorkspace === 'video') return '视频接口';
  if (activeWorkspace === 'inspiration') return '灵感库';
  if (activeWorkspace === 'history') return '历史图库';
  return IMAGE_GENERATION_ROUTE_LABEL;
}

function apiKeyMeta(apiKey) {
  const scope = apiKey?.scope || '默认权限';
  const status = apiKey?.status === 1 || String(apiKey?.status || '').toLowerCase() === 'active' ? '可用' : apiKey?.status || '可用';
  return `${status} · ${scope}`;
}

function categoryLabel(value) {
  if (value === 'All') return '全部分类';
  return CATEGORY_LABELS[value] || value || '未分类';
}

function isLikelyGarbledText(value) {
  const text = String(value || '').trim();
  if (!text) return false;
  if (/[\u0000-\u001f\u007f\ufffd]/.test(text)) return true;
  if (/[\u00c2\u00c3][\u0080-\u00bf]|(?:\u00e2\u20ac[\u0098-\u009d\u0153\u2122])|(?:[\u00e4-\u00e9][\u0080-\u00ff]{1,3}){2,}/.test(text)) return true;
  const latin = (text.match(/[A-Za-z]/g) || []).length;
  const cjk = (text.match(/[\u3400-\u9fff]/g) || []).length;
  const hasSeparator = /[\s/|.,:;()[\]{}_+\-·，。：；（）【】]/.test(text);
  if (latin > 0 && cjk >= 2 && !hasSeparator) return true;
  const useful = (text.match(/[A-Za-z0-9\u3400-\u9fff]/g) || []).length;
  return text.length >= 4 && useful / text.length < 0.45;
}

function cleanGalleryMetaText(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text && !isLikelyGarbledText(text) ? text : '';
}

function caseCardMeta(item) {
  return cleanGalleryMetaText(item?.sourceLabel) || cleanGalleryMetaText(item?.sourceName);
}


function categoryCover(value, variant = 'thumb') {
  const slug = CATEGORY_COVERS[value] || CATEGORY_COVERS['Other Use Cases'];
  return variant === 'protected'
    ? `/studio-api/library-assets/category-covers/${slug}.jpg`
    : `/images/thumbs/category-covers/${slug}.webp`;
}

function templateThumbnail(item) {
  if (!item) return '';
  if (item.thumbnail || item.thumb || item.thumbnail_url || item.thumbnailUrl) {
    return item.thumbnail || item.thumb || item.thumbnail_url || item.thumbnailUrl;
  }
  const image = item.image || item.image_url || '';
  if (/^\/images\/[^/]+\.(jpe?g|png)$/i.test(image)) {
    return image.replace(/^\/images\/(.+)\.(jpe?g|png)$/i, '/images/thumbs/$1.webp');
  }
  return '';
}

function imageFallback(item) {
  return item?.image || item?.image_url || '';
}

function templatePreviewImage(item) {
  return imageFallback(item) || templateThumbnail(item);
}

function handleImageFallback(event, fallback) {
  const image = event.currentTarget;
  const nextSrc = fallback ? assetPath(fallback) : '';
  if (nextSrc && image.src !== nextSrc && image.dataset.fallbackUsed !== 'true') {
    image.dataset.fallbackUsed = 'true';
    image.src = nextSrc;
    return;
  }
  image.hidden = true;
  image.closest('.categoryThumbs, .caseMedia')?.classList.add('imageMissing');
}

function libraryFallbackImage(item) {
  return templateThumbnail(item) || imageFallback(item);
}

function buildCategoryGroups(cases) {
  const groups = new Map();
  const protectedAssets = (cases || []).some((item) => String(item?.thumbnail || item?.image || item?.image_url || '').startsWith('/studio-api/'));
  for (const item of orderTemplates(cases || [])) {
    const key = item.category || 'Other Use Cases';
    if (!groups.has(key)) {
      groups.set(key, {
        id: key,
        label: categoryLabel(key),
        count: 0,
        cover: categoryCover(key, protectedAssets ? 'protected' : 'thumb'),
        coverFallback: categoryCover(key, protectedAssets ? 'protected' : 'thumb'),
        featured: null,
        samples: []
      });
    }
    const group = groups.get(key);
    group.count += 1;
    if (!group.featured && (item.thumbnail || item.image || item.image_url)) group.featured = item;
    if (group.samples.length < 3) group.samples.push(item);
  }
  return [...groups.values()].sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, 'zh-CN'));
}

function parseOptimizedPrompt(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const jsonText = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
  try {
    const parsed = JSON.parse(jsonText);
    return {
      subject: parsed.subject || '',
      scene: parsed.scene || '',
      composition: parsed.composition || '',
      style: parsed.style || '',
      lighting: parsed.lighting || '',
      details: parsed.details || '',
      textRules: parsed.textRules || '',
      constraints: parsed.constraints || '',
      finalPrompt: parsed.finalPrompt || raw,
      raw
    };
  } catch {
    return { finalPrompt: raw, raw };
  }
}

function parseAssistantReply(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const jsonText = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
  try {
    const parsed = JSON.parse(jsonText);
    return {
      reply: parsed.reply || parsed.message || raw,
      finalPrompt: parsed.finalPrompt || parsed.prompt || '',
      raw
    };
  } catch {
    return {
      reply: raw,
      finalPrompt: '',
      raw
    };
  }
}

function formatUsageValue(value) {
  if (value === undefined || value === null || value === '') return '后台未返回';
  if (typeof value === 'number' && Number.isFinite(value)) return value.toLocaleString('zh-CN');
  return String(value);
}

function pointValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  return (number / 100).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
}

function modelBillingLabel(model, count = 1) {
  const raw = model?.raw || model || {};
  const unitPoints = raw.unit_points ?? raw.unitPoints;
  const inputPoints = raw.input_unit_points ?? raw.inputUnitPoints;
  const outputPoints = raw.output_unit_points ?? raw.outputUnitPoints;
  if (unitPoints !== undefined && unitPoints !== null) {
    const unit = pointValue(unitPoints);
    const total = pointValue(Number(unitPoints) * normalizeCount(count));
    return Number(unitPoints) > 0 ? `${unit} 点/张，预估 ${total} 点` : '后台按模型结算';
  }
  if (inputPoints !== undefined || outputPoints !== undefined) {
    return `输入 ${pointValue(inputPoints || 0)} 点/1K，输出 ${pointValue(outputPoints || 0)} 点/1K`;
  }
  const value = raw.price || raw.pricing || raw.unit_price || raw.input_price || raw.output_price || raw.quota || raw.cost || raw.billing || raw.billing_mode;
  if (!value) return '以后台实际扣费为准';
  if (typeof value === 'object') return Object.entries(value).map(([key, item]) => `${key}: ${item}`).join(' / ');
  return String(value);
}

function modelBillingUnitLabel(model, unitLabel = '张', count = 1) {
  const label = modelBillingLabel(model, count);
  return unitLabel === '张' ? label : label.replaceAll('/张', `/${unitLabel}`);
}

function payloadUsageSummary(payload) {
  const usage = payload?.usage || payload?.response?.usage || payload?.billing || payload?.cost || payload?.metadata?.usage;
  if (!usage) return '';
  if (typeof usage === 'string') return usage;
  if (typeof usage === 'number') return `本次消费 ${pointValue(usage)} 点`;
  const parts = [];
  const pointsTotal = usage.total_points ?? usage.points ?? usage.totalPoint;
  const costPoints = usage.total_cost ?? usage.cost_points ?? usage.costPoints;
  const total = pointsTotal ?? (costPoints !== undefined ? pointValue(costPoints) : undefined) ?? usage.total ?? usage.total_tokens ?? usage.amount ?? usage.cost ?? usage.credits;
  const input = usage.input_tokens || usage.prompt_tokens || usage.input;
  const output = usage.output_tokens || usage.completion_tokens || usage.output;
  if (total !== undefined) parts.push(`合计 ${formatUsageValue(total)}${(pointsTotal !== undefined || costPoints !== undefined) ? ' 点' : ''}`);
  if (input !== undefined) parts.push(`输入 ${formatUsageValue(input)}`);
  if (output !== undefined) parts.push(`输出 ${formatUsageValue(output)}`);
  return parts.join('，');
}

function riskLabel(value) {
  const labels = {
    'brand-risk': '品牌',
    celebrity: '名人',
    medical: '医疗',
    political: '政治',
    'adult-risk': '成人',
    'copyright-style': '版权风格',
    'license-review': '授权待核'
  };
  return labels[value] || value;
}

function modelLooksLikeImage(item) {
  const raw = item?.raw || {};
  const source = [
    item?.id,
    item?.label,
    item?.type,
    item?.category,
    item?.mode,
    item?.modality,
    item?.endpoint,
    raw.id,
    raw.model,
    raw.name,
    raw.type,
    raw.category,
    raw.mode,
    raw.modality,
    raw.endpoint,
    raw.group,
    raw.platform,
    ...(Array.isArray(item?.capabilities) ? item.capabilities : []),
    ...(Array.isArray(raw.capabilities) ? raw.capabilities : [])
  ].filter(Boolean).join(' ');
  return IMAGE_MODEL_PATTERN.test(source) || String(source).toLowerCase().includes('images/edits');
}


function connectionReady(settings, apiKey, isAuthenticated) {
  if (settings.apiKeySource === 'manual') {
    return Boolean(settings.manualApiKey?.trim());
  }
  return Boolean(isAuthenticated && apiKey?.key);
}

function usesGatewayAccount(settings) {
  return settings?.apiKeySource !== 'manual';
}

function resolveProviderRequest(settings, apiKey) {
  if (settings.apiKeySource === 'manual') {
    return {
      apiKey: settings.manualApiKey.trim(),
      gatewayBaseUrl: settings.manualGatewayBaseUrl.trim() || getConfiguredBaseUrls().gatewayBaseUrl,
      route: settings.route || 'auto',
      responsesModel: settings.responsesModel,
      partialImages: settings.partialImages
    };
  }
  return {
    apiKey: apiKey?.key || '',
    route: settings.route || 'auto',
    responsesModel: settings.responsesModel,
    partialImages: settings.partialImages
  };
}

function modelMatchesVideo(item) {
  const raw = item?.raw || {};
  const values = [
    item?.type,
    item?.category,
    item?.mode,
    item?.modality,
    item?.endpoint,
    raw.type,
    raw.category,
    raw.mode,
    raw.modality,
    raw.endpoint
  ].map((value) => String(value || '').toLowerCase());
  const capabilities = [
    item?.capabilities,
    item?.capability,
    raw.capabilities,
    raw.capability,
    raw.features,
    raw.supported_generation_types,
    raw.supportedGenerationTypes
  ].flatMap((value) => Array.isArray(value) ? value : value ? [value] : []).map((value) => String(value || '').toLowerCase());
  return [...values, ...capabilities].some((value) => value === 'video' || value === 'videos' || value.includes('video_generation') || value.includes('video-generation'));
}

function workspaceLabel(value) {
  return WORKSPACES.find((item) => item.value === value)?.label || WORKSPACES[0].label;
}

function Topbar({
  profile,
  apiKey,
  providerSettings,
  isAuthenticated,
  activeWorkspace,
  onWorkspaceChange,
  t,
  theme,
  onLogin,
  onLogout,
  onOpenSettings,
  onThemeToggle
}) {
  return (
    <header className="studioTopbar">
      <div className="topbarBrandGroup">
        <a className="brandLockup" href={assetPath(STUDIO_BACK_URL)} aria-label={t('app.back', '返回画廊')} title={t('app.back', '返回画廊')}>
          <ArrowLeft className="brandBackIcon" size={18} />
          <WandSparkles size={21} />
          <span>{t('app.brand', '创作工作台')}</span>
        </a>
        <nav className="workspaceNav" aria-label={t('topbar.navAria', '创作工作区')}>
          {WORKSPACES.map((item) => (
            <button
              type="button"
              className={activeWorkspace === item.value ? 'active' : ''}
              data-top-workspace={item.value}
              key={item.value}
              onClick={() => onWorkspaceChange(item.value)}
            >
              {t(`workspace.${item.value}`, item.label)}
            </button>
          ))}
        </nav>
      </div>
      <div className="topbarActions">
        <button type="button" className="connectionPill" onClick={onOpenSettings}>
          <Server size={15} />
          <span>{providerLabel(providerSettings, apiKey)}</span>
          <strong>{workspaceConnectionLabel(activeWorkspace, providerSettings)}</strong>
        </button>
        {isAuthenticated ? (
          <>
            <button type="button" className="iconButton themeButton" onClick={onThemeToggle} aria-label={theme === 'dark' ? t('topbar.light', '切换浅色') : t('topbar.dark', '切换深色')}>
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button type="button" className="iconButton" onClick={onLogout} aria-label={t('topbar.logout', '退出')}>
              <LogOut size={18} />
            </button>
          </>
        ) : (
          <>
            <button type="button" className="iconButton themeButton" onClick={onThemeToggle} aria-label={theme === 'dark' ? t('topbar.light', '切换浅色') : t('topbar.dark', '切换深色')}>
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button type="button" className="topbarLogin" onClick={onLogin}>
              <KeyRound size={16} />
              {t('topbar.login', '登录')}
            </button>
          </>
        )}
      </div>
    </header>
  );
}

function CategoryCard({ group, selected, onSelect }) {
  const sampleFallback = (group.samples || []).map(libraryFallbackImage).find(Boolean) || libraryFallbackImage(group.featured);
  const fallback = sampleFallback || group.coverFallback || '';
  return (
    <button className={`categoryTile ${selected ? 'selected' : ''}`} type="button" onClick={() => onSelect(group.id)}>
      <div className="categoryThumbs">
        {(group.cover || fallback) ? (
          <ProtectedStudioImage
            src={group.cover || fallback}
            fallbackSrc={fallback}
            alt={group.label}
          />
        ) : null}
        <ImageIcon size={22} />
      </div>
      <div>
        <strong>{group.label}</strong>
        <span>{group.count} 个模板</span>
        <small>{group.samples.map((item) => item.title).slice(0, 2).join(' / ')}</small>
      </div>
    </button>
  );
}

function CaseCard({ item, selected, onSelect, favorite, onToggleFavorite, onAppend, t = (key, fallback) => fallback || key }) {
  const image = templateThumbnail(item);
  const fallback = imageFallback(item);
  const meta = caseCardMeta(item);
  const risks = Array.isArray(item.riskTags) ? item.riskTags.slice(0, 3) : [];
  return (
    <div className={`caseTile ${selected ? 'selected' : ''}`}>
      <button className="caseTileMain" type="button" onClick={() => onSelect(item)}>
        <div className="caseMedia">
          {(image || fallback) ? (
            <ProtectedStudioImage
              src={image || fallback}
              fallbackSrc={image && fallback !== image ? fallback : ''}
              alt={item.imageAlt || item.title}
            />
          ) : null}
          <ImageIcon size={18} />
          <small className="casePreviewHint">{t('gallery.preview', '查看')}</small>
        </div>
        <span>{typeof item.id === 'number' ? `#${item.id}` : t('gallery.external', '外部')}</span>
        <strong>{item.title}</strong>
        {meta ? <em>{meta}</em> : null}
        {risks.length ? (
          <small>{risks.map(riskLabel).join(' / ')}</small>
        ) : null}
      </button>
      <div className="caseTileActions">
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

function HistoryCard({ item, selected, onSelect, onDelete, t = (key, fallback) => fallback || key }) {
  const resultItems = historyResultItems(item);
  const resultUrl = resultItems[0]?.displayUrl || resultItems[0]?.url || item.displayResultUrls?.[0] || item.resultUrls?.[0] || '';
  const thumbnail = safeImageCandidate(resultUrl || item.case?.image || '');
  const resultCount = resultItems.length || (item.displayResultUrls?.length || item.resultUrls?.length || 0);
  const usage = item.usageSummary || item.costSummary || '';
  const isVideo = item.mode === 'video' || item.kind === 'video';
  const extension = isVideo ? resultVideoExtension(resultUrl) : resultExtension(resultUrl, item.outputFormat || 'png');
  const downloadName = buildStudioDownloadFilename({
    ...downloadMetaFromHistoryItem(item, isVideo),
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
        <button type="button" onClick={() => onDelete(item)}>
          <Trash2 size={14} /> {t('canvas.delete', '删除')}
        </button>
      </div>
    </div>
  );
}

function GalleryWorkspacePanel({
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
  onAppendTemplate,
  licenseNotice,
  onOpenWorkspace,
  t = (key, fallback) => fallback || key
}) {
  const [visibleLimit, setVisibleLimit] = useState(INITIAL_TEMPLATE_LIMIT);
  const [activeKind, setActiveKind] = useState('image');
  const isHistory = type === 'history';
  const isVideo = activeKind === 'video';
  const browsingCategory = !isVideo && (category !== 'All' || query.trim());
  const visibleCases = cases.slice(0, visibleLimit);
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
  const selectedTemplate = selected && selected.kind !== 'video-inspiration' ? selected : null;
  const selectedTemplateImage = selectedTemplate ? templatePreviewImage(selectedTemplate) : '';
  const selectedTemplateFallback = selectedTemplate ? templateThumbnail(selectedTemplate) : '';
  const selectedTemplatePrompt = selectedTemplate?.promptPreview || selectedTemplate?.prompt || selectedTemplate?.summary || '';
  const selectedHistoryItem = useMemo(() => {
    if (!isHistory || !selectedHistoryId) return null;
    return historySessionItems.find((item) => (
      selectedHistoryId === item.id
      || selectedHistoryId === item.sessionId
      || item.recordIds?.includes?.(selectedHistoryId)
    )) || null;
  }, [historySessionItems, isHistory, selectedHistoryId]);

  useEffect(() => {
    setVisibleLimit(INITIAL_TEMPLATE_LIMIT);
  }, [category, query, activeKind, type]);

  const selectLibraryItem = (item) => {
    onSelect(item);
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
          <HistoryDetailPanel item={selectedHistoryItem} onOpenWorkspace={onOpenWorkspace} t={t} />
        ) : null}
      </section>
    );
  }

  return (
    <section className="galleryWorkspacePanel inspirationWorkspace" aria-label={t('workspace.inspiration', '灵感库')}>
      <div className="galleryWorkspaceHead">
        <div>
          <span>{t('workspace.inspiration', '灵感库')}</span>
          <h2>{t('gallery.inspirationTitle', '选择分类，把提示词带入创作会话')}</h2>
          <p>{t('gallery.inspirationHint', '上方是创作意图，下方是灵感推荐；点击模板会进入中间对话框继续调整。')}</p>
        </div>
        <div className="galleryWorkspaceActions">
          <div className="galleryKindSwitch" role="group" aria-label={t('gallery.inspirationType', '灵感类型')}>
            <button type="button" className={!isVideo ? 'active' : ''} onClick={() => setActiveKind('image')}>
              <ImageIcon size={15} />
              {t('workspace.image', '图片创作')}
            </button>
            <button type="button" className={isVideo ? 'active' : ''} onClick={() => setActiveKind('video')}>
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
        <label className="gallerySearch">
          <Search size={16} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={isVideo ? t('gallery.searchVideo', '搜索视频灵感') : t('gallery.searchImage', '搜索图片模板')} />
        </label>
        {!isVideo ? (
          <>
            <button
              type="button"
              className={`galleryFilterButton ${showFavoritesOnly ? 'active' : ''}`}
              onClick={onToggleFavoritesOnly}
            >
              <Star size={15} />
              {showFavoritesOnly ? t('gallery.favorited', '已收藏') : t('gallery.favoriteCount', '收藏 {count}', { count: favoriteTemplates.size })}
            </button>
            {browsingCategory ? (
              <button type="button" className="galleryFilterButton" onClick={() => { setCategory('All'); setQuery(''); }}>
                {t('gallery.backToCategories', '返回分类')}
              </button>
            ) : null}
          </>
        ) : null}
      </div>
      {!isVideo && browsingCategory && selectedTemplate ? (
        <section className="gallerySelectionPreview" aria-label={t('gallery.selectedPreview', '已选灵感预览')}>
          <div className="gallerySelectionMedia">
            {(selectedTemplateImage || selectedTemplateFallback) ? (
              <ProtectedStudioImage
                src={selectedTemplateImage || selectedTemplateFallback}
                fallbackSrc={selectedTemplateImage && selectedTemplateFallback !== selectedTemplateImage ? selectedTemplateFallback : ''}
                alt={selectedTemplate.imageAlt || selectedTemplate.title}
              />
            ) : (
              <ImageIcon size={20} />
            )}
          </div>
          <div className="gallerySelectionBody">
            <span>{t('gallery.selectedPreview', '已选灵感预览')}</span>
            <strong>{selectedTemplate.title}</strong>
            <p>{selectedTemplatePrompt || t('gallery.selectedNoPrompt', '点击选用后会读取完整提示词并带入底部对话框。')}</p>
          </div>
          <button type="button" className="primaryAction galleryUseTemplateButton" onClick={() => onAppendTemplate?.(selectedTemplate)}>
            <Check size={15} />
            {t('gallery.useTemplate', '选用')}
          </button>
        </section>
      ) : null}
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
        ) : browsingCategory ? (
          <>
            {visibleCases.map((item) => (
              <CaseCard
                item={item}
                selected={selected?.id === item.id}
                onSelect={selectLibraryItem}
                favorite={favoriteTemplates.has(templateKey(item))}
                onToggleFavorite={onToggleTemplateFavorite}
                onAppend={onAppendTemplate}
                t={t}
                key={item.id}
              />
            ))}
            {visibleLimit < cases.length ? (
              <button type="button" className="loadMoreButton galleryLoadMore" onClick={() => setVisibleLimit((value) => value + TEMPLATE_PAGE_SIZE)}>
                {t('gallery.loadMoreCount', '加载更多 {visible}/{total}', { visible: Math.min(visibleLimit, cases.length), total: cases.length })}
              </button>
            ) : null}
          </>
        ) : (
          categoryGroups.map((group) => (
            <CategoryCard group={group} selected={category === group.id} onSelect={setCategory} key={group.id} />
          ))
        )}
      </div>
      {!isVideo ? (
        <div className="galleryLicenseLine">
          <span>{licenseNotice?.name || COMMUNITY_LICENSE_NOTICE.name}</span>
          <p>{licenseNotice?.notice || licenseNotice?.text || COMMUNITY_LICENSE_NOTICE.text}</p>
          <a href={licenseNotice?.url || COMMUNITY_LICENSE_NOTICE.url} target="_blank" rel="noreferrer">CC BY 4.0</a>
          <strong>{browsingCategory ? `${cases.length}/${totalCaseCount}` : t('gallery.categoryCount', '{count} 类', { count: categoryGroups.length })}</strong>
        </div>
      ) : null}
    </section>
  );
}

function generationErrorMessage(error, t = (key, fallback, values) => {
  if (!values) return fallback || key;
  return Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, value), fallback || key);
}) {
  const message = String(
    error?.payload?.error?.message
      || error?.payload?.message
      || error?.payload?.response?.error?.message
      || error?.message
      || t('errors.generationFailed', '生成失败')
  );

  const lowered = message.toLowerCase();
  const requestId = errorRequestId(error, message);
  const requestSuffix = requestId ? t('errors.requestIdSuffix', ' 请求 ID：{requestId}', { requestId }) : '';
  if (error?.code === 'GENERATION_STOPPED' || lowered.includes('generation_stopped')) {
    return t('errors.stopped', '已停止本页等待。若请求已经到达上游，仍可能继续处理或产生扣费；请先查看当前画布/历史图库，确认没有新结果后再重试。');
  }
  if (error?.code === 'GENERATION_TIMEOUT' || error?.code === 'JOB_TIMEOUT' || lowered.includes('generation_timeout') || lowered.includes('job_timeout') || lowered.includes('timed out') || lowered.includes('timeout')) {
    return `${t('errors.timeout', '前端等待超时，这次页面已结束等待；这不代表上游已经取消。本次请求可能仍在处理、排队或已经扣费，请稍后查看历史图库/当前画布，再决定是否重试。')}${requestSuffix}`;
  }
  if (lowered.includes('origin_not_allowed') || lowered.includes('origin not allowed')) {
    return t('errors.originNotAllowed', '生成请求被创作台服务拦截：当前页面来源没有加入 STUDIO_ALLOWED_ORIGINS 白名单。请更新并重启 history/session 服务，或把当前访问地址加入允许来源后再试。');
  }
  if (error?.code === 'GATEWAY_DISPATCH_FAILED' || lowered.includes('could not deliver this request to the gateway')) {
    return t('errors.gatewayDispatchFailed', '工作站服务没能把请求送到网关，所以后台可能没有调用记录。请检查接口地址、服务端网络、允许来源和防火墙后再试。');
  }
  if (
    lowered.includes('request was rejected by the safety system')
    || lowered.includes('rejected by the safety system')
    || lowered.includes('safety system')
    || lowered.includes('content policy')
    || lowered.includes('safety policy')
    || lowered.includes('policy_violation')
  ) {
    return `${t('errors.safety', '提示词或参考图触发了上游安全策略，生成已被拒绝。请弱化敏感描述，去掉真实人物、未成年人、暴力色情、仿冒名人等高风险内容后重试。')}${requestSuffix}`;
  }
  if (lowered.includes('no images') || lowered.includes('returned_no_images') || lowered.includes('没有返回图片')) {
    return `${t('errors.noImages', '上游请求结束，但没有返回可用图片。通常是模型拒绝、参数不兼容或网关没有透传结果，请换一版提示词或调整模型/尺寸后重试。')}${requestSuffix}`;
  }
  if (lowered.includes('upstream request failed') || lowered.includes('upstream response failed') || lowered.includes('upstream') || lowered.includes('context canceled')) {
    return `${t('errors.upstream', '请求已经进入中转站，但上游模型服务没有正常返回图片。请在后台按请求 ID 查看最终状态；如果只有重试/切换日志没有成功记录，建议换 Key、降低数量或稍后重试。')}${requestSuffix}`;
  }
  if (error?.status === 400 || lowered.includes('invalid request') || lowered.includes('invalid_request') || lowered.includes('invalid parameter') || lowered.includes('invalid_value')) {
    if (lowered.includes('size') || lowered.includes('quality') || lowered.includes('model')) {
      return `${t('errors.unsupportedParams', '请求参数不被当前模型支持，请检查模型、尺寸、质量或数量设置。')}${requestSuffix}`;
    }
    return `${t('errors.invalidParams', '请求参数有误，生成已停止。请检查提示词、模型、尺寸、数量和参考图设置。')}${requestSuffix}`;
  }
  if (error?.status === 401 || lowered.includes('unauthorized') || lowered.includes('invalid token') || lowered.includes('invalid api key') || lowered.includes('incorrect api key')) {
    return t('errors.unauthorized', '账号登录或密钥已失效，请重新登录或更换密钥。');
  }
  if (error?.status === 402 || lowered.includes('insufficient') || lowered.includes('balance') || lowered.includes('quota') || lowered.includes('credit') || lowered.includes('billing')) {
    return t('errors.billing', '当前账号余额或额度不足，生成已停止。');
  }
  if (error?.status === 403 || lowered.includes('forbidden') || lowered.includes('permission') || lowered.includes('not allowed') || lowered.includes('model_not_found')) {
    return t('errors.forbidden', '当前账号没有调用该模型或接口的权限，生成已停止。');
  }
  if (error?.status === 404 || lowered.includes('not found')) {
    return `${t('errors.notFound', '接口或模型不存在。请确认网关地址、接口类型和模型名称是否正确。')}${requestSuffix}`;
  }
  if (error?.status === 408 || error?.status === 504 || lowered.includes('gateway timeout') || lowered.includes('upstream timeout')) {
    return `${t('errors.gatewayTimeout', '网关响应超时，本页没有继续收到结果；如果请求已经提交上游，仍可能产生扣费。请稍后查看历史图库，再决定是否降低数量/质量重试。')}${requestSuffix}`;
  }
  if (error?.status === 429 || lowered.includes('rate limit') || lowered.includes('too many requests')) {
    return t('errors.rateLimit', '当前账号或接口触发限流，生成已停止。请稍后重试。');
  }
  if (error?.status >= 500 || lowered.includes('internal server error') || lowered.includes('bad gateway') || lowered.includes('service unavailable')) {
    return `${t('errors.serviceUnavailable', '上游服务暂时不可用，生成已停止。请稍后重试；如果反复出现，可能是中转站或模型服务异常。')}${requestSuffix}`;
  }
  if (lowered.includes('failed to fetch') || lowered.includes('fetch failed') || lowered.includes('networkerror') || lowered.includes('network error')) {
    return t('errors.network', '网络连接中断，本页没有收到完整结果；如果请求已经发出，上游可能仍在处理或已经计费。请先检查历史图库/当前画布，再决定是否重试。');
  }
  if (error?.name === 'AbortError') {
    return t('errors.abort', '本页监听已停止；如果请求已经到达上游，仍可能继续处理或产生扣费。');
  }
  if (/^[\u0000-\u007F]*$/.test(message) && /[A-Za-z]/.test(message)) {
    return t('errors.unknownEnglish', '生成失败。上游返回了未识别的英文错误，请稍后重试，或调整模型/尺寸/数量后再试。原始信息：{message}', { message: compact(message, 180) });
  }
  return message;
}


function errorRequestId(error, message = '') {
  const direct = error?.requestId
    || error?.request_id
    || error?.payload?.request_id
    || error?.payload?.requestId
    || error?.payload?.error?.request_id
    || error?.payload?.error?.requestId
    || error?.payload?.response?.request_id
    || error?.payload?.response?.requestId
    || error?.payload?.response?.error?.request_id
    || error?.payload?.response?.error?.requestId;
  if (direct) return String(direct);

  const match = String(message).match(/request\s*id\s*[:：]?\s*([a-z0-9-]{12,})/i);
  return match?.[1] || '';
}

function HistoryDetailPanel({ item, onOpenWorkspace, t = (key, fallback) => fallback || key }) {
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
  const promptItems = resultItems.length ? resultItems : [{ id: item.id, prompt: item.prompt || item.generationPrompt || '' }];
  const meta = isVideo
    ? [item.model, item.aspectRatio || item.aspect, item.duration ? `${item.duration}s` : '', item.fps ? `${item.fps}fps` : ''].filter(Boolean)
    : [item.model, item.resolutionTier ? (RESOLUTION_TIER_LABELS[item.resolutionTier] || item.resolutionTier) : item.size, item.quality ? QUALITY_LABELS[item.quality] || item.quality : '', item.outputFormat ? OUTPUT_FORMAT_LABELS[item.outputFormat] || item.outputFormat : ''].filter(Boolean);

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
                <PromptSectionList prompt={result.generationPrompt || result.prompt || item.generationPrompt || item.prompt} t={t} />
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
        <VideoResultGrid urls={urls} downloadMeta={downloadMeta} onPreview={() => {}} t={t} />
      ) : (
        <ResultGrid urls={urls} outputFormat={item.outputFormat || 'png'} downloadMeta={downloadMeta} onPreview={() => {}} t={t} />
      )}
    </section>
  );
}

const MaskEditor = forwardRef(function MaskEditor({
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
function CreationDesk({
  sessionId,
  activeWorkspace,
  selectedCase,
  selectedHistory,
  onResolveCase,
  apiKey,
  client,
  providerSettings,
  onProviderChange,
  modelOptions,
  modelsStatus,
  usageSummary,
  isAuthenticated,
  onRequireLogin,
  onOpenSettings,
  onProfileRefresh,
  onHistoryAdd,
  remoteSession,
  remoteSessionReady,
  persistenceKey,
  onSessionSnapshot,
  promptPresets,
  appendTemplateRequest,
  onAppendTemplateConsumed,
  onOpenWorkspace,
  focusSignal = 0,
  t
}) {
  const draftRef = useRef(loadDraft());
  const currentSessionRef = useRef(loadCurrentSession());
  const restoredSession = currentSessionRef.current;
  const sessionCreatedAtRef = useRef(restoredSession?.createdAt || new Date().toISOString());
  const initialParameters = restoredSession?.parameters || draftRef.current || {};
  const restoredMode = restoredSession?.mode || (activeWorkspace === 'video' ? 'video' : 'image');
  const generationRef = useRef({ id: 0, controller: null });
  const resolvingCaseRef = useRef({ id: 0 });
  const appliedCasePromptRef = useRef({ key: '', prompt: '' });
  const maskEditorRef = useRef(null);
  const composerThreadRef = useRef(null);
  const lastSessionSnapshotPayloadRef = useRef('');
  const [mode, setMode] = useState(restoredMode);
  const [prompt, setPrompt] = useState(() => restoredSession?.prompt || draftRef.current?.prompt || '');
  const [model, setModel] = useState(() => restoredSession?.model || initialParameters.model || IMAGE_MODELS[0]);
  const initialSize = normalizeSize(initialParameters.size || initialParameters.customSize || '1024x1024');
  const [aspect, setAspect] = useState(() => normalizeAspect(initialParameters.aspect || initialParameters.aspectRatio, initialSize));
  const [customSize, setCustomSize] = useState(() => normalizeSize(initialParameters.customSize || initialSize));
  const [quality, setQuality] = useState(() => normalizeQuality(initialParameters.quality));
  const [resolutionTier, setResolutionTier] = useState(() => normalizeResolutionTier(initialParameters.resolutionTier));
  const [outputFormat, setOutputFormat] = useState(() => normalizeOutputFormat(initialParameters.outputFormat));
  const [moderation, setModeration] = useState(() => normalizeModeration(initialParameters.moderation));
  const [count, setCount] = useState(() => initialParameters.count || 1);
  const [videoModel, setVideoModel] = useState(() => initialParameters.videoModel || (restoredMode === 'video' ? restoredSession?.model : '') || VIDEO_MODELS[0]);
  const [videoAspect, setVideoAspect] = useState(() => normalizeVideoAspect(initialParameters.videoAspect || initialParameters.videoAspectRatio));
  const [videoDuration, setVideoDuration] = useState(() => normalizeVideoDuration(initialParameters.videoDuration || initialParameters.duration));
  const [videoFps, setVideoFps] = useState(() => normalizeVideoFps(initialParameters.videoFps || initialParameters.fps));
  const [videoMotion, setVideoMotion] = useState(() => normalizeVideoMotion(initialParameters.videoMotion));
  const [videoStyle, setVideoStyle] = useState(() => normalizeVideoStyle(initialParameters.videoStyle));
  const [videoQuality, setVideoQuality] = useState(() => normalizeVideoQuality(initialParameters.videoQuality));
  const [negativePrompt, setNegativePrompt] = useState(() => initialParameters.negativePrompt || '');
  const [videoReferenceFiles, setVideoReferenceFiles] = useState([]);
  const [videoReferencePreviews, setVideoReferencePreviews] = useState([]);
  const restoredWasGenerating = restoredSession?.status === 'loading';
  const restoredHasServerJob = hasRestorableServerGeneration(restoredSession);
  const restoredPendingReview = restoredWasGenerating && (
    (Array.isArray(restoredSession?.results) && restoredSession.results.length)
    || (Array.isArray(restoredSession?.videoResults) && restoredSession.videoResults.length)
    || (Array.isArray(restoredSession?.canvasNodes) && restoredSession.canvasNodes.length)
  );
  const [status, setStatus] = useState(restoredWasGenerating ? restoredHasServerJob ? 'loading' : 'error' : 'idle');
  const [message, setMessage] = useState(restoredWasGenerating
    ? restoredHasServerJob
      ? '检测到服务端仍有生成任务，正在继续同步状态；刷新页面不会丢失队列。'
      : restoredPendingReview
      ? '页面刷新前有生成请求正在进行，已保留收到的预览/画布。上游可能仍已扣费，请先检查结果或等待，不要立刻重复提交。'
      : '页面刷新前有生成请求正在进行，但本页已断开监听。上游可能仍已扣费，请先到历史图库或服务端确认，再决定是否重试。'
    : '');
  const [results, setResults] = useState(() => Array.isArray(restoredSession?.results) ? restoredSession.results : []);
  const [videoResults, setVideoResults] = useState(() => Array.isArray(restoredSession?.videoResults) ? restoredSession.videoResults : []);
  const [resultBatchMeta, setResultBatchMeta] = useState(() => restoredSession?.resultBatchMeta || null);
  const [videoTask, setVideoTask] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);
  const [previewVideo, setPreviewVideo] = useState('');
  const [progress, setProgress] = useState(() => restoredWasGenerating
    ? {
      ...(restoredSession?.progress || {}),
      stage: restoredHasServerJob ? (restoredSession?.progress?.stage || 'upstream') : restoredPendingReview ? 'pending_review' : 'failed',
      percent: restoredSession?.progress?.percent || (restoredHasServerJob ? 52 : 0)
    }
    : { stage: 'idle', percent: 0, completed: 0, total: 1 });
  const [timing, setTiming] = useState(() => restoredSession?.timing || null);
  const [composerNow, setComposerNow] = useState(() => Date.now());
  const [copied, setCopied] = useState(false);
  const [promptInstruction, setPromptInstruction] = useState('');
  const [promptSuggestion, setPromptSuggestion] = useState(() => serializePromptSuggestion(restoredSession?.promptSuggestion));
  const [assistantMessages, setAssistantMessages] = useState(() => (
    Array.isArray(restoredSession?.assistantMessages)
      ? restoredSession.assistantMessages.map(serializeAssistantMessage).filter(Boolean).slice(-24)
      : []
  ));
  const [activeRecipeId, setActiveRecipeId] = useState('');
  const [composerInspirationOpen, setComposerInspirationOpen] = useState(false);
  const [optimizingPrompt, setOptimizingPrompt] = useState(false);
  const [caseResolving, setCaseResolving] = useState(false);
  const [referenceItems, setReferenceItems] = useState([]);
  const [referencePreviews, setReferencePreviews] = useState([]);
  const [referenceDropActive, setReferenceDropActive] = useState(false);
  const [videoDropActive, setVideoDropActive] = useState(false);
  const [maskExportUrl, setMaskExportUrl] = useState('');
  const [layoutSections, setLayoutSections] = useState(() => loadWorkbenchLayout());
  const [activeParamPanel, setActiveParamPanel] = useState('');
  const [regenerateDialogOpen, setRegenerateDialogOpen] = useState(false);
  const [canvasView, setCanvasView] = useState(() => restoredSession?.canvasView || { x: 0, y: 0, zoom: 1 });
  const [canvasViewport, setCanvasViewport] = useState({ width: 1200, height: 720 });
  const [canvasNodes, setCanvasNodes] = useState(() => Array.isArray(restoredSession?.canvasNodes) ? restoredSession.canvasNodes : []);
  const canvasNodesRef = useRef(Array.isArray(restoredSession?.canvasNodes) ? restoredSession.canvasNodes : []);
  const [canvasCustomLinks, setCanvasCustomLinks] = useState(() => Array.isArray(restoredSession?.canvasCustomLinks) ? restoredSession.canvasCustomLinks : []);
  const [selectedCanvasNodeId, setSelectedCanvasNodeId] = useState(() => restoredSession?.selectedCanvasNodeId || '');
  const [canvasLinkDraft, setCanvasLinkDraft] = useState(null);
  const [canvasEditorNodeId, setCanvasEditorNodeId] = useState('');
  const [canvasEditorPrompt, setCanvasEditorPrompt] = useState('');
  const [canvasEditorMode, setCanvasEditorMode] = useState('image');
  const [pendingCanvasGenerate, setPendingCanvasGenerate] = useState(null);
  const [pendingSuggestionGenerate, setPendingSuggestionGenerate] = useState(null);
  const [generationQueue, setGenerationQueue] = useState(() => Array.isArray(restoredSession?.generationQueue) ? restoredSession.generationQueue : []);
  const workPreviewRef = useRef(null);
  const canvasDragRef = useRef(null);
  const suppressCanvasClickRef = useRef(false);
  const appliedRemoteSessionRef = useRef('');
  const generationQueueRef = useRef(Array.isArray(restoredSession?.generationQueue) ? restoredSession.generationQueue : []);
  const generationQueueRunnerRef = useRef(false);
  const restoredQueueStartedRef = useRef(false);
  const recoveredJobIdsRef = useRef(new Set());
  const stateBlobUrlsRef = useRef(new Set());
  const updateLayoutSections = (patch) => {
    setLayoutSections((current) => {
      const next = { ...current, ...patch };
      saveWorkbenchLayout(next);
      return next;
    });
  };
  const showComposerForGeneration = () => updateLayoutSections({
    bottomComposer: true,
    composerFolded: false
  });

  useEffect(() => {
    canvasNodesRef.current = canvasNodes;
  }, [canvasNodes]);

  useEffect(() => {
    if (status !== 'loading' && timing?.status !== 'running') return undefined;
    setComposerNow(Date.now());
    const timer = window.setInterval(() => setComposerNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [status, timing?.status, timing?.startedAt]);

  useEffect(() => {
    const nextUrls = collectStateBlobUrls({
      results,
      videoResults,
      canvasNodes,
      previewImage,
      previewVideo
    });
    for (const url of stateBlobUrlsRef.current) {
      if (!nextUrls.has(url)) URL.revokeObjectURL(url);
    }
    stateBlobUrlsRef.current = nextUrls;
  }, [results, videoResults, canvasNodes, previewImage?.url, previewVideo?.url, previewVideo]);

  useEffect(() => () => {
    for (const url of stateBlobUrlsRef.current) URL.revokeObjectURL(url);
    stateBlobUrlsRef.current.clear();
  }, []);

  const isReady = connectionReady(providerSettings, apiKey, isAuthenticated);
  const currentImageProvider = getImageProvider(providerSettings.providerId, providerSettings.apiKeySource);
  const imageAspectOptions = useMemo(() => providerAspectOptions(currentImageProvider, ASPECT_OPTIONS, SIZES), [currentImageProvider]);
  const customSizeOptions = useMemo(() => providerCustomSizeOptions(currentImageProvider, CUSTOM_SIZE_OPTIONS, SIZES), [currentImageProvider]);
  const imageQualityOptions = useMemo(() => (
    providerParameterList(currentImageProvider, 'qualities', QUALITY).filter((item) => item !== 'auto')
  ), [currentImageProvider]);
  const imageResolutionTierOptions = useMemo(() => (
    providerParameterList(currentImageProvider, 'resolutionTiers', RESOLUTION_TIERS.map((item) => item.value))
      .map((value) => RESOLUTION_TIERS.find((item) => item.value === value) || { value, label: String(value).toUpperCase() })
  ), [currentImageProvider]);
  const imageOutputFormatOptions = useMemo(() => providerParameterList(currentImageProvider, 'outputFormats', OUTPUT_FORMATS), [currentImageProvider]);
  const imageCountRange = useMemo(() => providerCountRange(currentImageProvider), [currentImageProvider]);
  const defaultImageModelOptions = IMAGE_MODELS.map((id) => ({ id, label: id }));
  const configuredImageModelOptions = [
    providerSettings.imageGenerationModel,
    providerSettings.imageEditModel
  ].map((id) => String(id || '').trim()).filter(Boolean).map((id) => ({ id, label: id }));
  const baseImageModelOptions = modelOptions?.image?.length ? modelOptions.image : defaultImageModelOptions;
  const imageModelOptions = [
    ...configuredImageModelOptions.filter((item) => !baseImageModelOptions.some((option) => option.id === item.id)),
    ...baseImageModelOptions
  ];
  const assistantModelOptions = modelOptions?.responses?.length
    ? modelOptions.responses.filter((item) => !modelLooksLikeImage(item) && !PROMPT_ASSISTANT_MODEL_EXCLUDE_PATTERN.test(`${item.id} ${item.label || ''}`))
    : [];
  const responseModelOptions = assistantModelOptions.length
    ? assistantModelOptions
    : [...new Set([providerSettings.responsesModel, ...RESPONSE_MODELS])].filter(Boolean).map((id) => ({ id, label: id }));
  const configuredVideoModel = String(providerSettings.videoModel || '').trim();
  const baseVideoModelOptions = modelOptions?.video?.length ? modelOptions.video : VIDEO_MODELS.map((id) => ({ id, label: id }));
  const syncedVideoModelOptions = configuredVideoModel && !baseVideoModelOptions.some((item) => item.id === configuredVideoModel)
    ? [{ id: configuredVideoModel, label: configuredVideoModel }, ...baseVideoModelOptions]
    : baseVideoModelOptions;
  const videoModelOptions = videoModel && !syncedVideoModelOptions.some((item) => item.id === videoModel)
    ? [{ id: videoModel, label: videoModel }, ...syncedVideoModelOptions]
    : syncedVideoModelOptions;
  const activeModelInfo = imageModelOptions.find((item) => item.id === model);
  const activeVideoModelInfo = videoModelOptions.find((item) => item.id === videoModel);
  const hasSyncedVideoModels = syncedVideoModelOptions.length > 0;
  const hasVideoModels = hasSyncedVideoModels || Boolean(videoModel);
  const size = sizeFromAspect(aspect, customSize);
  const countValue = clampCountForProvider(count, currentImageProvider, normalizeCount);
  const videoSize = videoSizeFromAspect(videoAspect);
  const currentDownloadMeta = resultBatchMeta || {
    mode: mode === 'video' ? 'video' : 'image',
    providerId: mode === 'video'
      ? videoModel
      : model,
    createdAt: timing?.startedAt || Date.now(),
    prompt,
    size,
    quality,
    resolutionTier,
    outputFormat,
    id: timing?.startedAt || selectedHistory?.id || selectedCase?.id || ''
  };
  const visiblePromptPresets = (promptPresets || PROMPT_PRESETS).filter((item) => item.mode === mode);
  const referenceFiles = referenceItems.map((item) => item.file);
  const isImageEditMode = mode === 'edit' || mode === 'mask';
  const selectedCanvasNode = canvasNodes.find((node) => node.id === selectedCanvasNodeId) || null;
  const canvasNodeMap = useMemo(() => new Map(canvasNodes.map((node) => [node.id, node])), [canvasNodes]);
  const deskModeLabel = (value) => {
    if (value === 'image') return t('mode.textToImage', '文生图');
    if (value === 'edit') return t('mode.referenceEdit', '参考图');
    if (value === 'mask') return t('mode.mask', 'Mask');
    return value;
  };
  const qualityLabel = (value) => {
    if (value === 'auto') return t('quality.auto', '自动');
    if (value === 'low') return t('quality.low', '低');
    if (value === 'medium') return t('quality.medium', '中');
    if (value === 'high') return t('quality.high', '高');
    return value;
  };
  const aspectLabel = (item) => (item.value === 'custom' ? t('params.manual', '手动') : item.label);
  const customSizeLabel = (item) => (item.value === 'auto' ? t('params.auto', '自动') : item.label);
  const videoMotionLabel = (item) => (item.value === 'auto' ? t('params.auto', '自动') : item.label);
  const videoStyleLabel = (item) => (item.value === 'auto' ? t('params.auto', '自动') : item.label);
  const resolutionTierLabel = (item) => RESOLUTION_TIER_LABELS[item.value] || item.label;
  const imageCountSuffix = t('params.imageCountSuffix', '张');
  useEffect(() => {
    if (mode === 'video') return;
    if (count !== countValue) setCount(countValue);
    if (imageQualityOptions.length && !imageQualityOptions.includes(quality)) {
      setQuality(imageQualityOptions.includes('medium') ? 'medium' : imageQualityOptions[0]);
    }
    if (imageOutputFormatOptions.length && !imageOutputFormatOptions.includes(outputFormat)) {
      setOutputFormat(imageOutputFormatOptions.includes('png') ? 'png' : imageOutputFormatOptions[0]);
    }
    if (imageResolutionTierOptions.length && !imageResolutionTierOptions.some((item) => item.value === resolutionTier)) {
      setResolutionTier(imageResolutionTierOptions[0].value);
    }
    if (aspect !== 'custom' && !imageAspectOptions.some((item) => item.value === aspect)) {
      const nextAspect = imageAspectOptions.find((item) => item.value !== 'custom') || imageAspectOptions[0];
      if (nextAspect) {
        setAspect(nextAspect.value);
        if (nextAspect.value !== 'custom') setCustomSize(nextAspect.size);
      }
    }
    if (aspect === 'custom' && customSizeOptions.length && !customSizeOptions.some((item) => item.value === customSize)) {
      setCustomSize(customSizeOptions[0].value);
    }
  }, [
    mode,
    count,
    countValue,
    quality,
    outputFormat,
    resolutionTier,
    aspect,
    customSize,
    imageQualityOptions,
    imageOutputFormatOptions,
    imageResolutionTierOptions,
    imageAspectOptions,
    customSizeOptions
  ]);

  const canvasEdges = useMemo(() => {
    const edges = [];
    const seen = new Set();
    const pushEdge = (fromId, toId, type = 'lineage') => {
      if (!fromId || !toId || fromId === toId) return;
      const from = canvasNodeMap.get(fromId);
      const to = canvasNodeMap.get(toId);
      if (!from || !to) return;
      const id = `${fromId}-${toId}`;
      if (seen.has(id)) return;
      seen.add(id);
      edges.push({ id, from, to, type });
    };
    canvasNodes.forEach((node) => pushEdge(node.parentId, node.id, 'lineage'));
    canvasCustomLinks.forEach((link) => pushEdge(link.fromId, link.toId, 'custom'));
    return edges;
  }, [canvasNodes, canvasCustomLinks, canvasNodeMap]);
  const canvasLinkPreview = useMemo(() => {
    if (!canvasLinkDraft?.fromId) return null;
    const from = canvasNodeMap.get(canvasLinkDraft.fromId);
    if (!from) return null;
    return { from, point: canvasLinkDraft.point || null };
  }, [canvasLinkDraft, canvasNodeMap]);
  const childNodeIds = useMemo(() => {
    if (!selectedCanvasNodeId) return new Set();
    const ids = new Set();
    let changed = true;
    while (changed) {
      changed = false;
      for (const node of canvasNodes) {
        const isCustomChild = canvasCustomLinks.some((link) => link.toId === node.id && (link.fromId === selectedCanvasNodeId || ids.has(link.fromId)));
        if (!ids.has(node.id) && (node.parentId === selectedCanvasNodeId || ids.has(node.parentId) || isCustomChild)) {
          ids.add(node.id);
          changed = true;
        }
      }
    }
    return ids;
  }, [canvasNodes, canvasCustomLinks, selectedCanvasNodeId]);
  const parentNodeIds = useMemo(() => {
    if (!selectedCanvasNodeId) return new Set();
    const ids = new Set();
    const visit = (nodeId) => {
      const current = canvasNodeMap.get(nodeId);
      const parentIds = [
        current?.parentId,
        ...canvasCustomLinks.filter((link) => link.toId === nodeId).map((link) => link.fromId)
      ].filter(Boolean);
      parentIds.forEach((parentId) => {
        if (ids.has(parentId) || !canvasNodeMap.has(parentId)) return;
        ids.add(parentId);
        visit(parentId);
      });
    };
    visit(selectedCanvasNodeId);
    return ids;
  }, [canvasNodeMap, canvasCustomLinks, selectedCanvasNodeId]);
  const linkedNodeIds = useMemo(() => {
    if (!canvasLinkDraft?.fromId) return new Set();
    return new Set([
      canvasLinkDraft.fromId,
      ...canvasEdges
        .filter((edge) => edge.from.id === canvasLinkDraft.fromId || edge.to.id === canvasLinkDraft.fromId)
        .flatMap((edge) => [edge.from.id, edge.to.id])
    ]);
  }, [canvasEdges, canvasLinkDraft?.fromId]);
  const canvasPerformanceMode = canvasNodes.length >= CANVAS_PERFORMANCE_NODE_THRESHOLD || canvasEdges.length >= CANVAS_PERFORMANCE_EDGE_THRESHOLD;
  const visibleCanvasNodeIds = useMemo(() => {
    const zoom = canvasView.zoom || 1;
    const margin = CANVAS_VIRTUALIZATION_MARGIN;
    const viewportWidth = Math.max(1, canvasViewport.width || 1);
    const viewportHeight = Math.max(1, canvasViewport.height || 1);
    const ids = new Set();
    for (const node of canvasNodes) {
      if (!node?.id) continue;
      const screenLeft = viewportWidth / 2 + canvasView.x + Number(node.x || 0) * zoom;
      const screenTop = viewportHeight / 2 + canvasView.y + Number(node.y || 0) * zoom;
      const screenRight = screenLeft + nodeWidth(node) * zoom;
      const screenBottom = screenTop + nodeHeight(node) * zoom;
      const nearViewport = screenRight >= -margin
        && screenLeft <= viewportWidth + margin
        && screenBottom >= -margin
        && screenTop <= viewportHeight + margin;
      if (
        nearViewport
        || node.id === selectedCanvasNodeId
        || node.id === canvasEditorNodeId
        || linkedNodeIds.has(node.id)
      ) {
        ids.add(node.id);
      }
    }
    return ids;
  }, [
    canvasNodes,
    canvasView.x,
    canvasView.y,
    canvasView.zoom,
    canvasViewport.width,
    canvasViewport.height,
    selectedCanvasNodeId,
    canvasEditorNodeId,
    linkedNodeIds
  ]);
  const renderedCanvasEdges = useMemo(() => {
    if (!canvasPerformanceMode) return canvasEdges;
    return canvasEdges.filter((edge) => {
      const directlySelected = Boolean(selectedCanvasNodeId)
        && (edge.from.id === selectedCanvasNodeId || edge.to.id === selectedCanvasNodeId);
      return directlySelected
        || visibleCanvasNodeIds.has(edge.from.id)
        || visibleCanvasNodeIds.has(edge.to.id);
    });
  }, [canvasEdges, canvasPerformanceMode, visibleCanvasNodeIds, selectedCanvasNodeId, childNodeIds, parentNodeIds]);
  function canvasPlanePointFromEvent(event) {
    const eventTarget = event.currentTarget || event.target;
    const rect = eventTarget?.closest?.('.infiniteCanvas')?.getBoundingClientRect();
    const zoom = canvasView.zoom || 1;
    if (!rect) {
      return {
        x: CANVAS_PLANE_WIDTH / 2,
        y: CANVAS_PLANE_HEIGHT / 2
      };
    }
    return {
      x: (event.clientX - rect.left - rect.width / 2 - canvasView.x) / zoom + CANVAS_PLANE_WIDTH / 2,
      y: (event.clientY - rect.top - rect.height / 2 - canvasView.y) / zoom + CANVAS_PLANE_HEIGHT / 2
    };
  }
  function addCanvasCustomLink(fromId, toId) {
    if (!fromId || !toId || fromId === toId) return false;
    if (!canvasNodeMap.has(fromId) || !canvasNodeMap.has(toId)) return false;
    const toNode = canvasNodeMap.get(toId);
    const alreadyLinked = toNode?.parentId === fromId || canvasCustomLinks.some((link) => link.fromId === fromId && link.toId === toId);
    if (alreadyLinked) return false;
    const visited = new Set();
    const reachesFromTarget = (nodeId) => {
      if (!nodeId || visited.has(nodeId)) return false;
      if (nodeId === fromId) return true;
      visited.add(nodeId);
      return canvasEdges.some((edge) => edge.from.id === nodeId && reachesFromTarget(edge.to.id));
    };
    if (reachesFromTarget(toId)) {
      setStatus('error');
      setMessage(t('statusMessages.linkCycle', '这条关联会形成循环，请换一个方向连接。'));
      window.setTimeout(() => setStatus('idle'), 1600);
      return false;
    }
    setCanvasCustomLinks((current) => [
      ...current,
      {
        id: `${fromId}-${toId}-${Date.now()}`,
        fromId,
        toId,
        createdAt: new Date().toISOString()
      }
    ]);
    setSelectedCanvasNodeId(toId);
    setStatus('success');
    setMessage(t('statusMessages.linkCreated', '已建立画布关联。'));
    window.setTimeout(() => setStatus('idle'), 1200);
    return true;
  }

  function findCanvasLinkTarget(event, fromId) {
    const targetElement = document.elementFromPoint(event.clientX, event.clientY);
    const domNodeId = targetElement?.dataset?.nodeId || targetElement?.closest?.('.graphNode')?.dataset?.nodeId;
    if (domNodeId && domNodeId !== fromId && canvasNodeMap.has(domNodeId)) return domNodeId;

    const point = canvasPlanePointFromEvent(event);
    const threshold = 56 / (canvasView.zoom || 1);
    let closest = null;
    for (const node of canvasNodes) {
      if (!node?.id || node.id === fromId) continue;
      const portX = CANVAS_PLANE_WIDTH / 2 + Number(node.x || 0);
      const portY = CANVAS_PLANE_HEIGHT / 2 + Number(node.y || 0) + nodeHeight(node) * 0.48;
      const distance = Math.hypot(point.x - portX, point.y - portY);
      if (distance <= threshold && (!closest || distance < closest.distance)) {
        closest = { nodeId: node.id, distance };
      }
    }
    return closest?.nodeId || '';
  }

  function canvasEdgeLineageClass(edge) {
    if (!selectedCanvasNodeId) return 'idle';
    const fromSelected = edge.from.id === selectedCanvasNodeId;
    const toSelected = edge.to.id === selectedCanvasNodeId;
    const fromChild = childNodeIds.has(edge.from.id);
    const toChild = childNodeIds.has(edge.to.id);
    const fromParent = parentNodeIds.has(edge.from.id);
    const toParent = parentNodeIds.has(edge.to.id);

    if (toChild && (fromSelected || fromChild)) {
      return fromSelected ? 'active branchRoot' : 'active branchDown';
    }
    if ((toSelected && fromParent) || (fromParent && toParent)) {
      return toSelected ? 'active branchIntoSelected' : 'active branchUp';
    }
    if (fromSelected || toSelected) return 'active direct';
    return 'idle';
  }
  const draftParameters = () => ({
    aspect,
    aspectRatio: aspect,
    customSize,
    size,
    quality,
    resolutionTier,
    outputFormat,
    moderation,
    count: countValue
  });
  const videoDraftParameters = () => ({
    videoModel,
    videoAspect,
    videoAspectRatio: videoAspect,
    videoDuration,
    duration: videoDuration,
    videoFps,
    fps: videoFps,
    videoMotion,
    videoStyle,
    videoQuality,
    negativePrompt
  });

  function applyGenerationTaskSnapshot(task) {
    if (!task) return;
    setMode(task.mode);
    setPrompt(task.prompt);
    setModel(task.model || IMAGE_MODELS[0]);
    setAspect(normalizeAspect(task.aspect || task.aspectRatio, task.size));
    setCustomSize(normalizeSize(task.customSize || task.size));
    setQuality(normalizeQuality(task.quality));
    setResolutionTier(normalizeResolutionTier(task.resolutionTier));
    setOutputFormat(normalizeOutputFormat(task.outputFormat));
    setModeration(normalizeModeration(task.moderation));
    setCount(normalizeCount(task.count));
    setVideoModel(task.videoModel || VIDEO_MODELS[0]);
    setVideoAspect(normalizeVideoAspect(task.videoAspect || task.videoAspectRatio));
    setVideoDuration(normalizeVideoDuration(task.videoDuration || task.duration));
    setVideoFps(normalizeVideoFps(task.videoFps || task.fps));
    setVideoMotion(normalizeVideoMotion(task.videoMotion));
    setVideoStyle(normalizeVideoStyle(task.videoStyle));
    setVideoQuality(normalizeVideoQuality(task.videoQuality));
    setNegativePrompt(task.negativePrompt || '');
    setReferenceItems(Array.isArray(task.referenceItems) ? task.referenceItems : []);
    setVideoReferenceFiles(Array.isArray(task.videoReferenceFiles) ? task.videoReferenceFiles : []);
    setSelectedCanvasNodeId(task.selectedCanvasNodeId || '');
    updateLayoutSections({ bottomComposer: true, references: Boolean(task.referencesOpen) });
  }

  function applySessionSnapshot(sessionSnapshot) {
    if (!sessionSnapshot || typeof sessionSnapshot !== 'object') return;
    const parameters = sessionSnapshot.parameters || {};
    const nextMode = sessionSnapshot.mode || 'image';
    const nextSize = normalizeSize(parameters.size || parameters.customSize || customSize);
    setMode(nextMode);
    setPrompt(sessionSnapshot.prompt || '');
    setModel(sessionSnapshot.model || IMAGE_MODELS[0]);
    setAspect(normalizeAspect(parameters.aspect || parameters.aspectRatio, nextSize));
    setCustomSize(normalizeSize(parameters.customSize || nextSize));
    setQuality(normalizeQuality(parameters.quality));
    setResolutionTier(normalizeResolutionTier(parameters.resolutionTier));
    setOutputFormat(normalizeOutputFormat(parameters.outputFormat));
    setModeration(normalizeModeration(parameters.moderation));
    setCount(normalizeCount(parameters.count));
    setVideoModel(parameters.videoModel || VIDEO_MODELS[0]);
    setVideoAspect(normalizeVideoAspect(parameters.videoAspect || parameters.videoAspectRatio));
    setVideoDuration(normalizeVideoDuration(parameters.videoDuration || parameters.duration));
    setVideoFps(normalizeVideoFps(parameters.videoFps || parameters.fps));
    setVideoMotion(normalizeVideoMotion(parameters.videoMotion));
    setVideoStyle(normalizeVideoStyle(parameters.videoStyle));
    setVideoQuality(normalizeVideoQuality(parameters.videoQuality));
    setNegativePrompt(parameters.negativePrompt || '');
    setResults(Array.isArray(sessionSnapshot.results) ? sessionSnapshot.results : []);
    setVideoResults(Array.isArray(sessionSnapshot.videoResults) ? sessionSnapshot.videoResults : []);
    setResultBatchMeta(sessionSnapshot.resultBatchMeta || null);
    setCanvasNodes(Array.isArray(sessionSnapshot.canvasNodes) ? sessionSnapshot.canvasNodes : []);
    setCanvasCustomLinks(Array.isArray(sessionSnapshot.canvasCustomLinks) ? sessionSnapshot.canvasCustomLinks : []);
    const nextGenerationQueue = Array.isArray(sessionSnapshot.generationQueue)
      ? sessionSnapshot.generationQueue.map(serializeGenerationQueueItem).filter(Boolean).slice(-GENERATION_QUEUE_LIMIT)
      : [];
    generationQueueRef.current = nextGenerationQueue;
    setGenerationQueue(nextGenerationQueue);
    setSelectedCanvasNodeId(sessionSnapshot.selectedCanvasNodeId || '');
    setCanvasEditorNodeId(sessionSnapshot.canvasEditorNodeId || '');
    setCanvasLinkDraft(null);
    setCanvasView(sessionSnapshot.canvasView || { x: 0, y: 0, zoom: 1 });
    setAssistantMessages(Array.isArray(sessionSnapshot.assistantMessages)
      ? sessionSnapshot.assistantMessages.map(serializeAssistantMessage).filter(Boolean).slice(-24)
      : []);
    setPromptSuggestion(serializePromptSuggestion(sessionSnapshot.promptSuggestion));
    const hasRestorableServerJob = hasRestorableServerGeneration(sessionSnapshot);
    setStatus(sessionSnapshot.status === 'loading'
      ? hasRestorableServerJob ? 'loading' : 'error'
      : (sessionSnapshot.status || 'idle'));
    const interruptedHasResult = sessionSnapshot.status === 'loading' && (
      (Array.isArray(sessionSnapshot.results) && sessionSnapshot.results.length)
      || (Array.isArray(sessionSnapshot.videoResults) && sessionSnapshot.videoResults.length)
      || (Array.isArray(sessionSnapshot.canvasNodes) && sessionSnapshot.canvasNodes.length)
    );
    setMessage(sessionSnapshot.status === 'loading'
      ? hasRestorableServerJob
        ? '检测到服务端仍有生成任务，正在继续同步状态；刷新页面不会丢失队列。'
        : interruptedHasResult
        ? '页面刷新前有生成请求正在进行，已保留收到的预览/画布。上游可能仍已扣费，请先检查结果或等待，不要立刻重复提交。'
        : '页面刷新前有生成请求正在进行，但本页已断开监听。上游可能仍已扣费，请先到历史图库或服务端确认，再决定是否重试。'
      : (sessionSnapshot.message || ''));
    setProgress(sessionSnapshot.status === 'loading'
      ? {
        ...(sessionSnapshot.progress || {}),
        stage: hasRestorableServerJob ? (sessionSnapshot.progress?.stage || 'upstream') : interruptedHasResult ? 'pending_review' : 'failed',
        percent: sessionSnapshot.progress?.percent || (hasRestorableServerJob ? 52 : 0)
      }
      : (sessionSnapshot.progress || { stage: 'idle', percent: 0, completed: 0, total: 1 }));
    setTiming(sessionSnapshot.timing || null);
  }

  function commitCurrentSessionPatch(patch) {
    const snapshot = saveCurrentSession({
      ...currentSessionRef.current,
      sessionId,
      ...patch
    });
    currentSessionRef.current = snapshot;
    const encodedSnapshot = sessionSnapshotComparePayload(snapshot);
    if (lastSessionSnapshotPayloadRef.current !== encodedSnapshot) {
      lastSessionSnapshotPayloadRef.current = encodedSnapshot;
      onSessionSnapshot?.(snapshot);
    }
    return snapshot;
  }

  function commitGenerationQueue(nextQueue) {
    generationQueueRef.current = nextQueue;
    setGenerationQueue(nextQueue);
    commitCurrentSessionPatch({ generationQueue: nextQueue });
  }

  useEffect(() => {
    if (!remoteSession) return;
    const remoteSessionMarker = remoteSession.updatedAt || sessionSnapshotComparePayload(remoteSession);
    if (!remoteSessionMarker) return;
    if (appliedRemoteSessionRef.current === remoteSessionMarker) return;
    const remoteUpdated = Date.parse(remoteSession.updatedAt) || 0;
    const localSession = currentSessionRef.current;
    const localUpdated = Date.parse(localSession?.updatedAt || '') || 0;
    if (localUpdated && localUpdated > remoteUpdated && hasMeaningfulSessionContent(localSession)) return;
    appliedRemoteSessionRef.current = remoteSessionMarker;
    currentSessionRef.current = remoteSession;
    applySessionSnapshot(remoteSession);
  }, [remoteSession]);

  useEffect(() => {
    const element = workPreviewRef.current;
    if (!element) return undefined;
    const updateViewport = () => {
      const rect = element.getBoundingClientRect();
      setCanvasViewport((current) => {
        const width = Math.round(rect.width || current.width || 1200);
        const height = Math.round(rect.height || current.height || 720);
        if (current.width === width && current.height === height) return current;
        return { width, height };
      });
    };
    updateViewport();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateViewport);
      return () => window.removeEventListener('resize', updateViewport);
    }
    const observer = new ResizeObserver(updateViewport);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const protectedAssetUrl = (node) => {
      const url = String(node?.url || '');
      const persistedUrl = String(node?.persistedUrl || '');
      if (url.startsWith('/studio-api/history/') || url.startsWith('/studio-api/generation-jobs/')) return url;
      return '';
    };
    if (canvasPerformanceMode) return;
    const protectedNodes = canvasNodes
      .map((node) => ({ node, assetUrl: protectedAssetUrl(node) }))
      .filter((item) => item.assetUrl)
      .slice(0, CANVAS_PROTECTED_ASSET_RESOLVE_LIMIT);
    if (!protectedNodes.length || !isAuthenticated) return;
    let cancelled = false;
    const historyClient = new StudioHistoryClient({ session: loadSession() });
    Promise.all(protectedNodes.map(async ({ node, assetUrl }) => ({
      id: node.id,
      persistedUrl: assetUrl,
      url: await enqueueProtectedImageTask(() => historyClient.resolveAssetUrl(assetUrl)).catch(() => assetUrl)
    }))).then((resolved) => {
      if (cancelled) {
        revokeBlobUrls(resolved.map((item) => item.url));
        return;
      }
      const resolvedMap = new Map(resolved
        .filter((item) => item.url && !String(item.url).startsWith('/studio-api/'))
        .map((item) => [item.id, item]));
      if (!resolvedMap.size) return;
      setCanvasNodes((current) => current.map((node) => (
        resolvedMap.has(node.id)
          ? { ...node, persistedUrl: node.persistedUrl || resolvedMap.get(node.id).persistedUrl, url: resolvedMap.get(node.id).url }
          : node
      )));
    });
    return () => {
      cancelled = true;
    };
  }, [canvasNodes, isAuthenticated, canvasPerformanceMode, visibleCanvasNodeIds]);

  useEffect(() => {
    const snapshot = saveCurrentSession({
      sessionId,
      createdAt: currentSessionRef.current?.createdAt || sessionCreatedAtRef.current,
      mode,
      prompt,
      model,
      results,
      videoResults,
      persistedResults: currentSessionRef.current?.persistedResults || [],
      persistedVideoResults: currentSessionRef.current?.persistedVideoResults || [],
      resultBatchMeta,
      canvasNodes: canvasNodesRef.current,
      canvasCustomLinks,
      generationQueue: generationQueueRef.current,
      selectedCanvasNodeId,
      canvasEditorNodeId,
      canvasView,
      status,
      message,
      progress,
      timing,
      assistantMessages: assistantMessages.map(serializeAssistantMessage).filter(Boolean).slice(-24),
      promptSuggestion: serializePromptSuggestion(promptSuggestion),
      selectedCase: selectedCase ? {
        id: selectedCase.id,
        title: selectedCase.title,
        image: selectedCase.image || selectedCase.image_url || '',
        imageAlt: selectedCase.imageAlt,
        promptPreview: selectedCase.promptPreview,
        category: selectedCase.category
      } : null,
      parameters: {
        ...draftParameters(),
        ...videoDraftParameters()
      }
    });
    currentSessionRef.current = snapshot;
    const encodedSnapshot = sessionSnapshotComparePayload(snapshot);
    if (lastSessionSnapshotPayloadRef.current !== encodedSnapshot) {
      lastSessionSnapshotPayloadRef.current = encodedSnapshot;
      onSessionSnapshot?.(snapshot);
    }
  }, [
    sessionId,
    mode,
    prompt,
    model,
    results,
    videoResults,
    resultBatchMeta,
    canvasNodes,
    canvasCustomLinks,
    generationQueue,
    selectedCanvasNodeId,
    canvasEditorNodeId,
    canvasView,
    status,
    message,
    progress,
    timing,
    assistantMessages,
    promptSuggestion?.finalPrompt,
    promptSuggestion?.raw,
    selectedCase?.id,
    aspect,
    customSize,
    quality,
    resolutionTier,
    outputFormat,
    moderation,
    countValue,
    videoModel,
    videoAspect,
    videoDuration,
    videoFps,
    videoMotion,
    videoStyle,
    videoQuality,
    negativePrompt
  ]);

  useEffect(() => {
    if (restoredQueueStartedRef.current) return;
    if (!isReady) return;
    const hasRestorableQueuedTask = generationQueueRef.current.some((item) => (
      item.status === 'queued' && item.restored && item.restorable !== false && !item.remote
    ));
    if (!hasRestorableQueuedTask) return;
    restoredQueueStartedRef.current = true;
    setMessage(t('statusMessages.localQueueRestored', '已恢复刷新前的本地排队任务，正在继续执行。'));
    runGenerationQueue();
  }, [isReady]);

  useEffect(() => {
    const thread = composerThreadRef.current;
    if (!layoutSections.bottomComposer || !thread) return;
    thread.scrollTo({
      top: thread.scrollHeight,
      behavior: 'smooth'
    });
  }, [
    assistantMessages,
    promptSuggestion?.finalPrompt,
    promptSuggestion?.raw,
    status,
    progress.stage,
    generationQueue.length,
    layoutSections.bottomComposer,
    message
  ]);

  function toggleLayoutSection(key) {
    updateLayoutSections({ [key]: !layoutSections[key] });
  }

  function openParamPanel(panel) {
    setActiveParamPanel(panel);
    setLayoutSections((current) => {
      if (current.parameters && current.parametersRail === false) return current;
      const next = { ...current, parameters: true, parametersRail: false };
      saveWorkbenchLayout(next);
      return next;
    });
  }

  function setCanvasZoom(nextZoom) {
    setCanvasView((current) => ({
      ...current,
      zoom: Math.max(0.55, Math.min(1.8, typeof nextZoom === 'function' ? nextZoom(current.zoom) : nextZoom))
    }));
  }

  function resetCanvasView() {
    setCanvasView({ x: 0, y: 0, zoom: 1 });
  }

  useEffect(() => {
    function handleCanvasZoomShortcut(event) {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.altKey) return;
      if (event.target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      if (event.key === '-' || event.key === '_') {
        event.preventDefault();
        setCanvasZoom((value) => value - 0.1);
      } else if (event.key === '=' || event.key === '+') {
        event.preventDefault();
        setCanvasZoom((value) => value + 0.1);
      } else if (event.key === '0') {
        event.preventDefault();
        resetCanvasView();
      }
    }

    window.addEventListener('keydown', handleCanvasZoomShortcut);
    return () => window.removeEventListener('keydown', handleCanvasZoomShortcut);
  }, []);

  function startCanvasPan(event) {
    if (event.button !== 0) return;
    if (event.target.closest?.('button, a, video, input, select, textarea, .graphNode, .canvasPort')) return;
    if (canvasLinkDraft) setCanvasLinkDraft(null);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    canvasDragRef.current = {
      type: 'pan',
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: canvasView.x,
      originY: canvasView.y
    };
  }

  function moveCanvasPan(event) {
    const drag = canvasDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.type === 'node-resize') {
      resizeCanvasNode(event, drag);
      return;
    }
    if (drag.type === 'node-move') {
      moveCanvasNode(event, drag);
      return;
    }
    if (drag.type === 'link-create') {
      const point = canvasPlanePointFromEvent(event);
      setCanvasLinkDraft((current) => current?.fromId === drag.fromId ? {
        ...current,
        point
      } : current);
      return;
    }
    setCanvasView((current) => ({
      ...current,
      x: drag.originX + event.clientX - drag.startX,
      y: drag.originY + event.clientY - drag.startY
    }));
  }

  function endCanvasPan(event) {
    const drag = canvasDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.type === 'node-move' && drag.moved) {
      suppressCanvasClickRef.current = true;
      window.setTimeout(() => {
        suppressCanvasClickRef.current = false;
      }, 0);
    }
    if (drag.type === 'link-create') {
      const targetNodeId = findCanvasLinkTarget(event, drag.fromId);
      const linked = addCanvasCustomLink(drag.fromId, targetNodeId);
      const moved = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) >= CANVAS_DRAG_CLICK_TOLERANCE;
      if (linked || moved) {
        setCanvasLinkDraft(null);
      } else {
        setCanvasLinkDraft((current) => current?.fromId === drag.fromId ? { fromId: drag.fromId, point: null } : { fromId: drag.fromId, point: null });
        setMessage(t('statusMessages.linkTargetHint', '选择另一张图左侧圆点，或拖到目标图片上建立关联。'));
      }
    }
    canvasDragRef.current = null;
  }

  function nodeWidth(node) {
    return clamp(Number(node?.width) || CANVAS_NODE_WIDTH, CANVAS_NODE_MIN_WIDTH, CANVAS_NODE_MAX_WIDTH);
  }

  function nodeHeight(node) {
    return clamp(Number(node?.height) || CANVAS_NODE_HEIGHT, CANVAS_NODE_MIN_HEIGHT, CANVAS_NODE_MAX_HEIGHT);
  }

  function canvasViewForNodes(nodes = [], preferredId = '') {
    const visibleNodes = Array.isArray(nodes) ? nodes.filter(Boolean) : [];
    if (!visibleNodes.length) return { x: 0, y: 0, zoom: 1 };
    const preferred = preferredId ? visibleNodes.find((node) => node.id === preferredId) : null;
    const focusNodes = preferred ? [preferred] : visibleNodes;
    const left = Math.min(...focusNodes.map((node) => node.x));
    const top = Math.min(...focusNodes.map((node) => node.y));
    const right = Math.max(...focusNodes.map((node) => node.x + nodeWidth(node)));
    const bottom = Math.max(...focusNodes.map((node) => node.y + nodeHeight(node)));
    return {
      x: -((left + right) / 2),
      y: -((top + bottom) / 2),
      zoom: 1
    };
  }

  function focusCanvasOnNodes(nodes = canvasNodes, preferredId = selectedCanvasNodeId) {
    setCanvasView(canvasViewForNodes(nodes, preferredId));
  }

  function startCanvasNodeResize(event, node) {
    if (!node?.id || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    canvasDragRef.current = {
      type: 'node-resize',
      pointerId: event.pointerId,
      nodeId: node.id,
      startX: event.clientX,
      startY: event.clientY,
      originWidth: nodeWidth(node),
      originHeight: nodeHeight(node)
    };
    setSelectedCanvasNodeId(node.id);
  }

  function startCanvasNodeDrag(event, node) {
    if (!node?.id || event.button !== 0) return;
    if (event.target.closest?.('a, input, select, textarea, .canvasPort, .canvasNodeResize, .canvasInlineEditor, .canvasNodeToolbar, .canvasNodeContinue')) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    canvasDragRef.current = {
      type: 'node-move',
      pointerId: event.pointerId,
      nodeId: node.id,
      startX: event.clientX,
      startY: event.clientY,
      originX: Number(node.x) || 0,
      originY: Number(node.y) || 0,
      moved: false
    };
    setSelectedCanvasNodeId(node.id);
  }

  function resizeCanvasNode(event, drag) {
    const zoom = canvasView.zoom || 1;
    const nextWidth = clamp(
      drag.originWidth + (event.clientX - drag.startX) / zoom,
      CANVAS_NODE_MIN_WIDTH,
      CANVAS_NODE_MAX_WIDTH
    );
    const nextHeight = clamp(
      drag.originHeight + (event.clientY - drag.startY) / zoom,
      CANVAS_NODE_MIN_HEIGHT,
      CANVAS_NODE_MAX_HEIGHT
    );
    setCanvasNodes((current) => current.map((node) => (
      node.id === drag.nodeId
        ? { ...node, width: Math.round(nextWidth), height: Math.round(nextHeight) }
        : node
    )));
  }

  function moveCanvasNode(event, drag) {
    const zoom = canvasView.zoom || 1;
    const dx = (event.clientX - drag.startX) / zoom;
    const dy = (event.clientY - drag.startY) / zoom;
    if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) >= CANVAS_DRAG_CLICK_TOLERANCE) {
      drag.moved = true;
    }
    setCanvasNodes((current) => current.map((node) => (
      node.id === drag.nodeId
        ? {
          ...node,
          x: Math.round(drag.originX + dx),
          y: Math.round(drag.originY + dy)
        }
        : node
    )));
  }

  function startCanvasLink(event, node) {
    if (!node?.id || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const point = canvasPlanePointFromEvent(event);
    canvasDragRef.current = {
      type: 'link-create',
      pointerId: event.pointerId,
      fromId: node.id,
      startX: event.clientX,
      startY: event.clientY
    };
    setSelectedCanvasNodeId(node.id);
    setCanvasLinkDraft({ fromId: node.id, point });
    setStatus('idle');
    setMessage('');
  }

  function finishCanvasLink(event, node) {
    event.preventDefault();
    event.stopPropagation();
    const draft = canvasLinkDraft;
    if (!draft?.fromId) return;
    addCanvasCustomLink(draft.fromId, node.id);
    setCanvasLinkDraft(null);
    canvasDragRef.current = null;
  }

  function handleCanvasNodeMediaClick(event, node) {
    event.stopPropagation();
    if (suppressCanvasClickRef.current) return;
    selectCanvasNode(node);
  }

  function appendCanvasNodes(urls, { kind = 'image', parentId = '', promptText = '', title = '生成结果', downloadMeta, replaceBatchId = '', persistedUrls = [] } = {}) {
    if (!urls.length) return;
    const activeDownloadMeta = downloadMeta || resultBatchMeta;
    setCanvasNodes((current) => {
      const retained = replaceBatchId
        ? current.filter((node) => node.downloadMeta?.id !== replaceBatchId)
        : current;
      const siblings = parentId ? retained.filter((node) => node.parentId === parentId).length : retained.filter((node) => !node.parentId).length;
      const parent = parentId ? retained.find((node) => node.id === parentId) : null;
      const parentWidth = nodeWidth(parent);
      const baseX = parent ? parent.x + parentWidth + CANVAS_NODE_HORIZONTAL_GAP : 0;
      const baseY = parent ? parent.y + (siblings - 0.5) * (CANVAS_NODE_HEIGHT + CANVAS_NODE_VERTICAL_GAP) : (retained.length % 4) * (CANVAS_NODE_HEIGHT + CANVAS_NODE_VERTICAL_GAP) - 250;
      const nextCanvasIndex = retained.reduce((max, node) => Math.max(max, Number(node.canvasIndex) || 0), 0) + 1;
      const nextNodes = urls.map((url, index) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${index}`,
        parentId,
        canvasIndex: nextCanvasIndex + index,
        kind,
        url,
        persistedUrl: persistedUrls[index] || '',
        prompt: promptText,
        downloadMeta: {
          mode: kind === 'video' ? 'video' : 'image',
          providerId: activeDownloadMeta?.providerId || '',
          createdAt: activeDownloadMeta?.createdAt || new Date().toISOString(),
          prompt: promptText,
          id: activeDownloadMeta?.id || ''
        },
        title: urls.length > 1 ? `${title} ${index + 1}` : title,
        x: baseX + index * 32,
        y: baseY + index * 42,
        width: CANVAS_NODE_WIDTH,
        height: CANVAS_NODE_HEIGHT,
        createdAt: new Date().toISOString()
      }));
      setSelectedCanvasNodeId(nextNodes[0]?.id || '');
      const nextCanvasNodes = [...retained, ...nextNodes];
      canvasNodesRef.current = nextCanvasNodes;
      commitCurrentSessionPatch({
        canvasNodes: nextCanvasNodes,
        selectedCanvasNodeId: nextNodes[0]?.id || selectedCanvasNodeId,
        generationQueue: generationQueueRef.current
      });
      return nextCanvasNodes;
    });
  }

  async function attachServerJobResult(historyClient, job, { silent = false } = {}) {
    const persistedUrls = Array.isArray(job?.resultUrls) ? job.resultUrls.filter(Boolean) : [];
    if (!job?.id || !persistedUrls.length || recoveredJobIdsRef.current.has(job.id)) return false;
    const currentNodes = Array.isArray(canvasNodesRef.current) ? canvasNodesRef.current : [];
    if (currentNodes.some((node) => node.downloadMeta?.id === job.id || persistedUrls.includes(node.persistedUrl || node.url))) {
      recoveredJobIdsRef.current.add(job.id);
      return false;
    }
    const displayUrls = await Promise.all(persistedUrls.map((url) => historyClient.resolveAssetUrl(url).catch(() => url)));
    if (sessionId !== job.sessionId) {
      revokeBlobUrls(displayUrls);
      return false;
    }
    appendCanvasNodes(displayUrls, {
      kind: 'image',
      parentId: job.parentCanvasNodeId || '',
      promptText: job.prompt || '',
      downloadMeta: {
        mode: 'image',
        providerId: job.model || '',
        createdAt: job.createdAt || new Date().toISOString(),
        prompt: job.prompt || '',
        id: job.id
      },
      title: '生成结果',
      replaceBatchId: job.id,
      persistedUrls
    });
    setResults(displayUrls);
    setResultBatchMeta({
      mode: 'image',
      providerId: job.model || '',
      createdAt: job.createdAt || new Date().toISOString(),
      prompt: job.prompt || '',
      sessionId,
      id: job.id
    });
    recoveredJobIdsRef.current.add(job.id);
    clearRemoteGenerationJob(job.id, 'done');
    if (!silent) {
      setStatus('success');
      setProgress({ stage: 'completed', percent: 100, completed: displayUrls.length, total: displayUrls.length || 1 });
      setMessage(t('statusMessages.serverResultRestored', '已从服务端恢复生成结果。'));
    }
    return true;
  }

  function syncRemoteGenerationJob(job) {
    if (!job?.id) return;
    const existingTask = generationQueueRef.current.find((item) => item.serverJobId === job.id || item.id === `remote-${job.id}`);
    if (existingTask?.status === 'canceled' && isActiveServerJobStatus(job.status)) return;
    const inheritedPrompt = job.prompt || existingTask?.prompt || existingTask?.summary || '';
    const remoteStatus = queueStatusFromServerJob(job);
    const requestIds = Array.isArray(job.requestIds) ? job.requestIds.filter(Boolean).slice(0, 8) : [];
    const error = normalizeServerJobError(job);
    const remoteTask = {
      id: `remote-${job.id}`,
      serverJobId: job.id,
      remote: true,
      status: remoteStatus,
      createdAt: Date.parse(job.createdAt || '') || Date.now(),
      startedAt: Date.parse(job.startedAt || '') || null,
      completedAt: Date.parse(job.completedAt || '') || null,
      mode: job.mode || 'image',
      providerId: job.providerId || job.providerFamily || '',
      providerFamily: job.providerFamily || job.providerId || '',
      apiKeySource: job.apiKeySource || '',
      providerLabel: job.providerLabel || '',
      prompt: inheritedPrompt,
      model: job.model || IMAGE_MODELS[0],
      size: job.size || 'auto',
      quality: job.quality || 'auto',
      count: job.count || 1,
      stage: job.stage || job.status || '',
      completed: Number(job.completed || 0),
      total: Number(job.total || job.count || 1),
      resultUrls: Array.isArray(job.resultUrls) ? job.resultUrls.filter(Boolean).slice(0, 4) : [],
      requestIds,
      error,
      selectedCanvasNodeId: job.parentCanvasNodeId || '',
      summary: inheritedPrompt || job.error?.message || `服务端任务 ${job.id}`,
      restorable: false
    };
    commitGenerationQueue([
      remoteTask,
      ...generationQueueRef.current.filter((item) => item.id !== remoteTask.id && item.serverJobId !== job.id)
    ].slice(0, GENERATION_QUEUE_LIMIT));
  }

  function clearRemoteGenerationJob(jobId, status = 'done') {
    if (!jobId) return;
    commitGenerationQueue(generationQueueRef.current.map((item) => (
      item.serverJobId === jobId || item.id === `remote-${jobId}`
        ? { ...item, status, completedAt: Date.now() }
        : item
    )));
  }

  useEffect(() => {
    if (!remoteSessionReady || !sessionId) return;
    let cancelled = false;
    let syncController = null;
    const historyClient = new StudioHistoryClient({ session: loadSession() });
    historyClient.listGenerationJobs({ sessionId, limit: 12 })
      .then(async (jobs) => {
        if (cancelled) return;
        const knownJobIds = new Set(jobs.map((job) => job?.id).filter(Boolean));
        const restoredJobIds = generationQueueRef.current
          .filter((item) => item?.serverJobId && item.remote && ['queued', 'running'].includes(item.status))
          .map((item) => item.serverJobId)
          .filter((jobId) => !knownJobIds.has(jobId));
        if (restoredJobIds.length) {
          const restoredJobs = await Promise.all(restoredJobIds.map((jobId) => (
            historyClient.getGenerationJob(jobId).catch(() => null)
          )));
          if (cancelled) return;
          jobs = [
            ...jobs,
            ...restoredJobs.filter((job) => job?.id && !knownJobIds.has(job.id))
          ];
        }
        const visibleRemoteJobs = jobs.filter(isVisibleServerJob);
        visibleRemoteJobs.forEach(syncRemoteGenerationJob);
        const succeededJobs = jobs
          .filter((job) => job.status === 'succeeded' && Array.isArray(job.resultUrls) && job.resultUrls.length)
          .reverse();
        for (const job of succeededJobs) {
          if (cancelled) return;
          await attachServerJobResult(historyClient, job, { silent: true });
        }
        if (generationRef.current.controller) return;
        const activeJob = jobs.find((job) => isActiveServerJobStatus(job.status));
        if (!activeJob || recoveredJobIdsRef.current.has(activeJob.id)) {
          const interruptedJob = jobs.find((job) => ['unknown', 'failed'].includes(job.status));
          if (interruptedJob && !recoveredJobIdsRef.current.has(interruptedJob.id)) {
            setStatus('error');
            setProgress(serverJobProgress(interruptedJob, interruptedJob.count));
            setMessage(serverJobMessage(interruptedJob));
          }
          return;
        }
        syncRemoteGenerationJob(activeJob);
        setStatus('loading');
        setProgress(serverJobProgress(activeJob, activeJob.count));
            setMessage(t('statusMessages.serverJobsSyncing', '检测到服务端仍有生成任务，正在继续同步状态。'));
        const controller = new AbortController();
        syncController = controller;
        generationRef.current = { id: generationRef.current.id + 1, controller, remoteJobId: activeJob.id };
        try {
          const finalJob = await waitForServerJob(historyClient, activeJob.id, { signal: controller.signal, total: activeJob.count });
          if (cancelled || !finalJob) return;
          if (finalJob.status === 'succeeded') {
            await attachServerJobResult(historyClient, finalJob);
            clearRemoteGenerationJob(finalJob.id, 'done');
          } else {
            clearRemoteGenerationJob(finalJob.id, queueStatusFromServerJob(finalJob));
            setStatus('error');
            setMessage(serverJobMessage(finalJob));
          }
        } finally {
          if (generationRef.current.remoteJobId === activeJob.id) {
            generationRef.current = { id: generationRef.current.id, controller: null };
          }
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      syncController?.abort(new DOMException('Session changed', 'AbortError'));
    };
  }, [remoteSessionReady, persistenceKey, sessionId]);

  function composeCanvasContinuationPrompt(node, instruction) {
    const currentPrompt = String(instruction || '').trim();
    const parentPrompt = String(node?.prompt || '').trim();
    if (!currentPrompt) return parentPrompt;
    if (!parentPrompt || currentPrompt.startsWith(parentPrompt)) return currentPrompt;
    return `${parentPrompt}\n\n基于画布 #${node?.canvasIndex || ''} 继续优化：\n${currentPrompt}`.trim();
  }

  function composedGenerationPrompt() {
    const currentPrompt = prompt.trim();
    if (!currentPrompt) return selectedCanvasNode?.prompt?.trim() || '';
    if (!selectedCanvasNode?.prompt) return currentPrompt;
    return composeCanvasContinuationPrompt(selectedCanvasNode, currentPrompt);
    const parentPrompt = selectedCanvasNode.prompt.trim();
    if (!parentPrompt || currentPrompt.startsWith(parentPrompt)) return currentPrompt;
    return `${parentPrompt}\n\n基于画布 ${selectedCanvasNode.canvasIndex || ''} 继续优化：${currentPrompt}`.trim();
  }

  function assistantBasePrompt() {
    return selectedCanvasNode?.prompt?.trim() || '';
  }

  function assistantUserInstruction() {
    return prompt.trim();
  }

  async function selectedCanvasReferenceFiles(node = selectedCanvasNode) {
    if (!node || node.kind === 'video' || !node.url) return [];
    try {
      const file = await imageUrlToFile(node.url, `canvas-${node.canvasIndex || 1}.png`);
      return [file];
    } catch (error) {
      throw new Error('选中的画布图片无法作为参考图读取，请重新选择图片节点或从历史图库里打开。');
    }
  }

  async function copyCanvasNodePrompt(node) {
    const text = node?.prompt?.trim();
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setStatus('success');
    setMessage(t('statusMessages.nodePromptCopied', '#{index} 的提示词已复制。', { index: node.canvasIndex || '' }));
    window.setTimeout(() => setStatus('idle'), 1200);
  }

  async function setCanvasNodeAsReference(node) {
    if (!node || node.kind === 'video' || !node.url) return;
    try {
      const file = await imageUrlToFile(node.url, `canvas-${node.canvasIndex || 1}.png`);
      setReferenceItems([createReferenceItem(file, 'identity')]);
      setSelectedCanvasNodeId(node.id);
      setMode('edit');
      updateLayoutSections({ references: true, bottomComposer: true });
      setStatus('success');
      setMessage(t('statusMessages.nodeReferenceSet', '#{index} 已设为本轮参考图。', { index: node.canvasIndex || '' }));
      window.setTimeout(() => setStatus('idle'), 1200);
    } catch (error) {
      setStatus('error');
      setMessage(error?.message || t('statusMessages.nodeReferenceFailed', '这张图暂时无法设为参考图。'));
    }
  }

  function previewCanvasNode(node) {
    if (!node?.url) return;
    if (node.kind === 'video') {
      setPreviewVideo({
        url: node.url,
        index: Math.max(0, (node.canvasIndex || 1) - 1),
        downloadMeta: node.downloadMeta || null
      });
      return;
    }
    setPreviewImage({
      url: node.url,
      index: Math.max(0, (node.canvasIndex || 1) - 1),
      downloadMeta: node.downloadMeta || null
    });
  }

  function deleteCanvasNode(node) {
    if (!node?.id) return;
    const deletedIds = new Set([node.id]);
      setCanvasNodes((current) => {
        let changed = true;
        while (changed) {
        changed = false;
        for (const item of current) {
          if (!deletedIds.has(item.id) && deletedIds.has(item.parentId)) {
            deletedIds.add(item.id);
            changed = true;
          }
        }
      }
      return current.filter((item) => !deletedIds.has(item.id));
    });
    setCanvasCustomLinks((current) => current.filter((link) => !deletedIds.has(link.fromId) && !deletedIds.has(link.toId)));
    setCanvasLinkDraft((current) => current && deletedIds.has(current.fromId) ? null : current);
    if (deletedIds.has(selectedCanvasNodeId)) setSelectedCanvasNodeId('');
    if (deletedIds.has(canvasEditorNodeId)) closeCanvasEditor();
    setStatus('success');
    setMessage(t('statusMessages.nodeDeleted', '#{index} 已从当前画布移除。', { index: node.canvasIndex || '' }));
    window.setTimeout(() => setStatus('idle'), 1200);
  }

  function openCanvasEditor(node, nextMode = 'image') {
    if (!node) return;
    setSelectedCanvasNodeId(node.id);
    setCanvasEditorNodeId(node.id);
    setCanvasEditorMode(nextMode);
    setCanvasEditorPrompt('');
    setMode(nextMode);
    updateLayoutSections({
      bottomComposer: false,
      references: nextMode === 'mask'
    });
    setStatus('idle');
    setMessage('');
  }

  function closeCanvasEditor() {
    setCanvasEditorNodeId('');
    setCanvasEditorPrompt('');
  }

  function generateFromCanvasEditor(node, modeOverride = canvasEditorMode) {
    if (!node) return;
    const nextPrompt = canvasEditorPrompt.trim();
    const normalizedMode = modeOverride === 'mask' ? 'mask' : modeOverride === 'edit' ? 'edit' : 'image';
    const generationPrompt = normalizedMode === 'image'
      ? composeCanvasContinuationPrompt(node, nextPrompt)
      : nextPrompt;
    setSelectedCanvasNodeId(node.id);
    setMode(normalizedMode);
    if (normalizedMode === 'mask') {
      updateLayoutSections({ references: true, bottomComposer: false });
      setPrompt(generationPrompt);
      if (!maskEditorRef.current?.exportMask?.()) {
        setStatus('idle');
        setMessage(t('statusMessages.maskPaintRequired', '先在 Mask 面板涂抹需要重绘的区域，再回到这张图点生成。'));
        return;
      }
    }
    setPrompt(generationPrompt);
    setPendingCanvasGenerate({
      nodeId: node.id,
      mode: normalizedMode,
      prompt: generationPrompt,
      referenceItems: [],
      referencesOpen: normalizedMode !== 'image',
      selectedCanvasNodeSnapshot: { ...node },
      requestId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    });
  }

  function generateMaskFromPanel() {
    if (!selectedCanvasNode) {
      setStatus('error');
      setMessage(t('statusMessages.maskSelectNode', '请先选中一张画布图片，再用 Mask 继续生成。'));
      return;
    }
    setCanvasEditorMode('mask');
    setCanvasEditorNodeId(selectedCanvasNode.id);
    generateFromCanvasEditor(selectedCanvasNode, 'mask');
  }

  function changeCanvasEditorMode(nextMode) {
    setCanvasEditorMode(nextMode);
    setMode(nextMode);
    updateLayoutSections({
      references: nextMode === 'mask',
      bottomComposer: false
    });
    setStatus('idle');
    setMessage('');
  }

  function selectCanvasNode(node) {
    setSelectedCanvasNodeId(node.id);
    setCanvasEditorNodeId(node.id);
    setCanvasEditorMode('image');
    setCanvasEditorPrompt('');
    const nextPrompt = node.prompt ? `继续优化 #${node.canvasIndex || ''}：` : '';
    setPrompt(nextPrompt);
    updateLayoutSections({ bottomComposer: true });
    setMode((current) => current === 'video' ? 'video' : 'image');
    setStatus('idle');
    setMessage('');
  }

  function casePromptKey(item) {
    if (!item) return '';
    return `${item.kind || 'case'}:${item.id ?? item.title ?? item.promptPreview ?? ''}`;
  }

  function applySelectedCasePrompt(item, nextPrompt) {
    const key = casePromptKey(item);
    const value = nextPrompt || '';
    appliedCasePromptRef.current = { key, prompt: value };
  }

  useEffect(() => {
    if (activeWorkspace === 'video') {
      setMode('video');
      return;
    }
    if (mode === 'video') setMode('image');
  }, [activeWorkspace]);

  useEffect(() => {
    if (!selectedCase) return;
    if (selectedCase.kind === 'video-inspiration') {
      setMode('video');
      setVideoAspect(normalizeVideoAspect(selectedCase.videoAspect || selectedCase.videoAspectRatio));
      setVideoDuration(normalizeVideoDuration(selectedCase.videoDuration || selectedCase.duration));
      setVideoFps(normalizeVideoFps(selectedCase.videoFps || selectedCase.fps));
      setVideoMotion(normalizeVideoMotion(selectedCase.videoMotion));
      setVideoStyle(normalizeVideoStyle(selectedCase.videoStyle));
      setVideoQuality(normalizeVideoQuality(selectedCase.videoQuality));
      setPromptSuggestion(null);
      setPreviewImage(null);
      setVideoResults([]);
      setVideoTask(null);
      if (!selectedCase.prompt && selectedCase.id && onResolveCase) {
        const requestId = resolvingCaseRef.current.id + 1;
        resolvingCaseRef.current = { id: requestId };
        setCaseResolving(true);
        applySelectedCasePrompt(selectedCase, '');
        setNegativePrompt('');
        onResolveCase(selectedCase)
          .then((resolvedCase) => {
            if (resolvingCaseRef.current.id !== requestId || !resolvedCase) return;
            applySelectedCasePrompt(selectedCase, resolvedCase.prompt || '');
            setNegativePrompt(resolvedCase.negativePrompt || '');
            updateLayoutSections({ bottomComposer: true });
          })
          .catch((error) => {
            if (resolvingCaseRef.current.id !== requestId) return;
            setStatus('error');
            setMessage(error?.message || '视频灵感读取失败。');
          })
          .finally(() => {
            if (resolvingCaseRef.current.id === requestId) setCaseResolving(false);
          });
        return;
      }
      applySelectedCasePrompt(selectedCase, selectedCase.prompt || '');
      setNegativePrompt(selectedCase.negativePrompt || '');
      if (selectedCase.prompt) updateLayoutSections({ bottomComposer: true });
      return;
    }
    if (!selectedCase.prompt && selectedCase.id && onResolveCase) {
      const requestId = resolvingCaseRef.current.id + 1;
      resolvingCaseRef.current = { id: requestId };
      setCaseResolving(true);
      applySelectedCasePrompt(selectedCase, selectedCase.promptPreview || '');
      onResolveCase(selectedCase)
        .then((resolvedCase) => {
          if (resolvingCaseRef.current.id !== requestId || !resolvedCase) return;
          applySelectedCasePrompt(selectedCase, resolvedCase.prompt || resolvedCase.promptPreview || '');
          updateLayoutSections({ bottomComposer: true });
          setPromptSuggestion(null);
          setPreviewImage(null);
        })
        .catch((error) => {
          if (resolvingCaseRef.current.id !== requestId) return;
          setStatus('error');
          setMessage(error?.message || '模板详情读取失败。');
        })
        .finally(() => {
          if (resolvingCaseRef.current.id === requestId) setCaseResolving(false);
        });
      return;
    }
    if (draftRef.current?.prompt) {
      setMode(draftRef.current.mode || 'image');
      appliedCasePromptRef.current = { key: '', prompt: '' };
      setPrompt(draftRef.current.prompt);
      setModel(draftRef.current.model || IMAGE_MODELS[0]);
      const nextSize = normalizeSize(draftRef.current.size || '1024x1024');
      setAspect(normalizeAspect(draftRef.current.aspect || draftRef.current.aspectRatio, nextSize));
      setCustomSize(normalizeSize(draftRef.current.customSize || nextSize));
      setQuality(normalizeQuality(draftRef.current.quality));
      setResolutionTier(normalizeResolutionTier(draftRef.current.resolutionTier));
      setOutputFormat(normalizeOutputFormat(draftRef.current.outputFormat));
      setModeration(normalizeModeration(draftRef.current.moderation));
      setCount(normalizeCount(draftRef.current.count));
      setVideoModel(draftRef.current.videoModel || VIDEO_MODELS[0]);
      setVideoAspect(normalizeVideoAspect(draftRef.current.videoAspect || draftRef.current.videoAspectRatio));
      setVideoDuration(normalizeVideoDuration(draftRef.current.videoDuration || draftRef.current.duration));
      setVideoFps(normalizeVideoFps(draftRef.current.videoFps || draftRef.current.fps));
      setVideoMotion(normalizeVideoMotion(draftRef.current.videoMotion));
      setVideoStyle(normalizeVideoStyle(draftRef.current.videoStyle));
      setVideoQuality(normalizeVideoQuality(draftRef.current.videoQuality));
      setNegativePrompt(draftRef.current.negativePrompt || '');
      updateLayoutSections({ bottomComposer: true });
      draftRef.current = null;
      clearDraft();
      return;
    }
    applySelectedCasePrompt(selectedCase, selectedCase?.prompt || selectedCase?.promptPreview || '');
    if (selectedCase?.prompt || selectedCase?.promptPreview) updateLayoutSections({ bottomComposer: true });
    setPromptSuggestion(null);
    setPreviewImage(null);
  }, [selectedCase]);

  useEffect(() => {
    if (!appendTemplateRequest?.prompt) return;
    setPrompt((current) => `${current.trim()}${current.trim() ? '\n\n' : ''}${appendTemplateRequest.prompt}`.trim());
    updateLayoutSections({ bottomComposer: true });
    setStatus('success');
    setMessage(t('statusMessages.templateAppended', '已追加模板提示词。'));
    window.setTimeout(() => setStatus('idle'), 1200);
    onAppendTemplateConsumed?.(appendTemplateRequest.id);
  }, [appendTemplateRequest?.id]);

  useEffect(() => {
    const previews = referenceItems.map((item) => filePreviewUrl(item.file));
    setReferencePreviews(previews);
    return () => previews.forEach((url) => URL.revokeObjectURL(url));
  }, [referenceItems]);

  useEffect(() => () => {
    if (maskExportUrl) URL.revokeObjectURL(maskExportUrl);
  }, [maskExportUrl]);

  useEffect(() => {
    const previews = videoReferenceFiles.map(filePreviewUrl);
    setVideoReferencePreviews(previews);
    return () => previews.forEach((url) => URL.revokeObjectURL(url));
  }, [videoReferenceFiles]);

  function appendReferenceImages(files) {
    const nextFiles = supportedReferenceFiles(files, IMAGE_REFERENCE_LIMIT);
    if (!nextFiles.length) {
      setStatus('error');
      setMessage(t('statusMessages.referenceUnsupported', '只支持 PNG / JPG / WebP 参考图。'));
      return;
    }
    if (mode === 'image') setMode('edit');
    setReferenceItems((current) => [
      ...current,
      ...nextFiles.map((file, index) => createReferenceItem(file, current.length + index === 0 ? 'identity' : 'style'))
    ].slice(0, IMAGE_REFERENCE_LIMIT));
    setStatus('idle');
    setMessage('');
  }

  function appendVideoReferenceImage(files) {
    const nextFiles = supportedReferenceFiles(files, 1);
    if (!nextFiles.length) {
      setStatus('error');
      setMessage(t('statusMessages.referenceUnsupported', '只支持 PNG / JPG / WebP 参考图。'));
      return;
    }
    setVideoReferenceFiles(nextFiles);
    setStatus('idle');
    setMessage('');
  }

  function referencePasteFiles(event) {
    const files = supportedReferenceFiles(event.clipboardData?.files, IMAGE_REFERENCE_LIMIT);
    if (!files.length) return;
    event.preventDefault();
    appendReferenceImages(files);
  }

  function videoReferencePasteFiles(event) {
    const files = supportedReferenceFiles(event.clipboardData?.files, 1);
    if (!files.length) return;
    event.preventDefault();
    appendVideoReferenceImage(files);
  }

  function removeReferenceImage(index) {
    setReferenceItems((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  function clearReferenceImages() {
    setReferenceItems([]);
    if (maskExportUrl) {
      URL.revokeObjectURL(maskExportUrl);
      setMaskExportUrl('');
    }
  }

  function handleMaskExportReady(url) {
    if (maskExportUrl) URL.revokeObjectURL(maskExportUrl);
    setMaskExportUrl(url);
    setStatus('success');
    setMessage(t('statusMessages.maskExported', 'Mask 已导出，可用于本次局部重绘。'));
    window.setTimeout(() => setStatus('idle'), 1400);
  }

  function moveReferenceImage(index, direction) {
    setReferenceItems((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  }

  function updateReferenceRole(index, role) {
    setReferenceItems((current) => current.map((item, itemIndex) => (
      itemIndex === index ? { ...item, role } : item
    )));
  }

  function removeVideoReferenceImage() {
    setVideoReferenceFiles([]);
  }

  useEffect(() => {
    function handleWindowPaste(event) {
      const target = event.target;
      if (target?.closest?.('textarea, input:not([type="file"]), [contenteditable="true"]')) return;
      if (mode === 'edit' || mode === 'mask') {
        const files = supportedReferenceFiles(event.clipboardData?.files, IMAGE_REFERENCE_LIMIT);
        if (!files.length) return;
        event.preventDefault();
        appendReferenceImages(files);
      }
      if (mode === 'video') {
        const files = supportedReferenceFiles(event.clipboardData?.files, 1);
        if (!files.length) return;
        event.preventDefault();
        appendVideoReferenceImage(files);
      }
    }
    window.addEventListener('paste', handleWindowPaste);
    return () => window.removeEventListener('paste', handleWindowPaste);
  }, [mode]);

  useEffect(() => {
    if (!selectedHistory) return;
    if (activeWorkspace !== 'history') {
      setMode(activeWorkspace === 'video' ? 'video' : selectedHistory.mode === 'mask' ? 'mask' : selectedHistory.mode === 'edit' ? 'edit' : 'image');
    }
    const selectedResultItems = historyResultItems(selectedHistory);
    const primaryPrompt = selectedResultItems[0]?.generationPrompt || selectedResultItems[0]?.prompt || selectedHistory.prompt || '';
    setPrompt(primaryPrompt);
    setModel(selectedHistory.model || IMAGE_MODELS[0]);
    const nextSize = normalizeSize(selectedHistory.size || '1024x1024');
    setAspect(normalizeAspect(selectedHistory.aspect || selectedHistory.aspectRatio, nextSize));
    setCustomSize(normalizeSize(selectedHistory.customSize || nextSize));
    setQuality(normalizeQuality(selectedHistory.quality));
    setResolutionTier(normalizeResolutionTier(selectedHistory.resolutionTier));
    setOutputFormat(normalizeOutputFormat(selectedHistory.outputFormat));
    setModeration(normalizeModeration(selectedHistory.moderation));
    setCount(normalizeCount(selectedHistory.count));
    setVideoModel(selectedHistory.mode === 'video' ? selectedHistory.model || selectedHistory.videoModel || VIDEO_MODELS[0] : videoModel);
    setVideoAspect(normalizeVideoAspect(selectedHistory.videoAspect || selectedHistory.aspect || selectedHistory.aspectRatio));
    setVideoDuration(normalizeVideoDuration(selectedHistory.videoDuration || selectedHistory.duration));
    setVideoFps(normalizeVideoFps(selectedHistory.videoFps || selectedHistory.fps));
    setVideoMotion(normalizeVideoMotion(selectedHistory.videoMotion));
    setVideoStyle(normalizeVideoStyle(selectedHistory.videoStyle));
    setVideoQuality(normalizeVideoQuality(selectedHistory.videoQuality));
    setNegativePrompt(selectedHistory.negativePrompt || '');
    const nextUrls = selectedResultItems.length
      ? selectedResultItems.map((result) => result.displayUrl || result.url).filter(Boolean)
      : Array.isArray(selectedHistory.displayResultUrls)
        ? selectedHistory.displayResultUrls
        : Array.isArray(selectedHistory.resultUrls)
          ? selectedHistory.resultUrls
          : [];
    setResults(selectedHistory.mode === 'video' ? [] : nextUrls);
    setVideoResults(selectedHistory.mode === 'video' ? nextUrls : []);
    setResultBatchMeta(downloadMetaFromHistoryItem(selectedHistory, selectedHistory.mode === 'video'));
    if (nextUrls.length) {
      const nextNodes = (selectedResultItems.length ? selectedResultItems : nextUrls)
        .map((result, index) => buildCanvasNodeFromHistoryItem(selectedHistory, result, index));
      setCanvasNodes(nextNodes);
      setSelectedCanvasNodeId(nextNodes[0]?.id || '');
      setCanvasView(canvasViewForNodes(nextNodes, nextNodes[0]?.id || ''));
    }
    setStatus('idle');
    setPromptSuggestion(null);
    setProgress({ stage: 'idle', percent: 0, completed: 0, total: normalizeCount(selectedHistory.count) });
    setMessage('');
  }, [selectedHistory?.id]);

  useEffect(() => {
    if (!focusSignal || !canvasNodes.length) return;
    focusCanvasOnNodes(canvasNodes, selectedCanvasNodeId);
  }, [focusSignal]);

  useEffect(() => {
    if (!imageModelOptions.some((item) => item.id === model)) {
      setModel(imageModelOptions[0]?.id || IMAGE_MODELS[0]);
    }
    if (assistantModelOptions.length && !responseModelOptions.some((item) => item.id === providerSettings.responsesModel)) {
      onProviderChange({ ...providerSettings, responsesModel: responseModelOptions[0]?.id || providerSettings.responsesModel });
    }
  }, [modelOptions?.image, modelOptions?.responses]);

  useEffect(() => {
    if (syncedVideoModelOptions.length && !syncedVideoModelOptions.some((item) => item.id === videoModel)) {
      setVideoModel(syncedVideoModelOptions[0].id);
    }
  }, [modelOptions?.video]);

  useEffect(() => () => {
    generationRef.current.controller?.abort();
  }, []);

  useEffect(() => {
    if (!pendingCanvasGenerate) return;
    if (selectedCanvasNodeId !== pendingCanvasGenerate.nodeId) return;
    if (mode !== pendingCanvasGenerate.mode) return;
    if (prompt !== pendingCanvasGenerate.prompt) return;
    setPendingCanvasGenerate(null);
    closeCanvasEditor();
    enqueueGeneration({
      mode: pendingCanvasGenerate.mode,
      prompt: pendingCanvasGenerate.prompt,
      referenceItems: pendingCanvasGenerate.referenceItems,
      referencesOpen: pendingCanvasGenerate.referencesOpen,
      selectedCanvasNodeId: pendingCanvasGenerate.nodeId,
      selectedCanvasNodeSnapshot: pendingCanvasGenerate.selectedCanvasNodeSnapshot
    });
  }, [pendingCanvasGenerate?.requestId, selectedCanvasNodeId, mode, prompt]);

  useEffect(() => {
    if (!pendingSuggestionGenerate) return;
    if (prompt !== pendingSuggestionGenerate.prompt) return;
    setPendingSuggestionGenerate(null);
    enqueueGeneration();
  }, [pendingSuggestionGenerate?.requestId, prompt]);

  function applyCreativeRecipe(recipe) {
    if (!recipe) return;
    setMode((current) => current === 'video' ? current : current);
    const nextSize = normalizeSize(recipe.size);
    setAspect(normalizeAspect(recipe.aspect, nextSize));
    setCustomSize(nextSize);
    setQuality(normalizeQuality(recipe.quality));
    setResolutionTier(normalizeResolutionTier(recipe.resolutionTier));
    setActiveRecipeId(recipe.id);
    setPrompt((current) => {
      const base = stripCreativeRecipePrompt(current);
      if (!base) return recipe.prompt;
      if (base.includes(recipe.prompt)) return base;
      return `${base}\n\n${CREATIVE_RECIPE_PREFIX}${recipe.prompt}`;
    });
    setStatus('idle');
    setMessage('');
  }

  async function applyPromptPreset(item) {
    if (!item?.id) return;
    if (!isAuthenticated) {
      onRequireLogin();
      return;
    }
    setCaseResolving(true);
    try {
      const historyClient = new StudioHistoryClient({ session: loadSession() });
      const preset = await historyClient.getPromptPreset(item.id);
      if (preset?.prompt) {
        setPrompt(preset.prompt);
        updateLayoutSections({ bottomComposer: true });
      }
    } catch (error) {
      setStatus('error');
      setMessage(error?.message || '快捷提示词读取失败。');
    } finally {
      setCaseResolving(false);
    }
  }

  async function copyPrompt() {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  async function optimizeCurrentPrompt() {
    const currentPrompt = prompt.trim();
    if (!currentPrompt) {
      setStatus('error');
      setMessage(caseResolving
        ? t('statusMessages.templateLoading', '模板提示词正在读取，请稍后。')
        : t('statusMessages.promptRequired', '请先填写提示词，或先选中一个画布节点继续。'));
      return;
    }
    if (caseResolving) {
      setStatus('error');
      setMessage(t('statusMessages.templateLoading', '模板提示词正在读取，请稍后。'));
      return;
    }
    if (optimizingPrompt) return;
    if (usesGatewayAccount(providerSettings) && !isAuthenticated) {
      saveDraft({
        caseId: selectedCase?.id || null,
        mode,
        prompt: currentPrompt,
        model,
        ...draftParameters(),
        ...videoDraftParameters()
      });
      onRequireLogin();
      return;
    }
    const providerRequest = resolveProviderRequest(providerSettings, apiKey);
    if (!providerRequest.apiKey) {
      setStatus('error');
      setMessage(providerSettings.apiKeySource === 'manual'
        ? t('statusMessages.keyRequired', '请先填写密钥。')
        : t('statusMessages.accountPreparing', '账号连接还在准备中。'));
      onOpenSettings();
      return;
    }
    setOptimizingPrompt(true);
    setStatus('loading');
    setMessage(t('statusMessages.optimizingPrompt', '正在优化提示词'));
    try {
      const result = await client.optimizePrompt({
        ...providerRequest,
        prompt: currentPrompt,
        instruction: promptInstruction.trim(),
        size,
        aspectRatio: aspect,
        quality,
        resolutionTier: RESOLUTION_TIER_LABELS[resolutionTier] || resolutionTier,
        onPartial: (text) => {
          const parsed = parseOptimizedPrompt(text);
          if (parsed) setPromptSuggestion(parsed);
          setMessage(t('statusMessages.receivingSuggestion', '正在接收优化建议'));
        }
      });
      setPromptSuggestion(parseOptimizedPrompt(result.prompt));
      setStatus('success');
      setMessage(t('statusMessages.suggestionReady', '已生成优化建议，可合并或替换。'));
      window.setTimeout(() => setStatus('idle'), 1200);
    } catch (error) {
      setStatus('error');
      setMessage(error?.message || t('statusMessages.optimizeFailed', '优化失败'));
    } finally {
      setOptimizingPrompt(false);
    }
  }

  async function sendAssistantMessage() {
    const userText = assistantUserInstruction();
    if (!userText) {
      setStatus('error');
      setMessage(t('statusMessages.assistantInputRequired', '请先输入你想让 AI 帮你整理的创作想法。'));
      return;
    }
    if (caseResolving) {
      setStatus('error');
      setMessage(t('statusMessages.templateLoading', '模板提示词正在读取，请稍后。'));
      return;
    }
    if (optimizingPrompt) return;
    if (usesGatewayAccount(providerSettings) && !isAuthenticated) {
      saveDraft({
        caseId: selectedCase?.id || null,
        mode,
        prompt: userText,
        model,
        ...draftParameters(),
        ...videoDraftParameters()
      });
      onRequireLogin();
      return;
    }
    const providerRequest = resolveProviderRequest(providerSettings, apiKey);
    if (!providerRequest.apiKey) {
      setStatus('error');
      setMessage(providerSettings.apiKeySource === 'manual'
        ? t('statusMessages.keyRequired', '请先填写密钥。')
        : t('statusMessages.accountPreparing', '账号连接还在准备中。'));
      onOpenSettings();
      return;
    }

    const userMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: userText
    };
    const pendingMessage = {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content: t('statusMessages.assistantPending', '正在整理创作提示词...'),
      pending: true
    };
    const nextMessages = [...assistantMessages, userMessage];
    setAssistantMessages([...nextMessages, pendingMessage]);
    setOptimizingPrompt(true);
    setStatus('loading');
    setMessage(t('statusMessages.assistantCalling', '正在调用对话模型'));
    try {
      const result = await client.chatPromptAssistant({
        ...providerRequest,
        prompt: selectedCanvasNode ? userText : composedGenerationPrompt(),
        basePrompt: wantsPromptRewrite(userText) ? '' : assistantBasePrompt(),
        userInstruction: userText,
        selectedCanvasLabel: selectedCanvasNode ? `#${selectedCanvasNode.canvasIndex || ''}` : '',
        messages: nextMessages.map((item) => ({ role: item.role, content: item.content })),
        size,
        aspectRatio: aspect,
        quality,
        resolutionTier: RESOLUTION_TIER_LABELS[resolutionTier] || resolutionTier,
        onPartial: (text) => {
          const parsed = parseAssistantReply(text);
          setAssistantMessages((current) => current.map((item) => item.id === pendingMessage.id ? {
            ...item,
            content: parsed?.reply || text || t('statusMessages.assistantPending', '正在整理创作提示词...'),
            pending: true
          } : item));
        }
      });
      const parsed = parseAssistantReply(result.text);
      if (parsed?.finalPrompt) {
        setPromptSuggestion({
          finalPrompt: parsed.finalPrompt,
          raw: result.text
        });
      }
      setAssistantMessages((current) => current.map((item) => item.id === pendingMessage.id ? {
        ...item,
        content: parsed?.reply || result.text,
        finalPrompt: parsed?.finalPrompt || '',
        pending: false
      } : item));
      setStatus('success');
      setMessage(parsed?.finalPrompt
        ? t('statusMessages.assistantReady', '已整理为可生成提示词。')
        : t('statusMessages.assistantReplied', '助手已回复。'));
      window.setTimeout(() => setStatus('idle'), 1200);
    } catch (error) {
      setAssistantMessages((current) => current.map((item) => item.id === pendingMessage.id ? {
        ...item,
        content: error?.message || t('statusMessages.assistantFailed', '对话模型调用失败'),
        pending: false,
        failed: true
      } : item));
      setStatus('error');
      setMessage(error?.message || t('statusMessages.assistantFailed', '对话模型调用失败'));
    } finally {
      setOptimizingPrompt(false);
    }
  }

  function mergeSuggestion() {
    const nextPrompt = promptSuggestion?.finalPrompt || promptSuggestion?.raw || '';
    if (!nextPrompt) return;
    setPrompt(`${prompt.trim()}\n\n${t('statusMessages.suggestionMergePrefix', '补充优化：')}\n${nextPrompt}`.trim());
    setPromptSuggestion(null);
  }

  function replaceSuggestion() {
    const nextPrompt = promptSuggestion?.finalPrompt || promptSuggestion?.raw || '';
    if (!nextPrompt) return;
    setPrompt(nextPrompt);
    setPromptSuggestion(null);
  }

  async function copySuggestion() {
    const nextPrompt = promptSuggestion?.finalPrompt || promptSuggestion?.raw || '';
    if (!nextPrompt) return;
    await navigator.clipboard.writeText(nextPrompt);
    setStatus('success');
    setMessage(t('statusMessages.suggestionCopied', '优化建议已复制。'));
    window.setTimeout(() => setStatus('idle'), 1200);
  }

  function useSuggestionForGenerate() {
    const nextPrompt = promptSuggestion?.finalPrompt || promptSuggestion?.raw || '';
    if (!nextPrompt) return;
    setPrompt(nextPrompt);
    setPromptSuggestion(null);
    setPendingSuggestionGenerate({
      prompt: nextPrompt,
      requestId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    });
  }

  async function videoReferenceDataUrl() {
    const file = videoReferenceFiles[0];
    if (!file) return '';
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('REFERENCE_IMAGE_READ_FAILED'));
      reader.readAsDataURL(file);
    });
  }

  function buildGenerationTask(overrides = {}) {
    const basePrompt = typeof overrides.prompt === 'string' ? overrides.prompt : composedGenerationPrompt();
    const taskMode = overrides.mode || mode;
    const taskReferenceItems = Array.isArray(overrides.referenceItems) ? overrides.referenceItems : referenceItems;
    const taskSelectedCanvasNode = overrides.selectedCanvasNodeSnapshot
      || (selectedCanvasNode ? { ...selectedCanvasNode } : null);
    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      status: 'queued',
      createdAt: Date.now(),
      mode: taskMode,
      prompt: basePrompt,
      model,
      aspect,
      aspectRatio: aspect,
      customSize,
      size,
      quality,
      resolutionTier,
      outputFormat,
      moderation,
      count: countValue,
      videoModel,
      videoAspect,
      videoAspectRatio: videoAspect,
      videoDuration,
      duration: videoDuration,
      videoFps,
      fps: videoFps,
      videoMotion,
      videoStyle,
      videoQuality,
      negativePrompt,
      referenceItems: taskReferenceItems,
      videoReferenceFiles,
      maskFile: taskMode === 'mask' ? maskEditorRef.current?.exportMask?.() || null : null,
      selectedCanvasNodeId: overrides.selectedCanvasNodeId ?? selectedCanvasNodeId,
      selectedCanvasNodeSnapshot: taskSelectedCanvasNode,
      referencesOpen: overrides.referencesOpen ?? layoutSections.references,
      summary: basePrompt || prompt.trim() || selectedCanvasNode?.prompt?.trim() || '未填写提示词'
    };
  }

  function markGenerationTask(id, patch) {
    commitGenerationQueue(generationQueueRef.current.map((item) => (
      item.id === id ? { ...item, ...patch } : item
    )));
  }

  function cancelGenerationTask(id) {
    const target = generationQueueRef.current.find((item) => item.id === id);
    if (!target) return;
    if (target.remote && target.serverJobId) {
      const historyClient = new StudioHistoryClient({ session: loadSession() });
      if (generationRef.current.remoteJobId === target.serverJobId) {
        generationRef.current.controller?.abort(new Error('JOB_CANCELED'));
        generationRef.current = { id: generationRef.current.id + 1, controller: null };
      }
      markGenerationTask(id, { status: 'canceled', completedAt: Date.now() });
      setStatus('error');
      setProgress((current) => ({
        ...current,
        stage: 'failed',
        percent: 0
      }));
      historyClient.cancelGenerationJob(target.serverJobId)
        .then((job) => {
          if (job?.id) syncRemoteGenerationJob(job);
          setMessage(serverJobMessage(job || { status: 'canceled' }));
        })
        .catch(() => {
          setMessage(t('statusMessages.queueCancelFailed', '已从本页移除队列项；服务端取消失败，请稍后查看历史图库确认结果。'));
        });
      return;
    }
    if (target.status === 'running') {
      stopGeneration();
      return;
    }
    commitGenerationQueue(generationQueueRef.current.map((item) => (
      item.id === id ? { ...item, status: 'canceled', completedAt: Date.now() } : item
    )));
    setMessage(t('statusMessages.queueCanceled', '已取消排队任务。'));
  }

  function retryGenerationTask(id) {
    const target = generationQueueRef.current.find((item) => item.id === id);
    if (!target) return;
    if (target.remote || target.restorable === false) {
      setStatus('error');
      setMessage(t('statusMessages.queueRemoteRetryBlocked', '这个任务来自服务端恢复记录，不能安全自动重提；请先确认历史图库没有新结果，再用当前提示词重新生成。'));
      return;
    }
    const retryTask = {
      ...target,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      status: 'queued',
      createdAt: Date.now(),
      startedAt: null,
      completedAt: null,
      restored: false,
      summary: target.prompt || target.summary || t('statusMessages.queueRetryFallbackSummary', '重试生成任务')
    };
    commitGenerationQueue([
      retryTask,
      ...generationQueueRef.current.filter((item) => item.id !== id)
    ].slice(0, GENERATION_QUEUE_LIMIT));
    setMessage(t('statusMessages.queueRetryAdded', '已重新加入生成队列。'));
    runGenerationQueue();
  }

  function acknowledgeGenerationTask(id) {
    const target = generationQueueRef.current.find((item) => item.id === id);
    commitGenerationQueue(generationQueueRef.current.filter((item) => item.id !== id));
    if (target?.status === 'unknown') {
      setMessage(t('statusMessages.queueUnknownDismissed', '已收起结果未知的任务；请稍后查看历史图库，如果没有新结果再重试。'));
    } else {
      setMessage(t('statusMessages.queueDismissed', '已收起队列提示。'));
    }
  }

  function enqueueGeneration(overrides = {}) {
    const task = buildGenerationTask(overrides);
    if (!task.prompt) {
      setStatus('error');
      setMessage(caseResolving
        ? t('statusMessages.templateLoading', '模板提示词正在读取，请稍后。')
        : t('statusMessages.promptRequired', '请先填写提示词，或先选中一个画布节点继续。'));
      return;
    }
    const activeCount = generationQueueRef.current.filter((item) => item.status === 'queued' || item.status === 'running').length;
    if (activeCount >= GENERATION_QUEUE_LIMIT) {
      setStatus('error');
      setMessage(t('statusMessages.queueLimit', '当前队列已满，最多保留 {count} 个待生成任务。', { count: GENERATION_QUEUE_LIMIT }));
      return;
    }
    showComposerForGeneration();
    commitGenerationQueue([...generationQueueRef.current, task].slice(-GENERATION_QUEUE_LIMIT));
    setMessage(activeCount
      ? t('statusMessages.queueAddedBehind', '已加入队列，前面还有 {count} 个任务。', { count: activeCount })
      : t('statusMessages.queueAdded', '已加入队列。'));
    runGenerationQueue();
  }

  async function runGenerationQueue() {
    if (generationQueueRunnerRef.current) return;
    generationQueueRunnerRef.current = true;
    try {
      while (true) {
        const nextTask = generationQueueRef.current.find((item) => item.status === 'queued');
        if (!nextTask) break;
        if (nextTask.remote || nextTask.restorable === false) {
          markGenerationTask(nextTask.id, {
            status: 'failed',
            completedAt: Date.now(),
            summary: `${nextTask.summary || nextTask.prompt || t('composer.queue', '排队任务')}${t('statusMessages.queueRestoredUnsafeSuffix', '（刷新后不能安全自动重提）')}`
          });
          continue;
        }
        markGenerationTask(nextTask.id, { status: 'running', startedAt: Date.now() });
        applyGenerationTaskSnapshot(nextTask);
        await new Promise((resolve) => window.setTimeout(resolve, 0));
        const succeeded = await generate({ fromQueue: true, queueTaskId: nextTask.id, task: nextTask, maskFile: nextTask.maskFile || null });
        markGenerationTask(nextTask.id, {
          status: succeeded ? 'done' : 'failed',
          completedAt: Date.now()
        });
        if (!succeeded) break;
      }
    } finally {
      generationQueueRunnerRef.current = false;
    }
  }

  async function generationFilesForJob(files) {
    const source = Array.isArray(files) ? files.slice(0, IMAGE_REFERENCE_LIMIT) : [];
    return Promise.all(source.map(async (file, index) => ({
      name: file?.name || `reference-${index + 1}.png`,
      type: file?.type || 'image/png',
      dataUrl: await fileToDataUrl(file)
    })));
  }

  function serverJobProgress(job, fallbackTotal = 1) {
    const total = Math.max(1, Number(job?.total || job?.count || fallbackTotal || 1));
    const completed = Math.max(0, Number(job?.completed || 0));
    const stage = job?.stage || job?.status || 'queued';
    const basePercent = {
      queued: 12,
      dispatching: 22,
      gateway: 38,
      upstream: 52,
      image: 76,
      saving: 88,
      succeeded: 100,
      failed: 0,
      canceled: 0,
      unknown: 12
    }[stage] ?? 18;
    return {
      stage,
      completed,
      total,
      percent: stage === 'upstream' && total > 1
        ? Math.min(96, Math.max(basePercent, Math.round((completed / total) * 86)))
        : basePercent
    };
  }

  function serverJobMessage(job) {
    const status = job?.status || job?.stage;
    if (status === 'queued') return t('jobs.queued', '已进入服务端队列，刷新页面也会继续保留状态。');
    if (status === 'dispatching') return t('jobs.dispatching', '服务端正在提交到上游网关。');
    if (status === 'gateway') return t('jobs.gateway', '服务端已发出请求，正在等待网关同步返回。');
    if (status === 'upstream') return t('jobs.upstream', '上游正在生成，服务端会继续等待并保存结果。');
    if (status === 'image') return t('jobs.image', '已收到图片，正在写入当前任务。');
    if (status === 'saving') return t('jobs.saving', '正在保存生成结果。');
    if (status === 'succeeded') return t('jobs.succeeded', '生成完成，结果已保存到服务端。');
    if (status === 'unknown') return t('jobs.unknown', '服务端等待中断，结果未知；请稍后查看历史图库后再决定是否重试。');
    if (status === 'canceled') return t('jobs.canceled', '任务已在本地取消。');
    if (status === 'failed') return generationErrorMessage({
      ...(job?.error || {}),
      message: job?.error?.message || 'GENERATION_JOB_FAILED',
      status: job?.error?.status,
      requestId: job?.error?.requestId || job?.requestIds?.[0] || ''
    }, t);
    return t('jobs.processing', '服务端任务处理中。');
  }

  function syncServerJobTiming(job) {
    if (!job?.timing || typeof job.timing !== 'object') return;
    const completedAt = Number(job.timing.completedAt) || Date.parse(job.completedAt || '') || null;
    setTiming((current) => ({
      ...(current || {}),
      ...job.timing,
      status: isFinalServerJobStatus(job.status) ? (job.status === 'succeeded' ? 'completed' : 'failed') : 'running',
      startedAt: Number(job.timing.startedAt) || current?.startedAt || Date.parse(job.startedAt || '') || Date.now(),
      completedAt,
      model: job.model || current?.model || '',
      spec: current?.spec || [job.size, job.quality].filter(Boolean).join(' · ')
    }));
  }

  async function waitForServerJob(historyClient, jobId, { signal, total }) {
    let latest = await historyClient.getGenerationJob(jobId);
    while (latest && !isFinalServerJobStatus(latest.status)) {
      setProgress(serverJobProgress(latest, total));
      setMessage(serverJobMessage(latest));
      syncServerJobTiming(latest);
      await delay(1400, signal);
      latest = await historyClient.getGenerationJob(jobId);
    }
    if (latest) {
      setProgress(serverJobProgress(latest, total));
      setMessage(serverJobMessage(latest));
      syncServerJobTiming(latest);
    }
    return latest;
  }

  async function generate(options = {}) {
    const task = options.task || null;
    const activeMode = task?.mode || mode;
    const configuredImageModel = String(providerSettings.imageGenerationModel || '').trim();
    const configuredEditModel = String(providerSettings.imageEditModel || '').trim();
    const configuredVideoModel = String(providerSettings.videoModel || '').trim();
    const activeModel = task?.model
      || ((activeMode === 'edit' || activeMode === 'mask') ? configuredEditModel : configuredImageModel)
      || model;
    const activePrompt = task?.prompt || composedGenerationPrompt();
    const activeSelectedNode = task?.selectedCanvasNodeSnapshot || selectedCanvasNode;
    const activeLineageParentId = activeSelectedNode?.id || '';
    const activeReferenceFiles = task?.referenceItems?.map((item) => item.file).filter(Boolean) || referenceFiles;
    const activeVideoReferenceFiles = task?.videoReferenceFiles || videoReferenceFiles;
    const activeIsImageEditMode = activeMode === 'edit' || activeMode === 'mask';
    const activeSize = task?.size || size;
    const activeQuality = task?.quality || quality;
    const activeResolutionTier = task?.resolutionTier || resolutionTier;
    const activeOutputFormat = task?.outputFormat || outputFormat;
    const activeModeration = task?.moderation || moderation;
    const providerAdapter = resolveProviderAdapter({
      providerId: providerSettings.providerId,
      authMode: providerSettings.apiKeySource
    });
    const activeImageParameters = providerAdapter.normalizeImageParameters({
      size: activeSize,
      quality: activeQuality,
      resolutionTier: activeResolutionTier,
      outputFormat: activeOutputFormat,
      moderation: activeModeration,
      count: task?.count || countValue,
      n: task?.count || countValue
    });
    const normalizedActiveSize = activeImageParameters.size;
    const normalizedActiveQuality = activeImageParameters.quality;
    const normalizedActiveResolutionTier = activeImageParameters.resolutionTier;
    const normalizedActiveOutputFormat = activeImageParameters.outputFormat;
    const normalizedActiveModeration = activeImageParameters.moderation;
    const activeCount = normalizeCount(activeImageParameters.count);
    const activeVideoModel = task?.videoModel || configuredVideoModel || videoModel;
    const activeVideoAspect = task?.videoAspect || videoAspect;
    const activeVideoDuration = normalizeVideoDuration(task?.videoDuration || task?.duration || videoDuration);
    const activeVideoFps = normalizeVideoFps(task?.videoFps || task?.fps || videoFps);
    const activeVideoMotion = task?.videoMotion || videoMotion;
    const activeVideoStyle = task?.videoStyle || videoStyle;
    const activeVideoQuality = task?.videoQuality || videoQuality;
    const activeNegativePrompt = task?.negativePrompt || negativePrompt;
    const activeVideoSize = videoSizeFromAspect(activeVideoAspect);
    if (caseResolving) {
      setStatus('error');
      setMessage(t('statusMessages.templateLoading', '模板提示词正在读取，请稍后。'));
      return false;
    }
    if (status === 'loading' && !generationRef.current.controller) {
      setStatus('error');
      setProgress((current) => ({ ...current, stage: 'pending_review', percent: current.percent || 0 }));
      setMessage(t('statusMessages.disconnectedReview', '上一轮生成状态已经断开，请先确认历史图库/当前画布没有新结果，再点“确认重试”。'));
      return false;
    }
    if (progress.stage === 'pending_review') {
      setProgress({ stage: 'idle', percent: 0, completed: 0, total: activeCount });
      setMessage('');
    }
    const basePrompt = activePrompt;
    const lineageParentId = activeLineageParentId;
    if (!basePrompt) {
      setStatus('error');
      setMessage(caseResolving
        ? t('statusMessages.templateLoading', '模板提示词正在读取，请稍后。')
        : t('statusMessages.promptRequired', '请先填写提示词，或先选中一个画布节点继续。'));
      return false;
    }
    const willUseCanvasReference = Boolean(activeSelectedNode && activeSelectedNode.kind !== 'video' && activeSelectedNode.url && (activeMode === 'edit' || activeMode === 'mask'));
    if (activeIsImageEditMode && !activeReferenceFiles.length && !willUseCanvasReference) {
      setStatus('error');
      setMessage(activeMode === 'mask'
        ? t('statusMessages.maskModeReferenceRequired', '请先在 Mask 模式上传参考图。')
        : t('statusMessages.referenceRequired', '请先上传参考图。'));
      return false;
    }
    let maskFile = null;
    if (activeMode === 'mask') {
      maskFile = options.maskFile || maskEditorRef.current?.exportMask?.() || null;
      if (!maskFile) {
        setStatus('error');
        setMessage(t('statusMessages.maskEditorRequired', '请先在 Mask 编辑器里上传参考图并涂抹要重绘的区域。'));
        return false;
      }
    }
    if (usesGatewayAccount(providerSettings) && !isAuthenticated) {
      saveDraft({
        caseId: selectedCase?.id || null,
        mode: activeMode,
        prompt: basePrompt,
        model: activeModel,
        ...draftParameters(),
        ...videoDraftParameters()
      });
      onRequireLogin();
      return false;
    }
    const providerRequest = resolveProviderRequest(providerSettings, apiKey);
    if (!providerRequest.apiKey) {
      setStatus('error');
      setMessage(providerSettings.apiKeySource === 'manual'
        ? t('statusMessages.keyRequired', '请先填写密钥。')
        : t('statusMessages.accountPreparing', '账号连接还在准备中。'));
      onOpenSettings();
      return false;
    }

    generationRef.current.controller?.abort();
    const requestId = generationRef.current.id + 1;
    const controller = new AbortController();
    const startedAt = Date.now();
    const generationId = `${startedAt}-${Math.random().toString(36).slice(2, 8)}`;
    const generationMeta = {
      mode: activeMode === 'video' ? 'video' : 'image',
      providerId: activeMode === 'video'
        ? activeVideoModel
        : activeModel,
      createdAt: new Date(startedAt).toISOString(),
      prompt: basePrompt,
      size: activeSize,
      quality: activeQuality,
      resolutionTier: activeResolutionTier,
      outputFormat: activeOutputFormat,
      sessionId,
      id: generationId
    };
    let firstByteAt = null;
    let timeoutReached = false;
    generationRef.current = { id: requestId, controller };
    const isCurrentRequest = () => generationRef.current.id === requestId;
    const stallTimer = window.setTimeout(() => {
      if (!isCurrentRequest() || firstByteAt) return;
      setMessage(t('statusMessages.upstreamStall', '上游还没有返回数据，可能正在排队或生成较慢，请继续等待。'));
      setProgress((current) => current.stage === 'request' ? { ...current, stage: 'queued', percent: Math.max(current.percent || 0, 12) } : current);
    }, GENERATION_STALL_NOTICE_MS);
    const timeoutTimer = window.setTimeout(() => {
      if (!isCurrentRequest()) return;
      timeoutReached = true;
      generationRef.current = { id: requestId + 1, controller: null };
      setStatus('error');
      setProgress((current) => ({
        ...current,
        stage: 'pending_review',
        percent: Math.max(current.percent || 0, 12)
      }));
      setMessage(t('errors.timeout', '等待时间过长，这次页面已结束等待。上游可能仍在处理，请稍后查看历史图库后再决定是否重试。'));
      const timeoutError = new Error('GENERATION_TIMEOUT');
      timeoutError.code = 'GENERATION_TIMEOUT';
      controller.abort(timeoutError);
    }, GENERATION_TIMEOUT_MS);

    showComposerForGeneration();
    setStatus('loading');
    setResultBatchMeta(generationMeta);
    setProgress({ stage: 'request', percent: 8, completed: 0, total: activeCount });
    setTiming({
      status: 'running',
      startedAt,
      firstByteAt: null,
      completedAt: null,
      model: activeMode === 'video' ? activeVideoModel : activeModel,
      spec: activeMode === 'video' ? `${activeVideoAspect} · ${activeVideoDuration}s · ${activeVideoFps}fps` : `${normalizedActiveSize} · ${normalizedActiveQuality} · ${RESOLUTION_TIER_LABELS[normalizedActiveResolutionTier] || normalizedActiveResolutionTier}`
    });
    setMessage(t('statusMessages.submitted', '已提交'));
    try {
      if (activeMode === 'video') {
        if (!hasSyncedVideoModels || !activeVideoModel) {
          const failedAt = Date.now();
          setStatus('error');
          setProgress({ stage: 'failed', percent: 0, completed: 0, total: 1 });
          setTiming((current) => current ? { ...current, status: 'failed', completedAt: failedAt } : current);
          setMessage(modelsStatus === 'loading'
            ? t('statusMessages.videoModelsLoadingWait', '正在读取当前 Key 的视频模型，请稍后。')
            : t('statusMessages.videoModelsUnavailable', '当前 Key 没有开放视频模型。'));
          return false;
        }
        const referenceImage = activeVideoReferenceFiles[0]
          ? await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(new Error('REFERENCE_IMAGE_READ_FAILED'));
            reader.readAsDataURL(activeVideoReferenceFiles[0]);
          })
          : '';
        if (!isCurrentRequest()) return false;
        const payload = await client.generateVideo({
          ...providerRequest,
          model: activeVideoModel,
          prompt: basePrompt,
          image: referenceImage,
          duration: activeVideoDuration,
          width: activeVideoSize.width,
          height: activeVideoSize.height,
          fps: activeVideoFps,
          n: 1,
          metadata: {
            aspect_ratio: activeVideoAspect,
            camera_motion: activeVideoMotion,
            style: activeVideoStyle,
            quality_level: activeVideoQuality,
            negative_prompt: activeNegativePrompt.trim(),
            source: 'ai-image-workbench'
          },
          signal: controller.signal,
          onProgress: (nextProgress) => {
            if (!isCurrentRequest()) return;
            if (!firstByteAt && nextProgress.stage && nextProgress.stage !== 'request') {
              firstByteAt = Date.now();
              setTiming((current) => current ? { ...current, firstByteAt } : current);
            }
            setVideoTask(nextProgress.task || null);
            setProgress((current) => ({ ...current, ...nextProgress }));
            setMessage(progressText(nextProgress, t('progress.videoGenerating', '视频生成中')));
          }
        });
        if (!isCurrentRequest()) return false;
        const urls = getVideoUrls(payload);
        if (!urls.length) {
          throw new Error('视频任务已完成，但没有返回视频地址。');
        }
        setResults([]);
        setVideoResults(urls);
        appendCanvasNodes(urls, {
          kind: 'video',
          parentId: lineageParentId,
          promptText: basePrompt,
          downloadMeta: generationMeta,
          title: '视频结果'
        });
        setVideoTask(payload);
      setProgress({ stage: 'completed', percent: 100, completed: 1, total: 1 });
      const completedAt = Date.now();
      setTiming((current) => current ? { ...current, status: 'completed', firstByteAt: current.firstByteAt || firstByteAt || completedAt, completedAt } : current);
      clearDraft();
      if (!options.fromQueue) setPrompt('');
      setStatus('success');
      setMessage(t('statusMessages.videoDone', '视频生成完成。'));
        const historyId = generationMeta.id;
        const historyCreatedAt = generationMeta.createdAt;
        onHistoryAdd({
          id: historyId,
          sessionId,
          createdAt: historyCreatedAt,
          mode: 'video',
          kind: 'video',
          providerId: generationMeta.providerId,
          prompt: basePrompt,
          model: activeVideoModel,
          aspect: activeVideoAspect,
          aspectRatio: activeVideoAspect,
          videoAspect: activeVideoAspect,
          videoAspectRatio: activeVideoAspect,
          duration: activeVideoDuration,
          videoDuration: activeVideoDuration,
          fps: activeVideoFps,
          videoFps: activeVideoFps,
          videoMotion: activeVideoMotion,
          videoStyle: activeVideoStyle,
          videoQuality: activeVideoQuality,
          negativePrompt: activeNegativePrompt.trim(),
          width: activeVideoSize.width,
          height: activeVideoSize.height,
          taskId: payload.task_id || payload.id || '',
          usageSummary: payloadUsageSummary(payload.raw || payload),
          timing: {
            startedAt,
            firstByteMs: (firstByteAt || completedAt) - startedAt,
            totalMs: completedAt - startedAt
          },
          resultUrls: storedResultUrls(urls),
          case: selectedCase ? {
            id: selectedCase.id,
            title: selectedCase.title,
            image: selectedCase.image || selectedCase.image_url || '',
            imageAlt: selectedCase.imageAlt,
            promptPreview: selectedCase.promptPreview,
            category: selectedCase.category
          } : null
        });
        if (usesGatewayAccount(providerSettings)) onProfileRefresh();
        return true;
      }

      const canvasReferenceFiles = willUseCanvasReference ? await selectedCanvasReferenceFiles(activeSelectedNode) : [];
      if (!isCurrentRequest()) return false;
      const editReferenceFiles = [...canvasReferenceFiles, ...activeReferenceFiles].slice(0, IMAGE_REFERENCE_LIMIT);
      const shouldUseImageEdits = activeMode === 'mask' || (activeMode === 'edit' && editReferenceFiles.length > 0);
      const effectivePrompt = withResolutionHint(basePrompt, normalizedActiveResolutionTier, t);
      let payload = null;
      let urls = [];
      let persistedResultUrls = [];
      const canUseServerJob = Boolean(providerRequest.apiKey && (isAuthenticated || providerSettings.apiKeySource === 'manual'));
      if (canUseServerJob) {
        try {
          const historyClient = new StudioHistoryClient({ session: loadSession() });
          const jobImages = shouldUseImageEdits ? await generationFilesForJob(editReferenceFiles) : [];
          const jobMask = maskFile ? {
            name: maskFile.name || 'mask.png',
            type: maskFile.type || 'image/png',
            dataUrl: await fileToDataUrl(maskFile)
          } : null;
          if (!isCurrentRequest()) return false;
          const job = await historyClient.createGenerationJob({
            apiKey: providerRequest.apiKey,
            gatewayBaseUrl: providerRequest.gatewayBaseUrl,
            images: jobImages,
            mask: jobMask,
            request: {
              id: generationMeta.id,
              clientRequestId: `studio-${generationMeta.id}`,
              sessionId,
              parentCanvasNodeId: lineageParentId,
              providerId: providerSettings.providerId,
              providerFamily: providerSettings.providerId,
              apiKeySource: providerSettings.apiKeySource,
              providerLabel: providerLabel(providerSettings, apiKey),
              mode: activeMode,
              route: shouldUseImageEdits ? 'edits' : 'generations',
              model: activeModel,
              prompt: basePrompt,
              generationPrompt: effectivePrompt,
              size: normalizedActiveSize,
              quality: normalizedActiveQuality,
              resolutionTier: normalizedActiveResolutionTier,
              outputFormat: normalizedActiveOutputFormat,
              moderation: normalizedActiveModeration,
              n: activeCount,
              count: activeCount
            }
          });
          if (!job?.id) throw new Error('GENERATION_JOB_CREATE_FAILED');
          generationRef.current = { ...generationRef.current, remoteJobId: job.id };
          if (options.queueTaskId) {
            markGenerationTask(options.queueTaskId, {
              serverJobId: job.id,
              remote: true,
              restorable: false,
              summary: job.prompt || basePrompt || '服务端生成任务'
            });
          } else {
            syncRemoteGenerationJob(job);
          }
          setProgress(serverJobProgress(job, activeCount));
          setMessage(serverJobMessage(job));
          const finalJob = await waitForServerJob(historyClient, job.id, { signal: controller.signal, total: activeCount });
          if (!isCurrentRequest()) return false;
          if (!finalJob || finalJob.status !== 'succeeded') {
            if (finalJob?.id) syncRemoteGenerationJob(finalJob);
            const error = new Error(finalJob?.error?.message || 'GENERATION_JOB_FAILED');
            error.status = finalJob?.error?.status;
            error.code = finalJob?.status === 'unknown' ? 'GENERATION_JOB_UNKNOWN' : finalJob?.error?.code;
            error.requestId = finalJob?.error?.requestId || finalJob?.requestIds?.[0] || '';
            throw error;
          }
          persistedResultUrls = Array.isArray(finalJob.resultUrls) ? finalJob.resultUrls : [];
          urls = await Promise.all(persistedResultUrls.map((url) => historyClient.resolveAssetUrl(url).catch(() => url)));
          if (!isCurrentRequest()) {
            revokeBlobUrls(urls);
            return false;
          }
          payload = {
            data: urls.map((url) => ({ url })),
            usage: finalJob.usage,
            job: finalJob
          };
          if (!firstByteAt) {
            firstByteAt = Date.now();
            setTiming((current) => current ? { ...current, firstByteAt } : current);
          }
        } catch (error) {
          if (generationRef.current.remoteJobId) throw error;
          setMessage(t('statusMessages.serviceQueueFallback', '服务端队列暂不可用，已切换为本页直连生成。'));
        }
      }
      if (!payload) {
        const request = {
          ...providerRequest,
          model: activeModel,
          prompt: effectivePrompt,
          size: normalizedActiveSize,
          quality: normalizedActiveQuality,
          outputFormat: normalizedActiveOutputFormat,
          moderation: normalizedActiveModeration,
          n: activeCount,
          signal: controller.signal,
          onPartial: (partialUrls) => {
            if (!isCurrentRequest()) return;
            if (!firstByteAt) {
              firstByteAt = Date.now();
              setTiming((current) => current ? { ...current, firstByteAt } : current);
            }
            setResults(partialUrls);
            if (partialUrls.length) {
              appendCanvasNodes(partialUrls, {
                kind: 'image',
                parentId: lineageParentId,
                promptText: basePrompt,
                downloadMeta: generationMeta,
                title: t('statusMessages.previewTitle', '预览结果'),
                replaceBatchId: generationMeta.id
              });
            }
            setMessage(t('statusMessages.previewReceived', '收到预览'));
          },
          onProgress: (nextProgress) => {
            if (!isCurrentRequest()) return;
            if (!firstByteAt && nextProgress.stage && nextProgress.stage !== 'request') {
              firstByteAt = Date.now();
              setTiming((current) => current ? { ...current, firstByteAt } : current);
            }
            setProgress((current) => ({ ...current, ...nextProgress }));
            setMessage(progressText(nextProgress, t('statusMessages.generating', '生成中')));
          }
        };
        payload = shouldUseImageEdits
          ? await client.editImage({ ...request, images: editReferenceFiles, mask: maskFile })
          : await client.generateImage({ ...request, route: 'images', referenceImages: [] });
        urls = getImageUrls(payload);
      }
      if (!isCurrentRequest()) return false;
      if (!urls.length) {
        throw new Error(t('statusMessages.noImagesReturned', '请求完成，但没有返回图片。'));
      }
      setResults(urls);
      appendCanvasNodes(urls, {
        kind: 'image',
        parentId: lineageParentId,
        promptText: basePrompt,
        downloadMeta: generationMeta,
        title: t('statusMessages.resultTitle', '生成结果'),
        replaceBatchId: generationMeta.id,
        persistedUrls: persistedResultUrls
      });
      setProgress({ stage: 'completed', percent: 100, completed: urls.length, total: activeCount || urls.length || 1 });
      const completedAt = Date.now();
      setTiming((current) => current ? { ...current, status: 'completed', firstByteAt: current.firstByteAt || firstByteAt || completedAt, completedAt } : current);
      clearDraft();
      if (!options.fromQueue) setPrompt('');
      setStatus('success');
      setMessage(urls.length
        ? t('statusMessages.imageDone', '生成完成。')
        : t('statusMessages.noImagesReturned', '请求完成，但没有返回图片。'));
      const historyId = generationMeta.id;
      const historyCreatedAt = generationMeta.createdAt;
      onHistoryAdd({
        id: historyId,
        sessionId,
        createdAt: historyCreatedAt,
        mode: activeMode,
        providerId: generationMeta.providerId,
        prompt: basePrompt,
        generationPrompt: effectivePrompt,
        model: activeModel,
        aspect: task?.aspect || aspect,
        aspectRatio: task?.aspectRatio || task?.aspect || aspect,
        customSize: task?.customSize || customSize,
        size: normalizedActiveSize,
        quality: normalizedActiveQuality,
        resolutionTier: normalizedActiveResolutionTier,
        outputFormat: normalizedActiveOutputFormat,
        moderation: normalizedActiveModeration,
        count: activeCount,
        usageSummary: payloadUsageSummary(payload),
        timing: {
          startedAt,
          firstByteMs: (firstByteAt || completedAt) - startedAt,
          totalMs: completedAt - startedAt
        },
        resultUrls: persistedResultUrls.length ? persistedResultUrls : storedResultUrls(urls),
        case: selectedCase ? {
          id: selectedCase.id,
          title: selectedCase.title,
          image: selectedCase.image || selectedCase.image_url || '',
          imageAlt: selectedCase.imageAlt,
          promptPreview: selectedCase.promptPreview,
          category: selectedCase.category
        } : null
      });
      if (usesGatewayAccount(providerSettings)) onProfileRefresh();
      return true;
    } catch (error) {
      if (!isCurrentRequest() && !timeoutReached) return false;
      setStatus('error');
      const failedAt = Date.now();
      setTiming((current) => current ? { ...current, status: 'failed', firstByteAt: current.firstByteAt || firstByteAt, completedAt: failedAt } : current);
      const displayError = timeoutReached && error?.name === 'AbortError'
        ? Object.assign(new Error('GENERATION_TIMEOUT'), { code: 'GENERATION_TIMEOUT' })
        : error;
      setProgress((current) => ({
        ...current,
        stage: timeoutReached || firstByteAt ? 'pending_review' : 'failed',
        percent: current.percent || 0
      }));
      setMessage(generationErrorMessage(displayError, t));
      return false;
    } finally {
      if (isCurrentRequest()) {
        generationRef.current = { id: requestId, controller: null };
      }
      window.clearTimeout(stallTimer);
      window.clearTimeout(timeoutTimer);
    }
  }

  function stopGeneration() {
    const activeGeneration = generationRef.current;
    if (!activeGeneration?.controller) return;
    const currentRunningTask = generationQueueRef.current.find((item) => item.status === 'running');
    const remoteJobId = activeGeneration.remoteJobId || currentRunningTask?.serverJobId || '';
    const stoppedError = new Error('GENERATION_STOPPED');
    stoppedError.code = 'GENERATION_STOPPED';
    activeGeneration.controller.abort(stoppedError);
    generationRef.current = { id: activeGeneration.id + 1, controller: null };
    const stoppedAt = Date.now();
    setStatus('error');
    setProgress((current) => ({
      ...current,
      stage: 'pending_review',
      percent: current.percent || 0
    }));
    setTiming((current) => current ? { ...current, status: 'failed', completedAt: stoppedAt } : current);
    setMessage(generationErrorMessage(stoppedError, t));
    if (currentRunningTask) markGenerationTask(currentRunningTask.id, { status: 'failed', completedAt: stoppedAt });
    if (remoteJobId) {
      clearRemoteGenerationJob(remoteJobId, 'canceled');
      const historyClient = new StudioHistoryClient({ session: loadSession() });
      historyClient.cancelGenerationJob(remoteJobId)
        .then((job) => setMessage(serverJobMessage(job || { status: 'canceled' })))
        .catch(() => setMessage(t('errors.cancelFailed', '已停止本页等待；服务端取消失败，请稍后查看历史图库/当前画布，再决定是否重试。')));
    }
  }

  const primaryImageResult = mode !== 'video' ? results[0] || '' : '';
  const primaryVideoResult = mode === 'video' ? videoResults[0] || '' : '';
  const hasPrimaryResult = Boolean(primaryImageResult || primaryVideoResult);
  const workPreviewImage = primaryImageResult
    ? primaryImageResult
    : mode === 'edit' && referencePreviews[0]
    ? referencePreviews[0]
    : mode === 'mask' && referencePreviews[0]
      ? referencePreviews[0]
    : mode === 'video' && videoReferencePreviews[0]
      ? videoReferencePreviews[0]
    : templatePreviewImage(selectedCase)
      ? assetPath(templatePreviewImage(selectedCase))
      : '';
  const workPreviewFallback = templateThumbnail(selectedCase);
  const previewAlt = primaryImageResult
    ? '生成结果 1'
    : mode === 'video' && videoReferenceFiles[0]
    ? videoReferenceFiles[0].name
    : isImageEditMode && referenceFiles[0]
    ? referenceFiles[0].name
    : selectedCase?.imageAlt || selectedCase?.title || 'Preview';
  const isGenerating = status === 'loading' && Boolean(generationRef.current.controller);
  const generationActionDisabled = false;
  const generationActionClass = status === 'error' ? 'isRetryAction' : '';
  const needsReviewBeforeRetry = status === 'error' && progress.stage === 'pending_review';
  const generationActionLabel = isGenerating
    ? t('composer.queueMore', '加入队列')
    : needsReviewBeforeRetry
      ? t('composer.confirmRegenerate', '确认重新生成')
      : status === 'error'
        ? t('composer.regenerate', '重新生成')
        : t('composer.generate', '生成');
  const generationActionIcon = status === 'error' ? <Redo2 size={18} /> : <Sparkles size={18} />;
  const compactGenerationActionIcon = status === 'error' ? <Redo2 size={16} /> : <Sparkles size={16} />;
  const openRegenerateDialog = () => {
    showComposerForGeneration();
    updateLayoutSections({
      bottomComposer: true,
      composerFolded: false,
      composerParameters: true
    });
    setRegenerateDialogOpen(true);
  };
  const openBottomParamShelf = () => {
    showComposerForGeneration();
    updateLayoutSections({
      bottomComposer: true,
      composerFolded: false,
      composerParameters: true
    });
  };
  const confirmRegenerate = () => {
    enqueueGeneration();
  };
  const handleGenerateAction = () => {
    if (isGenerating) {
      enqueueGeneration();
      return;
    }
    if (status === 'error' || progress.stage === 'pending_review') {
      openRegenerateDialog();
      return;
    }
    enqueueGeneration();
  };
  const maskSourcePreview = referencePreviews[0] || (mode === 'mask' && selectedCanvasNode && selectedCanvasNode.kind !== 'video' ? selectedCanvasNode.url : '');
  const maskSourceFile = referenceFiles[0] || (maskSourcePreview ? { name: selectedCanvasNode ? `#${selectedCanvasNode.canvasIndex || 1}.png` : 'reference.png' } : null);
  const referenceSideCount = mode === 'mask'
    ? (maskSourcePreview ? 1 : 0)
    : mode === 'video'
      ? videoReferenceFiles.length
      : referenceFiles.length;
  const referenceSideLimit = mode === 'mask' || mode === 'video' ? 1 : IMAGE_REFERENCE_LIMIT;
  const composerUsesEditRoute = mode === 'mask' || (mode === 'edit' && (referenceFiles.length || selectedCanvasNode?.url));
  const composerRouteLabel = mode === 'video'
    ? t('composer.routeVideo', '视频任务接口')
    : composerUsesEditRoute
      ? '/v1/images/edits'
      : '/v1/images/generations';
  const composerContextTitle = selectedCanvasNode
    ? t('composer.contextContinue', '基于 #{index} 继续创作', { index: selectedCanvasNode.canvasIndex || '' })
    : selectedCase?.title
      ? t('composer.contextTemplate', '来自模板：{title}', { title: selectedCase.title })
      : t('composer.contextNew', '新的创作会话');
  const composerContextMeta = selectedCanvasNode
    ? composerUsesEditRoute
      ? t('composer.contextUsesReference', '当前会把选中图片作为参考图')
      : t('composer.contextLineageOnly', '当前只继承提示词和画布关系')
    : mode === 'video'
      ? t('composer.contextVideo', '视频参数在右侧设置')
      : t('composer.title', '把想法说出来，先整理，再生成');
  const composerGenerationVisible = status === 'loading' || status === 'success' || progress.stage === 'failed' || progress.stage === 'pending_review' || (status === 'error' && Boolean(message));
  const composerThreadHasContent = Boolean(assistantMessages.length || promptSuggestion);
  const activeGenerationQueueItems = generationQueue.filter((item) => CURRENT_PROJECT_QUEUE_STATUSES.has(item.status));
  const composerFolded = layoutSections.bottomComposer && layoutSections.composerFolded === true;
  const toggleComposerFold = () => updateLayoutSections({
    bottomComposer: true,
    composerFolded: !composerFolded,
    composerParameters: composerFolded ? layoutSections.composerParameters : false
  });
  const foldComposerPanel = () => updateLayoutSections({
    bottomComposer: true,
    composerFolded: true,
    composerParameters: false
  });
  const openComposerPanel = () => updateLayoutSections({
    bottomComposer: true,
    composerFolded: false
  });
  const composerReferenceLimit = mode === 'video' ? 1 : IMAGE_REFERENCE_LIMIT;
  const composerPromptPlaceholder = selectedCanvasNode
    ? t('composer.placeholderCanvas', '写下要怎样延续这张图：换背景、加产品、调整风格... Enter 直接生成')
    : t('composer.placeholder', '写下提示词或创作想法，Enter 直接生成；点左侧小按钮才会调用 AI 优化。');
  const handleComposerReferenceDragEnter = (event) => {
    if (!supportedReferenceFiles(event.dataTransfer?.files || event.dataTransfer?.items, composerReferenceLimit).length) return;
    event.preventDefault();
    if (mode === 'video') setVideoDropActive(true);
    else setReferenceDropActive(true);
  };
  const handleComposerReferenceDragOver = (event) => {
    if (!supportedReferenceFiles(event.dataTransfer?.files || event.dataTransfer?.items, composerReferenceLimit).length) return;
    event.preventDefault();
    if (mode === 'video') setVideoDropActive(true);
    else setReferenceDropActive(true);
  };
  const handleComposerReferenceDragLeave = () => {
    setReferenceDropActive(false);
    setVideoDropActive(false);
  };
  const handleComposerReferenceDrop = (event) => {
    const files = supportedReferenceFiles(event.dataTransfer?.files, composerReferenceLimit);
    if (!files.length) return;
    event.preventDefault();
    setReferenceDropActive(false);
    setVideoDropActive(false);
    if (mode === 'video') appendVideoReferenceImage(files);
    else appendReferenceImages(files);
  };
  const handleComposerPromptPaste = (event) => {
    if (mode === 'video') videoReferencePasteFiles(event);
    else referencePasteFiles(event);
  };
  const handleComposerPromptFocus = () => {
    if (!layoutSections.bottomComposer || layoutSections.composerFolded) openComposerPanel();
  };
  const handleComposerPromptKeyDown = (event) => {
    if (event.key === 'Enter' && event.ctrlKey) {
      event.preventDefault();
      sendAssistantMessage();
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleGenerateAction();
    }
  };

  return (
    <section className={`creationDesk ${layoutSections.references ? 'referencesOpen' : ''} ${layoutSections.bottomComposer ? 'composerOpen' : ''} ${composerThreadHasContent ? 'composerHasThread' : ''} ${layoutSections.composerParameters === false ? 'composerParamsCollapsed' : ''} ${layoutSections.parametersRail === false ? 'paramRailCollapsed' : ''} ${composerFolded ? 'composerFolded' : ''}`}>
      <div
        ref={workPreviewRef}
        className={`workPreview infiniteCanvas ${hasPrimaryResult ? 'hasResult' : ''} ${canvasPerformanceMode ? 'performanceMode' : ''}`}
        onPointerDown={startCanvasPan}
        onPointerMove={moveCanvasPan}
        onPointerUp={endCanvasPan}
        onPointerCancel={endCanvasPan}
      >
        <GenerationQueueDock
          items={activeGenerationQueueItems}
          progress={progress}
          status={status}
          message={message}
          timing={timing}
          isGenerating={isGenerating}
          t={t}
          formatError={generationErrorMessage}
          onAcknowledge={acknowledgeGenerationTask}
          onCancel={cancelGenerationTask}
          onRetry={retryGenerationTask}
          onRegenerate={openRegenerateDialog}
          onStop={stopGeneration}
        />
        <div className="canvasToolbar" aria-label={t('canvas.toolbar', '画布工具')}>
          <button type="button" onClick={() => setCanvasZoom((value) => value - 0.1)} aria-label={t('canvas.zoomOut', '缩小画布')} title={`${t('canvas.zoomOut', '缩小画布')} Ctrl/Cmd + -`}>-</button>
          <span>{Math.round(canvasView.zoom * 100)}%</span>
          <button type="button" onClick={() => setCanvasZoom((value) => value + 0.1)} aria-label={t('canvas.zoomIn', '放大画布')} title={`${t('canvas.zoomIn', '放大画布')} Ctrl/Cmd + +`}>+</button>
          <button type="button" onClick={resetCanvasView} title={`${t('canvas.reset', '重置')} Ctrl/Cmd + 0`}>{t('canvas.reset', '重置')}</button>
        </div>
        <div
          className="canvasPlane"
          style={{
            width: CANVAS_PLANE_WIDTH,
            height: CANVAS_PLANE_HEIGHT,
            transform: `translate(calc(-50% + ${canvasView.x}px), calc(-50% + ${canvasView.y}px)) scale(${canvasView.zoom})`
          }}
        >
          {renderedCanvasEdges.length || canvasLinkPreview ? (
            <svg className={`canvasLinks ${selectedCanvasNodeId ? 'hasSelection' : ''} ${canvasLinkDraft ? 'isLinking' : ''} ${canvasPerformanceMode ? 'performanceMode' : ''}`} width={CANVAS_PLANE_WIDTH} height={CANVAS_PLANE_HEIGHT} viewBox={`0 0 ${CANVAS_PLANE_WIDTH} ${CANVAS_PLANE_HEIGHT}`} aria-hidden="true">
              <defs>
                <marker id="canvasLinkArrow" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto" markerUnits="userSpaceOnUse">
                  <path className="canvasLinkArrow" d="M 1 2 L 10 6 L 1 10 z" />
                </marker>
                <marker id="canvasLinkArrowActive" markerWidth="15" markerHeight="15" refX="12" refY="7.5" orient="auto" markerUnits="userSpaceOnUse">
                  <path className="canvasLinkArrowActive" d="M 1 2 L 12 7.5 L 1 13 z" />
                </marker>
                <filter id="canvasLinkGlow" x="-24%" y="-24%" width="148%" height="148%">
                  <feGaussianBlur stdDeviation="6" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              {renderedCanvasEdges.map((edge) => {
                const fromWidth = nodeWidth(edge.from);
                const fromHeight = nodeHeight(edge.from);
                const toHeight = nodeHeight(edge.to);
                const x1 = CANVAS_PLANE_WIDTH / 2 + edge.from.x + fromWidth + 2;
                const y1 = CANVAS_PLANE_HEIGHT / 2 + edge.from.y + fromHeight * 0.48;
                const x2 = CANVAS_PLANE_WIDTH / 2 + edge.to.x - 2;
                const y2 = CANVAS_PLANE_HEIGHT / 2 + edge.to.y + toHeight * 0.48;
                const bend = Math.max(96, Math.abs(x2 - x1) * 0.46);
                const path = `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
                const jointX = (x1 + x2) / 2;
                const jointY = (y1 + y2) / 2;
                const edgeClass = canvasEdgeLineageClass(edge);
                const isEdgeActive = edgeClass.includes('active');
                return (
                  <g className={`canvasLinkGroup ${edgeClass} ${edge.type === 'custom' ? 'custom' : 'lineage'}`} key={edge.id}>
                    <path className="canvasLinkGlow" d={path} filter="url(#canvasLinkGlow)" />
                    <path className="canvasLinkPulse" d={path} />
                    <path className="canvasLinkPath" d={path} markerEnd={isEdgeActive ? 'url(#canvasLinkArrowActive)' : 'url(#canvasLinkArrow)'} />
                    <circle className="canvasLinkJoint" cx={jointX} cy={jointY} r="4.3" />
                    <circle className="canvasLinkJointCore" cx={jointX} cy={jointY} r="1.6" />
                    <text className="canvasLinkLabel" x={jointX + 12} y={jointY - 10}>
                      {`#${edge.from.canvasIndex || ''} -> #${edge.to.canvasIndex || ''}`}
                    </text>
                  </g>
                );
              })}
              {canvasLinkPreview?.point ? (() => {
                const fromWidth = nodeWidth(canvasLinkPreview.from);
                const fromHeight = nodeHeight(canvasLinkPreview.from);
                const x1 = CANVAS_PLANE_WIDTH / 2 + canvasLinkPreview.from.x + fromWidth + 2;
                const y1 = CANVAS_PLANE_HEIGHT / 2 + canvasLinkPreview.from.y + fromHeight * 0.48;
                const x2 = canvasLinkPreview.point.x;
                const y2 = canvasLinkPreview.point.y;
                const bend = Math.max(70, Math.abs(x2 - x1) * 0.38);
                const path = `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
                return <path className="canvasLinkPreview" d={path} />;
              })() : null}
            </svg>
          ) : null}
          {canvasNodes.length ? canvasNodes.map((node) => {
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
                onPointerDown={(event) => startCanvasNodeDrag(event, node)}
                onDoubleClick={(event) => {
                  event.stopPropagation();
                  openCanvasEditor(node);
                }}
              >
                <button
                  type="button"
                  className="canvasPort canvasPortIn"
                  data-node-id={node.id}
                  onPointerDown={(event) => finishCanvasLink(event, node)}
                  aria-label={`${t('canvas.connectTo', '连接到这张图')} #${node.canvasIndex || ''}`}
                  title={t('canvas.connectTo', '连接到这张图')}
                />
                <button
                  type="button"
                  className="canvasPort canvasPortOut"
                  data-node-id={node.id}
                  onPointerDown={(event) => startCanvasLink(event, node)}
                  aria-label={`${t('canvas.dragConnect', '拖到另一张图建立关联')} #${node.canvasIndex || ''}`}
                  title={t('canvas.dragConnect', '拖到另一张图建立关联')}
                />
                <button
                  type="button"
                  className="canvasNodeMedia"
                  onClick={(event) => handleCanvasNodeMediaClick(event, node)}
                  onDoubleClick={(event) => {
                    event.stopPropagation();
                    openCanvasEditor(node);
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
                    openCanvasEditor(node);
                  }}
                >
                  <SquarePen size={13} />
                  {t('canvas.continueEdit', '继续优化')}
                </button>
                <div className="canvasNodeToolbar" onClick={(event) => event.stopPropagation()}>
                  <button type="button" onClick={() => previewCanvasNode(node)} aria-label={`${t('canvas.preview', '预览')} #${node.canvasIndex || ''}`} title={t('canvas.preview', '预览')}>
                    <Search size={13} />
                  </button>
                  <button type="button" onClick={() => openCanvasEditor(node)} aria-label={`${t('canvas.continueEdit', '继续优化')} #${node.canvasIndex || ''}`} title={t('canvas.continueEdit', '继续优化')}>
                    <SquarePen size={13} />
                  </button>
                  {node.kind !== 'video' ? (
                    <button type="button" onClick={() => setCanvasNodeAsReference(node)} aria-label={`${t('canvas.setReference', '设为参考')} #${node.canvasIndex || ''}`} title={t('canvas.setReference', '设为参考')}>
                      <ImageIcon size={13} />
                    </button>
                  ) : null}
                  <button type="button" onClick={() => copyCanvasNodePrompt(node)} disabled={!node.prompt} aria-label={`${t('canvas.copyPrompt', '复制提示词')} #${node.canvasIndex || ''}`} title={t('canvas.copyPrompt', '复制提示词')}>
                    <Copy size={13} />
                  </button>
                  <a href={displayResultUrl(node.url)} download={nodeDownloadName} aria-label={`${t('canvas.download', '下载')} #${node.canvasIndex || ''}`} title={t('canvas.download', '下载')}>
                    <Download size={13} />
                  </a>
                  <button type="button" onClick={() => deleteCanvasNode(node)} aria-label={`${t('canvas.delete', '删除')} #${node.canvasIndex || ''}`} title={t('canvas.delete', '删除')}>
                    <Trash2 size={13} />
                  </button>
                </div>
                {canvasEditorNodeId === node.id ? (
                  <div className="canvasInlineEditor" onClick={(event) => event.stopPropagation()}>
                    <div className="canvasInlineEditorHead">
                      <strong>{t('canvas.inlineContinue', '#{index} 继续优化', { index: node.canvasIndex || '' })}</strong>
                      <button type="button" onClick={closeCanvasEditor} aria-label={t('settings.close', '关闭')}>
                        <X size={13} />
                      </button>
                    </div>
                    <textarea
                      value={canvasEditorPrompt}
                      onChange={(event) => setCanvasEditorPrompt(event.target.value)}
                      placeholder={t('canvas.inlinePlaceholder', '输入这一轮要补充、调整或重绘的地方')}
                      autoFocus
                    />
                    <div className="canvasInlineModes" role="group" aria-label={t('canvas.continueMode', '续作方式')}>
                      <button type="button" className={canvasEditorMode === 'image' ? 'active' : ''} onClick={() => changeCanvasEditorMode('image')}>{t('canvas.derive', '衍生')}</button>
                      <button type="button" className={canvasEditorMode === 'edit' ? 'active' : ''} onClick={() => changeCanvasEditorMode('edit')}>{t('canvas.referenceEdit', '参考编辑')}</button>
                      <button type="button" className={canvasEditorMode === 'mask' ? 'active' : ''} onClick={() => changeCanvasEditorMode('mask')}>Mask</button>
                    </div>
                    {canvasEditorMode === 'image' ? <p>{t('canvas.deriveHint', '只继承提示词和画布关系，不把原图作为参考图。')}</p> : null}
                    {canvasEditorMode === 'edit' ? <p>{t('canvas.editHint', '会把这张图作为参考图，调用 /v1/images/edits。')}</p> : null}
                    {canvasEditorMode === 'mask' ? <p>{t('canvas.maskHint', '先在 Mask 面板涂抹要重绘的区域，再用这个节点继续生成。')}</p> : null}
                    <button
                      type="button"
                      className={`canvasInlineGenerate ${generationActionClass}`}
                      onClick={() => generateFromCanvasEditor(node)}
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
                  onPointerDown={(event) => startCanvasNodeResize(event, node)}
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
          }) : primaryVideoResult ? (
            <div className="canvasNode emptyCanvasNode previewFallbackNode">
              <Video size={28} />
              <strong>{t('canvas.videoResult', '视频结果')}</strong>
              <span>{t('canvas.nextNodeHint', '下一次生成会在画布里形成节点关系。')}</span>
            </div>
          ) : workPreviewImage ? (
            <div className="canvasNode sourceNode previewFallbackNode">
              <ProtectedStudioImage
                src={workPreviewImage}
                fallbackSrc={workPreviewFallback}
                alt={previewAlt}
              />
              <span className="canvasNodeLabel">{hasPrimaryResult ? '#1' : selectedCase?.title || t('canvas.sourceImage', '参考画面')}</span>
            </div>
          ) : (
            <div className="canvasNode emptyCanvasNode">
              <ImageIcon size={28} />
              <strong>{t('canvas.title', '画布')}</strong>
              <span>{t('canvas.empty', '在底部输入想法并生成，第一张会成为 #1；选中任意图片后，再补充要求即可继续延伸。')}</span>
            </div>
          )}
        </div>
      </div>
      <aside className={`referenceSidePanel ${layoutSections.references ? 'isOpen' : 'isCollapsed'}`} aria-label={t('references.title', '参考图（可选）')}>
        {layoutSections.references ? (
          <>
            <div className="referenceSideHead">
              <div>
                <strong>{mode === 'mask' ? t('references.maskTitle', '参考图与蒙版') : t('references.title', '参考图（可选）')}</strong>
                <span>{mode === 'mask' ? 'Mask / edits' : referenceFiles.length || videoReferenceFiles.length ? t('references.selected', '已选择 {count} 张', { count: mode === 'video' ? videoReferenceFiles.length : referenceFiles.length }) : t('references.sideHint', '拖拽、粘贴或上传')}</span>
              </div>
              <button type="button" onClick={() => toggleLayoutSection('references')} aria-label={t('references.collapse', '收起参考图')}>
                <PanelLeftClose size={15} />
              </button>
            </div>
            {mode === 'mask' ? (
              <div className="referenceSideBody maskReferenceSideBody">
                <MaskEditor
                  ref={maskEditorRef}
                  imageFile={maskSourceFile}
                  imagePreview={maskSourcePreview}
                  onUpload={(files) => {
                    const nextFile = supportedReferenceFiles(files, 1)[0];
                    if (!nextFile) {
                      setStatus('error');
                      setMessage(t('references.unsupportedFormat', '只支持 PNG / JPG / WebP 参考图。'));
                      return;
                    }
                    setReferenceItems([createReferenceItem(nextFile, 'identity')]);
                    if (maskExportUrl) {
                      URL.revokeObjectURL(maskExportUrl);
                      setMaskExportUrl('');
                    }
                    setStatus('idle');
                    setMessage('');
                  }}
                  onClearImage={clearReferenceImages}
                  onExportReady={handleMaskExportReady}
                  onError={(nextMessage) => {
                    setStatus('error');
                    setMessage(nextMessage);
                  }}
                  onGenerate={selectedCanvasNode ? generateMaskFromPanel : null}
                  generating={status === 'loading'}
                  t={t}
                />
                {maskExportUrl ? (
                  <div className="maskExportPreview">
                    <img src={maskExportUrl} alt="已导出的 mask" />
                    <span>{t('references.exportedMask', '已导出 mask.png')}</span>
                  </div>
                ) : null}
              </div>
            ) : mode === 'video' ? (
              <div className={`referenceSideBody ${videoReferencePreviews.length ? 'hasReferenceItems' : ''}`}>
                <label
                  className={`uploadDrop sideUploadDrop ${videoDropActive ? 'isDragging' : ''}`}
                  tabIndex={0}
                  onDragEnter={(event) => {
                    event.preventDefault();
                    setVideoDropActive(true);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setVideoDropActive(true);
                  }}
                  onDragLeave={() => setVideoDropActive(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setVideoDropActive(false);
                    appendVideoReferenceImage(event.dataTransfer?.files);
                  }}
                  onPaste={videoReferencePasteFiles}
                >
                  <Upload size={18} />
                  <span>{videoReferenceFiles.length ? t('references.replaceVideo', '更换 / 拖入更多') : t('references.optionalUpload', '拖拽 / 粘贴 / 上传参考图，可选')}</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(event) => {
                      appendVideoReferenceImage(event.target.files);
                      event.target.value = '';
                    }}
                  />
                </label>
                {videoReferencePreviews.length ? (
                  <div className="referenceThumbs sideReferenceThumbs videoReferenceThumbs">
                    {videoReferencePreviews.map((url, index) => (
                      <figure key={url}>
                        <button
                          type="button"
                          className="referencePreviewButton"
                          onClick={() => setPreviewImage({
                            url,
                            index,
                            downloadMeta: {
                              mode: 'image',
                              providerId: mode === 'video' ? videoModel : model,
                              prompt: prompt.trim(),
                              createdAt: new Date().toISOString()
                            }
                          })}
                          aria-label={t('references.preview', '查看参考图')}
                        >
                          <LazyImage src={url} alt={videoReferenceFiles[index]?.name || t('references.videoReference', '视频参考图')} />
                        </button>
                        <button type="button" onClick={removeVideoReferenceImage} aria-label={t('references.remove', '移除参考图')}>
                          <X size={13} />
                        </button>
                      </figure>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className={`referenceSideBody ${referencePreviews.length ? 'hasReferenceItems' : ''}`}>
                <label
                  className={`uploadDrop sideUploadDrop ${referenceDropActive ? 'isDragging' : ''}`}
                  tabIndex={0}
                  onDragEnter={(event) => {
                    event.preventDefault();
                    setReferenceDropActive(true);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setReferenceDropActive(true);
                  }}
                  onDragLeave={() => setReferenceDropActive(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setReferenceDropActive(false);
                    appendReferenceImages(event.dataTransfer?.files);
                  }}
                  onPaste={referencePasteFiles}
                >
                  <Upload size={18} />
                  <span>{referenceFiles.length ? t('references.addMore', '继续添加 / 拖入更多') : t('references.upload', '拖拽 / 粘贴 / 上传参考图')}</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    multiple
                    onChange={(event) => {
                      appendReferenceImages(event.target.files);
                      event.target.value = '';
                    }}
                  />
                </label>
                {referencePreviews.length ? (
                  <div className="referenceThumbs sideReferenceThumbs">
                    {referencePreviews.map((url, index) => (
                      <figure key={url}>
                        <button
                          type="button"
                          className="referencePreviewButton"
                          onClick={() => setPreviewImage({
                            url,
                            index,
                            downloadMeta: {
                              mode: 'reference',
                              providerId: mode === 'video' ? videoModel : model,
                              prompt: prompt.trim(),
                              createdAt: new Date().toISOString()
                            }
                          })}
                          aria-label={t('references.preview', '查看参考图')}
                        >
                          <LazyImage src={url} alt={referenceItems[index]?.file?.name || t('references.referenceIndex', '参考 {index}', { index: index + 1 })} />
                        </button>
                        <figcaption>
                          <select
                            value={referenceItems[index]?.role || 'identity'}
                            onChange={(event) => updateReferenceRole(index, event.target.value)}
                            aria-label={t('references.role', '参考图 {index} 角色', { index: index + 1 })}
                          >
                            {REFERENCE_ROLES.map((role) => (
                              <option key={role.value} value={role.value}>{role.label}</option>
                            ))}
                          </select>
                          <span>{index === 0 ? t('references.mainReference', '主参考') : t('references.referenceIndex', '参考 {index}', { index: index + 1 })}</span>
                        </figcaption>
                        <div className="referenceFileMeta">
                          <strong>{referenceItems[index]?.file?.name || t('references.referenceIndex', '参考 {index}', { index: index + 1 })}</strong>
                          <span>{formatFileSize(referenceItems[index]?.file?.size) || t('references.preview', '查看参考图')}</span>
                        </div>
                        <div className="referenceThumbActions">
                          <button type="button" onClick={() => moveReferenceImage(index, -1)} disabled={index === 0} aria-label={t('references.moveBefore', '前移参考图')}>
                            <ArrowUp size={13} />
                          </button>
                          <button type="button" onClick={() => moveReferenceImage(index, 1)} disabled={index === referencePreviews.length - 1} aria-label={t('references.moveAfter', '后移参考图')}>
                            <ArrowDown size={13} />
                          </button>
                          <button type="button" onClick={() => removeReferenceImage(index)} aria-label={t('references.remove', '移除参考图')}>
                            <X size={13} />
                          </button>
                        </div>
                      </figure>
                    ))}
                  </div>
                ) : null}
              </div>
            )}
            <div className="referenceSideFoot">
              <span>{referenceSideCount}/{referenceSideLimit}</span>
              <strong>{t('references.title', '参考图')}</strong>
            </div>
          </>
        ) : (
          <button type="button" className="referenceSideCollapsed" onClick={() => toggleLayoutSection('references')}>
            <Images size={17} />
            <span>{t('references.title', '参考图')}</span>
          </button>
        )}
      </aside>
      <div className="deskPanel">
        {activeWorkspace === 'image' ? (
          <div className="modeTabs imageModeTabs">
            {DESK_MODES.map((item) => {
              const Icon = item.icon;
              return (
                <button type="button" className={mode === item.value ? 'active' : ''} key={item.value} onClick={() => setMode(item.value)}>
                  <Icon size={17} /> {deskModeLabel(item.value)}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="workspaceTitleStrip">
            <Video size={17} />
            <span>{t('workspace.video', '视频创作')}</span>
          </div>
        )}
        {selectedCase && mode === 'image' ? (
          <div className="caseMeta">
            <span>{typeof selectedCase.id === 'number' ? `#${selectedCase.id}` : t('gallery.external', '外部')}</span>
            <h2>{selectedCase.title}</h2>
            <p>{[categoryLabel(selectedCase.category || selectedCase.section || '模板'), caseCardMeta(selectedCase)].filter(Boolean).join(' · ')}</p>
            {Array.isArray(selectedCase.riskTags) && selectedCase.riskTags.length ? (
              <div className="riskStrip">
                {selectedCase.riskTags.map((item) => <span key={item}>{riskLabel(item)}</span>)}
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="presetChips">
          {visiblePromptPresets.map((item) => (
            <button type="button" key={item.id || item.title} onClick={() => applyPromptPreset(item)} disabled={caseResolving}>
              {item.title}
            </button>
          ))}
        </div>
        {mode !== 'video' ? (
          <CreativeRecipeBar
            recipes={CREATIVE_RECIPES}
            activeId={activeRecipeId}
            onApply={applyCreativeRecipe}
          />
        ) : null}
        {false && mode !== 'video' && mode !== 'mask' && layoutSections.references ? (
          <div className="referenceBox">
            <div className="miniPanelHead">
              <strong>{t('references.title', '参考图（可选）')}</strong>
              <button type="button" onClick={() => toggleLayoutSection('references')} aria-label={t('references.collapse', '收起参考图')}>
                <PanelLeftClose size={15} />
              </button>
            </div>
            <label
              className={`uploadDrop ${referenceDropActive ? 'isDragging' : ''}`}
              tabIndex={0}
              onDragEnter={(event) => {
                event.preventDefault();
                setReferenceDropActive(true);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setReferenceDropActive(true);
              }}
              onDragLeave={() => setReferenceDropActive(false)}
              onDrop={(event) => {
                event.preventDefault();
                setReferenceDropActive(false);
                appendReferenceImages(event.dataTransfer?.files);
              }}
              onPaste={referencePasteFiles}
            >
              <Upload size={18} />
              <span>{referenceFiles.length ? t('references.selected', '已选择 {count} 张', { count: referenceFiles.length }) : t('references.upload', '拖拽 / 粘贴 / 上传参考图')}</span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                onChange={(event) => {
                  appendReferenceImages(event.target.files);
                  event.target.value = '';
                }}
              />
            </label>
            {referencePreviews.length ? (
              <div className="referenceThumbs">
                {referencePreviews.map((url, index) => (
                  <figure key={url}>
                    <LazyImage src={url} alt={referenceItems[index]?.file?.name || t('references.referenceIndex', '参考 {index}', { index: index + 1 })} />
                    <figcaption>
                      <select
                        value={referenceItems[index]?.role || 'identity'}
                        onChange={(event) => updateReferenceRole(index, event.target.value)}
                        aria-label={t('references.role', '参考图 {index} 角色', { index: index + 1 })}
                      >
                        {REFERENCE_ROLES.map((role) => (
                          <option key={role.value} value={role.value}>{role.label}</option>
                        ))}
                      </select>
                      <span>{index === 0 ? t('references.mainReference', '主参考') : t('references.referenceIndex', '参考 {index}', { index: index + 1 })}</span>
                    </figcaption>
                    <div className="referenceThumbActions">
                      <button type="button" onClick={() => moveReferenceImage(index, -1)} disabled={index === 0} aria-label={t('references.moveBefore', '前移参考图')}>
                        <ArrowUp size={13} />
                      </button>
                      <button type="button" onClick={() => moveReferenceImage(index, 1)} disabled={index === referencePreviews.length - 1} aria-label={t('references.moveAfter', '后移参考图')}>
                        <ArrowDown size={13} />
                      </button>
                      <button type="button" onClick={() => removeReferenceImage(index)} aria-label={t('references.remove', '移除参考图')}>
                        <X size={13} />
                      </button>
                    </div>
                  </figure>
                ))}
              </div>
            ) : null}
          </div>
        ) : mode !== 'video' && mode !== 'mask' ? (
          <button type="button" className="collapsedWorkbenchBlock referenceCollapsedBlock" onClick={() => toggleLayoutSection('references')}>
            <Upload size={16} />
            <span>{referenceFiles.length ? t('references.collapsedSelected', '参考图已收起，共 {count} 张', { count: referenceFiles.length }) : t('references.collapsedEmpty', '参考图已收起，点击展开拖拽、粘贴或上传。')}</span>
          </button>
        ) : null}
        {false && mode === 'mask' && layoutSections.references ? (
          <div className="referenceBox maskReferenceBox">
            <div className="miniPanelHead">
              <strong>{t('references.maskTitle', '参考图与蒙版')}</strong>
              <button type="button" onClick={() => toggleLayoutSection('references')} aria-label={t('references.collapse', '收起参考图')}>
                <PanelLeftClose size={15} />
              </button>
            </div>
            <MaskEditor
              ref={maskEditorRef}
              imageFile={maskSourceFile}
              imagePreview={maskSourcePreview}
              onUpload={(files) => {
                const nextFile = supportedReferenceFiles(files, 1)[0];
                if (!nextFile) {
                  setStatus('error');
                  setMessage(t('statusMessages.referenceUnsupported', '只支持 PNG / JPG / WebP 参考图。'));
                  return;
                }
                setReferenceItems([createReferenceItem(nextFile, 'identity')]);
                if (maskExportUrl) {
                  URL.revokeObjectURL(maskExportUrl);
                  setMaskExportUrl('');
                }
                setStatus('idle');
                setMessage('');
              }}
              onClearImage={clearReferenceImages}
              onExportReady={handleMaskExportReady}
              onError={(nextMessage) => {
                setStatus('error');
                setMessage(nextMessage);
              }}
              onGenerate={selectedCanvasNode ? generateMaskFromPanel : null}
              generating={status === 'loading'}
            />
            {maskExportUrl ? (
              <div className="maskExportPreview">
                <img src={maskExportUrl} alt="已导出的 mask" />
                <span>{t('references.exportedMask', '已导出 mask.png')}</span>
              </div>
            ) : null}
          </div>
        ) : mode === 'mask' ? (
          <button type="button" className="collapsedWorkbenchBlock referenceCollapsedBlock" onClick={() => toggleLayoutSection('references')}>
            <Upload size={16} />
            <span>{t('references.maskCollapsed', '参考图与蒙版已收起，点击展开继续编辑。')}</span>
          </button>
        ) : null}
        {false && mode === 'video' && layoutSections.references ? (
          <div className="referenceBox">
            <div className="miniPanelHead">
              <strong>{t('references.title', '参考图（可选）')}</strong>
              <button type="button" onClick={() => toggleLayoutSection('references')} aria-label={t('references.collapse', '收起参考图')}>
                <PanelLeftClose size={15} />
              </button>
            </div>
            <label
              className={`uploadDrop ${videoDropActive ? 'isDragging' : ''}`}
              tabIndex={0}
              onDragEnter={(event) => {
                event.preventDefault();
                setVideoDropActive(true);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setVideoDropActive(true);
              }}
              onDragLeave={() => setVideoDropActive(false)}
              onDrop={(event) => {
                event.preventDefault();
                setVideoDropActive(false);
                appendVideoReferenceImage(event.dataTransfer?.files);
              }}
              onPaste={videoReferencePasteFiles}
            >
              <Upload size={18} />
              <span>{videoReferenceFiles.length ? t('references.selectedVideo', '已选择视频参考图') : t('references.optionalUpload', '拖拽 / 粘贴 / 上传参考图，可选')}</span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => {
                  appendVideoReferenceImage(event.target.files);
                  event.target.value = '';
                }}
              />
            </label>
            {videoReferencePreviews.length ? (
              <div className="referenceThumbs videoReferenceThumbs">
                {videoReferencePreviews.map((url, index) => (
                  <figure key={url}>
                    <LazyImage src={url} alt={videoReferenceFiles[index]?.name || t('references.videoReference', '视频参考图')} />
                    <button type="button" onClick={removeVideoReferenceImage} aria-label={t('references.remove', '移除参考图')}>
                      <X size={13} />
                    </button>
                  </figure>
                ))}
              </div>
            ) : null}
          </div>
        ) : mode === 'video' ? (
          <button type="button" className="collapsedWorkbenchBlock referenceCollapsedBlock" onClick={() => toggleLayoutSection('references')}>
            <Upload size={16} />
            <span>{videoReferenceFiles.length ? t('references.collapsedVideoSelected', '参考图已收起，共 1 张') : t('references.collapsedSimple', '参考图已收起，点击展开。')}</span>
          </button>
        ) : null}
        {layoutSections.parameters && mode !== 'video' ? (
          <div className="routeStrip autoRouteStrip">
            <span><SlidersHorizontal size={15} /> {t('composer.routeLabel', '接口')}</span>
            <p>{mode === 'mask' || (mode === 'edit' && (referenceFiles.length || selectedCanvasNode?.url)) ? t('composer.routeEditHint', '参考图 / Mask 会自动走 /v1/images/edits') : t('composer.routeImageHint', '文生图 / 继续衍生会走 /v1/images/generations')}</p>
          </div>
        ) : layoutSections.parameters ? (
          <div className="routeStrip">
            <span><Video size={15} /> {t('composer.videoRouteLabel', '视频接口')}</span>
            <div><button type="button" className="active">{t('composer.videoTask', '任务')}</button></div>
          </div>
        ) : null}
        {layoutSections.parameters ? <div className="controlGrid">
          {mode === 'video' ? (
            <>
                <label className="controlField modelField">
                  <span>{t('params.videoModel', '视频模型')}</span>
                  <select value={hasVideoModels ? videoModel : ''} onChange={(event) => setVideoModel(event.target.value)} disabled={!hasVideoModels}>
                    {hasVideoModels ? videoModelOptions.map((item) => <option key={item.id} value={item.id}>{item.label || item.id}</option>) : (
                      <option value="">{t('params.currentKeyNoVideo', '当前 Key 未开放视频模型')}</option>
                    )}
                  </select>
                </label>
              <div className="controlField">
                <span>{t('params.duration', '时长')}</span>
                <div className="optionSegment durationSegment">
                  {VIDEO_DURATIONS.map((item) => (
                    <button type="button" className={videoDuration === item ? 'active' : ''} key={item} onClick={() => setVideoDuration(item)}>
                      {item}s
                    </button>
                  ))}
                </div>
              </div>
              <div className="controlField wideControl">
                <span>{t('params.videoAspect', '视频比例')}</span>
                <div className="optionSegment videoSizeSegment">
                  {VIDEO_ASPECT_OPTIONS.map((item) => (
                    <button type="button" className={videoAspect === item.value ? 'active' : ''} key={item.value} onClick={() => setVideoAspect(item.value)}>
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="controlField">
                <span>{t('params.fps', '帧率')}</span>
                <div className="optionSegment fpsSegment">
                  {VIDEO_FPS_OPTIONS.map((item) => (
                    <button type="button" className={videoFps === item ? 'active' : ''} key={item} onClick={() => setVideoFps(item)}>
                      {item} fps
                    </button>
                  ))}
                </div>
              </div>
              <div className="controlField videoSpecField">
                <span>{t('params.output', '输出')}</span>
                <strong>{videoSize.width} x {videoSize.height}</strong>
              </div>
              <div className="controlField wideControl">
                <span>{t('params.motion', '镜头运动')}</span>
                <div className="optionSegment motionSegment">
                  {VIDEO_MOTIONS.map((item) => (
                    <button type="button" className={videoMotion === item.value ? 'active' : ''} key={item.value} onClick={() => setVideoMotion(item.value)}>
                      {videoMotionLabel(item)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="controlField">
                <span>{t('params.style', '风格')}</span>
                <div className="optionSegment videoStyleSegment">
                  {VIDEO_STYLES.map((item) => (
                    <button type="button" className={videoStyle === item.value ? 'active' : ''} key={item.value} onClick={() => setVideoStyle(item.value)}>
                      {videoStyleLabel(item)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="controlField">
                <span>{t('params.videoQuality', '视频画质')}</span>
                <div className="optionSegment videoQualitySegment">
                  {VIDEO_QUALITY.map((item) => (
                    <button type="button" className={videoQuality === item ? 'active' : ''} key={item} onClick={() => setVideoQuality(item)}>
                      {item === 'auto' ? t('params.auto', '自动') : item === 'high' ? t('params.high', '高') : t('params.standard', '标准')}
                    </button>
                  ))}
                </div>
              </div>
              <label className="controlField wideControl negativePromptField">
                <span>{t('params.negativePrompt', '负面提示词')}</span>
                <input
                  value={negativePrompt}
                  onChange={(event) => setNegativePrompt(event.target.value)}
                  placeholder={t('params.negativePromptPlaceholder', '例如：不要字幕、水印、畸变、闪烁、手部变形')}
                />
              </label>
            </>
          ) : (
            <>
              <label className="controlField modelField">
                <span>{t('params.imageModel', '图片模型')}</span>
                <select value={model} onChange={(event) => setModel(event.target.value)}>
                  {imageModelOptions.map((item) => <option key={item.id} value={item.id}>{item.label || item.id}</option>)}
                </select>
              </label>
              <div className="controlField countField">
                <div className="fieldHead">
                  <span>{t('params.imageCount', '图片数量')}</span>
                  <strong>{countValue}</strong>
                </div>
                <input
                  type="range"
                  min={imageCountRange.min}
                  max={imageCountRange.max}
                  value={countValue}
                  onChange={(event) => setCount(clampCountForProvider(event.target.value, currentImageProvider, normalizeCount))}
                />
              </div>
              <div className="controlField wideControl">
                <span>{t('params.aspect', '尺寸比例')}</span>
                <div className="optionSegment sizeSegment">
                  {imageAspectOptions.map((item) => (
                    <button
                      type="button"
                      className={aspect === item.value ? 'active' : ''}
                      key={item.value}
                      onClick={() => {
                        setAspect(item.value);
                        if (item.value !== 'custom') setCustomSize(item.size);
                      }}
                    >
                      {resolutionTierLabel(item)}
                    </button>
                  ))}
                </div>
                {aspect === 'custom' ? (
                  <>
                    <select className="compactSelect" aria-label={t('params.apiSize', '接口尺寸')} value={customSize} onChange={(event) => setCustomSize(normalizeSize(event.target.value))}>
                      {customSizeOptions.map((item) => <option key={item.value} value={item.value}>{customSizeLabel(item)}</option>)}
                    </select>
                    <small className="sizeLimitHint">{t('params.sizeHint', '这里是当前模型支持的 size 枚举；2K/4K 会写进提示词作为目标清晰度。')}</small>
                  </>
                ) : null}
              </div>
              <div className="controlField">
                <span>{t('params.quality', '质量')}</span>
                <div className="optionSegment qualitySegment">
                  {imageQualityOptions.map((item) => (
                    <button type="button" className={quality === item ? 'active' : ''} key={item} onClick={() => setQuality(item)}>
                      {qualityLabel(item)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="controlField">
                <span>{t('params.resolution', '分辨率')}</span>
                <div className="optionSegment resolutionSegment">
                  {imageResolutionTierOptions.map((item) => (
                    <button type="button" className={resolutionTier === item.value ? 'active' : ''} key={item.value} onClick={() => setResolutionTier(item.value)}>
                      {resolutionTierLabel(item)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="controlField">
                <span>{t('params.format', '格式')}</span>
                <div className="optionSegment formatSegment">
                  {imageOutputFormatOptions.map((item) => (
                    <button type="button" className={outputFormat === item ? 'active' : ''} key={item} onClick={() => setOutputFormat(item)}>
                      {OUTPUT_FORMAT_LABELS[item] || item}
                    </button>
                  ))}
                </div>
              </div>
              <div className="controlField">
                <span>{t('params.moderation', '审核')}</span>
                <div className="optionSegment moderationSegment">
                  {MODERATION.map((item) => (
                    <button type="button" className={moderation === item ? 'active' : ''} key={item} onClick={() => setModeration(item)}>
                      {MODERATION_LABELS[item] || item}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div> : (
          <button type="button" className="collapsedWorkbenchBlock" onClick={() => toggleLayoutSection('parameters')}>
            <SlidersHorizontal size={16} />
            <span>{mode === 'video' ? `${videoAspect} · ${videoDuration}s · ${videoFps}fps` : `${size} · ${RESOLUTION_TIER_LABELS[resolutionTier]} · ${qualityLabel(quality)}`}</span>
          </button>
        )}
        {layoutSections.parameters ? <div className="billingStrip">
          <span>{t('params.billingModelSource', '模型来源：{value}', {
            value: mode === 'video'
              ? (modelsStatus === 'loading' ? t('params.loadingVideoModels', '正在读取视频模型') : hasVideoModels ? t('params.availableVideoModels', '当前 Key 可用视频模型') : t('params.unavailableVideoModels', '当前 Key 未开放视频模型'))
              : modelsStatus === 'ready'
                ? t('params.availableModels', '当前 Key 可用模型')
                : modelsStatus === 'loading'
                  ? t('params.loadingModels', '正在读取模型')
                  : t('params.defaultModels', '默认模型')
          })}</span>
          <span>{t('params.billingUnit', '计费口径：{value}', { value: mode === 'video' ? modelBillingUnitLabel(activeVideoModelInfo, t('params.videoUnit', '段'), 1) : modelBillingLabel(activeModelInfo, countValue) })}</span>
          {mode === 'video' && videoTask?.task_id ? <span>{t('params.videoTask', '任务：{value}', { value: videoTask.task_id })}</span> : null}
          <span>{t('params.usage', '账户用量：{value}', { value: usageSummary || t('params.usageFallback', '生成后以后台记录为准') })}</span>
        </div> : null}
        <div className="deskActions">
          <button type="button" onClick={optimizeCurrentPrompt} disabled={optimizingPrompt}>
            {optimizingPrompt ? <LoaderCircle className="spin" size={18} /> : <WandSparkles size={18} />}
            {optimizingPrompt ? t('composer.optimizing', '优化中') : `AI ${t('composer.optimize', '优化')}`}
          </button>
          <button type="button" className={`primaryAction ${generationActionClass}`} onClick={handleGenerateAction} disabled={generationActionDisabled}>
            {generationActionIcon}
            {generationActionLabel}
          </button>
        </div>
        {!layoutSections.bottomComposer ? (
          <>
            <ProgressBar progress={progress} active={status === 'loading' || status === 'success' || progress.stage === 'failed' || progress.stage === 'pending_review'} t={t} />
            <GenerationTimingPanel timing={timing} t={t} />
            {message ? <p className={`statusLine ${status}`}>{message}</p> : null}
            {isGenerating ? (
              <button type="button" className="composerStopAction" onClick={stopGeneration}>
                <X size={14} />
                {t('composer.stopWaiting', '停止当前等待')}
              </button>
            ) : null}
          </>
        ) : null}
      </div>
      <section className={`resultStage ${hasPrimaryResult ? 'hasResult' : ''}`}>
        <div className="resultStageHead">
          <strong>{mode === 'video' ? t('canvas.videoResult', '视频结果') : t('composer.resultTitle', '生成结果')}</strong>
          <span>{hasPrimaryResult ? t('composer.resultCount', '共 {count} 张', { count: mode === 'video' ? videoResults.length : results.length }) : t('composer.pending', '待生成')}</span>
        </div>
        {mode === 'video' ? (
          <VideoResultGrid urls={videoResults} downloadMeta={currentDownloadMeta} onPreview={(url, index) => setPreviewVideo({ url, index })} t={t} />
        ) : (
          <ResultGrid urls={results} outputFormat={outputFormat} downloadMeta={currentDownloadMeta} onPreview={(url, index) => setPreviewImage({ url, index })} t={t} />
        )}
      </section>
      <BottomComposerPanel
        composerFolded={composerFolded}
        composerRouteLabel={composerRouteLabel}
        composerThreadHasContent={composerThreadHasContent}
        hasLiveStatus={composerGenerationVisible}
        hasLineage={Boolean(selectedCanvasNode)}
        hasReferences={layoutSections.references}
        isOpen={layoutSections.bottomComposer}
        onClose={foldComposerPanel}
        onFoldToggle={toggleComposerFold}
        onOpen={openComposerPanel}
        paramsExpanded={layoutSections.composerParameters !== false}
        selectedCanvasNode={selectedCanvasNode}
        t={t}
      >
        {layoutSections.bottomComposer && !composerFolded && composerGenerationVisible ? (
          <ComposerLiveStatus
            progress={progress}
            status={status}
            message={message}
            timing={timing}
            modelLabel={mode === 'video' ? videoModel : model}
            routeLabel={composerRouteLabel}
            isGenerating={isGenerating}
            onStop={stopGeneration}
            onRetry={openRegenerateDialog}
            now={composerNow}
            stallNoticeMs={GENERATION_STALL_NOTICE_MS}
            t={t}
          />
        ) : null}
        {layoutSections.bottomComposer && !composerFolded ? (
          <ComposerThread
            ref={composerThreadRef}
            messages={assistantMessages}
            promptSuggestion={promptSuggestion}
            onCopySuggestion={copySuggestion}
            onMergeSuggestion={mergeSuggestion}
            onReplaceSuggestion={replaceSuggestion}
            onUseFinalPrompt={setPrompt}
            onUseSuggestion={useSuggestionForGenerate}
            t={t}
          />
        ) : null}
        <ComposerPromptRow
          assistantDisabled={status === 'loading' || optimizingPrompt || caseResolving}
          generationActionClass={generationActionClass}
          generationActionDisabled={generationActionDisabled}
          generationActionIcon={compactGenerationActionIcon}
          generationActionLabel={generationActionLabel}
          isDroppingReference={referenceDropActive || videoDropActive}
          optimizingPrompt={optimizingPrompt}
          onAssistantAction={sendAssistantMessage}
          onChange={(event) => setPrompt(event.target.value)}
          onDragEnter={handleComposerReferenceDragEnter}
          onDragLeave={handleComposerReferenceDragLeave}
          onDragOver={handleComposerReferenceDragOver}
          onDrop={handleComposerReferenceDrop}
          onFocus={handleComposerPromptFocus}
          onGenerateAction={handleGenerateAction}
          onKeyDown={handleComposerPromptKeyDown}
          onPaste={handleComposerPromptPaste}
          placeholder={composerPromptPlaceholder}
          prompt={prompt}
          t={t}
        />
        {layoutSections.bottomComposer && !composerFolded ? (
          <ComposerParamShelf
            activeWorkspace={activeWorkspace}
            aspect={aspect}
            aspectLabel={aspectLabel}
            countValue={countValue}
            deskModeLabel={deskModeLabel}
            deskModes={DESK_MODES}
            hasVideoModels={hasVideoModels}
            imageAspectOptions={imageAspectOptions}
            imageCountRange={imageCountRange}
            imageCountSuffix={imageCountSuffix}
            imageModelOptions={imageModelOptions}
            imageQualityOptions={imageQualityOptions}
            imageReferenceCount={referenceFiles.length}
            imageResolutionTierOptions={imageResolutionTierOptions}
            layoutSections={layoutSections}
            mode={mode}
            model={model}
            onAspectChange={setAspect}
            onCountChange={(value) => setCount(clampCountForProvider(value, currentImageProvider, normalizeCount))}
            onModeChange={setMode}
            onModelChange={setModel}
            onQualityChange={setQuality}
            onReferenceToggle={() => toggleLayoutSection('references')}
            onResolutionTierChange={setResolutionTier}
            onVideoAspectChange={setVideoAspect}
            onVideoDurationChange={setVideoDuration}
            onVideoModelChange={setVideoModel}
            quality={quality}
            qualityLabel={qualityLabel}
            resolutionTier={resolutionTier}
            resolutionTierLabel={resolutionTierLabel}
            resolutionTierLabels={RESOLUTION_TIER_LABELS}
            setCustomSize={setCustomSize}
            t={t}
            toggleLayoutSection={toggleLayoutSection}
            updateLayoutSections={updateLayoutSections}
            videoAspect={videoAspect}
            videoAspectOptions={VIDEO_ASPECT_OPTIONS}
            videoDuration={videoDuration}
            videoDurations={VIDEO_DURATIONS}
            videoModel={videoModel}
            videoModelOptions={videoModelOptions}
            videoReferenceCount={videoReferenceFiles.length}
          />
        ) : null}
      </BottomComposerPanel>
      <RegenerateDialog
        open={regenerateDialogOpen}
        mode={mode}
        prompt={prompt}
        progress={progress}
        status={status}
        message={message}
        isGenerating={isGenerating}
        imageAspectOptions={imageAspectOptions}
        imageCountRange={imageCountRange}
        imageModelOptions={imageModelOptions}
        imageQualityOptions={imageQualityOptions}
        imageResolutionTierOptions={imageResolutionTierOptions}
        aspect={aspect}
        aspectLabel={aspectLabel}
        countValue={countValue}
        model={model}
        onAspectChange={setAspect}
        onCountChange={(value) => setCount(clampCountForProvider(value, currentImageProvider, normalizeCount))}
        onConfirm={confirmRegenerate}
        onModelChange={setModel}
        onOpenBottomParams={openBottomParamShelf}
        onQualityChange={setQuality}
        onResolutionTierChange={setResolutionTier}
        onClose={() => setRegenerateDialogOpen(false)}
        quality={quality}
        qualityLabel={qualityLabel}
        resolutionTier={resolutionTier}
        resolutionTierLabel={resolutionTierLabel}
        t={t}
        videoAspect={videoAspect}
        videoAspectOptions={VIDEO_ASPECT_OPTIONS}
        videoDuration={videoDuration}
        videoDurations={VIDEO_DURATIONS}
        videoModel={videoModel}
        videoModelOptions={videoModelOptions}
        onVideoAspectChange={setVideoAspect}
        onVideoDurationChange={setVideoDuration}
        onVideoModelChange={setVideoModel}
      />
      <aside className="paramRail" aria-label={t('params.aria', '参数')}>
        <button
          type="button"
          className="paramRailHead"
          onClick={() => {
            const nextExpanded = layoutSections.parametersRail === false;
            if (nextExpanded && !activeParamPanel) setActiveParamPanel('model');
            if (!nextExpanded) setActiveParamPanel('');
            updateLayoutSections({ parametersRail: nextExpanded, parameters: true });
          }}
          aria-label={layoutSections.parametersRail === false ? t('params.expand', '展开参数栏') : t('params.collapse', '收起参数栏')}
          title={layoutSections.parametersRail === false ? t('params.expand', '展开参数栏') : t('params.collapse', '收起参数栏')}
        >
          {layoutSections.parametersRail === false ? (
            <SlidersHorizontal size={18} />
          ) : (
            <>
              <span>›</span>
              {t('params.aria', '参数')}
            </>
          )}
        </button>
        <button type="button" className={activeParamPanel === 'model' ? 'active' : ''} onClick={() => openParamPanel('model')} aria-label={t('params.model', '模型')} title={t('params.model', '模型')}>
          <Server size={18} />
          <span>{t('params.model', '模型')}</span>
        </button>
        <button type="button" className={activeParamPanel === 'size' ? 'active' : ''} onClick={() => openParamPanel('size')} aria-label={t('params.size', '尺寸')} title={t('params.size', '尺寸')}>
          <ScanLine size={18} />
          <span>{t('params.size', '尺寸')}</span>
        </button>
        <button type="button" className={activeParamPanel === 'quality' ? 'active' : ''} onClick={() => openParamPanel('quality')} aria-label={t('params.quality', '质量')} title={t('params.quality', '质量')}>
          <span className="paramRailBadge">HD</span>
          <span>{t('params.quality', '质量')}</span>
        </button>
        <button type="button" className={activeParamPanel === 'count' ? 'active' : ''} onClick={() => openParamPanel('count')} aria-label={t('params.count', '数量')} title={t('params.count', '数量')}>
          <Images size={18} />
          <span>{t('params.count', '数量')}</span>
        </button>
        <button type="button" className={`paramGenerateAction ${generationActionClass}`} onClick={handleGenerateAction} disabled={generationActionDisabled} aria-label={generationActionLabel} title={generationActionLabel}>
          {generationActionIcon}
          <span>{generationActionLabel}</span>
        </button>
      </aside>
      {layoutSections.parameters && activeParamPanel ? (
        <aside className={`paramDrawer paramDrawer-${activeParamPanel}`} aria-label={t('params.current', '当前参数')}>
          <div className="paramDrawerHead">
            <strong>{activeParamPanel === 'model' ? t('params.model', '模型') : activeParamPanel === 'size' ? t('params.size', '尺寸') : activeParamPanel === 'quality' ? t('params.quality', '质量') : t('params.count', '数量')}</strong>
            <button type="button" onClick={() => toggleLayoutSection('parameters')} aria-label={t('params.close', '收起参数')}>
              <PanelLeftClose size={15} />
            </button>
          </div>
          {activeParamPanel === 'model' ? (
            <div className="paramDrawerBody">
              {mode === 'video' ? (
                <label className="paramField">
                  <span>{t('params.videoModel', '视频模型')}</span>
                  <select value={hasVideoModels ? videoModel : ''} onChange={(event) => setVideoModel(event.target.value)} disabled={!hasVideoModels}>
                    {hasVideoModels ? videoModelOptions.map((item) => <option key={item.id} value={item.id}>{item.label || item.id}</option>) : (
                      <option value="">{t('params.currentKeyNoVideo', '当前 Key 未开放视频模型')}</option>
                    )}
                  </select>
                </label>
              ) : (
                <label className="paramField">
                  <span>{t('params.imageModel', '图片模型')}</span>
                  <select value={model} onChange={(event) => setModel(event.target.value)}>
                    {imageModelOptions.map((item) => <option key={item.id} value={item.id}>{item.label || item.id}</option>)}
                  </select>
                </label>
              )}
              {mode !== 'video' ? (
                <div className="paramHint">
                  {mode === 'mask' || (mode === 'edit' && (referenceFiles.length || selectedCanvasNode?.url)) ? t('params.routeEdits', '当前会自动使用 /v1/images/edits。') : t('params.routeGenerations', '当前会自动使用 /v1/images/generations。')}
                </div>
              ) : null}
            </div>
          ) : null}
          {activeParamPanel === 'size' ? (
            <div className="paramDrawerBody">
              {mode === 'video' ? (
                <>
                  <div className="paramSegment">
                    {VIDEO_ASPECT_OPTIONS.map((item) => (
                      <button type="button" className={videoAspect === item.value ? 'active' : ''} key={item.value} onClick={() => setVideoAspect(item.value)}>{item.label}</button>
                    ))}
                  </div>
                  <div className="paramHint">{t('params.outputSize', '输出 {width} x {height}', { width: videoSize.width, height: videoSize.height })}</div>
                </>
              ) : (
                <>
                  <div className="paramSegment">
                    {imageAspectOptions.map((item) => (
                      <button
                        type="button"
                        className={aspect === item.value ? 'active' : ''}
                        key={item.value}
                        onClick={() => {
                          setAspect(item.value);
                          if (item.value !== 'custom') setCustomSize(item.size);
                        }}
                      >
                        {aspectLabel(item)}
                      </button>
                    ))}
                  </div>
                  {aspect === 'custom' ? (
                    <label className="paramField">
                      <span>{t('params.apiSize', '接口尺寸')}</span>
                      <select value={customSize} onChange={(event) => setCustomSize(normalizeSize(event.target.value))}>
                        {customSizeOptions.map((item) => <option key={item.value} value={item.value}>{customSizeLabel(item)}</option>)}
                      </select>
                    </label>
                  ) : null}
                  <div className="paramHint">{t('params.currentSizeHint', '当前请求 size 为 {size}；2K/4K 会作为目标分辨率追加到提示词里。', { size })}</div>
                </>
              )}
            </div>
          ) : null}
          {activeParamPanel === 'quality' ? (
            <div className="paramDrawerBody">
              {mode === 'video' ? (
                <div className="paramSegment">
                  {VIDEO_QUALITY.map((item) => (
                    <button type="button" className={videoQuality === item ? 'active' : ''} key={item} onClick={() => setVideoQuality(item)}>
                      {item === 'auto' ? t('params.auto', '自动') : item === 'high' ? t('params.high', '高') : t('params.standard', '标准')}
                    </button>
                  ))}
                </div>
              ) : (
                <>
                  <div className="paramSegment">
                    {imageQualityOptions.map((item) => (
                      <button type="button" className={quality === item ? 'active' : ''} key={item} onClick={() => setQuality(item)}>
                        {qualityLabel(item)}
                      </button>
                    ))}
                  </div>
                  <div className="paramSegment">
                    {imageResolutionTierOptions.map((item) => (
                      <button type="button" className={resolutionTier === item.value ? 'active' : ''} key={item.value} onClick={() => setResolutionTier(item.value)}>
                        {resolutionTierLabel(item)}
                      </button>
                    ))}
                  </div>
                  <div className="paramHint">{t('params.resolutionHint', '分辨率档位会追加到生成要求里')}</div>
                </>
              )}
            </div>
          ) : null}
          {activeParamPanel === 'count' ? (
            <div className="paramDrawerBody">
              {mode === 'video' ? (
                <>
                  <div className="paramSegment">
                    {VIDEO_DURATIONS.map((item) => (
                      <button type="button" className={videoDuration === item ? 'active' : ''} key={item} onClick={() => setVideoDuration(item)}>{item}s</button>
                    ))}
                  </div>
                  <div className="paramSegment">
                    {VIDEO_FPS_OPTIONS.map((item) => (
                      <button type="button" className={videoFps === item ? 'active' : ''} key={item} onClick={() => setVideoFps(item)}>{item} fps</button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <label className="paramRange">
                    <span>{t('params.imageCount', '图片数量')}</span>
                    <strong>{countValue}</strong>
                    <input type="range" min={imageCountRange.min} max={imageCountRange.max} value={countValue} onChange={(event) => setCount(clampCountForProvider(event.target.value, currentImageProvider, normalizeCount))} />
                  </label>
                  <div className="paramSegment">
                    {imageOutputFormatOptions.map((item) => (
                      <button type="button" className={outputFormat === item ? 'active' : ''} key={item} onClick={() => setOutputFormat(item)}>{OUTPUT_FORMAT_LABELS[item] || item}</button>
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : null}
          <button type="button" className={`paramDrawerGenerate ${generationActionClass}`} onClick={handleGenerateAction} disabled={generationActionDisabled}>
            {compactGenerationActionIcon}
            {isGenerating ? t('params.queueMore', '加入队列') : needsReviewBeforeRetry ? t('params.confirmRetry', '确认后重试') : status === 'error' ? t('params.retryParams', '重试当前参数') : mode === 'video' ? t('params.generateVideo', '按当前参数生成视频') : t('params.generateImage', '按当前参数生成图片')}
          </button>
        </aside>
      ) : null}
      <Lightbox
        url={previewImage?.url}
        index={previewImage?.index || 0}
        outputFormat={outputFormat}
        downloadMeta={previewImage?.downloadMeta || currentDownloadMeta}
        t={t}
        onClose={() => setPreviewImage(null)}
      />
      <VideoLightbox
        url={previewVideo?.url || previewVideo}
        index={previewVideo?.index || 0}
        downloadMeta={previewVideo?.downloadMeta || currentDownloadMeta}
        onClose={() => setPreviewVideo('')}
      />
    </section>
  );
}

function SettingsPanel({
  open,
  onClose,
  apiKey,
  keys,
  onSelectKey,
  providerSettings,
  onProviderChange,
  modelOptions = { image: [], responses: [], video: [] },
  modelsStatus = 'idle',
  isAuthenticated,
  onLogin,
  t
}) {
  useEffect(() => {
    if (!open) return undefined;
    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const gatewayAccountDisabled = providerSettings.apiKeySource === 'manual';
  const currentProvider = getImageProvider(providerSettings.providerId, providerSettings.apiKeySource);
  const providerCapabilityText = [
    currentProvider?.capabilities?.textToImage ? t('settings.capTextToImage', '生图') : '',
    currentProvider?.capabilities?.imageEdit ? t('settings.capEdit', '编辑') : '',
    currentProvider?.capabilities?.mask ? 'Mask' : '',
    currentProvider?.capabilities?.modelSync ? t('settings.capModelSync', '模型同步') : ''
  ].filter(Boolean).join(' · ');
  const modelSyncLabel = modelsStatus === 'loading'
    ? t('settings.modelsSyncing', '正在从上游同步模型')
    : modelsStatus === 'ready'
      ? t('settings.modelsSynced', '上游模型已同步')
      : modelsStatus === 'fallback'
        ? t('settings.modelsFallback', '未读取到上游模型，暂用默认列表')
        : t('settings.modelsIdle', '填写接口和密钥后自动同步模型');
  const modelSyncMeta = t('settings.modelsSyncMeta', '图片 {image} · 对话 {responses} · 视频 {video}', {
    image: modelOptions.image?.length || 0,
    responses: modelOptions.responses?.length || 0,
    video: modelOptions.video?.length || 0
  });
  const providerChoiceOrder = ['gateway-account', 'openai-compatible', 'newapi-compatible', 'nano-banana-compatible', 'video-compatible'];
  const providerChoices = [...IMAGE_PROVIDER_REGISTRY]
    .sort((left, right) => providerChoiceOrder.indexOf(left.id) - providerChoiceOrder.indexOf(right.id))
    .map((provider) => ({
      ...provider,
      active: provider.id === currentProvider?.id,
      nextApiKeySource: provider.authMode
    }));

  return (
    <div className="settingsOverlay" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="settingsDialog">
        <div className="settingsTitle">
          <h2>{t('settings.title', '连接')}</h2>
          <button type="button" className="iconButton" onClick={onClose} aria-label={t('settings.close', '关闭')}>×</button>
        </div>

        <div className="settingsGroup providerSettingsGroup">
          <label className="settingsSelectField">
            <small>{t('settings.providerFamily', '接口类型')}</small>
            <select
              value={currentProvider?.id || providerSettings.providerId}
              onChange={(event) => {
                const nextProvider = providerChoices.find((provider) => provider.id === event.target.value) || providerChoices[0];
                onProviderChange({
                  ...providerSettings,
                  apiKeySource: nextProvider.nextApiKeySource,
                  providerId: nextProvider.id
                });
              }}
            >
              {providerChoices.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.label} · {provider.authMode === 'manual' ? t('settings.providerManual', '手动密钥') : t('settings.providerGateway', '网关账号')}
                </option>
              ))}
            </select>
          </label>
          <span>{t('settings.key', '密钥')}</span>
          <div className="providerChoiceGrid" role="group" aria-label={t('settings.providerFamily', '接口类型')}>
            {providerChoices.map((provider) => (
              <button
                type="button"
                className={provider.active ? 'active' : ''}
                key={provider.id}
                onClick={() => onProviderChange({
                  ...providerSettings,
                  apiKeySource: provider.nextApiKeySource,
                  providerId: provider.id
                })}
              >
                <strong>{provider.label}</strong>
                <em>{provider.authMode === 'manual' ? t('settings.providerManual', '手动密钥') : t('settings.providerGateway', '网关账号')}</em>
              </button>
            ))}
          </div>
          <div className="segmentedControl legacyProviderToggle">
            <button
              type="button"
              className={usesGatewayAccount(providerSettings) ? 'active' : ''}
              onClick={() => onProviderChange({ ...providerSettings, apiKeySource: 'gateway', providerId: 'gateway-account' })}
            >
              Gateway
            </button>
            <button
              type="button"
              className={providerSettings.apiKeySource === 'manual' ? 'active' : ''}
              onClick={() => onProviderChange({ ...providerSettings, apiKeySource: 'manual', providerId: 'openai-compatible' })}
            >
              {t('settings.custom', '自定义')}
            </button>
          </div>
        </div>

        <div className="providerSummary">
          <span>{t('settings.provider', 'Provider')}</span>
          <strong>{currentProvider?.label || providerSettings.providerId || 'Gateway Account'}</strong>
          <em>{currentProvider?.authMode === 'manual' ? t('settings.providerManual', '手动密钥') : t('settings.providerGateway', '网关账号')}</em>
          <small>{providerCapabilityText || t('settings.providerCompatible', 'OpenAI 兼容接口')}</small>
        </div>

        {usesGatewayAccount(providerSettings) ? (
          <div className="keyList">
            {isAuthenticated ? keys.map((item) => (
              <button type="button" className={item.id === apiKey?.id ? 'active' : ''} key={item.id} onClick={() => onSelectKey(item)}>
                <KeyRound size={16} />
                <span>{item.name}</span>
                <em>{apiKeyDisplay(item)} · {apiKeyMeta(item)}</em>
              </button>
            )) : (
              <button type="button" className="loginInlineButton" onClick={onLogin}>
                <KeyRound size={16} />
                {t('settings.login', '登录')}
              </button>
            )}
            {isAuthenticated && !keys.length ? (
              <div className="settingsEmpty">{t('settings.noKey', '暂无可用 Key')}</div>
            ) : null}
          </div>
        ) : (
          <div className="manualFields">
            <label>
              <span>{t('settings.gateway', '接口地址')}</span>
              <input
                value={providerSettings.manualGatewayBaseUrl}
                onChange={(event) => onProviderChange({ ...providerSettings, manualGatewayBaseUrl: event.target.value })}
                placeholder={getConfiguredBaseUrls().gatewayBaseUrl}
              />
            </label>
            <label>
              <span>{t('settings.key', '密钥')}</span>
              <input
                type="password"
                value={providerSettings.manualApiKey}
                onChange={(event) => onProviderChange({ ...providerSettings, manualApiKey: event.target.value })}
                placeholder="sk-..."
              />
            </label>
          </div>
        )}

        <div className="manualFields">
          <p className="settingsHint">{t('settings.hint', '接口会自动选择：普通生图走 /v1/images/generations；参考图编辑和 Mask 走 /v1/images/edits。助手模型只用于底部提示词优化，会消耗当前 Key 额度。')}</p>
          <div className="settingsCallConfig">
            <div className="settingsCallConfigHead">
              <strong>{t('settings.modelCallSettings', '模型调用设置')}</strong>
              <span>{t('settings.modelCallHint', '为生图、编辑、视频和提示词助手预留不同模型；例如 nano-banana、gpt-image-2、veo3。')}</span>
            </div>
            <div className="settingsCallGrid">
              <label>
                <span>{t('settings.imageGenerationModel', '生图模型')}</span>
                <input value={providerSettings.imageGenerationModel || ''} onChange={(event) => onProviderChange({ ...providerSettings, imageGenerationModel: event.target.value })} placeholder="gpt-image-2 / nano-banana" />
              </label>
              <label>
                <span>{t('settings.imageEditModel', '编辑 / Mask 模型')}</span>
                <input value={providerSettings.imageEditModel || ''} onChange={(event) => onProviderChange({ ...providerSettings, imageEditModel: event.target.value })} placeholder={providerSettings.imageGenerationModel || 'gpt-image-2'} />
              </label>
              <label>
                <span>{t('settings.videoModel', '视频模型')}</span>
                <input value={providerSettings.videoModel || ''} onChange={(event) => onProviderChange({ ...providerSettings, videoModel: event.target.value })} placeholder="veo3 / kling / runway" />
              </label>
              <label>
                <span>{t('settings.videoGateway', '视频接口 URL')}</span>
                <input value={providerSettings.videoGatewayBaseUrl || ''} onChange={(event) => onProviderChange({ ...providerSettings, videoGatewayBaseUrl: event.target.value })} placeholder={providerSettings.manualGatewayBaseUrl || getConfiguredBaseUrls().gatewayBaseUrl} />
              </label>
            </div>
          </div>
          <div className={`settingsModelSync ${modelsStatus}`}>
            <span>{modelSyncLabel}</span>
            <em>{modelSyncMeta}</em>
            <small>{t('settings.modelsProviderHint', '兼容 OpenAI / NewAPI 风格的上游；后续可继续扩展为多 Provider 调用策略。')}</small>
          </div>
          <label>
            <span>{t('settings.assistantModel', '助手模型')}</span>
            <input
              value={providerSettings.responsesModel}
              onChange={(event) => onProviderChange({ ...providerSettings, responsesModel: event.target.value })}
            />
          </label>
          <label>
            <span>{t('settings.previewFrames', '预览帧')}</span>
            <input
              type="number"
              min="0"
              max="3"
              value={providerSettings.partialImages}
              onChange={(event) => onProviderChange({ ...providerSettings, partialImages: event.target.value })}
            />
          </label>
        </div>

        <div className="settingsActions">
          <button type="button" onClick={() => onProviderChange({
            ...providerSettings,
            manualApiKey: '',
            manualGatewayBaseUrl: '',
            apiKeySource: gatewayAccountDisabled ? 'manual' : 'gateway',
            providerId: gatewayAccountDisabled ? 'openai-compatible' : 'gateway-account'
          })}>
            {t('settings.clear', '清除')}
          </button>
          <button type="button" className="primaryAction" onClick={onClose}>{t('settings.done', '完成')}</button>
        </div>
      </section>
    </div>
  );
}

function StudioApp() {
  const initialCurrentSession = useMemo(() => loadCurrentSession(), []);
  const [siteData, setSiteData] = useState(null);
  const [session, setSession] = useState(() => loadSession());
  const [profile, setProfile] = useState(() => loadSession()?.user || null);
  const [providerSettings, setProviderSettings] = useState(() => loadProviderSettings());
  const [client, setClient] = useState(() => new AiGatewayClient({ session: loadSession(), providerSettings: loadProviderSettings() }));
  const [apiKey, setApiKey] = useState(null);
  const [keys, setKeys] = useState([]);
  const [selectedCase, setSelectedCase] = useState(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [favoriteTemplates, setFavoriteTemplates] = useState(() => loadTemplateFavorites());
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [bootError, setBootError] = useState('');
  const [historyItems, setHistoryItems] = useState(() => loadHistory());
  const [historyStatus, setHistoryStatus] = useState('idle');
  const [historyNextOffset, setHistoryNextOffset] = useState(null);
  const [historyLoadingMore, setHistoryLoadingMore] = useState(false);
  const [selectedHistory, setSelectedHistory] = useState(null);
  const [modelOptions, setModelOptions] = useState({ image: [], responses: [], video: [] });
  const [modelsStatus, setModelsStatus] = useState('idle');
  const [usageSummary, setUsageSummary] = useState('');
  const [theme, setTheme] = useState(() => loadTheme());
  const [language, setLanguage] = useState(() => loadStudioLanguage());
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [activeWorkspace, setActiveWorkspace] = useState(() => initialCurrentSession?.mode === 'video' ? 'video' : 'image');
  const [appendTemplateRequest, setAppendTemplateRequest] = useState(null);
  const [remoteSession, setRemoteSession] = useState(null);
  const [remoteSessionReady, setRemoteSessionReady] = useState(() => !loadSession()?.accessToken);
  const [currentSessionSnapshot, setCurrentSessionSnapshot] = useState(() => initialCurrentSession);
  const [deskSessionId, setDeskSessionId] = useState(() => initialCurrentSession?.sessionId || `desk-${Date.now()}`);
  const [canvasFocusSignal, setCanvasFocusSignal] = useState(0);
  const sessionSaveRef = useRef({ timer: null, lastPayload: '' });
  const isLibraryLocked = LIBRARY_AUTH_REQUIRED && !session?.accessToken;
  const t = useMemo(() => createTranslator(language), [language]);
  const persistenceKey = session?.accessToken || 'local-workspace';

  function historyScope() {
    return historyScopeFromIdentity(session, profile);
  }

  async function hydrateSession(options = {}) {
    const nextSession = loadSession();
    if (!nextSession?.accessToken) {
      if (!options.keepExisting) {
        setSession(null);
        setProfile(null);
        setApiKey(null);
        setKeys([]);
      }
      return false;
    }

    const nextClient = new AiGatewayClient({ session: nextSession, providerSettings });
    try {
      const nextProfile = await nextClient.profile().catch(() => nextClient.me());
      setClient(nextClient);
      setSession(nextSession);
      setProfile(nextProfile || nextSession.user || null);
      return true;
    } catch {
      if (!options.keepExisting) {
        setSession(null);
        setProfile(null);
        setApiKey(null);
        setKeys([]);
      }
      return false;
    }
  }

  function handleProviderChange(nextSettings) {
    const savedSettings = saveProviderSettings(nextSettings);
    setProviderSettings(savedSettings);
    setClient((current) => {
      current.setProviderSettings(savedSettings);
      return current;
    });
  }

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // Storage is optional; the selected theme still applies for this tab.
    }
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = language;
    document.title = t('app.title', '创作工作台');
    saveStudioLanguage(language);
  }, [language, t]);

  useEffect(() => {
    if (!session?.accessToken) {
      let active = true;
      setSiteData(null);
      loadStaticLibraryData()
        .then((nextSiteData) => {
          if (!active) return;
          setSiteData(nextSiteData);
          setSelectedCase(null);
        })
        .catch(() => {
          if (!active) return;
          setSiteData(EMPTY_SITE_DATA);
          setSelectedCase(null);
        });
      return () => {
        active = false;
      };
    }
    let active = true;
    const libraryClient = new StudioHistoryClient({ session });
    setSiteData(null);
    libraryClient.listLibrary()
      .then((payload) => {
        if (!active) return;
        const nextSiteData = normalizeLibraryPayload(payload);
        if (!nextSiteData.cases.length) {
          return loadStaticLibraryData();
        }
        return nextSiteData;
      })
      .then((nextSiteData) => {
        if (!active) return;
        setSiteData(nextSiteData);
        const savedDraft = loadDraft();
        const cases = nextSiteData.cases || [];
        const draftedCase = savedDraft?.caseId ? cases.find((item) => String(item.id) === String(savedDraft.caseId)) : null;
        setSelectedCase(draftedCase || null);
      })
      .catch((error) => {
        if (!active) return;
        loadStaticLibraryData()
          .then((nextSiteData) => {
            if (!active) return;
            setSiteData(nextSiteData);
            setBootError('');
          })
          .catch(() => {
            if (!active) return;
            setSiteData(EMPTY_SITE_DATA);
            setBootError(error.message);
          });
      });
    return () => {
      active = false;
    };
  }, [session?.accessToken]);

  useEffect(() => {
    hydrateSession({ keepExisting: true });

    const sync = () => hydrateSession({ keepExisting: true });
    window.addEventListener('focus', sync);
    window.addEventListener('storage', sync);
    document.addEventListener('visibilitychange', sync);
    return () => {
      window.removeEventListener('focus', sync);
      window.removeEventListener('storage', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, []);

  useEffect(() => {
    if (!session?.accessToken) return;
    let active = true;
    const nextClient = new AiGatewayClient({ session, providerSettings });
    setClient(nextClient);
    Promise.all([
      nextClient.profile().catch(() => nextClient.me()),
      nextClient.ensureApiKey(),
      nextClient.listKeys().catch(() => [])
    ]).then(([nextProfile, nextKey, nextKeys]) => {
      if (!active) return;
      setProfile(nextProfile);
      setApiKey(nextKey);
      setKeys(nextKeys.length ? nextKeys : nextKey ? [nextKey] : []);
    }).catch((error) => {
      if (!active) return;
      setBootError(error.message);
    });
    return () => {
      active = false;
    };
  }, [session?.accessToken]);

  useEffect(() => {
    const providerRequest = resolveProviderRequest(providerSettings, apiKey);
    if (!providerRequest.apiKey) {
      setModelOptions({ image: [], responses: [], video: [] });
      setModelsStatus('idle');
      setUsageSummary('');
      return;
    }

    const controller = new AbortController();
    const nextClient = new AiGatewayClient({ session, providerSettings });
    setModelsStatus('loading');
      nextClient.listGatewayModels({ ...providerRequest, signal: controller.signal })
      .then((models) => {
        const image = models.filter(modelLooksLikeImage);
        const video = models.filter(modelMatchesVideo);
        setModelOptions({
          image: image.length ? image : [],
          responses: models,
          video
        });
        setModelsStatus('ready');
      })
      .catch((error) => {
        if (error?.name === 'AbortError') return;
        setModelOptions({ image: [], responses: [], video: [] });
        setModelsStatus('fallback');
      });

    nextClient.getGatewayUsage({ ...providerRequest, signal: controller.signal })
      .then((usage) => {
        const parts = [];
        const total = usage?.total || usage?.total_usage || usage?.used || usage?.amount || usage?.cost;
        const requests = usage?.requests || usage?.request_count || usage?.count;
        if (total !== undefined) parts.push(`已用 ${formatUsageValue(total)}`);
        if (requests !== undefined) parts.push(`${formatUsageValue(requests)} 次`);
        setUsageSummary(parts.join('，') || '后台未返回消费汇总');
      })
      .catch((error) => {
        if (error?.name === 'AbortError') return;
        setUsageSummary('后台未开放消费接口');
      });

    return () => controller.abort();
  }, [
    providerSettings.providerId,
    providerSettings.apiKeySource,
    providerSettings.manualApiKey,
    providerSettings.manualGatewayBaseUrl,
    apiKey?.key,
    session?.accessToken
  ]);

  useEffect(() => {
    let active = true;
    const historyClient = new StudioHistoryClient({ session });
    const scope = historyScope();
    setHistoryStatus('loading');
    setHistoryNextOffset(null);
    Promise.all([
      historyClient.listRecords({ limit: HISTORY_PAGE_SIZE }),
      loadPersistedHistory(scope)
    ])
      .then(([{ records, nextOffset }, localRecords]) => {
        if (!active) return;
        const merged = mergeHistoryRecords(records, localRecords);
        setHistoryItems(merged);
        saveHistory(merged, scope);
        setHistoryNextOffset(nextOffset);
        setHistoryStatus('synced');
      })
      .catch(async () => {
        if (!active) return;
        const localRecords = await loadPersistedHistory(scope);
        if (!active) return;
        setHistoryItems(localRecords);
        setHistoryStatus(localRecords.length ? 'local' : 'idle');
      });
    return () => {
      active = false;
    };
  }, [persistenceKey, profile?.id, profile?.email, profile?.username]);

  function handleLoadMoreHistory() {
    if (historyNextOffset === null || historyLoadingMore) return;
    const historyClient = new StudioHistoryClient({ session });
    const scope = historyScope();
    setHistoryLoadingMore(true);
    historyClient.listRecords({ limit: HISTORY_PAGE_SIZE, offset: historyNextOffset })
      .then(({ records, nextOffset }) => {
        const merged = mergeHistoryRecords(records, historyItems);
        setHistoryItems(merged);
        saveHistory(merged, scope);
        setHistoryNextOffset(nextOffset);
        setHistoryStatus('synced');
      })
      .catch(() => setHistoryStatus(historyItems.length ? 'local' : 'idle'))
      .finally(() => setHistoryLoadingMore(false));
  }

  useEffect(() => {
    let active = true;
    setRemoteSessionReady(false);
    const historyClient = new StudioHistoryClient({ session });
    historyClient.getCurrentSession()
      .then((snapshot) => snapshot ? historyClient.resolveSessionAssets(snapshot) : null)
      .then((snapshot) => {
        if (!active) return;
        if (snapshot) {
          const remoteSnapshot = { ...snapshot, sessionId: snapshot.sessionId || deskSessionId };
          const localSnapshot = loadCurrentSession();
          const remoteUpdated = Date.parse(remoteSnapshot.updatedAt || '') || 0;
          const localUpdated = Date.parse(localSnapshot?.updatedAt || '') || 0;
          if (localUpdated && localUpdated > remoteUpdated && hasMeaningfulSessionContent(localSnapshot)) {
            setCurrentSessionSnapshot(localSnapshot);
          } else {
            const sessionSnapshot = saveCurrentSession(remoteSnapshot);
            setCurrentSessionSnapshot(sessionSnapshot);
          }
        }
        setRemoteSession(snapshot);
        setRemoteSessionReady(true);
      })
      .catch(() => {
        if (!active) return;
        setRemoteSession(null);
        setRemoteSessionReady(true);
      });
    return () => {
      active = false;
    };
  }, [persistenceKey, profile?.id, profile?.email, profile?.username]);

  const categoryGroups = useMemo(() => buildCategoryGroups(siteData?.cases || []), [siteData]);
  const visibleCases = useMemo(() => {
    const source = orderTemplates(siteData?.cases || []);
    const needle = query.trim().toLowerCase();
    return source.filter((item) => {
      const matchesCategory = category === 'All' || item.category === category;
      const matchesQuery = !needle || `${item.title} ${categoryLabel(item.category)} ${item.sourceLabel} ${item.sourceName} ${item.promptPreview}`.toLowerCase().includes(needle);
      const matchesFavorite = !showFavoritesOnly || favoriteTemplates.has(templateKey(item));
      return matchesCategory && matchesQuery && matchesFavorite;
    });
  }, [siteData, query, category, favoriteTemplates, showFavoritesOnly]);

  const filteredHistoryItems = useMemo(() => {
    if (activeWorkspace === 'image') return historyItems.filter((item) => item.mode !== 'video' && item.kind !== 'video');
    if (activeWorkspace === 'video') return historyItems.filter((item) => item.mode === 'video' || item.kind === 'video');
    return historyItems;
  }, [historyItems, activeWorkspace]);
  const workspaceIsDesk = activeWorkspace === 'image' || activeWorkspace === 'video';
  const currentProject = useMemo(
    () => currentSessionProject(currentSessionSnapshot || remoteSession, CURRENT_PROJECT_QUEUE_STATUSES),
    [currentSessionSnapshot, remoteSession]
  );

  function handleWorkspaceChange(nextWorkspace, options = {}) {
    setSettingsOpen(false);
    setActiveWorkspace(nextWorkspace);
    setQuery('');
    setCategory('All');
    if (nextWorkspace !== 'history' && !options.preserveHistory) {
      setSelectedHistory(null);
    }
    setSelectedCase((current) => {
      if (!current) return current;
      if (nextWorkspace === 'video') return current.kind === 'video-inspiration' ? current : null;
      if (nextWorkspace === 'image') return current.kind === 'video-inspiration' ? null : current;
      return current;
    });
  }

  function handleNewSession() {
    if (sessionSaveRef.current.timer) {
      window.clearTimeout(sessionSaveRef.current.timer);
      sessionSaveRef.current.timer = null;
    }
    sessionSaveRef.current.lastPayload = '';
    clearDraft();
    clearCurrentSessionCache();
    setCurrentSessionSnapshot(null);
    setRemoteSession(null);
    setSelectedCase(null);
    setSelectedHistory(null);
    setAppendTemplateRequest(null);
    setQuery('');
    setCategory('All');
    setActiveWorkspace('image');
    setDeskSessionId(`desk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    const latestSession = loadSession() || session;
    const historyClient = new StudioHistoryClient({ session: latestSession });
    historyClient.clearCurrentSession().catch(() => {});
  }

  async function refreshProfile() {
    if (!client || !session?.accessToken) return;
    const nextProfile = await client.profile().catch(() => profile);
    setProfile(nextProfile);
  }

  async function handleRequireLogin() {
    const ready = await hydrateSession();
    if (ready) return;
    window.location.href = getLoginUrl();
  }

  function handleLogout() {
    clearSession();
    setSession(null);
    setProfile(null);
    setApiKey(null);
    setKeys([]);
    setSiteData(EMPTY_SITE_DATA);
    setSelectedCase(null);
    setSelectedHistory(null);
    setHistoryItems(loadHistory('guest'));
    setHistoryStatus('idle');
    setModelOptions({ image: [], responses: [], video: [] });
    setModelsStatus('idle');
    setUsageSummary('');
  }

  function handleSelectKey(nextKey) {
    saveSelectedKeyId(nextKey.id);
    setApiKey(nextKey);
  }

  function handleLanguageToggle() {
    setLanguage((current) => nextLanguage(current));
  }

  function handleSelectCase(item) {
    setSelectedHistory(null);
    setSelectedCase(item);
  }

  async function handleAppendTemplate(item) {
    setSelectedHistory(null);
    const resolved = await resolveLibraryCase(item, { updateSelection: false }).catch(() => item);
    const nextPrompt = resolved?.prompt || resolved?.promptPreview || item?.prompt || item?.promptPreview || item?.summary || '';
    if (!nextPrompt) return;
    setSelectedCase(resolved || item);
    setActiveWorkspace((resolved || item)?.kind === 'video-inspiration' ? 'video' : 'image');
    setAppendTemplateRequest({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      prompt: nextPrompt
    });
  }

  function handleToggleTemplateFavorite(item) {
    const key = templateKey(item);
    if (!key) return;
    setFavoriteTemplates((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      saveTemplateFavorites(next);
      return next;
    });
  }

  async function resolveLibraryCase(item, options = {}) {
    const updateSelection = options.updateSelection !== false;
    if (!session?.accessToken || item?.prompt || item?.staticLibrary) return item;
    const historyClient = new StudioHistoryClient({ session });
    if (item?.kind === 'video-inspiration') {
      const resolvedInspiration = await historyClient.getVideoInspiration(item.id);
      if (!resolvedInspiration) return item;
      const nextCase = { ...item, ...resolvedInspiration };
      setSiteData((current) => {
        if (!current?.videoInspirations) return current;
        return {
          ...current,
          videoInspirations: current.videoInspirations.map((inspiration) => String(inspiration.id) === String(nextCase.id) ? nextCase : inspiration)
        };
      });
      if (updateSelection) {
        setSelectedCase((current) => (current && String(current.id) === String(nextCase.id) ? nextCase : current));
      }
      return nextCase;
    }
    const resolvedCase = await historyClient.getLibraryCase(item.id);
    if (!resolvedCase) return item;
    const nextCase = { ...item, ...resolvedCase };
    setSiteData((current) => {
      if (!current?.cases) return current;
      return {
        ...current,
        cases: current.cases.map((caseItem) => String(caseItem.id) === String(nextCase.id) ? nextCase : caseItem)
      };
    });
    if (updateSelection) {
      setSelectedCase((current) => (current && String(current.id) === String(nextCase.id) ? nextCase : current));
    }
    return nextCase;
  }

function handleSelectHistory(item, options = {}) {
    const { openWorkspace = true } = options;
    const cases = siteData?.cases || [];
    const matchedCase = item.case?.id ? cases.find((caseItem) => caseItem.id === item.case.id) : null;
    setSelectedCase(matchedCase || item.case || null);
    setSelectedHistory(item);
    if (openWorkspace) {
      setActiveWorkspace(item.mode === 'video' || item.kind === 'video' ? 'video' : 'image');
    }
  }

  function handleHistoryAdd(item) {
    setSelectedHistory(null);
    const normalizedItem = { ...item, sessionId: item.sessionId || deskSessionId };
    setHistoryItems((current) => {
      const nextItems = [normalizedItem, ...current.filter((historyItem) => historyItem.id !== normalizedItem.id)].slice(0, LOCAL_HISTORY_LIMIT);
      saveHistory(nextItems, historyScope());
      return nextItems;
    });
    const latestSession = loadSession() || session;
    if (latestSession?.accessToken) setSession(latestSession);
    const historyClient = new StudioHistoryClient({ session: latestSession });
    historyClient.saveRecord(normalizedItem)
      .then((savedRecord) => historyClient.resolveRecordAssets(savedRecord))
      .then((savedRecord) => {
        setHistoryItems((current) => {
          const nextItems = mergeHistoryRecords([savedRecord], current.filter((historyItem) => historyItem.id !== normalizedItem.id && historyItem.id !== savedRecord.id));
          saveHistory(nextItems, historyScopeFromIdentity(latestSession, profile));
          return nextItems;
        });
        setHistoryStatus('synced');
      })
      .catch(() => setHistoryStatus('local'));
  }

  function handleSessionSnapshot(snapshot) {
    setCurrentSessionSnapshot(snapshot);
    if (!remoteSessionReady) return;
    const latestSession = loadSession() || session;
    const payload = prepareCurrentSessionForServer(snapshot);
    if (!payload) return;
    const encoded = sessionSnapshotComparePayload(snapshot);
    if (sessionSaveRef.current.lastPayload === encoded) return;
    sessionSaveRef.current.lastPayload = encoded;
    if (sessionSaveRef.current.timer) window.clearTimeout(sessionSaveRef.current.timer);
    sessionSaveRef.current.timer = window.setTimeout(() => {
      const historyClient = new StudioHistoryClient({ session: latestSession });
      historyClient.saveCurrentSession(payload)
        .then((savedSession) => {
          setRemoteSession((current) => {
            const currentUpdated = Date.parse(current?.updatedAt || '') || 0;
            const savedUpdated = Date.parse(savedSession?.updatedAt || '') || 0;
            return savedUpdated >= currentUpdated ? savedSession : current;
          });
        })
        .catch(() => {
          sessionSaveRef.current.lastPayload = '';
        });
    }, 800);
  }

  function handleDeleteHistory(recordId) {
    if (recordId && typeof recordId === 'object') {
      const recordIds = recordId.recordIds || [recordId.id];
      recordIds.forEach((id) => handleDeleteHistory(id));
      return;
    }
    setHistoryItems((current) => {
      const nextItems = current.filter((item) => item.id !== recordId);
      saveHistory(nextItems, historyScope());
      return nextItems;
    });
    deletePersistedHistory(recordId, historyScope());
    if (selectedHistory?.id === recordId || selectedHistory?.sessionId === recordId || selectedHistory?.recordIds?.includes?.(recordId)) setSelectedHistory(null);
    const latestSession = loadSession() || session;
    const historyClient = new StudioHistoryClient({ session: latestSession });
    historyClient.deleteRecord(recordId).catch(() => setHistoryStatus('local'));
  }

  function handleClearHistory() {
    const scope = historyScope();
    saveHistory([], scope);
    clearPersistedHistory(scope);
    setHistoryItems([]);
    setSelectedHistory(null);
    const latestSession = loadSession() || session;
    const historyClient = new StudioHistoryClient({ session: latestSession });
    historyClient.clearRecords().catch(() => setHistoryStatus('local'));
  }

  if (bootError && !siteData) {
    return <main className="studioError">加载失败：{bootError}</main>;
  }

  return (
    <main>
      {isLibraryLocked ? (
        <div className="libraryLockNotice">
          <KeyRound size={15} />
          <span>{t('lock.protected', '受保护素材登录后加载，公开模板可继续使用。')}</span>
          <button type="button" onClick={handleRequireLogin}>{t('topbar.login', '登录')}</button>
        </div>
      ) : null}
      <Topbar
        profile={profile}
        apiKey={apiKey}
        providerSettings={providerSettings}
        isAuthenticated={Boolean(session?.accessToken)}
        activeWorkspace={activeWorkspace}
        onWorkspaceChange={handleWorkspaceChange}
        t={t}
        theme={theme}
        onLogin={handleRequireLogin}
        onLogout={handleLogout}
        onOpenSettings={() => setSettingsOpen(true)}
        onThemeToggle={() => setTheme((value) => (value === 'dark' ? 'light' : 'dark'))}
      />
      <div className={`studioLayout ${railCollapsed ? 'railCollapsed' : ''}`}>
        <LeftRail
          activeWorkspace={activeWorkspace}
          onWorkspaceChange={handleWorkspaceChange}
          onNewSession={handleNewSession}
          accountLabel={Boolean(session?.accessToken) ? (profile?.email || profile?.username || t('rail.loggedIn', '已登录用户')) : t('rail.notLoggedIn', '未登录')}
          accountDetail={Boolean(session?.accessToken) ? (apiKeyDisplay(apiKey) || t('rail.hiddenKey', 'Key 已隐藏')) : t('rail.chooseKey', '选择 Key')}
          onOpenSettings={() => setSettingsOpen(true)}
          theme={theme}
          onThemeToggle={() => setTheme((value) => (value === 'dark' ? 'light' : 'dark'))}
          currentLanguage={SUPPORTED_LANGUAGES.find((item) => item.value === language) || SUPPORTED_LANGUAGES[0]}
          onLanguageToggle={handleLanguageToggle}
          t={t}
          currentProject={currentProject}
          historyItems={historyItems}
          selectedHistoryId={selectedHistory?.id}
          onSelectHistory={handleSelectHistory}
          onDeleteHistory={handleDeleteHistory}
          onFocusCurrentProject={() => setCanvasFocusSignal((value) => value + 1)}
          collapsed={railCollapsed}
          onToggleCollapse={() => setRailCollapsed((value) => !value)}
        />
        {workspaceIsDesk ? (
          <CreationDesk
            key={deskSessionId}
            sessionId={deskSessionId}
            activeWorkspace={activeWorkspace}
            selectedCase={selectedCase}
            selectedHistory={selectedHistory}
            onResolveCase={resolveLibraryCase}
            apiKey={apiKey}
            client={client}
            providerSettings={providerSettings}
            onProviderChange={handleProviderChange}
            modelOptions={modelOptions}
            modelsStatus={modelsStatus}
            usageSummary={usageSummary}
            isAuthenticated={Boolean(session?.accessToken)}
            onRequireLogin={handleRequireLogin}
            onOpenSettings={() => setSettingsOpen(true)}
            onProfileRefresh={refreshProfile}
            onHistoryAdd={handleHistoryAdd}
            remoteSession={remoteSession}
            remoteSessionReady={remoteSessionReady}
            persistenceKey={persistenceKey}
            onSessionSnapshot={handleSessionSnapshot}
            promptPresets={siteData?.promptPresets || PROMPT_PRESETS}
            appendTemplateRequest={appendTemplateRequest}
            onAppendTemplateConsumed={(requestId) => {
              setAppendTemplateRequest((current) => current?.id === requestId ? null : current);
            }}
            onOpenWorkspace={(workspace) => handleWorkspaceChange(workspace, { preserveHistory: true })}
            focusSignal={canvasFocusSignal}
            t={t}
          />
        ) : activeWorkspace === 'inspiration' ? (
          <GalleryWorkspacePanel
            type="inspiration"
            cases={visibleCases}
            categoryGroups={categoryGroups}
            selected={selectedCase}
            onSelect={handleSelectCase}
            query={query}
            setQuery={setQuery}
            category={category}
            setCategory={setCategory}
            totalCaseCount={siteData?.cases?.length || 0}
            loading={!siteData}
            videoInspirations={siteData?.videoInspirations || FALLBACK_VIDEO_INSPIRATIONS}
            historyItems={filteredHistoryItems}
            historyStatus={historyStatus}
            historyHasMore={historyNextOffset !== null}
            historyLoadingMore={historyLoadingMore}
            selectedHistoryId={selectedHistory?.id}
            onSelectHistory={handleSelectHistory}
            onDeleteHistory={handleDeleteHistory}
            onClearHistory={handleClearHistory}
            onLoadMoreHistory={handleLoadMoreHistory}
            favoriteTemplates={favoriteTemplates}
            showFavoritesOnly={showFavoritesOnly}
            onToggleFavoritesOnly={() => setShowFavoritesOnly((value) => !value)}
            onToggleTemplateFavorite={handleToggleTemplateFavorite}
            onAppendTemplate={handleAppendTemplate}
            licenseNotice={siteData?.license}
            onOpenWorkspace={(workspace) => handleWorkspaceChange(workspace, { preserveHistory: true })}
            t={t}
          />
        ) : (
          <GalleryWorkspacePanel
            type="history"
            cases={visibleCases}
            categoryGroups={categoryGroups}
            selected={selectedCase}
            onSelect={handleSelectCase}
            query={query}
            setQuery={setQuery}
            category={category}
            setCategory={setCategory}
            totalCaseCount={siteData?.cases?.length || 0}
            loading={!siteData}
            videoInspirations={siteData?.videoInspirations || FALLBACK_VIDEO_INSPIRATIONS}
            historyItems={filteredHistoryItems}
            historyStatus={historyStatus}
            historyHasMore={historyNextOffset !== null}
            historyLoadingMore={historyLoadingMore}
            selectedHistoryId={selectedHistory?.id}
            onSelectHistory={(item) => handleSelectHistory(item, { openWorkspace: false })}
            onDeleteHistory={handleDeleteHistory}
            onClearHistory={handleClearHistory}
            onLoadMoreHistory={handleLoadMoreHistory}
            favoriteTemplates={favoriteTemplates}
            showFavoritesOnly={showFavoritesOnly}
            onToggleFavoritesOnly={() => setShowFavoritesOnly((value) => !value)}
            onToggleTemplateFavorite={handleToggleTemplateFavorite}
            onAppendTemplate={handleAppendTemplate}
            licenseNotice={siteData?.license}
            onOpenWorkspace={(workspace) => handleWorkspaceChange(workspace, { preserveHistory: true })}
            t={t}
          />
        )}
      </div>
      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        apiKey={apiKey}
        keys={keys}
        onSelectKey={handleSelectKey}
        providerSettings={providerSettings}
        onProviderChange={handleProviderChange}
        modelOptions={modelOptions}
        modelsStatus={modelsStatus}
        isAuthenticated={Boolean(session?.accessToken)}
        onLogin={handleRequireLogin}
        t={t}
      />
    </main>
  );
}

createRoot(document.getElementById('studio-root')).render(<StudioApp />);
