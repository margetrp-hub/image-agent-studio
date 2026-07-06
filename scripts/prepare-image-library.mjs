#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

const cwd = process.cwd();
const libraryDir = path.resolve(process.env.STUDIO_LIBRARY_DIR || path.join(cwd, 'data'));
const sourceDir = path.resolve(process.env.STUDIO_IMAGE_LIBRARY_SOURCE || path.join(libraryDir, 'images'));
const targetDir = path.resolve(process.env.STUDIO_LIBRARY_ASSET_DIR || path.join(libraryDir, 'image-library'));
const manifestPath = path.join(targetDir, 'image-library-manifest.json');
const imageExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg']);
const useHardlinks = !/^(0|false|no)$/i.test(process.env.STUDIO_IMAGE_LIBRARY_HARDLINKS || 'true');

async function exists(filePath) {
  try {
    return await fs.stat(filePath);
  } catch {
    return null;
  }
}

async function readManifestCache() {
  try {
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    const files = Array.isArray(manifest.files) ? manifest.files : [];
    return new Map(files
      .filter((item) => item?.path && item?.sha256)
      .map((item) => [item.path, item]));
  } catch {
    return new Map();
  }
}

async function hashFile(filePath) {
  return await new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function listImages(root) {
  const results = [];
  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch((error) => {
      if (error.code === 'ENOENT') return [];
      throw error;
    });
    for (const entry of entries) {
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(absolute);
        continue;
      }
      if (!entry.isFile() || !imageExtensions.has(path.extname(entry.name).toLowerCase())) continue;
      const stat = await fs.stat(absolute);
      results.push({
        absolute,
        relative: path.relative(root, absolute).replace(/\\/g, '/'),
        size: stat.size,
        mtimeMs: stat.mtimeMs
      });
    }
  }
  await walk(root);
  return results.sort((left, right) => left.relative.localeCompare(right.relative));
}

async function ensureFileFromSource(item, target, stats) {
  const current = await exists(target);
  if (current?.isFile() && current.size === item.size) {
    const currentHash = await hashFile(target);
    if (currentHash === item.sha256) {
      stats.reused += 1;
      return;
    }
  }
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(item.absolute, target);
  stats.copied += 1;
}

async function ensureHardlink(canonical, target, stats) {
  if (!useHardlinks) return false;
  const current = await exists(target);
  const canonicalStat = await exists(canonical);
  if (!canonicalStat?.isFile()) return false;
  if (current?.isFile() && current.dev === canonicalStat.dev && current.ino === canonicalStat.ino) {
    stats.reused += 1;
    return true;
  }
  await fs.mkdir(path.dirname(target), { recursive: true });
  const tmp = current?.isFile() ? `${target}.tmp-${Date.now()}-${process.pid}` : '';
  try {
    if (tmp) await fs.rename(target, tmp);
    await fs.link(canonical, target);
    if (tmp) await fs.rm(tmp, { force: true });
    stats.linked += 1;
    return true;
  } catch {
    if (tmp) {
      await fs.rm(target, { force: true }).catch(() => {});
      await fs.rename(tmp, target).catch(() => {});
    }
    return false;
  }
}

async function materializeImage(item, canonical, stats) {
  const target = path.join(targetDir, ...item.relative.split('/'));
  if (canonical && canonical.target !== target) {
    if (await ensureHardlink(canonical.target, target, stats)) return target;
  }
  await ensureFileFromSource(item, target, stats);
  return target;
}

async function main() {
  const sourceStat = await exists(sourceDir);
  if (!sourceStat?.isDirectory()) {
    throw new Error(`Source image library not found: ${sourceDir}`);
  }

  const cache = await readManifestCache();
  const images = await listImages(sourceDir);
  let hashed = 0;
  for (const item of images) {
    const cached = cache.get(item.relative);
    if (cached?.size === item.size && Math.round(cached.mtimeMs || 0) === Math.round(item.mtimeMs || 0)) {
      item.sha256 = cached.sha256;
      continue;
    }
    item.sha256 = await hashFile(item.absolute);
    hashed += 1;
  }

  const stats = {
    copied: 0,
    linked: 0,
    reused: 0
  };
  const byHash = new Map();
  for (const item of images) {
    const canonical = byHash.get(item.sha256);
    const target = await materializeImage(item, canonical, stats);
    if (!canonical) {
      byHash.set(item.sha256, {
        path: item.relative,
        target,
        size: item.size
      });
    }
  }

  const uniqueImages = byHash.size;
  const uniqueBytes = [...byHash.values()].reduce((sum, item) => sum + item.size, 0);
  const totalBytes = images.reduce((sum, item) => sum + item.size, 0);
  const manifest = {
    ok: true,
    sourceDir,
    targetDir,
    totalImages: images.length,
    uniqueImages,
    duplicateImages: Math.max(0, images.length - uniqueImages),
    copied: stats.copied,
    linked: stats.linked,
    reused: stats.reused,
    hashed,
    hardlinks: useHardlinks,
    totalBytes,
    uniqueBytes,
    logicalBytesSaved: Math.max(0, totalBytes - uniqueBytes),
    updatedAt: new Date().toISOString(),
    files: images.map((item) => {
      const canonical = byHash.get(item.sha256);
      return {
        path: item.relative,
        size: item.size,
        mtimeMs: Math.round(item.mtimeMs),
        sha256: item.sha256,
        duplicateOf: canonical?.path && canonical.path !== item.relative ? canonical.path : undefined
      };
    })
  };
  await fs.mkdir(targetDir, { recursive: true });
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    ok: true,
    sourceDir,
    targetDir,
    totalImages: manifest.totalImages,
    uniqueImages,
    duplicateImages: manifest.duplicateImages,
    copied: stats.copied,
    linked: stats.linked,
    reused: stats.reused,
    hashed,
    logicalBytesSaved: manifest.logicalBytesSaved,
    manifestPath
  }, null, 2));
}

main().catch((error) => {
  console.error(`[prepare-image-library] ${error.stack || error.message}`);
  process.exit(1);
});
