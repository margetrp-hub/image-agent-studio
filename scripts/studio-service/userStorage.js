import fs from 'node:fs/promises';
import path from 'node:path';
import { atomicWriteJson } from './jsonFiles.js';

const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{1,120}$/;

function invalidSessionId() {
  const error = new Error('SESSION_ID_INVALID');
  error.status = 400;
  return error;
}

function safeSessionId(value, { allowEmpty = true } = {}) {
  const normalized = String(value ?? '').trim();
  if (!normalized && allowEmpty) return '';
  if (!SESSION_ID_PATTERN.test(normalized)) throw invalidSessionId();
  return normalized;
}

function containedPath(baseDir, ...segments) {
  const base = path.resolve(baseDir);
  const resolved = path.resolve(base, ...segments);
  const relative = path.relative(base, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw invalidSessionId();
  return resolved;
}

export function createUserStorage({ historyLimit, sessionAssetPrefix, parseJsonText }) {
  async function secureMkdir(directory) {
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    try {
      await fs.chmod(directory, 0o700);
    } catch (error) {
      if (process.platform !== 'win32') throw error;
    }
  }

  async function ensureUserDirs(auth) {
    await secureMkdir(containedPath(auth.userDir));
    await secureMkdir(containedPath(auth.userDir, 'assets'));
    await secureMkdir(containedPath(auth.userDir, 'jobs'));
  }

  function recordsPath(auth) {
    return containedPath(auth.userDir, 'records.json');
  }

  function sessionPath(auth) {
    return containedPath(auth.userDir, 'session.json');
  }

  function sessionPathForId(auth, sessionId = '') {
    const safeId = safeSessionId(sessionId);
    return safeId ? containedPath(auth.userDir, 'sessions', `${safeId}.json`) : sessionPath(auth);
  }

  function sessionsDir(auth) {
    return containedPath(auth.userDir, 'sessions');
  }

  function sessionAssetId(sessionId = '') {
    const safeId = safeSessionId(sessionId);
    return safeId ? `${sessionAssetPrefix}${safeId}` : 'session-current';
  }

  function jobsPath(auth) {
    return containedPath(auth.userDir, 'jobs.json');
  }

  function communityPromptsPath(auth) {
    return containedPath(auth.userDir, 'community-prompts.json');
  }

  function backupsDir(auth) {
    return containedPath(auth.userDir, 'backups');
  }

  async function readRecords(auth) {
    try {
      const raw = await fs.readFile(recordsPath(auth), 'utf8');
      const parsed = parseJsonText(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  }

  async function writeRecords(auth, records) {
    await ensureUserDirs(auth);
    await atomicWriteJson(recordsPath(auth), records.slice(0, historyLimit));
  }

  async function readSession(auth, sessionId = '') {
    try {
      const raw = await fs.readFile(sessionPathForId(auth, sessionId), 'utf8');
      const parsed = parseJsonText(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  }

  async function writeSession(auth, session, sessionId = '') {
    await ensureUserDirs(auth);
    if (sessionId) await secureMkdir(path.dirname(sessionPathForId(auth, sessionId)));
    await atomicWriteJson(sessionPathForId(auth, sessionId), session);
  }

  async function readSessionSnapshot(auth) {
    const legacy = await readSession(auth);
    const sessions = [];
    const entries = await fs.readdir(sessionsDir(auth), { withFileTypes: true }).catch((error) => {
      if (error.code === 'ENOENT') return [];
      throw error;
    });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      const sessionId = entry.name.slice(0, -5);
      if (!SESSION_ID_PATTERN.test(sessionId)) continue;
      const session = await readSession(auth, sessionId);
      if (session) sessions.push(session);
    }
    return { legacy, sessions };
  }

  return {
    normalizeSessionId: safeSessionId,
    ensureUserDirs,
    recordsPath,
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
  };
}
