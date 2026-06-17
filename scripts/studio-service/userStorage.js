import fs from 'node:fs/promises';
import path from 'node:path';
import { atomicWriteJson } from './jsonFiles.js';
import { text } from './text.js';

export function createUserStorage({ historyLimit, sessionAssetPrefix, parseJsonText }) {
  async function ensureUserDirs(auth) {
    await fs.mkdir(path.join(auth.userDir, 'assets'), { recursive: true });
    await fs.mkdir(path.join(auth.userDir, 'jobs'), { recursive: true });
  }

  function recordsPath(auth) {
    return path.join(auth.userDir, 'records.json');
  }

  function sessionPath(auth) {
    return path.join(auth.userDir, 'session.json');
  }

  function sessionPathForId(auth, sessionId = '') {
    const safeId = text(sessionId, 120);
    return safeId ? path.join(auth.userDir, 'sessions', `${safeId}.json`) : sessionPath(auth);
  }

  function sessionsDir(auth) {
    return path.join(auth.userDir, 'sessions');
  }

  function sessionAssetId(sessionId = '') {
    const safeId = text(sessionId, 120);
    return safeId ? `${sessionAssetPrefix}${safeId}` : 'session-current';
  }

  function jobsPath(auth) {
    return path.join(auth.userDir, 'jobs.json');
  }

  function communityPromptsPath(auth) {
    return path.join(auth.userDir, 'community-prompts.json');
  }

  function backupsDir(auth) {
    return path.join(auth.userDir, 'backups');
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
    if (sessionId) await fs.mkdir(path.dirname(sessionPathForId(auth, sessionId)), { recursive: true });
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
      const session = await readSession(auth, sessionId);
      if (session) sessions.push(session);
    }
    return { legacy, sessions };
  }

  return {
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
