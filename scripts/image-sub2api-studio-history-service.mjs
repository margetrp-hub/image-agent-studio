import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Agent, FormData as UndiciFormData, fetch as undiciFetch } from 'undici';
import { createCommunityPromptStore, sanitizeCommunityPrompt } from './studio-service/communityPrompts.js';
import { atomicWriteJson, parseJsonText } from './studio-service/jsonFiles.js';
import { text } from './studio-service/text.js';
import { createUserBackupService } from './studio-service/userBackup.js';
import { createUserStorage } from './studio-service/userStorage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || process.env.STUDIO_HISTORY_PORT || 8787);
const HOST = process.env.HOST || process.env.STUDIO_HISTORY_HOST || '127.0.0.1';
const DATA_DIR = path.resolve(process.env.STUDIO_DATA_DIR || path.join(__dirname, '..', '.image-sub2api-studio-data'));
const LIBRARY_DIR = path.resolve(process.env.STUDIO_LIBRARY_DIR || path.join(__dirname, '..', 'data'));
const LIBRARY_ASSET_DIR = path.resolve(process.env.STUDIO_LIBRARY_ASSET_DIR || path.join(LIBRARY_DIR, 'images'));
const AUTH_MODE = String(process.env.STUDIO_AUTH_MODE || 'gateway').toLowerCase();
const AI_GATEWAY_BASE_URL = String(process.env.AI_GATEWAY_BASE_URL || process.env.SUB2API_BASE_URL || 'http://127.0.0.1:8080').replace(/\/+$/, '');
const HISTORY_LIMIT = Number(process.env.STUDIO_HISTORY_LIMIT || 200);
const SESSION_NODE_LIMIT = Number(process.env.STUDIO_SESSION_NODE_LIMIT || 80);
const SESSION_URL_LIMIT = Number(process.env.STUDIO_SESSION_URL_LIMIT || 24);
const SESSION_QUEUE_LIMIT = Number(process.env.STUDIO_SESSION_QUEUE_LIMIT || 12);
const SESSION_MESSAGE_LIMIT = Number(process.env.STUDIO_SESSION_MESSAGE_LIMIT || 24);
const SESSION_ASSET_PREFIX = 'session-';
const JOB_LIMIT = Number(process.env.STUDIO_JOB_LIMIT || 120);
const JOB_TIMEOUT_MS = Number(process.env.STUDIO_JOB_TIMEOUT_MS || 45 * 60 * 1000);
const GATEWAY_FETCH_TIMEOUT_MS = Number(process.env.STUDIO_GATEWAY_FETCH_TIMEOUT_MS || Math.max(10 * 60 * 1000, JOB_TIMEOUT_MS - 30 * 1000));
const JOB_CONCURRENCY = Math.max(1, Math.min(6, Number(process.env.STUDIO_JOB_CONCURRENCY || 1)));
const JOB_ACTIVE_STATUSES = new Set(['queued', 'dispatching', 'gateway', 'upstream', 'image', 'saving']);
const SERVICE_STARTED_AT = Date.now();
const SERVICE_VERSION = process.env.npm_package_version || process.env.STUDIO_VERSION || '1.0.0';
const MAX_BODY_BYTES = Number(process.env.STUDIO_MAX_BODY_BYTES || 96 * 1024 * 1024);
const MAX_IMAGE_BYTES = Number(process.env.STUDIO_MAX_IMAGE_BYTES || 32 * 1024 * 1024);
const ALLOWED_ORIGINS = String(process.env.STUDIO_ALLOWED_ORIGINS || 'http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:5205,http://localhost:5205,http://127.0.0.1:5174,http://localhost:5174')
  .split(',')
  .map((item) => item.trim().replace(/\/+$/, ''))
  .filter(Boolean);
const LIBRARY_LICENSE = {
  name: '社区提示词模板 · CC BY 4.0',
  spdx: 'CC-BY-4.0',
  url: 'https://creativecommons.org/licenses/by/4.0/',
  notice: '提示词模板内容来自公开社区，遵循 CC BY 4.0 许可证；使用和改编时请保留原作者或来源归属。'
};
const PROMPT_PRESETS = [
  {
    id: 'image-product-poster',
    mode: 'image',
    title: '产品海报',
    prompt: '生成一张高级产品海报：主体清晰居中，保留产品真实结构和材质，使用精致棚拍光线，背景干净，有足够标题留白，整体适合商业投放。',
    tag: 'product'
  },
  {
    id: 'image-social-cover',
    mode: 'image',
    title: '社媒封面',
    prompt: '生成一张社媒封面图：画面有强焦点，版式现代，颜色鲜明但不过度，预留短标题空间，光影精致，适合内容平台、短视频或活动封面。',
    tag: 'social'
  },
  {
    id: 'image-portrait',
    mode: 'image',
    title: '头像写真',
    prompt: '生成一张精修头像写真：保留自然肤质和真实五官，眼神有表达力，背景干净，柔和侧光，气质自信，成片接近高端编辑写真。',
    tag: 'portrait'
  },
  {
    id: 'image-commerce-main',
    mode: 'image',
    title: '电商主图',
    prompt: '生成一张电商主图：保持产品身份不变，提升光线和质感，去除杂乱元素，主体居中清楚，画面适合商城首图展示。',
    tag: 'commerce'
  },
  {
    id: 'video-product-spot',
    mode: 'video',
    title: '产品短片',
    prompt: '生成一段 5 秒产品广告视频：产品保持真实结构和材质，镜头缓慢推进，精致棚拍光线，背景干净，有高级商业感，运动稳定，不要文字水印。'
  },
  {
    id: 'video-cinematic-shot',
    mode: 'video',
    title: '电影镜头',
    prompt: '生成一段电影感视频：主体清晰，浅景深，柔和逆光，镜头缓慢横移，环境有真实空间层次，动作自然，画面稳定。'
  },
  {
    id: 'video-architecture-tour',
    mode: 'video',
    title: '建筑漫游',
    prompt: '生成一段建筑空间漫游视频：镜头沿空间轴线缓慢前进，保持垂直线稳定，展示材质、光线和空间尺度，真实摄影风格。'
  },
  {
    id: 'video-social-motion',
    mode: 'video',
    title: '社媒动态',
    prompt: '生成一段适合短视频封面的动态视频：主体有轻微动作，镜头节奏清晰，色彩干净，第一秒抓人，画面不要出现字幕或水印。'
  }
];
const VIDEO_INSPIRATIONS = [
  {
    id: 'video-product-launch',
    kind: 'video-inspiration',
    title: '产品发布短片',
    intent: '商业广告',
    summary: '棚拍质感，镜头推近，突出材质和卖点。',
    prompt: '生成一段 5 秒产品发布短片：产品保持真实结构和材质，镜头从中景缓慢推近到细节特写，背景干净，灯光有高级棚拍质感，画面稳定，不出现字幕、水印或变形。',
    videoAspect: '16:9',
    videoDuration: 5,
    videoFps: 24,
    videoMotion: 'push_in',
    videoStyle: 'product_ad',
    videoQuality: 'high',
    negativePrompt: '文字、水印、畸变、产品结构变化、手指遮挡'
  },
  {
    id: 'video-social-hook',
    kind: 'video-inspiration',
    title: '社媒开场钩子',
    intent: '短视频封面',
    summary: '第一秒有动作，竖屏抓人，适合社媒投放。',
    prompt: '生成一段适合社媒开场的 5 秒竖屏视频：主体在第一秒有清晰动作，镜头轻微前推，色彩干净，节奏明确，画面有封面感，不出现字幕或平台水印。',
    videoAspect: '9:16',
    videoDuration: 5,
    videoFps: 24,
    videoMotion: 'push_in',
    videoStyle: 'realistic',
    videoQuality: 'standard',
    negativePrompt: '字幕、水印、过度闪烁、脸部变形、背景穿帮'
  },
  {
    id: 'video-architecture-walkthrough',
    kind: 'video-inspiration',
    title: '建筑空间漫游',
    intent: '空间展示',
    summary: '沿空间轴线前进，展示材质、光线和尺度。',
    prompt: '生成一段建筑空间漫游视频：镜头沿空间轴线缓慢前进，保持垂直线稳定，展示墙面材质、自然光线和空间尺度，真实摄影风格，运动顺滑。',
    videoAspect: '16:9',
    videoDuration: 10,
    videoFps: 24,
    videoMotion: 'push_in',
    videoStyle: 'realistic',
    videoQuality: 'high',
    negativePrompt: '透视扭曲、墙体变形、漂浮家具、文字水印'
  },
  {
    id: 'video-cinematic-portrait',
    kind: 'video-inspiration',
    title: '电影感人物镜头',
    intent: '人物氛围',
    summary: '浅景深、逆光、轻微横移，突出情绪。',
    prompt: '生成一段电影感人物视频：主体表情自然，浅景深，柔和逆光，镜头缓慢横移，背景有真实空间层次，动作克制，画面稳定，有胶片质感。',
    videoAspect: '16:9',
    videoDuration: 5,
    videoFps: 24,
    videoMotion: 'pan',
    videoStyle: 'cinematic',
    videoQuality: 'high',
    negativePrompt: '脸部变形、多余手指、眼神漂移、字幕、水印'
  },
  {
    id: 'video-ui-flow',
    kind: 'video-inspiration',
    title: '界面操作演示',
    intent: '产品功能',
    summary: '干净界面，模拟点击和状态切换。',
    prompt: '生成一段产品界面操作演示视频：界面清晰，镜头固定，按钮和面板状态自然切换，动效克制，像真实软件录屏的高级演示，不出现多余文字或水印。',
    videoAspect: '16:9',
    videoDuration: 5,
    videoFps: 30,
    videoMotion: 'static',
    videoStyle: 'product_ad',
    videoQuality: 'standard',
    negativePrompt: '乱码文字、错位界面、闪烁、鼠标变形、水印'
  },
  {
    id: 'video-food-closeup',
    kind: 'video-inspiration',
    title: '美食细节特写',
    intent: '餐饮内容',
    summary: '微距、热气、材质流动，适合菜单宣传。',
    prompt: '生成一段美食微距特写视频：镜头缓慢推近，能看到食物表面质感、热气和轻微流动，光线温暖自然，背景简洁，画面真实诱人。',
    videoAspect: '9:16',
    videoDuration: 5,
    videoFps: 24,
    videoMotion: 'push_in',
    videoStyle: 'realistic',
    videoQuality: 'high',
    negativePrompt: '过度油腻、食物变形、文字、水印、餐具穿模'
  },
  {
    id: 'video-fashion-turntable',
    kind: 'video-inspiration',
    title: '服饰环绕展示',
    intent: '电商种草',
    summary: '人物或单品环绕，展示轮廓和材质。',
    prompt: '生成一段服饰环绕展示视频：主体保持稳定，镜头轻微环绕，展示衣料质感、廓形和细节，光线干净，动作自然，适合电商和种草短片。',
    videoAspect: '9:16',
    videoDuration: 5,
    videoFps: 24,
    videoMotion: 'orbit',
    videoStyle: 'realistic',
    videoQuality: 'standard',
    negativePrompt: '肢体变形、衣服融化、图案漂移、文字水印'
  },
  {
    id: 'video-animation-mascot',
    kind: 'video-inspiration',
    title: '角色动画循环',
    intent: 'IP角色',
    summary: '轻动作循环，适合品牌角色和表情包。',
    prompt: '生成一段角色动画循环视频：角色保持一致，做一个轻微挥手或点头动作，动作可循环，背景简洁，表情友好，画面干净，不出现字幕或水印。',
    videoAspect: '1:1',
    videoDuration: 5,
    videoFps: 24,
    videoMotion: 'static',
    videoStyle: 'animation',
    videoQuality: 'standard',
    negativePrompt: '角色漂移、五官变化、肢体断裂、文字、水印'
  },
  {
    id: 'video-event-kv-motion',
    kind: 'video-inspiration',
    title: '活动主视觉动态化',
    intent: '营销物料',
    summary: '把主视觉做成轻动态，适合投屏和社媒。',
    prompt: '生成一段活动主视觉动态视频：保留主视觉主体，背景元素轻微漂移，光影有层次，镜头缓慢拉远，适合大屏和社媒投放，不出现额外文字或水印。',
    videoAspect: '16:9',
    videoDuration: 5,
    videoFps: 24,
    videoMotion: 'pull_out',
    videoStyle: 'cinematic',
    videoQuality: 'standard',
    negativePrompt: '文字错乱、主体变形、过度粒子、水印'
  },
  {
    id: 'video-scene-establishing',
    kind: 'video-inspiration',
    title: '场景建立镜头',
    intent: '故事开场',
    summary: '从环境到主体，建立氛围和叙事空间。',
    prompt: '生成一段故事开场的场景建立镜头：镜头从环境缓慢移动到主体，空间层次清楚，光线自然，有电影感，动作克制，适合作为短片第一镜。',
    videoAspect: '16:9',
    videoDuration: 10,
    videoFps: 24,
    videoMotion: 'pan',
    videoStyle: 'cinematic',
    videoQuality: 'high',
    negativePrompt: '镜头抖动、主体消失、空间变形、字幕、水印'
  }
];

const jobQueues = new Map();
const activeJobControllers = new Map();
const jobStorageLocks = new Map();
const COMMUNITY_PROMPT_LIMIT = 300;
const gatewayFetchAgent = new Agent({
  headersTimeout: GATEWAY_FETCH_TIMEOUT_MS,
  bodyTimeout: GATEWAY_FETCH_TIMEOUT_MS,
  keepAliveTimeout: 120_000,
  keepAliveMaxTimeout: 120_000,
  connections: Math.max(8, JOB_CONCURRENCY * 4)
});

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(payload));
}

function sendDownloadJson(res, fileName, payload) {
  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Disposition': `attachment; filename="${fileName}"`,
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(payload, null, 2));
}

function sendCors(req, res) {
  const origin = String(req.headers.origin || '').replace(/\/+$/, '');
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').trim();
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() || 'https';
  const sameHostOrigins = new Set();
  if (host) {
    sameHostOrigins.add(`https://${host}`);
    sameHostOrigins.add(`http://${host}`);
    sameHostOrigins.add(`${forwardedProto}://${host}`);
  }
  const allowOrigin = !origin || ALLOWED_ORIGINS.includes(origin) || sameHostOrigins.has(origin) ? origin : '';
  if (allowOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowOrigin);
  }
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  return Boolean(!origin || allowOrigin);
}

function bearerToken(req) {
  const header = req.headers.authorization || '';
  const match = typeof header === 'string' ? header.match(/^Bearer\s+(.+)$/i) : null;
  return match ? match[1].trim() : '';
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      const error = new Error('BODY_TOO_LARGE');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

const userStorage = createUserStorage({
  historyLimit: HISTORY_LIMIT,
  sessionAssetPrefix: SESSION_ASSET_PREFIX,
  parseJsonText
});
const {
  ensureUserDirs,
  sessionPath,
  sessionPathForId,
  sessionsDir,
  sessionAssetId,
  jobsPath,
  communityPromptsPath,
  backupsDir,
  readRecords,
  writeRecords,
  readSession,
  writeSession,
  readSessionSnapshot
} = userStorage;

const communityPromptStore = createCommunityPromptStore({
  ensureUserDirs,
  communityPromptsPath,
  parseJsonText,
  limit: COMMUNITY_PROMPT_LIMIT
});
const {
  readCommunityPrompts,
  writeCommunityPrompts
} = communityPromptStore;

function normalizeGatewayAccountPayload(payload) {
  if (payload && typeof payload === 'object' && 'code' in payload) {
    if (payload.code === 0) return payload.data;
    throw new Error(payload.message || 'GATEWAY_AUTH_FAILED');
  }
  return payload;
}

async function gatewayAccountRequest(pathname, token) {
  const response = await fetch(`${AI_GATEWAY_BASE_URL}${pathname}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.message || `GATEWAY_HTTP_${response.status}`);
    error.status = response.status;
    throw error;
  }
  return normalizeGatewayAccountPayload(payload);
}

async function authenticate(req) {
  const token = bearerToken(req);
  if (!token) {
    const error = new Error('AUTH_REQUIRED');
    error.status = 401;
    throw error;
  }

  if (AUTH_MODE === 'local') {
    const key = createHash('sha256').update(`local:${token}`).digest('hex');
    return {
      user: { id: 'local-workspace', username: 'Local Workspace' },
      userKey: key,
      userDir: path.join(DATA_DIR, 'users', key)
    };
  }

  let user;
  try {
    user = await gatewayAccountRequest('/api/v1/auth/me', token);
  } catch {
    user = await gatewayAccountRequest('/api/v1/user/profile', token);
  }

  const userId = user?.id || user?.user?.id || user?.email || user?.username;
  if (!userId) {
    const error = new Error('USER_ID_MISSING');
    error.status = 401;
    throw error;
  }

  const key = createHash('sha256').update(String(userId)).digest('hex');
  return {
    user,
    userKey: key,
    userDir: path.join(DATA_DIR, 'users', key)
  };
}

function jobRuntimeKey(auth, jobId) {
  return `${auth.userKey}:${jobId}`;
}

function isQueuedInMemory(auth, jobId) {
  const queue = jobQueues.get(auth.userKey);
  return Boolean(queue?.items?.some((item) => item.jobId === jobId));
}

function jobIsActiveInMemory(auth, jobId) {
  return activeJobControllers.has(jobRuntimeKey(auth, jobId)) || isQueuedInMemory(auth, jobId);
}

function normalizeJobForRead(auth, job) {
  if (!job || typeof job !== 'object') return null;
  const status = text(job.status || 'queued', 40);
  if (JOB_ACTIVE_STATUSES.has(status) && !jobIsActiveInMemory(auth, job.id)) {
    const updatedAt = Date.parse(job.updatedAt || job.startedAt || job.createdAt || '');
    if (!Number.isFinite(updatedAt) || updatedAt < SERVICE_STARTED_AT - 1000) {
      return {
        ...job,
        status: 'unknown',
        stage: 'unknown',
        updatedAt: new Date().toISOString(),
        error: {
          code: 'JOB_RUNTIME_NOT_ATTACHED',
          message: 'The service restarted or lost the active runner before this job returned a final result.'
        }
      };
    }
  }
  return job;
}

async function withUserJobLock(auth, action) {
  const previous = jobStorageLocks.get(auth.userKey) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => {
    release = resolve;
  });
  jobStorageLocks.set(auth.userKey, previous.then(() => current, () => current));
  await previous.catch(() => {});
  try {
    return await action();
  } finally {
    release();
    if (jobStorageLocks.get(auth.userKey) === current) {
      jobStorageLocks.delete(auth.userKey);
    }
  }
}

async function readJobsUnlocked(auth) {
  try {
    const raw = await fs.readFile(jobsPath(auth), 'utf8');
    const parsed = parseJsonText(raw);
    const jobs = Array.isArray(parsed) ? parsed : [];
    let changed = false;
    const normalized = jobs.map((job) => {
      const nextJob = normalizeJobForRead(auth, job);
      if (nextJob && nextJob !== job) changed = true;
      return nextJob;
    }).filter(Boolean);
    if (changed) {
      await writeJobsUnlocked(auth, normalized);
    }
    return normalized;
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function readJobs(auth) {
  return withUserJobLock(auth, () => readJobsUnlocked(auth));
}

async function writeJobsUnlocked(auth, jobs) {
  await ensureUserDirs(auth);
  await atomicWriteJson(jobsPath(auth), jobs.slice(0, JOB_LIMIT));
}

async function writeJobs(auth, jobs) {
  return withUserJobLock(auth, () => writeJobsUnlocked(auth, jobs));
}

async function updateJob(auth, jobId, patch) {
  return withUserJobLock(auth, async () => {
    const jobs = await readJobsUnlocked(auth);
    const index = jobs.findIndex((job) => job.id === jobId);
    if (index < 0) return null;
    const nextJob = {
      ...jobs[index],
      ...patch,
      updatedAt: new Date().toISOString()
    };
    const nextJobs = [nextJob, ...jobs.filter((job) => job.id !== jobId)];
    await writeJobsUnlocked(auth, nextJobs);
    return nextJob;
  });
}

async function upsertJob(auth, job) {
  return withUserJobLock(auth, async () => {
    const jobs = await readJobsUnlocked(auth);
    await writeJobsUnlocked(auth, [job, ...jobs.filter((item) => item.id !== job.id)].slice(0, JOB_LIMIT));
    return job;
  });
}

const userBackupService = createUserBackupService({
  serviceVersion: SERVICE_VERSION,
  ensureUserDirs,
  backupsDir,
  sessionPath,
  sessionsDir,
  readRecords,
  writeRecords,
  readSessionSnapshot,
  writeSession,
  readJobs,
  writeJobs,
  readCommunityPrompts,
  writeCommunityPrompts
});
const {
  buildUserBackup,
  restoreUserBackup
} = userBackupService;

function isLikelyGarbledText(value) {
  const body = String(value || '').trim();
  if (!body) return false;
  if (/[\u0000-\u001f\u007f\ufffd]/.test(body)) return true;
  if (/[\u00c2\u00c3][\u0080-\u00bf]|(?:\u00e2\u20ac[\u0098-\u009d\u0153\u2122])|(?:[\u00e4-\u00e9][\u0080-\u00ff]{1,3}){2,}/.test(body)) return true;
  const latin = (body.match(/[A-Za-z]/g) || []).length;
  const cjk = (body.match(/[\u3400-\u9fff]/g) || []).length;
  const hasSeparator = /[\s/|.,:;()[\]{}_+\-·，。：；（）【】]/.test(body);
  if (latin > 0 && cjk >= 2 && !hasSeparator) return true;
  const useful = (body.match(/[A-Za-z0-9\u3400-\u9fff]/g) || []).length;
  return body.length >= 4 && useful / body.length < 0.45;
}

function cleanSourceText(value, length) {
  const body = text(value, length);
  return body && !isLikelyGarbledText(body) ? body : '';
}

function cleanLibraryId(value) {
  const raw = String(value || '').trim();
  if (!/^[a-zA-Z0-9._:-]{1,120}$/.test(raw)) {
    const error = new Error('LIBRARY_ITEM_NOT_FOUND');
    error.status = 404;
    throw error;
  }
  return raw;
}

function cleanRecordId(value) {
  const raw = String(value || '');
  return /^[a-zA-Z0-9_-]{8,80}$/.test(raw) ? raw : randomUUID();
}

function assetExtension(mime) {
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/webp') return 'webp';
  return 'png';
}

async function writeAssetBuffer(auth, recordId, buffer, mime, index) {
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) return '';
  const ext = assetExtension(mime);
  const assetDir = path.join(auth.userDir, 'assets', recordId);
  await fs.mkdir(assetDir, { recursive: true });
  const fileName = `${index}.${ext}`;
  await fs.writeFile(path.join(assetDir, fileName), buffer);
  return `/studio-api/history/${recordId}/assets/${fileName}`;
}

async function storeResultUrl(auth, recordId, value, index) {
  const raw = String(value || '');
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('/studio-api/history/')) return raw;
  if (raw.startsWith('/studio-api/generation-jobs/')) return raw;

  const match = raw.match(/^data:(image\/(?:png|jpeg|webp));base64,([a-zA-Z0-9+/=\s]+)$/);
  if (!match) return '';

  const buffer = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
  return writeAssetBuffer(auth, recordId, buffer, match[1], index);
}

async function storeSessionUrl(auth, value, index, assetId = sessionAssetId()) {
  return storeResultUrl(auth, assetId, value, index);
}

async function readJsonFile(filePath, fallback = {}) {
  try {
    return parseJsonText(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

function protectedLibraryAssetUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^\/studio-api\/library-assets\//i.test(raw)) return raw;
  if (/^(?:\.\/)?\/?images\//i.test(raw)) return `/studio-api/library-assets/${raw.replace(/^(?:\.\/)?\/?images\//i, '')}`;
  if (/^https?:\/\//i.test(raw)) return raw;
  return '';
}

function protectedLibraryThumbnailUrl(item) {
  const direct = protectedLibraryAssetUrl(item.thumbnail || item.thumb || item.thumbnail_url || item.thumbnailUrl);
  if (direct) return direct;

  const image = String(item.image || item.image_url || '').trim();
  if (/(?:^|\/)thumbs\//i.test(image)) return protectedLibraryAssetUrl(image);
  const match = image.match(/^(?:\.\/)?\/?images\/(.+)\.(png|jpe?g)$/i);
  if (!match) return '';
  return `/studio-api/library-assets/thumbs/${match[1]}.webp`;
}

function sanitizeLibrarySummary(item) {
  const image = protectedLibraryAssetUrl(item.image || item.image_url);
  const thumbnail = protectedLibraryThumbnailUrl(item);
  return {
    id: item.id,
    title: text(item.title, 180),
    image,
    thumbnail,
    imageAlt: text(item.imageAlt, 240),
    sourceLabel: cleanSourceText(item.sourceLabel, 120),
    sourceName: cleanSourceText(item.sourceName, 120),
    promptPreview: text(item.promptPreview, 160),
    category: text(item.category, 120),
    styles: Array.isArray(item.styles) ? item.styles.slice(0, 8).map((value) => text(value, 80)).filter(Boolean) : [],
    scenes: Array.isArray(item.scenes) ? item.scenes.slice(0, 8).map((value) => text(value, 80)).filter(Boolean) : [],
    featured: Boolean(item.featured),
    external: Boolean(item.external),
    sourceUrl: text(item.sourceUrl || item.githubUrl || item.sourceRepository, 600),
    sourceLicense: LIBRARY_LICENSE.spdx,
    attributionRequired: item.attributionRequired !== false,
    imageUnavailable: Boolean(item.imageUnavailable),
    imageUnavailableReason: text(item.imageUnavailableReason, 120),
    riskTags: Array.isArray(item.riskTags) ? item.riskTags.slice(0, 8).map((value) => text(value, 80)).filter(Boolean) : []
  };
}

function sanitizeLibraryDetail(item) {
  return {
    ...sanitizeLibrarySummary(item),
    prompt: text(item.prompt, 12000)
  };
}

function sanitizePromptPresetSummary(item) {
  return {
    id: item.id,
    mode: item.mode,
    title: text(item.title, 120),
    tag: text(item.tag, 80)
  };
}

function sanitizePromptPresetDetail(item) {
  return {
    ...sanitizePromptPresetSummary(item),
    prompt: text(item.prompt, 4000)
  };
}

function sanitizeVideoInspirationSummary(item) {
  return {
    id: item.id,
    kind: 'video-inspiration',
    title: text(item.title, 160),
    intent: text(item.intent, 120),
    summary: text(item.summary, 180),
    videoAspect: text(item.videoAspect, 20),
    videoDuration: Number(item.videoDuration) || 5,
    videoFps: Number(item.videoFps) || 24,
    videoMotion: text(item.videoMotion, 80),
    videoStyle: text(item.videoStyle, 80),
    videoQuality: text(item.videoQuality, 40)
  };
}

function sanitizeVideoInspirationDetail(item) {
  return {
    ...sanitizeVideoInspirationSummary(item),
    prompt: text(item.prompt, 4000),
    negativePrompt: text(item.negativePrompt, 1000)
  };
}

async function readLibrary(auth = null) {
  const localData = await readJsonFile(path.join(LIBRARY_DIR, 'cases.json'), { cases: [] });
  const inspirationData = await readJsonFile(path.join(LIBRARY_DIR, 'inspirations.json'), { cases: [] });
  const localCases = Array.isArray(localData?.cases) ? localData.cases : [];
  const inspirationCases = Array.isArray(inspirationData?.cases) ? inspirationData.cases : [];
  const communityCases = auth ? await readCommunityPrompts(auth) : [];
  const rawCases = [...communityCases, ...localCases, ...inspirationCases].filter((item) => item && item.id !== undefined && item.id !== null);
  const cases = rawCases.map(sanitizeLibrarySummary);
  return {
    rawCases,
    payload: {
      ok: true,
      license: LIBRARY_LICENSE,
      totalCases: cases.length,
      categories: [...new Set([
        ...(Array.isArray(localData?.categories) ? localData.categories : []),
        ...(Array.isArray(inspirationData?.categories) ? inspirationData.categories : []),
        ...communityCases.map((item) => item.category).filter(Boolean),
        ...cases.map((item) => item.category).filter(Boolean)
      ])].sort(),
      styles: [...new Set(cases.flatMap((item) => item.styles || []))].sort(),
      scenes: [...new Set(cases.flatMap((item) => item.scenes || []))].sort(),
      promptPresets: PROMPT_PRESETS.map(sanitizePromptPresetSummary),
      videoInspirations: VIDEO_INSPIRATIONS.map(sanitizeVideoInspirationSummary),
      cases
    }
  };
}

function sanitizeCase(value) {
  if (!value || typeof value !== 'object') return null;
  return {
    id: value.id || null,
    title: text(value.title, 160),
    image: text(value.image, 600),
    imageAlt: text(value.imageAlt, 240),
    promptPreview: text(value.promptPreview, 800),
    category: text(value.category, 120)
  };
}

function sanitizeSessionObject(value) {
  if (!value || typeof value !== 'object') return null;
  return { ...value };
}

function sanitizeAssistantMessages(items) {
  const source = Array.isArray(items) ? items.slice(-SESSION_MESSAGE_LIMIT) : [];
  return source
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      id: text(item.id || randomUUID(), 120),
      role: item.role === 'assistant' ? 'assistant' : 'user',
      content: text(item.content, 8000),
      finalPrompt: text(item.finalPrompt, 12000),
      pending: Boolean(item.pending),
      failed: Boolean(item.failed)
    }))
    .filter((item) => item.content || item.finalPrompt);
}

function sanitizePromptSuggestion(value) {
  if (!value || typeof value !== 'object') return null;
  const suggestion = {
    subject: text(value.subject, 2000),
    scene: text(value.scene, 2000),
    composition: text(value.composition, 2000),
    style: text(value.style, 2000),
    lighting: text(value.lighting, 2000),
    details: text(value.details, 3000),
    textRules: text(value.textRules, 2000),
    constraints: text(value.constraints, 3000),
    finalPrompt: text(value.finalPrompt, 12000),
    raw: text(value.raw, 16000)
  };
  return Object.values(suggestion).some(Boolean) ? suggestion : null;
}

function sanitizeCanvasView(value) {
  if (!value || typeof value !== 'object') return { x: 0, y: 0, zoom: 1 };
  const x = Number(value.x);
  const y = Number(value.y);
  const zoom = Number(value.zoom);
  return {
    x: Number.isFinite(x) ? Math.max(-8000, Math.min(8000, x)) : 0,
    y: Number.isFinite(y) ? Math.max(-8000, Math.min(8000, y)) : 0,
    zoom: Number.isFinite(zoom) ? Math.max(0.2, Math.min(3, zoom)) : 1
  };
}

function sanitizeDownloadMeta(value) {
  if (!value || typeof value !== 'object') return null;
  return {
    mode: text(value.mode || 'image', 40),
    providerId: text(value.providerId, 160),
    createdAt: value.createdAt && !Number.isNaN(Date.parse(value.createdAt)) ? value.createdAt : '',
    prompt: text(value.prompt, 6000),
    id: text(value.id, 160)
  };
}

async function sanitizeSessionUrls(auth, values, assetIndex, assetId = sessionAssetId()) {
  const urls = [];
  const source = Array.isArray(values) ? values.slice(0, SESSION_URL_LIMIT) : [];
  for (const value of source) {
    const stored = await storeSessionUrl(auth, value, assetIndex.current, assetId);
    assetIndex.current += 1;
    if (stored) urls.push(stored);
    else if (/^(https?:|blob:)/i.test(String(value || ''))) urls.push(String(value));
  }
  return urls;
}

async function sanitizeCanvasNodes(auth, nodes, assetIndex, assetId = sessionAssetId()) {
  const source = Array.isArray(nodes) ? nodes.slice(0, SESSION_NODE_LIMIT) : [];
  const result = [];
  for (const node of source) {
    if (!node || typeof node !== 'object') continue;
    const rawUrl = String(node.url || '');
    let url = '';
    if (rawUrl) {
      url = await storeSessionUrl(auth, rawUrl, assetIndex.current, assetId);
      assetIndex.current += 1;
      if (!url && /^(https?:|blob:)/i.test(rawUrl)) url = rawUrl;
    }
    const x = Number(node.x);
    const y = Number(node.y);
    const width = Number(node.width);
    const height = Number(node.height);
    const canvasIndex = Math.round(Number(node.canvasIndex));
    result.push({
      id: text(node.id || randomUUID(), 120),
      parentId: text(node.parentId, 120),
      canvasIndex: Number.isFinite(canvasIndex) ? canvasIndex : result.length + 1,
      kind: text(node.kind || 'image', 40),
      url,
      persistedUrl: url,
      sourceUrl: text(node.sourceUrl, 1200),
      prompt: text(node.prompt, 6000),
      generationPrompt: text(node.generationPrompt || node.prompt, 6000),
      title: text(node.title, 160),
      x: Number.isFinite(x) ? Math.max(-8000, Math.min(8000, x)) : 0,
      y: Number.isFinite(y) ? Math.max(-8000, Math.min(8000, y)) : 0,
      width: Number.isFinite(width) ? Math.max(240, Math.min(620, Math.round(width))) : undefined,
      height: Number.isFinite(height) ? Math.max(200, Math.min(520, Math.round(height))) : undefined,
      createdAt: node.createdAt && !Number.isNaN(Date.parse(node.createdAt)) ? node.createdAt : new Date().toISOString(),
      downloadMeta: sanitizeDownloadMeta(node.downloadMeta)
    });
  }
  return result;
}

function sanitizeCanvasCustomLinks(links) {
  const source = Array.isArray(links) ? links.slice(0, SESSION_NODE_LIMIT) : [];
  return source
    .map((link) => ({
      id: text(link?.id || randomUUID(), 120),
      fromId: text(link?.fromId, 120),
      toId: text(link?.toId, 120),
      createdAt: link?.createdAt && !Number.isNaN(Date.parse(link.createdAt)) ? link.createdAt : new Date().toISOString()
    }))
    .filter((link) => link.fromId && link.toId);
}

function sanitizeGenerationQueue(items) {
  const source = Array.isArray(items) ? items.slice(-SESSION_QUEUE_LIMIT) : [];
  return source
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      id: text(item.id || randomUUID(), 120),
      serverJobId: text(item.serverJobId, 120),
      remote: Boolean(item.remote),
      status: text(item.status || 'queued', 40),
      createdAt: Number(item.createdAt || Date.now()),
      startedAt: item.startedAt ? Number(item.startedAt) : null,
      completedAt: item.completedAt ? Number(item.completedAt) : null,
      mode: text(item.mode || 'image', 40),
      providerId: text(item.providerId || item.provider || '', 160),
      providerFamily: text(item.providerFamily || item.providerId || item.provider || '', 160),
      apiKeySource: text(item.apiKeySource || '', 60),
      providerLabel: text(item.providerLabel || '', 160),
      prompt: text(item.prompt, 12000),
      model: text(item.model, 160),
      aspect: text(item.aspect || item.aspectRatio, 40),
      aspectRatio: text(item.aspectRatio || item.aspect, 40),
      customSize: text(item.customSize, 40),
      size: text(item.size, 40),
      quality: text(item.quality, 40),
      resolutionTier: text(item.resolutionTier, 40),
      outputFormat: text(item.outputFormat, 20),
      moderation: text(item.moderation, 40),
      count: Math.max(1, Math.min(4, Number(item.count || 1))),
      selectedCanvasNodeId: text(item.selectedCanvasNodeId, 120),
      selectedCanvasNodeSnapshot: sanitizeSessionObject(item.selectedCanvasNodeSnapshot),
      referencesOpen: Boolean(item.referencesOpen),
      summary: text(item.summary || item.prompt, 260),
      restorable: Boolean(item.restorable),
      restored: Boolean(item.restored),
      stage: text(item.stage, 40),
      completed: Math.max(0, Math.min(4, Number(item.completed || 0))),
      total: Math.max(1, Math.min(4, Number(item.total || item.count || 1))),
      resultUrls: Array.isArray(item.resultUrls) ? item.resultUrls.slice(0, 4).map((value) => text(value, 1200)).filter(Boolean) : [],
      requestIds: Array.isArray(item.requestIds) ? item.requestIds.slice(0, 8).map((value) => text(value, 160)).filter(Boolean) : [],
      error: item.error && typeof item.error === 'object'
        ? {
          code: text(item.error.code, 120),
          status: item.error.status || null,
          requestId: text(item.error.requestId, 160),
          message: text(item.error.message, 1200)
        }
        : null
    }));
}

async function pruneSessionAssets(auth, session) {
  const assetId = sessionAssetId(session?.sessionId);
  const assetDir = path.join(auth.userDir, 'assets', assetId);
  const referenced = new Set();
  const collect = (url) => {
    const match = String(url || '').match(new RegExp(`/studio-api/history/${assetId}/assets/([0-9]{1,3}\\.(?:png|jpg|webp))$`));
    if (match) referenced.add(match[1]);
  };
  for (const url of session.results || []) collect(url);
  for (const node of session.canvasNodes || []) collect(node?.url);
  const files = await fs.readdir(assetDir).catch(() => []);
  await Promise.all(files
    .filter((fileName) => /^[0-9]{1,3}\.(png|jpg|webp)$/.test(fileName) && !referenced.has(fileName))
    .map((fileName) => fs.rm(path.join(assetDir, fileName), { force: true })));
}

async function sanitizeSession(auth, body) {
  const assetIndex = { current: 0 };
  const sessionId = text(body.sessionId, 120);
  const assetId = sessionAssetId(sessionId);
  const results = await sanitizeSessionUrls(auth, body.results, assetIndex, assetId);
  const videoResults = Array.isArray(body.videoResults) ? body.videoResults.slice(0, SESSION_URL_LIMIT).map((value) => text(value, 1200)).filter(Boolean) : [];
  const canvasNodes = await sanitizeCanvasNodes(auth, body.canvasNodes, assetIndex, assetId);
  const session = {
    updatedAt: new Date().toISOString(),
    sessionId,
    mode: text(body.mode || 'image', 40),
    prompt: text(body.prompt, 12000),
    model: text(body.model, 160),
    results,
    videoResults,
    resultBatchMeta: sanitizeSessionObject(body.resultBatchMeta),
    canvasNodes,
    canvasCustomLinks: sanitizeCanvasCustomLinks(body.canvasCustomLinks),
    generationQueue: sanitizeGenerationQueue(body.generationQueue),
    selectedCanvasNodeId: text(body.selectedCanvasNodeId, 120),
    canvasEditorNodeId: text(body.canvasEditorNodeId, 120),
    canvasView: sanitizeCanvasView(body.canvasView),
    status: text(body.status || 'idle', 40),
    message: text(body.message, 1000),
    progress: sanitizeSessionObject(body.progress),
    timing: sanitizeSessionObject(body.timing),
    assistantMessages: sanitizeAssistantMessages(body.assistantMessages),
    promptSuggestion: sanitizePromptSuggestion(body.promptSuggestion),
    selectedCase: sanitizeCase(body.selectedCase),
    parameters: sanitizeSessionObject(body.parameters)
  };
  await pruneSessionAssets(auth, session);
  return session;
}

async function sanitizeRecord(auth, body) {
  const recordId = cleanRecordId(body.id);
  const inputUrls = Array.isArray(body.resultUrls) ? body.resultUrls.slice(0, 4) : [];
  const resultUrls = [];
  for (let index = 0; index < inputUrls.length; index += 1) {
    const stored = await storeResultUrl(auth, recordId, inputUrls[index], index);
    if (stored) resultUrls.push(stored);
  }

  return {
    id: recordId,
    sessionId: text(body.sessionId, 120),
    createdAt: body.createdAt && !Number.isNaN(Date.parse(body.createdAt)) ? body.createdAt : new Date().toISOString(),
    mode: text(body.mode || 'image', 40),
    kind: text(body.kind || body.mode || 'image', 40),
    providerId: text(body.providerId || body.provider || '', 160),
    providerFamily: text(body.providerFamily || body.providerId || body.provider || '', 160),
    apiKeySource: text(body.apiKeySource || '', 60),
    providerLabel: text(body.providerLabel || '', 160),
    prompt: text(body.prompt, 6000),
    generationPrompt: text(body.generationPrompt || body.prompt, 6000),
    model: text(body.model, 120),
    size: text(body.size, 40),
    quality: text(body.quality, 40),
    outputFormat: text(body.outputFormat || body.output_format || '', 20),
    moderation: text(body.moderation || '', 40),
    requestIds: Array.isArray(body.requestIds) ? body.requestIds.slice(0, 8).map((value) => text(value, 160)).filter(Boolean) : [],
    usageSummary: text(body.usageSummary || body.costSummary || '', 240),
    costSummary: text(body.costSummary || '', 240),
    timing: sanitizeSessionObject(body.timing),
    count: Math.max(1, Math.min(4, Number(body.count || 1))),
    resultUrls,
    case: sanitizeCase(body.case)
  };
}

function cleanJobId(value) {
  const raw = String(value || '');
  return /^[a-zA-Z0-9_-]{8,100}$/.test(raw) ? raw : randomUUID();
}

function normalizeGatewayBaseUrl(value) {
  const raw = String(value || AI_GATEWAY_BASE_URL).replace(/\/+$/, '');
  if (raw.endsWith('/v1')) return raw;
  return `${raw}/v1`;
}

function dataUrlToBuffer(value) {
  const raw = String(value || '');
  const match = raw.match(/^data:(image\/(?:png|jpeg|webp));base64,([a-zA-Z0-9+/=\s]+)$/);
  if (!match) return null;
  const buffer = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) return null;
  return {
    mime: match[1],
    buffer,
    ext: assetExtension(match[1])
  };
}

function normalizeImageInput(value, index) {
  if (!value) return null;
  const dataUrl = typeof value === 'string' ? value : value.dataUrl;
  const parsed = dataUrlToBuffer(dataUrl);
  if (!parsed) return null;
  return {
    ...parsed,
    name: text(value.name || `reference-${index + 1}.${parsed.ext}`, 120)
  };
}

function gatewayErrorMessage(error) {
  const payload = error?.payload || {};
  const message = payload?.error?.message || payload?.message || error?.message || 'GENERATION_JOB_FAILED';
  return String(message).slice(0, 1200);
}

function gatewayDispatchErrorMessage(error) {
  const message = String(error?.message || '');
  const causeCode = String(error?.cause?.code || '');
  if (
    error?.name === 'TimeoutError'
    || causeCode === 'UND_ERR_HEADERS_TIMEOUT'
    || causeCode === 'UND_ERR_BODY_TIMEOUT'
    || /headers timeout|body timeout|timeout/i.test(message)
  ) {
    return 'The gateway did not return a final response before the Workbench timeout. The upstream image request may still be processing, queued, or billed.';
  }
  return 'The Workbench service could not deliver this request to the gateway. Check the gateway URL, service network, origin allowlist, and firewall before retrying.';
}

function gatewayRequestId(payload, headers) {
  return text(
    payload?.request_id
    || payload?.id
    || payload?.error?.request_id
    || payload?.error?.requestId
    || headers?.get?.('x-request-id')
    || headers?.get?.('openai-request-id')
    || '',
    180
  );
}

async function readGatewayResponse(response) {
  const raw = await response.text();
  let payload = {};
  try {
    payload = raw ? parseJsonText(raw) : {};
  } catch {
    payload = { message: raw.slice(0, 1200) };
  }
  if (!response.ok) {
    const error = new Error(payload?.error?.message || payload?.message || `GATEWAY_HTTP_${response.status}`);
    error.status = response.status;
    error.payload = payload;
    error.requestId = gatewayRequestId(payload, response.headers);
    throw error;
  }
  const requestId = gatewayRequestId(payload, response.headers);
  if (requestId && !payload.request_id) payload.request_id = requestId;
  return payload;
}

async function persistRemoteImage(auth, recordId, rawUrl, index) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60 * 1000);
  try {
    const response = await fetch(rawUrl, { signal: controller.signal });
    if (!response.ok) return rawUrl;
    const mime = String(response.headers.get('content-type') || 'image/png').split(';')[0].trim().toLowerCase();
    if (!/^image\/(png|jpeg|webp)$/.test(mime)) return rawUrl;
    const buffer = Buffer.from(await response.arrayBuffer());
    return await writeAssetBuffer(auth, recordId, buffer, mime, index) || rawUrl;
  } catch {
    return rawUrl;
  } finally {
    clearTimeout(timer);
  }
}

async function persistGatewayImage(auth, recordId, item, index, outputFormat = 'png') {
  const url = String(item?.url || item?.image_url || '').trim();
  if (item?.b64_json || item?.image_base64) {
    const mime = outputFormat === 'jpeg'
      ? 'image/jpeg'
      : outputFormat === 'webp'
        ? 'image/webp'
        : 'image/png';
    const buffer = Buffer.from(String(item.b64_json || item.image_base64).replace(/\s+/g, ''), 'base64');
    return writeAssetBuffer(auth, recordId, buffer, mime, index);
  }
  if (url.startsWith('data:')) {
    return storeResultUrl(auth, recordId, url, index);
  }
  if (/^https?:\/\//i.test(url)) {
    return persistRemoteImage(auth, recordId, url, index);
  }
  return '';
}

function buildJobRecord(body) {
  const request = body?.request && typeof body.request === 'object' ? body.request : body;
  const mode = ['edit', 'mask'].includes(request.mode) ? request.mode : 'image';
  const route = mode === 'image' && request.route !== 'edits' ? 'generations' : 'edits';
  const count = Math.max(1, Math.min(4, Number(request.n || request.count || 1)));
  const now = new Date().toISOString();
  return {
    id: cleanJobId(request.id || body.id),
    clientRequestId: cleanJobId(request.clientRequestId || body.clientRequestId),
    sessionId: text(request.sessionId || body.sessionId, 120),
    parentCanvasNodeId: text(request.parentCanvasNodeId || body.parentCanvasNodeId, 120),
    fingerprint: text(request.fingerprint || body.fingerprint, 16000),
    status: 'queued',
    stage: 'queued',
    createdAt: now,
    updatedAt: now,
    startedAt: '',
    completedAt: '',
    mode,
    route,
    endpoint: route === 'edits' ? '/v1/images/edits' : '/v1/images/generations',
    providerId: text(request.providerId || request.provider || '', 160),
    providerFamily: text(request.providerFamily || request.providerId || request.provider || '', 160),
    apiKeySource: text(request.apiKeySource || '', 60),
    providerLabel: text(request.providerLabel || '', 160),
    model: text(request.model, 160),
    prompt: text(request.prompt, 12000),
    generationPrompt: text(request.generationPrompt || request.prompt, 12000),
    size: text(request.size || 'auto', 40),
    quality: text(request.quality || 'auto', 40),
    outputFormat: text(request.outputFormat || request.output_format || 'png', 20),
    moderation: text(request.moderation || 'auto', 40),
    count,
    completed: 0,
    total: count,
    resultUrls: [],
    usage: null,
    error: null,
    requestIds: [],
    timing: {
      queuedAt: Date.now(),
      startedAt: null,
      completedAt: null,
      totalMs: null
    },
    inputSummary: {
      referenceCount: Array.isArray(body.images) ? body.images.length : 0,
      hasMask: Boolean(body.mask)
    }
  };
}

function buildJobRuntime(body) {
  const request = body?.request && typeof body.request === 'object' ? body.request : body;
  const apiKey = text(body.apiKey || request.apiKey, 4000);
  if (!apiKey) {
    const error = new Error('GENERATION_JOB_API_KEY_REQUIRED');
    error.status = 400;
    throw error;
  }
  return {
    apiKey,
    gatewayBaseUrl: normalizeGatewayBaseUrl(body.gatewayBaseUrl || request.gatewayBaseUrl || AI_GATEWAY_BASE_URL),
    images: (Array.isArray(body.images) ? body.images : []).slice(0, 4).map(normalizeImageInput).filter(Boolean),
    mask: body.mask ? normalizeImageInput(body.mask, 0) : null
  };
}

async function writeHistoryRecordForJob(auth, job) {
  if (!Array.isArray(job.resultUrls) || !job.resultUrls.length) return;
  const records = await readRecords(auth);
  const record = {
    id: job.id,
    sessionId: job.sessionId,
    createdAt: job.createdAt,
    mode: job.mode,
    providerId: job.providerId,
    providerFamily: job.providerFamily,
    apiKeySource: job.apiKeySource,
    providerLabel: job.providerLabel,
    prompt: job.prompt,
    generationPrompt: job.generationPrompt || job.prompt,
    model: job.model,
    size: job.size,
    quality: job.quality,
    outputFormat: job.outputFormat,
    moderation: job.moderation,
    count: job.count,
    resultUrls: job.resultUrls,
    requestIds: Array.isArray(job.requestIds) ? job.requestIds : [],
    usageSummary: job.usage ? JSON.stringify(job.usage).slice(0, 240) : '',
    timing: job.timing || null,
    case: null
  };
  await writeRecords(auth, [record, ...records.filter((item) => item.id !== record.id)].slice(0, HISTORY_LIMIT));
}

async function postJsonToGateway(url, apiKey, body, clientRequestId, signal) {
  const response = await undiciFetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-Client-Request-ID': clientRequestId,
      'X-Request-ID': clientRequestId
    },
    body: JSON.stringify(body),
    dispatcher: gatewayFetchAgent,
    signal
  });
  return readGatewayResponse(response);
}

async function postMultipartToGateway(url, apiKey, form, clientRequestId, signal) {
  const response = await undiciFetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'X-Client-Request-ID': clientRequestId,
      'X-Request-ID': clientRequestId
    },
    body: form,
    dispatcher: gatewayFetchAgent,
    signal
  });
  return readGatewayResponse(response);
}

async function runGenerationRequest(auth, job, runtime, signal) {
  const resultUrls = [];
  const requestIds = [];
  const usages = [];
  const total = Math.max(1, Number(job.count || 1));
  let currentJob = job;
  if (job.route === 'edits') {
    const form = new UndiciFormData();
    form.set('model', job.model);
    form.set('prompt', job.generationPrompt || job.prompt);
    form.set('size', job.size);
    form.set('quality', job.quality);
    form.set('output_format', job.outputFormat || 'png');
    form.set('moderation', job.moderation || 'auto');
    form.set('n', String(total));
    runtime.images.forEach((image, index) => {
      form.append('image', new Blob([image.buffer], { type: image.mime }), image.name || `reference-${index + 1}.${image.ext}`);
    });
    if (runtime.mask) {
      form.set('mask', new Blob([runtime.mask.buffer], { type: runtime.mask.mime }), runtime.mask.name || `mask.${runtime.mask.ext}`);
    }
    currentJob = await updateJob(auth, job.id, {
      status: 'gateway',
      stage: 'gateway',
      completed: 0,
      total,
      lastClientRequestId: job.clientRequestId,
      endpoint: '/v1/images/edits',
      timing: {
        ...(currentJob.timing || {}),
        gatewayAt: Date.now()
      }
    }) || currentJob;
    const payload = await postMultipartToGateway(`${runtime.gatewayBaseUrl}/images/edits`, runtime.apiKey, form, job.clientRequestId, signal);
    const items = Array.isArray(payload?.data) ? payload.data : [];
    if (!items.length) {
      const error = new Error('IMAGES_EDITS_RETURNED_NO_IMAGES');
      error.payload = payload;
      throw error;
    }
    requestIds.push(gatewayRequestId(payload));
    currentJob = await updateJob(auth, job.id, {
      status: 'saving',
      stage: 'saving',
      completed: 0,
      total,
      requestIds: requestIds.filter(Boolean),
      timing: {
        ...(currentJob.timing || {}),
        responseAt: Date.now(),
        savingAt: Date.now()
      }
    }) || currentJob;
    for (let index = 0; index < items.length; index += 1) {
      const stored = await persistGatewayImage(auth, job.id, items[index], resultUrls.length, job.outputFormat);
      if (stored) resultUrls.push(stored);
      currentJob = await updateJob(auth, job.id, {
        status: 'image',
        stage: 'image',
        completed: Math.min(resultUrls.length, total),
        total,
        resultUrls,
        requestIds: requestIds.filter(Boolean),
        timing: {
          ...(currentJob.timing || {}),
          savedAt: Date.now()
        }
      }) || currentJob;
    }
    if (payload?.usage) usages.push(payload.usage);
    return { resultUrls, requestIds, usage: usages[0] || null, timing: currentJob.timing || null };
  }

  for (let index = 0; index < total; index += 1) {
    const clientRequestId = `${job.clientRequestId}-${index + 1}`;
    currentJob = await updateJob(auth, job.id, {
      status: 'gateway',
      stage: 'gateway',
      completed: resultUrls.length,
      total,
      lastClientRequestId: clientRequestId,
      endpoint: '/v1/images/generations',
      requestIds: requestIds.filter(Boolean),
      timing: {
        ...(currentJob.timing || {}),
        gatewayAt: Date.now()
      }
    }) || currentJob;
    const payload = await postJsonToGateway(`${runtime.gatewayBaseUrl}/images/generations`, runtime.apiKey, {
      model: job.model,
      prompt: job.generationPrompt || job.prompt,
      size: job.size,
      quality: job.quality,
      n: 1
    }, clientRequestId, signal);
    const items = Array.isArray(payload?.data) ? payload.data : [];
    if (!items.length) {
      const error = new Error('IMAGES_GENERATIONS_RETURNED_NO_IMAGES');
      error.payload = payload;
      throw error;
    }
    requestIds.push(gatewayRequestId(payload));
    currentJob = await updateJob(auth, job.id, {
      status: 'saving',
      stage: 'saving',
      completed: resultUrls.length,
      total,
      requestIds: requestIds.filter(Boolean),
      timing: {
        ...(currentJob.timing || {}),
        responseAt: Date.now(),
        savingAt: Date.now()
      }
    }) || currentJob;
    for (const item of items) {
      const stored = await persistGatewayImage(auth, job.id, item, resultUrls.length, job.outputFormat);
      if (stored) resultUrls.push(stored);
    }
    if (payload?.usage) usages.push(payload.usage);
    currentJob = await updateJob(auth, job.id, {
      status: 'image',
      stage: 'image',
      completed: Math.min(resultUrls.length, total),
      total,
      resultUrls,
      requestIds: requestIds.filter(Boolean),
      timing: {
        ...(currentJob.timing || {}),
        savedAt: Date.now()
      }
    }) || currentJob;
  }
  return { resultUrls, requestIds, usage: usages.length === 1 ? usages[0] : usages.length ? usages : null, timing: currentJob.timing || null };
}

async function runGenerationJob(auth, jobId, runtime) {
  const existingJobs = await readJobs(auth);
  const existingJob = existingJobs.find((job) => job.id === jobId);
  if (!existingJob || existingJob.status === 'canceled') return;

  const startedAt = Date.now();
  const controller = new AbortController();
  const key = jobRuntimeKey(auth, jobId);
  activeJobControllers.set(key, controller);
  const timer = setTimeout(() => controller.abort(new Error('JOB_TIMEOUT')), JOB_TIMEOUT_MS);
  try {
    const queuedAt = Number(existingJob.timing?.queuedAt) || Date.parse(existingJob.createdAt || '') || null;
    let job = await updateJob(auth, jobId, {
      status: 'dispatching',
      stage: 'dispatching',
      startedAt: new Date(startedAt).toISOString(),
      timing: {
        queuedAt,
        startedAt,
        completedAt: null,
        totalMs: null
      }
    });
    if (!job) return;
    const result = await runGenerationRequest(auth, job, runtime, controller.signal);
    const completedAt = Date.now();
    const nextJob = await updateJob(auth, jobId, {
      status: 'succeeded',
      stage: 'succeeded',
      completedAt: new Date(completedAt).toISOString(),
      completed: result.resultUrls.length,
      total: Math.max(Number(job.count || 1), result.resultUrls.length),
      resultUrls: result.resultUrls,
      usage: result.usage,
      requestIds: result.requestIds.filter(Boolean),
      timing: {
        ...(result.timing || {}),
        queuedAt: result.timing?.queuedAt || Number(existingJob.timing?.queuedAt) || Date.parse(existingJob.createdAt || '') || null,
        startedAt,
        completedAt,
        totalMs: completedAt - startedAt
      },
      error: null
    });
    if (nextJob) await writeHistoryRecordForJob(auth, nextJob);
  } catch (error) {
    const completedAt = Date.now();
    const reason = String(controller.signal.reason?.message || '');
    const timedOut = controller.signal.aborted && reason.includes('JOB_TIMEOUT');
    const canceled = controller.signal.aborted && reason.includes('JOB_CANCELED');
    const requestId = error?.requestId || gatewayRequestId(error?.payload || {});
    const failedJob = (await readJobs(auth)).find((item) => item.id === jobId);
    const dispatchFailed = !timedOut
      && !canceled
      && !error?.status
      && !requestId
      && (
        error?.name === 'TypeError'
        || /fetch failed|network|econn|enotfound|etimedout|eai_again/i.test(String(error?.message || ''))
      );
    await updateJob(auth, jobId, {
      status: timedOut ? 'unknown' : canceled ? 'canceled' : 'failed',
      stage: timedOut ? 'unknown' : canceled ? 'canceled' : 'failed',
      completedAt: new Date(completedAt).toISOString(),
      timing: {
        ...(failedJob?.timing || {}),
        startedAt,
        completedAt,
        totalMs: completedAt - startedAt
      },
      error: {
        code: timedOut ? 'JOB_TIMEOUT' : canceled ? 'JOB_CANCELED' : dispatchFailed ? 'GATEWAY_DISPATCH_FAILED' : (error?.status ? `HTTP_${error.status}` : 'GENERATION_JOB_FAILED'),
        status: error?.status || null,
        requestId,
        message: timedOut
          ? 'The server stopped waiting for this generation job. The upstream request may still finish or bill.'
          : canceled
            ? 'The queued or running job was canceled locally. If it already reached the upstream, the upstream may still finish or bill.'
            : dispatchFailed
              ? gatewayDispatchErrorMessage(error)
              : gatewayErrorMessage(error)
      }
    });
  } finally {
    clearTimeout(timer);
    activeJobControllers.delete(key);
  }
}

function enqueueGenerationJob(auth, job, runtime) {
  const queue = jobQueues.get(auth.userKey) || { running: 0, draining: false, items: [] };
  queue.items.push({ auth, jobId: job.id, runtime });
  jobQueues.set(auth.userKey, queue);
  setTimeout(() => drainGenerationQueue(auth.userKey), 0);
}

async function drainGenerationQueue(userKey) {
  const queue = jobQueues.get(userKey);
  if (!queue || queue.draining) return;
  queue.draining = true;
  while (queue.items.length && queue.running < JOB_CONCURRENCY) {
    const item = queue.items.shift();
    queue.running += 1;
    runGenerationJob(item.auth, item.jobId, item.runtime)
      .catch(() => {})
      .finally(() => {
        queue.running = Math.max(0, queue.running - 1);
        setTimeout(() => drainGenerationQueue(userKey), 0);
      });
  }
  queue.draining = false;
}

async function removeRecordAssets(auth, recordId) {
  await fs.rm(path.join(auth.userDir, 'assets', recordId), { recursive: true, force: true });
}

function parseRoute(req) {
  const url = new URL(req.url, 'http://localhost');
  const parts = url.pathname.split('/').filter(Boolean);
  return { url, parts };
}

async function serveAsset(req, res, auth, parts) {
  const recordId = cleanRecordId(parts[2]);
  const fileName = parts[4] || '';
  if (!/^[0-9]{1,3}\.(png|jpg|webp)$/.test(fileName)) {
    return sendJson(res, 404, { ok: false, error: 'ASSET_NOT_FOUND' });
  }

  const filePath = path.join(auth.userDir, 'assets', recordId, fileName);
  const relative = path.relative(path.join(auth.userDir, 'assets'), filePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return sendJson(res, 404, { ok: false, error: 'ASSET_NOT_FOUND' });
  }

  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat?.isFile()) return sendJson(res, 404, { ok: false, error: 'ASSET_NOT_FOUND' });

  const ext = path.extname(fileName).slice(1);
  const mime = ext === 'jpg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : 'image/png';
  res.writeHead(200, {
    'Content-Type': mime,
    'Content-Length': stat.size,
    'Cache-Control': 'private, max-age=3600'
  });
  createReadStream(filePath).pipe(res);
}

async function serveLibraryAsset(req, res, auth, parts) {
  const rawAssetPath = decodeURIComponent(parts.slice(2).join('/'));
  const segments = rawAssetPath.split('/').filter(Boolean);
  if (!segments.length || segments.some((segment) => segment === '..' || segment.includes('\0'))) {
    return sendJson(res, 404, { ok: false, error: 'ASSET_NOT_FOUND' });
  }

  const filePath = path.join(LIBRARY_ASSET_DIR, ...segments);
  const relative = path.relative(LIBRARY_ASSET_DIR, filePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return sendJson(res, 404, { ok: false, error: 'ASSET_NOT_FOUND' });
  }

  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat?.isFile()) return sendJson(res, 404, { ok: false, error: 'ASSET_NOT_FOUND' });

  const ext = path.extname(filePath).slice(1).toLowerCase();
  const mime = ext === 'jpg' || ext === 'jpeg'
    ? 'image/jpeg'
    : ext === 'webp'
      ? 'image/webp'
      : ext === 'svg'
        ? 'image/svg+xml'
        : 'image/png';
  res.writeHead(200, {
    'Content-Type': mime,
    'Content-Length': stat.size,
    'Cache-Control': 'private, max-age=300',
    'X-Robots-Tag': 'noindex, nofollow, noarchive'
  });
  createReadStream(filePath).pipe(res);
}

async function handler(req, res) {
  const corsAllowed = sendCors(req, res);
  if (req.method === 'OPTIONS') {
    res.writeHead(corsAllowed ? 204 : 403);
    res.end();
    return;
  }
  if (!corsAllowed) {
    return sendJson(res, 403, { ok: false, error: 'ORIGIN_NOT_ALLOWED' });
  }

  const { url, parts } = parseRoute(req);
  if (parts.join('/') === 'studio-api/health') {
    return sendJson(res, 200, {
      ok: true,
      service: 'ai-image-workbench-history',
      version: SERVICE_VERSION,
      startedAt: new Date(SERVICE_STARTED_AT).toISOString()
    });
  }

  if (parts[0] !== 'studio-api' || !['history', 'session', 'generation-jobs', 'library', 'library-assets', 'community-prompts', 'prompt-presets', 'video-inspirations', 'backup'].includes(parts[1])) {
    return sendJson(res, 404, { ok: false, error: 'NOT_FOUND' });
  }

  try {
    const auth = await authenticate(req);

    if (req.method === 'GET' && parts[0] === 'studio-api' && parts[1] === 'backup' && parts.length === 2) {
      const backup = await buildUserBackup(auth, 'manual');
      const stamp = backup.createdAt.replace(/[:.]/g, '-');
      return sendDownloadJson(res, `ai-image-workbench-backup-${stamp}.json`, backup);
    }

    if (req.method === 'POST' && parts[0] === 'studio-api' && parts[1] === 'backup' && parts[2] === 'restore' && parts.length === 3) {
      const body = await readJsonBody(req);
      const result = await restoreUserBackup(auth, body);
      return sendJson(res, 200, result);
    }

    if (req.method === 'GET' && parts[0] === 'studio-api' && parts[1] === 'session' && parts.length === 2) {
      const sessionId = text(url.searchParams.get('sessionId'), 120);
      let session = await readSession(auth, sessionId);
      if (sessionId && !session) {
        const legacySession = await readSession(auth);
        session = legacySession?.sessionId === sessionId ? legacySession : null;
      }
      return sendJson(res, 200, { ok: true, session });
    }

    if (req.method === 'POST' && parts[0] === 'studio-api' && parts[1] === 'session' && parts.length === 2) {
      const body = await readJsonBody(req);
      const requestedSessionId = text(url.searchParams.get('sessionId'), 120);
      const session = await sanitizeSession(auth, { ...body, sessionId: body?.sessionId || requestedSessionId });
      const sessionId = text(session.sessionId || requestedSessionId, 120);
      await writeSession(auth, session, sessionId);
      return sendJson(res, 200, { ok: true, session });
    }

    if (req.method === 'DELETE' && parts[0] === 'studio-api' && parts[1] === 'session' && parts.length === 2) {
      const sessionId = text(url.searchParams.get('sessionId'), 120);
      await fs.rm(sessionPathForId(auth, sessionId), { force: true });
      await fs.rm(path.join(auth.userDir, 'assets', sessionAssetId(sessionId)), { recursive: true, force: true });
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === 'GET' && parts[0] === 'studio-api' && parts[1] === 'generation-jobs' && parts.length === 2) {
      const sessionId = text(url.searchParams.get('sessionId'), 120);
      const limit = Math.max(1, Math.min(JOB_LIMIT, Number(url.searchParams.get('limit') || 40)));
      const jobs = await readJobs(auth);
      const filtered = sessionId ? jobs.filter((job) => job.sessionId === sessionId) : jobs;
      return sendJson(res, 200, { ok: true, jobs: filtered.slice(0, limit) });
    }

    if (req.method === 'POST' && parts[0] === 'studio-api' && parts[1] === 'generation-jobs' && parts.length === 2) {
      const body = await readJsonBody(req);
      const job = buildJobRecord(body);
      const runtime = buildJobRuntime(body);
      if (job.route === 'edits' && !runtime.images.length) {
        return sendJson(res, 400, { ok: false, error: 'REFERENCE_IMAGE_REQUIRED' });
      }
      if (job.fingerprint) {
        const jobs = await readJobs(auth);
        const existing = jobs.find((item) => (
          item.fingerprint === job.fingerprint
          && item.sessionId === job.sessionId
          && JOB_ACTIVE_STATUSES.has(item.status)
        ));
        if (existing) return sendJson(res, 202, { ok: true, job: existing, duplicate: true });
      }
      await upsertJob(auth, job);
      enqueueGenerationJob(auth, job, runtime);
      return sendJson(res, 202, { ok: true, job });
    }

    if (req.method === 'GET' && parts[0] === 'studio-api' && parts[1] === 'generation-jobs' && parts.length === 3) {
      const jobId = cleanJobId(parts[2]);
      const jobs = await readJobs(auth);
      const job = jobs.find((item) => item.id === jobId);
      if (!job) return sendJson(res, 404, { ok: false, error: 'GENERATION_JOB_NOT_FOUND' });
      return sendJson(res, 200, { ok: true, job });
    }

    if (req.method === 'DELETE' && parts[0] === 'studio-api' && parts[1] === 'generation-jobs' && parts.length === 3) {
      const jobId = cleanJobId(parts[2]);
      const jobs = await readJobs(auth);
      const currentJob = jobs.find((item) => item.id === jobId);
      if (!currentJob) return sendJson(res, 404, { ok: false, error: 'GENERATION_JOB_NOT_FOUND' });
      if (!JOB_ACTIVE_STATUSES.has(currentJob.status)) {
        return sendJson(res, 200, { ok: true, job: currentJob });
      }
      const key = jobRuntimeKey(auth, jobId);
      const controller = activeJobControllers.get(key);
      if (controller) controller.abort(new Error('JOB_CANCELED'));
      const queue = jobQueues.get(auth.userKey);
      if (queue?.items?.length) {
        queue.items = queue.items.filter((item) => item.jobId !== jobId);
      }
      const job = await updateJob(auth, jobId, {
        status: 'canceled',
        stage: 'canceled',
        completedAt: new Date().toISOString(),
        error: {
          code: 'JOB_CANCELED',
          message: 'The job was canceled locally.'
        }
      });
      return sendJson(res, 200, { ok: true, job });
    }

    if (req.method === 'GET' && parts[0] === 'studio-api' && parts[1] === 'library' && parts.length === 2) {
      const { payload } = await readLibrary(auth);
      return sendJson(res, 200, payload);
    }

    if (req.method === 'GET' && parts[0] === 'studio-api' && parts[1] === 'library' && parts.length === 3) {
      const id = cleanLibraryId(decodeURIComponent(parts[2]));
      const { rawCases } = await readLibrary(auth);
      const item = rawCases.find((caseItem) => String(caseItem.id) === id);
      if (!item) return sendJson(res, 404, { ok: false, error: 'LIBRARY_ITEM_NOT_FOUND' });
      return sendJson(res, 200, { ok: true, case: sanitizeLibraryDetail(item) });
    }

    if (req.method === 'GET' && parts[0] === 'studio-api' && parts[1] === 'community-prompts' && parts.length === 2) {
      const items = await readCommunityPrompts(auth);
      return sendJson(res, 200, { ok: true, items });
    }

    if (req.method === 'POST' && parts[0] === 'studio-api' && parts[1] === 'community-prompts' && parts.length === 2) {
      const body = await readJsonBody(req);
      const prompt = text(body.prompt, 12000);
      if (!prompt) return sendJson(res, 400, { ok: false, error: 'PROMPT_REQUIRED' });
      const now = new Date().toISOString();
      const item = sanitizeCommunityPrompt({
        id: `share-${randomUUID()}`,
        title: body.title,
        prompt,
        promptPreview: body.promptPreview || prompt,
        category: body.category || 'Community Prompts',
        note: body.note,
        tags: body.tags,
        visibility: body.visibility,
        createdAt: now,
        updatedAt: now,
        sourceName: auth.user?.username || auth.user?.email || 'User shared'
      });
      const items = await readCommunityPrompts(auth);
      const nextItems = await writeCommunityPrompts(auth, [item, ...items.filter((entry) => entry.id !== item.id)]);
      return sendJson(res, 200, { ok: true, item: nextItems[0] });
    }

    if (req.method === 'POST' && parts[0] === 'studio-api' && parts[1] === 'community-prompts' && parts.length === 4 && parts[3] === 'reaction') {
      const id = cleanLibraryId(decodeURIComponent(parts[2]));
      const body = await readJsonBody(req);
      const action = text(body.action, 20);
      const items = await readCommunityPrompts(auth);
      const index = items.findIndex((item) => String(item.id) === id);
      if (index < 0) return sendJson(res, 404, { ok: false, error: 'COMMUNITY_PROMPT_NOT_FOUND' });
      const item = { ...items[index] };
      const reactions = { ...(item.reactions || {}) };
      if (action === 'up' || action === 'down') {
        const previous = item.userReaction;
        if (previous && reactions[previous] > 0) reactions[previous] -= 1;
        item.userReaction = previous === action ? '' : action;
        if (item.userReaction) reactions[item.userReaction] = Math.max(0, Number(reactions[item.userReaction] || 0)) + 1;
      } else if (action === 'copy') {
        item.copied = Math.max(0, Number(item.copied || 0)) + 1;
      } else if (action === 'share') {
        item.shared = Math.max(0, Number(item.shared || 0)) + 1;
      } else {
        return sendJson(res, 400, { ok: false, error: 'ACTION_NOT_SUPPORTED' });
      }
      item.reactions = reactions;
      item.updatedAt = new Date().toISOString();
      items[index] = item;
      await writeCommunityPrompts(auth, items);
      return sendJson(res, 200, { ok: true, item: sanitizeCommunityPrompt(item) });
    }

    if (req.method === 'GET' && parts[0] === 'studio-api' && parts[1] === 'prompt-presets' && parts.length === 3) {
      const id = cleanLibraryId(decodeURIComponent(parts[2]));
      const item = PROMPT_PRESETS.find((preset) => preset.id === id);
      if (!item) return sendJson(res, 404, { ok: false, error: 'PROMPT_PRESET_NOT_FOUND' });
      return sendJson(res, 200, { ok: true, preset: sanitizePromptPresetDetail(item) });
    }

    if (req.method === 'GET' && parts[0] === 'studio-api' && parts[1] === 'video-inspirations' && parts.length === 3) {
      const id = cleanLibraryId(decodeURIComponent(parts[2]));
      const item = VIDEO_INSPIRATIONS.find((inspiration) => inspiration.id === id);
      if (!item) return sendJson(res, 404, { ok: false, error: 'VIDEO_INSPIRATION_NOT_FOUND' });
      return sendJson(res, 200, { ok: true, inspiration: sanitizeVideoInspirationDetail(item) });
    }

    if (req.method === 'GET' && parts[0] === 'studio-api' && parts[1] === 'library-assets') {
      return serveLibraryAsset(req, res, auth, parts);
    }

    if (req.method === 'GET' && parts.length === 2) {
      const records = await readRecords(auth);
      const limit = Math.max(1, Math.min(HISTORY_LIMIT, Number(url.searchParams.get('limit') || 30)));
      const offset = Math.max(0, Number(url.searchParams.get('offset') || 0));
      const page = records.slice(offset, offset + limit);
      const nextOffset = offset + page.length < records.length ? offset + page.length : null;
      return sendJson(res, 200, { ok: true, records: page, total: records.length, nextOffset });
    }

    if (req.method === 'POST' && parts.length === 2) {
      const body = await readJsonBody(req);
      const record = await sanitizeRecord(auth, body);
      const records = await readRecords(auth);
      const nextRecords = [record, ...records.filter((item) => item.id !== record.id)].slice(0, HISTORY_LIMIT);
      await writeRecords(auth, nextRecords);
      return sendJson(res, 200, { ok: true, record });
    }

    if (req.method === 'DELETE' && parts.length === 2) {
      const records = await readRecords(auth);
      await Promise.all(records.map((record) => removeRecordAssets(auth, record.id)));
      await writeRecords(auth, []);
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === 'DELETE' && parts.length === 3) {
      const recordId = cleanRecordId(parts[2]);
      const records = await readRecords(auth);
      await removeRecordAssets(auth, recordId);
      await writeRecords(auth, records.filter((item) => item.id !== recordId));
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === 'GET' && parts.length === 5 && parts[3] === 'assets') {
      return serveAsset(req, res, auth, parts);
    }

    res.setHeader('Allow', 'GET, POST, DELETE, OPTIONS');
    return sendJson(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  } catch (error) {
    const status = error.status || 500;
    const message = status >= 500 ? 'STUDIO_HISTORY_FAILED' : error.message;
    if (status >= 500) {
      console.warn('Studio history service failed', {
        message: String(error?.message || 'unknown').slice(0, 240)
      });
    }
    return sendJson(res, status, { ok: false, error: message });
  }
}

const server = http.createServer((req, res) => {
  handler(req, res).catch((error) => {
    console.warn('Unhandled studio history error', {
      message: String(error?.message || 'unknown').slice(0, 240)
    });
    sendJson(res, 500, { ok: false, error: 'STUDIO_HISTORY_FAILED' });
  });
});

server.listen(PORT, HOST, () => {
  console.log(`image-sub2api-studio history service listening on http://${HOST}:${PORT}/studio-api`);
  console.log(`Data directory: ${DATA_DIR}`);
  console.log(`AI gateway base URL: ${AI_GATEWAY_BASE_URL}`);
});
