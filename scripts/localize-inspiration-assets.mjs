#!/usr/bin/env node
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const cwd = process.cwd();
const LIBRARY_DIR = path.resolve(process.env.STUDIO_LIBRARY_DIR || path.join(cwd, 'public'));
const ASSET_DIR = path.resolve(process.env.STUDIO_LIBRARY_ASSET_DIR || path.join(LIBRARY_DIR, 'image-library'));
const INSPIRATIONS_FILE = path.join(LIBRARY_DIR, 'inspirations.json');
const REPORT_FILE = path.resolve(process.env.STUDIO_LOCALIZE_REPORT || path.join(LIBRARY_DIR, 'localize-inspiration-assets-report.json'));
const DRY_RUN = /^(1|true|yes)$/i.test(process.env.STUDIO_LOCALIZE_DRY_RUN || '');
const FORCE = /^(1|true|yes)$/i.test(process.env.STUDIO_LOCALIZE_FORCE || '');
const MAKE_THUMBNAILS = !/^(0|false|no)$/i.test(process.env.STUDIO_LOCALIZE_THUMBNAILS || 'true');
const MARK_UNAVAILABLE = !/^(0|false|no)$/i.test(process.env.STUDIO_LOCALIZE_MARK_UNAVAILABLE || 'true');
const LIMIT = Math.max(0, Number(process.env.STUDIO_LOCALIZE_LIMIT || 0));
const CONCURRENCY = Math.max(1, Math.min(8, Number(process.env.STUDIO_LOCALIZE_CONCURRENCY || 3)));
const TIMEOUT_MS = Math.max(5000, Number(process.env.STUDIO_LOCALIZE_TIMEOUT_MS || 45000));

const IMAGE_FIELDS = ['image', 'image_url'];
const REMOTE_IMAGE_FIELDS = ['remoteImage', 'remoteImageUrl', 'originalImageUrl'];
const VALID_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const CONTENT_TYPE_EXTENSION = new Map([
  ['image/jpeg', '.jpg'],
  ['image/jpg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif']
]);

function isRemoteUrl(value) {
  return /^https?:\/\//i.test(String(value || '').trim());
}

function isLocalImagePath(value) {
  return /^(?:\.\/)?\/?images\//i.test(String(value || '').trim());
}

function normalizeLocalReference(relativePath) {
  return `images/${relativePath.replace(/\\/g, '/').replace(/^\/+/, '')}`;
}

function safeFileStem(item, index, url) {
  const raw = String(item.id || item.slug || item.title || '').trim();
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
  if (cleaned) return cleaned;
  return `inspiration-${index + 1}-${createHash('sha1').update(url).digest('hex').slice(0, 12)}`;
}

function extensionFromUrl(url) {
  try {
    const parsed = new URL(url);
    const ext = path.extname(parsed.pathname).toLowerCase();
    return VALID_EXTENSIONS.has(ext) ? (ext === '.jpeg' ? '.jpg' : ext) : '';
  } catch {
    return '';
  }
}

function extensionFromContentType(contentType) {
  const normalized = String(contentType || '').split(';')[0].trim().toLowerCase();
  return CONTENT_TYPE_EXTENSION.get(normalized) || '';
}

async function existsWithSize(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile() && stat.size > 0;
  } catch {
    return false;
  }
}

async function atomicWriteJson(filePath, value) {
  const tmpPath = `${filePath}.tmp-${Date.now()}`;
  await fs.writeFile(tmpPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await fs.rename(tmpPath, filePath);
}

async function downloadBuffer(url) {
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'user-agent': 'image-agent-studio-asset-localizer/1.0',
          accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif,*/*;q=0.8'
        }
      });
      if (!response.ok) {
        throw new Error(`HTTP_${response.status}`);
      }
      const contentType = response.headers.get('content-type') || '';
      if (!/^image\//i.test(contentType)) {
        throw new Error(`NOT_IMAGE:${contentType || 'unknown'}`);
      }
      return {
        buffer: Buffer.from(await response.arrayBuffer()),
        contentType
      };
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 700 * attempt));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

async function findImageMagickCommand() {
  const candidates = process.platform === 'win32'
    ? [['magick.exe'], ['convert.exe']]
    : [['magick'], ['convert']];
  for (const command of candidates) {
    const ok = await new Promise((resolve) => {
      const child = spawn(command[0], ['-version'], { stdio: 'ignore' });
      child.on('error', () => resolve(false));
      child.on('exit', (code) => resolve(code === 0));
    });
    if (ok) return command[0];
  }
  return '';
}

async function createThumbnail(command, sourcePath, targetPath) {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  const args = command.includes('magick')
    ? [sourcePath, '-auto-orient', '-thumbnail', '360x360>', '-quality', '78', targetPath]
    : [sourcePath, '-auto-orient', '-thumbnail', '360x360>', '-quality', '78', targetPath];
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'ignore' });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`thumbnail_exit_${code}`));
    });
  });
}

function pickRemoteImage(item) {
  for (const field of IMAGE_FIELDS) {
    if (isRemoteUrl(item[field])) return { field, url: String(item[field]).trim() };
  }
  for (const field of REMOTE_IMAGE_FIELDS) {
    if (isRemoteUrl(item[field])) return { field, url: String(item[field]).trim() };
  }
  return null;
}

async function runLimited(items, worker) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (cursor < items.length) {
      const current = cursor;
      cursor += 1;
      await worker(items[current], current);
    }
  });
  await Promise.all(workers);
}

async function main() {
  const raw = await fs.readFile(INSPIRATIONS_FILE, 'utf8');
  const data = JSON.parse(raw);
  const cases = Array.isArray(data.cases) ? data.cases : [];
  const remoteEntries = cases
    .map((item, index) => ({ item, index, remote: pickRemoteImage(item) }))
    .filter((entry) => entry.remote && !isLocalImagePath(entry.item.image));
  const selectedEntries = LIMIT ? remoteEntries.slice(0, LIMIT) : remoteEntries;
  const magick = MAKE_THUMBNAILS && !DRY_RUN ? await findImageMagickCommand() : '';

  const report = {
    ok: true,
    dryRun: DRY_RUN,
    libraryDir: LIBRARY_DIR,
    assetDir: ASSET_DIR,
    totalCases: cases.length,
    remoteCandidates: remoteEntries.length,
    selected: selectedEntries.length,
    downloaded: 0,
    reused: 0,
    localizedOnly: 0,
    thumbnails: 0,
    skipped: 0,
    failed: 0,
    markedUnavailable: 0,
    thumbnailCommand: magick || '',
    indexChanged: false,
    failures: []
  };

  if (DRY_RUN) {
    report.samples = selectedEntries.slice(0, 10).map(({ item, index, remote }) => ({
      index,
      id: item.id || null,
      title: item.title || '',
      field: remote.field,
      url: remote.url
    }));
    await atomicWriteJson(REPORT_FILE, report);
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  await fs.mkdir(path.join(ASSET_DIR, 'inspirations'), { recursive: true });
  await fs.mkdir(path.join(ASSET_DIR, 'thumbs', 'inspirations'), { recursive: true });

  let indexChanged = false;
  await runLimited(selectedEntries, async ({ item, index, remote }, ordinal) => {
    const stem = safeFileStem(item, index, remote.url);
    const preferredExt = extensionFromUrl(remote.url) || '.jpg';
    let ext = preferredExt;
    let relativePath = `inspirations/${stem}${ext}`;
    let absolutePath = path.join(ASSET_DIR, relativePath);

    try {
      let downloaded = false;
      if (!(await existsWithSize(absolutePath)) || FORCE) {
        const { buffer, contentType } = await downloadBuffer(remote.url);
        ext = extensionFromContentType(contentType) || preferredExt;
        relativePath = `inspirations/${stem}${ext}`;
        absolutePath = path.join(ASSET_DIR, relativePath);
        if (!(await existsWithSize(absolutePath)) || FORCE) {
          const tmpPath = `${absolutePath}.tmp-${Date.now()}-${process.pid}`;
          await fs.writeFile(tmpPath, buffer);
          await fs.rename(tmpPath, absolutePath);
          downloaded = true;
        }
      }

      const localImage = normalizeLocalReference(relativePath);
      if (!isRemoteUrl(item.remoteImageUrl || item.originalImageUrl || item.remoteImage)) {
        item.remoteImageUrl = remote.url;
        indexChanged = true;
      }
      if (item.image !== localImage) indexChanged = true;
      item.image = localImage;
      if (remote.field !== 'image') {
        delete item[remote.field];
        indexChanged = true;
      }
      report[downloaded ? 'downloaded' : 'reused'] += 1;

      if (magick && /\.(png|jpe?g|webp)$/i.test(absolutePath)) {
        const thumbRelative = `thumbs/inspirations/${stem}.webp`;
        const thumbAbsolute = path.join(ASSET_DIR, thumbRelative);
        if (!(await existsWithSize(thumbAbsolute)) || FORCE) {
          try {
            await createThumbnail(magick, absolutePath, thumbAbsolute);
            report.thumbnails += 1;
          } catch (error) {
            report.failures.push({ index, id: item.id || null, phase: 'thumbnail', error: error.message });
          }
        }
        if (await existsWithSize(thumbAbsolute)) {
          const localThumbnail = normalizeLocalReference(thumbRelative);
          if (item.thumbnail !== localThumbnail) indexChanged = true;
          item.thumbnail = localThumbnail;
        }
      } else {
        if (!item.thumbnail) {
          item.thumbnail = localImage;
          indexChanged = true;
        }
      }

      if ((ordinal + 1) % 50 === 0 || ordinal + 1 === selectedEntries.length) {
        console.log(`[localize] ${ordinal + 1}/${selectedEntries.length} downloaded=${report.downloaded} reused=${report.reused} failed=${report.failed}`);
      }
    } catch (error) {
      report.failed += 1;
      if (MARK_UNAVAILABLE) {
        item.remoteImageUrl = remote.url;
        item.imageUnavailable = true;
        item.imageUnavailableReason = error.message;
        item.imageUnavailableAt = new Date().toISOString();
        indexChanged = true;
        for (const field of [...IMAGE_FIELDS, 'thumbnail', 'thumb', 'thumbnail_url', 'thumbnailUrl']) {
          if (isRemoteUrl(item[field])) delete item[field];
        }
        report.markedUnavailable += 1;
      }
      report.failures.push({ index, id: item.id || null, url: remote.url, error: error.message });
    }
  });

  report.localizedOnly = selectedEntries.length - report.failed;
  report.ok = report.failed === 0;
  report.indexChanged = indexChanged;
  if (indexChanged) await atomicWriteJson(INSPIRATIONS_FILE, data);
  await atomicWriteJson(REPORT_FILE, report);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(`[localize] ${error.stack || error.message}`);
  process.exit(1);
});
